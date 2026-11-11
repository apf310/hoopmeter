"""Tests del lector de noticias y del resolvedor de cifras (Tarea 4.4, fase 2). Sin red ni base de datos.

Los textos son fragmentos reales de Hoops Rumors (julio y noviembre de 2026), recortados.
Uso (desde backend-data/):  python -m unittest discover -s tests -t .
"""
import re
import unittest
from datetime import date
from pathlib import Path

from extractors.fetch_contract_news import improves
from processors import cba
from processors.contract_news import Amount, NewsItem, extract_terms, parse_rss
from processors.contract_resolver import Evidence, Resolution, resolve


def item(title: str, text: str, published: str = "2026-07-02T12:00:00+00:00", source: str = "hoopsrumors") -> NewsItem:
    return NewsItem(id=f"{source}:{title}", source=source, url="https://example.com", title=title, published_at=published, text=text)


ANDERSON = item(
    "Raptors, Kyle Anderson Complete One-Year Deal",
    "July 2 : Veteran forward Kyle Anderson , an unrestricted free agent, has agreed to a one-year contract with the Raptors , "
    "sources tell Shams Charania of ESPN ( Twitter link ). Anderson will earn about $3.88MM on his minimum-salary deal with "
    "Toronto, while the Raptors will carry a cap hit of approximately $2.45MM. The final first-round pick in the 2014 draft, "
    "Anderson made a total of 43 appearances with Utah, Memphis and Minnesota in 2025/26.",
)
KENRICH = item(
    "Thunder Re-Sign Kenrich Williams",
    "July 2 : After declining his team option earlier in the week, the Thunder have reached an agreement to bring back veteran "
    "forward Kenrich Williams , reports NBA insider Chris Haynes ( Twitter link ). Williams' team option for 2026/27 would have "
    "paid him roughly $7.2MM. His new one-year contract with Oklahoma City will be worth $5MM, sources tell Haynes.",
)
ELLIS = item(
    "Contract Details: Ellis, Porzingis, R. Williams",
    "Keon Ellis ' new two-year, $18MM contract with the Nets will include both a player option and a team option, according to "
    "reporting from Fred Katz and Mike Vorkunov of The Athletic ( Twitter link ). As Katz and Vorkunov explain, after earning $9MM "
    "in 2026/27, Ellis will have the ability to pick up a $9MM player option for 2027/28.",
    published="2026-07-01T12:00:00+00:00",
)
DRUMMOND = item(
    "Andre Drummond Signs One-Year Deal With Knicks",
    "July 3 : Free agent center Andre Drummond has agreed to a one-year, $3.9MM contract with the defending champion Knicks , "
    "reports Michael Scotto of HoopsHype ( via Twitter ). Based on the reported terms, Drummond will receive a minimum-salary deal . "
    "The 14-year veteran will earn $3.88MM in 2026/27, while New York will carry a $2.45MM cap hit. He has played for the Sixers "
    "the past two seasons and also signed a two-year, $9MM deal with the Lakers.",
)
TERRY = item(
    "Dalen Terry Signs Two-Year Deal With Thunder",
    "November 3 : Free agent wing Dalen Terry has reached an agreement to sign a standard, two-year contract with the Thunder , "
    "reports Shams Charania of ESPN . Terry had been in training camp with Golden State this fall on a non-guaranteed Exhibit 9 "
    "contract before being waived at the end of the preseason. Oklahoma City has an open spot on its roster and won't need to make "
    "a move to sign Terry, whose contract will likely be non-guaranteed and worth the veteran's minimum.",
    published="2026-11-04T12:00:00+00:00",
)


def ANDERSON_TERMS():
    return extract_terms(ANDERSON, "Kyle Anderson", "TOR")


