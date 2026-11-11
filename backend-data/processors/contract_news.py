"""Tarea 4.4 (fase 2) — Lee en las noticias las condiciones del contrato de un jugador.

Fuentes: los RSS de Hoops Rumors y RealGM, que recogen cada fichaje con lo que publican Shams Charania,
Jake Fischer, Marc Stein… o el propio equipo. Lógica pura y conservadora:
- Solo lee frases que hablan de ESE jugador y no mencionan a otro equipo: así no confunde su contrato
  nuevo con uno anterior en otra franquicia.
- Ignora cifras de opciones viejas ("would have paid"), de "cap hit" o de ofertas de cualificación.
- Si una noticia da dos cifras distintas para lo mismo, las devuelve todas: quien decide (el resolvedor)
  no resuelve nada ante una contradicción. Mejor un contrato "sin cifra" que una cifra equivocada.
"""
import html
import re
import unicodedata
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from email.utils import parsedate_to_datetime

# Las condiciones van al principio: no hace falta guardar el artículo entero
TEXT_LIMIT = 4000

# Apodo de cada franquicia tal como lo escribe la prensa (con mayúscula: "Heat", no "heat")
NICKNAMES = {
    "ATL": ("Hawks",), "BOS": ("Celtics",), "BKN": ("Nets",), "CHA": ("Hornets",), "CHI": ("Bulls",),
    "CLE": ("Cavaliers", "Cavs"), "DAL": ("Mavericks", "Mavs"), "DEN": ("Nuggets",), "DET": ("Pistons",),
    "GSW": ("Warriors",), "HOU": ("Rockets",), "IND": ("Pacers",), "LAC": ("Clippers",), "LAL": ("Lakers",),
    "MEM": ("Grizzlies",), "MIA": ("Heat",), "MIL": ("Bucks",), "MIN": ("Timberwolves", "Wolves"),
    "NOP": ("Pelicans",), "NYK": ("Knicks",), "OKC": ("Thunder",), "ORL": ("Magic",), "PHI": ("76ers", "Sixers"),
    "PHX": ("Suns",), "POR": ("Trail Blazers", "Blazers"), "SAC": ("Kings",), "SAS": ("Spurs",),
    "TOR": ("Raptors",), "UTA": ("Jazz",), "WAS": ("Wizards",),
}

# Ciudades: una frase que habla de otra ciudad suele ser de una etapa anterior ("spent three seasons in
# Chicago"). Sin "Los Angeles", que comparten Lakers y Clippers.
CITIES = {
    "ATL": "Atlanta", "BOS": "Boston", "BKN": "Brooklyn", "CHA": "Charlotte", "CHI": "Chicago", "CLE": "Cleveland",
    "DAL": "Dallas", "DEN": "Denver", "DET": "Detroit", "GSW": "Golden State", "HOU": "Houston", "IND": "Indiana",
    "MEM": "Memphis", "MIA": "Miami", "MIL": "Milwaukee", "MIN": "Minnesota", "NOP": "New Orleans", "NYK": "New York",
    "OKC": "Oklahoma City", "ORL": "Orlando", "PHI": "Philadelphia", "PHX": "Phoenix", "POR": "Portland",
    "SAC": "Sacramento", "SAS": "San Antonio", "TOR": "Toronto", "UTA": "Utah", "WAS": "Washington",
}

# Una cifra se acepta si la noticia la atribuye a uno de estos medios o al propio equipo
TRUSTED_SOURCES = re.compile(
    r"\b(?:ESPN|The Athletic|HoopsHype|The Stein Line|Yahoo Sports|NBA\.com|Sportsnet|The Ringer|Spotrac|"
    r"Shams Charania|Marc Stein|Jake Fischer|Chris Haynes|Michael Scotto|Bobby Marks|Keith Smith|"
    r"press release|team announced|announced (?:today|on \w+|in a)|officially (?:signed|re-signed|announced))"
)

