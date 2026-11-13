"""Tarea 5.2b — Del boxscore de la CDN a filas de `player_game_stats` y `team_game_stats`. Funciones puras.

Un boxscore incoherente (los puntos de los jugadores no suman el marcador, minutos imposibles...) no se
guarda: se lanza `BoxScoreError` y el partido se reintenta más tarde. Mejor un partido de menos que
estadísticas falsas.
"""
import re

# Prefijo del gameId -> tipo de partido. Solo 002 y 004 cuentan para las estadísticas oficiales
# (la NBA no suma ni el play-in ni la final de la Copa en la temporada regular ni en los playoffs).
REGULAR_SEASON, PLAYOFFS, PLAY_IN, CUP_FINAL = "002", "004", "005", "006"
SEASON_TYPES = {REGULAR_SEASON: "Regular Season", PLAYOFFS: "Playoffs"}
STAT_GAME_TYPES = (REGULAR_SEASON, PLAYOFFS)

REGULATION_SECONDS = 48 * 60
OVERTIME_SECONDS = 5 * 60


class BoxScoreError(ValueError):
    """El boxscore no está completo o no cuadra: no se guarda."""


def season_of_game(game_id: str) -> str:
    """'0022600222' -> '2026-27' (los caracteres 4-5 del gameId son el año en que empieza la temporada)."""
    start = 2000 + int(game_id[3:5])
    return f"{start}-{(start + 1) % 100:02d}"


def game_type_of(game_id: str) -> str:
    return game_id[:3]


def clock_seconds(iso: str | None) -> float:
    """'PT34M12.00S' -> 2052.0"""
    match = re.fullmatch(r"PT(\d+)M([\d.]+)S", iso or "")
    if not match:
        raise BoxScoreError(f"Minutos con formato desconocido: {iso!r}")
    return int(match[1]) * 60 + float(match[2])


def game_date_et(box: dict) -> str:
    """Fecha del partido en la costa Este, la que usa la NBA ('20261111/LALMIL' -> '2026-11-11')."""
    code = box.get("gameCode") or ""
    if re.match(r"\d{8}/", code):
        return f"{code[:4]}-{code[4:6]}-{code[6:8]}"
    et = box.get("gameEt") or ""
    if re.match(r"\d{4}-\d{2}-\d{2}", et):
        return et[:10]
    raise BoxScoreError(f"Partido {box.get('gameId')} sin fecha")


def _player_row(game_id: str, p: dict, team_id: int, opponent_id: int, common: dict) -> dict:
    s = p["statistics"]
    return {
        "id": f"{game_id}_{p['personId']}",
        "game_id": game_id,
        "player_id": int(p["personId"]),
        "team_id": team_id,
        "opponent_id": opponent_id,
        **common,
        "starter": p.get("starter") == "1",
        "seconds": clock_seconds(s["minutes"]),
        "pts": int(s["points"]),
        "fgm": int(s["fieldGoalsMade"]),
        "fga": int(s["fieldGoalsAttempted"]),
        "fg3m": int(s["threePointersMade"]),
        "fg3a": int(s["threePointersAttempted"]),
        "ftm": int(s["freeThrowsMade"]),
        "fta": int(s["freeThrowsAttempted"]),
        "oreb": int(s["reboundsOffensive"]),
        "dreb": int(s["reboundsDefensive"]),
        "reb": int(s["reboundsTotal"]),
        "ast": int(s["assists"]),
        "stl": int(s["steals"]),
        "blk": int(s["blocks"]),
        "tov": int(s["turnovers"]),
        "pf": int(s["foulsPersonal"]),
        "plus_minus": int(s["plusMinusPoints"]),
        "on_court_pts": int(s["plus"]),
        "on_court_opp_pts": int(s["minus"]),
    }


def player_name(p: dict) -> str:
    return (p.get("name") or f"{p.get('firstName', '')} {p.get('familyName', '')}").strip()


# ---------- Cifras oficiales corregidas (página del partido en nba.com) ----------

OFFICIAL_COUNTS = ("points", "fieldGoalsMade", "fieldGoalsAttempted", "threePointersMade", "threePointersAttempted",
                   "freeThrowsMade", "freeThrowsAttempted", "reboundsOffensive", "reboundsDefensive", "reboundsTotal",
                   "assists", "steals", "blocks", "turnovers", "foulsPersonal")