class ParseTests(unittest.TestCase):
    def test_minimo_de_un_ano_sin_el_cap_hit(self):
        terms = extract_terms(ANDERSON, "Kyle Anderson", "TOR")
        self.assertEqual(terms.years, {1})
        self.assertTrue(terms.minimum and terms.trusted)
        self.assertEqual(terms.one_year_salaries, [Amount(3_880_000, 7_500)])  # el cap hit de $2.45MM no cuenta

    def test_descarta_la_cifra_de_una_opcion_vieja(self):
        terms = extract_terms(KENRICH, "Kenrich Williams", "OKC")
        self.assertEqual(terms.totals, [Amount(5_000_000, 750_000)])
        self.assertNotIn(7_200_000, [a.value for a in terms.totals + terms.one_year_salaries])

    def test_cifra_por_temporada_sin_la_de_la_opcion(self):
        terms = extract_terms(ELLIS, "Keon Ellis", "BKN")
        self.assertEqual(terms.season_salaries, {"2026-27": [Amount(9_000_000, 750_000)]})
        self.assertEqual((terms.years, terms.totals), ({2}, [Amount(18_000_000, 750_000)]))

    def test_frase_de_continuacion_y_otra_franquicia(self):
        terms = extract_terms(DRUMMOND, "Andre Drummond", "NYK")
        self.assertEqual(terms.season_salaries, {"2026-27": [Amount(3_880_000, 7_500)]})
        self.assertNotIn(9_000_000, [a.value for a in terms.totals])  # el contrato con los Lakers es de otra frase

    def test_ignora_el_pasado_otra_ciudad_y_las_suposiciones(self):
        terms = extract_terms(TERRY, "Dalen Terry", "OKC")
        self.assertEqual(terms.years, {2})
        self.assertFalse(terms.minimum)  # "will likely be ... worth the veteran's minimum"
        self.assertIsNone(terms.guarantee)  # "non-guaranteed Exhibit 9" era con Golden State
        self.assertFalse(terms.exhibit)

    def test_con_un_homonimo_solo_vale_el_nombre_completo(self):
        text = KENRICH.text + " Jalen Williams is still recovering from wrist surgery."
        terms = extract_terms(item(KENRICH.title, text), "Kenrich Williams", "OKC", homonyms=("Jalen Williams",))
        # "Williams' team option…" y "His new one-year contract…" ya no son suyas con seguridad: no se atribuye nada
        self.assertTrue(terms is None or terms.totals == [])

    def test_exhibit_10_solo_si_es_con_su_equipo(self):
        signed = item("Heat Sign X", "The Heat have signed guard Juan Pérez to an Exhibit 10 contract, the team announced.")
        self.assertTrue(extract_terms(signed, "Juan Pérez", "MIA").exhibit)

    def test_frase_sobre_el_contrato_de_otro_jugador(self):
        news = item("Celtics Sign Neemias Queta To Four-Year Extension",
                    "Queta will have more help in the Celtics' frontcourt, as the team has agreed to sign center Mitchell Robinson "
                    "to a three-year contract worth the full non-taxpayer mid-level exception, per ESPN.")
        terms = extract_terms(news, "Neemias Queta", "BOS", others=frozenset({"mitchell robinson"}))
        self.assertTrue(terms is None or terms.exception is None)

    def test_contrato_anterior_en_pasado_o_de_otro_ano(self):
        isaac = item("Magic Re-Sign Jonathan Isaac", "The Magic have re-signed Jonathan Isaac, per ESPN. "
                     "Isaac had an $8MM guarantee on his $14.5MM salary for 2026/27 when he was waived on Saturday.")
        self.assertNotIn("2026-27", (extract_terms(isaac, "Jonathan Isaac", "ORL") or extract_terms(isaac, "x", "ORL") or ANDERSON_TERMS()).season_salaries)
        trent = item("Bucks Notes", "Trent signed with Milwaukee for the veteran's minimum in 2024 and was re-signed by the Bucks , per ESPN.",
                     published="2026-07-03T12:00:00+00:00")
        terms = extract_terms(trent, "Gary Trent Jr.", "MIL")
        self.assertTrue(terms is None or not terms.minimum)

    def test_resumen_de_rumores_y_noticia_de_otro_equipo(self):
        self.assertIsNone(extract_terms(item("FA/Trade Rumors: Raptors", ANDERSON.text), "Kyle Anderson", "TOR"))
        self.assertIsNone(extract_terms(ANDERSON, "Kyle Anderson", "LAL"))

    def test_sin_medio_reconocido_no_es_fiable(self):
        text = "The Raptors are signing Kyle Anderson to a one-year, $3.9MM deal, Jeff Goodman of Field of 68 tweets."
        self.assertFalse(extract_terms(item("Raptors Sign Kyle Anderson", text), "Kyle Anderson", "TOR").trusted)

    def test_cifras_exactas_y_redondeadas(self):
        exact = item("Hornets", "The Hornets signed guard Juan Pérez to a one-year, $10,445,632 contract, the team announced.")
        self.assertEqual(extract_terms(exact, "Juan Pérez", "CHA").totals, [Amount(10_445_632, 0)])
        million = item("Hornets", "The Hornets signed guard Juan Pérez to a two-year, $10 million contract, per ESPN.")
        self.assertEqual(extract_terms(million, "Juan Pérez", "CHA").totals, [Amount(10_000_000, 750_000)])

    def test_rss_con_texto_completo_y_con_resumen_escapado(self):
        xml = b"""<?xml version="1.0"?><rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel>
        <item><title>Lakers Sign Carson Cooper</title><link>https://a/1</link><guid>g1</guid>
          <pubDate>Wed, 11 Nov 2026 13:42:21 +0000</pubDate><content:encoded><![CDATA[<p>The <b>Lakers</b> signed Carson Cooper&#8217;s deal.</p>]]></content:encoded></item>
        <item><title>Broome, Wolves Agree</title><link>https://b/2</link><guid>g2</guid>
          <pubDate>Wed, 11 Nov 2026 13:42:21 EST</pubDate><description>&lt;p&gt;Johni Broome agreed to a Two-Way deal.&lt;/p&gt;</description></item>
        </channel></rss>"""
        items = parse_rss(xml, "realgm")
        self.assertEqual([i.id for i in items], ["realgm:g1", "realgm:g2"])
        self.assertEqual(items[0].text, "The Lakers signed Carson Cooper's deal.")
        self.assertEqual(items[1].text, "Johni Broome agreed to a Two-Way deal.")


