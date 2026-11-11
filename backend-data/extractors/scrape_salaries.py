"""Tarea 4.1 — Contratos de los jugadores para el GM Virtual, desde Basketball-Reference (BR).

Llena `player_contracts` con el contrato en vigor de cada jugador de plantilla. Lee las 30
páginas de equipo y no el listado global (/contracts/players.html) porque el listado suma en
cada fila lo que cobra el jugador de todos sus equipos: Beal sale con 25,8 M (19,4 M de su corte
en PHX + 6,4 M de LAC) cuando en un traspaso solo cuentan los 6,4 M de su contrato actual.

- Cortados: no son un sueldo traspasable, pero siguen contando en la nómina del equipo que les paga.
  Van a `teams.dead_money`, junto a los sueldos de plantilla que no cruzan con `players`: así,
  contratos + `dead_money` de un equipo = su nómina exacta en BR.
- Two-way, 10 días y Exhibit 10: BR no les da salario, así que no tienen fila.
- `contract_option`: la próxima opción por decidir ("Player Option" / "Team Option") o NULL.
  BR no distingue UFA de RFA, así que un contrato sin opciones pendientes queda en NULL.
- `signed_on`, `signed_kind` y `acquired_on`: última firma y último traspaso, leídos de las notas.
  `trade-rules.ts` deduce de ahí desde cuándo se puede traspasar a cada jugador.
- La tabla solo guarda 4 temporadas: las siguientes (y5, y6) se descartan.
- Los contratos que desaparecen de BR se borran, por eso solo se escribe con las 30 páginas
  descargadas: cualquier fallo aborta antes de tocar Supabase.

Uso (desde backend-data/):
    python -m extractors.scrape_salaries            # descarga + guarda (~2 min)
    python -m extractors.scrape_salaries --dry-run  # solo descarga y muestra

Las filas "sin asignar" del resumen son jugadores que no están en `players` o cuyo nombre difiere
entre BR y la NBA: en este último caso, añade su id a BR_ID_TO_NBA_ID.
"""
import argparse
import re
import sys
import time
import unicodedata
from datetime import date, datetime

import requests
from bs4 import BeautifulSoup, Comment

from config import SUPABASE_SERVICE_KEY, SUPABASE_URL
from extractors.fetch_career_awards import load_active_players

BASE_URL = "https://www.basketball-reference.com"
# BR usa BRK, CHO y PHO donde la NBA usa BKN, CHA y PHX
BR_TEAMS = (
    "ATL", "BOS", "BRK", "CHI", "CHO", "CLE", "DAL", "DEN", "DET", "GSW", "HOU", "IND", "LAC", "LAL", "MEM",
    "MIA", "MIL", "MIN", "NOP", "NYK", "OKC", "ORL", "PHI", "PHO", "POR", "SAC", "SAS", "TOR", "UTA", "WAS",
)
NBA_ABBREVIATIONS = {"BRK": "BKN", "CHO": "CHA", "PHO": "PHX"}
USER_AGENT = "nba-hub-contracts/1.0"
TIMEOUT = 30
RETRIES = 3
REQUEST_DELAY_SECONDS = 4  # el robots.txt de BR pide Crawl-delay: 3
# Por debajo de esto BR ha cambiado el formato: guardar borraría contratos buenos
MIN_CONTRACTS = 300

SALARY_COLUMNS = ("y1", "y2", "y3", "y4", "y5", "y6")  # y1 = temporada en curso
STORED_SEASONS = 4  # columnas de salario de `player_contracts`
OPTION_LABELS = {"salary-pl": "Player Option", "salary-tm": "Team Option"}
NAME_SUFFIXES = {"jr", "sr", "ii", "iii", "iv", "v"}
UNDECOMPOSABLE_LETTERS = str.maketrans("đłø", "dlo")  # NFKD no les quita el acento
# Nombres que la normalización no iguala: id de BR -> id de la NBA
BR_ID_TO_NBA_ID = {
    "hollaro01": 1641842,  # Ron Holland / Ronald Holland II
}

PLAYER_HREF = re.compile(r"/players/\w/(\w+)\.html")
NOTE_DATE = re.compile(r"\w+ \d{1,2}, \d{4}")
EXERCISED_NOTE = re.compile(r"option exercised|exercised \w+ option", re.IGNORECASE)
SIGNED_NOTE = re.compile(r"signed", re.IGNORECASE)  # sin distinguir mayúsculas: hay notas con "SIgned"
TRADED_NOTE = re.compile(r"traded from", re.IGNORECASE)


def normalize_name(name: str) -> str:
    """'Nikola Jokić' -> 'nikola jokic'; 'Ernest Udeh, Jr.' -> 'ernest udeh'; 'P.J. Tucker' -> 'pj tucker'."""
    text = unicodedata.normalize("NFKD", name.lower().translate(UNDECOMPOSABLE_LETTERS)).replace("-", " ")
    text = "".join(c for c in text if c == " " or (c.isascii() and c.isalpha()))
    return " ".join(word for word in text.split() if word not in NAME_SUFFIXES)


