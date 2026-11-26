"""Tests del radar y la media de la ficha (Tareas 6.19 y 7.10), sin red ni base de datos."""
import unittest

import numpy as np
import pandas as pd

from processors import player_radar_calc as R


def row(pid, **kw):
    """Jugador de rotación normalito; cada test cambia lo que necesita."""
    base = dict(PLAYER_ID=pid, GP=20, MIN=25.0, PTS=10.0, REB=4.0, AST=2.0, STL=0.8, BLK=0.4,
                FG3M=1.0, FG3A=2.8, FG3_PCT=1.0 / 2.8, TS_PCT=0.57, USG_PCT=0.19, AST_PCT=0.12, REB_PCT=0.09,
                PIE=0.09, FGM=4.0, FGA=8.5, FTM=1.2, FTA=1.6, OREB=1.0, DREB=3.0, TOV=1.2, PF=2.0)
    base.update(kw)
    return base


STAR = dict(MIN=35.0, PTS=28.0, REB=5.0, AST=6.5, USG_PCT=0.31, AST_PCT=0.3, TS_PCT=0.6, PIE=0.16,
            FGM=9.5, FGA=19.5, FTM=6.0, FTA=7.0, FG3M=3.0, FG3A=8.0, FG3_PCT=0.375)


def league(*players, filler=40):
    """Liga de relleno con algo de variación para que las escalas tengan sentido."""
    rows = [row(1000 + i, PTS=6.0 + i * 0.4, REB=3.0 + (i % 7) * 0.5, AST=1.0 + (i % 5) * 0.6,
                STL=0.5 + (i % 6) * 0.15, BLK=0.2 + (i % 4) * 0.2, FG3M=0.5 + (i % 5) * 0.4,
                FG3A=1.5 + (i % 5) * 1.0, FGM=2.5 + i * 0.15, FGA=6.0 + i * 0.3) for i in range(filler)]
    return R.compute_radar(pd.DataFrame([*rows, *players])).set_index("PLAYER_ID")


class GameScoreTest(unittest.TestCase):
    def test_formula_de_hollinger(self):
        df = pd.DataFrame([row(1, PTS=30, FGM=11, FGA=20, FTM=6, FTA=7, OREB=2, DREB=8, STL=2, AST=6, BLK=1, PF=3, TOV=4)])
        # 30 + 4.4 - 14 - 0.4 + 1.4 + 2.4 + 2 + 4.2 + 0.7 - 1.2 - 4
        self.assertAlmostEqual(R.game_score(df).iloc[0], 25.5)


class TowardBenchTest(unittest.TestCase):
    def test_pesa_gp_entre_gp_mas_4(self):
        values = np.array([0.0, 10.0, 20.0, 30.0, 40.0, 50.0, 60.0, 70.0, 80.0, 90.0, 100.0])
        bench = np.percentile(values, 30)  # 30
        games = np.full(len(values), 20.0)
        games[-1] = 4.0  # con 4 partidos, a medio camino entre lo suyo y lo de un suplente
        adjusted = R.toward_bench(values, games)
        self.assertAlmostEqual(adjusted[-1], (100 + bench) / 2)
        self.assertAlmostEqual(adjusted[0], 20 / 24 * 0 + 4 / 24 * bench)


class OverallTest(unittest.TestCase):
    def test_un_pivot_de_rol_no_supera_a_una_estrella(self):
        # Antes (media de los 4 mejores): rebote, eficiencia y tapones arriba del todo le daban más media que a la estrella
        big = row(1, PTS=9.0, REB=11.0, AST=1.5, BLK=2.2, STL=0.6, REB_PCT=0.2, TS_PCT=0.70, PIE=0.13,
                  FGM=4.0, FGA=5.6, FG3M=0.0, FG3A=0.0, FG3_PCT=0.0, OREB=3.5, DREB=7.5)
        df = league(big, row(2, **STAR))
        self.assertGreaterEqual(min(df.loc[1, c] for c in ("rebounding", "defense", "efficiency")), 90)
        self.assertGreater(df.loc[2, "overall"], df.loc[1, "overall"])

    def test_todo_el_que_ha_jugado_tiene_media(self):
        # Tarea 7.10: antes, fuera de la rotación (pocos minutos o partidos) no había media
        df = league(row(1, MIN=12.0), row(2, GP=1, **STAR))
        updated = "2026-11-26T10:30:00+00:00"
        for pid in (1, 2, 1000):
            payload = R.radar_payload(df.loc[pid], "2026-27", updated)
            self.assertIsInstance(payload["overall"], int)
            self.assertTrue(40 <= payload["overall"] <= 99)
        self.assertFalse(R.radar_payload(df.loc[1], "2026-27", updated)["qualified"])
        self.assertEqual(R.radar_payload(df.loc[1000], "2026-27", updated)["minutes"], 20 * 25)

    def test_con_pocos_partidos_sube_segun_juega(self):
        # La misma estrella con 1, 4 y 20 partidos: un partido suelto no la pone arriba del todo
        df = league(row(1, GP=1, **STAR), row(2, GP=4, **STAR), row(3, GP=20, **STAR))
        self.assertLess(df.loc[1, "overall"], df.loc[2, "overall"])
        self.assertLess(df.loc[2, "overall"], df.loc[3, "overall"])
        self.assertLess(df.loc[1, "scoring"], df.loc[3, "scoring"])

    def test_la_escala_es_la_rotacion(self):
        df = league(row(1, MIN=14.9), row(2, GP=7), row(3, GP=8, MIN=15.0))
        # 40 % de 20 partidos = 8; 15 minutos por partido
        self.assertEqual([bool(df.loc[p, "qualified"]) for p in (1, 2, 3)], [False, False, True])


