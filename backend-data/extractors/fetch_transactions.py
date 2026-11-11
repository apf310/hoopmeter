"""Tarea 4.4 — Movimientos oficiales de la NBA aplicados a los contratos del GM Virtual.

Lee el registro oficial de nba.com (fichajes, cortes, traspasos, reclamados y conversiones), guarda
cada movimiento en `transactions` y lo aplica a `player_contracts`, `players.team_id` y
`teams.dead_money` con las reglas de processors/contract_engine.py.

La NBA no publica cifras: un contrato nuevo queda "pending" hasta que se conozcan, y mientras tanto el
GM deja que cada usuario escriba su estimación. Los contratos de partida son la última carga completa
(BASELINE_DATE): los movimientos anteriores ya están reflejados en ella.

Uso (desde backend-data/):
    python -m extractors.fetch_transactions            # descarga y aplica lo nuevo (segundos)
    python -m extractors.fetch_transactions --dry-run  # muestra qué haría, sin escribir nada

Sale con código 1 si algo falla y con 2 si hay movimientos que no sabe interpretar: en GitHub Actions,
cualquiera de los dos manda un aviso por email.
"""
import argparse
import sys
import time
from collections import Counter
from datetime import datetime, timezone

import requests

from config import SUPABASE_SERVICE_KEY, SUPABASE_URL
from processors.cba import stale_season
from processors.contract_engine import SALARY_FIELDS, Movement, Result, State, apply, parse_feed

FEED_URL = "https://stats.nba.com/js/data/playermovement/NBA_Player_Movement.json"
# nba.com rechaza las peticiones sin cabeceras de navegador
HEADERS = {"User-Agent": "Mozilla/5.0", "Referer": "https://www.nba.com/", "Origin": "https://www.nba.com", "Accept": "application/json"}
TIMEOUT = 30
RETRIES = 3
# Por debajo de esto el feed ha cambiado de formato: aplicarlo podría estropear contratos buenos
MIN_FEED_ROWS = 5000
# Fecha de la última carga completa de contratos (Basketball-Reference, Tarea 4.1)
BASELINE_DATE = "2026-11-04"
PAGE_SIZE = 1000
SYNC_ID = "contracts"
CONTRACT_COLUMNS = (*SALARY_FIELDS, "player_id", "contract_option", "signed_on", "signed_kind", "acquired_on", "status", "source")


def fetch_feed() -> list[dict]:
    """Filas del registro oficial de movimientos (desde 2015)."""
    for attempt in range(1, RETRIES + 1):
        try:
            response = requests.get(FEED_URL, headers=HEADERS, timeout=TIMEOUT)
            response.raise_for_status()
            rows = response.json()["NBA_Player_Movement"]["rows"]
            if len(rows) < MIN_FEED_ROWS:
                raise RuntimeError(f"El registro oficial solo trae {len(rows)} movimientos (mínimo {MIN_FEED_ROWS}): ¿ha cambiado el formato?")
            return rows
        except (requests.RequestException, ValueError, KeyError) as exc:
            if attempt == RETRIES:
                raise RuntimeError(f"No se pudo leer el registro oficial de la NBA: {exc}") from exc
            print(f"  ~ reintento {attempt}/{RETRIES - 1} tras error: {exc}")
            time.sleep(5 * attempt)
    raise AssertionError("inalcanzable")


def select_all(client, table: str, columns: str, apply_filter=lambda query: query) -> list[dict]:
    rows, start = [], 0
    while True:
        page = apply_filter(client.table(table).select(columns)).range(start, start + PAGE_SIZE - 1).execute().data
        rows += page
        if len(page) < PAGE_SIZE:
            return rows
        start += PAGE_SIZE


def has_migration(client) -> bool:
    """¿Existen ya las tablas de la Tarea 4.4? Sin ellas solo se puede simular (--dry-run)."""
    try:
        client.table("transactions").select("id").limit(1).execute()
        return True
    except Exception:  # PostgREST responde con error si la tabla no existe
        return False


def load_state(client) -> State:
    contracts = {row["player_id"]: row for row in select_all(client, "player_contracts", "*")}
    players = select_all(client, "players", "id, full_name, team_id")
    teams = client.table("teams").select("id, dead_money").execute().data
    return State(
        contracts=contracts,
        team_of={p["id"]: p["team_id"] for p in players},
        names={p["id"]: p["full_name"] for p in players},
        dead_money={t["id"]: t["dead_money"] or [] for t in teams},
    )


def load_applied_ids(client) -> set[str]:
    rows = select_all(client, "transactions", "id", lambda query: query.not_.is_("applied_at", "null"))
    return {row["id"] for row in rows}


def contract_row(contract: dict, now: str) -> dict:
    return {**{column: contract.get(column) for column in CONTRACT_COLUMNS}, "status": contract.get("status") or "confirmed", "updated_at": now}