def contract(**extra) -> dict:
    return {"player_id": 1, "salary_current": None, "salary_year_2": None, "salary_year_3": None, "salary_year_4": None,
            "contract_option": None, "signed_on": "2026-07-06", "signed_kind": "free_agent", "status": "pending",
            "source": {"kind": "official"}, **extra}


def evidence(*pairs) -> list[Evidence]:
    return [Evidence(news, extract_terms(news, name, team)) for news, name, team in pairs]


class ResolveTests(unittest.TestCase):
    def test_minimo_de_veterano_de_un_ano_cuenta_como_el_de_dos_anos(self):
        # Cobra 3.876.529 (los $3.88MM de la prensa), pero en la nómina y en los traspasos cuenta 2.449.421
        result = resolve(contract(), evidence((ANDERSON, "Kyle Anderson", "TOR")), years_of_service=12)
        self.assertEqual(result.salaries, [2_449_421, None, None, None])
        self.assertEqual((result.status, result.source["precision"], result.source["basis"]), ("confirmed", "exact", "minimum"))

    def test_minimo_de_varios_anos_cuenta_lo_que_cobra(self):
        news = item("Raptors Sign Alijah Martin", "Alijah Martin has agreed to a two-year, $4.8MM deal with the Raptors , ESPN's Shams Charania reports. "
                    "It's a minimum-salary deal, so Martin's cap hit will be approximately $2.19MM.")
        result = resolve(contract(), evidence((news, "Alijah Martin", "TOR")), years_of_service=1)
        self.assertEqual((result.salaries[0], result.status), (2_185_116, "pending_future"))

    def test_un_minimo_de_varios_anos_no_puede_sumar_decenas_de_millones(self):
        news = item("Bucks Re-Sign Gary Trent Jr.", "Gary Trent Jr. signed a two-year, $30.4MM deal with the Bucks , per Shams Charania of ESPN. "
                    "Trent's deal is a minimum-salary contract.")
        result = resolve(contract(), evidence((news, "Gary Trent Jr.", "MIL")), years_of_service=8)
        self.assertIsNone(result.salaries[0])

    def test_minimo_sin_saber_los_anos_de_contrato_de_un_veterano_no_se_decide(self):
        news = item("Magic Re-Sign Jevon Carter", "Jevon Carter's new minimum-salary deal with the Magic is official, per NBA.com.")
        self.assertIsNone(resolve(contract(), evidence((news, "Jevon Carter", "ORL")), years_of_service=8).salaries[0])

    def test_minimo_que_no_cuadra_con_la_prensa_no_se_resuelve(self):
        # $3,88MM no puede ser el mínimo de un jugador con 7 años (3.286.399): contradicción
        result = resolve(contract(), evidence((ANDERSON, "Kyle Anderson", "TOR")), years_of_service=7)
        self.assertEqual((result.status, result.salaries[0], result.source["reported"]["conflict"]), ("pending", None, True))

    def test_minimo_prorrateado_si_firma_con_la_temporada_empezada(self):
        news = item("Thunder Sign Juan Pérez", "The Thunder have signed Juan Pérez to a rest-of-season, minimum-salary contract, the team announced.")
        result = resolve(contract(signed_on="2026-11-04"), evidence((news, "Juan Pérez", "OKC")), years_of_service=2)
        expected, exact = cba.prorated(2_449_421, date(2026, 11, 4), cba.REGULAR_SEASON_START, cba.REGULAR_SEASON_END)
        self.assertFalse(exact)
        self.assertEqual((result.salaries[0], result.source["precision"]), (expected, "approx"))

    def test_un_ano_con_cifra_redondeada(self):
        result = resolve(contract(), evidence((KENRICH, "Kenrich Williams", "OKC")), years_of_service=9)
        self.assertEqual((result.salaries[0], result.status, result.source["precision"]), (5_000_000, "confirmed", "approx"))

    def test_varios_anos_con_solo_el_total_sigue_sin_cifra(self):
        news = item("Bulls Sign Norman Powell", "Norman Powell has agreed to sign a two-year, $45MM contract with the Bulls , per Shams Charania of ESPN.")
        result = resolve(contract(), evidence((news, "Norman Powell", "CHI")))
        self.assertEqual((result.status, result.salaries[0]), ("pending", None))
        self.assertEqual((result.source["reported"]["years"], result.source["reported"]["total"]), (2, 45_000_000))

    def test_varios_anos_con_cifra_de_esta_temporada(self):
        result = resolve(contract(), evidence((ELLIS, "Keon Ellis", "BKN")))
        self.assertEqual((result.salaries[:2], result.status), ([9_000_000, None], "pending_future"))

    def test_fuentes_que_se_contradicen(self):
        other = item("Nets Sign Keon Ellis", "Keon Ellis will earn $11MM in 2026/27 with the Nets , per Shams Charania of ESPN.", "2026-07-02T12:00:00+00:00")
        result = resolve(contract(), evidence((ELLIS, "Keon Ellis", "BKN"), (other, "Keon Ellis", "BKN")))
        self.assertEqual((result.salaries[0], result.source["reported"]["conflict"]), (None, True))

    def test_sin_fuentes_fiables_no_decide(self):
        news = item("Raptors Sign Kyle Anderson", "The Raptors are signing Kyle Anderson to a one-year, $3.9MM deal, Jeff Goodman tweets.")
        self.assertIsNone(resolve(contract(), evidence((news, "Kyle Anderson", "TOR"))))

    def test_exhibit_10_de_pretemporada_sale_del_gm(self):
        news = item("Heat Sign X", "The Heat have signed guard Juan Pérez to an Exhibit 10 contract, the team announced.")
        self.assertTrue(resolve(contract(signed_on="2026-09-20"), evidence((news, "Juan Pérez", "MIA"))).drop)

    def test_renovacion_completa_sus_anos_sin_tocar_esta_temporada(self):
        news = item("Celtics Extend Juan Pérez", "Juan Pérez signed a two-year extension with the Celtics , per Shams Charania of ESPN. "
                    "He will earn $20,000,000 in 2027/28 and $21,000,000 in 2028/29.")
        old = contract(status="pending_future", salary_current=15_000_000, signed_on="2026-10-20")
        result = resolve(old, evidence((news, "Juan Pérez", "BOS")))
        self.assertEqual(result.salaries, [15_000_000, 20_000_000, 21_000_000, None])
        self.assertEqual(result.status, "confirmed")


