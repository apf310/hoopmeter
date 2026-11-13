"""Tests de la clasificación calculada (processors/standings.py), sin red ni base de datos.

El fixture tiene dos temporadas reales completas (resultados y clasificación oficial de la NBA): el puesto
de cada equipo, con todos los desempates, tiene que salir idéntico al oficial.
"""
import json
import unittest
from pathlib import Path

from processors import standings as S

FIXTURE = json.loads((Path(__file__).parent / "fixtures" / "standings_official.json").read_text(encoding="utf-8"))

EAST_ATL, WEST_PAC = ("East", "Atlantic"), ("West", "Pacific")


def season_input(season: str):
    data = FIXTURE[season]
    teams = {int(tid): {"conference": c, "division": d} for tid, (c, d, _) in data["teams"].items()}
    names = {int(tid): name for tid, (_, _, name) in data["teams"].items()}
    games = [{"id": gid, "game_datetime_utc": when, "home_team_id": h, "away_team_id": a, "home_score": hs, "away_score": as_}
             for gid, when, h, a, hs, as_ in data["games"]]
    return teams, names, games, {int(k): v for k, v in data["official"].items()}


class OfficialSeasons(unittest.TestCase):
    def check_season(self, season: str, with_home_road: bool):
        teams, names, games, official = season_input(season)
        result = S.compute(games, teams, names)
        S.check(result, games, teams)
        for tid, off in official.items():
            got, extra = result[tid], result[tid]["standings_extra"]
            with self.subTest(season=season, team=names[tid]):
                self.assertEqual(got["conf_rank"], off["rank"])
                self.assertEqual((got["wins"], got["losses"]), (off["w"], off["l"]))
                self.assertEqual(extra["l10"], off["l10"])
                self.assertEqual(extra["streak"], off["streak"])
                self.assertEqual((extra["ppg"], extra["opp_ppg"], extra["diff_ppg"]), (off["ppg"], off["opp"], off["diff"]))
                if with_home_road:
                    self.assertEqual((extra["home"], extra["road"]), (off["home"], off["road"]))

    def test_2023_24(self):
        self.check_season("2023-24", with_home_road=True)

    def test_2025_26(self):
        # En 2025-26 el registro descargado no distingue el "local" de los partidos en campo neutral
        self.check_season("2025-26", with_home_road=False)


def make_teams(*specs):
    """specs: (id, conferencia, división)."""
    return {tid: {"conference": c, "division": d} for tid, c, d in specs}


class Game:
    n = 0

    @classmethod
    def make(cls, home, away, hs, as_):
        cls.n += 1
        return {"id": f"00226{cls.n:05d}", "game_datetime_utc": f"2026-11-{1 + cls.n // 10:02d}T00:{cls.n % 60:02d}:00Z",
                "home_team_id": home, "away_team_id": away, "home_score": hs, "away_score": as_}


def league(*east_west_teams):
    """30 equipos: los indicados + relleno, para que `check` acepte la clasificación."""
    specs = list(east_west_teams)
    used = {s[0] for s in specs}
    filler = [t for t in range(100, 160) if t not in used]
    while len(specs) < 30:
        tid = filler.pop(0)
        east = sum(1 for s in specs if s[1] == "East") < 15
        specs.append((tid, "East" if east else "West", "Fill-E" if east else "Fill-W"))
    return make_teams(*specs)


