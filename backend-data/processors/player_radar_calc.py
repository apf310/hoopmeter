"""Tarea 2.1 — Percentiles 0-99 del radar de 6 atributos de cada jugador.

Las métricas de cada jugador salen de los boxscores guardados (`player_game_stats`, Tarea 5.2b:
stats.nba.com bloquea la nube), con las mismas claves que LeagueDashPlayerStats Base + Advanced, y se
guarda en `players.radar_attributes`:

    {"season": "2025-26", "scoring": 91, "shooting": 64, "playmaking": 99,
     "defense": 72, "rebounding": 97, "efficiency": 95,
     "qualified": true, "games_played": 70, "updated_at": "..."}

Cada atributo combina varias métricas: se calcula el percentil de cada métrica, se hace
la media ponderada y se vuelve a convertir en percentil. Las referencias son los jugadores
cualificados (suficientes partidos y minutos); los demás se sitúan sobre esa misma
distribución con `qualified: false`. Si la temporada lleva menos de 10 partidos
se usa la anterior (salvo que se pase --season).

Uso (desde backend-data/):
    python -m processors.player_radar_calc                    # temporada actual
    python -m processors.player_radar_calc --season 2026-27
    python -m processors.player_radar_calc --dry-run          # muestra el top sin escribir
    python -m processors.player_radar_calc --official         # métricas de stats.nba.com (solo desde un PC)
"""
import argparse
import sys
import time
from datetime import datetime, timezone

import numpy as np
import pandas as pd
from nba_api.stats.endpoints import leaguedashplayerstats
from nba_api.stats.library.parameters import Season

from config import API_SLEEP_SECONDS, SUPABASE_SERVICE_KEY, SUPABASE_URL
from extractors.fetch_teams_players import upsert

TIMEOUT = 60
PAGE_SIZE = 1000
MIN_SEASON_GAMES = 10      # por debajo, la temporada es demasiado ruidosa: se usa la anterior
QUALIFY_GP_SHARE = 0.4     # cualificado: >= 40% de los partidos del líder en GP...
QUALIFY_MIN = 12.0         # ...y >= 12 minutos por partido
MIN_FG3A = 1.0             # el % de triples solo cuenta con >= 1 intento por partido

# atributo -> [(métrica, peso, más_alto_es_mejor)]
CATEGORIES = {
    "scoring":    [("PTS", 0.7, True), ("USG_PCT", 0.3, True)],
    "shooting":   [("FG3M", 0.5, True), ("FG3_PCT_ADJ", 0.5, True)],
    "playmaking": [("AST", 0.6, True), ("AST_PCT", 0.4, True)],
    "defense":    [("STL", 0.35, True), ("BLK", 0.35, True), ("DEF_RATING", 0.3, False)],
    "rebounding": [("REB", 0.6, True), ("REB_PCT", 0.4, True)],
    "efficiency": [("TS_PCT", 0.6, True), ("PIE", 0.4, True)],
}
ADVANCED_COLS = ["USG_PCT", "AST_PCT", "REB_PCT", "DEF_RATING", "TS_PCT", "PIE"]


def previous_season(season: str) -> str:
    start = int(season[:4]) - 1
    return f"{start}-{(start + 1) % 100:02d}"


def fetch_league(season: str) -> pd.DataFrame:
    def dash(measure: str) -> pd.DataFrame:
        return leaguedashplayerstats.LeagueDashPlayerStats(
            season=season, measure_type_detailed_defense=measure,
            per_mode_detailed="PerGame", timeout=TIMEOUT,
        ).get_data_frames()[0]

    base = dash("Base")
    time.sleep(API_SLEEP_SECONDS)
    adv = dash("Advanced")
    time.sleep(API_SLEEP_SECONDS)
    return base.merge(adv[["PLAYER_ID", *ADVANCED_COLS]], on="PLAYER_ID", how="left")


def percentile_vs(values: pd.Series, pool: np.ndarray) -> np.ndarray:
    """Percentil (0-1) de cada valor respecto a la distribución `pool` (rango medio en empates)."""
    pool = np.sort(pool)
    lo = np.searchsorted(pool, values.to_numpy(), side="left")
    hi = np.searchsorted(pool, values.to_numpy(), side="right")
    return (lo + hi) / 2 / len(pool)