def br_id(tag) -> str | None:
    """Id de BR del primer enlace a un jugador: 'curryst01'."""
    match = PLAYER_HREF.search(str(tag))
    return match[1] if match else None


def parse_salary(cell) -> int | None:
    digits = re.sub(r"\D", "", cell.get_text())
    return int(digits) if digits else None


def note_date(note: str) -> date | None:
    """Fecha de una nota ('Option exercised October 20, 2026.'); None si no trae ninguna legible."""
    match = NOTE_DATE.search(note)
    if match is None:
        return None
    try:
        return datetime.strptime(match[0], "%B %d, %Y").date()
    except ValueError:  # las notas se escriben a mano: una fecha rara no debe tumbar el job semanal
        return None


def latest_note(notes: list[str], pattern: re.Pattern) -> tuple[date, str] | None:
    """La nota con fecha más reciente que encaja con el patrón, como (fecha, texto)."""
    dated = [(day, note) for note in notes if pattern.search(note) and (day := note_date(note))]
    return max(dated, key=lambda item: item[0], default=None)


def signed_kind(note: str) -> str:
    """Tipo de firma: de él dependen las restricciones de traspaso de `trade-rules.ts`."""
    text = note.lower()
    if "rookie" in text:
        return "rookie_extension" if "extension" in text else "rookie"
    return "extension" if "extension" in text else "free_agent"


def pending_option(options: list[tuple[str, str]], notes: list[str], league_year_start: date) -> str | None:
    """Próxima opción por decidir, a partir de las celdas marcadas [(columna, etiqueta)] en orden.

    BR deja la celda marcada aunque la opción ya esté decidida, así que se descartan:
    - y1: la temporada ya está en marcha.
    - y2, si hay una nota de opción ejercida desde el 1 de julio de y1: solo puede ser la suya,
      porque las de novato se ejercen en octubre, un año antes, y el resto justo antes de su temporada.
    """
    exercised = latest_note(notes, EXERCISED_NOTE)
    decided = {"y1", "y2"} if exercised and exercised[0] >= league_year_start else {"y1"}
    return next((label for column, label in options if column not in decided), None)


def parse_notes(soup) -> dict[str | None, list[str]]:
    """Notas de cada jugador por id de BR; la tabla `payroll-notes` viene en un comentario HTML."""
    comment = soup.find(string=lambda text: isinstance(text, Comment) and 'id="payroll-notes"' in text)
    notes = {}
    if comment is not None:
        for tr in BeautifulSoup(comment, "html.parser").find_all("tr"):
            notes.setdefault(br_id(tr), [li.get_text(" ", strip=True) for li in tr.find_all("li")])
    return notes


def parse_team(soup, team: str) -> tuple[list[dict], list[dict]]:
    """Contratos en vigor de una plantilla (sin jugadores sin salario) y dinero muerto de sus cortados."""
    table = soup.find("table", id="contracts")
    season = table.find("th", attrs={"data-stat": "y1"}).get_text(strip=True)  # "2026-27"
    league_year_start = date(int(season[:4]), 7, 1)
    notes = parse_notes(soup)

    rows, dead_money = [], []
    for tr in table.find("tbody").find_all("tr"):
        waived = "partial_table" in tr.get("class", [])
        if tr.get("class") and not waived:  # `thead` = separador. Plantilla = sin clase
            continue
        cells = {cell.get("data-stat"): cell for cell in tr.find_all(["th", "td"])}
        salaries = [parse_salary(cells[column]) for column in SALARY_COLUMNS]
        if not any(salaries):
            continue
        name = cells["player"].get_text(strip=True)
        if waived:
            dead_money.append({"name": name, "salaries": salaries[:STORED_SEASONS], "waived": True})
            continue
        player = br_id(cells["player"])
        player_notes = notes.get(player, [])
        options = [(column, OPTION_LABELS[css]) for column in SALARY_COLUMNS
                   for css in cells[column].get("class", []) if css in OPTION_LABELS]
        signed = latest_note(player_notes, SIGNED_NOTE)
        traded = latest_note(player_notes, TRADED_NOTE)
        rows.append({
            "br_id": player,
            "name": name,
            "team": team,
            "contract": {
                "salary_current": salaries[0],
                "salary_year_2": salaries[1],
                "salary_year_3": salaries[2],
                "salary_year_4": salaries[3],
                "contract_option": pending_option(options, player_notes, league_year_start),
                "signed_on": signed[0].isoformat() if signed else None,
                "signed_kind": signed_kind(signed[1]) if signed else None,
                "acquired_on": traded[0].isoformat() if traded else None,
            },
        })
    return rows, dead_money


