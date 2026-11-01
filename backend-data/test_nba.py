import sys
import time

from nba_api.stats.endpoints import playercareerstats
from nba_api.stats.static import players, teams

from config import API_SLEEP_SECONDS


def show_teams() -> None:
    all_teams = teams.get_teams()
    print(f"=== {len(all_teams)} equipos de la NBA ===")
    for t in sorted(all_teams, key=lambda x: x["full_name"]):
        print(f"{t['id']:>12}  {t['abbreviation']:<4} {t['full_name']}")


def show_jokic_career() -> None:
    matches = players.find_players_by_full_name("Nikola Jokic")
    if not matches:
        print("No se encontró a Nikola Jokic")
        return
    jokic = matches[0]
    print(f"\n=== Carrera de {jokic['full_name']} (id {jokic['id']}) ===")

    time.sleep(API_SLEEP_SECONDS)
    career = playercareerstats.PlayerCareerStats(player_id=jokic["id"])
    df = career.get_data_frames()[0]
    cols = ["SEASON_ID", "TEAM_ABBREVIATION", "GP", "PTS", "REB", "AST", "FG_PCT", "FG3_PCT"]
    df = df[cols].copy()
    for c in ("PTS", "REB", "AST"):
        df[c] = (df[c] / df["GP"]).round(1)
    print(df.to_string(index=False))


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")  # "Jokić" falla en consolas cp1252 de Windows
    show_teams()
    show_jokic_career()
