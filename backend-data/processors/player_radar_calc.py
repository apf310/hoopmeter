"""Tareas 2.1, 6.19 y 7.10 — Radar de 6 atributos y "Media" de cada jugador, de 40 a 99.

Las métricas de cada jugador salen de los boxscores guardados (`player_game_stats`, Tarea 5.2b:
stats.nba.com bloquea la nube), con las mismas claves que LeagueDashPlayerStats Base + Advanced, y se
guarda en `players.radar_attributes`:

    {"season": "2026-27", "scoring": 98, "shooting": 93, "playmaking": 98,
     "defense": 96, "rebounding": 86, "efficiency": 96, "overall": 99,
     "qualified": true, "games_played": 16, "minutes": 579, "updated_at": "..."}

Lo más justo y objetivo posible, siempre la temporada en curso frente a los jugadores actuales:
- Cada atributo combina varias métricas (percentil de cada una o, en defensa, desviaciones típicas)
  con su media ponderada (el "compuesto").
- Con pocos partidos, el compuesto y el Game Score se acercan a los de un suplente (percentil 30 de
  todos los que han jugado): pesa `GP / (GP + 4)` lo suyo. Así todo el que ha jugado tiene media
  (Tarea 7.10) y un buen partido suelto no lo sube arriba del todo: sube según juega.
- La escala la marcan los jugadores de rotación (40 % de los partidos y 15+ minutos, `qualified`):
  cada atributo = 40 + 59 · su percentil frente a ellos (40 el último, 99 el primero).
- `overall` ("Media") = 40 + 59 · (Game Score / ancla)^0,75: proporcional a lo que aporta por
  partido (Hollinger, público), no un percentil. El ancla es la media de los 3 mejores de la
  rotación y quien la supera se queda en 99: con "el mejor" de ancla, un MVP descomunal hundía a
  todos (2024-25: Jokić, 28,7 por partido, y solo 11 jugadores con 84+). Validado con 2023-24,
  2024-25 y 2025-26: los All-NBA, entre 79 y 99 (mediana 86-88), y 22-27 jugadores con 84+.
- Quien no ha jugado ningún partido de la temporada: atributos a 0 y sin media (nunca la del año
  pasado). Las leyendas no se tocan.
- Defensa = robos + tapones en desviaciones típicas, como el comparador (Tarea 6.4). DEF_RATING
  medía sobre todo al equipo: Holmgren, del Quinteto Defensivo de 2025-26, era el 35.º.
- Los porcentajes (triples, TS%) se acercan a la media de la liga según los intentos (Bayes
  empírico, `PRIOR_*`): con 15 triples un 13 % o un 54 % no dicen casi nada.
- Game Score y no la media de los 4 mejores atributos, que subía a los pívots de rol (rebote,
  eficiencia y tapones van juntos): con 2024-25 y 2025-26, Game Score coloca a los All-NBA igual o
  mejor y deja a Hartenstein o Allen por detrás de LeBron o Brunson.

Uso (desde backend-data/):
    python -m processors.player_radar_calc                    # temporada actual
    python -m processors.player_radar_calc --season 2025-26   # otra (sin tocar a quien no jugó)
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
QUALIFY_GP_SHARE = 0.4     # en la escala: >= 40% de los partidos del líder en GP...
QUALIFY_MIN = 15.0         # ...y >= 15 minutos por partido (la rotación; como el comparador)
MIN_FG3A = 1.0             # el % de triples solo cuenta con >= 1 intento por partido
# Fuerza del prior hacia la media de la liga, en intentos (Bayes empírico por método de momentos con
# los jugadores de rotación: 311 y 324 triples, 163 y 160 tiros en 2024-25 y 2025-26)
PRIOR_FG3A = 320
PRIOR_TSA = 160
# Tarea 7.10: escala de 40 a 99 para todo el que ha jugado
PRIOR_GAMES = 4            # con GP partidos pesa GP / (GP + 4) lo suyo y el resto, lo de un suplente
BENCH_PERCENTILE = 30      # "un suplente": el percentil 30 de todos los que han jugado
SCALE_MIN, SCALE_MAX = 40, 99
ANCHOR_TOP = 3             # el 99 de la media: la media de los 3 mejores de la rotación
CURVE = 0.75               # media = 40 + 59 · (Game Score / ancla)^0,75

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


def percentile_vs(values, pool) -> np.ndarray:
    """Percentil (0-1) de cada valor respecto a la distribución `pool` (rango medio en empates)."""
    values = np.asarray(values, dtype=float)
    pool = np.sort(np.asarray(pool, dtype=float))
    lo = np.searchsorted(pool, values, side="left")
    hi = np.searchsorted(pool, values, side="right")
    return (lo + hi) / 2 / len(pool)


def shrink(made: pd.Series, attempts: pd.Series, prior: float, pool: np.ndarray) -> pd.Series:
    """Porcentaje acercado a la media de la liga (`pool` = jugadores de la escala) con `prior` intentos ficticios."""
    league = made[pool].sum() / attempts[pool].sum()
    return (made + prior * league) / (attempts + prior)


def toward_bench(values, games) -> np.ndarray:
    """Acerca cada valor al de un suplente (percentil 30 de todos) según sus partidos: pesa GP / (GP + 4) lo suyo."""
    values, games = np.asarray(values, dtype=float), np.asarray(games, dtype=float)
    weight = games / (games + PRIOR_GAMES)
    return weight * values + (1 - weight) * np.percentile(values, BENCH_PERCENTILE)


def game_score(df: pd.DataFrame) -> pd.Series:
    """Game Score de Hollinger por partido (es lineal: vale con los promedios)."""
    return (df["PTS"] + 0.4 * df["FGM"] - 0.7 * df["FGA"] - 0.4 * (df["FTA"] - df["FTM"])
            + 0.7 * df["OREB"] + 0.3 * df["DREB"] + df["STL"] + 0.7 * df["AST"] + 0.7 * df["BLK"]
            - 0.4 * df["PF"] - df["TOV"])


def to_scale(values, pool: np.ndarray) -> np.ndarray:
    """Atributo de 40 (el último de la rotación) a 99 (el primero): 40 + 59 · percentil frente a la escala."""
    values = np.asarray(values, dtype=float)
    share = percentile_vs(values, values[pool])
    return np.round(SCALE_MIN + (SCALE_MAX - SCALE_MIN) * share).astype(int)


def overall_scale(score, pool: np.ndarray) -> np.ndarray:
    """Media de 40 a 99 proporcional a lo que aporta: 40 + 59 · (Game Score / ancla)^0,75, con tope en 99."""
    score = np.asarray(score, dtype=float)
    anchor = np.sort(score[pool])[::-1][:ANCHOR_TOP].mean()
    share = np.clip(score / anchor, 0, 1) if anchor > 0 else np.zeros(len(score))
    return np.round(SCALE_MIN + (SCALE_MAX - SCALE_MIN) * share ** CURVE).astype(int)


def compute_radar(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    max_gp = df["GP"].max()
    df["qualified"] = (df["GP"] >= max(1, QUALIFY_GP_SHARE * max_gp)) & (df["MIN"] >= QUALIFY_MIN)
    # Sin nadie en la rotación (un primer día raro), la escala son todos
    pool = df["qualified"].to_numpy() if df["qualified"].any() else np.ones(len(df), dtype=bool)
    games = df["GP"].to_numpy(dtype=float)

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
                score = percentile_vs(values.fillna(-np.inf), values[pool].fillna(-np.inf))  # sin dato = peor posible
            composite += weight * np.asarray(score, dtype=float)
        df[category] = to_scale(toward_bench(composite, games), pool)

    df["GAME_SCORE"] = game_score(df)
    df["GAME_SCORE_ADJ"] = toward_bench(df["GAME_SCORE"], games)
    df["overall"] = overall_scale(df["GAME_SCORE_ADJ"], pool)
    return df


def radar_payload(r, season: str, updated_at: str) -> dict:
    return {
        "season": season,
        **{category: int(r[category]) for category in CATEGORIES},
        "overall": int(r["overall"]),
        "qualified": bool(r["qualified"]),
        "games_played": int(r["GP"]),
        "minutes": int(round(r["MIN"] * r["GP"])),
        "updated_at": updated_at,
    }


def no_games_payload(season: str, updated_at: str) -> dict:
    """Sin partidos esta temporada: atributos a 0 y sin media, para que nunca quede el radar del año pasado."""
    return {
        "season": season,
        **{category: 0 for category in CATEGORIES},
        "overall": None,
        "qualified": False,
        "games_played": 0,
        "minutes": 0,
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
    names = {pid: p["full_name"] for pid, p in load_players(client).items()}
    df["PLAYER_NAME"] = df["PLAYER_ID"].map(lambda pid: names.get(int(pid), str(pid)))
    return df


def load_players(client) -> dict[int, dict]:
    """Nombre y si está en activo de cada jugador de `players`, por id."""
    players, start = {}, 0
    while True:
        page = (client.table("players").select("id, full_name, is_active")
                .order("id").range(start, start + PAGE_SIZE - 1).execute().data)
        players.update({p["id"]: p for p in page})
        if len(page) < PAGE_SIZE:
            return players
        start += PAGE_SIZE


def tier_counts(overall: pd.Series) -> str:
    """Jugadores por material de la carta (mismos cortes que `tierOf` en la web)."""
    cuts = [("84+", 84, 100), ("70-83", 70, 84), ("55-69", 55, 70), ("<55", 0, 55)]
    return " · ".join(f"{label}: {int(((overall >= lo) & (overall < hi)).sum())}" for label, lo, hi in cuts)


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
    else:
        from processors.season_stats_calc import current_season

        season = args.season or current_season(client)
        if season is None:
            print("Sin partidos terminados: el radar no cambia")
            return

    print(f"Estadísticas de la liga {season}{' (stats.nba.com)' if args.official else ' (boxscores)'}...")
    df = fetch_league(season) if args.official else fetch_league_from_boxscores(client, season)
    if df.empty:
        # Sin datos (p. ej. la temporada anterior a la Tarea 5.2b): se conserva el radar guardado
        print(f"Sin estadísticas para {season}: el radar no cambia")
        return

    df = compute_radar(df)
    players = load_players(client)
    played = {int(pid) for pid in df["PLAYER_ID"]}
    # Solo con la temporada en curso: otra temporada no dice nada de quién juega hoy
    idle = [] if args.season else sorted(pid for pid, p in players.items() if p["is_active"] and pid not in played)
    print(f"  {len(df)} jugadores · {int(df['qualified'].sum())} de rotación · {len(idle)} en activo sin jugar")
    print(f"  Media: {tier_counts(df['overall'])}")

    if args.dry_run:
        top = df.sort_values("GAME_SCORE_ADJ", ascending=False).head(25)
        print("\n[dry-run] Top 25 por media:")
        print(top[["PLAYER_NAME", "GP", *CATEGORIES, "overall"]].to_string(index=False))
        return

    updated_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    # full_name va incluido porque el upsert valida NOT NULL antes de resolver el conflicto
    rows = [
        {"id": int(r["PLAYER_ID"]), "full_name": players[int(r["PLAYER_ID"])]["full_name"],
         "radar_attributes": radar_payload(r, season, updated_at)}
        for _, r in df.iterrows() if int(r["PLAYER_ID"]) in players
    ]
    missing = len(df) - len(rows)
    rows += [{"id": pid, "full_name": players[pid]["full_name"], "radar_attributes": no_games_payload(season, updated_at)}
             for pid in idle]
    upsert(client, "players", rows)
    print(f"\nSupabase -> radar actualizado en {len(rows)} jugadores ({len(idle)} sin partidos; {missing} sin ficha en `players`)")


if __name__ == "__main__":
    main()