class TieBreakers(unittest.TestCase):
    def test_two_team_head_to_head(self):
        teams = league((1, *EAST_ATL), (2, *EAST_ATL))
        # Los dos acaban 1-1; 2 ganó el enfrentamiento directo (aunque 1 tenga más diferencia de puntos)
        games = [Game.make(1, 2, 90, 91), Game.make(1, 101, 130, 100), Game.make(103, 2, 100, 90)]
        result = S.compute(games, teams)
        self.assertEqual((result[1]["wins"], result[2]["wins"]), (1, 1))
        self.assertLess(result[2]["conf_rank"], result[1]["conf_rank"])

    def test_two_team_division_leader_when_no_head_to_head(self):
        # 1 (Atlántico) y 3 (Central) acaban 2-1 sin haberse enfrentado. 1 lidera su división; 3 no (4 va 3-0)
        teams = league((1, "East", "Atlantic"), (2, "East", "Atlantic"), (3, "East", "Central"), (4, "East", "Central"))
        games = [Game.make(1, 2, 100, 90), Game.make(2, 1, 90, 100), Game.make(101, 1, 100, 90),
                 Game.make(4, 3, 100, 90), Game.make(4, 102, 100, 90), Game.make(4, 103, 100, 90),
                 Game.make(3, 104, 130, 90), Game.make(3, 105, 130, 90)]
        result = S.compute(games, teams)
        self.assertEqual((result[1]["wins"], result[1]["losses"], result[3]["wins"], result[3]["losses"]), (2, 1, 2, 1))
        self.assertLess(result[1]["conf_rank"], result[3]["conf_rank"])  # aunque 3 tenga mejor diferencia
        self.assertEqual(result[4]["conf_rank"], 1)

    def test_three_way_tie_division_leader_then_restart(self):
        # 1, 2 y 3 acaban 1-1. Solo 1 lidera su división (6 lidera la Central); entre 2 y 3 se vuelve a empezar
        # con los criterios de dos equipos: 3 ganó el directo
        teams = league((1, "East", "Atlantic"), (5, "East", "Atlantic"), (2, "East", "Central"), (3, "East", "Central"), (6, "East", "Central"))
        games = [Game.make(1, 5, 100, 90), Game.make(101, 1, 100, 90),
                 Game.make(3, 2, 100, 90), Game.make(2, 102, 140, 90), Game.make(103, 3, 100, 90),
                 Game.make(6, 104, 100, 90), Game.make(6, 105, 100, 90)]
        result = S.compute(games, teams)
        self.assertEqual([(result[t]["wins"], result[t]["losses"]) for t in (1, 2, 3)], [(1, 1)] * 3)
        self.assertEqual(sorted((1, 2, 3), key=lambda t: result[t]["conf_rank"]), [1, 3, 2])

    def test_check_rejects_bad_totals(self):
        teams = league()
        games = [Game.make(101, 102, 100, 90)]
        result = S.compute(games, teams)
        with self.assertRaises(ValueError):
            S.check(result, games + [Game.make(101, 103, 100, 90)], teams)

    def test_rejects_tied_final(self):
        with self.assertRaises(ValueError):
            S.compute([Game.make(101, 102, 100, 100)], league())


class Extras(unittest.TestCase):
    def test_streak_l10_and_rounding(self):
        teams = league((1, *WEST_PAC))
        games = [Game.make(1, 101, 100, 90), Game.make(102, 1, 95, 90), Game.make(1, 103, 101, 100), Game.make(104, 1, 90, 91)]
        extra = S.compute(games, teams)[1]["standings_extra"]
        self.assertEqual(extra["streak"], "W2")
        self.assertEqual(extra["l10"], "3-1")
        self.assertEqual(extra["home"], "2-0")
        self.assertEqual(extra["road"], "1-1")
        self.assertEqual(extra["form"], ["W", "L", "W", "W"])
        # (100 + 90 + 101 + 91) / 4 = 95.5 exacto; diferencia (382 - 375) / 4 = 1.75 -> 1.8 (mitad hacia arriba)
        self.assertEqual((extra["ppg"], extra["diff_ppg"]), (95.5, 1.8))

    def test_neutral_site_counts_in_record_but_not_home_or_road(self):
        teams = league((1, *WEST_PAC))
        mexico = {**Game.make(1, 101, 100, 90), "is_neutral": True}
        result = S.compute([mexico, Game.make(102, 1, 80, 90)], teams)[1]
        self.assertEqual((result["wins"], result["losses"]), (2, 0))
        self.assertEqual((result["standings_extra"]["home"], result["standings_extra"]["road"]), ("0-0", "1-0"))
        self.assertEqual(result["standings_extra"]["l10"], "2-0")

    def test_team_without_games(self):
        extra = S.compute([], league())[101]["standings_extra"]
        self.assertEqual(extra["form"], [])
        self.assertIsNone(extra["streak"])


if __name__ == "__main__":
    unittest.main()
