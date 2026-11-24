"""Tarea 7.3 — Ritmo y medias de la liga por temporada, para el comparador ajustado por épocas.

Escribe `web-app/src/lib/league-averages.ts`: por temporada cerrada (1946-47 en adelante) y fase, lo que hacía un
equipo medio por cada 48 minutos (puntos, rebotes, asistencias, TS% y posesiones). Va en el código y no en la base
de datos porque el pasado no cambia; la temporada en curso la calcula la web con los totales del job diario.

- Desde 1985-86 basta el registro de partidos de la NBA (LeagueGameLog), completo equipo a equipo.
- Antes solo trae siempre los puntos y los tiros anotados. Lo demás es la suma de las carreras de los jugadores que
  debutaron hasta 1984 (PlayerCareerStats), llevada al total exacto de puntos del registro. Los rebotes son así los
  individuales, como los del jugador que se compara: los de equipo de los 60 no eran de nadie.
- Ritmo: fórmula de Dean Oliver con las medias de la liga. Hasta 1977-78 no hay pérdidas y hasta 1973-74 tampoco
  rebotes de ataque: se estiman con la proporción de la primera temporada que los tiene y se marca como estimado.
- Cada fase se mide con sus partidos. Con menos de MIN_TEAM_GAMES (los playoffs de los 40 a los 70) se suman las
  temporadas vecinas: 40 partidos con Mikan o Wilt en muchos de ellos no son una media de la liga.

Solo desde un PC (stats.nba.com). Uso (desde backend-data/):
    python -m extractors.fetch_league_averages --season 2026-27   # cada verano: añade la temporada que acaba de cerrar
    python -m extractors.fetch_league_averages --all              # rehace la tabla (~45 min; se puede cortar y relanzar)
    (--dry-run: no escribe la tabla)
"""
import argparse
import json
import re
import sys
import time
from pathlib import Path

from config import API_SLEEP_SECONDS

PHASES = ("Regular Season", "Playoffs")
OUTPUT = Path(__file__).resolve().parents[2] / "web-app" / "src" / "lib" / "league-averages.ts"
CACHE = Path(__file__).resolve().parents[1] / ".cache" / "league_averages.json"

FIRST_SEASON = 1946
FIRST_FULL_LOG = 1985  # 1985-86: desde aquí el registro de partidos trae todo
COUNTS = ("pts", "fgm", "fga", "fta", "oreb", "reb", "ast", "tov")
TEAM_TURNOVERS = 0.7   # pérdidas de equipo por partido: no están en las cifras de los jugadores
USUAL_MINUTES = 241.2  # minutos de equipo por partido con prórrogas, si el registro no los trae
MIN_TEAM_GAMES = 100
MAX_REACH = 3
COVERAGE_MARGIN = 0.03  # cuánto pueden separarse las carreras sumadas de los puntos del registro


def season_id(year: int) -> str:
    return f"{year}-{(year + 1) % 100:02d}"


# ---------- Cálculo (puro) ----------

def league_totals(log: dict, careers: dict | None) -> dict:
    """Totales de la liga en una fase: `games` (partidos de equipo), `minutes` y COUNTS.

    log: del registro de partidos; una cifra es None si no está en todos. careers: suma de los jugadores (0 = esa
    época no lo registraba).
    """
    minutes = log["minutes"] if log["minutes"] and 238 <= log["minutes"] / log["games"] <= 250 else log["games"] * USUAL_MINUTES
    totals = {"games": log["games"], "minutes": minutes, **{key: log.get(key) for key in COUNTS}}
    if not careers or not careers["pts"]:
        return totals
    scale = log["pts"] / careers["pts"]
    for key in COUNTS:
        if totals[key] is None and careers[key]:
            totals[key] = careers[key] * scale + (TEAM_TURNOVERS * totals["games"] if key == "tov" else 0)
    return totals


def known(totals: dict) -> set[str]:
    return {key for key in COUNTS if totals[key] is not None}


def pooled(totals: dict[int, dict], year: int) -> dict:
    """Totales de una temporada; si son pocos partidos, con las vecinas que registraban lo mismo o más."""
    base = totals[year]
    for reach in range(MAX_REACH + 1):
        years = [y for y in range(year - reach, year + reach + 1) if y in totals and known(totals[y]) >= known(base)]
        pool = {key: None if value is None else sum(totals[y][key] for y in years) for key, value in base.items()}
        if pool["games"] >= MIN_TEAM_GAMES:
            return pool
    return pool


def offensive_rate(t: dict) -> float:
    """Parte de los rebotes que son de ataque."""
    return t["oreb"] / t["reb"]


def turnover_rate(t: dict) -> float:
    """Parte de las jugadas que acaban en pérdida."""
    return t["tov"] / (t["fga"] + 0.44 * t["fta"] + t["tov"])


