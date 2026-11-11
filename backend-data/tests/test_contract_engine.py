"""Tests de processors/contract_engine.py (Tarea 4.4), sin red ni base de datos.

Uso (desde backend-data/):  python -m unittest discover -s tests -t .
"""
import copy
import unittest

from processors.contract_engine import State, apply, parse_feed, parse_movement

OKC, SAC, LAL, MEM = 1610612760, 1610612758, 1610612747, 1610612763


def row(kind: str, description: str, player_id: int, team_id: int, date: str = "2026-11-10", group: str | None = None, other: int = 0) -> dict:
    """Fila con el formato exacto del registro oficial de nba.com."""
    return {
        "Transaction_Type": kind,
        "TRANSACTION_DATE": f"{date}T00:00:00",
        "TRANSACTION_DESCRIPTION": description,
        "TEAM_ID": team_id,
        "TEAM_SLUG": "x",
        "PLAYER_ID": player_id,
        "PLAYER_SLUG": "x",
        "Additional_Sort": other,
        "GroupSort": group or f"{kind} {1157000 + player_id % 1000}",
    }


def contract(player_id: int, *salaries, **extra) -> dict:
    values = list(salaries) + [None] * (4 - len(salaries))
    return {
        "player_id": player_id,
        "salary_current": values[0],
        "salary_year_2": values[1],
        "salary_year_3": values[2],
        "salary_year_4": values[3],
        "contract_option": None,
        "signed_on": "2025-07-06",
        "signed_kind": "free_agent",
        "acquired_on": None,
        "status": "confirmed",
        "source": None,
        **extra,
    }


def state(contracts=(), teams=None, names=None, dead_money=None) -> State:
    contracts = {c["player_id"]: c for c in contracts}
    return State(
        contracts=contracts,
        team_of=dict(teams or {}),
        names=dict(names or {}),
        dead_money={team: list(entries) for team, entries in (dead_money or {}).items()},
    )


def move(*args, **kwargs):
    movement = parse_movement(row(*args, **kwargs))
    assert movement is not None
    return movement


class ParseTests(unittest.TestCase):
    def test_tipos_de_contrato_y_nombres(self):
        cases = [
            ("Signing", "Los Angeles Lakers signed forward Carson Cooper to a Two-Way Contract.", "two_way", "Carson Cooper"),
            ("Signing", "Oklahoma City Thunder signed forward Dalen Terry to a Rest-of-Season Contract.", "rest_of_season", "Dalen Terry"),
            ("Signing", "LA Clippers signed guard Blake Wesley to a 10-Day Contract.", "ten_day", "Blake Wesley"),
            ("Signing", "Golden State Warriors re-signed guard Stephen Curry to a Veteran Extension.", "veteran_extension", "Stephen Curry"),
            ("Signing", "Houston Rockets re-signed guard Amen Thompson to a Rookie Scale Extension.", "rookie_extension", "Amen Thompson"),
            ("Signing", "Toronto Raptors signed guard Kevin McCullar Jr. to a Two-Way Contract.", "two_way", "Kevin McCullar Jr."),
            ("Signing", "Dallas Mavericks re-signed forward Dwight Powell to a Contract.", "standard", "Dwight Powell"),
            ("Signing", "Utah Jazz signed guard X to a Substitute Player Contract.", "substitute", "X"),
            ("ContractConverted", "Toronto Raptors converted the contract of guard A.J. Lawson to an NBA Contract.", "standard", "A.J. Lawson"),
            ("ContractConverted", "Phoenix Suns converted the contract of center Duop Reath to a Two-Way Contract.", "two_way", "Duop Reath"),
        ]
        for kind, description, contract_type, name in cases:
            with self.subTest(description=description):
                movement = move(kind, description, 1, OKC)
                self.assertEqual(movement.contract_type, contract_type)
                self.assertEqual(movement.player_name, name)

    def test_cortes_con_jr_y_sin_posicion(self):
        self.assertEqual(move("Waive", "Atlanta Hawks waived forward John Butler Jr..", 1, OKC).player_name, "John Butler Jr.")
        self.assertEqual(move("Waive", "Miami Heat waived  Ezra Ausar.", 1, OKC).player_name, "Ezra Ausar")

    def test_tipo_de_contrato_desconocido(self):
        self.assertIsNone(move("Signing", "Utah Jazz signed guard X to a Mystery Deal.", 1, OKC).contract_type)

    def test_traspaso_sin_jugador_se_ignora(self):
        self.assertIsNone(parse_movement(row("Trade", "LA Clippers received draft consideration from Toronto Raptors.", 0, OKC)))

    def test_feed_ordenado_sin_repetidos_y_desde_la_fecha(self):
        rows = [
            row("Waive", "OKC waived forward A.", 2, OKC, date="2026-11-08", group="Waive 1157634"),
            row("Signing", "OKC signed forward A to a Contract.", 2, OKC, date="2026-11-04", group="Signing 1157414"),
            row("Signing", "OKC signed forward A to a Contract.", 2, OKC, date="2026-11-04", group="Signing 1157414"),
            row("Signing", "OKC signed forward B to a Contract.", 3, OKC, date="2026-10-01", group="Signing 1150000"),
        ]
        movements = parse_feed(rows, since="2026-11-04")
        self.assertEqual([m.type for m in movements], ["Signing", "Waive"])

    def test_traspaso_guarda_el_equipo_de_origen(self):
        movement = move("Trade", "Oklahoma City Thunder received guard Nique Clifford from Sacramento Kings.", 7, OKC, other=SAC, group="Trade 2026018")
        self.assertEqual((movement.other_team_id, movement.sequence), (SAC, 2026018))


