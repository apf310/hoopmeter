"""Tarea 5.2b — Clasificación a partir de los resultados (sin stats.nba.com). Funciones puras.

Balances, casa/fuera, últimos 10, racha y puntos salen directamente de los partidos `Final` de temporada
regular (gameId 002: la Copa cuenta, salvo su final, que es 006). El puesto en la conferencia aplica los
criterios de desempate oficiales de la NBA:

  Dos equipos                                     Tres o más equipos
  1. Enfrentamientos directos                     1. Líder de división
  2. Líder de división                            2. Enfrentamientos entre todos los empatados
  3. Balance en la división (si es la misma)      3. Balance en la división (si todos son de la misma)
  4. Balance en la conferencia                    4. Balance en la conferencia
  5. Contra equipos de playoffs de su conferencia 5. Contra equipos de playoffs de su conferencia
  6. Contra equipos de playoffs de la otra        6. Diferencia de puntos
  7. Diferencia de puntos

Cuando un criterio separa a los empatados, cada subgrupo que siga empatado vuelve a empezar desde el
primer criterio (con la lista de dos equipos si quedan dos). El sorteo final de la NBA se sustituye por el
orden alfabético: solo puede darse con todo idéntico, incluida la diferencia de puntos.
"""
from collections import defaultdict
from dataclasses import dataclass, field
from decimal import ROUND_HALF_UP, Decimal
from fractions import Fraction

# Puestos que cuentan como "equipos de playoffs" en los desempates (con el play-in, del 1 al 10)
PLAYOFF_SPOTS = 10


@dataclass
class Result:
    when: str          # fecha y hora UTC (ordena los partidos)
    opponent: int
    won: bool
    home: bool
    pts: int
    opp_pts: int
    neutral: bool = False  # campo neutral: cuenta en el balance, pero ni en casa ni fuera (NBA desde 2024-25)


@dataclass
class TeamRecord:
    team_id: int
    conference: str | None
    division: str | None
    results: list[Result] = field(default_factory=list)

    @property
    def wins(self) -> int:
        return sum(r.won for r in self.results)

    @property
    def losses(self) -> int:
        return len(self.results) - self.wins

    def pct(self, keep=lambda r: True) -> Fraction | None:
        games = [r for r in self.results if keep(r)]
        return Fraction(sum(r.won for r in games), len(games)) if games else None


def round_half_up(value: Fraction | float, digits: int = 1) -> float:
    quantum = Decimal(1).scaleb(-digits)
    if isinstance(value, Fraction):
        exact = Decimal(value.numerator) / Decimal(value.denominator)
    else:
        exact = Decimal(str(value))
    return float(exact.quantize(quantum, rounding=ROUND_HALF_UP))


def build_records(games: list[dict], teams: dict[int, dict]) -> dict[int, TeamRecord]:
    """`games`: partidos terminados de temporada regular ({home_team_id, away_team_id, home_score,
    away_score, game_datetime_utc, is_neutral?}). `teams`: {id: {conference, division}} (los 30 equipos)."""
    records = {tid: TeamRecord(tid, t.get("conference"), t.get("division")) for tid, t in teams.items()}
    for g in sorted(games, key=lambda g: (g["game_datetime_utc"], g["id"])):
        home, away = g["home_team_id"], g["away_team_id"]
        hs, as_ = g["home_score"], g["away_score"]
        if home not in records or away not in records:
            raise ValueError(f"Partido {g['id']} con un equipo desconocido")
        if hs is None or as_ is None or hs == as_:
            raise ValueError(f"Partido {g['id']} terminado sin marcador válido")
        neutral = bool(g.get("is_neutral"))
        records[home].results.append(Result(g["game_datetime_utc"], away, hs > as_, True, hs, as_, neutral))
        records[away].results.append(Result(g["game_datetime_utc"], home, as_ > hs, False, as_, hs, neutral))
    return records


# ---------- Desempates ----------

