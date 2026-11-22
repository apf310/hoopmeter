"""Tarea 2.1 — Percentiles 0-99 del radar de 6 atributos de cada jugador.

Las métricas de cada jugador salen de los boxscores guardados (`player_game_stats`, Tarea 5.2b:
stats.nba.com bloquea la nube), con las mismas claves que LeagueDashPlayerStats Base + Advanced, y se
guarda en `players.radar_attributes`:

    {"season": "2025-26", "scoring": 91, "shooting": 64, "playmaking": 99,
     "defense": 72, "rebounding": 97, "efficiency": 95, "overall": 98,
     "qualified": true, "games_played": 70, "minutes": 2436, "updated_at": "..."}

Tarea 6.19 — lo más justo y objetivo posible, siempre la temporada frente a los jugadores actuales:
- Cada atributo combina varias métricas (percentil de cada una o, en defensa, desviaciones típicas)
  con su media ponderada, que se vuelve a convertir en percentil.
- La escala la marcan los jugadores de rotación (40 % de los partidos y 15+ minutos); los demás se
  sitúan sobre ella con `qualified: false`, sin media, y la ficha avisa de la muestra corta.
- Defensa = robos + tapones en desviaciones típicas, como el comparador (Tarea 6.4). DEF_RATING
  medía sobre todo al equipo: Holmgren, del Quinteto Defensivo de 2025-26, era el 35.º.
- Los porcentajes (triples, TS%) se acercan a la media de la liga según los intentos (Bayes
  empírico, `PRIOR_*`): con 15 triples un 13 % o un 54 % no dicen casi nada.
- `overall` ("Media") = percentil del Game Score por partido (Hollinger, público). La media de los
  4 mejores atributos subía a los pívots de rol (rebote, eficiencia y tapones van juntos): con
  2024-25 y 2025-26, Game Score coloca a los All-NBA igual o mejor y deja a Hartenstein o Allen
  por detrás de LeBron o Brunson.
Si la temporada lleva menos de 10 partidos se usa la anterior (salvo que se pase --season).

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
QUALIFY_GP_SHARE = 0.4     # en la escala: >= 40% de los partidos del líder en GP...
QUALIFY_MIN = 15.0         # ...y >= 15 minutos por partido (la rotación; como el comparador)
MIN_FG3A = 1.0             # el % de triples solo cuenta con >= 1 intento por partido
# Fuerza del prior hacia la media de la liga, en intentos (Bayes empírico por método de momentos con
# los jugadores de rotación: 311 y 324 triples, 163 y 160 tiros en 2024-25 y 2025-26)
PRIOR_FG3A = 320
PRIOR_TSA = 160

# atributo -> (cómo se combinan, [(métrica, peso)]). "percentile": percentil de cada métrica;
# "spread": desviaciones típicas sin techo (un récord de tapones no vale lo mismo que ser el 1 % mejor).
CATEGORIES = {
    "scoring":    ("percentile", [("PTS", 0.7), ("USG_PCT", 0.3)]),
    "shooting":   ("percentile", [("FG3M", 0.5), ("FG3_PCT_ADJ", 0.5)]),
    "playmaking": ("percentile", [("AST", 0.6), ("AST_PCT", 0.4)]),
    "defense":    ("spread", [("STL", 0.5), ("BLK", 0.5)]),
    "rebounding": ("percentile", [("REB", 0.6), ("REB_PCT", 0.4)]),
    "efficiency": ("percentile", [("TS_PCT_ADJ", 0.6), ("PIE", 0.4)]),
}
ADVANCED_COLS = ["USG_PCT", "AST_PCT", "REB_PCT", "TS_PCT", "PIE"]


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


def shrink(made: pd.Series, attempts: pd.Series, prior: float, pool: np.ndarray) -> pd.Series:
    """Porcentaje acercado a la media de la liga (`pool` = jugadores de la escala) con `prior` intentos ficticios."""
    league = made[pool].sum() / attempts[pool].sum()
    return (made + prior * league) / (attempts + prior)


def game_score(df: pd.DataFrame) -> pd.Series:
    """Game Score de Hollinger por partido (es lineal: vale con los promedios)."""
    return (df["PTS"] + 0.4 * df["FGM"] - 0.7 * df["FGA"] - 0.4 * (df["FTA"] - df["FTM"])
            + 0.7 * df["OREB"] + 0.3 * df["DREB"] + df["STL"] + 0.7 * df["AST"] + 0.7 * df["BLK"]
            - 0.4 * df["PF"] - df["TOV"])


def to_scale(values: pd.Series, pool: np.ndarray) -> np.ndarray:
    """Percentil 0-99 frente a los jugadores de la escala."""
    return np.round(percentile_vs(values, values[pool].to_numpy()) * 99).astype(int)


def compute_radar(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    max_gp = df["GP"].max()
    df["qualified"] = (df["GP"] >= max(1, QUALIFY_GP_SHARE * max_gp)) & (df["MIN"] >= QUALIFY_MIN)
    pool = df["qualified"].to_numpy()

    fg3a = df["FG3A"] * df["GP"]
    fg3_pct = shrink(df["FG3M"] * df["GP"], fg3a, PRIOR_FG3A, pool)
    df["FG3_PCT_ADJ"] = fg3_pct.where(df["FG3A"] >= MIN_FG3A, 0.0)
    tsa = (df["FGA"] + 0.44 * df["FTA"]) * df["GP"]
    df["TS_PCT_ADJ"] = shrink(df["PTS"] * df["GP"] / 2, tsa, PRIOR_TSA, pool)

    for category, (how, metrics) in CATEGORIES.items():
        composite = np.zeros(len(df))
        for metric, weight in metrics:
            values = df[metric].astype(float)
            if how == "spread":
                ref = values[pool]
                score = ((values - ref.mean()) / ref.std(ddof=0)).fillna(ref.min())
            else:
                score = percentile_vs(values.fillna(-np.inf), values[pool].fillna(-np.inf).to_numpy())  # sin dato = peor posible
            composite += weight * np.asarray(score, dtype=float)
        df[category] = to_scale(pd.Series(composite, index=df.index), pool)

    df["GAME_SCORE"] = game_score(df)
    df["overall"] = to_scale(df["GAME_SCORE"], pool)
    return df


def radar_payload(r, season: str, updated_at: str) -> dict:
    return {
        "season": season,
        **{category: int(r[category]) for category in CATEGORIES},
        # Fuera de la escala no hay media: su percentil frente a la rotación (1-5) solo diría "juega poco"
        "overall": int(r["overall"]) if r["qualified"] else None,
        "qualified": bool(r["qualified"]),
        "games_played": int(r["GP"]),
        "minutes": int(round(r["MIN"] * r["GP"])),
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
        top = df[df["qualified"]].sort_values("GAME_SCORE", ascending=False).head(25)
        print("\n[dry-run] Top 25 por media:")
        print(top[["PLAYER_NAME", "GP", *CATEGORIES, "overall"]].to_string(index=False))
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
