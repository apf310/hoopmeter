"""Utilidades de Supabase compartidas por los procesos de la Tarea 5.2b."""
import re
import sys
from datetime import datetime, timezone

from config import SUPABASE_SERVICE_KEY, SUPABASE_URL

PAGE_SIZE = 1000
BATCH_SIZE = 500


def connect():
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        sys.exit("Faltan SUPABASE_URL y/o SUPABASE_KEY en backend-data/.env")
    from supabase import create_client

    return create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


def select_all(client, table: str, columns: str, apply_filter=lambda query: query, order: str = "id") -> list[dict]:
    """Todas las filas (PostgREST devuelve como mucho 1000 por petición). Orden estable para paginar."""
    rows, start = [], 0
    while True:
        query = apply_filter(client.table(table).select(columns)).order(order)
        page = query.range(start, start + PAGE_SIZE - 1).execute().data
        rows += page
        if len(page) < PAGE_SIZE:
            return rows
        start += PAGE_SIZE


def upsert(client, table: str, rows: list[dict], on_conflict: str = "id", ignore_duplicates: bool = False) -> None:
    for i in range(0, len(rows), BATCH_SIZE):
        client.table(table).upsert(rows[i:i + BATCH_SIZE], on_conflict=on_conflict, ignore_duplicates=ignore_duplicates).execute()


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def save_status(client, sync_id: str, details: dict | None, error: str | None) -> None:
    """Deja constancia en `sync_status` (lectura pública: nunca marcadores ni resultados en `details`)."""
    now = now_iso()
    row = {"id": sync_id, "last_run_at": now, "last_error": error}
    if details is not None:
        row["details"] = details
    if error is None:
        row["last_success_at"] = now
    client.table("sync_status").upsert(row, on_conflict="id").execute()
    if error is not None:
        report_error(client, sync_id, error)


def normalize_error(message: str) -> str:
    """Igual que `normalizeMessage` de la web: el mismo fallo con otro partido o jugador da el mismo mensaje."""
    return re.sub(r"\d{5,}", "N", re.sub(r"\s+", " ", message)).strip()[:500]


def report_error(client, source: str, message: str, context: str | None = None) -> None:
    """Tarea 6.27: guarda el error en `app_errors` (backend-data/errors.sql). Nunca lanza.

    `source` = proceso (watcher, boxscores, contracts...); `context` = dónde (paso o tabla), sin datos de
    partidos. El job diario (check_errors.py) avisa por email de los nuevos.
    """
    if client is None:
        return
    try:
        client.rpc("report_app_error", {
            "p_source": source, "p_message": normalize_error(message), "p_path": context,
        }).execute()
    except Exception as exc:  # sin la tabla creada o sin red: el aviso de GitHub sigue funcionando
        print(f"  (error no guardado en app_errors: {type(exc).__name__})")
