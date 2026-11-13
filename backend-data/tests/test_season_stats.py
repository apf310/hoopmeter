"""Tests de las estadísticas calculadas con los boxscores (box_stats, season_stats, season_stats_calc),
sin red ni base de datos."""
import unittest
from datetime import date

from processors import box_stats as B
from processors import season_stats as S
from processors.season_stats_calc import resolve_history

STATS = ("points", "fieldGoalsMade", "fieldGoalsAttempted", "threePointersMade", "threePointersAttempted",
         "freeThrowsMade", "freeThrowsAttempted", "reboundsOffensive", "reboundsDefensive", "reboundsTotal",
         "assists", "steals", "blocks", "turnovers", "foulsPersonal")


def player(pid, minutes, pts=0, starter=False, plus=0, minus=0, **kw):
    s = dict.fromkeys(STATS, 0)
    s.update(points=pts, fieldGoalsMade=kw.get("fgm", 0), fieldGoalsAttempted=kw.get("fga", 0), reboundsTotal=kw.get("reb", 0),
             reboundsDefensive=kw.get("reb", 0), assists=kw.get("ast", 0), freeThrowsMade=kw.get("ftm", 0),
             freeThrowsAttempted=kw.get("fta", 0))
    s.update(minutes=f"PT{minutes}M00.00S", plus=float(plus), minus=float(minus), plusMinusPoints=float(plus - minus))
    return {"personId": pid, "name": f"Jugador {pid}", "played": "1", "starter": "1" if starter else "0", "statistics": s}


def team(tid, tricode, players, extra_turnovers=0):
    totals = {k: sum(p["statistics"][k] for p in players) for k in STATS}
    stats = {**totals, "reboundsPersonal": totals["reboundsTotal"], "minutes": "PT240M00.00S", "turnoversTeam": extra_turnovers}
    return {"teamId": tid, "teamTricode": tricode, "score": totals["points"], "players": players, "statistics": stats}


def box(game_id="0022600001", home_pts=(30, 20), away_pts=(25, 20), status=3, code="20261111/AAABBB"):
    """Partido sin prórroga: 5 jugadores por equipo con 48 minutos cada uno (240 en total)."""
    def five(base, pts):
        out = [player(base + i, 48, pts=pts[i] if i < len(pts) else 0, starter=True) for i in range(5)]
        for p in out:
            p["statistics"]["fieldGoalsMade"] = p["statistics"]["points"] // 2
            p["statistics"]["fieldGoalsAttempted"] = p["statistics"]["points"]
        return out
    home, away = five(100, home_pts), five(200, away_pts)
    diff = sum(home_pts) - sum(away_pts)
    for p in home:
        p["statistics"].update(plus=float(sum(home_pts)), minus=float(sum(away_pts)), plusMinusPoints=float(diff))
    for p in away:
        p["statistics"].update(plus=float(sum(away_pts)), minus=float(sum(home_pts)), plusMinusPoints=float(-diff))
    return {"gameId": game_id, "gameStatus": status, "gameCode": code, "regulationPeriods": 4, "period": 4,
            "homeTeam": team(1, "AAA", home), "awayTeam": team(2, "BBB", away)}


