"""Tarea 4.4 (fase 2) — Decide las cifras de un contrato a partir de lo que dicen las noticias.

Lógica pura. Recibe un contrato del registro oficial (firmado, sin cifra) y las condiciones que
`contract_news.extract_terms` ha leído en cada noticia, y devuelve sus salarios con su precisión:
- exact: cifra completa publicada, o calculada con el convenio (mínimo por años de experiencia,
  excepción completa) y coherente con lo que publica la prensa.
- approx: cifra redondeada de la prensa ("$5MM") o mínimo prorrateado de quien firma con la
  temporada empezada (puede variar en un día según cómo cuente la liga).
Ante cualquier contradicción entre fuentes no decide nada: el contrato sigue sin cifra y el usuario la estima.
"""
from dataclasses import dataclass
from datetime import date

from processors.cba import (
    FULL_EXCEPTIONS,
    MAX_SALARY,
    MINIMUM_SALARY,
    REGULAR_SEASON_END,
    REGULAR_SEASON_START,
    SEASON,
    minimum_salary,
    prorated,
)
from processors.contract_news import Amount, NewsItem, Terms

SALARY_FIELDS = ("salary_current", "salary_year_2", "salary_year_3", "salary_year_4")
OUTLETS = {"hoopsrumors": "Hoops Rumors", "realgm": "RealGM"}
OPTION_LABELS = {"player": "Player Option", "team": "Team Option"}


@dataclass(frozen=True)
class Evidence:
    item: NewsItem
    terms: Terms


@dataclass
class Resolution:
    salaries: list[int | None]  # temporada actual y las 3 siguientes
    status: str  # confirmed / pending / pending_future
    source: dict
    contract_option: str | None = None
    drop: bool = False  # Exhibit 10: contrato de pretemporada, fuera del GM (como en la carga inicial)


def season_after(season: str, years: int) -> str:
    start = int(season[:4]) + years
    return f"{start}-{(start + 1) % 100:02d}"


def _compatible(a: Amount, b: Amount) -> bool:
    return abs(a.value - b.value) <= a.tolerance + b.tolerance


def _pick(amounts: list[Amount]) -> Amount | None:
    """La cifra más precisa, si todas las fuentes cuadran entre sí; None si se contradicen."""
    if not amounts:
        return None
    if any(not _compatible(a, b) for i, a in enumerate(amounts) for b in amounts[i + 1:]):
        return None
    return min(amounts, key=lambda amount: (amount.tolerance, amount.value))


def needs_years_of_service(evidence: list[Evidence]) -> bool:
    """¿Hace falta saber sus años de experiencia? Si es un mínimo, o un contrato de un año con cifra
    (podría ser el mínimo de un veterano aunque la noticia no lo diga)."""
    return any(e.terms.trusted and (e.terms.minimum or (e.terms.years == {1} and (e.terms.totals or e.terms.one_year_salaries)))
               for e in evidence)


def _resigned(contract: dict, evidence: list[Evidence]) -> bool:
    """¿Renueva con su propio equipo? (el registro oficial dice "re-signed", o la noticia "Re-Sign")."""
    source = contract.get("source") or {}
    descriptions = [source.get("description") or "", (source.get("official") or {}).get("description") or ""]
    return any("re-signed" in d for d in descriptions) or any("re-sign" in e.item.title.lower() for e in evidence)


def _reported(evidence: list[Evidence], years: int | None, conflict: bool) -> dict:
    totals = sorted({a.value for e in evidence for a in e.terms.totals})
    return {
        "years": years,
        "total": totals[0] if len(totals) == 1 else None,
        "minimum": any(e.terms.minimum for e in evidence),
        "guarantee": next((e.terms.guarantee for e in evidence if e.terms.guarantee), None),
        "conflict": conflict,
    }


def _items(evidence: list[Evidence]) -> list[dict]:
    newest = sorted(evidence, key=lambda e: e.item.published_at, reverse=True)[:3]
    return [{"outlet": OUTLETS.get(e.item.source, e.item.source), "url": e.item.url, "title": e.item.title,
             "published_at": e.item.published_at, "quote": e.terms.quote} for e in newest]


