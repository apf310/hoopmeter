"""Tarea 4.4 — Reglas para aplicar los movimientos oficiales de la NBA a los contratos.

Lógica pura, sin red ni base de datos: recibe el estado actual (contratos, equipo de cada jugador y
dinero muerto) y un movimiento del registro oficial de nba.com, y lo modifica en memoria.

- La NBA no publica cifras. Un contrato nuevo entra como "pending" (firmado, sin cifra pública) y
  una renovación como "pending_future" (esta temporada se conoce; los años nuevos, no).
- Two-way, 10 días y sustitutos no tienen fila, igual que en la carga inicial: no cuentan en el GM.
- Cada movimiento se puede aplicar dos veces sin efectos nuevos. Si el proceso se corta a medias,
  la siguiente ejecución lo repite sin duplicar dinero muerto ni pisar contratos.
"""
import re
from dataclasses import dataclass, field

# ---------- Cifras del convenio (revisar cada verano, igual que web-app/src/lib/trade-rules.ts) ----------
SEASON = "2026-27"
# Último día para cortar a un jugador sin que su salario de la temporada quede garantizado:
# quien sigue en plantilla al pasar los waivers del 10 de enero lo cobra entero.
GUARANTEE_WAIVE_DEADLINE = "2027-01-07"

SALARY_FIELDS = ("salary_current", "salary_year_2", "salary_year_3", "salary_year_4")

_POSITION = r"(?:guard|forward|center|guard-forward|forward-guard|forward-center|center-forward)"
# Tipos de contrato tal como los escribe la NBA en el registro de movimientos
CONTRACT_TYPES = {
    "Contract": "standard",
    "NBA Contract": "standard",  # conversión de two-way a contrato normal
    "Two-Way Contract": "two_way",
    "10-Day Contract": "ten_day",
    "Substitute Player Contract": "substitute",
    "Rest-of-Season Contract": "rest_of_season",
    "Rookie Scale Contract": "rookie_scale",
    "Rookie Scale Extension": "rookie_extension",
    "Veteran Extension": "veteran_extension",
}
# Contratos que no entran en el GM (tampoco los tenía la carga inicial)
WITHOUT_ROW = {"two_way", "ten_day", "substitute"}

_PATTERNS = {
    "Signing": re.compile(rf"^.+? (?:re-)?signed\s+(?:{_POSITION}\s+)?(?P<name>.+?) to an? (?P<kind>.+)\.$"),
    "ContractConverted": re.compile(rf"^.+? converted the contract of\s+(?:{_POSITION}\s+)?(?P<name>.+?) to an? (?P<kind>.+)\.$"),
    "Waive": re.compile(rf"^.+? waived\s+(?:{_POSITION}\s+)?(?P<name>.+?)\.$"),
    "AwardOnWaivers": re.compile(rf"^.+? claimed\s+(?:{_POSITION}\s+)?(?P<name>.+?) off waivers\.$"),
    "Trade": re.compile(rf"^.+? received\s+(?:{_POSITION}\s+)?(?P<name>.+?) from .+\.$"),
}


@dataclass(frozen=True)
class Movement:
    """Un movimiento del registro oficial, ya normalizado."""
    id: str
    date: str  # YYYY-MM-DD
    type: str  # Signing / Waive / Trade / AwardOnWaivers / ContractConverted
    player_id: int
    team_id: int
    other_team_id: int | None  # en traspasos: el equipo que lo envía
    contract_type: str | None  # clave de CONTRACT_TYPES, o None si el texto no se reconoce
    player_name: str | None
    description: str
    sequence: int  # número del movimiento en la NBA: ordena los del mismo día


def parse_movement(row: dict) -> Movement | None:
    """Fila del feed -> Movement. None si no afecta a un jugador ("received draft consideration")."""
    player_id, team_id = int(row.get("PLAYER_ID") or 0), int(row.get("TEAM_ID") or 0)
    if not player_id or not team_id:
        return None
    kind = row["Transaction_Type"]
    description = " ".join(row["TRANSACTION_DESCRIPTION"].split())  # hay textos con dobles espacios
    match = _PATTERNS.get(kind, re.compile("$^")).match(description)
    contract_type = CONTRACT_TYPES.get(match["kind"]) if match and "kind" in match.groupdict() else None
    group = row.get("GroupSort", "")
    other = int(row.get("Additional_Sort") or 0)
    return Movement(
        id=f"{group}:{player_id}:{team_id}",
        date=row["TRANSACTION_DATE"][:10],
        type=kind,
        player_id=player_id,
        team_id=team_id,
        other_team_id=other if kind == "Trade" and other else None,
        contract_type=contract_type,
        player_name=match["name"] if match else None,
        description=description,
        sequence=int(group.rsplit(" ", 1)[-1]) if group.rsplit(" ", 1)[-1].isdigit() else 0,
    )


