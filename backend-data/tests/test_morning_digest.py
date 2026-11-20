"""Tests del aviso matinal (processors/morning_digest.py), sin red ni base de datos."""
import unittest
from datetime import datetime, timezone

from processors import morning_digest as M

NAMES = {1: "Boston Celtics", 2: "Orlando Magic", 3: "Los Angeles Lakers", 4: "Phoenix Suns", 5: "Portland Trail Blazers", 6: "Utah Jazz"}
GAMES = [
    M.Game("g1", "2026-11-19T00:00:00+00:00", 1, 2),  # Celtics-Magic, 19:00 ET
    M.Game("g2", "2026-11-19T03:00:00+00:00", 3, 4),  # Lakers-Suns, 22:00 ET
    M.Game("g3", "2026-11-19T03:30:00+00:00", 5, 6),  # Trail Blazers-Jazz, 22:30 ET
]


def utc(iso: str) -> datetime:
    return datetime.fromisoformat(iso).replace(tzinfo=timezone.utc)


class Day(unittest.TestCase):
    def test_last_night_is_previous_spanish_day(self):
        self.assertEqual(M.last_night(utc("2026-11-19T07:00:00")), "2026-11-18")  # 8:00 en España (CET)
        self.assertEqual(M.last_night(utc("2027-04-15T06:00:00")), "2027-04-14")  # 8:00 en España (CEST)

    def test_spain_hour_follows_daylight_saving(self):
        self.assertEqual(M.spain_hour(utc("2026-11-19T07:00:00")), 8)
        self.assertEqual(M.spain_hour(utc("2027-04-15T06:00:00")), 8)

    def test_day_bounds_cover_the_new_york_day(self):
        self.assertEqual(M.day_bounds_utc("2026-11-18"), ("2026-11-18T05:00:00+00:00", "2026-11-19T05:00:00+00:00"))

    def test_nickname(self):
        self.assertEqual(M.nickname("Portland Trail Blazers"), "Trail Blazers")
        self.assertEqual(M.nickname("Philadelphia 76ers"), "76ers")


class ScheduleText(unittest.TestCase):
    def test_plain(self):
        self.assertEqual(M.schedule_text(GAMES, NAMES, set()), (M.TITLE, "3 partidos."))

    def test_names_first_favorite_game_by_time(self):
        _, body = M.schedule_text(GAMES, NAMES, {6, 3})
        self.assertEqual(body, "3 partidos, incluido un Lakers-Suns.")

    def test_single_game(self):
        self.assertEqual(M.schedule_text(GAMES[:1], NAMES, {2})[1], "1 partido: Celtics-Magic.")
        self.assertEqual(M.schedule_text(GAMES[:1], NAMES, set())[1], "1 partido.")

    def test_never_depends_on_scores(self):
        """Dos jornadas con los mismos partidos y notas distintas dan el mismo aviso sin notas."""
        for teams in (set(), {1}, {4}, {5, 2}):
            a = M.build_message(GAMES, {"g1": 9.4, "g2": 3.1, "g3": 6.0}, NAMES, teams, with_scores=False)
            b = M.build_message(GAMES, {"g1": 2.0, "g2": 9.9}, NAMES, teams, with_scores=False)
            c = M.build_message(GAMES, {}, NAMES, teams, with_scores=False)
            self.assertEqual(a, b)
            self.assertEqual(a, c)

    def test_no_result_words(self):
        for with_scores in (False, True):
            _, body = M.build_message(GAMES, {"g1": 9.4, "g2": 8.2, "g3": 6.0}, NAMES, {4}, with_scores)
            for word in ("prórroga", "gana", "ganó", "victoria", "derrota", "final"):
                self.assertNotIn(word, body.lower())


class ScoresText(unittest.TestCase):
    def test_two_great_games(self):
        _, body = M.scores_text(GAMES, {"g1": 9.1, "g2": 8.0, "g3": 5.5}, NAMES, set())
        self.assertEqual(body, "3 partidos y 2 partidazos: el mejor, un Celtics-Magic (9,1).")

    def test_one_great_game(self):
        _, body = M.scores_text(GAMES, {"g1": 6.1, "g2": 8.4, "g3": 5.5}, NAMES, set())
        self.assertEqual(body, "3 partidos y 1 partidazo: un Lakers-Suns (8,4).")

    def test_no_great_game(self):
        _, body = M.scores_text(GAMES, {"g1": 6.1, "g2": 7.4, "g3": 5.5}, NAMES, set())
        self.assertEqual(body, "3 partidos. El mejor, un Lakers-Suns (7,4).")

    def test_favorite_when_not_the_best(self):
        _, body = M.scores_text(GAMES, {"g1": 9.1, "g2": 6.8, "g3": 5.5}, NAMES, {3})
        self.assertEqual(body, "3 partidos y 1 partidazo: un Celtics-Magic (9,1). Tu Lakers-Suns: 6,8.")
        _, body = M.scores_text(GAMES, {"g1": 9.1, "g2": 6.8, "g3": 5.5}, NAMES, {1})
        self.assertNotIn("Tu ", body)

    def test_tie_goes_to_earlier_game(self):
        _, body = M.scores_text(GAMES, {"g1": 7.0, "g2": 7.0, "g3": 7.0}, NAMES, set())
        self.assertIn("Celtics-Magic (7,0)", body)

    def test_without_any_score_falls_back_to_schedule(self):
        self.assertEqual(M.scores_text(GAMES, {}, NAMES, set()), M.schedule_text(GAMES, NAMES, set()))


class Ready(unittest.TestCase):
    NOW = utc("2026-11-19T07:00:00")

    def test_all_scored(self):
        rows = [{"game_datetime_utc": g.start_utc, "status": "Final", "excitement_score": 6.0} for g in GAMES]
        self.assertTrue(M.is_ready(rows, self.NOW))

    def test_game_still_on(self):
        rows = [{"game_datetime_utc": GAMES[0].start_utc, "status": "Final", "excitement_score": 6.0},
                {"game_datetime_utc": GAMES[2].start_utc, "status": "Live", "excitement_score": None}]
        self.assertFalse(M.is_ready(rows, self.NOW))

    def test_final_without_score_yet(self):
        rows = [{"game_datetime_utc": GAMES[2].start_utc, "status": "Final", "excitement_score": None}]
        self.assertFalse(M.is_ready(rows, self.NOW))

    def test_postponed_is_not_awaited(self):
        rows = [{"game_datetime_utc": GAMES[0].start_utc, "status": "Scheduled", "excitement_score": None},
                {"game_datetime_utc": GAMES[1].start_utc, "status": "Final", "excitement_score": 7.0}]
        self.assertTrue(M.is_ready(rows, self.NOW))


class Due(unittest.TestCase):
    def test_on_its_hour_and_catch_up(self):
        self.assertTrue(M.is_due(8, None, "2026-11-18", 8))
        self.assertTrue(M.is_due(8, "2026-11-17", "2026-11-18", 9))
        self.assertFalse(M.is_due(9, None, "2026-11-18", 8))

    def test_never_twice(self):
        self.assertFalse(M.is_due(8, "2026-11-18", "2026-11-18", 9))

    def test_not_after_last_hour(self):
        self.assertFalse(M.is_due(10, None, "2026-11-18", M.LAST_HOUR + 1))


if __name__ == "__main__":
    unittest.main()