# Totales de equipo que se recalculan sumando a sus jugadores oficiales
TEAM_SUMS = {k: k for k in OFFICIAL_COUNTS} | {"reboundsPersonal": "reboundsTotal"}


def official_minutes(value) -> str | None:
    """'36:48' o 'PT36M48.00S' (nba.com usa los dos) -> 'PT36M48.00S'; vacío (no jugó) -> None."""
    text = str(value or "").strip()
    match = re.fullmatch(r"(\d+):(\d{2})", text)
    if match:
        return f"PT{int(match[1]):02d}M{int(match[2]):02d}.00S"
    return text if re.fullmatch(r"PT\d+M[\d.]+S", text) else None


def apply_official(box: dict, official: dict) -> dict:
    """El boxscore de la CDN con las cifras oficiales (ya corregidas) de nba.com: quién jugó, minutos y
    estadísticas. De la CDN se conserva lo que nba.com no da: puntos a favor y en contra con cada jugador en
    pista, pérdidas de equipo y periodos. Devuelve una copia; el resultado pasa por las mismas comprobaciones
    de `rows_from_box`."""
    import copy

    if official.get("gameId") != box.get("gameId"):
        raise BoxScoreError(f"Boxscore oficial de otro partido ({official.get('gameId')} != {box.get('gameId')})")
    merged = copy.deepcopy(box)
    for side in ("homeTeam", "awayTeam"):
        team, off_team = merged[side], official[side]
        if int(off_team["teamId"]) != int(team["teamId"]):
            raise BoxScoreError(f"Partido {box['gameId']}: equipos distintos en la CDN y en nba.com")
        # Minutos de equipo oficiales: la CDN a veces los trae mal (un partido de 2025-26 con 231 de 240)
        official_team_minutes = official_minutes((off_team.get("statistics") or {}).get("minutes"))
        if official_team_minutes:
            team["statistics"]["minutes"] = official_team_minutes
        team_seconds = clock_seconds(team["statistics"]["minutes"])
        by_id = {int(p["personId"]): p for p in team.get("players") or []}
        played = set()
        for off in off_team.get("players") or []:
            minutes = official_minutes(off["statistics"].get("minutes"))
            pid = int(off["personId"])
            p = by_id.get(pid)
            if minutes is None:
                continue
            # Algunas páginas dan 'PT00M00.00S' a los que no jugaron: 0 s solo es "jugó" si la CDN también lo dice
            if clock_seconds(minutes) == 0 and (p is None or p.get("played") != "1"):
                continue
            if p is None:  # una corrección añade a alguien que la CDN no tenía
                p = {"personId": pid, "name": f"{off.get('firstName', '')} {off.get('familyName', '')}".strip(),
                     "starter": "1" if off.get("position") else "0", "statistics": {}}
                team.setdefault("players", []).append(p)
                by_id[pid] = p
            s = p["statistics"]
            plus, minus = s.get("plus"), s.get("minus")
            for key in OFFICIAL_COUNTS:
                s[key] = int(off["statistics"][key])
            # nba.com da los minutos al segundo; la CDN, con centésimas. Si coinciden (menos de 1 s de
            # diferencia) se queda la CDN, más precisa; si no, es una corrección y manda la oficial.
            try:
                cdn_seconds = clock_seconds(s.get("minutes")) if s.get("minutes") else None
            except BoxScoreError:
                cdn_seconds = None
            if cdn_seconds is None or abs(cdn_seconds - clock_seconds(minutes)) >= 1.0:
                s["minutes"] = minutes
            s["plusMinusPoints"] = int(off["statistics"]["plusMinusPoints"])
            if plus is None or minus is None or int(plus) - int(minus) != s["plusMinusPoints"]:
                # Sin dato en pista coherente (la corrección cambió sus minutos): se reparte por minutos jugados
                share = clock_seconds(minutes) / (team_seconds / 5) if team_seconds else 0.0
                s["plus"] = round(int(off_team["score"]) * share)
                s["minus"] = s["plus"] - s["plusMinusPoints"]
            p["played"] = "1"
            played.add(pid)
        for pid, p in by_id.items():
            if pid not in played:
                p["played"] = "0"
        players = [p for p in team["players"] if p.get("played") == "1"]
        for team_key, player_key in TEAM_SUMS.items():
            team["statistics"][team_key] = sum(int(p["statistics"][player_key]) for p in players)
        team["score"] = int(off_team["score"])
    return merged


