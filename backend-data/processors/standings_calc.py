"""Tarea 5.2b — Clasificación (`teams.wins`, `losses`, `conf_rank`, `standings_extra`) calculada a partir de
los partidos terminados de `games`, con los desempates oficiales (processors/standings.py).

Se ejecuta al final de cada pasada del watcher en la que algún partido termina y en el job diario. Antes de
escribir comprueba que todo cuadra (30 equipos, victorias = derrotas = partidos, puestos 1-15 sin huecos):
si algo falla, se conserva la clasificación anterior y el proceso sale con error.

Uso (desde backend-data/):
    python -m processors.standings_calc            # calcula y guarda
    python -m processors.standings_calc --dry-run  # calcula y comprueba, sin escribir

Nunca imprime balances ni resultados (el registro de GitHub Actions es público).
"""
import argparse
import sys

from db import connect, save_status, select_all
from processors import standings
from processors.box_stats import REGULAR_SEASON

SYNC_ID = "standings"


def season_code(client) -> str | None:
    """Temporada del último partido de temporada regular terminado ('26' = 2026-27)."""
    last = (client.table("games").select("id").eq("status", "Final").like("id", f"{REGULAR_SEASON}%")
            .order("game_datetime_utc", desc=True).limit(1).execute().data)
    return last[0]["id"][3:5] if last else None


def compute(client) -> tuple[dict[int, dict], list[dict], dict[int, dict]] | None:
    code = season_code(client)
    if code is None:
        return None
    games = select_all(client, "games", "id, game_datetime_utc, home_team_id, away_team_id, home_score, away_score, is_neutral",
                       lambda q: q.eq("status", "Final").like("id", f"{REGULAR_SEASON}{code}%"))
    team_rows = client.table("teams").select("id, name, abbreviation, conference, division").execute().data
    teams = {t["id"]: t for t in team_rows}
    names = {t["id"]: t["name"] for t in team_rows}
    result = standings.compute(games, teams, names)
    standings.check(result, games, teams)
    return result, games, teams


def update(client) -> int:
    """Calcula, comprueba y guarda. Devuelve los equipos actualizados (0 si aún no hay partidos)."""
    computed = compute(client)
    if computed is None:
        return 0
    result, games, teams = computed
    # Una sola petición = una sola transacción: o se actualizan los 30 equipos o ninguno. name y
    # abbreviation van porque el upsert valida NOT NULL antes de resolver el conflicto (no cambian).
    rows = [{"id": tid, "name": teams[tid]["name"], "abbreviation": teams[tid]["abbreviation"], **row} for tid, row in result.items()]
    client.table("teams").upsert(rows, on_conflict="id").execute()
    save_status(client, SYNC_ID, {"games": len(games), "teams": len(result)}, None)
    return len(result)


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dry-run", action="store_true", help="calcula y comprueba, sin escribir")
    args = parser.parse_args()

    client = connect()
    try:
        if args.dry_run:
            computed = compute(client)
            print("Sin partidos terminados" if computed is None else f"Clasificación correcta: {len(computed[1])} partidos, 30 equipos")
            return
        n = update(client)
        print(f"Clasificación actualizada: {n} equipos")
    except Exception as exc:
        if not args.dry_run:
            save_status(client, SYNC_ID, None, repr(exc))
        raise


if __name__ == "__main__":
    main()