class ScaleTest(unittest.TestCase):
    def test_atributos_de_40_a_99_frente_a_la_rotacion(self):
        df = league(row(1, **STAR), row(2, GP=20, MIN=10.0, PTS=0.5, USG_PCT=0.05, FGM=0.2, FGA=1.0))
        for category in R.CATEGORIES:
            self.assertTrue(df[category].between(40, 99).all(), category)
        self.assertGreaterEqual(df.loc[1, "scoring"], 98)  # el primero de 41: 40 + 59 · (1 - 1/82)
        self.assertEqual(df.loc[2, "scoring"], 40)  # fuera de la rotación y peor que todos: el suelo

    def test_media_proporcional_a_lo_que_aporta_con_ancla_de_los_3_mejores(self):
        pool = np.ones(6, dtype=bool)
        # Ancla = (40 + 25 + 25) / 3 = 30: el que la supera, 99; la mitad, 40 + 59 · 0,5^0,75 = 75
        self.assertEqual(R.overall_scale([40, 25, 25, 15, 10, -2], pool).tolist(), [99, 91, 91, 75, 66, 40])

    def test_el_ancla_no_depende_de_un_solo_jugador(self):
        # Con "el mejor" de ancla, un MVP descomunal (40 por partido) bajaría a los otros dos de 99 a 81
        pool = np.ones(4, dtype=bool)
        calm = R.overall_scale([25, 25, 25, 10], pool)
        monster = R.overall_scale([40, 25, 25, 10], pool)
        self.assertEqual(calm.tolist(), [99, 99, 99, 70])
        self.assertEqual(monster.tolist(), [99, 91, 91, 66])

    def test_sin_partidos_atributos_a_cero_y_sin_media(self):
        payload = R.no_games_payload("2026-27", "2026-11-26T10:30:00+00:00")
        self.assertEqual([payload[c] for c in R.CATEGORIES], [0] * 6)
        self.assertIsNone(payload["overall"])
        self.assertEqual((payload["season"], payload["games_played"], payload["qualified"]), ("2026-27", 0, False))


class DefenseTest(unittest.TestCase):
    def test_un_record_de_tapones_vale_mas_que_ser_bueno_en_las_dos_cosas(self):
        # Con percentiles, 4,5 tapones valían lo mismo que ser el 1 % mejor; con desviaciones típicas no
        blocker = row(1, BLK=4.5, STL=1.0)
        balanced = row(2, BLK=1.0, STL=1.5)
        df = league(blocker, balanced)
        self.assertGreater(df.loc[1, "defense"], df.loc[2, "defense"])

    def test_no_depende_del_def_rating(self):
        df = league(row(1, STL=1.6, BLK=1.0))
        self.assertNotIn("DEF_RATING", df.columns)
        self.assertGreaterEqual(df.loc[1, "defense"], 90)


class PercentagesTest(unittest.TestCase):
    def test_pocos_intentos_no_ganan_al_volumen_acertado(self):
        # 8 de 15 (53 %) en 15 partidos frente a 42 % con 7 intentos por partido
        hot = row(1, GP=15, FG3M=8 / 15, FG3A=1.0, FG3_PCT=8 / 15)
        sniper = row(2, GP=20, FG3M=2.94, FG3A=7.0, FG3_PCT=0.42)
        df = league(hot, sniper)
        self.assertGreater(df.loc[2, "FG3_PCT_ADJ"], df.loc[1, "FG3_PCT_ADJ"])
        self.assertLess(df.loc[1, "FG3_PCT_ADJ"], 8 / 15)

    def test_sin_un_triple_por_partido_no_es_tirador(self):
        # Aday Mara: 1 de 1 en toda la temporada
        df = league(row(1, GP=16, FG3M=1 / 16, FG3A=1 / 16, FG3_PCT=1.0))
        self.assertEqual(df.loc[1, "FG3_PCT_ADJ"], 0.0)
        self.assertLess(df.loc[1, "shooting"], 50)

    def test_ts_con_pocos_tiros_se_acerca_a_la_liga(self):
        df = league(row(1, GP=12, MIN=15.0, PTS=6.0, FGA=3.0, FTA=1.0, TS_PCT=6.0 / (2 * 3.44)))
        self.assertLess(df.loc[1, "TS_PCT_ADJ"], df.loc[1, "TS_PCT"])


if __name__ == "__main__":
    unittest.main()
