"""Tarea 5.2b — Páginas públicas de nba.com: el boxscore oficial ya corregido y la ficha de cada jugador.

La CDN (`liveData`) guarda el boxscore tal como quedó al acabar el partido: no recoge las correcciones que la
NBA hace después (una canasta mal atribuida, un rebote de más, minutos mal contados). La página del partido
en nba.com sí las trae, embebidas en `__NEXT_DATA__`: es la misma cifra que publica stats.nba.com.
"""
import json
import re
import time

import requests

TIMEOUT = 60
RETRIES = 3
GAME_URL = "https://www.nba.com/game/{game_id}/box-score"
PLAYER_URL = "https://www.nba.com/player/{player_id}"
HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
           "Accept": "text/html,application/xhtml+xml", "Accept-Language": "en-US,en;q=0.9"}
NEXT_DATA = re.compile(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', re.S)


class NotAvailable(Exception):
    """nba.com no tiene (todavía) esa página o ese dato."""


def page_props(url: str) -> dict:
    last_error = None
    for attempt in range(1, RETRIES + 1):
        try:
            response = requests.get(url, headers=HEADERS, timeout=TIMEOUT)
            if response.status_code == 404:
                raise NotAvailable(f"404 {url}")
            response.raise_for_status()
            match = NEXT_DATA.search(response.text)
            if not match:
                raise RuntimeError(f"{url} ya no trae __NEXT_DATA__ (¿ha cambiado nba.com?)")
            return json.loads(match.group(1))["props"]["pageProps"]
        except NotAvailable:
            raise
        except (requests.RequestException, ValueError, KeyError) as exc:
            last_error = exc
            if attempt < RETRIES:
                time.sleep(5 * attempt)
    raise RuntimeError(f"nba.com no responde tras {RETRIES} intentos: {last_error!r}")


def game_box(game_id: str) -> dict:
    """Boxscore oficial (corregido) de un partido terminado: {gameId, gameStatus, homeTeam, awayTeam}."""
    game = page_props(GAME_URL.format(game_id=game_id)).get("game") or {}
    if game.get("gameId") != game_id:
        raise RuntimeError(f"La página de nba.com no es la del partido {game_id}")
    if game.get("gameStatus") != 3:
        raise NotAvailable(f"nba.com aún no da el partido {game_id} por terminado")
    for side in ("homeTeam", "awayTeam"):
        if not (game.get(side) or {}).get("players"):
            raise NotAvailable(f"nba.com aún no tiene el boxscore del partido {game_id}")
    # Algunas páginas muestran el boxscore en directo (minutos 'PT23M56.00S', el formato de la CDN) en vez de
    # la estadística oficial ('23:56'): son las mismas cifras de la CDN, sin correcciones
    minutes = [str(p["statistics"].get("minutes") or "") for side in ("homeTeam", "awayTeam") for p in game[side]["players"]]
    if any(m.startswith("PT") for m in minutes):
        raise NotAvailable(f"nba.com aún no tiene la estadística oficial del partido {game_id} (solo la del directo)")
    return game


def player_info(player_id: int) -> dict:
    """Ficha del jugador (la de commonplayerinfo): HEIGHT, WEIGHT, COUNTRY, BIRTHDATE, DRAFT_*, POSITION..."""
    info = ((page_props(PLAYER_URL.format(player_id=player_id)).get("player") or {}).get("info")) or {}
    if int(info.get("PERSON_ID") or 0) != player_id:
        raise NotAvailable(f"nba.com no tiene la ficha del jugador {player_id}")
    return info
