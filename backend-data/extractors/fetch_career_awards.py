"""Tarea 2.1 — Trayectoria temporada a temporada y palmarés de los jugadores activos.

Llena `player_season_stats` (Regular Season y Playoffs, promedios por partido) y
`player_awards` (premios relevantes, sin los semanales/mensuales).

- Temporadas con traspaso: se guarda la fila combinada (TOT) porque el id
  "{player_id}_{season_id}_{season_type}" no distingue equipo; `team_id` es el último
  equipo de esa temporada y el desglose va en `advanced_stats.teams`.
- Fila de carrera: season_id = "Career" con los promedios totales y, en Regular Season,
  los récords personales en `advanced_stats.career_highs`.
- Tarea 5.2b: cada fila guarda también sus totales exactos en `totals`, y la de carrera, en
  `totals.history`, los de las temporadas anteriores a la actual. Con ellos `season_stats_calc.py`
  mantiene la carrera al día desde GitHub Actions sin volver a pedir nada a stats.nba.com.

stats.nba.com bloquea la nube: este script solo funciona desde un PC. Ya no hace falta programarlo;
basta con ejecutarlo de vez en cuando para los premios (All-Star en febrero, premios en mayo, campeón
en junio) y para los veteranos que lleguen nuevos a la base de datos ("pending_history").

Uso (desde backend-data/):
    python -m extractors.fetch_career_awards                       # todos los activos (~40 min)
    python -m extractors.fetch_career_awards --resume              # solo los que aún no están guardados
    python -m extractors.fetch_career_awards --player-id 2544 --player-id 203999  # jugadores concretos
    python -m extractors.fetch_career_awards --limit 20 --dry-run  # prueba sin escribir
    python -m extractors.fetch_career_awards --totals-only         # solo los totales (carga inicial, ~15 min)
    python -m extractors.fetch_career_awards --totals-only --resume  # los que aún no tienen totales

Si stats.nba.com empieza a bloquear (varios jugadores seguidos fallan), el script se
detiene solo: espera un rato (15-30 min) y relánzalo con --resume.
"""
import argparse
import re
import sys
import time

from nba_api.stats.endpoints import playerawards, playercareerstats
from nba_api.stats.library.parameters import Season
from nba_api.stats.static import teams as static_teams
from requests.exceptions import RequestException

from config import API_SLEEP_SECONDS, SUPABASE_SERVICE_KEY, SUPABASE_URL
from extractors.fetch_teams_players import clean, to_int, upsert

TIMEOUT = 60
RETRIES = 3
PAGE_SIZE = 1000
# Jugadores fallidos seguidos a partir de los cuales se asume bloqueo de stats.nba.com
MAX_CONSECUTIVE_FAILS = 3

SEASON_TYPES = {
    "Regular Season": ("SeasonTotalsRegularSeason", "CareerTotalsRegularSeason"),
    "Playoffs": ("SeasonTotalsPostSeason", "CareerTotalsPostSeason"),
}

# Premios que no van a la vitrina (decenas de filas por estrella y poco valor visual)
EXCLUDED_AWARDS = re.compile(r"of the Week|of the Month|Sporting News", re.IGNORECASE)
# Premios por quintetos: se añade el número de equipo ("All-NBA 1st Team")
TEAM_AWARDS = {"All-NBA": "All-NBA", "All-Defensive Team": "All-Defensive", "All-Rookie Team": "All-Rookie"}
ORDINALS = {1: "1st", 2: "2nd", 3: "3rd"}


def nba_call(endpoint, **kwargs) -> dict:
    """Llama a un endpoint de stats.nba.com con reintentos; devuelve {dataset: DataFrame}."""
    for attempt in range(1, RETRIES + 1):
        try:
            ep = endpoint(timeout=TIMEOUT, **kwargs)
            return dict(zip(ep.get_available_data(), ep.get_data_frames()))
        except KeyError as exc:
            # La NBA responde "{}" cuando no tiene datos del jugador: no tiene sentido reintentar
            if exc.args == ("resultSet",):
                return {}
            raise
        except Exception as exc:
            if attempt == RETRIES:
                raise
            print(f"  ~ reintento {attempt}/{RETRIES - 1} tras error: {exc}")
            time.sleep(5 * attempt)


def num(value, digits: int = 1):
    value = clean(value)
    return None if value is None else round(float(value), digits)


def true_shooting(r):
    """TS% = PTS / (2 * (FGA + 0.44 * FTA)); válido también con promedios por partido."""
    pts, fga, fta = clean(r.get("PTS")), clean(r.get("FGA")), clean(r.get("FTA"))
    if pts is None or fga is None or fta is None:
        return None
    denom = 2 * (float(fga) + 0.44 * float(fta))
    return round(float(pts) / denom, 3) if denom > 0 else None


