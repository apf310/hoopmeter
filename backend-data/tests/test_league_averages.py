"""Tests de las medias de la liga por temporada (Tarea 7.3), sin red."""
import unittest

from extractors import fetch_league_averages as L


def log(games=1000, **extra):
    """Registro completo de una liga parecida a la de 2025-26."""
    per = {"pts": 115.6, "fgm": 42.0, "fga": 89.1, "fta": 23.5, "oreb": 11.4, "reb": 43.8, "ast": 26.7, "tov": 14.5}
    return {"games": games, "minutes": games * 241.3, **{key: value * games for key, value in per.items()}, **extra}


OLD = {"oreb": None, "reb": None, "ast": None, "tov": None, "fga": None, "fta": None}


class Totals(unittest.TestCase):
    def test_registro_completo_no_necesita_carreras(self):
        totals = L.league_totals(log(), {**dict.fromkeys(L.COUNTS, 1.0)})
        self.assertEqual(totals["reb"], log()["reb"])
        self.assertEqual(totals["tov"], log()["tov"])

    def test_lo_que_falta_sale_de_las_carreras_llevado_a_los_puntos_exactos(self):
        careers = {key: value * 0.9 for key, value in log().items() if key in L.COUNTS}
        totals = L.league_totals(log(**OLD), careers)
        self.assertAlmostEqual(totals["reb"], log()["reb"], places=3)
        self.assertAlmostEqual(totals["tov"], log()["tov"] + L.TEAM_TURNOVERS * 1000, places=3)

    def test_lo_que_la_epoca_no_registraba_queda_sin_dato(self):
        careers = {**{key: log()[key] for key in L.COUNTS}, "reb": 0.0, "oreb": 0.0, "tov": 0.0}
        totals = L.league_totals(log(**OLD), careers)
        self.assertIsNone(totals["reb"])
        self.assertIsNone(totals["tov"])

    def test_sin_minutos_en_el_registro_usa_los_habituales(self):
        self.assertAlmostEqual(L.league_totals(log(minutes=0.0), None)["minutes"], 1000 * L.USUAL_MINUTES)


class Averages(unittest.TestCase):
    def test_por_48_minutos(self):
        row = L.averages(L.league_totals(log(), None), 0, 0)
        self.assertAlmostEqual(row["pts"], 115.6 / 241.3 * 240, places=2)
        self.assertAlmostEqual(row["tsPct"], 0.581, places=3)
        self.assertAlmostEqual(row["pace"], 99.4, delta=0.5)
        self.assertFalse(row["paceEstimated"])

    def test_el_ritmo_estimado_se_parece_al_real_y_se_marca(self):
        full = L.league_totals(log(), None)
        missing = {**full, "oreb": None, "tov": None}
        row = L.averages(missing, L.offensive_rate(full), L.turnover_rate(full))
        self.assertTrue(row["paceEstimated"])
        self.assertAlmostEqual(row["pace"], L.averages(full, 0, 0)["pace"], places=6)

    def test_pocos_partidos_se_suman_con_las_vecinas(self):
        totals = {y: L.league_totals(log(games=40), None) for y in (1955, 1956, 1957)}
        self.assertEqual(L.pooled(totals, 1956)["games"], 120)
        self.assertEqual(L.pooled({1956: L.league_totals(log(games=2000), None), **{1957: totals[1957]}}, 1956)["games"], 2000)

    def test_una_vecina_sin_rebotes_no_se_mezcla(self):
        totals = {1949: {**L.league_totals(log(games=40), None), "reb": None}, 1950: L.league_totals(log(games=40), None), 1951: L.league_totals(log(games=70), None)}
        pool = L.pooled(totals, 1950)
        self.assertEqual(pool["games"], 110)
        self.assertIsNotNone(pool["reb"])


class Table(unittest.TestCase):
    def test_escribir_y_volver_a_leer(self):
        row = {"pts": 118.17, "reb": None, "ast": 23.81, "tsPct": 0.4787, "pace": 125.8, "paceEstimated": True}
        table = {"Regular Season": {"1946-47": row, "2025-26": {**row, "reb": 43.5, "paceEstimated": False}}, "Playoffs": {"1946-47": row}}
        self.assertEqual(L.parse(L.render(table)), table)


if __name__ == "__main__":
    unittest.main()
