"""Tarea 5.2b — Acceso a la CDN de la NBA (cdn.nba.com), la única fuente que funciona desde GitHub Actions.

stats.nba.com bloquea las IPs de la nube (GitHub, Vercel, AWS...): todo lo automático sale de aquí.
La CDN responde 403 a clientes que no parecen un navegador, así que se usan las cabeceras de `nba_api`.
Un 403 en `liveData` (boxscore, jugada a jugada) significa "partido aún sin empezar", no un bloqueo.
"""
import time

import requests
from nba_api.live.nba.library.http import NBALiveHTTP

TIMEOUT = 60
RETRIES = 3

SCHEDULE_URL = "https://cdn.nba.com/static/json/staticData/scheduleLeagueV2_1.json"
BOXSCORE_URL = "https://cdn.nba.com/static/json/liveData/boxscore/boxscore_{game_id}.json"
# Índice estático de todos los jugadores de la historia con su primera y última temporada. Está en
# stats.nba.com, pero en /js/data (archivos estáticos), que no bloquea la nube.
PLAYER_INDEX_URL = "https://stats.nba.com/js/data/ptsd/stats_ptsd.js"


class NotAvailable(Exception):
    """La NBA aún no tiene ese archivo (p. ej. el boxscore de un partido que no ha empezado)."""


def get(url: str, *, expect_json: bool = True):
    """GET con las cabeceras de nba_api y reintentos ante errores transitorios (red, 5xx, 429)."""
    headers = {k: v for k, v in NBALiveHTTP.headers.items() if k.lower() != "host"}
    last_error = None
    for attempt in range(1, RETRIES + 1):
        try:
            response = requests.get(url, headers=headers, timeout=TIMEOUT)
            if response.status_code in (403, 404):
                raise NotAvailable(f"{response.status_code} {url}")
            if response.status_code == 429 or response.status_code >= 500:
                raise requests.HTTPError(f"{response.status_code} {url}")
            response.raise_for_status()
            return response.json() if expect_json else response.text
        except NotAvailable:
            raise
        except (requests.RequestException, ValueError) as exc:  # ValueError: JSON cortado
            last_error = exc
            if attempt < RETRIES:
                time.sleep(5 * attempt)
    raise RuntimeError(f"La CDN de la NBA no responde tras {RETRIES} intentos: {last_error!r}")


def get_required(url: str, *, expect_json: bool = True):
    """Como `get`, pero un 403/404 es un error: estos archivos existen siempre."""
    try:
        return get(url, expect_json=expect_json)
    except NotAvailable as exc:
        raise RuntimeError(f"La NBA no sirve {url}: {exc}") from None


def schedule() -> dict:
    """Calendario completo de la temporada (`leagueSchedule`: seasonYear, gameDates[].games[])."""
    return get_required(SCHEDULE_URL)["leagueSchedule"]


def boxscore(game_id: str) -> dict:
    return get(BOXSCORE_URL.format(game_id=game_id))["game"]


def player_index() -> dict[int, tuple[int, int]]:
    """{player_id: (primera temporada, última temporada)} de todos los jugadores con partidos en la NBA."""
    import json
    import re

    text = get_required(PLAYER_INDEX_URL, expect_json=False)
    match = re.search(r"=\s*(\{.*\})\s*;?\s*$", text, re.S)
    if not match:
        raise RuntimeError("El índice de jugadores de la NBA ha cambiado de formato")
    players = json.loads(match.group(1))["data"]["players"]
    # Cada fila: [id, "Apellido, Nombre", activo, primera temporada, última temporada, ...]
    return {int(p[0]): (int(p[3]), int(p[4])) for p in players if str(p[3]).isdigit() and str(p[4]).isdigit()}
