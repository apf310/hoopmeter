"""Tarea 5.2b — Estadísticas de temporada, carrera, récords y métricas del radar a partir de los boxscores.
Funciones puras (sin red ni base de datos).

- Temporada en curso: se suman los partidos de `player_game_stats` (002 regular, 004 playoffs). Los
  promedios se redondean como la NBA (a la mitad hacia arriba sobre el valor exacto).
- Carrera = totales exactos de las temporadas anteriores (`totals.history`, guardados una vez desde la NBA)
  + la temporada en curso. Sin historial fiable no se escribe carrera: mejor sin dato que con uno falso.
- Récords personales (temporada regular y playoffs, como la NBA): el guardado o un partido nuevo que lo
  iguale o supere (ante empates gana el más reciente, igual que la NBA).
- Radar: las mismas métricas que pedíamos a stats.nba.com. Las de volumen y acierto son exactas; USG%,
  AST%, REB% y PIE usan la fórmula oficial con los totales del partido repartidos por minutos en pista
  (correlación con las oficiales de 2025-26: 0,999 / 0,997 / 0,999 / 0,996). DEF_RATING usa los puntos
  recibidos con el jugador en pista (dato exacto del boxscore) por cada 100 posesiones mientras juega
  (0,97: la NBA cuenta las posesiones jugada a jugada).
"""
from dataclasses import dataclass, field
from datetime import date
from decimal import ROUND_HALF_UP, Decimal
from fractions import Fraction

from processors.box_stats import PLAYOFFS, REGULAR_SEASON, SEASON_TYPES

COUNT_KEYS = ("pts", "fgm", "fga", "fg3m", "fg3a", "ftm", "fta", "oreb", "dreb", "reb", "ast", "stl", "blk", "tov", "pf")
TOTAL_KEYS = ("gp", "gs", "min", *COUNT_KEYS)
# Clave del récord en la NBA (CareerHighs.STAT) -> columna de player_game_stats
HIGH_KEYS = {"PTS": "pts", "REB": "reb", "AST": "ast", "STL": "stl", "BLK": "blk", "FGM": "fgm", "FGA": "fga",
             "FG3M": "fg3m", "FG3A": "fg3a", "FTM": "ftm", "FTA": "fta", "OREB": "oreb", "DREB": "dreb"}


def round_half_up(value, digits: int = 1) -> float | None:
    if value is None:
        return None
    exact = Decimal(value.numerator) / Decimal(value.denominator) if isinstance(value, Fraction) else Decimal(str(value))
    return float(exact.quantize(Decimal(1).scaleb(-digits), rounding=ROUND_HALF_UP))


def exact(value) -> Fraction:
    """Fraction exacta de un número guardado (los segundos pueden traer centésimas)."""
    return Fraction(Decimal(str(value)))


# ---------- Totales ----------

@dataclass
class Totals:
    gp: int = 0
    gs: int = 0
    seconds: Fraction = Fraction(0)
    counts: dict = field(default_factory=lambda: dict.fromkeys(COUNT_KEYS, 0))

    def add_game(self, row: dict) -> None:
        self.gp += 1
        self.gs += bool(row["starter"])
        self.seconds += exact(row["seconds"])
        for k in COUNT_KEYS:
            self.counts[k] += int(row[k])

    def as_dict(self) -> dict:
        """Formato de `player_season_stats.totals` (minutos con 2 decimales)."""
        return {"gp": self.gp, "gs": self.gs, "min": round_half_up(self.seconds / 60, 2), **self.counts}


@dataclass
class PlayerSeason:
    """Una temporada de un jugador en un tipo de partido (regular o playoffs)."""
    player_id: int
    season_id: str
    season_type: str
    total: Totals = field(default_factory=Totals)
    by_team: dict = field(default_factory=dict)        # team_id -> Totals
    team_order: list = field(default_factory=list)     # equipos en orden cronológico
    last_team: int | None = None
    games: list = field(default_factory=list)          # filas de partido (para los récords)


def aggregate(rows: list[dict]) -> dict[tuple[int, str, str], PlayerSeason]:
    """{(player_id, season_id, season_type): PlayerSeason} con los partidos 002 y 004."""
    seasons: dict[tuple[int, str, str], PlayerSeason] = {}
    for row in sorted(rows, key=lambda r: (str(r["game_date"]), r["game_id"])):
        season_type = SEASON_TYPES.get(row["game_type"])
        if season_type is None:
            continue
        key = (int(row["player_id"]), row["season_id"], season_type)
        ps = seasons.get(key) or seasons.setdefault(key, PlayerSeason(*key))
        ps.total.add_game(row)
        team = int(row["team_id"])
        if team not in ps.by_team:
            ps.by_team[team] = Totals()
            ps.team_order.append(team)
        ps.by_team[team].add_game(row)
        ps.last_team = team
        ps.games.append(row)
    return seasons


def per_game(t: Totals | dict, key: str) -> float | None:
    gp = t.gp if isinstance(t, Totals) else t.get("gp")
    value = (t.counts.get(key) if isinstance(t, Totals) else t.get(key))
    if not gp or value is None:
        return None
    return round_half_up(Fraction(exact(value)) / gp)