class BoxScoreRows(unittest.TestCase):
    def test_rows_and_metadata(self):
        players, teams, people = B.rows_from_box(box())
        self.assertEqual(len(players), 10)
        self.assertEqual(len(teams), 2)
        row = players[0]
        self.assertEqual((row["season_id"], row["game_type"], row["game_date"]), ("2026-27", "002", "2026-11-11"))
        self.assertEqual(row["seconds"], 48 * 60)
        self.assertEqual((teams[0]["is_home"], teams[0]["pts"], teams[1]["pts"]), (True, 50, 45))
        self.assertEqual(people[0], {"id": 100, "full_name": "Jugador 100", "team_id": 1})

    def test_rejects_unfinished_game(self):
        with self.assertRaises(B.BoxScoreError):
            B.rows_from_box(box(status=2))

    def test_rejects_points_not_adding_up(self):
        b = box()
        b["homeTeam"]["score"] += 2  # el marcador no es la suma de sus jugadores
        with self.assertRaises(B.BoxScoreError):
            B.rows_from_box(b)

    def test_rejects_missing_minutes(self):
        b = box()
        b["awayTeam"]["players"][0]["statistics"]["minutes"] = "PT20M00.00S"
        with self.assertRaises(B.BoxScoreError):
            B.rows_from_box(b)

    def official_from(self, b):
        """Página oficial de nba.com equivalente al boxscore de la CDN (mismas cifras, formato 'MM:SS')."""
        def team_of(t):
            players = []
            for p in t["players"]:
                s = {k: p["statistics"][k] for k in B.OFFICIAL_COUNTS}
                s["minutes"] = f"{int(B.clock_seconds(p['statistics']['minutes']) // 60)}:{int(B.clock_seconds(p['statistics']['minutes']) % 60):02d}"
                s["plusMinusPoints"] = int(p["statistics"]["plusMinusPoints"])
                players.append({"personId": p["personId"], "firstName": "J", "familyName": str(p["personId"]), "position": "F", "statistics": s})
            return {"teamId": t["teamId"], "score": t["score"], "players": players}
        return {"gameId": b["gameId"], "gameStatus": 3, "homeTeam": team_of(b["homeTeam"]), "awayTeam": team_of(b["awayTeam"])}

    def test_official_corrections_win(self):
        b = box()
        off = self.official_from(b)
        # Corrección: una canasta de 2 del jugador 100 era del 101
        p100, p101 = off["homeTeam"]["players"][0]["statistics"], off["homeTeam"]["players"][1]["statistics"]
        p100.update(points=p100["points"] - 2, fieldGoalsMade=p100["fieldGoalsMade"] - 1, fieldGoalsAttempted=p100["fieldGoalsAttempted"] - 1)
        p101.update(points=p101["points"] + 2, fieldGoalsMade=p101["fieldGoalsMade"] + 1, fieldGoalsAttempted=p101["fieldGoalsAttempted"] + 1)
        players, teams, _ = B.rows_from_box(B.apply_official(b, off))
        by_id = {r["player_id"]: r for r in players}
        self.assertEqual((by_id[100]["pts"], by_id[101]["pts"]), (28, 22))
        self.assertEqual(teams[0]["pts"], 50)
        self.assertEqual(by_id[100]["on_court_opp_pts"], 45)  # dato en pista de la CDN, intacto
        self.assertEqual(b["homeTeam"]["players"][0]["statistics"]["points"], 30)  # no modifica el original

    def test_official_minutes_correction(self):
        b = box()
        # Un sexto jugador local: el 104 juega 40 min y el 105, 8 (siguen sumando 240)
        b["homeTeam"]["players"][4]["statistics"]["minutes"] = "PT40M00.00S"
        b["homeTeam"]["players"].append(player(105, 8))
        off = self.official_from(b)
        # La NBA corrige los minutos: 2 de los que la CDN dio al 105 eran del 104
        off["homeTeam"]["players"][4]["statistics"]["minutes"] = "42:00"
        off["homeTeam"]["players"][5]["statistics"]["minutes"] = "6:00"
        players, _, _ = B.rows_from_box(B.apply_official(b, off))
        by_id = {r["player_id"]: r for r in players}
        self.assertEqual((by_id[104]["seconds"], by_id[105]["seconds"]), (42 * 60, 6 * 60))

    def test_official_dnp_is_not_played(self):
        b = box()
        b["homeTeam"]["players"].append(player(105, 0))  # la CDN lo da como jugado, 0 minutos
        off = self.official_from(b)
        off["homeTeam"]["players"][5]["statistics"]["minutes"] = ""  # nba.com: DNP
        players, _, people = B.rows_from_box(B.apply_official(b, off))
        self.assertNotIn(105, {r["player_id"] for r in players})
        self.assertNotIn(105, {p["id"] for p in people})

    def test_official_zero_minutes_is_not_played(self):
        b = box()
        off = self.official_from(b)
        # Formato 'PT..' de algunas páginas: el que no juega aparece con 0 minutos y sin comentario
        off["homeTeam"]["players"].append({"personId": 999, "firstName": "No", "familyName": "Jugó", "position": "",
                                           "statistics": {**dict.fromkeys(B.OFFICIAL_COUNTS, 0), "minutes": "PT00M00.00S", "plusMinusPoints": 0}})
        players, _, people = B.rows_from_box(B.apply_official(b, off))
        self.assertNotIn(999, {r["player_id"] for r in players})
        self.assertNotIn(999, {p["id"] for p in people})

    def test_incoherent_official_is_rejected(self):
        b = box()
        off = self.official_from(b)
        off["awayTeam"]["players"][4]["statistics"]["minutes"] = ""  # faltarían 48 min de equipo
        with self.assertRaises(B.BoxScoreError):
            B.rows_from_box(B.apply_official(b, off))

    def test_official_minutes_formats(self):
        self.assertEqual(B.official_minutes("36:48"), "PT36M48.00S")
        self.assertEqual(B.official_minutes("PT23M56.00S"), "PT23M56.00S")  # algunas páginas usan este
        self.assertIsNone(B.official_minutes(""))
        self.assertIsNone(B.official_minutes(None))

    def test_official_of_another_game_is_rejected(self):
        b = box()
        off = self.official_from(b)
        off["gameId"] = "0022600999"
        with self.assertRaises(B.BoxScoreError):
            B.apply_official(b, off)

    def test_season_of_game(self):
        self.assertEqual(B.season_of_game("0042600101"), "2026-27")
        self.assertEqual(B.season_of_game("0029900001"), "2099-00")


