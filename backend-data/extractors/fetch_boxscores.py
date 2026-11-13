"""Tarea 5.2b — Boxscores de cada partido -> `player_game_stats` y `team_game_stats`.

De aquí salen las estadísticas de temporada, la carrera, los récords y el radar (stats.nba.com bloquea la
nube). Dos fuentes por partido:
  - CDN (`liveData`): el boxscore al acabar, con los puntos a favor/en contra de cada jugador en pista.
  - nba.com (página del partido): las cifras oficiales ya corregidas (la NBA corrige a veces una canasta
    mal atribuida, un rebote o unos minutos días después; la CDN nunca recoge esas correcciones).
Se guarda la combinación (box_stats.apply_official). Si nba.com no responde, se guarda lo de la CDN y el
partido queda "sin corregir" hasta que se pueda.

El watcher guarda cada partido nada más ponerle la nota (solo CDN). Este script, en el job diario:
  1. los partidos terminados que falten, 2. los de los últimos 3 días, 3. los que quedaron sin corregir y
  4. por turnos, el resto de la temporada: cada partido se vuelve a comprobar una vez por semana.

Uso (desde backend-data/):
    python -m extractors.fetch_boxscores                       # lo anterior
    python -m extractors.fetch_boxscores --all                 # toda la temporada (carga inicial)
    python -m extractors.fetch_boxscores --game-id 0022600222  # partidos concretos (repetible)
    python -m extractors.fetch_boxscores --cdn-only            # sin nba.com (más rápido, sin correcciones)
    python -m extractors.fetch_boxscores --dry-run             # descarga y comprueba, sin escribir

Sale con 1 si algo falla y con 2 si algún partido terminado no tiene un boxscore válido o si nba.com no ha
respondido para ninguno (bloqueo o cambio de formato): en GitHub Actions, cualquiera de los dos manda un
aviso por email. Una página que aún no tiene la estadística oficial no es un error: se reintenta. Nunca
imprime marcadores (el registro es público).
"""
import argparse
import math
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

from db import connect, save_status, select_all, upsert
from extractors import nba_cdn, nba_web
from processors.box_stats import BoxScoreError, apply_official, rows_from_box

REFRESH_DAYS = 3
RECHECK_DAYS = 7      # cada partido se vuelve a comprobar en nba.com una vez por semana
WORKERS = 4           # la página del partido en nba.com tarda varios segundos
SYNC_ID = "boxscores"


def rows_for(box: dict, official: dict | None) -> tuple[list, list, list, bool]:
    """Filas del partido con las cifras oficiales si las hay. (jugadores, equipos, personas, corregido)."""
    if official is not None:
        try:
            return (*rows_from_box(apply_official(box, official)), True)
        except BoxScoreError as exc:  # lo oficial no cuadra (a medio corregir): se usa la CDN y se reintenta
            print(f"  ~ {box['gameId']}: cifras oficiales incoherentes ({exc}); se usa la CDN")
    return (*rows_from_box(box), False)


def save_rows(client, game_id: str, player_rows: list[dict], team_rows: list[dict], people: list[dict]) -> None:
    # Jugadores que aún no están en `players` (p. ej. un contrato de 10 días): se crean con lo mínimo y nunca
    # se toca a los que ya existen
    upsert(client, "players", [{**p, "is_active": True} for p in people], ignore_duplicates=True)
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    upsert(client, "team_game_stats", [{**r, "fetched_at": now} for r in team_rows])
    upsert(client, "player_game_stats", [{**r, "fetched_at": now} for r in player_rows])
    # Si una corrección quita a un jugador del partido, se borra su fila
    keep = {r["id"] for r in player_rows}
    stored = client.table("player_game_stats").select("id").eq("game_id", game_id).execute().data
    stale = [r["id"] for r in stored if r["id"] not in keep]
    if stale:
        client.table("player_game_stats").delete().in_("id", stale).execute()


def save_game(client, box: dict, official: dict | None = None) -> int:
    """Guarda un partido terminado (idempotente). Devuelve los jugadores guardados.
    Lanza BoxScoreError si el boxscore no cuadra."""
    player_rows, team_rows, people, _ = rows_for(box, official)
    save_rows(client, box["gameId"], player_rows, team_rows, people)
    return len(player_rows)


def current_season_code(client) -> str | None:
    """'26' para 2026-27: la temporada del último partido terminado."""
    last = (client.table("games").select("id").eq("status", "Final")
            .order("game_datetime_utc", desc=True).limit(1).execute().data)
    return last[0]["id"][3:5] if last else None


def final_games(client, season_code: str) -> list[dict]:
    return select_all(client, "games", "id, game_datetime_utc",
                      lambda q: q.eq("status", "Final").like("id", f"___{season_code}%"))


def stored_games(client, season_code: str) -> dict[str, str]:
    """{game_id: cuándo se descargó por última vez}."""
    rows = select_all(client, "team_game_stats", "id, game_id, fetched_at", lambda q: q.like("game_id", f"___{season_code}%"))
    out = {}
    for r in rows:
        out[r["game_id"]] = min(out.get(r["game_id"], r["fetched_at"]), r["fetched_at"])
    return out


def previous_uncorrected(client) -> set[str]:
    rows = client.table("sync_status").select("details").eq("id", SYNC_ID).execute().data
    return set(((rows[0]["details"] or {}).get("uncorrected") or []) if rows else [])


