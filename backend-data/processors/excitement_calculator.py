"""Tareas 3.2 y 6.5 — Nota de espectáculo (`excitement_score`, 1.0 - 10.0) de un partido terminado.

Se lee como una nota del colegio: un partido normal ronda el 6 (se decide a falta de unos 6 min), el
suspenso queda para los que se decidieron antes del último cuarto (~1 de cada 3) y del 8 en adelante
están los partidazos (~1 de cada 5). Calibrado con 1.527 partidos (2025-26 completa con playoffs y el
inicio de 2026-27) y con notas puestas a mano a partir del desarrollo de 112 de ellos.

Usa el boxscore y la jugada a jugada de la CDN de la NBA (`live.nba.endpoints`):

1. Probabilidad de victoria del local en cada segundo, con el marcador y el tiempo por jugar: el
   margen se mueve como un paseo aleatorio de `SIGMA` puntos por 48 min con `HOME_EDGE` de ventaja de
   campo, y `TIME_FLOOR` segundos de más porque con el reloj a cero aún quedan la última posesión y
   los tiros libres. Ajustado por máxima verosimilitud con esos 1.527 partidos.
2. Desglose "en bruto" (hasta `MAX_RAW` puntos):

    Vivo al último cuarto .. 4.4   el perdedor aún tenía opciones (10 %) al llegar al último cuarto
    Final en el aire ....... 1.0   y en los últimos minutos (la mitad si se decidió a falta de 2 min)
    Final de infarto ....... 1.6   vuelcos de la probabilidad en los últimos 5 min del tiempo reglamentario
    Igualdad ............... 0.8   incertidumbre media, que pesa más cuanto más avanza el partido
    Remontada .............. 1.4   el mayor hoyo del que salió cualquiera de los dos para empatar o adelantarse
    Ataque ................. 0.5   puntos por 48 min y acierto (TS%)
    Individual ............. 4.0   +1 por cada 10 puntos del máximo anotador por encima de 40; triple-doble, 10 triples

3. `nota = 1 + 9 * (bruto / MAX_RAW) ** SCORE_CURVE` (casi lineal).

Sin plus por prórroga: con él (y con los vuelcos de la prórroga), 9 de cada 10 notas de 9+ eran
prórrogas y la nota la delataba. La prórroga ya puntúa por cómo se llega a ella y por cuándo se decide.
Las actuaciones individuales solo pesan en el número: nunca salen en texto junto a la nota.
`full_facts`/`safe_facts` alimentaban los textos IA (aparcados en `ai_chronicler.py`).

Uso (desde backend-data/):
    python -m processors.excitement_calculator 0022600170 [0022600171 ...]   # nota y desglose (destripa el marcador)
    python -m processors.excitement_calculator --rescore [--dry-run]          # recalcula las notas guardadas
"""
import argparse
import json
import math
import re
import sys
import time

from nba_api.live.nba.endpoints import boxscore, playbyplay

from config import API_SLEEP_SECONDS

TIMEOUT = 60
REGULATION_PERIOD = 720  # 12 min
OT_PERIOD = 300          # 5 min
FULL_GAME = 4 * REGULATION_PERIOD

# Probabilidad de victoria
SIGMA = 18.2        # desviación típica del margen en 48 min (incluye la diferencia de nivel entre equipos)
HOME_EDGE = 2.5     # ventaja de campo en 48 min (también en pista neutral: ahí cambia la nota menos de 0.1)
TIME_FLOOR = 15.0   # s que se suman al tiempo por jugar
ALIVE_CHANCE = 0.10  # el partido sigue vivo mientras el perdedor tenga al menos esta probabilidad
LATE_WINDOW = 300   # el final de infarto se mide en los últimos 5 min del tiempo reglamentario