def game_row(pid, game_id, date_, team_id, pts, *, reb=0, ast=0, fgm=0, fga=0, seconds=1800, starter=True, opponent=2, game_type="002"):
    row = dict.fromkeys(S.COUNT_KEYS, 0)
    row.update(pts=pts, reb=reb, dreb=reb, ast=ast, fgm=fgm, fga=fga)
    return {**row, "player_id": pid, "game_id": game_id, "game_date": date_, "team_id": team_id, "opponent_id": opponent,
            "season_id": "2026-27", "game_type": game_type, "seconds": seconds, "starter": starter,
            "on_court_pts": 0, "on_court_opp_pts": 0, "plus_minus": 0}


class SeasonRows(unittest.TestCase):
    def test_half_up_rounding_and_traded_player(self):
        rows = [
            game_row(7, "0022600001", "2026-10-21", 1, 25, reb=1, fgm=10, fga=20),
            game_row(7, "0022600002", "2026-10-23", 1, 20, reb=2, fgm=8, fga=16),
            game_row(7, "0022600003", "2026-10-25", 3, 26, reb=1, fgm=9, fga=19, opponent=1, starter=False),
            game_row(7, "0022600004", "2026-10-27", 3, 10, reb=0, fgm=4, fga=9, opponent=1),
        ]
        ps = S.aggregate(rows)[(7, "2026-27", "Regular Season")]
        row = S.season_row(ps, {1: "AAA", 3: "CCC"}, {1, 3}, age=25)
        self.assertEqual(row["games_played"], 4)
        self.assertEqual(row["pts"], 20.3)            # 81 / 4 = 20.25 -> 20.3 (la NBA redondea hacia arriba)
        self.assertEqual(row["reb"], 1.0)
        self.assertEqual(row["fg_pct"], 0.484)        # 31 / 64
        self.assertEqual(row["team_id"], 3)           # último equipo
        adv = row["advanced_stats"]
        self.assertEqual((adv["team_abbreviation"], adv["gs"], adv["age"], adv["min"]), ("TOT", 3, 25, 30.0))
        self.assertEqual([t["team_abbreviation"] for t in adv["teams"]], ["AAA", "CCC"])
        self.assertEqual(adv["teams"][1]["pts"], 18.0)
        self.assertEqual(row["totals"]["pts"], 81)

    def test_no_attempts_is_zero_like_the_nba(self):
        ps = S.aggregate([game_row(8, "0022600001", "2026-10-21", 1, 0)])[(8, "2026-27", "Regular Season")]
        row = S.season_row(ps, {1: "AAA"}, {1}, None)
        self.assertEqual((row["fg_pct"], row["fg3_pct"], row["advanced_stats"]["ft_pct"]), (0.0, 0.0, 0.0))

    def test_play_in_and_cup_final_do_not_count(self):
        rows = [game_row(9, "0052600001", "2027-04-15", 1, 30, game_type="005"),
                game_row(9, "0062600001", "2026-12-16", 1, 30, game_type="006")]
        self.assertEqual(S.aggregate(rows), {})

    def test_career_is_history_plus_current(self):
        history = {**S.empty_totals(), "gp": 100, "gs": 90, "min": 3000.0, "pts": 2000, "reb": 500, "ast": 300, "fgm": 750, "fga": 1600}
        current = {**S.empty_totals(), "gp": 10, "gs": 10, "min": 350.0, "pts": 255, "reb": 50, "ast": 40, "fgm": 90, "fga": 180}
        row = S.career_row(7, "Regular Season", history, "2025-26", current, highs={"PTS": {"value": 50}})
        self.assertEqual(row["games_played"], 110)
        self.assertEqual(row["pts"], 20.5)            # (2000 + 255) / (100 + 10)
        self.assertEqual(row["totals"]["history_through"], "2025-26")
        self.assertEqual(row["totals"]["gp"], 110)
        self.assertEqual(row["advanced_stats"]["career_highs"], {"PTS": {"value": 50}})
        self.assertIsNone(row["team_id"])

    def test_season_age(self):
        self.assertEqual(S.season_age("2000-07-02", "2025-26", date(2026, 11, 1)), 25)   # 1 de julio de 2026
        self.assertEqual(S.season_age("2000-11-20", "2026-27", date(2026, 11, 13)), 25)  # temporada en curso: hoy
        self.assertIsNone(S.season_age(None, "2026-27", date(2026, 11, 13)))