def stats_row(player_id: int, season_id: str, season_type: str, r, team_id, extra: dict) -> dict:
    return {
        "id": f"{player_id}_{season_id}_{season_type}",
        "player_id": player_id,
        "season_id": season_id,
        "team_id": team_id,
        "season_type": season_type,
        "games_played": to_int(r.get("GP")),
        "pts": num(r.get("PTS")),
        "reb": num(r.get("REB")),
        "ast": num(r.get("AST")),
        "fg_pct": num(r.get("FG_PCT"), 3),
        "fg3_pct": num(r.get("FG3_PCT"), 3),
        "advanced_stats": {
            "gs": to_int(r.get("GS")),
            "min": num(r.get("MIN")),
            "stl": num(r.get("STL")),
            "blk": num(r.get("BLK")),
            "tov": num(r.get("TOV")),
            "fg3m": num(r.get("FG3M")),
            "fg3a": num(r.get("FG3A")),
            "ft_pct": num(r.get("FT_PCT"), 3),
            "ts_pct": true_shooting(r),
            **extra,
        },
    }


# Totales exactos (`player_season_stats.totals`) -> columna de PlayerCareerStats en modo Totals
TOTALS_COLUMNS = {"gp": "GP", "gs": "GS", "min": "MIN", "pts": "PTS", "fgm": "FGM", "fga": "FGA", "fg3m": "FG3M",
                  "fg3a": "FG3A", "ftm": "FTM", "fta": "FTA", "oreb": "OREB", "dreb": "DREB", "reb": "REB",
                  "ast": "AST", "stl": "STL", "blk": "BLK", "tov": "TOV", "pf": "PF"}


def totals_of(r) -> dict:
    out = {}
    for key, column in TOTALS_COLUMNS.items():
        value = clean(r.get(column))
        out[key] = None if value is None else (round(float(value), 2) if key == "min" else int(round(float(value))))
    return out


def subtract_totals(a: dict, b: dict) -> dict:
    """a - b campo a campo (desconocido si falta en cualquiera)."""
    out = {}
    for key in TOTALS_COLUMNS:
        if a.get(key) is None or b.get(key) is None:
            out[key] = None
        else:
            out[key] = round(a[key] - b[key], 2) if key == "min" else a[key] - b[key]
    return out


def previous_season(season: str) -> str:
    start = int(season[:4]) - 1
    return f"{start}-{(start + 1) % 100:02d}"


def build_totals(player_id: int, current_season: str) -> dict[str, dict]:
    """{id de fila: totales} de cada temporada (la combinada si hubo traspaso) y de la carrera, con su
    historial (carrera menos la temporada en curso) para que la carrera se pueda mantener sumando."""
    data = nba_call(playercareerstats.PlayerCareerStats, player_id=player_id, per_mode36="Totals")
    out = {}
    for season_type, (seasons_key, career_key) in SEASON_TYPES.items():
        current = None
        df = data.get(seasons_key)
        if df is not None and not df.empty:
            for season_id, group in df.groupby("SEASON_ID", sort=False):
                records = group.to_dict("records")
                row = next((r for r in records if not to_int(r["TEAM_ID"])), None) or records[-1]  # TOT si hubo traspaso
                totals = totals_of(row)
                out[f"{player_id}_{season_id}_{season_type}"] = totals
                if str(season_id) == current_season:
                    current = totals
        career = data.get(career_key)
        if career is not None and not career.empty and to_int(career.iloc[0].get("GP")):
            career_totals = totals_of(career.iloc[0].to_dict())
            history = subtract_totals(career_totals, current) if current else dict(career_totals)
            out[f"{player_id}_Career_{season_type}"] = {**career_totals, "history": history,
                                                        "history_through": previous_season(current_season)}
    return out


def season_rows(player_id: int, season_type: str, df, team_ids: set[int]) -> list[dict]:
    rows = []
    if df is None or df.empty:
        return rows
    for season_id, group in df.groupby("SEASON_ID", sort=False):
        records = group.to_dict("records")
        by_team = [r for r in records if to_int(r["TEAM_ID"])]
        total = next((r for r in records if not to_int(r["TEAM_ID"])), None)  # fila TOT
        base = total or by_team[-1]
        last_team = to_int(by_team[-1]["TEAM_ID"]) if by_team else None
        extra = {"team_abbreviation": clean(base.get("TEAM_ABBREVIATION")), "age": to_int(base.get("PLAYER_AGE"))}
        if total is not None:
            extra["teams"] = [{
                "team_id": to_int(r["TEAM_ID"]),
                "team_abbreviation": clean(r["TEAM_ABBREVIATION"]),
                "gp": to_int(r["GP"]),
                "pts": num(r["PTS"]),
                "reb": num(r["REB"]),
                "ast": num(r["AST"]),
            } for r in by_team]
        team_id = last_team if last_team in team_ids else None
        rows.append(stats_row(player_id, str(season_id), season_type, base, team_id, extra))
    return rows


