"""Tarea 6.27 — Aviso diario de errores en producción (web, watcher y jobs).

Lee `app_errors` (backend-data/errors.sql), cuenta los nuevos o repetidos desde el último aviso, los marca
como avisados y sale con código 1 si hay alguno: GitHub manda entonces el email del job fallido.
El registro de GitHub Actions es público: solo se imprimen totales por fuente, nunca mensajes ni rutas.
Los detalles se miran en Supabase > Table Editor > app_errors (ordenado por last_seen).

Uso (desde backend-data/):
    python check_errors.py            # avisa y marca
    python check_errors.py --dry-run  # solo cuenta, sin marcar ni fallar
"""
import argparse
import sys
from collections import Counter
from datetime import datetime

from db import connect, now_iso, select_all


def pending_errors(rows: list[dict]) -> list[dict]:
    """Nuevos (nunca avisados) o vueltos a aparecer después del último aviso."""
    def at(value: str) -> datetime:
        return datetime.fromisoformat(value)  # PostgREST: "2026-11-22T10:00:00.123+00:00"

    return [r for r in rows if r.get("notified_at") is None or at(r["last_seen"]) > at(r["notified_at"])]


def summary(rows: list[dict]) -> str:
    """"3 errores (web-client 2, watcher 1)": solo fuentes y totales, apto para un registro público."""
    by_source = Counter()
    for row in rows:
        by_source[row["source"]] += 1
    parts = ", ".join(f"{source} {n}" for source, n in sorted(by_source.items(), key=lambda kv: (-kv[1], kv[0])))
    noun = "error" if len(rows) == 1 else "errores"
    return f"{len(rows)} {noun} ({parts})"


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dry-run", action="store_true", help="no marca ni falla")
    args = parser.parse_args()

    client = connect()
    rows = select_all(client, "app_errors", "id,source,last_seen,notified_at")
    pending = pending_errors(rows)
    if not pending:
        print(f"Sin errores nuevos ({len(rows)} guardados en los últimos 30 días)")
        return

    print(f"Errores nuevos o repetidos desde el último aviso: {summary(pending)}")
    print("Detalles: Supabase > Table Editor > app_errors")
    if args.dry_run:
        return
    now = now_iso()
    ids = [r["id"] for r in pending]
    for i in range(0, len(ids), 200):
        client.table("app_errors").update({"notified_at": now}).in_("id", ids[i:i + 200]).execute()
    sys.exit(1)  # GitHub avisa por email


if __name__ == "__main__":
    main()