class ImprovesTests(unittest.TestCase):
    def test_nunca_pierde_una_cifra_ni_baja_de_exacta_a_aproximada(self):
        known = contract(status="confirmed", salary_current=5_000_000, source={"kind": "news", "precision": "exact"})
        worse = Resolution([None] * 4, "pending", {"precision": "exact", "reported": {}})
        approx = Resolution([5_100_000, None, None, None], "confirmed", {"precision": "approx"})
        self.assertFalse(improves(known, worse))
        self.assertFalse(improves(known, approx))

    def test_aproximada_mejora_a_exacta_y_pendiente_gana_cifra(self):
        approx = contract(status="confirmed", salary_current=5_000_000, source={"kind": "news", "precision": "approx"})
        exact = Resolution([4_987_000, None, None, None], "confirmed", {"precision": "exact"})
        self.assertTrue(improves(approx, exact))
        self.assertTrue(improves(contract(), Resolution([5_000_000, None, None, None], "confirmed", {"precision": "approx"})))

    def test_solo_se_descarta_un_contrato_que_nunca_tuvo_cifra(self):
        drop = Resolution([None] * 4, "pending", {}, drop=True)
        self.assertTrue(improves(contract(), drop))
        self.assertFalse(improves(contract(status="confirmed", salary_current=1), drop))