def shooting(t: dict) -> dict:
    """% de tiro y TS% a partir de totales (dict con fgm, fga, ...). Sin intentos: 0.0, como la NBA."""
    def pct(made, att):
        if made is None or att is None:
            return None
        return round_half_up(Fraction(int(made), int(att)), 3) if att else 0.0
    ts = None
    if t.get("pts") is not None and t.get("fga") is not None and t.get("fta") is not None:
        den = 2 * (Fraction(int(t["fga"])) + Fraction(44, 100) * int(t["fta"]))
        ts = round_half_up(Fraction(int(t["pts"])) / den, 3) if den else None
    return {"fg": pct(t.get("fgm"), t.get("fga")), "fg3": pct(t.get("fg3m"), t.get("fg3a")),
            "ft": pct(t.get("ftm"), t.get("fta")), "ts": ts}


def line_from_totals(t: dict) -> dict:
    """Promedios por partido (formato de player_season_stats) a partir de un dict de totales."""
    gp = t.get("gp") or 0
    avg = lambda k: None if not gp or t.get(k) is None else round_half_up(exact(t[k]) / gp)
    s = shooting(t)
    return {
        "games_played": gp,
        "pts": avg("pts"), "reb": avg("reb"), "ast": avg("ast"),
        "fg_pct": s["fg"], "fg3_pct": s["fg3"],
        "advanced": {
            "gs": t.get("gs"), "min": avg("min"), "stl": avg("stl"), "blk": avg("blk"), "tov": avg("tov"),
            "fg3m": avg("fg3m"), "fg3a": avg("fg3a"), "ft_pct": s["ft"], "ts_pct": s["ts"],
        },
    }


def season_row(ps: PlayerSeason, abbreviations: dict[int, str], valid_teams: set[int], age: int | None) -> dict:
    """Fila de `player_season_stats` de la temporada en curso (mismo formato que fetch_career_awards)."""
    totals = ps.total.as_dict()
    line = line_from_totals(totals)
    traded = len(ps.team_order) > 1
    extra = {"team_abbreviation": "TOT" if traded else abbreviations.get(ps.last_team), "age": age}
    if traded:
        extra["teams"] = [{
            "team_id": tid,
            "team_abbreviation": abbreviations.get(tid),
            "gp": ps.by_team[tid].gp,
            "pts": per_game(ps.by_team[tid], "pts"),
            "reb": per_game(ps.by_team[tid], "reb"),
            "ast": per_game(ps.by_team[tid], "ast"),
        } for tid in ps.team_order]
    return {
        "id": f"{ps.player_id}_{ps.season_id}_{ps.season_type}",
        "player_id": ps.player_id,
        "season_id": ps.season_id,
        "team_id": ps.last_team if ps.last_team in valid_teams else None,
        "season_type": ps.season_type,
        "games_played": line["games_played"],
        "pts": line["pts"], "reb": line["reb"], "ast": line["ast"],
        "fg_pct": line["fg_pct"], "fg3_pct": line["fg3_pct"],
        "advanced_stats": {**line["advanced"], **extra},
        "totals": totals,
    }


def add_totals(a: dict | None, b: dict | None) -> dict | None:
    """Suma dos dicts de totales; un campo desconocido (None) en cualquiera de los dos queda desconocido."""
    if a is None or b is None:
        return a if b is None else b
    out = {}
    for k in TOTAL_KEYS:
        va, vb = a.get(k), b.get(k)
        out[k] = None if va is None or vb is None else (round(va + vb, 2) if k == "min" else int(va) + int(vb))
    return out


def career_row(player_id: int, season_type: str, history: dict, history_through: str,
               current: dict | None, highs: dict | None) -> dict:
    """Fila "Career": historial exacto + temporada en curso (`current`, totales; None si no ha jugado)."""
    totals = add_totals(history, current) if current else dict(history)
    line = line_from_totals(totals)
    advanced = dict(line["advanced"])
    if season_type == SEASON_TYPES[REGULAR_SEASON] and highs is not None:
        advanced["career_highs"] = highs
    return {
        "id": f"{player_id}_Career_{season_type}",
        "player_id": player_id,
        "season_id": "Career",
        "team_id": None,
        "season_type": season_type,
        "games_played": line["games_played"],
        "pts": line["pts"], "reb": line["reb"], "ast": line["ast"],
        "fg_pct": line["fg_pct"], "fg3_pct": line["fg3_pct"],
        "advanced_stats": advanced,
        "totals": {**totals, "history": history, "history_through": history_through},
    }


def empty_totals() -> dict:
    return {k: 0 for k in TOTAL_KEYS} | {"min": 0.0}


# ---------- Récords personales ----------