# Desglose (puntos en bruto) y tramos de cada rasgo (0 en el primer valor, el peso entero en el segundo).
# "Vivo" y "final en el aire" dependen de cuántos segundos antes del final se decidió: el peso entero si fue
# bastante después de `*_HALF`, la mitad justo en ella y casi nada si fue mucho antes.
W_ALIVE, ALIVE_HALF, ALIVE_STEEPNESS = 4.4, 840.0, 5.0   # 14 min antes del final (2 min antes del último cuarto)
W_FINAL, FINAL_HALF, FINAL_STEEPNESS = 1.0, 120.0, 2.0   # 2 min antes del final
W_LATE, LATE_RANGE = 1.6, (0.2, 2.5)            # suma de vuelcos de la probabilidad
W_TENSION, TENSION_RANGE = 0.8, (0.1, 0.85)     # incertidumbre media ponderada
W_COMEBACK, COMEBACK_RANGE = 1.4, (0.7, 4.0)    # log(0.5 / p): 0.7 = salir de un 25 %, 4.0 = de menos de un 1 %
W_PACE, PACE_RANGE = 0.3, (210, 250)            # puntos de los dos equipos por 48 min
W_SHOOTING, SHOOTING_RANGE = 0.2, (0.56, 0.64)  # TS% medio
W_INDIVIDUAL, POINTS_RANGE = 4.0, (40, 80)      # máximo anotador: +1 por cada 10 puntos por encima de 40
FEAT_BONUS = 0.15                               # triple-doble o 10 triples
MAX_RAW = 10.0
SCORE_CURVE = 0.9


def clock_seconds(iso: str | None) -> float:
    """'PT04M12.50S' -> 252.5"""
    match = re.match(r"PT(\d+)M([\d.]+)S", iso or "")
    return int(match[1]) * 60 + float(match[2]) if match else 0.0


def period_length(period: int, regulation: int) -> int:
    return REGULATION_PERIOD if period <= regulation else OT_PERIOD


def elapsed_seconds(period: int, clock: str, regulation: int) -> float:
    before = sum(period_length(p, regulation) for p in range(1, period))
    return before + period_length(period, regulation) - clock_seconds(clock)


def lerp(value: float, low: float, high: float, weight: float) -> float:
    """0 en `low`, `weight` en `high`, lineal entre medias y acotado."""
    if high == low:
        return weight if value >= high else 0.0
    return max(0.0, min(1.0, (value - low) / (high - low))) * weight


def margin_timeline(actions: list[dict], regulation: int) -> list[tuple[float, int]]:
    """[(segundo de partido, local - visitante)] tras cada cambio de marcador."""
    # Orden por tiempo de partido, no por llegada: la NBA añade al final jugadas corregidas de cuartos anteriores
    scored = sorted(
        ((elapsed_seconds(a["period"], a["clock"], regulation), a["orderNumber"], a) for a in actions
         if a.get("scoreHome") not in (None, "") and a.get("scoreAway") not in (None, "")),
        key=lambda item: item[:2],
    )
    timeline, last = [(0.0, 0)], 0
    for t, _, a in scored:
        margin = int(a["scoreHome"]) - int(a["scoreAway"])
        if margin != last:
            timeline.append((t, margin))
            last = margin
    return timeline


def last_swing(timeline: list[tuple[float, int]]) -> float | None:
    """Segundo del último empate o cambio de líder (None si nunca hubo)."""
    last_time, last_sign = None, 0
    for (t, margin), prev in zip(timeline[1:], timeline):
        sign = (margin > 0) - (margin < 0)
        if (sign == 0 and prev[1] != 0) or (sign != 0 and last_sign not in (0, sign)):
            last_time = t
        if sign:
            last_sign = sign
    return last_time


def margin_at(timeline: list[tuple[float, int]], t: float) -> int:
    return [m for time_, m in timeline if time_ <= t][-1]


def seconds_left(t: float, regulation: int) -> float:
    """Lo que queda del reglamento o de la prórroga en curso en el segundo `t` (en el límite, del periodo que acaba)."""
    end = regulation * REGULATION_PERIOD
    return end - t if t <= end else (end - t) % OT_PERIOD