def resolve(contract: dict, evidence: list[Evidence], years_of_service: int | None = None,
            season: str = SEASON, season_start: date = REGULAR_SEASON_START, season_end: date = REGULAR_SEASON_END) -> Resolution | None:
    """Cifras del contrato según las noticias, o None si no aportan nada fiable."""
    trusted = [e for e in evidence if e.terms.trusted]
    if not trusted:
        return None
    signed_on = date.fromisoformat(contract["signed_on"]) if contract.get("signed_on") else season_start

    # Exhibit 10: contrato de campus, no garantizado. Igual que en la carga inicial, no entra en el GM.
    if signed_on <= season_start and any(e.terms.exhibit for e in trusted):
        return Resolution([None] * 4, "pending", {"kind": "news", "basis": "exhibit", "items": _items(trusted)}, drop=True)

    years_reported = {y for e in trusted for y in e.terms.years}
    years = next(iter(years_reported)) if len(years_reported) == 1 else None

    current_known = contract.get("status") == "pending_future" and contract.get("salary_current") is not None
    day = lambda salary: -(-salary // ((season_end - season_start).days + 1))  # un día de sueldo, redondeado arriba

    # Cada candidata con su origen: "season" (cifra de la temporada), "reported" (contrato de un año), "minimum", "exception"
    candidates: list[tuple[Amount, str]] = [(a, "season") for e in trusted for a in e.terms.season_salaries.get(season, [])]
    if years == 1:
        candidates += [(a, "reported") for e in trusted for a in e.terms.totals + e.terms.one_year_salaries]

    # Mínimo: la cifra exacta sale de la tabla del convenio; la de la prensa solo sirve para contrastarla.
    # Un veterano (3 años o más) con un mínimo de UN año cobra su mínimo, pero en la nómina (y en los
    # traspasos) cuenta como el de 2 años: la liga paga la diferencia. Sin saber si es de un año, no se decide.
    totals = [a for e in trusted for a in e.terms.totals]
    contradiction = undecidable = False
    minimum_options = None
    yos = years_of_service
    is_minimum = any(e.terms.minimum for e in trusted)
    if years == 1 and candidates:
        if yos is None:
            undecidable = True  # sin sus años no se puede descartar que sea el mínimo de un veterano
        elif any(a.tolerance <= 100_000 and abs(a.value - minimum_salary(yos)) <= 60_000 for a, _ in candidates):
            # Cobrar justo su mínimo es firmar un mínimo, lo diga o no la noticia ("$3.88MM" para 10 años o más).
            # Margen estrecho: un "$4MM" redondo puede ser un contrato normal.
            is_minimum = True
    if is_minimum and yos is not None and (years is not None or yos < 3):
        salary = minimum_salary(yos)
        counted = salary
        if years == 1 and yos >= 3:
            # Mínimo de un año de un veterano: con la excepción de mínimo cuenta como el de 2 años. Al renovar
            # con su equipo puede firmarse por otra vía y contar entero: eso no se publica, así que no se decide.
            counted = MINIMUM_SALARY[2]
            if _resigned(contract, trusted):
                undecidable, minimum_options = True, [MINIMUM_SALARY[2], salary]
        value, exact = prorated(counted, signed_on, season_start, season_end)
        minimum = Amount(value, 0 if exact else day(counted))
        # La prensa da lo que cobra (temporada completa o lo que le queda), no lo que cuenta en la nómina
        paid = [Amount(salary, 0), Amount(prorated(salary, signed_on, season_start, season_end)[0], day(salary)), Amount(counted, 0)]
        consistent = all(any(_compatible(a, ref) for ref in [minimum, *paid]) for a, _ in candidates)
        # Un "mínimo" de varios años no puede sumar mucho más que sus mínimos (si no, la frase hablaba de otro contrato)
        if years and years > 1 and totals:
            ceiling = years * minimum_salary(years_of_service + years) * 1.3
            consistent = consistent and all(years * salary * 0.9 <= a.value <= ceiling for a in totals)
        if consistent:
            candidates = [(minimum, "minimum")]
        else:
            contradiction = True  # las fuentes no cuadran entre sí: no se decide nada
    exception = next((e.terms.exception for e in trusted if e.terms.exception), None)
    if exception and not any(basis == "minimum" for _, basis in candidates):
        value, exact = prorated(FULL_EXCEPTIONS[exception], signed_on, season_start, season_end)
        candidates.append((Amount(value, 0 if exact else day(FULL_EXCEPTIONS[exception])), "exception"))

    picked = None if current_known or contradiction or undecidable else _pick([amount for amount, _ in candidates])
    current = picked
    basis = next((b for a, b in candidates if a is picked), None) if picked else None
    conflict = not current_known and (contradiction or (bool(candidates) and current is None))
    # Ninguna cifra puede salirse de lo que permite el convenio: positiva, hasta el máximo, y desde el mínimo
    # si firmó antes de empezar la temporada (después cobra solo la parte que queda)
    if current is not None:
        floor = MINIMUM_SALARY[0] - current.tolerance if signed_on <= season_start else 1
        if not floor <= current.value <= MAX_SALARY:
            current, basis, conflict = None, None, True

    salaries = [contract.get(field) for field in SALARY_FIELDS] if current_known else [None] * 4
    approx = False
    if current is not None:
        salaries[0] = current.value
        approx = current.tolerance > 0
    for k in range(1, 4):
        if salaries[k] is None:
            later = _pick([a for e in trusted for a in e.terms.season_salaries.get(season_after(season, k), [])])
            if later is not None:
                salaries[k] = later.value
                approx = approx or later.tolerance > 0

    if salaries[0] is None:
        status = "pending"
    else:
        # Una renovación suma sus años a los que ya tenía; un contrato nuevo los tiene todos
        known_before = sum(1 for s in (contract.get(f) for f in SALARY_FIELDS) if s is not None) if current_known else 0
        span = None if years is None else min(known_before + years if current_known else years, 4)
        status = "confirmed" if span is not None and all(s is not None for s in salaries[:span]) else "pending_future"

    options = {o for e in trusted for o in e.terms.options} - {"mutual"}
    option = OPTION_LABELS[next(iter(options))] if len(options) == 1 else contract.get("contract_option")

    reported = _reported(trusted, years, conflict)
    if minimum_options:
        reported["minimum_options"] = minimum_options  # lo que puede contar en la nómina: ayuda para estimar
    source = {
        "kind": "news",
        "precision": "approx" if approx else "exact",
        "basis": basis,
        "years_of_service": years_of_service if basis == "minimum" else None,
        "reported": reported,
        "items": _items(trusted),
    }
    return Resolution(salaries, status, source, contract_option=option)
