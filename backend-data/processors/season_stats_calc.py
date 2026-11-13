"""Tarea 5.2b — `player_season_stats` de la temporada en curso, la carrera y los récords, a partir de
`player_game_stats` (boxscores de la CDN), sin stats.nba.com.

- Temporada en curso (regular y playoffs): suma exacta de los partidos; mismos campos y redondeo que la NBA.
- Carrera: `totals.history` (totales exactos de las temporadas anteriores, cargados una vez desde la NBA con
  `fetch_career_awards`) + la temporada en curso. Al cambiar de temporada, la que acaba se suma al historial.
- Jugadores nuevos en la base de datos: si el índice de la NBA dice que no jugaron antes de que empezáramos
  a guardar boxscores, su carrera es la que hemos visto; si jugaron antes, su carrera queda sin escribir
  ("pending_history") hasta cargarla desde un PC: `python -m extractors.fetch_career_awards --player-id X`.
- Récords personales: los guardados, mejorados con los partidos nuevos.

Se ejecuta una vez al día (job diario), como antes: la ficha de un partido enseña promedios en el Nivel 1 y
no deben cambiar minutos después de que termine.

Uso (desde backend-data/):
    python -m processors.season_stats_calc            # calcula y guarda
    python -m processors.season_stats_calc --dry-run  # calcula y muestra el resumen, sin escribir

Sale con 1 si algo falla y con 2 si faltan boxscores de partidos terminados (se calcula igualmente con lo
que hay, y el aviso se repite hasta que se completen).
"""
import argparse
import sys
from collections import Counter
from datetime import date, datetime, timezone

from db import connect, save_status, select_all, upsert
from extractors import nba_cdn
from processors import season_stats as S
from processors.box_stats import PLAYOFFS, REGULAR_SEASON, SEASON_TYPES, season_of_game

SYNC_ID = "season_stats"
# Primera temporada con boxscores guardados: lo anterior solo existe como totales oficiales de la NBA
TRACKING_START = 2026


def previous_season(season: str) -> str:
    start = int(season[:4]) - 1
    return f"{start}-{(start + 1) % 100:02d}"


def current_season(client) -> str | None:
    last = (client.table("games").select("id").eq("status", "Final").or_(f"id.like.{REGULAR_SEASON}%,id.like.{PLAYOFFS}%")
            .order("game_datetime_utc", desc=True).limit(1).execute().data)
    return season_of_game(last[0]["id"]) if last else None


def missing_boxscores(client, season: str) -> list[str]:
    code = season[2:4]
    finals = select_all(client, "games", "id", lambda q: q.eq("status", "Final").or_(
        f"id.like.{REGULAR_SEASON}{code}%,id.like.{PLAYOFFS}{code}%"))
    have = {r["game_id"] for r in select_all(client, "team_game_stats", "id, game_id", lambda q: q.eq("season_id", season))}
    return sorted(g["id"] for g in finals if g["id"] not in have)


def load_existing(client, player_ids: list[int]) -> dict[str, dict]:
    """Filas guardadas de esos jugadores (carrera y temporadas), por id."""
    rows = {}
    for i in range(0, len(player_ids), 150):
        chunk = player_ids[i:i + 150]
        for r in select_all(client, "player_season_stats", "id, player_id, season_id, season_type, advanced_stats, totals",
                            lambda q: q.in_("player_id", chunk)):
            rows[r["id"]] = r
    return rows


def resolve_history(player_id: int, season_type: str, season: str, existing: dict[str, dict],
                    first_season: dict[int, int] | None) -> tuple[dict | None, str]:
    """(totales de antes de `season`, motivo). None = historial desconocido: no se escribe la carrera."""
    prev = previous_season(season)
    career = existing.get(f"{player_id}_Career_{season_type}")
    totals = (career or {}).get("totals") or {}
    if career is None and season_type == SEASON_TYPES[PLAYOFFS]:
        # La carga oficial crea la carrera de playoffs solo si los jugó: si tiene la de temporada regular
        # con historial y no la de playoffs, su historial de playoffs es cero
        regular = (existing.get(f"{player_id}_Career_{SEASON_TYPES[REGULAR_SEASON]}") or {}).get("totals") or {}
        if regular.get("history") is not None and regular.get("history_through"):
            totals = {"history": S.empty_totals(), "history_through": regular["history_through"]}
    if totals.get("history") is not None and totals.get("history_through"):
        history, through = dict(totals["history"]), totals["history_through"]
        # Cambio de temporada: las temporadas que acabaron desde entonces se suman al historial
        while through < prev:
            through = f"{int(through[:4]) + 1}-{(int(through[:4]) + 2) % 100:02d}"
            season_row = existing.get(f"{player_id}_{through}_{season_type}")
            if season_row is not None:
                if not season_row.get("totals"):
                    return None, f"la temporada {through} no tiene totales"
                history = S.add_totals(history, {k: season_row["totals"].get(k) for k in S.TOTAL_KEYS})
        if through != prev:
            return None, f"historial hasta {through}, posterior a {prev}"
        return history, "history"
    if career is not None and not totals:
        return None, "carrera oficial sin totales (falta la carga de totales)"
    # Sin carrera guardada: ¿jugó en la NBA antes de que empezáramos a guardar boxscores?
    if first_season is None:
        return None, "índice de jugadores de la NBA no disponible"
    first = first_season.get(player_id)
    if first is not None and first < TRACKING_START:
        return None, f"jugó en la NBA desde {first}: falta su historial oficial"
    history = S.empty_totals()
    for sid in sorted({r["season_id"] for r in existing.values() if r["player_id"] == player_id and r["season_id"] not in ("Career", season)}):
        row = existing.get(f"{player_id}_{sid}_{season_type}")
        if row is None:
            continue
        if not row.get("totals") or sid >= season:
            return None, f"la temporada {sid} no tiene totales"
        history = S.add_totals(history, {k: row["totals"].get(k) for k in S.TOTAL_KEYS})
    return history, "tracked"