def fetch_team_page(session, team: str):
    url = f"{BASE_URL}/contracts/{team}.html"
    for attempt in range(1, RETRIES + 1):
        try:
            response = session.get(url, timeout=TIMEOUT)
            if 400 <= response.status_code < 500:  # 403/429 = nos frenan: insistir solo empeora
                sys.exit(f"Basketball-Reference rechaza {url} ({response.status_code}). No se ha escrito nada.")
            response.raise_for_status()
            # .content y no .text: sin charset en la cabecera, requests leería "Jokić" como Latin-1
            return BeautifulSoup(response.content, "html.parser")
        except requests.RequestException as exc:
            if attempt == RETRIES:
                raise
            print(f"  ~ {team}: reintento {attempt}/{RETRIES - 1} tras error: {exc}")
            time.sleep(REQUEST_DELAY_SECONDS * attempt)


def match_contracts(rows: list[dict], players: list[dict]) -> tuple[list[dict], list[dict]]:
    """Asigna cada fila de BR a su id de la NBA; devuelve (contratos, filas sin asignar).

    Los homónimos y los jugadores repetidos se quedan sin asignar: mejor un aviso en el resumen
    que el contrato de otro jugador en el Trade Machine.
    """
    id_by_name = {}
    for p in players:
        key = normalize_name(p["full_name"])
        id_by_name[key] = None if key in id_by_name else p["id"]
    draft_years = {p["id"]: p.get("draft_year") for p in players}

    contracts, unmatched = {}, []
    for row in rows:
        player_id = BR_ID_TO_NBA_ID.get(row["br_id"]) or id_by_name.get(normalize_name(row["name"]))
        if player_id is None or player_id in contracts:
            unmatched.append(row)
            continue
        contract = {"player_id": player_id, **row["contract"]}
        # BR anota a los novatos del último draft como una firma normal ("Signed 4-yr/$54M contract")
        if contract["signed_kind"] == "free_agent" and contract["signed_on"][:4] == str(draft_years.get(player_id)):
            contract["signed_kind"] = "rookie"
        contracts[player_id] = contract
    return list(contracts.values()), unmatched


def save_contracts(client, contracts: list[dict]) -> int:
    """Guarda los contratos y borra los que ya no están en vigor; devuelve cuántos ha borrado."""
    # El `upsert` compartido fija on_conflict="id", y aquí la clave primaria es player_id
    client.table("player_contracts").upsert(contracts, on_conflict="player_id").execute()
    saved = client.table("player_contracts").select("player_id").execute().data
    stale = sorted({r["player_id"] for r in saved} - {c["player_id"] for c in contracts})
    if stale:
        client.table("player_contracts").delete().in_("player_id", stale).execute()
    return len(stale)


def save_dead_money(client, dead_money: dict[str, list[dict]]) -> None:
    """Un `update` por equipo: un upsert exigiría también las columnas obligatorias de `teams`."""
    ids = {t["abbreviation"]: t["id"] for t in client.table("teams").select("id, abbreviation").execute().data}
    for team, rows in dead_money.items():
        client.table("teams").update({"dead_money": rows}).eq("id", ids[NBA_ABBREVIATIONS.get(team, team)]).execute()


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")  # nombres como "Jokić" en consolas cp1252
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dry-run", action="store_true", help="no escribe en Supabase")
    args = parser.parse_args()

    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        sys.exit("Faltan SUPABASE_URL y/o SUPABASE_KEY en backend-data/.env")

    from supabase import create_client

    client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    players = load_active_players(client, "id, full_name, draft_year")

    print(f"Descargando los contratos de {len(BR_TEAMS)} equipos...")
    session = requests.Session()
    session.headers["User-Agent"] = USER_AGENT
    rows, dead_money = [], {}
    for i, team in enumerate(BR_TEAMS):
        if i:
            time.sleep(REQUEST_DELAY_SECONDS)
        team_rows, dead_money[team] = parse_team(fetch_team_page(session, team), team)
        print(f"  {team}: {len(team_rows)}")
        rows += team_rows

    contracts, unmatched = match_contracts(rows, players)
    print(f"\nContratos: {len(rows)} · asignados: {len(contracts)} · sin asignar: {len(unmatched)}")
    for row in unmatched:
        contract = row["contract"]
        print(f"  ! {row['team']} {row['name']} ({row['br_id']}): {contract['salary_current']}")
        salaries = [contract[column] for column in ("salary_current", "salary_year_2", "salary_year_3", "salary_year_4")]
        dead_money[row["team"]].append({"name": row["name"], "salaries": salaries, "waived": False})

    if len(contracts) < MIN_CONTRACTS:
        sys.exit(f"Solo {len(contracts)} contratos (mínimo {MIN_CONTRACTS}): ¿ha cambiado BR? No se escribe nada.")

    if args.dry_run:
        print("\n[dry-run] Ejemplo:", contracts[0])
        print("[dry-run] Ejemplo con opción:", next((c for c in contracts if c["contract_option"]), None))
        print("[dry-run] Dinero muerto de MEM:", dead_money["MEM"])
        return

    deleted = save_contracts(client, contracts)
    save_dead_money(client, dead_money)
    total = client.table("player_contracts").select("player_id", count="exact").limit(1).execute().count
    print(f"\nSupabase -> player_contracts: {total} filas ({deleted} contratos caducados borrados)")


if __name__ == "__main__":
    main()