def win_probability(margin: float, left: float) -> float:
    """Probabilidad de que gane el local yendo `margin` arriba con `left` segundos por jugar (empate al final = 50 %)."""
    spread = SIGMA * math.sqrt((left + TIME_FLOOR) / FULL_GAME)
    return 0.5 * (1 + math.erf((margin + HOME_EDGE * left / FULL_GAME) / (spread * math.sqrt(2))))


def probability_path(timeline: list[tuple[float, int]], regulation: int, total: float, final_margin: int) -> list[tuple[float, int, float]]:
    """[(segundo, margen, probabilidad del local)] en cada segundo y justo antes y después de cada canasta; al final, 1 o 0."""
    knots, margin, i = [], timeline[0][1], 1
    for second in range(int(total) + 1):
        while i < len(timeline) and timeline[i][0] <= second:
            t, new = timeline[i]
            if t < total:
                knots += [(t, margin), (t, new)]
            margin, i = new, i + 1
        if second < total:
            knots.append((float(second), margin))
    path = [(t, m, win_probability(m, seconds_left(t, regulation))) for t, m in knots]
    path.append((float(total), final_margin, 1.0 if final_margin > 0 else 0.0))
    return path


def deepest_comeback(path: list[tuple[float, int, float]], side: int) -> float:
    """log(0.5 / p) del peor momento del que salió un equipo (1 local, -1 visitante) para empatar o ponerse por delante."""
    best, low = 0.0, 0.5
    for _, margin, p in path:
        p = p if side > 0 else 1 - p
        low = min(low, p)
        if side * margin >= 0:
            best = max(best, math.log(0.5 / max(low, 1e-4)))
    return best


def story(timeline: list[tuple[float, int]], regulation: int, overtimes: int, final_margin: int) -> dict:
    """Cómo se vivió el partido, a partir de la probabilidad de victoria en cada momento."""
    end = regulation * REGULATION_PERIOD
    total = end + overtimes * OT_PERIOD
    path = probability_path(timeline, regulation, total, final_margin)
    loser = [(t, 1 - p if final_margin > 0 else p) for t, _, p in path[:-1]]
    tension = weight = 0.0
    for (t0, _, p), (t1, _, _) in zip(path, path[1:]):  # 4p(1-p): 1 con un 50 %, 0 decidido
        w = min(1.0, t0 / end) ** 2 * (t1 - t0)
        tension += w * 4 * p * (1 - p)
        weight += w
    return {
        "decided_left": total - max((t for t, p in loser if p >= ALIVE_CHANCE), default=0.0),
        # Solo el final del tiempo reglamentario: contar también la prórroga dejaba casi todos los 9+ para
        # partidos con prórroga, y la nota no puede delatarla (Nivel 2)
        "late_swings": sum(abs(b[2] - a[2]) for a, b in zip(path, path[1:]) if end - LATE_WINDOW <= a[0] < end),
        "tension": tension / weight,
        "comeback": max(deepest_comeback(path, 1), deepest_comeback(path, -1)),
    }


def score_game(s: dict, show: dict) -> tuple[float, dict[str, float]]:
    """Nota 1.0-10.0 y desglose a partir de `story()` y de los datos de espectáculo (`show`)."""
    individual = lerp(show["top_points"], *POINTS_RANGE, W_INDIVIDUAL)
    individual += FEAT_BONUS * show["triple_double"] + FEAT_BONUS * show["ten_threes"]
    breakdown = {
        "vivo_ultimo_cuarto": W_ALIVE / (1 + (s["decided_left"] / ALIVE_HALF) ** ALIVE_STEEPNESS),
        "final_en_el_aire": W_FINAL / (1 + (s["decided_left"] / FINAL_HALF) ** FINAL_STEEPNESS),
        "final_de_infarto": lerp(s["late_swings"], *LATE_RANGE, W_LATE),
        "igualdad": lerp(s["tension"], *TENSION_RANGE, W_TENSION),
        "remontada": lerp(s["comeback"], *COMEBACK_RANGE, W_COMEBACK),
        "ataque": lerp(show["points_per_48"], *PACE_RANGE, W_PACE) + lerp(show["true_shooting"], *SHOOTING_RANGE, W_SHOOTING),
        "individual": min(W_INDIVIDUAL, individual),
    }
    raw = min(MAX_RAW, sum(breakdown.values()))
    return round(1.0 + 9.0 * (raw / MAX_RAW) ** SCORE_CURVE, 1), breakdown