def build(client, season: str, today: date) -> dict:
    game_rows = select_all(client, "player_game_stats", "*", lambda q: q.eq("season_id", season))
    seasons = S.aggregate(game_rows)
    teams = client.table("teams").select("id, abbreviation").execute().data
    abbreviations = {t["id"]: t["abbreviation"] for t in teams}
    valid_teams = set(abbreviations)
    players = {p["id"]: p for p in select_all(client, "players", "id, birth_date")}

    player_ids = sorted({pid for (pid, _, _) in seasons})
    existing = load_existing(client, player_ids)
    try:
        first_season = {pid: first for pid, (first, _) in nba_cdn.player_index().items()}
    except Exception as exc:  # sin el índice, los jugadores nuevos con historial quedan pendientes
        print(f"  ~ índice de jugadores de la NBA no disponible: {exc!r}")
        first_season = None

    rows, pending, unknown_players = [], {}, []
    games_by_player: dict[int, list[dict]] = {}
    for ps in seasons.values():
        games_by_player.setdefault(ps.player_id, []).extend(ps.games)

    for (pid, sid, stype), ps in seasons.items():
        if sid != season:
            continue
        if pid not in players:
            unknown_players.append(pid)
            continue
        current_id = f"{pid}_{season}_{stype}"
        age = S.season_age(players[pid].get("birth_date"), season, today)
        if age is None:
            age = ((existing.get(current_id) or {}).get("advanced_stats") or {}).get("age")
        rows.append(S.season_row(ps, abbreviations, valid_teams, age))

    # Carrera: para cada jugador con partidos esta temporada, regular y playoffs
    for pid in player_ids:
        if pid not in players:
            continue
        for stype in SEASON_TYPES.values():
            current = seasons.get((pid, season, stype))
            history, reason = resolve_history(pid, stype, season, existing, first_season)
            if history is None:
                pending[pid] = reason
                continue
            if current is None and not history.get("gp"):
                continue  # sin playoffs nunca: no hay fila de carrera de playoffs (como la NBA)
            highs = None
            if stype == SEASON_TYPES[REGULAR_SEASON]:
                stored = ((existing.get(f"{pid}_Career_{stype}") or {}).get("advanced_stats") or {}).get("career_highs")
                # Partir de cero solo vale si toda su carrera son partidos que tenemos guardados
                if stored or reason == "tracked":
                    highs = S.update_highs(stored, games_by_player.get(pid, []), abbreviations)
            rows.append(S.career_row(pid, stype, history, previous_season(season),
                                     current.total.as_dict() if current else None, highs))

    # Filas de esta temporada que ya no corresponden a nadie (p. ej. una corrección quitó su único partido)
    produced = {r["id"] for r in rows}
    current_ids = {r["id"] for r in select_all(client, "player_season_stats", "id", lambda q: q.eq("season_id", season))}
    stale = sorted(current_ids - produced)
    return {"rows": rows, "pending": pending, "unknown_players": unknown_players, "stale": stale,
            "games": len({r["game_id"] for r in game_rows}), "lines": len(game_rows)}


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dry-run", action="store_true", help="calcula y muestra el resumen, sin escribir")
    args = parser.parse_args()

    client = connect()
    try:
        season = current_season(client)
        if season is None:
            print("Sin partidos terminados")
            return
        missing = missing_boxscores(client, season)
        result = build(client, season, datetime.now(timezone.utc).date())
        kinds = Counter("career" if r["season_id"] == "Career" else "season" for r in result["rows"])
        print(f"Temporada {season}: {result['games']} partidos · {result['lines']} líneas · "
              f"{kinds['season']} filas de temporada · {kinds['career']} de carrera")
        if result["pending"]:
            print(f"  Carrera pendiente de historial oficial ({len(result['pending'])}): "
                  + ", ".join(f"{pid} ({why})" for pid, why in sorted(result["pending"].items())[:15]))
        if result["unknown_players"]:
            print(f"  ! Jugadores sin ficha en `players`: {result['unknown_players'][:15]}")
        if missing:
            print(f"  ! Partidos terminados sin boxscore: {len(missing)} ({missing[:10]})")
        if args.dry_run:
            return

        upsert(client, "player_season_stats", result["rows"])
        # Solo se borra lo sobrante si no falta ningún partido (si faltan, la ausencia puede ser nuestra)
        if result["stale"] and not missing:
            client.table("player_season_stats").delete().in_("id", result["stale"]).execute()
        save_status(client, SYNC_ID, {
            "season": season, "rows": len(result["rows"]), "pending_history": sorted(result["pending"]),
            "missing_boxscores": len(missing),
        }, None)
        print(f"Supabase -> {len(result['rows'])} filas actualizadas"
              + (f", {len(result['stale'])} sobrantes borradas" if result["stale"] and not missing else ""))
    except Exception as exc:
        if not args.dry_run:
            save_status(client, SYNC_ID, None, repr(exc))
        raise
    if missing or result["unknown_players"]:
        sys.exit(2)


if __name__ == "__main__":
    main()
