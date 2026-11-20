"""Tarea 6.14 — Texto del aviso matinal sin spoilers (puro: sin red ni base de datos).

Reglas (CLAUDE.md §4.A):
- Nunca resultados, ganador, estado ni nada de cómo acabó un partido (tampoco si hubo prórroga).
- "Sin notas" (por defecto) es solo calendario: cuántos partidos hubo y, si jugó uno de tus favoritos,
  cuál. `schedule_text` ni siquiera recibe las notas, así que no puede filtrarlas.
- "Con notas" añade la nota más alta y cuántos partidazos (8+). Solo sale cuando todos los partidos
  jugados tienen nota (`is_ready`): si faltara uno, quedarse fuera delataría que aún se estaba jugando.
- La hora del aviso nunca depende de cómo fue un partido: sale a la hora elegida. Solo "con notas" puede
  retrasarse una hora si a esa hora queda un partido por terminar (un partido tardío con varias prórrogas).
"""
from dataclasses import dataclass
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

SPAIN_TZ = ZoneInfo("Europe/Madrid")
NBA_TZ = ZoneInfo("America/New_York")

# Horas que puede elegir el usuario (hora de España). Las 7:00 no: el último partido de la costa
# oeste suele acabar sobre esa hora y "con notas" tendría que esperarle.
HOURS = (8, 9, 10)
# Última pasada: "con notas" que no estuvo listo a su hora sale en la siguiente, hasta esta
LAST_HOUR = 11
GREAT_GAME = 8.0
# Un partido que sigue "Scheduled" tantas horas después de su hora está aplazado: no se le espera
POSTPONED_AFTER = timedelta(hours=6)
# Nombres de equipo de más de una palabra (el resto: la última palabra de "Boston Celtics")
MULTIWORD_NICKNAMES = ("Trail Blazers",)

TITLE = "La jornada de anoche ya está lista"
TEST_TITLE = "Aviso de prueba"
TEST_BODY = "Así te llegará el aviso de cada mañana. Sin resultados, como siempre."


@dataclass(frozen=True)
class Game:
    id: str
    start_utc: str  # ISO ("2026-11-19T00:30:00+00:00")
    away_team_id: int
    home_team_id: int


def _when(iso: str) -> datetime:
    return datetime.fromisoformat(iso.replace("Z", "+00:00"))


def spain_hour(now_utc: datetime) -> int:
    return now_utc.astimezone(SPAIN_TZ).hour


def last_night(now_utc: datetime) -> str:
    """Jornada NBA (fecha de Nueva York) que se acaba de jugar, vista una mañana en España.

    A las 8:00 en España son las 2:00 en Nueva York: la jornada de ese día aún no ha empezado, así que
    "anoche" es la del día anterior en España (incluidos los partidos de la tarde del domingo).
    """
    return (now_utc.astimezone(SPAIN_TZ).date() - timedelta(days=1)).isoformat()


def day_bounds_utc(day: str) -> tuple[str, str]:
    """Inicio y fin (UTC) de una jornada NBA, para filtrar `games.game_datetime_utc`."""
    start = datetime.fromisoformat(day).replace(tzinfo=NBA_TZ)
    end = start + timedelta(days=1)
    return start.astimezone(ZoneInfo("UTC")).isoformat(), end.astimezone(ZoneInfo("UTC")).isoformat()


def nickname(full_name: str) -> str:
    for name in MULTIWORD_NICKNAMES:
        if full_name.endswith(name):
            return name
    return full_name.split()[-1]


def matchup(game: Game, names: dict[int, str]) -> str:
    """"Celtics-Magic" (visitante-local, como en la lista de partidos)."""
    return f"{nickname(names.get(game.away_team_id, '?'))}-{nickname(names.get(game.home_team_id, '?'))}"


def _ordered(games: list[Game]) -> list[Game]:
    return sorted(games, key=lambda g: (_when(g.start_utc), g.id))


def favorite_game(games: list[Game], team_ids: set[int]) -> Game | None:
    """El primero (por hora) de los partidos de tus favoritos. Nunca se elige por su nota."""
    return next((g for g in _ordered(games) if g.away_team_id in team_ids or g.home_team_id in team_ids), None)


def _count(n: int) -> str:
    return "1 partido" if n == 1 else f"{n} partidos"


def _score(value: float) -> str:
    return f"{value:.1f}".replace(".", ",")


def schedule_text(games: list[Game], names: dict[int, str], team_ids: set[int]) -> tuple[str, str]:
    """Aviso "sin notas": solo calendario. No recibe notas ni estados."""
    fav = favorite_game(games, team_ids)
    if len(games) == 1 and fav:
        return TITLE, f"1 partido: {matchup(fav, names)}."
    if fav:
        return TITLE, f"{_count(len(games))}, incluido un {matchup(fav, names)}."
    return TITLE, f"{_count(len(games))}."


def scores_text(games: list[Game], scores: dict[str, float], names: dict[int, str], team_ids: set[int]) -> tuple[str, str]:
    """Aviso "con notas": la nota más alta, cuántos partidazos y, si no es el mejor, el de tus favoritos."""
    scored = [g for g in games if scores.get(g.id) is not None]
    if not scored:
        return schedule_text(games, names, team_ids)
    best = sorted(scored, key=lambda g: (-scores[g.id], _when(g.start_utc), g.id))[0]
    great = sum(scores[g.id] >= GREAT_GAME for g in scored)
    best_text = f"{matchup(best, names)} ({_score(scores[best.id])})"
    if great >= 2:
        body = f"{_count(len(games))} y {great} partidazos: el mejor, un {best_text}."
    elif great == 1:
        body = f"{_count(len(games))} y 1 partidazo: un {best_text}."
    else:
        body = f"{_count(len(games))}. El mejor, un {best_text}."
    fav = favorite_game(scored, team_ids)
    if fav and fav.id != best.id:
        body += f" Tu {matchup(fav, names)}: {_score(scores[fav.id])}."
    return TITLE, body


def build_message(games: list[Game], scores: dict[str, float], names: dict[int, str], team_ids: set[int], with_scores: bool) -> tuple[str, str]:
    if with_scores:
        return scores_text(games, scores, names, team_ids)
    return schedule_text(games, names, team_ids)


def is_ready(rows: list[dict], now_utc: datetime) -> bool:
    """¿Tienen nota todos los partidos jugados de la jornada? Los aplazados no se esperan."""
    for row in rows:
        if row.get("excitement_score") is not None:
            continue
        if row.get("status") == "Scheduled" and now_utc - _when(row["game_datetime_utc"]) > POSTPONED_AFTER:
            continue
        return False
    return True


def is_due(sub_hour: int, last_sent_day: str | None, day: str, hour_now: int) -> bool:
    """Le toca a esta suscripción: ya es su hora (o la pasó hoy sin recibirlo) y no lo tiene."""
    return last_sent_day != day and sub_hour <= hour_now <= LAST_HOUR