def player_lines(team: dict) -> list[dict]:
    lines = []
    for p in team["players"]:
        s = p["statistics"]
        if p.get("played") != "1":
            continue
        lines.append({
            "nombre": p["name"],
            "pts": s["points"], "reb": s["reboundsTotal"], "ast": s["assists"],
            "tc": f"{s['fieldGoalsMade']}/{s['fieldGoalsAttempted']}",
            "triples": f"{s['threePointersMade']}/{s['threePointersAttempted']}",
            "robos": s["steals"], "tapones": s["blocks"], "masmenos": s["plusMinusPoints"],
            "min": round(clock_seconds(s["minutes"]) / 60),
            "_triple_doble": sum(s[k] >= 10 for k in ("points", "reboundsTotal", "assists", "steals", "blocks")) >= 3,
            "_triples_anotados": s["threePointersMade"],
        })
    return sorted(lines, key=lambda line: line["pts"], reverse=True)


def possessions(stats: dict) -> float:
    return stats["fieldGoalsAttempted"] + 0.44 * stats["freeThrowsAttempted"] - stats["reboundsOffensive"] + stats["turnovers"]


def team_summary(team: dict) -> dict:
    s = team["statistics"]
    return {
        "equipo": f"{team['teamCity']} {team['teamName']}",
        "puntos": team["score"],
        "parciales": [p["score"] for p in team["periods"]],
        "tc_pct": round(s["fieldGoalsPercentage"] * 100, 1),
        "triples": f"{s['threePointersMade']}/{s['threePointersAttempted']}",
        "tl": f"{s['freeThrowsMade']}/{s['freeThrowsAttempted']}",
        "rebotes": s["reboundsTotal"], "rebotes_ofensivos": s["reboundsOffensive"],
        "asistencias": s["assists"], "perdidas": s["turnovers"], "robos": s["steals"], "tapones": s["blocks"],
        "puntos_pintura": s["pointsInThePaint"], "puntos_contraataque": s["pointsFastBreak"],
        "puntos_segunda_oportunidad": s["pointsSecondChance"], "puntos_tras_perdida": s["pointsFromTurnovers"],
        "puntos_banquillo": s["benchPoints"], "mayor_ventaja": s["biggestLead"], "mayor_parcial": s["biggestScoringRun"],
    }


def public_line(line: dict) -> dict:
    return {k: v for k, v in line.items() if not k.startswith("_")}


def bucket(value: float, levels: list[tuple[float, str]], default: str) -> str:
    """Primera etiqueta cuyo umbral se alcanza (umbrales de mayor a menor)."""
    return next((label for threshold, label in levels if value >= threshold), default)


def fetch_game(game_id: str) -> tuple[dict, list[dict]]:
    box = boxscore.BoxScore(game_id, timeout=TIMEOUT).get_dict()["game"]
    time.sleep(API_SLEEP_SECONDS)
    actions = playbyplay.PlayByPlay(game_id, timeout=TIMEOUT).get_dict()["game"]["actions"]
    return box, actions


def analyze_game(game_id: str) -> dict:
    """Nota + desglose + datos para la IA (`full_facts` con spoilers, `safe_facts` sin ellos)."""
    box, actions = fetch_game(game_id)
    if box["gameStatus"] != 3:
        raise ValueError(f"El partido {game_id} aún no ha terminado (gameStatus={box['gameStatus']})")
    return compute(box, actions)