class Ranker:
    def __init__(self, records: dict[int, TeamRecord], names: dict[int, str] | None = None, playoff_spots: int = PLAYOFF_SPOTS):
        self.records = records
        self.names = names or {}
        self.playoff_spots = playoff_spots
        self._division_leaders: set[int] | None = None
        self._playoff_teams: dict[str, set[int]] = {}

    # --- datos de apoyo ---
    def conf(self, tid: int) -> str | None:
        return self.records[tid].conference

    def div(self, tid: int) -> str | None:
        return self.records[tid].division

    def overall(self, tid: int) -> Fraction:
        return self.records[tid].pct() or Fraction(0)

    def division_leaders(self) -> set[int]:
        """Líder de cada división; un empate por el liderato se decide con los mismos desempates."""
        if self._division_leaders is None:
            by_division = defaultdict(list)
            for tid, r in self.records.items():
                by_division[r.division].append(tid)
            leaders = set()
            for teams in by_division.values():
                ordered = self.order(teams, use_division_leader=False)
                leaders.add(ordered[0])
            self._division_leaders = leaders
        return self._division_leaders

    def playoff_teams(self, conference: str | None) -> set[int]:
        """Equipos en puesto de playoffs (1-10) por porcentaje de victorias, empatados en el corte incluidos."""
        if conference not in self._playoff_teams:
            teams = [t for t, r in self.records.items() if r.conference == conference]
            pcts = sorted((self.overall(t) for t in teams), reverse=True)
            cut = pcts[min(self.playoff_spots, len(pcts)) - 1] if pcts else Fraction(0)
            self._playoff_teams[conference] = {t for t in teams if self.overall(t) >= cut}
        return self._playoff_teams[conference]

    def pct_against(self, tid: int, opponents: set[int]) -> Fraction | None:
        return self.records[tid].pct(lambda r: r.opponent in opponents)

    def point_diff(self, tid: int) -> int:
        return sum(r.pts - r.opp_pts for r in self.records[tid].results)

    # --- criterios: devuelven un valor por equipo (más alto = mejor) o None si no aplican ---
    def c_head_to_head(self, group: list[int]):
        values = {t: self.pct_against(t, set(group) - {t}) for t in group}
        # Si alguno no se ha enfrentado aún a los demás, el criterio no puede separar
        return None if any(v is None for v in values.values()) else values

    def c_division_leader(self, group: list[int]):
        leaders = self.division_leaders()
        return {t: int(t in leaders) for t in group}

    def c_division_record(self, group: list[int]):
        if len({self.div(t) for t in group}) != 1:
            return None
        values = {t: self.pct_against(t, {o for o in self.records if o != t and self.div(o) == self.div(t)}) for t in group}
        return None if any(v is None for v in values.values()) else values

    def c_conference_record(self, group: list[int]):
        values = {t: self.pct_against(t, {o for o in self.records if o != t and self.conf(o) == self.conf(t)}) for t in group}
        return None if any(v is None for v in values.values()) else values

    def c_playoff_own(self, group: list[int]):
        values = {t: self.pct_against(t, self.playoff_teams(self.conf(t)) - {t}) for t in group}
        return None if any(v is None for v in values.values()) else values

    def c_playoff_other(self, group: list[int]):
        values = {}
        for t in group:
            other = next((r.conference for r in self.records.values() if r.conference != self.conf(t)), None)
            values[t] = self.pct_against(t, self.playoff_teams(other))
        return None if any(v is None for v in values.values()) else values

    def c_point_diff(self, group: list[int]):
        return {t: self.point_diff(t) for t in group}

    def criteria(self, size: int, use_division_leader: bool):
        if size == 2:
            chain = [self.c_head_to_head, self.c_division_leader, self.c_division_record, self.c_conference_record,
                     self.c_playoff_own, self.c_playoff_other, self.c_point_diff]
        else:
            chain = [self.c_division_leader, self.c_head_to_head, self.c_division_record, self.c_conference_record,
                     self.c_playoff_own, self.c_point_diff]
        return [c for c in chain if use_division_leader or c != self.c_division_leader]

    def break_tie(self, group: list[int], use_division_leader: bool) -> list[int]:
        if len(group) == 1:
            return group
        for criterion in self.criteria(len(group), use_division_leader):
            values = criterion(group)
            if values is None or len(set(values.values())) == 1:
                continue
            ordered = []
            for value in sorted(set(values.values()), reverse=True):
                ordered += self.break_tie([t for t in group if values[t] == value], use_division_leader)
            return ordered
        return sorted(group, key=lambda t: self.names.get(t, str(t)))  # en lugar del sorteo

    def order(self, teams: list[int], use_division_leader: bool = True) -> list[int]:
        ordered = []
        for pct in sorted({self.overall(t) for t in teams}, reverse=True):
            ordered += self.break_tie([t for t in teams if self.overall(t) == pct], use_division_leader)
        return ordered

    def conference_ranks(self) -> dict[int, int]:
        ranks = {}
        for conference in {r.conference for r in self.records.values()}:
            teams = [t for t, r in self.records.items() if r.conference == conference]
            for i, tid in enumerate(self.order(teams), 1):
                ranks[tid] = i
        return ranks


