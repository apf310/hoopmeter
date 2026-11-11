"""Tarea 3.2 — Calendario completo de la temporada y estado en directo de los partidos de hoy.

- Calendario (`ScheduleLeagueV2`): todos los partidos de la temporada en `games`, para que la
  web pueda mostrar cualquier jornada (ayer, mañana, dentro de 3 días...). Partidos ya jugados
  con su marcador final; los futuros como `Scheduled`.
- Hoy (`live.nba.endpoints.scoreboard`): estado, marcador, `live_period_text` y `quarters_score`.

Nunca escribe `excitement_score`, los textos IA ni `is_processed`: eso es cosa de `watcher.py`.
Se saltan pretemporada, All-Star y cruces de la Copa aún sin equipos (no existen en `teams`).

Uso (desde backend-data/):
    python -m extractors.fetch_live_and_final              # calendario + hoy
    python -m extractors.fetch_live_and_final --today      # solo los partidos de hoy
    python -m extractors.fetch_live_and_final --dry-run    # descarga y muestra, sin escribir
"""
import argparse
import re
import sys

from nba_api.live.nba.endpoints import scoreboard
from nba_api.stats.endpoints import scheduleleaguev2
from nba_api.stats.static import teams as static_teams

from config import SUPABASE_SERVICE_KEY, SUPABASE_URL
from extractors.fetch_teams_players import to_int, upsert

TIMEOUT = 60
STATUS = {1: "Scheduled", 2: "Live", 3: "Final"}
# Prefijos de gameId que no van a `games`: 001 pretemporada, 003 All-Star
SKIPPED_PREFIXES = ("001", "003")


def team_ids() -> set[int]:
    return {t["id"] for t in static_teams.get_teams()}


def is_valid_game(game_id: str, home_id, away_id, valid_teams: set[int]) -> bool:
    return not game_id.startswith(SKIPPED_PREFIXES) and home_id in valid_teams and away_id in valid_teams


def build_schedule(valid_teams: set[int]) -> list[dict]:
    """Todas las filas del calendario de la temporada actual (mismas claves en todas)."""
    df = scheduleleaguev2.ScheduleLeagueV2(timeout=TIMEOUT).get_data_frames()[0]
    rows = []
    for r in df.to_dict("records"):
        home_id, away_id = to_int(r["homeTeam_teamId"]), to_int(r["awayTeam_teamId"])
        if not is_valid_game(r["gameId"], home_id, away_id, valid_teams):
            continue
        status = STATUS.get(to_int(r["gameStatus"]), "Scheduled")
        played = status != "Scheduled"
        rows.append({
            "id": r["gameId"],
            "game_datetime_utc": r["gameDateTimeUTC"],
            "home_team_id": home_id,
            "away_team_id": away_id,
            "home_score": to_int(r["homeTeam_score"]) if played else None,
            "away_score": to_int(r["awayTeam_score"]) if played else None,
            "status": status,
        })
    return rows


def parse_clock(iso: str | None) -> str | None:
    """'PT04M12.00S' -> '04:12'."""
    match = re.match(r"PT(\d+)M(\d+)", iso or "")
    return f"{int(match[1]):02d}:{int(match[2]):02d}" if match else None


def period_label(period: int, regulation: int = 4) -> str:
    return f"Q{period}" if period <= regulation else f"OT{period - regulation}"


def period_text(game: dict, status: str) -> str | None:
    """Mismo formato que `/api/live` en la web: 'Q3 04:12', 'Descanso', 'Fin Q1'."""
    if status != "Live":
        return None
    if re.search(r"half", game.get("gameStatusText", ""), re.IGNORECASE):
        return "Descanso"
    label = period_label(game["period"], game.get("regulationPeriods") or 4)
    clock = parse_clock(game.get("gameClock"))
    return f"Fin {label}" if not clock or clock == "00:00" else f"{label} {clock}"


def quarters_score(home: dict, away: dict) -> dict | None:
    """{"home": [28, 31, ...], "away": [...]}: un valor por periodo jugado (prórrogas incluidas)."""
    if not home.get("periods"):
        return None
    return {"home": [p["score"] for p in home["periods"]], "away": [p["score"] for p in away["periods"]]}


def build_today(valid_teams: set[int]) -> list[dict]:
    """Filas de los partidos de hoy con su estado en directo."""
    games = scoreboard.ScoreBoard(timeout=TIMEOUT).get_dict()["scoreboard"]["games"]
    rows = []
    for g in games:
        home, away = g["homeTeam"], g["awayTeam"]
        if not is_valid_game(g["gameId"], home["teamId"], away["teamId"], valid_teams):
            continue
        status = STATUS.get(g["gameStatus"], "Scheduled")
        played = status != "Scheduled"
        rows.append({
            "id": g["gameId"],
            "game_datetime_utc": g["gameTimeUTC"],
            "home_team_id": home["teamId"],
            "away_team_id": away["teamId"],
            "home_score": home["score"] if played else None,
            "away_score": away["score"] if played else None,
            "status": status,
            "live_period_text": period_text(g, status),
            "quarters_score": quarters_score(home, away) if played else None,
        })
    return rows


def sync_schedule(client, valid_teams: set[int] | None = None) -> int:
    rows = build_schedule(valid_teams or team_ids())
    upsert(client, "games", rows)
    return len(rows)


def sync_today(client, valid_teams: set[int] | None = None) -> list[dict]:
    rows = build_today(valid_teams or team_ids())
    if rows:
        upsert(client, "games", rows)
    return rows


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--today", action="store_true", help="solo los partidos de hoy (sin calendario)")
    parser.add_argument("--dry-run", action="store_true", help="no escribe en Supabase")
    args = parser.parse_args()

    valid = team_ids()
    schedule = [] if args.today else build_schedule(valid)
    today = build_today(valid)
    if not args.today:
        by_status = {s: sum(r["status"] == s for r in schedule) for s in STATUS.values()}
        print(f"Calendario: {len(schedule)} partidos {by_status}")
    print(f"Hoy: {len(today)} partidos")

    if args.dry_run:
        print("\n[dry-run] Ejemplo calendario:", schedule[0] if schedule else None)
        print("[dry-run] Ejemplo hoy:", today[0] if today else None)
        return

    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        sys.exit("Faltan SUPABASE_URL y/o SUPABASE_KEY en backend-data/.env")
    from supabase import create_client

    client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    # Primero el calendario y después hoy: el directo es más reciente y debe prevalecer
    if schedule:
        upsert(client, "games", schedule)
    if today:
        upsert(client, "games", today)
    n_games = client.table("games").select("id", count="exact").limit(1).execute().count
    print(f"\nSupabase -> games: {n_games} filas")


if __name__ == "__main__":
    main()
