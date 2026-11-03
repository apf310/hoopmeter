"""Tarea 0.4 — Descarga los 30 equipos y los jugadores activos de nba_api
y los guarda en las tablas `teams` y `players` de Supabase.

Uso (desde backend-data/):
    python -m extractors.fetch_teams_players              # descarga + upsert
    python -m extractors.fetch_teams_players --dry-run    # solo descarga y muestra
    python -m extractors.fetch_teams_players --birthdates # añade birth_date (~1 llamada/jugador)
"""
import argparse
import math
import sys
import time

from nba_api.stats.endpoints import commonplayerinfo, leaguegamelog, leaguestandingsv3, playerindex
from nba_api.stats.static import teams as static_teams

from config import API_SLEEP_SECONDS, SUPABASE_SERVICE_KEY, SUPABASE_URL

TIMEOUT = 60
BATCH_SIZE = 200

# nba_api no expone colores de franquicia: (primario, secundario) por abreviatura.
TEAM_COLORS = {
    "ATL": ("#E03A3E", "#C1D32F"), "BOS": ("#007A33", "#BA9653"),
    "BKN": ("#000000", "#FFFFFF"), "CHA": ("#1D1160", "#00788C"),
    "CHI": ("#CE1141", "#000000"), "CLE": ("#860038", "#FDBB30"),
    "DAL": ("#00538C", "#002B5E"), "DEN": ("#0E2240", "#FEC524"),
    "DET": ("#C8102E", "#1D42BA"), "GSW": ("#1D428A", "#FFC72C"),
    "HOU": ("#CE1141", "#000000"), "IND": ("#002D62", "#FDBB30"),
    "LAC": ("#C8102E", "#1D428A"), "LAL": ("#552583", "#FDB927"),
    "MEM": ("#5D76A9", "#12173F"), "MIA": ("#98002E", "#F9A01B"),
    "MIL": ("#00471B", "#EEE1C6"), "MIN": ("#0C2340", "#236192"),
    "NOP": ("#0C2340", "#C8102E"), "NYK": ("#006BB6", "#F58426"),
    "OKC": ("#007AC1", "#EF3B24"), "ORL": ("#0077C0", "#C4CED4"),
    "PHI": ("#006BB6", "#ED174C"), "PHX": ("#1D1160", "#E56020"),
    "POR": ("#E03A3E", "#000000"), "SAC": ("#5A2D81", "#63727A"),
    "SAS": ("#C4CED4", "#000000"), "TOR": ("#CE1141", "#000000"),
    "UTA": ("#002B5C", "#F9A01B"), "WAS": ("#002B5C", "#E31837"),
}


def clean(value):
    """Convierte NaN/None/'' de pandas en None (JSON válido para Supabase)."""
    if value is None:
        return None
    if isinstance(value, float) and math.isnan(value):
        return None
    if isinstance(value, str) and not value.strip():
        return None
    return value


def to_int(value):
    value = clean(value)
    return None if value is None else int(float(value))


def height_to_meters(height):
    """'6-8' (pies-pulgadas) -> '2.03 m'."""
    height = clean(height)
    if not height or "-" not in str(height):
        return None
    feet, inches = str(height).split("-", 1)
    meters = (int(feet) * 12 + int(inches)) * 0.0254
    return f"{meters:.2f} m"


def weight_to_kg(weight):
    """'243' (libras) -> '110 kg'."""
    weight = clean(weight)
    if weight is None:
        return None
    return f"{round(float(weight) * 0.45359237)} kg"


def to_float(value):
    value = clean(value)
    return None if value is None else round(float(value), 1)


def build_form() -> dict[int, list[str]]:
    """Últimos 10 resultados ('W'/'L') de cada equipo, del más antiguo al más reciente.
    Una sola llamada para toda la liga; con menos de 10 partidos devuelve los que haya."""
    log = leaguegamelog.LeagueGameLog(player_or_team_abbreviation="T", timeout=TIMEOUT).get_data_frames()[0]
    log = log[log["WL"].isin(["W", "L"])].sort_values(["GAME_DATE", "GAME_ID"])
    return {int(team_id): games["WL"].tolist()[-10:] for team_id, games in log.groupby("TEAM_ID")}


def build_standings_extra(st, form: list[str]) -> dict:
    """Rachas, últimos 10, casa/fuera y puntos para `teams.standings_extra`."""
    if st is None:
        return {"form": form}
    streak = clean(st["strCurrentStreak"])
    return {
        "streak": streak.replace(" ", "") if streak else None,  # "W 3" -> "W3"
        "l10": clean(st["L10"]),
        "home": clean(st["HOME"]),
        "road": clean(st["ROAD"]),
        "ppg": to_float(st["PointsPG"]),
        "opp_ppg": to_float(st["OppPointsPG"]),
        "diff_ppg": to_float(st["DiffPointsPG"]),
        "form": form,
    }