class CareerHighs(unittest.TestCase):
    def test_new_high_and_ties_keep_latest(self):
        stored = {"PTS": {"value": 40, "date": "2024-01-01", "vs": "XXX", "game_id": "0022300001"},
                  "AST": {"value": 12, "date": "2025-01-01", "vs": "XXX", "game_id": "0022400001"}}
        games = [game_row(7, "0022600010", "2026-11-01", 1, 41, ast=12, opponent=2),
                 game_row(7, "0022600011", "2026-11-03", 1, 30, ast=5, opponent=2)]
        highs = S.update_highs(stored, games, {2: "BBB"})
        self.assertEqual((highs["PTS"]["value"], highs["PTS"]["vs"], highs["PTS"]["game_id"]), (41, "BBB", "0022600010"))
        self.assertEqual(highs["AST"]["game_id"], "0022600010")  # empate: el más reciente, como la NBA
        self.assertEqual(stored["PTS"]["value"], 40)              # no modifica el original

    def test_play_in_does_not_count(self):
        highs = S.update_highs({}, [game_row(7, "0052600001", "2027-04-15", 1, 60, game_type="005")], {})
        self.assertNotIn("PTS", highs)


class History(unittest.TestCase):
    TOT = {**S.empty_totals(), "gp": 70, "pts": 1400}

    def test_baseline_history(self):
        existing = {"7_Career_Regular Season": {"player_id": 7, "season_id": "Career", "totals": {"history": self.TOT, "history_through": "2025-26"}}}
        history, reason = resolve_history(7, "Regular Season", "2026-27", existing, {})
        self.assertEqual((history["gp"], reason), (70, "history"))

    def test_veteran_without_playoffs_has_zero_playoff_history(self):
        existing = {"7_Career_Regular Season": {"player_id": 7, "season_id": "Career", "totals": {"history": self.TOT, "history_through": "2025-26"}}}
        history, _ = resolve_history(7, "Playoffs", "2026-27", existing, {7: 2018})
        self.assertEqual(history["gp"], 0)

    def test_new_veteran_is_pending(self):
        history, reason = resolve_history(8, "Regular Season", "2026-27", {}, {8: 2015})
        self.assertIsNone(history)
        self.assertIn("2015", reason)

    def test_rookie_starts_from_zero(self):
        history, reason = resolve_history(9, "Regular Season", "2026-27", {}, {})
        self.assertEqual((history["gp"], reason), (0, "tracked"))

    def test_without_player_index_new_players_are_pending(self):
        history, _ = resolve_history(9, "Regular Season", "2026-27", {}, None)
        self.assertIsNone(history)

    def test_official_career_without_totals_is_pending(self):
        existing = {"7_Career_Regular Season": {"player_id": 7, "season_id": "Career", "totals": None}}
        history, _ = resolve_history(7, "Regular Season", "2026-27", existing, {})
        self.assertIsNone(history)

    def test_new_season_adds_the_finished_one(self):
        existing = {
            "7_Career_Regular Season": {"player_id": 7, "season_id": "Career", "totals": {"history": self.TOT, "history_through": "2025-26"}},
            "7_2026-27_Regular Season": {"player_id": 7, "season_id": "2026-27", "totals": {**S.empty_totals(), "gp": 80, "pts": 2000}},
        }
        history, reason = resolve_history(7, "Regular Season", "2027-28", existing, {})
        self.assertEqual((history["gp"], history["pts"], reason), (150, 3400, "history"))


if __name__ == "__main__":
    unittest.main()