def compute_radar(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df["FG3_PCT_ADJ"] = df["FG3_PCT"].where(df["FG3A"] >= MIN_FG3A, 0.0)
    max_gp = df["GP"].max()
    df["qualified"] = (df["GP"] >= max(1, QUALIFY_GP_SHARE * max_gp)) & (df["MIN"] >= QUALIFY_MIN)
    qualified = df["qualified"].to_numpy()

    for category, metrics in CATEGORIES.items():
        composite = np.zeros(len(df))
        for metric, weight, higher_is_better in metrics:
            values = df[metric].astype(float) * (1 if higher_is_better else -1)
            values = values.fillna(-np.inf)  # sin dato = peor posible
            composite += weight * percentile_vs(values, values[qualified].to_numpy())
        composite = pd.Series(composite, index=df.index)
        df[category] = np.round(percentile_vs(composite, composite[qualified].to_numpy()) * 99).astype(int)
    return df


def radar_payload(r, season: str, updated_at: str) -> dict:
    return {
        "season": season,
        **{category: int(r[category]) for category in CATEGORIES},
        "qualified": bool(r["qualified"]),
        "games_played": int(r["GP"]),
        "updated_at": updated_at,
    }


def fetch_league_from_boxscores(client, season: str) -> pd.DataFrame:
    """Mismas columnas que `fetch_league`, calculadas con los boxscores guardados de la temporada."""
    from db import select_all
    from processors import season_stats

    games = select_all(client, "player_game_stats", "*", lambda q: q.eq("season_id", season))
    teams = select_all(client, "team_game_stats", "*", lambda q: q.eq("season_id", season))
    seasons = season_stats.aggregate(games)
    rows = season_stats.season_frame_rows(seasons, season, season_stats.group_team_games(teams))
    if not rows:
        return pd.DataFrame()
    df = pd.DataFrame(rows)
    names = load_player_names(client)
    df["PLAYER_NAME"] = df["PLAYER_ID"].map(lambda pid: names.get(int(pid), str(pid)))
    return df


def load_player_names(client) -> dict[int, str]:
    names, start = {}, 0
    while True:
        page = (client.table("players").select("id, full_name")
                .order("id").range(start, start + PAGE_SIZE - 1).execute().data)
        names.update({p["id"]: p["full_name"] for p in page})
        if len(page) < PAGE_SIZE:
            return names
        start += PAGE_SIZE


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--season", help="temporada 'YYYY-YY' (por defecto la actual)")
    parser.add_argument("--dry-run", action="store_true", help="no escribe en Supabase")
    parser.add_argument("--official", action="store_true", help="métricas de stats.nba.com (bloquea la nube: solo desde un PC)")
    args = parser.parse_args()

    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        sys.exit("Faltan SUPABASE_URL y/o SUPABASE_KEY en backend-data/.env")
    from supabase import create_client

    client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    if args.official:
        season = args.season or Season.default
        load = fetch_league
    else:
        from processors.season_stats_calc import current_season

        season = args.season or current_season(client)
        if season is None:
            print("Sin partidos terminados: el radar no cambia")
            return
        load = lambda s: fetch_league_from_boxscores(client, s)  # noqa: E731

    print(f"Estadísticas de la liga {season}{' (stats.nba.com)' if args.official else ' (boxscores)'}...")
    df = load(season)
    if not args.season and (df.empty or df["GP"].max() < MIN_SEASON_GAMES):
        season = previous_season(season)
        print(f"  pocos partidos jugados: se usa la temporada {season}")
        df = load(season)
    if df.empty:
        # Sin datos (p. ej. la temporada anterior a la Tarea 5.2b): se conserva el radar guardado
        print(f"Sin estadísticas para {season}: el radar no cambia")
        return

    df = compute_radar(df)
    print(f"  {len(df)} jugadores · {int(df['qualified'].sum())} cualificados")

    if args.dry_run:
        top = df[df["qualified"]].sort_values("PTS", ascending=False).head(10)
        print("\n[dry-run] Top 10 anotadores:")
        print(top[["PLAYER_NAME", "GP", *CATEGORIES]].to_string(index=False))
        return

    names = load_player_names(client)
    updated_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    # full_name va incluido porque el upsert valida NOT NULL antes de resolver el conflicto
    rows = [
        {"id": int(r["PLAYER_ID"]), "full_name": names[int(r["PLAYER_ID"])],
         "radar_attributes": radar_payload(r, season, updated_at)}
        for _, r in df.iterrows() if int(r["PLAYER_ID"]) in names
    ]
    upsert(client, "players", rows)
    print(f"\nSupabase -> radar actualizado en {len(rows)} jugadores ({len(df) - len(rows)} sin ficha en `players`)")


if __name__ == "__main__":
    main()
