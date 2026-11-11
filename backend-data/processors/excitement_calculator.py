"""Tarea 3.2 — Nota de espectáculo (`excitement_score`, 1.0 - 10.0) de un partido terminado.

Usa el boxscore y el play-by-play de la CDN de la NBA (`live.nba.endpoints`, sin el rate
limit de stats.nba.com). Se suman hasta 9 puntos "en bruto" repartidos así y después
`nota = 1 + 9 * (bruto / 9) ** 0.75`:

    Margen final ajustado ............ 1.5    Alternancia (cambios de líder + empates) 1.3
    Igualdad en los últimos 5 min .... 2.5    Remontada del ganador ................... 0.8
    Empate/cambio de líder al final .. 1.0    Prórrogas ............................... 0.6
    Ritmo y acierto ofensivo ......... 0.6    Actuaciones individuales ................ 0.7

Prórrogas y actuaciones individuales solo pesan en el número: nunca salen en texto junto a la nota.
`full_facts`/`safe_facts` alimentaban los textos IA (aparcados en `ai_chronicler.py`).

Uso (desde backend-data/):
    python -m processors.excitement_calculator 0022600170 [0022600171 ...]
"""
import json
import re
import sys
import time

from nba_api.live.nba.endpoints import boxscore, playbyplay

from config import API_SLEEP_SECONDS

TIMEOUT = 60
REGULATION_PERIOD = 720  # 12 min
OT_PERIOD = 300          # 5 min
CLUTCH_WINDOW = 300      # últimos 5 minutos del 4º cuarto (y prórrogas completas)
CLUTCH_MARGIN = 5
MAX_RAW = 9.0
# Curva < 1: sin ella la mitad de la liga regular quedaba por debajo de 3 (calibrado con 2026-27)
SCORE_CURVE = 0.75


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


def close_share(timeline: list[tuple[float, int]], start: float, end: float) -> float:
    """Fracción del tiempo entre `start` y `end` con el marcador a `CLUTCH_MARGIN` o menos."""
    close = 0.0
    for (t0, margin), (t1, _) in zip(timeline, timeline[1:] + [(end, 0)]):
        lo, hi = max(t0, start), min(t1, end)
        if hi > lo and abs(margin) <= CLUTCH_MARGIN:
            close += hi - lo
    return close / (end - start) if end > start else 0.0


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
    clutch_start = regulation * REGULATION_PERIOD - CLUTCH_WINDOW
    swing = last_swing(timeline)
    swing_left = total - swing if swing is not None else None
    # Mayor desventaja que llegó a tener el ganador
    winner_deficit = max(0, max((-m if home_won else m) for _, m in timeline))
    lead_changes, times_tied = hs["leadChanges"], hs["timesTied"]

    points_per_48 = (home["score"] + away["score"]) * (regulation * REGULATION_PERIOD) / total
    ts_avg = (hs["trueShootingPercentage"] + as_["trueShootingPercentage"]) / 2
    pace = (possessions(hs) + possessions(as_)) / 2 * (regulation * REGULATION_PERIOD) / total

    lines_home, lines_away = player_lines(home), player_lines(away)
    all_lines = lines_home + lines_away
    top_points = max((line["pts"] for line in all_lines), default=0)
    individual = lerp(top_points, 30, 60, 0.7)
    individual += 0.15 * any(line["_triple_doble"] for line in all_lines)
    individual += 0.1 * any(line["_triples_anotados"] >= 10 for line in all_lines)

    breakdown = {
        "margen_final": lerp(15 - abs(final_margin), 0, 12, 1.5),
        "igualdad_final": close_share(timeline, clutch_start, total) * 2.5,
        "drama_ultimo_minuto": (
            0.0 if swing_left is None else
            1.0 if swing_left <= 30 else 0.8 if swing_left <= 60 else 0.5 if swing_left <= 120 else 0.25 if swing_left <= 180 else 0.0
        ),
        "alternancia": lerp(lead_changes + 0.5 * times_tied, 0, 18, 1.3),
        "remontada": lerp(winner_deficit, 8, 20, 0.8),
        "prorrogas": 0.0 if overtimes == 0 else 0.4 if overtimes == 1 else 0.6,
        "ataque": lerp(points_per_48, 210, 250, 0.35) + lerp(ts_avg, 0.56, 0.64, 0.25),
        "individual": min(0.7, individual),
    }
    raw = min(MAX_RAW, sum(breakdown.values()))
    score = round(1.0 + 9.0 * (raw / MAX_RAW) ** SCORE_CURVE, 1)

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
        "diferencia_a_falta_de_5_min": abs(margin_at(timeline, clutch_start)),
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


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    for i, game_id in enumerate(sys.argv[1:]):
        if i:
            time.sleep(API_SLEEP_SECONDS)
        result = analyze_game(game_id)
        print(f"\n{game_id} -> {result['excitement_score']}  {result['full_facts']['marcador_final']}")
        print("  desglose:", result["breakdown"])
        print("  safe_facts:", json.dumps(result["safe_facts"], ensure_ascii=False))


if __name__ == "__main__":
    main()