def averages(t: dict, oreb_rate: float, tov_rate: float) -> dict:
    """Medias por equipo y 48 minutos. oreb_rate y tov_rate: para estimar el ritmo donde no hay datos."""
    per = {key: None if t[key] is None else t[key] / t["minutes"] * 240 for key in COUNTS}
    ts = pace = None
    estimated = False
    if per["fga"] and per["fta"]:
        shots = per["fga"] + 0.44 * per["fta"]
        ts = per["pts"] / (2 * shots)
        estimated = per["oreb"] is None or per["tov"] is None
        offensive = oreb_rate if per["oreb"] is None else offensive_rate(per)
        turnovers = tov_rate / (1 - tov_rate) * shots if per["tov"] is None else per["tov"]
        pace = per["fga"] + 0.4 * per["fta"] - 1.07 * offensive * (per["fga"] - per["fgm"]) + turnovers
    return {"pts": per["pts"], "reb": per["reb"], "ast": per["ast"], "tsPct": ts, "pace": pace, "paceEstimated": estimated}


def build_phase(totals: dict[int, dict], regular: dict[int, dict]) -> dict[str, dict]:
    """regular: totales de la fase regular, de donde salen las proporciones con las que se estima el ritmo."""
    with_oreb = next(regular[y] for y in sorted(regular) if regular[y]["oreb"] is not None)
    with_tov = next(regular[y] for y in sorted(regular) if regular[y]["tov"] is not None)
    rates = offensive_rate(with_oreb), turnover_rate(with_tov)
    return {season_id(y): averages(pooled(totals, y), *rates) for y in sorted(totals)}


# ---------- Tabla de la web ----------

HEADER = """// Generado por backend-data/extractors/fetch_league_averages.py (Tarea 7.3): no editar a mano.
// Lo que hacía un equipo medio de la liga por cada 48 minutos, por temporada cerrada y fase. Fuente: stats.nba.com.
import type { LeagueTable } from "./era-adjust.ts";

export const LEAGUE_AVERAGES: LeagueTable = {
"""


def render(table: dict[str, dict[str, dict]]) -> str:
    def number(value, digits):
        return "null" if value is None else f"{value:.{digits}f}"

    lines = [HEADER]
    for phase in PHASES:
        lines.append(f'  "{phase}": {{\n')
        for season, row in sorted(table[phase].items()):
            lines.append(
                f'    "{season}": {{ pts: {number(row["pts"], 2)}, reb: {number(row["reb"], 2)}, ast: {number(row["ast"], 2)}, '
                f'tsPct: {number(row["tsPct"], 4)}, pace: {number(row["pace"], 1)}, paceEstimated: {str(row["paceEstimated"]).lower()} }},\n'
            )
        lines.append("  },\n")
    lines.append("};\n")
    return "".join(lines)


ROW = re.compile(r'"(\d{4}-\d{2})": \{ pts: (\S+), reb: (\S+), ast: (\S+), tsPct: (\S+), pace: (\S+), paceEstimated: (true|false) \}')


def parse(text: str) -> dict[str, dict[str, dict]]:
    """La tabla ya escrita (para añadir una temporada sin rehacer las demás)."""
    def number(value):
        return None if value == "null" else float(value)

    return {
        phase: {
            m[1]: {"pts": number(m[2]), "reb": number(m[3]), "ast": number(m[4]), "tsPct": number(m[5]), "pace": number(m[6]), "paceEstimated": m[7] == "true"}
            for m in ROW.finditer(block)
        }
        for phase, block in zip(PHASES, text.split('"Playoffs": {'))
    }


# ---------- Descarga ----------

def fetch_log(year: int, phase: str) -> dict | None:
    from nba_api.stats.endpoints import leaguegamelog

    from extractors.fetch_career_awards import nba_call

    df = nba_call(leaguegamelog.LeagueGameLog, season=season_id(year), season_type_all_star=phase).get("LeagueGameLog")
    time.sleep(API_SLEEP_SECONDS)
    if df is None or df.empty:
        return None

    def complete(key):
        column = df[key.upper()]
        return float(column.sum()) if column.notna().all() else None

    return {"games": len(df), "minutes": float(df["MIN"].sum()), **{key: complete(key) for key in COUNTS}}