class SeasonFiguresTests(unittest.TestCase):
    def test_python_y_trade_rules_usan_las_mismas_cifras(self):
        """Se revisan cada verano en dos sitios: si uno se queda atrás, falla aquí."""
        ts = (Path(__file__).resolve().parents[2] / "web-app" / "src" / "lib" / "trade-rules.ts").read_text(encoding="utf-8")
        number = lambda name: int(re.search(rf"export const {name} = ([\d_]+);", ts)[1].replace("_", ""))
        self.assertEqual(number("SALARY_CAP"), cba.SALARY_CAP)
        self.assertEqual(number("MIN_SALARY"), cba.MINIMUM_SALARY[0])
        self.assertIn(f'SEASON = "{cba.SEASON}"', ts)

    def test_temporada_regular_de_174_dias(self):
        self.assertEqual((cba.REGULAR_SEASON_END - cba.REGULAR_SEASON_START).days + 1, 174)


if __name__ == "__main__":
    unittest.main()


class VeteranMinimumTests(unittest.TestCase):
    def test_renovacion_de_un_minimo_de_veterano_no_se_decide(self):
        news = item("Bones Hyland Re-Signs With Timberwolves On One-Year Deal",
                    "Free agent guard Bones Hyland is returning to the Timberwolves , sources tell Jon Krawczynski of The Athletic. "
                    "It's a one-year deal for the veteran's minimum, per ESPN.", published="2026-06-30T12:00:00+00:00")
        result = resolve(contract(), evidence((news, "Bones Hyland", "MIN")), years_of_service=5)
        self.assertIsNone(result.salaries[0])
        self.assertEqual(result.source["reported"]["minimum_options"], [2_449_421, 2_845_883])

    def test_cifra_igual_a_su_minimo_es_un_minimo_aunque_no_lo_diga(self):
        news = item("Knicks Sign Jordan Clarkson", "Jordan Clarkson has agreed to a one-year, $3.88MM contract with the Knicks , per Shams Charania of ESPN.")
        result = resolve(contract(), evidence((news, "Jordan Clarkson", "NYK")), years_of_service=12)
        self.assertEqual((result.salaries[0], result.source["basis"]), (2_449_421, "minimum"))

    def test_un_contrato_redondo_no_se_toma_por_minimo(self):
        news = item("Knicks Sign Juan Pérez", "Juan Pérez has agreed to a one-year, $4MM contract with the Knicks , per Shams Charania of ESPN.")
        result = resolve(contract(), evidence((news, "Juan Pérez", "NYK")), years_of_service=12)
        self.assertEqual((result.salaries[0], result.source["precision"]), (4_000_000, "approx"))

    def test_sin_anos_de_experiencia_un_contrato_de_un_ano_no_se_decide(self):
        self.assertIsNone(resolve(contract(), evidence((KENRICH, "Kenrich Williams", "OKC"))).salaries[0])


class StaleSeasonTests(unittest.TestCase):
    def test_los_procesos_se_paran_al_empezar_el_ano_de_liga_siguiente(self):
        self.assertIsNone(cba.stale_season(date(2027, 6, 30)))
        self.assertIn("2027-28", cba.stale_season(date(2027, 7, 1)))