def career_highs(df) -> dict:
    """{'PTS': {'value': 61, 'date': '2019-03-22', 'vs': 'SAS', 'game_id': ...}, ...}
    Ante empates se queda con el más reciente (la API los devuelve primero)."""
    highs = {}
    if df is None or df.empty:
        return highs
    for r in df.to_dict("records"):
        stat = clean(r.get("STAT"))
        if not stat or stat in highs:  # filas de relleno sin estadística en jugadores con pocos partidos
            continue
        date = clean(r.get("DATE_EST"))
        highs[stat] = {
            # La API usa STAT_VALUE o STATS_VALUE según el jugador
            "value": to_int(r.get("STAT_VALUE", r.get("STATS_VALUE"))),
            "date": date[:10] if date else None,
            "vs": clean(r.get("VS_TEAM_ABBREVIATION")),
            "game_id": clean(r.get("GAME_ID")),
        }
    return highs


def build_stats(player_id: int, team_ids: set[int], totals: dict[str, dict] | None = None) -> list[dict]:
    data = nba_call(playercareerstats.PlayerCareerStats, player_id=player_id, per_mode36="PerGame")
    rows = []
    for season_type, (seasons_key, career_key) in SEASON_TYPES.items():
        rows += season_rows(player_id, season_type, data.get(seasons_key), team_ids)
        career = data.get(career_key)
        if career is not None and not career.empty and to_int(career.iloc[0].get("GP")):
            extra = {"career_highs": career_highs(data.get("CareerHighs"))} if season_type == "Regular Season" else {}
            rows.append(stats_row(player_id, "Career", season_type, career.iloc[0].to_dict(), None, extra))
    if totals is not None:
        for row in rows:
            row["totals"] = totals.get(row["id"])
    return rows


def award_name(r) -> str | None:
    description = clean(r["DESCRIPTION"])
    if not description or EXCLUDED_AWARDS.search(description):
        return None
    if description in TEAM_AWARDS:
        number = to_int(r["ALL_NBA_TEAM_NUMBER"]) if str(r["ALL_NBA_TEAM_NUMBER"]).strip().isdigit() else None
        if number in ORDINALS:
            return f"{TEAM_AWARDS[description]} {ORDINALS[number]} Team"
    return description


def build_awards(player_id: int) -> list[dict]:
    df = nba_call(playerawards.PlayerAwards, player_id=player_id).get("PlayerAwards")
    rows, seen = [], set()
    if df is None or df.empty:
        return rows
    for r in df.to_dict("records"):
        name = award_name(r)
        season = clean(r.get("SEASON"))
        if name is None or (name, season) in seen:
            continue
        seen.add((name, season))
        rows.append({"player_id": player_id, "award_name": name, "season": season})
    return rows


def load_active_players(client, columns: str = "id, full_name") -> list[dict]:
    players, start = [], 0
    while True:
        page = (client.table("players").select(columns).eq("is_active", True)
                .order("id").range(start, start + PAGE_SIZE - 1).execute().data)
        players += page
        if len(page) < PAGE_SIZE:
            return players
        start += PAGE_SIZE


def load_processed_ids(client, with_totals: bool = False) -> set[int]:
    """Jugadores ya guardados: los que tienen su fila de carrera de Regular Season (con totales si se pide)."""
    ids, start = set(), 0
    while True:
        query = (client.table("player_season_stats").select("player_id")
                 .eq("season_id", "Career").eq("season_type", "Regular Season"))
        if with_totals:
            query = query.not_.is_("totals", "null")
        page = query.order("player_id").range(start, start + PAGE_SIZE - 1).execute().data
        ids.update(r["player_id"] for r in page)
        if len(page) < PAGE_SIZE:
            return ids
        start += PAGE_SIZE


def load_row_ids(client, player_id: int) -> set[str]:
    return {r["id"] for r in client.table("player_season_stats").select("id").eq("player_id", player_id).execute().data}