def compute(box: dict, actions: list[dict]) -> dict:
    home, away = box["homeTeam"], box["awayTeam"]
    hs, as_ = home["statistics"], away["statistics"]
    regulation = box.get("regulationPeriods") or 4
    overtimes = max(0, box["period"] - regulation)
    total = regulation * REGULATION_PERIOD + overtimes * OT_PERIOD

    timeline = margin_timeline(actions, regulation)
    final_margin = home["score"] - away["score"]
    home_won = final_margin > 0
    swing = last_swing(timeline)
    swing_left = total - swing if swing is not None else None
    # Mayor desventaja que llegó a tener el ganador
    winner_deficit = max(0, max((-m if home_won else m) for _, m in timeline))
    lead_changes, times_tied = hs["leadChanges"], hs["timesTied"]

    ts_avg = (hs["trueShootingPercentage"] + as_["trueShootingPercentage"]) / 2
    pace = (possessions(hs) + possessions(as_)) / 2 * (regulation * REGULATION_PERIOD) / total
    lines_home, lines_away = player_lines(home), player_lines(away)
    all_lines = lines_home + lines_away
    show = {
        "points_per_48": (home["score"] + away["score"]) * (regulation * REGULATION_PERIOD) / total,
        "true_shooting": ts_avg,
        "top_points": max((line["pts"] for line in all_lines), default=0),
        "triple_double": any(line["_triple_doble"] for line in all_lines),
        "ten_threes": any(line["_triples_anotados"] >= 10 for line in all_lines),
    }
    score, breakdown = score_game(story(timeline, regulation, overtimes, final_margin), show)

    winner, loser = (home, away) if home_won else (away, home)
    full_facts = {
        "local": team_summary(home),
        "visitante": team_summary(away),
        "ganador": f"{winner['teamCity']} {winner['teamName']}",
        "marcador_final": f"{home['teamTricode']} {home['score']} - {away['score']} {away['teamTricode']}",
        "prorrogas": overtimes,
        "cambios_de_lider": lead_changes,
        "empates": times_tied,
        "mayor_desventaja_remontada_por_el_ganador": winner_deficit,
        "diferencia_a_falta_de_5_min": abs(margin_at(timeline, regulation * REGULATION_PERIOD - 300)),
        "segundos_restantes_ultimo_empate_o_cambio_de_lider": round(swing_left) if swing_left is not None else None,
        "jugadores_local": [public_line(line) for line in lines_home[:5]],
        "jugadores_visitante": [public_line(line) for line in lines_away[:5]],
        "perdedor": f"{loser['teamCity']} {loser['teamName']}",
    }

    # Lista blanca para la pista Nivel 2: ni marcador, ni ganador, ni prórrogas, ni cifras
    # individuales, ni nada sobre el final. Si la IA no recibe el dato, no puede filtrarlo.
    combined_3pa = hs["threePointersAttempted"] + as_["threePointersAttempted"]
    combined_paint = hs["pointsInThePaint"] + as_["pointsInThePaint"]
    combined_fast = hs["pointsFastBreak"] + as_["pointsFastBreak"]
    styles = [label for cond, label in [
        (combined_3pa >= 80, "lluvia de triples"),
        (combined_paint >= 110, "batalla en la pintura"),
        (combined_fast >= 35, "muchas transiciones y contraataques"),
        (hs["foulsPersonal"] + as_["foulsPersonal"] >= 52, "partido muy físico, con muchas faltas"),
    ] if cond]
    safe_facts = {
        "local": f"{home['teamCity']} {home['teamName']}",
        "visitante": f"{away['teamCity']} {away['teamName']}",
        "nota_espectaculo": score,
        "ritmo": bucket(pace, [(104, "muy alto"), (100, "alto"), (96, "medio")], "lento"),
        "acierto_ofensivo": bucket(ts_avg, [(0.62, "muy alto"), (0.58, "alto"), (0.54, "normal")], "bajo"),
        "alternancia_en_el_marcador": bucket(lead_changes + 0.5 * times_tied, [(15, "muy alta"), (8, "alta"), (3, "media")], "baja"),
        "estilo": styles,
        "jugadores_a_seguir": [lines[0]["nombre"] for lines in (lines_home, lines_away) if lines],
    }

    return {
        "excitement_score": score,
        "breakdown": {k: round(v, 2) for k, v in breakdown.items()},
        "home_score": home["score"],
        "away_score": away["score"],
        "quarters_score": {"home": [p["score"] for p in home["periods"]], "away": [p["score"] for p in away["periods"]]},
        "full_facts": full_facts,
        "safe_facts": safe_facts,
    }