def is_stored(client, game_id: str) -> bool:
    return bool(client.table("team_game_stats").select("id").eq("game_id", game_id).limit(1).execute().data)


def save_new_game(client, box: dict) -> bool:
    """Para el watcher: guarda el boxscore de la CDN solo si el partido aún no está guardado (nunca pisa unas
    cifras oficiales ya corregidas) y lo apunta como "sin corregir" para que el job diario lo corrija."""
    if is_stored(client, box["gameId"]):
        return False
    save_game(client, box)
    rows = client.table("sync_status").select("details").eq("id", SYNC_ID).execute().data
    details = dict((rows[0]["details"] or {}) if rows else {})
    details["uncorrected"] = sorted(set(details.get("uncorrected") or []) | {box["gameId"]})
    client.table("sync_status").upsert({"id": SYNC_ID, "details": details}, on_conflict="id").execute()
    return True


def games_to_fetch(client, season_code: str, everything: bool, uncorrected: set[str]) -> list[str]:
    finals = final_games(client, season_code)
    if everything:
        return sorted(g["id"] for g in finals)
    have = stored_games(client, season_code)
    since = (datetime.now(timezone.utc) - timedelta(days=REFRESH_DAYS)).isoformat()
    wanted = {g["id"] for g in finals if g["id"] not in have or g["game_datetime_utc"] >= since or g["id"] in uncorrected}
    # Por turnos: los comprobados hace más tiempo, lo justo para dar la vuelta a la temporada cada semana
    rest = sorted((have[g["id"]], g["id"]) for g in finals if g["id"] in have and g["id"] not in wanted)
    wanted |= {gid for _, gid in rest[:math.ceil(len(finals) / RECHECK_DAYS)]}
    return sorted(wanted)


def download(game_id: str, with_official: bool):
    """(game_id, boxscore de la CDN o excepción, oficial o excepción/None)."""
    try:
        box = nba_cdn.boxscore(game_id)
    except Exception as exc:
        return game_id, exc, None
    official = None
    if with_official:
        try:
            official = nba_web.game_box(game_id)
        except Exception as exc:
            official = exc
    return game_id, box, official


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--all", action="store_true", help="toda la temporada en curso")
    parser.add_argument("--game-id", action="append", help="solo este partido (repetible)")
    parser.add_argument("--cdn-only", action="store_true", help="sin las correcciones de nba.com")
    parser.add_argument("--dry-run", action="store_true", help="descarga y comprueba, sin escribir")
    args = parser.parse_args()

    client = connect()
    uncorrected = previous_uncorrected(client)
    if args.game_id:
        game_ids = args.game_id
    else:
        code = current_season_code(client)
        game_ids = games_to_fetch(client, code, args.all, uncorrected) if code else []
    print(f"Boxscores por descargar: {len(game_ids)}{' (solo CDN)' if args.cdn_only else ''}")

    invalid, failed, corrected, not_corrected, saved, players, web_errors = [], [], 0, [], 0, 0, 0
    with ThreadPoolExecutor(WORKERS) as pool:
        for i, (game_id, box, official) in enumerate(pool.map(lambda g: download(g, not args.cdn_only), game_ids), 1):
            try:
                if isinstance(box, Exception):
                    raise box
                if isinstance(official, Exception):
                    if not isinstance(official, nba_web.NotAvailable):  # no responde o ha cambiado (no "aún no")
                        web_errors += 1
                        print(f"  ~ {game_id}: nba.com sin respuesta ({official})")
                    official = None
                player_rows, team_rows, people, is_official = rows_for(box, official)
                if not args.dry_run:
                    save_rows(client, game_id, player_rows, team_rows, people)
                saved += 1
                players += len(player_rows)
                if is_official:
                    corrected += 1
                    uncorrected.discard(game_id)
                else:
                    not_corrected.append(game_id)
                    uncorrected.add(game_id)
            except (BoxScoreError, nba_cdn.NotAvailable) as exc:  # la NBA no tiene el boxscore completo
                invalid.append(game_id)
                print(f"  ! {game_id}: {exc}")
            except Exception as exc:  # red o base de datos: se sigue con el resto y se avisa al final
                failed.append(game_id)
                print(f"  ! {game_id}: {exc!r}")
            if i % 50 == 0:
                print(f"  {i}/{len(game_ids)}")

    print(f"Guardados: {saved} partidos ({players} líneas de jugador) · con cifras oficiales: {corrected} · "
          f"solo CDN: {len(not_corrected)} · sin boxscore válido: {len(invalid)} · fallidos: {len(failed)}")
    if not args.dry_run:
        error = f"{len(failed)} partidos fallidos: {failed[:10]}" if failed else None
        save_status(client, SYNC_ID, {"fetched": saved, "corrected": corrected, "invalid": invalid,
                                      "uncorrected": sorted(uncorrected)}, error)
    if failed:
        sys.exit(1)
    web_down = not args.cdn_only and game_ids and web_errors == len(game_ids)
    if web_down:
        print("  ! nba.com no ha respondido para ningún partido: las correcciones oficiales no se están aplicando")
    if invalid or web_down:
        sys.exit(2)


if __name__ == "__main__":
    main()