def save_totals(client, player_id: int, totals: dict[str, dict]) -> int:
    """Solo añade `totals` a filas que ya existen (nunca crea filas sin promedios)."""
    existing = load_row_ids(client, player_id)
    rows = []
    for row_id, value in totals.items():
        if row_id not in existing:
            continue
        _, season_id, season_type = row_id.split("_", 2)
        rows.append({"id": row_id, "player_id": player_id, "season_id": season_id, "season_type": season_type, "totals": value})
    if rows:
        upsert(client, "player_season_stats", rows)
    return len(rows)


def save_player(client, player_id: int, stats: list[dict], awards: list[dict]) -> None:
    if stats:
        upsert(client, "player_season_stats", stats)
    # player_awards no tiene clave natural única: se reemplaza el palmarés completo
    client.table("player_awards").delete().eq("player_id", player_id).execute()
    if awards:
        client.table("player_awards").insert(awards).execute()


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--player-id", type=int, action="append", help="procesa solo este jugador (repetible)")
    parser.add_argument("--limit", type=int, help="procesa como mucho N jugadores")
    parser.add_argument("--dry-run", action="store_true", help="no escribe en Supabase")
    parser.add_argument("--resume", action="store_true", help="salta los jugadores que ya están guardados")
    parser.add_argument("--totals-only", action="store_true", help="solo los totales exactos de las filas ya guardadas")
    args = parser.parse_args()
    current_season = Season.current_season

    client = None
    if not args.dry_run or not args.player_id:
        if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
            sys.exit("Faltan SUPABASE_URL y/o SUPABASE_KEY en backend-data/.env")
        from supabase import create_client

        client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    if args.player_id:
        players = [{"id": pid, "full_name": str(pid)} for pid in args.player_id]
    else:
        players = load_active_players(client)
    if args.resume:
        done = load_processed_ids(client, with_totals=args.totals_only)
        players = [p for p in players if p["id"] not in done]
        print(f"--resume: {len(done)} jugadores ya guardados, se saltan")
    if args.limit:
        players = players[:args.limit]

    team_ids = {t["id"] for t in static_teams.get_teams()}
    print(f"Procesando trayectoria y palmarés de {len(players)} jugadores...")

    failed, n_stats, n_awards, consecutive = [], 0, 0, 0
    blocked = interrupted = False
    try:
        for i, p in enumerate(players, 1):
            try:
                totals = build_totals(p["id"], current_season)
                time.sleep(API_SLEEP_SECONDS)
                if args.totals_only:
                    if args.dry_run:
                        if i == 1:
                            print("\n[dry-run] Totales:", {k: v for k, v in totals.items() if "Career" in k})
                    else:
                        n_stats += save_totals(client, p["id"], totals)
                    consecutive = 0
                    if i % 25 == 0:
                        print(f"  {i}/{len(players)}")
                    continue
                stats = build_stats(p["id"], team_ids, totals)
                time.sleep(API_SLEEP_SECONDS)
                awards = build_awards(p["id"])
                time.sleep(API_SLEEP_SECONDS)
                if args.dry_run:
                    if i == 1:
                        print("\n[dry-run] Ejemplo temporada:", stats[-3] if len(stats) >= 3 else stats)
                        print("[dry-run] Ejemplo carrera:", next((s for s in stats if s["season_id"] == "Career"), None))
                        print("[dry-run] Premios:", awards, "\n")
                else:
                    save_player(client, p["id"], stats, awards)
                n_stats += len(stats)
                n_awards += len(awards)
                consecutive = 0
            except Exception as exc:  # un jugador fallido no debe abortar el resto
                failed.append(p["id"])
                print(f"  ! {p['full_name']} ({p['id']}): {exc!r}")
                # Varios fallos de red seguidos = stats.nba.com nos está bloqueando: seguir solo gasta tiempo
                consecutive = consecutive + 1 if isinstance(exc, RequestException) else 0
                if consecutive >= MAX_CONSECUTIVE_FAILS:
                    blocked = True
                    break
            if i % 25 == 0:
                print(f"  {i}/{len(players)}")
    except KeyboardInterrupt:
        interrupted = True

    print(f"\nFilas de temporada: {n_stats} · premios: {n_awards} · fallidos: {len(failed)}")
    if blocked:
        print(f"\nstats.nba.com está bloqueando las peticiones ({MAX_CONSECUTIVE_FAILS} jugadores seguidos fallidos).")
    if blocked or interrupted:
        print("Lo procesado está guardado. Espera 15-30 min y continúa con:")
        print("    python -m extractors.fetch_career_awards --resume")
    elif failed:
        print("Reintentar con: " + " ".join(f"--player-id {pid}" for pid in failed))
    if blocked:
        sys.exit(1)  # en GitHub Actions, el código 1 manda un aviso por email


if __name__ == "__main__":
    main()