def rescore(dry_run: bool) -> None:
    """Recalcula la nota de todos los partidos terminados y enseña la tabla antes/después (sin marcadores)."""
    from db import connect, select_all

    client = connect()
    teams = {t["id"]: t["abbreviation"] for t in select_all(client, "teams", "id,abbreviation")}
    games = select_all(client, "games", "id,game_datetime_utc,home_team_id,away_team_id,excitement_score",
                       lambda q: q.eq("status", "Final").eq("is_processed", True))
    games.sort(key=lambda g: g["game_datetime_utc"])
    before, after, failed = [], [], []
    for i, game in enumerate(games):
        if i:
            time.sleep(API_SLEEP_SECONDS)
        try:
            box, actions = fetch_game(game["id"])
            new = compute(box, actions)["excitement_score"]
        except Exception as exc:  # p. ej. la CDN no responde: se queda la nota que tenía
            print(f"  ! {game['id']}: {exc!r}")
            failed.append(game["id"])
            continue
        old = game["excitement_score"]
        matchup = f"{teams.get(game['away_team_id'], '?')} @ {teams.get(game['home_team_id'], '?')}"
        print(f"{game['game_datetime_utc'][:10]}  {game['id']}  {matchup:11s}  {old if old is not None else '-':>4} -> {new:4.1f}")
        if old is not None:
            before.append(old)
        after.append(new)
        if not dry_run and new != old:
            client.table("games").update({"excitement_score": new}).eq("id", game["id"]).execute()
    for name, notes in (("Antes", before), ("Después", after)):
        if notes:
            notes = sorted(notes)
            n = len(notes)
            print(f"{name}: {n} partidos · mediana {notes[n // 2]} · por debajo de 5: {sum(x < 5 for x in notes) / n:.0%}"
                  f" · 8 o más: {sum(x >= 8 for x in notes) / n:.0%} · 9 o más: {sum(x >= 9 for x in notes) / n:.0%}")
    if failed:
        print(f"Sin recalcular ({len(failed)}): {', '.join(failed)}")
    if dry_run:
        print("(--dry-run: no se ha guardado nada)")


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("game_ids", nargs="*", help="partidos a analizar (enseña el marcador)")
    parser.add_argument("--rescore", action="store_true", help="recalcula la nota de todos los partidos terminados")
    parser.add_argument("--dry-run", action="store_true", help="con --rescore, no escribe en Supabase")
    args = parser.parse_args()
    if args.rescore:
        rescore(args.dry_run)
        return
    if not args.game_ids:
        parser.error("indica uno o más partidos o --rescore")
    for i, game_id in enumerate(args.game_ids):
        if i:
            time.sleep(API_SLEEP_SECONDS)
        result = analyze_game(game_id)
        print(f"\n{game_id} -> {result['excitement_score']}  {result['full_facts']['marcador_final']}")
        print("  desglose:", result["breakdown"])
        print("  safe_facts:", json.dumps(result["safe_facts"], ensure_ascii=False))


if __name__ == "__main__":
    main()