_SUFFIXES = {"jr", "sr", "ii", "iii", "iv", "v"}
_UNDECOMPOSABLE = str.maketrans("đłø", "dlo")
_ABBREVIATION = re.compile(r"(?:\b(?:Jr|Sr|St|Mr|Dr|vs|No|Nos|Jan|Feb|Aug|Sept|Sep|Oct|Nov|Dec)|\b[A-Z])\.$")
_NUMBER_WORDS = {"one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "1": 1, "2": 2, "3": 3, "4": 4, "5": 5}

_MONEY = r"\$(?P<num>\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s?(?P<unit>MM|million|M\b|K\b)?"
_YEARS = r"\b(?P<years>one|two|three|four|five|[1-5])-year\b"
_QUALIFIER = r"(?:a total of |roughly |about |approximately |nearly |around |up to |just |a guaranteed )?"
_TOTAL_PATTERNS = (
    # "a two-year, $45MM contract"
    re.compile(_YEARS + r",?\s+" + _MONEY),
    # "a four-year contract worth $60MM", "one-year deal worth roughly $2.5MM",
    # "His new one-year contract with Oklahoma City will be worth $5MM"
    re.compile(_YEARS + r"(?:\s+[\w'-]+){0,2}?\s+(?:contract|deal|extension|agreement|pact)\b(?:\s+[\w.'-]+){0,6}?\s+(?:worth|valued at)\s+" + _QUALIFIER + _MONEY),
)
# Cifra de una temporada concreta: "$9MM in 2026/27", "$20MM salary for 2026/27", "$2.3MM for '26/27"
_SEASON_SALARY = re.compile(_MONEY + r"(?:\s+(?:base\s+)?salary)?\s+(?:in|for)\s+(?:the\s+)?(?P<season>(?:20)?'?\d{2}[/-]\d{2})")
# Lo que cobra en un contrato de un año: "will earn about $3.88MM", "will be worth $5MM"
_ONE_YEAR_SALARY = re.compile(
    r"\b(?:will earn|earns|earning|will make|will receive|will be paid|pays him|paying him|will pay him|salary of|starting salary of|will be worth|is worth|worth)\s+"
    + _QUALIFIER + _MONEY
)
_TOTAL_ALONE = re.compile(r"\b(?:contract|deal|extension)\s+(?:will be|is|would be)\s+worth\s+" + _QUALIFIER + _MONEY)
# Una cifra que no es de este contrato: opciones, ofertas de cualificación, cap hit, lo que "habría" cobrado
_BEFORE_MONEY_EXCLUDED = re.compile(r"(?:would have|could have|was set to|originally|qualifying offer|option,?(?: was)? worth|cap hit of|cap charge of)[^$]{0,30}$", re.IGNORECASE)
# Justo detrás de la cifra: "$9MM player option", "$2.45MM cap hit", "$3MM partial guarantee", "$5MM guaranteed"
_AFTER_MONEY_EXCLUDED = re.compile(r"^\s*(?:[\w-]+\s+){0,2}?(?:option|qualifying offer|cap hit|cap charge|trade kicker|partial guarantee|guarantee|guaranteed)\b", re.IGNORECASE)

_MINIMUM = re.compile(r"\b(?:minimum-salary|minimum salary|veteran'?s minimum|rookie minimum|for the minimum|minimum deal|minimum contract)\b", re.IGNORECASE)
_NOT_MINIMUM = re.compile(r"\b(?:more than|above|over|exceeds?)\s+(?:his |the |a )?(?:veteran'?s |rookie )?minimum", re.IGNORECASE)
_EXCEPTIONS = (
    ("taxpayer_mle", re.compile(r"\b(?:full|entire)\s+(?:\$[\d.]+MM\s+)?taxpayer mid-level", re.IGNORECASE)),
    ("non_taxpayer_mle", re.compile(r"\b(?:full|entire)\s+(?:\$[\d.]+MM\s+)?non-taxpayer mid-level", re.IGNORECASE)),
    ("room_mle", re.compile(r"\b(?:full|entire)\s+(?:\$[\d.]+MM\s+)?room (?:exception|mid-level)", re.IGNORECASE)),
    ("bi_annual", re.compile(r"\b(?:full|entire)\s+(?:\$[\d.]+MM\s+)?bi-annual", re.IGNORECASE)),
)
_EXHIBIT = re.compile(r"\bExhibit (?:9|10)\b")
_SIGNING_VERB = re.compile(r"\b(?:sign|signs|signed|signing|re-sign|re-signed|agreed|agree|agrees|deal|contract)\b", re.IGNORECASE)
_OPTION = re.compile(r"\b(?P<who>player|team|mutual) option\b", re.IGNORECASE)
_OLD_OPTION = re.compile(r"\b(?:declin\w*|exercis\w*|pick(?:ed)? up|picking up|turn(?:ed)? down|would have)\b", re.IGNORECASE)
_GUARANTEE = (
    ("non_guaranteed", re.compile(r"\bnon-guaranteed\b", re.IGNORECASE)),
    ("partial", re.compile(r"\bpartial(?:ly)? guarantee", re.IGNORECASE)),
    ("full", re.compile(r"\bfully guaranteed\b", re.IGNORECASE)),
)
_CONTINUATION = re.compile(
    r"^(?:He|His|It|It's|That deal|The (?:new )?(?:deal|contract|agreement|extension|pact)|The (?:one|two|three|four|five)-year"
    r"|The \d+-year(?:-old)? (?:veteran|forward|guard|center|wing|big man|swingman)|The (?:veteran|rookie|forward|guard|center|wing|big man|swingman))\b"
)
# Frases que no afirman un hecho de ESTE contrato: pasado ("had been on minimum contracts") o
# suposiciones ("will likely be worth the minimum"). De ellas no se saca nada.
_NOT_FACTUAL = re.compile(
    r"\b(?:had been|has been on|was on|were on|had (?:a|an)|previously|originally|back in|at the time|when (?:he|they) (?:was|were)"
    r"|last (?:season|year|summer)|over (?:his|the) (?:first|past|last)|earlier in his career"
    r"|likely|expected to|projected|probably|could|might|may|reportedly seeking|in line for|figures to|stands to)\b",
    re.IGNORECASE,
)
_YEAR_MENTION = re.compile(r"\bin (20\d{2})\b")
# Resúmenes de rumores: mezclan especulación vieja con noticias, así que no se usan para cifras
_SPECULATIVE_TITLE = re.compile(r"\b(?:Rumors|Latest|Odds|Mailbag|Chat|Poll|Podcast|Power Rankings|Mock|Predict\w*|Targets?)\b", re.IGNORECASE)


@dataclass(frozen=True)
class NewsItem:
    id: str  # "{fuente}:{guid}"
    source: str  # hoopsrumors / realgm
    url: str
    title: str
    published_at: str  # ISO 8601
    text: str  # texto plano, solo el principio


@dataclass(frozen=True)
class Amount:
    value: int
    tolerance: int  # 0 = cifra exacta; si no, lo que puede variar por el redondeo de la prensa


@dataclass
class Terms:
    """Lo que dice UNA noticia del contrato de UN jugador con UN equipo."""
    years: set[int] = field(default_factory=set)
    totals: list[Amount] = field(default_factory=list)
    season_salaries: dict[str, list[Amount]] = field(default_factory=dict)
    one_year_salaries: list[Amount] = field(default_factory=list)  # solo valen si el contrato es de un año
    minimum: bool = False
    exception: str | None = None
    exhibit: bool = False
    guarantee: str | None = None
    options: set[str] = field(default_factory=set)
    trusted: bool = False
    quote: str = ""

    @property
    def empty(self) -> bool:
        return not (self.years or self.totals or self.season_salaries or self.one_year_salaries or self.minimum
                    or self.exception or self.exhibit)


# ---------- RSS ----------

def plain_text(fragment: str) -> str:
    text = html.unescape(fragment)  # los RSS escapan el HTML de dentro
    text = re.sub(r"<[^>]+>", " ", text)
    text = html.unescape(text).replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"').replace("″", '"')
    return " ".join(text.split())


def parse_rss(xml: bytes, source: str) -> list[NewsItem]:
    """Noticias de un RSS 2.0, con el texto completo si lo trae (content:encoded) o el resumen."""
    items = []
    for node in ET.fromstring(xml).iter("item"):
        guid = (node.findtext("guid") or node.findtext("link") or "").strip()
        published = node.findtext("pubDate")
        if not guid or not published:
            continue
        body = node.findtext("{http://purl.org/rss/1.0/modules/content/}encoded") or node.findtext("description") or ""
        items.append(NewsItem(
            id=f"{source}:{guid}",
            source=source,
            url=(node.findtext("link") or "").strip(),
            title=plain_text(node.findtext("title") or ""),
            published_at=parsedate_to_datetime(published).isoformat(),
            text=plain_text(body)[:TEXT_LIMIT],
        ))
    return items


# ---------- Texto ----------

def name_key(name: str) -> str:
    """'Nikola Jokić' -> 'nikola jokic'; 'Kelly Oubre Jr.' -> 'kelly oubre'; 'P.J. Tucker' -> 'pj tucker'."""
    text = unicodedata.normalize("NFKD", name.lower().translate(_UNDECOMPOSABLE)).replace("-", " ")
    text = "".join(c for c in text if c == " " or (c.isascii() and c.isalpha()))
    return " ".join(word for word in text.split() if word not in _SUFFIXES)


def sentences(text: str) -> list[str]:
    parts, current = [], ""
    for piece in re.split(r"(?<=[.!?])\s+(?=[\"'(A-Z0-9$])", text):
        current = f"{current} {piece}".strip() if current else piece
        if not _ABBREVIATION.search(current):
            parts.append(current)
            current = ""
    if current:
        parts.append(current)
    return parts


def mentions_team(text: str, abbreviation: str, with_city: bool = False) -> bool:
    aliases = NICKNAMES.get(abbreviation, ()) + ((CITIES[abbreviation],) if with_city and abbreviation in CITIES else ())
    return any(re.search(rf"\b{re.escape(alias)}\b", text) for alias in aliases)


def _words(text: str) -> str:
    """Texto normalizado para buscar nombres, sin posesivos: "Eason's contract" -> "eason contract"."""
    return f" {name_key(re.sub(r"'s\b", '', text))} "


def _amount(match: re.Match) -> Amount:
    number, unit = match["num"], match["unit"]
    if "," in number:  # cifra completa: "$10,445,632"
        return Amount(int(number.replace(",", "")), 0)
    value = float(number)
    if unit in ("MM", "million", "M"):
        decimals = len(number.split(".")[1]) if "." in number else 0
        # Tres cuartos de la última cifra: la prensa no siempre redondea al más cercano ($2.449MM sale como
        # "$2.5MM"), pero "$9MM" y "$11MM" siguen siendo cifras distintas
        return Amount(round(value * 1_000_000), 75 * 10 ** (4 - decimals))
    if unit == "K":
        return Amount(round(value * 1_000), 750)
    return Amount(round(value), 0)


def _clean_amount(sentence: str, match: re.Match) -> Amount | None:
    """La cifra, salvo que sea de una opción, de una oferta de cualificación, un cap hit o un "habría"."""
    start = match.start("num")
    money_end = match.end("unit") if match["unit"] else match.end("num")
    if _BEFORE_MONEY_EXCLUDED.search(sentence[:start - 1]) or _AFTER_MONEY_EXCLUDED.search(sentence[money_end:money_end + 40]):
        return None
    amount = _amount(match)
    return amount if amount.value >= 100_000 else None


def _season_label(raw: str) -> str | None:
    """"2026/27", "'26/27", "26-27" -> "2026-27"."""
    match = re.fullmatch(r"(?:20)?'?(\d{2})[/-](\d{2})", raw)
    if not match or int(match[2]) != (int(match[1]) + 1) % 100:
        return None
    return f"20{match[1]}-{match[2]}"


def _add(amounts: list[Amount], amount: Amount | None) -> None:
    if amount is not None and amount not in amounts:
        amounts.append(amount)


# ---------- Extracción ----------

def player_sentences(item: NewsItem, player_name: str, team: str, homonyms: tuple[str, ...] = ()) -> list[str]:
    """Frases sobre el jugador que no hablan de otro equipo. Vacío si la noticia no menciona a su equipo.

    `homonyms`: nombres completos de otros jugadores con su mismo apellido. Si alguno sale en la
    noticia, solo valen las frases con su nombre completo ("Williams" podría ser otro).
    """
    if _SPECULATIVE_TITLE.search(item.title) or not (mentions_team(item.title, team) or mentions_team(item.text, team)):
        return []
    key = name_key(player_name)
    if not key:
        return []
    last = key.split()[-1]
    every = sentences(item.text)
    whole = _words(item.text)
    last_is_unique = not any(f" {name_key(other)} " in whole for other in homonyms if name_key(other) != key)

    def about_player(sentence: str) -> bool:
        words = _words(sentence)
        return f" {key} " in words or (last_is_unique and f" {last} " in words)

    def other_team(sentence: str) -> bool:
        return any(code != team and mentions_team(sentence, code, with_city=True) for code in NICKNAMES)

    chosen = []
    for index, sentence in enumerate(every):
        about = about_player(sentence)
        # "His new one-year contract…" justo después de una frase sobre él
        if not about and index > 0 and _CONTINUATION.match(sentence) and every[index - 1] in chosen:
            about = True
        if about and not other_team(sentence):
            chosen.append(sentence)
    return chosen


def extract_terms(item: NewsItem, player_name: str, team: str, homonyms: tuple[str, ...] = (),
                  others: frozenset[str] = frozenset()) -> Terms | None:
    """Condiciones del contrato de `player_name` con el equipo `team` (abreviatura) según la noticia.

    `others`: nombres (normalizados con `name_key`) del resto de jugadores de la liga. Una frase que
    nombra a otro jugador puede estar hablando de su contrato ("…as the team agreed to sign Mitchell
    Robinson to a contract worth the full mid-level"): de ella no se saca nada.
    """
    chosen = player_sentences(item, player_name, team, homonyms)
    if not chosen:
        return None

    key = name_key(player_name)
    published_year = int(item.published_at[:4])
    terms = Terms(trusted=bool(TRUSTED_SOURCES.search(item.text) or TRUSTED_SOURCES.search(item.title)))
    for sentence in chosen:
        if _NOT_FACTUAL.search(sentence):
            continue
        # "…signed for the minimum in 2024": habla de un contrato anterior
        if any(int(year) < published_year for year in _YEAR_MENTION.findall(sentence)):
            continue
        words = _words(sentence)
        if any(f" {other} " in words for other in others if other != key):
            continue
        for match in re.finditer(_YEARS, sentence):
            # "two-year" de un contrato, no "a two-year stint" ni la edad
            if _SIGNING_VERB.search(sentence):
                terms.years.add(_NUMBER_WORDS[match["years"].lower()])
        for pattern in _TOTAL_PATTERNS:
            for match in pattern.finditer(sentence):
                _add(terms.totals, _clean_amount(sentence, match))
        for match in _TOTAL_ALONE.finditer(sentence):
            _add(terms.totals, _clean_amount(sentence, match))
        for match in _SEASON_SALARY.finditer(sentence):
            season = _season_label(match["season"])
            if season:
                _add(terms.season_salaries.setdefault(season, []), _clean_amount(sentence, match))
        for match in _ONE_YEAR_SALARY.finditer(sentence):
            _add(terms.one_year_salaries, _clean_amount(sentence, match))
        if _MINIMUM.search(sentence) and not _NOT_MINIMUM.search(sentence):
            terms.minimum = True
        for kind, pattern in _EXCEPTIONS:
            if pattern.search(sentence):
                terms.exception = terms.exception or kind
        # Exhibit 10 solo si la frase habla de firmarlo con ESTE equipo (no de un campus anterior en otro)
        if _EXHIBIT.search(sentence) and mentions_team(sentence, team) and _SIGNING_VERB.search(sentence):
            terms.exhibit = True
        for kind, pattern in _GUARANTEE:
            if pattern.search(sentence):
                terms.guarantee = terms.guarantee or kind
        if not _OLD_OPTION.search(sentence):
            terms.options.update(match["who"].lower() for match in _OPTION.finditer(sentence))

    terms.season_salaries = {season: amounts for season, amounts in terms.season_salaries.items() if amounts}
    if terms.empty:
        return None
    terms.quote = next((s for s in chosen if _TOTAL_PATTERNS[0].search(s) or _MINIMUM.search(s) or "$" in s), chosen[0])[:300]
    return terms