def update_highs(stored: dict | None, games: list[dict], opponent_abbr: dict[int, str]) -> dict:
    """Récords de carrera con los partidos nuevos (temporada regular y playoffs). Ante empates, el más reciente."""
    highs = {k: dict(v) for k, v in (stored or {}).items() if k in HIGH_KEYS}
    for row in sorted(games, key=lambda r: (str(r["game_date"]), r["game_id"])):
        if row["game_type"] not in (REGULAR_SEASON, PLAYOFFS):
            continue
        for key, col in HIGH_KEYS.items():
            value = int(row[col])
            best = highs.get(key)
            if best is not None and best.get("game_id") == row["game_id"]:
                continue  # ese partido ya es el récord guardado
            if best is None or best.get("value") is None or value > best["value"] or (
                value == best["value"] and str(row["game_date"]) >= (best.get("date") or "")
            ):
                highs[key] = {"value": value, "date": str(row["game_date"]), "vs": opponent_abbr.get(int(row["opponent_id"])),
                              "game_id": row["game_id"]}
    return highs


# ---------- Edad ----------

def season_age(birth_date: str | None, season_id: str, today: date) -> int | None:
    """Edad como la da la NBA: al 1 de julio en que acaba la temporada (o hoy, si aún no ha llegado)."""
    if not birth_date:
        return None
    born = date.fromisoformat(str(birth_date)[:10])
    ref = min(today, date(int(season_id[:4]) + 1, 7, 1))
    return ref.year - born.year - ((ref.month, ref.day) < (born.month, born.day))


# ---------- Métricas del radar ----------

def possessions(t: dict) -> float:
    """Posesiones estimadas de un equipo en un partido (la variante que mejor reproduce el DEF_RATING oficial)."""
    return t["fga"] + 0.44 * t["fta"] - t["oreb"] + t["tov"]


def pie_points(x: dict) -> float:
    """Numerador del PIE oficial de la NBA (vale para un jugador, un equipo o la suma de los dos)."""
    return (x["pts"] + x["fgm"] + x["ftm"] - x["fga"] - x["fta"] + x["dreb"] + 0.5 * x["oreb"]
            + x["ast"] + x["stl"] + 0.5 * x["blk"] - x["pf"] - x["tov"])


def radar_inputs(ps: PlayerSeason, team_games: dict[tuple[str, int], dict]) -> dict | None:
    """Métricas por partido y avanzadas de una temporada (claves como LeagueDashPlayerStats)."""
    t = ps.total
    gp = t.gp
    if not gp:
        return None
    usg_num = usg_den = ast_den = reb_num = reb_den = pie_num = pie_den = drtg_num = drtg_den = 0.0
    for row in ps.games:
        team = team_games.get((row["game_id"], int(row["team_id"])))
        opp = team_games.get((row["game_id"], int(row["opponent_id"])))
        if team is None or opp is None:
            raise ValueError(f"Faltan los totales de equipo del partido {row['game_id']}")
        p_min = float(row["seconds"]) / 60
        t_min = float(team["seconds"]) / 60
        share = p_min / (t_min / 5) if t_min else 0.0  # fracción del partido que jugó
        usg_num += (row["fga"] + 0.44 * row["fta"] + row["tov"]) * (t_min / 5)
        usg_den += p_min * (team["fga"] + 0.44 * team["fta"] + team["tov"] + team.get("team_tov", 0))
        ast_den += share * team["fgm"] - row["fgm"]
        reb_num += row["reb"] * (t_min / 5)
        reb_den += p_min * (team["reb"] + opp["reb"])
        # PIE oficial: frente a lo que pasó en el partido mientras él estaba en pista
        pie_num += pie_points(row)
        pie_den += (pie_points(team) + pie_points(opp)) * share
        drtg_num += row["on_court_opp_pts"]
        drtg_den += (possessions(team) + possessions(opp)) / 2 * share
    c = t.counts
    ts_den = 2 * (c["fga"] + 0.44 * c["fta"])
    return {
        "PLAYER_ID": ps.player_id,
        "GP": gp,
        "MIN": float(t.seconds) / 60 / gp,
        "PTS": c["pts"] / gp,
        "REB": c["reb"] / gp,
        "AST": c["ast"] / gp,
        "STL": c["stl"] / gp,
        "BLK": c["blk"] / gp,
        "FG3M": c["fg3m"] / gp,
        "FG3A": c["fg3a"] / gp,
        "FG3_PCT": c["fg3m"] / c["fg3a"] if c["fg3a"] else 0.0,
        "TS_PCT": c["pts"] / ts_den if ts_den else None,
        "USG_PCT": usg_num / usg_den if usg_den else None,
        "AST_PCT": c["ast"] / ast_den if ast_den > 0 else None,
        "REB_PCT": reb_num / reb_den if reb_den else None,
        "PIE": pie_num / pie_den if pie_den else None,
        "DEF_RATING": 100 * drtg_num / drtg_den if drtg_den else None,
    }


def group_team_games(team_rows: list[dict]) -> dict[tuple[str, int], dict]:
    return {(r["game_id"], int(r["team_id"])): r for r in team_rows}


def season_frame_rows(seasons: dict, season_id: str, team_games: dict) -> list[dict]:
    """Filas del radar (temporada regular) para `season_id`."""
    out = []
    for (pid, sid, stype), ps in seasons.items():
        if sid == season_id and stype == SEASON_TYPES[REGULAR_SEASON]:
            row = radar_inputs(ps, team_games)
            if row:
                out.append(row)
    return out

