"""Tests de la nota de espectáculo (processors/excitement_calculator.py), sin red ni base de datos.

La nota tiene que leerse como una nota del colegio (partido normal ~6, suspenso si se decidió antes del
último cuarto, 8+ los partidazos) y no puede delatar una prórroga. Partidos inventados para cada caso y
tres reales de 2026-27 en el fixture (solo la evolución del marcador).
"""
import json
import re
import unittest
from collections import defaultdict
from pathlib import Path

from processors import excitement_calculator as E

FIXTURE = json.loads((Path(__file__).parent / "fixtures" / "excitement_games.json").read_text(encoding="utf-8"))
SHOW = {"points_per_48": 225.0, "true_shooting": 0.58, "top_points": 28, "triple_double": False, "ten_threes": False}


def timeline(points: list[tuple[float, int]], step: int = 30) -> list[tuple[float, int]]:
    """Canasta cada `step` s siguiendo la línea entre los puntos (minuto, margen del local), con un vaivén de ±1
    como en un partido real; en cada punto el margen es exactamente el indicado."""
    out = [(0.0, 0)]
    for (m0, v0), (m1, v1) in zip(points, points[1:]):
        t0, t1 = m0 * 60, m1 * 60
        for k, t in enumerate(range(int(t0) + step, int(t1), step)):
            trend = v0 + (v1 - v0) * (t - t0) / (t1 - t0)
            out.append((float(t), round(trend) + (1 if k % 2 else -1)))
        out.append((float(t1) - 1, v1))
    return [p for i, p in enumerate(out) if i == 0 or p[1] != out[i - 1][1]]


def note(points, overtimes=0, **show):
    tl = timeline(points)
    score, breakdown = E.score_game(E.story(tl, 4, overtimes, tl[-1][1]), {**SHOW, **show})
    return score, breakdown


BLOWOUT = [(0, 0), (12, 15), (24, 25), (36, 30), (48, 32)]
DECIDED_BEFORE_Q4 = [(0, 0), (12, 4), (24, 9), (36, 18), (48, 20)]
NORMAL = [(0, 0), (12, 2), (24, -1), (36, 4), (42, 13), (48, 11)]          # se decide a mitad del último cuarto
CLOSE = [(0, 0), (12, 3), (24, -2), (36, 1), (44, -2), (47, 2), (48, 1)]    # igualado y decidido en la última posesión
COMEBACK = [(0, 0), (12, -8), (24, -15), (36, -20), (44, -8), (47, -2), (48, 1)]
OVERTIME = [(0, 0), (12, 2), (24, -3), (36, 2), (46, -3), (48, 0), (53, 4)]


class Scale(unittest.TestCase):
    """La escala: cada tipo de partido en su tramo de nota."""

    def test_blowout_is_a_bad_fail(self):
        self.assertLessEqual(note(BLOWOUT)[0], 2.5)

    def test_decided_before_last_quarter_fails(self):
        self.assertLess(note(DECIDED_BEFORE_Q4)[0], 5.0)

    def test_normal_game_is_around_six(self):
        self.assertTrue(5.0 <= note(NORMAL)[0] < 7.0, note(NORMAL))

    def test_close_finish_is_notable(self):
        self.assertGreaterEqual(note(CLOSE)[0], 7.5)

    def test_twenty_point_comeback_to_win_at_the_end(self):
        score, breakdown = note(COMEBACK)
        self.assertGreaterEqual(score, 8.0)
        self.assertGreater(breakdown["remontada"], 1.0)

    def test_overtime_is_high_but_not_automatically_ten(self):
        score, _ = note(OVERTIME, overtimes=1)
        self.assertTrue(7.5 <= score < 10.0, score)

    def test_scores_stay_in_range(self):
        for points in (BLOWOUT, DECIDED_BEFORE_Q4, NORMAL, CLOSE, COMEBACK):
            for top in (20, 50, 90):
                with self.subTest(points=points[-1], top=top):
                    self.assertTrue(1.0 <= note(points, top_points=top)[0] <= 10.0)


class Properties(unittest.TestCase):
    def test_later_decision_means_higher_score(self):
        start = [(0, 0), (12, 2), (24, 0), (36, 3)]
        early = note(start + [(40, 16), (48, 14)])[0]   # decidido al empezar el último cuarto
        middle = note(start + [(42, 12), (48, 10)])[0]   # a mitad del cuarto
        late = note(start + [(45, 5), (47, 6), (48, 7)])[0]   # en los dos últimos minutos
        buzzer = note(start + [(45, 2), (47.5, -1), (48, 1)])[0]   # canasta ganadora al final
        self.assertLess(early, middle)
        self.assertLess(middle, late)
        self.assertLess(late, buzzer)
        self.assertGreaterEqual(buzzer, 8.0)

    def test_historic_individual_performance_lifts_a_blowout(self):
        normal, fifty, eighty = (note(BLOWOUT, top_points=pts)[0] for pts in (30, 50, 80))
        self.assertLess(normal, fifty)
        self.assertLess(fifty, eighty)
        self.assertGreaterEqual(eighty, 5.0)   # 80 puntos merecen verse aunque fuera una paliza

    def test_overtime_has_no_bonus_of_its_own(self):
        # La nota no puede delatar la prórroga: sin plus propio y el final de infarto solo mira el tiempo reglamentario
        wild, calm = timeline(OVERTIME), timeline(OVERTIME[:-1] + [(53, 12)])
        story_wild, story_calm = (E.story(tl, 4, 1, tl[-1][1]) for tl in (wild, calm))
        self.assertEqual(story_wild["late_swings"], story_calm["late_swings"])
        self.assertNotIn("prorrogas", E.score_game(story_wild, SHOW)[1])