def parse_feed(rows: list[dict], since: str) -> list[Movement]:
    """Movimientos desde `since` (incluido), sin repetidos y en orden de aplicación."""
    movements = {}
    for row in rows:
        movement = parse_movement(row)
        if movement and movement.date >= since:
            movements.setdefault(movement.id, movement)
    return sorted(movements.values(), key=lambda m: (m.date, m.sequence, m.id))


# ---------- Estado ----------

@dataclass
class State:
    """Lo que el proceso sabe de la base de datos, y lo que ha tocado para escribirlo después."""
    contracts: dict[int, dict]  # player_id -> fila de player_contracts
    team_of: dict[int, int | None]  # player_id -> players.team_id (solo jugadores que existen en `players`)
    names: dict[int, str]  # player_id -> players.full_name
    dead_money: dict[int, list[dict]]  # team_id -> teams.dead_money
    touched_contracts: set[int] = field(default_factory=set)
    touched_players: set[int] = field(default_factory=set)
    touched_teams: set[int] = field(default_factory=set)
    new_players: dict[int, dict] = field(default_factory=dict)  # jugadores que hay que crear en `players`

    def set_team(self, player_id: int, team_id: int | None) -> None:
        """Solo jugadores que existen en `players` (o que se van a crear): el resto, ya lo traerá la sincronización de plantillas."""
        if player_id in self.team_of and self.team_of[player_id] != team_id:
            self.team_of[player_id] = team_id
            self.touched_players.add(player_id)

    def put_contract(self, contract: dict, movement: "Movement") -> None:
        player_id = contract["player_id"]
        # El contrato referencia a `players`: un recién llegado se crea con lo mínimo y la sincronización de plantillas lo completa
        if player_id not in self.team_of:
            self.team_of[player_id] = movement.team_id
            self.names[player_id] = movement.player_name or f"Jugador {player_id}"
            self.new_players[player_id] = {"id": player_id, "full_name": self.names[player_id], "is_active": True}
        self.contracts[player_id] = contract
        self.touched_contracts.add(player_id)

    def drop_contract(self, player_id: int) -> dict | None:
        contract = self.contracts.pop(player_id, None)
        if contract is not None:
            self.touched_contracts.add(player_id)
        return contract

    def name_of(self, movement: Movement) -> str:
        return self.names.get(movement.player_id) or movement.player_name or f"Jugador {movement.player_id}"


@dataclass
class Result:
    outcome: str
    details: dict | None = None


def _pending_contract(movement: Movement, signed_kind: str | None) -> dict:
    """Contrato firmado según el registro oficial, sin cifra pública. `source` dice de dónde saldrán las cifras."""
    return {
        "player_id": movement.player_id,
        **{column: None for column in SALARY_FIELDS},
        "contract_option": None,
        "signed_on": movement.date,
        "signed_kind": signed_kind,
        "acquired_on": None,
        "status": "pending",
        "source": {"kind": "official", "transaction": movement.id, "description": movement.description},
    }


# ---------- Movimientos ----------

def _trade(state: State, m: Movement) -> Result:
    state.set_team(m.player_id, m.team_id)
    contract = state.contracts.get(m.player_id)
    if contract is None:
        return Result("traded_without_contract")
    # El contrato viaja tal cual; la fecha decide cuándo puede sumarse a otro salario (2 meses)
    if contract.get("acquired_on") != m.date:
        state.put_contract({**contract, "acquired_on": m.date}, m)
    return Result("traded")