def build_teams() -> list[dict]:
    standings = leaguestandingsv3.LeagueStandingsV3(timeout=TIMEOUT).get_data_frames()[0]
    by_id = {int(r["TeamID"]): r for _, r in standings.iterrows()}
    time.sleep(API_SLEEP_SECONDS)
    form_by_id = build_form()

    rows = []
    for t in static_teams.get_teams():
        st = by_id.get(t["id"])
        primary, secondary = TEAM_COLORS.get(t["abbreviation"], (None, None))
        rows.append({
            "id": t["id"],
            "name": t["full_name"],
            "abbreviation": t["abbreviation"],
            "conference": clean(st["Conference"]) if st is not None else None,
            "division": clean(st["Division"]) if st is not None else None,
            "primary_color": primary,
            "secondary_color": secondary,
            "wins": to_int(st["WINS"]) or 0 if st is not None else 0,
            "losses": to_int(st["LOSSES"]) or 0 if st is not None else 0,
            "conf_rank": to_int(st["PlayoffRank"]) if st is not None else None,
            "standings_extra": build_standings_extra(st, form_by_id.get(t["id"], [])),
        })
    return rows


def build_players(team_ids: set[int]) -> list[dict]:
    df = playerindex.PlayerIndex(historical_nullable=0, active_nullable=1, timeout=TIMEOUT).get_data_frames()[0]

    rows = []
    for _, r in df.iterrows():
        team_id = to_int(r["TEAM_ID"])
        rows.append({
            "id": int(r["PERSON_ID"]),
            # Agentes libres llevan team_id 0, que no existe en `teams`
            "team_id": team_id if team_id in team_ids else None,
            "full_name": f"{r['PLAYER_FIRST_NAME']} {r['PLAYER_LAST_NAME']}".strip(),
            "position": clean(r["POSITION"]),
            "height": height_to_meters(r["HEIGHT"]),
            "weight": weight_to_kg(r["WEIGHT"]),
            "country": clean(r["COUNTRY"]),
            "draft_year": to_int(r["DRAFT_YEAR"]),
            "draft_number": to_int(r["DRAFT_NUMBER"]),
            "is_active": True,
        })
    return rows


def add_birthdates(players: list[dict]) -> None:
    for i, p in enumerate(players, 1):
        time.sleep(API_SLEEP_SECONDS)
        try:
            info = commonplayerinfo.CommonPlayerInfo(player_id=p["id"], timeout=TIMEOUT).get_data_frames()[0]
            birth = clean(info.at[0, "BIRTHDATE"])
            p["birth_date"] = birth[:10] if birth else None
        except Exception as exc:  # un jugador fallido no debe abortar el resto
            print(f"  ! birth_date de {p['full_name']} ({p['id']}): {exc}")
        if i % 50 == 0:
            print(f"  birth_date {i}/{len(players)}")


def upsert(client, table: str, rows: list[dict]) -> None:
    for i in range(0, len(rows), BATCH_SIZE):
        client.table(table).upsert(rows[i:i + BATCH_SIZE], on_conflict="id").execute()


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")  # nombres como "Jokić" en consolas cp1252
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dry-run", action="store_true", help="no escribe en Supabase")
    parser.add_argument("--birthdates", action="store_true", help="descarga también birth_date (lento)")
    args = parser.parse_args()

    print("Descargando equipos...")
    teams = build_teams()
    print(f"  {len(teams)} equipos")

    time.sleep(API_SLEEP_SECONDS)
    print("Descargando jugadores activos...")
    players = build_players({t["id"] for t in teams})
    print(f"  {len(players)} jugadores activos")

    if args.birthdates:
        print("Descargando fechas de nacimiento...")
        add_birthdates(players)

    if args.dry_run:
        print("\n[dry-run] Ejemplo equipo:", teams[0])
        print("[dry-run] Ejemplo jugador:", players[0])
        return

    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        sys.exit("Faltan SUPABASE_URL y/o SUPABASE_KEY en backend-data/.env")

    from supabase import create_client

    client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    upsert(client, "teams", teams)  # primero equipos: players.team_id los referencia
    upsert(client, "players", players)

    n_teams = client.table("teams").select("id", count="exact").limit(1).execute().count
    n_players = client.table("players").select("id", count="exact").limit(1).execute().count
    print(f"\nSupabase -> teams: {n_teams} filas, players: {n_players} filas")


if __name__ == "__main__":
    main()
