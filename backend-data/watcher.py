"""Tarea 3.2 — Vigila los partidos y pone la nota a cada uno en cuanto pasa a 'Final'.

Cada pasada:
  1. Sincroniza el calendario de la temporada (al arrancar y cada 6 h) y el directo de hoy.
  2. Para cada partido `Final` con `is_processed == False`: calcula la nota 1.0-10.0 y la
     guarda con `is_processed = True`.

Por consola solo se muestra la nota (sin marcadores): el watcher tampoco te destripa nada.

Uso (desde backend-data/):
    python watcher.py                          # bucle continuo (cada 60 s)
    python watcher.py --once                   # una sola pasada
    python watcher.py --once --skip-schedule   # GitHub Actions: sin calendario (lo baja el job diario)
    python watcher.py --backfill --once        # también los partidos ya jugados de la temporada
    python watcher.py --game-id 0022600170 --dry-run   # un partido concreto, sin escribir
"""
import argparse
import sys
import time
from datetime import datetime, timedelta, timezone

from config import SUPABASE_SERVICE_KEY, SUPABASE_URL
from extractors.fetch_live_and_final import sync_schedule, sync_today, team_ids
from processors.excitement_calculator import analyze_game

POLL_SECONDS = 60
SCHEDULE_REFRESH_SECONDS = 6 * 3600
# Sin --backfill solo se procesan partidos recientes (los antiguos se hacen a propósito)
RECENT_WINDOW = timedelta(days=2)
# Intentos por partido en una misma ejecución (evita machacar la CDN si algo falla siempre)
MAX_ATTEMPTS = 3


def load_pending(client, backfill: bool) -> list[str]:
    query = client.table("games").select("id").eq("status", "Final").eq("is_processed", False)
    if not backfill:
        query = query.gte("game_datetime_utc", (datetime.now(timezone.utc) - RECENT_WINDOW).isoformat())
    return [r["id"] for r in query.order("game_datetime_utc", desc=True).execute().data]


def process_game(client, game_id: str, dry_run: bool) -> None:
    result = analyze_game(game_id)
    row = {
        "excitement_score": result["excitement_score"],
        "home_score": result["home_score"],
        "away_score": result["away_score"],
        "quarters_score": result["quarters_score"],
        "live_period_text": None,
        "status": "Final",
        "is_processed": True,
    }
    print(f"  {game_id} -> nota {result['excitement_score']}")
    if dry_run:
        print("    desglose:", result["breakdown"])
        return
    client.table("games").update(row).eq("id", game_id).execute()


def run_pass(client, state: dict, args) -> None:
    if not args.dry_run:
        # El calendario sale de stats.nba.com, que bloquea a menudo las IPs de la nube: en GitHub Actions
        # (cada 5 min) se salta y lo descarga una vez al día daily_stats_sync. El directo y la nota usan la CDN.
        if not args.skip_schedule and time.time() - state["schedule_synced_at"] > SCHEDULE_REFRESH_SECONDS:
            n = sync_schedule(client, state["team_ids"])
            state["schedule_synced_at"] = time.time()
            print(f"Calendario sincronizado: {n} partidos")
        today = sync_today(client, state["team_ids"])
        live = sum(g["status"] == "Live" for g in today)
        print(f"[{datetime.now():%H:%M:%S}] Hoy: {len(today)} partidos, {live} en juego")

    pending = [g for g in load_pending(client, args.backfill) if state["failures"].get(g, 0) < MAX_ATTEMPTS]
    if args.limit:
        pending = pending[:args.limit]
    if pending:
        print(f"Procesando {len(pending)} partidos terminados...")
    for game_id in pending:
        try:
            process_game(client, game_id, args.dry_run)
        except Exception as exc:  # p. ej. la CDN aún no tiene el boxscore final: se reintenta luego
            print(f"  ! {game_id}: {exc!r}")
            state["failures"][game_id] = state["failures"].get(game_id, 0) + 1


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--once", action="store_true", help="una sola pasada y termina")
    parser.add_argument("--backfill", action="store_true", help="incluye todos los partidos ya jugados sin procesar")
    parser.add_argument("--game-id", action="append", help="procesa solo este partido (repetible)")
    parser.add_argument("--limit", type=int, help="procesa como mucho N partidos por pasada")
    parser.add_argument("--dry-run", action="store_true", help="no escribe en Supabase")
    parser.add_argument("--skip-schedule", action="store_true", help="no descarga el calendario de la temporada")
    args = parser.parse_args()

    client = None
    if not (args.game_id and args.dry_run):
        if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
            sys.exit("Faltan SUPABASE_URL y/o SUPABASE_KEY en backend-data/.env")
        from supabase import create_client

        client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    if args.game_id:
        for game_id in args.game_id:
            process_game(client, game_id, args.dry_run)
        return

    state = {"schedule_synced_at": 0.0, "team_ids": team_ids(), "failures": {}}
    try:
        while True:
            try:
                run_pass(client, state, args)
            except Exception as exc:  # un corte de red no debe tumbar el watcher
                print(f"! Pasada fallida: {exc!r}")
                if args.once:  # en GitHub Actions, el código 1 manda un aviso por email
                    sys.exit(1)
            if args.once:
                break
            time.sleep(POLL_SECONDS)
    except KeyboardInterrupt:
        print("\nWatcher detenido")


if __name__ == "__main__":
    main()