def write(client, state: State, movement: Movement, result: Result, now: str) -> None:
    """Guarda lo que ha cambiado el movimiento y lo marca como aplicado, en un orden que aguanta cortes:
    si el proceso muere a medias, la siguiente ejecución lo repite y cada paso es idempotente."""
    for team_id in state.touched_teams:
        client.table("teams").update({"dead_money": state.dead_money[team_id]}).eq("id", team_id).execute()
    if state.new_players:
        rows = [{**row, "team_id": state.team_of[player_id]} for player_id, row in state.new_players.items()]
        client.table("players").upsert(rows, on_conflict="id", ignore_duplicates=True).execute()
    for player_id in state.touched_players - state.new_players.keys():
        client.table("players").update({"team_id": state.team_of[player_id]}).eq("id", player_id).execute()

    upserts = [contract_row(state.contracts[pid], now) for pid in state.touched_contracts if pid in state.contracts]
    deletes = sorted(pid for pid in state.touched_contracts if pid not in state.contracts)
    if upserts:
        client.table("player_contracts").upsert(upserts, on_conflict="player_id").execute()
    if deletes:
        client.table("player_contracts").delete().in_("player_id", deletes).execute()

    client.table("transactions").upsert({
        "id": movement.id,
        "transaction_date": movement.date,
        "type": movement.type,
        "contract_type": movement.contract_type,
        "player_id": movement.player_id,
        "team_id": movement.team_id,
        "other_team_id": movement.other_team_id,
        "description": movement.description,
        "outcome": result.outcome,
        "details": result.details,
        "applied_at": now,
    }, on_conflict="id").execute()


def forget_changes(state: State) -> None:
    state.touched_contracts.clear()
    state.touched_players.clear()
    state.touched_teams.clear()
    state.new_players.clear()


def summary(state: State, outcomes: Counter, review: list[str]) -> dict:
    contracts = state.contracts.values()
    return {
        "applied": sum(outcomes.values()),
        "outcomes": dict(outcomes),
        "pending_contracts": sum(1 for c in contracts if c.get("status") == "pending"),
        "pending_future_contracts": sum(1 for c in contracts if c.get("status") == "pending_future"),
        "pending_dead_money": sum(1 for entries in state.dead_money.values() for e in entries if e.get("pending")),
        "needs_review": review,
    }


def save_status(client, now: str, details: dict | None, error: str | None) -> None:
    row = {"id": SYNC_ID, "last_run_at": now, "last_error": error}
    if error is None:
        row |= {"last_success_at": now, "details": details}
    client.table("sync_status").upsert(row, on_conflict="id").execute()


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")  # nombres como "Jokić" en consolas cp1252
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dry-run", action="store_true", help="no escribe en Supabase")
    args = parser.parse_args()

    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        sys.exit("Faltan SUPABASE_URL y/o SUPABASE_KEY en backend-data/.env")
    stale = stale_season(datetime.now(timezone.utc).date())
    if stale:
        print(f"! {stale}")
        sys.exit(2)

    from supabase import create_client

    client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    migrated = has_migration(client)
    if not migrated and not args.dry_run:
        sys.exit("Falta la migración de la Tarea 4.4: ejecuta backend-data/schema.sql en Supabase > SQL Editor.")
    if not migrated:
        print("[dry-run] Sin la migración de la Tarea 4.4: se simula como si no se hubiera aplicado ningún movimiento.\n")

    now = datetime.now(timezone.utc).isoformat()
    try:
        movements = parse_feed(fetch_feed(), BASELINE_DATE)
        applied = load_applied_ids(client) if migrated else set()
        todo = [m for m in movements if m.id not in applied]
        print(f"Registro oficial: {len(movements)} movimientos desde el {BASELINE_DATE}, {len(todo)} por aplicar.\n")

        state = load_state(client)
        outcomes, review = Counter(), []
        for movement in todo:
            result = apply(state, movement)
            outcomes[result.outcome] += 1
            print(f"  {movement.date}  {result.outcome:<26} {movement.description}")
            if result.outcome == "needs_review":
                review.append(f"{movement.date} {movement.description}")
            if not args.dry_run:
                write(client, state, movement, result, now)
            forget_changes(state)

        details = summary(state, outcomes, review)
        print(f"\nAplicados: {details['applied']} · contratos sin cifra pública: {details['pending_contracts']}"
              f" · renovaciones sin cifra: {details['pending_future_contracts']} · dinero muerto por confirmar: {details['pending_dead_money']}")
        for line in review:
            print(f"  ! Sin interpretar: {line}")
        if not args.dry_run:
            save_status(client, now, details, None)
    except Exception as exc:
        if migrated and not args.dry_run:
            save_status(client, now, None, f"{type(exc).__name__}: {exc}"[:500])
        raise

    if review:
        sys.exit(2)


if __name__ == "__main__":
    main()