class WinProbability(unittest.TestCase):
    def test_tie_at_the_buzzer_is_a_coin_flip(self):
        self.assertAlmostEqual(E.win_probability(0, 0), 0.5)

    def test_home_edge_at_tip_off(self):
        self.assertTrue(0.5 < E.win_probability(0, E.FULL_GAME) < 0.6)

    def test_same_lead_is_safer_with_less_time(self):
        self.assertLess(E.win_probability(5, 600), E.win_probability(5, 60))
        self.assertGreater(E.win_probability(3, 10), 0.85)
        self.assertLess(E.win_probability(-3, 10), 0.15)

    def test_seconds_left_in_regulation_and_overtime(self):
        self.assertEqual(E.seconds_left(2879, 4), 1)
        self.assertEqual(E.seconds_left(2880, 4), 0)      # bocina del 4º cuarto
        self.assertEqual(E.seconds_left(2881, 4), 299)    # 1 s de prórroga
        self.assertEqual(E.seconds_left(3180, 4), 0)      # bocina de la prórroga
        self.assertEqual(E.seconds_left(3181, 4), 299)

    def test_web_uses_the_same_model(self):
        # El gráfico de la ficha (Tarea 7.2) lleva este modelo en TypeScript: mismas constantes y, en
        # win-probability.test.ts, mismos valores que estos
        ts = (Path(__file__).resolve().parents[2] / "web-app" / "src" / "lib" / "win-probability.ts").read_text(encoding="utf-8")
        for name in ("SIGMA", "HOME_EDGE", "TIME_FLOOR", "ALIVE_CHANCE"):
            match = re.search(rf"export const {name} = ([\d.]+);", ts)
            self.assertIsNotNone(match, name)
            self.assertEqual(float(match[1]), getattr(E, name), name)
        for margin, left, expected in ((0, 2880, 0.554487), (-7, 1440, 0.328344), (5, 600, 0.744228), (-3, 30, 0.095567),
                                       (1, 0, 0.776773), (0, 0, 0.5), (20, 300, 0.999619)):
            self.assertAlmostEqual(E.win_probability(margin, left), expected, places=6)


class RealGames(unittest.TestCase):
    """Partidos de 2026-27 con la nota que se les dio a mano (la anterior entre paréntesis)."""

    def score(self, game_id):
        g = FIXTURE[game_id]
        tl = [tuple(p) for p in g["timeline"]]
        return E.score_game(E.story(tl, g["regulation"], g["overtimes"], g["final_margin"]), g["show"])[0]

    def test_orl_bos_alive_entering_the_fourth(self):   # 4.6 con la nota anterior (README, Tarea 6.5)
        self.assertTrue(6.0 <= self.score("0022600245") <= 7.5)

    def test_nineteen_point_fourth_quarter_comeback_to_overtime(self):   # 7.3
        self.assertGreaterEqual(self.score("0022600110"), 8.5)

    def test_wire_to_wire_blowout(self):   # 1.2
        self.assertLessEqual(self.score("0022600040"), 2.0)


class Compute(unittest.TestCase):
    """De la jugada a jugada y el boxscore de la CDN a la nota (lo que llama watcher.py)."""

    def test_compute_matches_story_and_score(self):
        tl = timeline(CLOSE)
        actions = []
        for n, (t, margin) in enumerate(tl[1:], start=1):
            period = min(4, int(t // E.REGULATION_PERIOD) + 1)
            left = period * E.REGULATION_PERIOD - t
            home = 100 + max(margin, 0) + n
            actions.append({"period": period, "clock": f"PT{int(left // 60):02d}M{left % 60:05.2f}S", "orderNumber": n,
                            "scoreHome": str(home), "scoreAway": str(home - margin)})
        final_home, final_away = int(actions[-1]["scoreHome"]), int(actions[-1]["scoreAway"])

        def team(score, pts):
            stats = defaultdict(int, trueShootingPercentage=0.58)
            player = {"name": "Jugador", "played": "1", "statistics": defaultdict(int, points=pts)}
            return {"teamCity": "C", "teamName": "N", "teamTricode": "AAA", "score": score, "statistics": stats,
                    "players": [player], "periods": [{"score": score // 4}] * 4}

        box = {"regulationPeriods": 4, "period": 4, "homeTeam": team(final_home, 31), "awayTeam": team(final_away, 27)}
        result = E.compute(box, actions)
        show = {"points_per_48": final_home + final_away, "true_shooting": 0.58, "top_points": 31,
                "triple_double": False, "ten_threes": False}
        expected = E.score_game(E.story(E.margin_timeline(actions, 4), 4, 0, final_home - final_away), show)[0]
        self.assertEqual(result["excitement_score"], expected)
        self.assertGreaterEqual(result["excitement_score"], 8.0)
        self.assertEqual(set(result["breakdown"]), {"vivo_ultimo_cuarto", "final_en_el_aire", "final_de_infarto", "igualdad",
                                                    "remontada", "ataque", "individual"})


if __name__ == "__main__":
    unittest.main()
