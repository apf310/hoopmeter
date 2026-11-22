"""Tarea 6.27: aviso de errores en producción (sin red ni base de datos)."""
import unittest

from check_errors import pending_errors, summary
from db import normalize_error, report_error


class NormalizeErrorTest(unittest.TestCase):
    def test_mismo_fallo_otro_partido_mismo_mensaje(self):
        self.assertEqual(normalize_error("KeyError('0022600245')"), normalize_error("KeyError('0022600301')"))

    def test_espacios_y_longitud(self):
        self.assertEqual(normalize_error("  a \n  b  "), "a b")
        self.assertEqual(len(normalize_error("x" * 2000)), 500)

    def test_numeros_cortos_se_quedan(self):
        self.assertEqual(normalize_error("HTTP 503"), "HTTP 503")


class ReportErrorTest(unittest.TestCase):
    def test_nunca_lanza(self):
        class Broken:
            def rpc(self, *args, **kwargs):
                raise RuntimeError("sin red")

        report_error(Broken(), "watcher", "boom")  # no lanza
        report_error(None, "watcher", "boom")

    def test_envia_mensaje_normalizado_y_contexto(self):
        calls = []

        class Fake:
            def rpc(self, name, params):
                calls.append((name, params))
                return self

            def execute(self):
                return None

        report_error(Fake(), "watcher", "Fallo en 0022600245", "clasificación")
        self.assertEqual(calls, [("report_app_error", {"p_source": "watcher", "p_message": "Fallo en N", "p_path": "clasificación"})])


class CheckErrorsTest(unittest.TestCase):
    def test_nuevos_y_repetidos_desde_el_aviso(self):
        rows = [
            {"id": "a", "source": "web-client", "last_seen": "2026-11-22T10:00:00+00:00", "notified_at": None},
            {"id": "b", "source": "watcher", "last_seen": "2026-11-22T10:00:00+00:00", "notified_at": "2026-11-21T10:30:00+00:00"},
            {"id": "c", "source": "watcher", "last_seen": "2026-11-20T10:00:00+00:00", "notified_at": "2026-11-21T10:30:00+00:00"},
        ]
        self.assertEqual([r["id"] for r in pending_errors(rows)], ["a", "b"])

    def test_resumen_solo_totales(self):
        rows = [{"source": "web-client"}, {"source": "watcher"}, {"source": "web-client"}]
        self.assertEqual(summary(rows), "3 errores (web-client 2, watcher 1)")
        self.assertEqual(summary(rows[:1]), "1 error (web-client 1)")


if __name__ == "__main__":
    unittest.main()