class ApplyTests(unittest.TestCase):
    def test_traspaso_mueve_jugador_y_conserva_contrato(self):
        s = state([contract(7, 3_000_000, 3_200_000)], teams={7: SAC})
        result = apply(s, move("Trade", "OKC received guard Nique Clifford from Sacramento Kings.", 7, OKC, other=SAC))
        self.assertEqual(result.outcome, "traded")
        self.assertEqual(s.team_of[7], OKC)
        self.assertEqual(s.contracts[7]["salary_current"], 3_000_000)
        self.assertEqual(s.contracts[7]["acquired_on"], "2026-11-10")

    def test_corte_antes_de_la_garantia_deja_dinero_muerto_por_confirmar(self):
        s = state([contract(5, 2_000_000)], teams={5: OKC}, names={5: "Dalen Terry"})
        result = apply(s, move("Waive", "OKC waived forward Dalen Terry.", 5, OKC, date="2026-11-08"))
        self.assertEqual(result.outcome, "waived_dead_money")
        self.assertNotIn(5, s.contracts)
        self.assertIsNone(s.team_of[5])
        entry = s.dead_money[OKC][0]
        self.assertEqual((entry["name"], entry["salaries"][0], entry["pending"]), ("Dalen Terry", 2_000_000, True))

    def test_corte_tras_la_garantia_con_un_solo_ano_es_cifra_segura(self):
        s = state([contract(5, 2_000_000)], teams={5: OKC})
        apply(s, move("Waive", "OKC waived forward A.", 5, OKC, date="2027-02-01"))
        self.assertFalse(s.dead_money[OKC][0]["pending"])

    def test_corte_tras_la_garantia_con_mas_anos_sigue_pendiente(self):
        s = state([contract(5, 2_000_000, 2_100_000)], teams={5: OKC})
        apply(s, move("Waive", "OKC waived forward A.", 5, OKC, date="2027-02-01"))
        self.assertTrue(s.dead_money[OKC][0]["pending"])

    def test_corte_repetido_no_duplica_dinero_muerto(self):
        s = state([contract(5, 2_000_000)], teams={5: OKC})
        waive = move("Waive", "OKC waived forward A.", 5, OKC)
        apply(s, waive)
        apply(s, waive)
        self.assertEqual(len(s.dead_money[OKC]), 1)

    def test_corte_sin_contrato(self):
        s = state(teams={9: LAL})
        self.assertEqual(apply(s, move("Waive", "Lakers waived center Lawson Lovering.", 9, LAL)).outcome, "waived_without_contract")
        self.assertEqual(s.dead_money[LAL], [])

    def test_reclamado_recupera_el_contrato_en_su_nuevo_equipo(self):
        s = state([contract(5, 2_000_000, 2_100_000)], teams={5: MEM})
        apply(s, move("Waive", "Memphis waived forward A.", 5, MEM, date="2026-11-07"))
        result = apply(s, move("AwardOnWaivers", "OKC claimed forward A off waivers.", 5, OKC, date="2026-11-09"))
        self.assertEqual((result.outcome, s.team_of[5]), ("claimed", OKC))
        self.assertEqual(s.contracts[5]["salary_year_2"], 2_100_000)
        self.assertEqual(s.dead_money[MEM], [])

    def test_reclamado_sin_contrato_guardado_queda_pendiente(self):
        s = state(teams={5: None})
        self.assertEqual(apply(s, move("AwardOnWaivers", "OKC claimed forward A off waivers.", 5, OKC)).outcome, "claimed_pending")
        self.assertEqual(s.contracts[5]["status"], "pending")

    def test_fichaje_nuevo_queda_sin_cifra(self):
        s = state(teams={5: None}, names={5: "Dalen Terry"})
        result = apply(s, move("Signing", "OKC signed forward Dalen Terry to a Rest-of-Season Contract.", 5, OKC, date="2026-11-04"))
        self.assertEqual(result.outcome, "signed_pending")
        self.assertEqual(s.team_of[5], OKC)
        c = s.contracts[5]
        self.assertEqual((c["status"], c["salary_current"], c["signed_on"], c["signed_kind"]), ("pending", None, "2026-11-04", "free_agent"))
        self.assertEqual(c["source"]["kind"], "official")

    def test_fichaje_ya_reflejado_en_la_carga_no_se_pisa(self):
        s = state([contract(5, 2_000_000, signed_on="2026-11-04")], teams={5: OKC})
        apply(s, move("Signing", "OKC signed forward A to a Contract.", 5, OKC, date="2026-11-04"))
        self.assertEqual(s.contracts[5]["salary_current"], 2_000_000)

    def test_escala_de_novato(self):
        s = state(teams={5: None})
        apply(s, move("Signing", "OKC re-signed forward A to a Rookie Scale Contract.", 5, OKC))
        self.assertEqual(s.contracts[5]["signed_kind"], "rookie")

    def test_jugador_nuevo_se_crea_en_players_con_su_equipo(self):
        s = state()
        apply(s, move("Signing", "OKC signed guard Nuevo Jugador to a Contract.", 77, OKC))
        self.assertEqual(s.new_players[77]["full_name"], "Nuevo Jugador")
        self.assertEqual(s.team_of[77], OKC)

    def test_two_way_y_10_dias_no_entran_en_el_gm(self):
        s = state([contract(5, 2_000_000)], teams={5: OKC})
        self.assertEqual(apply(s, move("Signing", "OKC signed forward A to a Two-Way Contract.", 5, OKC)).outcome, "two_way")
        self.assertNotIn(5, s.contracts)
        self.assertEqual(apply(s, move("Signing", "LAL signed guard B to a 10-Day Contract.", 6, LAL)).outcome, "ten_day")
        self.assertNotIn(6, s.contracts)

    def test_renovacion_conserva_esta_temporada_y_deja_pendientes_los_anos_nuevos(self):
        s = state([contract(5, 40_000_000, 42_000_000)], teams={5: OKC})
        result = apply(s, move("Signing", "OKC re-signed guard A to a Veteran Extension.", 5, OKC, date="2026-10-20"))
        c = s.contracts[5]
        self.assertEqual(result.outcome, "extended")
        self.assertEqual((c["salary_current"], c["salary_year_2"], c["status"]), (40_000_000, 42_000_000, "pending_future"))
        self.assertEqual((c["signed_on"], c["signed_kind"]), ("2026-10-20", "extension"))

    def test_extension_de_novato(self):
        s = state([contract(5, 8_000_000, signed_kind="rookie")], teams={5: OKC})
        apply(s, move("Signing", "OKC re-signed guard A to a Rookie Scale Extension.", 5, OKC))
        self.assertEqual(s.contracts[5]["signed_kind"], "rookie_extension")

    def test_conversiones(self):
        s = state([contract(5, 1_500_000)], teams={5: OKC, 6: OKC})
        self.assertEqual(apply(s, move("ContractConverted", "OKC converted the contract of guard A to a Two-Way Contract.", 5, OKC)).outcome, "converted_two_way")
        self.assertNotIn(5, s.contracts)
        self.assertEqual(apply(s, move("ContractConverted", "OKC converted the contract of guard B to an NBA Contract.", 6, OKC)).outcome, "converted_pending")
        self.assertEqual(s.contracts[6]["status"], "pending")

    def test_texto_desconocido_pide_revision_y_no_toca_nada(self):
        s = state([contract(5, 1_500_000)], teams={5: OKC})
        before = copy.deepcopy(s.contracts)
        self.assertEqual(apply(s, move("Signing", "OKC signed guard A to a Mystery Deal.", 5, OKC)).outcome, "needs_review")
        self.assertEqual(s.contracts, before)

    def test_repetir_cada_movimiento_no_cambia_nada(self):
        """El proceso marca cada movimiento al acabar de guardarlo: si se corta, la siguiente ejecución
        repite solo ese. Aplicar cada uno dos veces seguidas debe dejar lo mismo que aplicarlo una vez."""
        movements = [
            move("Signing", "OKC signed forward A to a Rest-of-Season Contract.", 5, OKC, date="2026-11-04"),
            move("Trade", "OKC received guard B from Sacramento Kings.", 7, OKC, date="2026-11-08", other=SAC, group="Trade 2026018"),
            move("Signing", "OKC re-signed guard B to a Veteran Extension.", 7, OKC, date="2026-11-08"),
            move("Waive", "OKC waived forward A.", 5, OKC, date="2026-11-09"),
            move("AwardOnWaivers", "Memphis claimed forward A off waivers.", 5, MEM, date="2026-11-11"),
            move("ContractConverted", "OKC converted the contract of guard C to an NBA Contract.", 8, OKC, date="2026-11-12"),
        ]
        once, twice = (state([contract(7, 3_000_000)], teams={5: None, 7: SAC, 8: OKC}) for _ in range(2))
        for m in movements:
            apply(once, m)
            apply(twice, m)
            apply(twice, m)
        self.assertEqual((twice.contracts, twice.team_of, twice.dead_money), (once.contracts, once.team_of, once.dead_money))

    def test_corte_interrumpido_tras_guardar_el_dinero_muerto(self):
        """El dinero muerto se guarda antes que el contrato: si el proceso muere entre medias, al repetir
        el corte el contrato debe desaparecer sin duplicar la entrada."""
        waive = move("Waive", "OKC waived forward A.", 5, OKC)
        s = state([contract(5, 2_000_000)], teams={5: OKC})
        apply(s, waive)
        s.contracts[5] = contract(5, 2_000_000)  # la base aún tenía el contrato
        apply(s, waive)
        self.assertNotIn(5, s.contracts)
        self.assertEqual(len(s.dead_money[OKC]), 1)


if __name__ == "__main__":
    unittest.main()
