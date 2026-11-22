"""Tests del radar y la media de la ficha (Tarea 6.19), sin red ni base de datos."""
import unittest

import pandas as pd

from processors import player_radar_calc as R


def row(pid, **kw):
    """Jugador de rotación normalito; cada test cambia lo que necesita."""
    base = dict(PLAYER_ID=pid, GP=20, MIN=25.0, PTS=10.0, REB=4.0, AST=2.0, STL=0.8, BLK=0.4,
                FG3M=1.0, FG3A=2.8, FG3_PCT=1.0 / 2.8, TS_PCT=0.57, USG_PCT=0.19, AST_PCT=0.12, REB_PCT=0.09,
                PIE=0.09, FGM=4.0, FGA=8.5, FTM=1.2, FTA=1.6, OREB=1.0, DREB=3.0, TOV=1.2, PF=2.0)
    base.update(kw)
    return base


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


class OverallTest(unittest.TestCase):
    def test_un_pivot_de_rol_no_supera_a_una_estrella(self):
        # Antes (media de los 4 mejores): rebote, eficiencia y tapones en 99 le daban más media que a la estrella
        big = row(1, PTS=9.0, REB=11.0, AST=1.5, BLK=2.2, STL=0.6, REB_PCT=0.2, TS_PCT=0.70, PIE=0.13,
                  FGM=4.0, FGA=5.6, FG3M=0.0, FG3A=0.0, FG3_PCT=0.0, OREB=3.5, DREB=7.5)
        star = row(2, MIN=35.0, PTS=28.0, REB=5.0, AST=6.5, USG_PCT=0.31, AST_PCT=0.3, TS_PCT=0.6, PIE=0.16,
                   FGM=9.5, FGA=19.5, FTM=6.0, FTA=7.0, FG3M=3.0, FG3A=8.0, FG3_PCT=0.375)
        df = league(big, star)
        self.assertGreaterEqual(min(df.loc[1, c] for c in ("rebounding", "defense", "efficiency")), 90)
        self.assertGreater(df.loc[2, "overall"], df.loc[1, "overall"])

    def test_fuera_de_la_escala_no_hay_media(self):
        df = league(row(1, MIN=12.0), row(2, GP=5))
        updated = "2026-11-22T10:30:00+00:00"
        for pid in (1, 2):
            payload = R.radar_payload(df.loc[pid], "2026-27", updated)
            self.assertFalse(payload["qualified"])
            self.assertIsNone(payload["overall"])
        payload = R.radar_payload(df.loc[1000], "2026-27", updated)
        self.assertTrue(payload["qualified"])
        self.assertIsInstance(payload["overall"], int)
        self.assertEqual(payload["minutes"], 20 * 25)

    def test_la_escala_es_la_rotacion(self):
        df = league(row(1, MIN=14.9), row(2, GP=7), row(3, GP=8, MIN=15.0))
        # 40 % de 20 partidos = 8; 15 minutos por partido
        self.assertEqual([bool(df.loc[p, "qualified"]) for p in (1, 2, 3)], [False, False, True])


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
        self.assertLess(df.loc[1, "shooting"], 10)

    def test_ts_con_pocos_tiros_se_acerca_a_la_liga(self):
        df = league(row(1, GP=12, MIN=15.0, PTS=6.0, FGA=3.0, FTA=1.0, TS_PCT=6.0 / (2 * 3.44)))
        self.assertLess(df.loc[1, "TS_PCT_ADJ"], df.loc[1, "TS_PCT"])


if __name__ == "__main__":
    unittest.main()