# ---------- Extras de la tabla ----------

def record_text(results: list[Result]) -> str:
    wins = sum(r.won for r in results)
    return f"{wins}-{len(results) - wins}"


def streak(results: list[Result]) -> str | None:
    if not results:
        return None
    last = results[-1].won
    n = 0
    for r in reversed(results):
        if r.won != last:
            break
        n += 1
    return f"{'W' if last else 'L'}{n}"


def standings_extra(record: TeamRecord) -> dict:
    results = record.results
    gp = len(results)
    if not gp:
        return {"streak": None, "l10": None, "home": None, "road": None, "ppg": None, "opp_ppg": None, "diff_ppg": None, "form": []}
    pts = sum(r.pts for r in results)
    opp = sum(r.opp_pts for r in results)
    ppg, opp_ppg = round_half_up(Fraction(pts, gp)), round_half_up(Fraction(opp, gp))
    return {
        "streak": streak(results),
        "l10": record_text(results[-10:]),
        "home": record_text([r for r in results if r.home and not r.neutral]),
        "road": record_text([r for r in results if not r.home and not r.neutral]),
        "ppg": ppg,
        "opp_ppg": opp_ppg,
        "diff_ppg": round_half_up(Fraction(pts - opp, gp)),
        "form": ["W" if r.won else "L" for r in results[-10:]],
    }


def compute(games: list[dict], teams: dict[int, dict], names: dict[int, str] | None = None,
            playoff_spots: int = PLAYOFF_SPOTS) -> dict[int, dict]:
    """{team_id: {wins, losses, conf_rank, standings_extra}} para los 30 equipos."""
    records = build_records(games, teams)
    ranks = Ranker(records, names, playoff_spots).conference_ranks()
    return {
        tid: {"wins": r.wins, "losses": r.losses, "conf_rank": ranks[tid], "standings_extra": standings_extra(r)}
        for tid, r in records.items()
    }


def check(result: dict[int, dict], games: list[dict], teams: dict[int, dict]) -> None:
    """Comprobaciones antes de escribir nada: si falla algo, se conserva la clasificación anterior."""
    if len(result) != 30:
        raise ValueError(f"Clasificación con {len(result)} equipos")
    total_w = sum(t["wins"] for t in result.values())
    total_l = sum(t["losses"] for t in result.values())
    if total_w != len(games) or total_l != len(games):
        raise ValueError(f"Victorias ({total_w}) y derrotas ({total_l}) no cuadran con {len(games)} partidos")
    by_conf = defaultdict(list)
    for tid, t in result.items():
        by_conf[teams[tid].get("conference")].append(t["conf_rank"])
    for ranks in by_conf.values():
        if sorted(ranks) != list(range(1, len(ranks) + 1)):
            raise ValueError(f"Puestos de conferencia repetidos o con huecos: {sorted(ranks)}")
