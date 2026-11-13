"""Utilidades de Supabase compartidas por los procesos de la Tarea 5.2b."""
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