def fetch_careers(cache: dict) -> dict[str, dict]:
    """{"1961-62|Playoffs": suma de todos los jugadores} con los que debutaron antes de FIRST_FULL_LOG."""
    from nba_api.stats.endpoints import commonallplayers, playercareerstats

    from extractors.fetch_career_awards import SEASON_TYPES, clean, nba_call, to_int

    everyone = nba_call(commonallplayers.CommonAllPlayers, is_only_current_season=0)["CommonAllPlayers"]
    ids = [int(r["PERSON_ID"]) for r in everyone.to_dict("records") if str(r["FROM_YEAR"]).isdigit() and int(r["FROM_YEAR"]) < FIRST_FULL_LOG]
    players = cache.setdefault("careers", {})
    pending = [pid for pid in ids if str(pid) not in players]
    print(f"Carreras: {len(ids)} jugadores, {len(pending)} por descargar", flush=True)
    for i, pid in enumerate(pending, 1):
        data = nba_call(playercareerstats.PlayerCareerStats, player_id=pid, per_mode36="Totals")
        seasons = {}
        for phase in PHASES:
            df = data.get(SEASON_TYPES[phase][0])
            if df is None or df.empty:
                continue
            for season, group in df.groupby("SEASON_ID", sort=False):
                if int(str(season)[:4]) >= FIRST_FULL_LOG:
                    continue
                records = group.to_dict("records")
                row = next((r for r in records if not to_int(r["TEAM_ID"])), None) or records[-1]  # TOT si hubo traspaso
                seasons[f"{season}|{phase}"] = {key: None if clean(row[key.upper()]) is None else float(row[key.upper()]) for key in COUNTS}
        players[str(pid)] = seasons
        if i % 50 == 0 or i == len(pending):
            save_cache(cache)
            print(f"  {i}/{len(pending)}", flush=True)
        time.sleep(API_SLEEP_SECONDS)

    totals: dict[str, dict] = {}
    for seasons in (players[str(pid)] for pid in ids):
        for key, row in seasons.items():
            total = totals.setdefault(key, dict.fromkeys(COUNTS, 0.0))
            for count in COUNTS:
                total[count] += row[count] or 0.0
    return totals


def load_cache() -> dict:
    return json.loads(CACHE.read_text(encoding="utf-8")) if CACHE.exists() else {}


def save_cache(cache: dict) -> None:
    CACHE.parent.mkdir(exist_ok=True)
    CACHE.write_text(json.dumps(cache), encoding="utf-8")


def rebuild(last_year: int) -> dict[str, dict[str, dict]]:
    cache = load_cache()
    logs = cache.setdefault("logs", {})
    for phase in PHASES:
        for year in range(FIRST_SEASON, last_year + 1):
            key = f"{season_id(year)}|{phase}"
            if key not in logs:
                logs[key] = fetch_log(year, phase)
                print(f"  registro {key}", flush=True)
                save_cache(cache)
    careers = fetch_careers(cache)

    totals: dict[str, dict[int, dict]] = {}
    for phase in PHASES:
        totals[phase] = {}
        for year in range(FIRST_SEASON, last_year + 1):
            key = f"{season_id(year)}|{phase}"
            if not logs[key]:
                print(f"{key}: sin registro de partidos")
                continue
            if year < FIRST_FULL_LOG:
                coverage = careers.get(key, {}).get("pts", 0) / logs[key]["pts"]
                if abs(1 - coverage) > 0.003:
                    print(f"{key}: las carreras suman el {coverage:.1%} de los puntos{'  <-- REVISAR' if abs(1 - coverage) > COVERAGE_MARGIN else ''}")
            totals[phase][year] = league_totals(logs[key], careers.get(key))
    return {phase: build_phase(totals[phase], totals["Regular Season"]) for phase in PHASES}


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    target = parser.add_mutually_exclusive_group(required=True)
    target.add_argument("--season", help="añade una temporada cerrada (p. ej. 2026-27)")
    target.add_argument("--all", metavar="ULTIMA", nargs="?", const="2025-26", help="rehace la tabla hasta esta temporada cerrada")
    parser.add_argument("--dry-run", action="store_true", help="no escribe la tabla")
    args = parser.parse_args()

    if args.all:
        table = rebuild(int(args.all[:4]))
    else:
        year = int(args.season[:4])
        table = parse(OUTPUT.read_text(encoding="utf-8"))
        for phase in PHASES:
            log = fetch_log(year, phase)
            if not log or any(log[key] is None for key in COUNTS):
                sys.exit(f"El registro de {args.season} ({phase}) no está completo: ¿ha acabado ya la temporada?")
            table[phase][season_id(year)] = averages(league_totals(log, None), 0, 0)

    for phase in PHASES:
        print(f"{phase}: {len(table[phase])} temporadas")
        for season, row in sorted(table[phase].items())[-3:]:
            print(" ", season, {key: value if isinstance(value, bool) else round(value, 3) for key, value in row.items() if value is not None})
    if args.dry_run:
        return
    OUTPUT.write_text(render(table), encoding="utf-8", newline="\n")
    print(f"Escrito {OUTPUT}")


if __name__ == "__main__":
    main()