def rows_from_box(box: dict) -> tuple[list[dict], list[dict], list[dict]]:
    """(filas de jugadores, filas de los 2 equipos, jugadores que aparecen {id, full_name, team_id}).

    Solo partidos terminados (gameStatus 3) y solo jugadores que llegaron a jugar (played == "1")."""
    game_id = box["gameId"]
    if box.get("gameStatus") != 3:
        raise BoxScoreError(f"El partido {game_id} no ha terminado (gameStatus={box.get('gameStatus')})")

    regulation = box.get("regulationPeriods") or 4
    periods = int(box.get("period") or 0)
    if periods < regulation:
        raise BoxScoreError(f"El partido {game_id} tiene {periods} periodos")
    game_seconds = REGULATION_SECONDS * regulation / 4 + OVERTIME_SECONDS * (periods - regulation)
    common = {"season_id": season_of_game(game_id), "game_type": game_type_of(game_id), "game_date": game_date_et(box)}

    player_rows, team_rows, people = [], [], []
    sides = (("homeTeam", "awayTeam", True), ("awayTeam", "homeTeam", False))
    for side, other, is_home in sides:
        team, opponent = box[side], box[other]
        team_id, opponent_id = int(team["teamId"]), int(opponent["teamId"])
        played = [p for p in team.get("players") or [] if p.get("played") == "1"]
        if not played:
            raise BoxScoreError(f"Partido {game_id}: {team.get('teamTricode')} sin jugadores")
        rows = [_player_row(game_id, p, team_id, opponent_id, common) for p in played]

        s = team["statistics"]
        team_row = {
            "id": f"{game_id}_{team_id}",
            "game_id": game_id,
            "team_id": team_id,
            "opponent_id": opponent_id,
            "is_home": is_home,
            **common,
            "seconds": clock_seconds(s["minutes"]),
            "pts": int(team["score"]),
            "fgm": int(s["fieldGoalsMade"]),
            "fga": int(s["fieldGoalsAttempted"]),
            "fg3m": int(s["threePointersMade"]),
            "fg3a": int(s["threePointersAttempted"]),
            "ftm": int(s["freeThrowsMade"]),
            "fta": int(s["freeThrowsAttempted"]),
            "oreb": int(s["reboundsOffensive"]),
            "dreb": int(s["reboundsDefensive"]),
            "reb": int(s["reboundsPersonal"]),
            "ast": int(s["assists"]),
            "stl": int(s["steals"]),
            "blk": int(s["blocks"]),
            "tov": int(s["turnovers"]),
            "pf": int(s["foulsPersonal"]),
            "team_tov": int(s.get("turnoversTeam") or 0),
        }

        # El equipo es la suma de sus jugadores: si no cuadra, el boxscore está a medias o corrupto
        for key in ("pts", "fgm", "fga", "fg3m", "fg3a", "ftm", "fta", "oreb", "dreb", "reb", "ast", "stl", "blk", "tov", "pf"):
            total = sum(r[key] for r in rows)
            if total != team_row[key]:
                raise BoxScoreError(f"Partido {game_id}, {team.get('teamTricode')}: {key} de los jugadores {total} != equipo {team_row[key]}")
        # La NBA redondea al segundo los minutos de cada jugador (el equipo suma 240:00 exactos): hasta 1 s
        # de diferencia por jugador es redondeo; más, falta alguien en el boxscore
        played_seconds = sum(r["seconds"] for r in rows)
        if abs(played_seconds - team_row["seconds"]) > len(rows) + 1:
            raise BoxScoreError(f"Partido {game_id}, {team.get('teamTricode')}: {played_seconds:.0f} s de los jugadores "
                                f"frente a {team_row['seconds']:.0f} s del equipo")
        for r in rows:
            if not 0 <= r["seconds"] <= game_seconds + 1:
                raise BoxScoreError(f"Partido {game_id}: jugador {r['player_id']} con {r['seconds']} s")
            if r["on_court_pts"] - r["on_court_opp_pts"] != r["plus_minus"]:
                raise BoxScoreError(f"Partido {game_id}: +/- incoherente del jugador {r['player_id']}")

        player_rows += rows
        team_rows.append(team_row)
        people += [{"id": int(p["personId"]), "full_name": player_name(p), "team_id": team_id} for p in played]

    home, away = team_rows
    if home["pts"] == away["pts"]:
        raise BoxScoreError(f"Partido {game_id} terminado en empate {home['pts']}-{away['pts']}")
    return player_rows, team_rows, people