def _waive(state: State, m: Movement) -> Result:
    if state.team_of.get(m.player_id) == m.team_id:
        state.set_team(m.player_id, None)
    entries = state.dead_money.setdefault(m.team_id, [])
    contract = state.drop_contract(m.player_id)
    # Repetición tras un corte a medias: el dinero muerto ya se guardó, pero el contrato aún podía seguir ahí
    if any(entry.get("txn") == m.id for entry in entries):
        return Result("waived_dead_money")
    if contract is None:
        return Result("waived_without_contract")  # two-way, 10 días, Exhibit 10…

    salaries = [contract.get(column) for column in SALARY_FIELDS]
    # Cifra segura solo si cortó tras la fecha de garantía y no le quedaban más años: lo cobra entero.
    # Antes de esa fecha, o con años por delante, depende de garantías y del "stretch", que la NBA no publica.
    known = (
        contract.get("status", "confirmed") == "confirmed"
        and m.date > GUARANTEE_WAIVE_DEADLINE
        and salaries[0] is not None
        and all(salary is None for salary in salaries[1:])
    )
    entries.append({
        "name": state.name_of(m),
        "player_id": m.player_id,
        "salaries": salaries,
        "waived": True,
        "pending": not known,
        "waived_on": m.date,
        "txn": m.id,
        "contract": contract,  # para devolvérselo si otro equipo lo reclama
    })
    state.touched_teams.add(m.team_id)
    return Result("waived_dead_money", {"salaries": salaries, "pending": not known})


def _claim(state: State, m: Movement) -> Result:
    state.set_team(m.player_id, m.team_id)
    if m.player_id in state.contracts:
        return Result("claimed")  # ya aplicado

    # Quien reclama a un jugador asume su contrato tal cual: deja de ser dinero muerto del que lo cortó
    for team_id, entries in state.dead_money.items():
        entry = next((e for e in reversed(entries) if e.get("player_id") == m.player_id and e.get("contract")), None)
        if entry is not None:
            entries.remove(entry)
            state.touched_teams.add(team_id)
            state.put_contract(entry["contract"], m)
            return Result("claimed", {"from_team": team_id})

    # Sin contrato guardado (Exhibit 10, o cortado antes de la carga inicial): firmado, cifra desconocida
    state.put_contract(_pending_contract(m, signed_kind=None), m)
    return Result("claimed_pending")


def _convert(state: State, m: Movement) -> Result:
    state.set_team(m.player_id, m.team_id)
    if m.contract_type == "two_way":
        state.drop_contract(m.player_id)
        return Result("converted_two_way")
    if m.contract_type == "standard":
        if m.player_id in state.contracts:
            return Result("converted_standard")  # ya aplicado
        # Pasar de two-way a contrato normal no es fichar como agente libre: sin restricción de traspaso conocida
        state.put_contract(_pending_contract(m, signed_kind=None), m)
        return Result("converted_pending")
    return Result("needs_review", {"reason": "conversión no reconocida"})


def _sign(state: State, m: Movement) -> Result:
    kind = m.contract_type
    if kind is None:
        return Result("needs_review", {"reason": "tipo de contrato no reconocido"})
    state.set_team(m.player_id, m.team_id)

    if kind in WITHOUT_ROW:
        state.drop_contract(m.player_id)
        return Result(kind)

    current = state.contracts.get(m.player_id)
    if kind in ("veteran_extension", "rookie_extension"):
        signed_kind = "extension" if kind == "veteran_extension" else "rookie_extension"
        if current is None:
            state.put_contract(_pending_contract(m, signed_kind), m)
            return Result("extension_pending")
        if current.get("signed_on") == m.date and current.get("signed_kind") == signed_kind:
            return Result("extended")  # ya aplicado
        # Esta temporada sigue igual; los años que añade la renovación aún no tienen cifra pública
        status = "pending_future" if current.get("status", "confirmed") == "confirmed" else current["status"]
        state.put_contract({**current, "signed_on": m.date, "signed_kind": signed_kind, "status": status}, m)
        return Result("extended")

    # Contrato nuevo (normal, resto de temporada o escala de novato)
    if current is not None and current.get("signed_on") == m.date:
        return Result("signed_known")  # ya está: aplicado antes o ya venía en la carga inicial
    state.put_contract(_pending_contract(m, "rookie" if kind == "rookie_scale" else "free_agent"), m)
    return Result("signed_pending", {"replaced": current} if current else None)


_HANDLERS = {"Trade": _trade, "Waive": _waive, "AwardOnWaivers": _claim, "ContractConverted": _convert, "Signing": _sign}


def apply(state: State, movement: Movement) -> Result:
    """Aplica un movimiento al estado en memoria y devuelve qué ha hecho."""
    handler = _HANDLERS.get(movement.type)
    if handler is None:
        return Result("needs_review", {"reason": f"tipo de movimiento desconocido: {movement.type}"})
    return handler(state, movement)
