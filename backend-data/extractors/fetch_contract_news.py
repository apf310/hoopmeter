"""Tarea 4.4 (fase 2) — Cifras de los contratos desde las noticias (RSS de Hoops Rumors y RealGM).

1. Lee los RSS (Hoops Rumors página a página hasta lo ya visto; RealGM) respetando su crawl-delay, y
   guarda las noticias nuevas en `news_items`: solo el principio del texto, y se borran a los 150 días.
2. Para cada contrato sin cifra, con cifra aproximada o con años de renovación sin cifra, busca las
   noticias que hablan de ese jugador y de su equipo, lee sus condiciones (processors/contract_news.py)
   y decide las cifras (processors/contract_resolver.py).
3. Solo mejora: nunca borra una cifra que ya tenía ni cambia una exacta por una aproximada.

Uso (desde backend-data/), después de `fetch_transactions`:
    python -m extractors.fetch_contract_news            # lee noticias y resuelve contratos
    python -m extractors.fetch_contract_news --dry-run  # muestra qué haría, sin escribir

Sale con 1 si algo falla y con 2 si alguna fuente no responde o ha cambiado de formato: en GitHub
Actions, cualquiera de los dos manda un aviso por email. Mientras tanto los contratos siguen "sin cifra"
y el GM pide la estimación al usuario: nunca se rompe nada.
"""
import argparse
import re
import sys
import time
from collections import Counter
from datetime import datetime, timedelta, timezone

import requests

from config import API_SLEEP_SECONDS, SUPABASE_SERVICE_KEY, SUPABASE_URL
from extractors.fetch_transactions import BASELINE_DATE, select_all
from processors.cba import stale_season
from processors.contract_news import NewsItem, extract_terms, name_key, parse_rss
from processors.contract_resolver import SALARY_FIELDS, Evidence, Resolution, needs_years_of_service, resolve

FEEDS = {
    "hoopsrumors": {"url": "https://www.hoopsrumors.com/feed", "paged": True, "delay": 1.5},  # robots.txt: Crawl-delay 1
    "realgm": {"url": "https://basketball.realgm.com/rss/wiretap/0/0.xml", "paged": False, "delay": 2.5},  # Crawl-delay 2
}
USER_AGENT = "Hoopmeter/1.0 (contract figures from public RSS; https://hoopmeter.com)"
TIMEOUT = 30
MAX_PAGES = 80  # tope de seguridad: ~3 semanas de Hoops Rumors
RETENTION_DAYS = 150
# Una noticia vale si se publica desde 3 semanas antes de la firma oficial (acuerdo previo, moratoria de julio)
EVIDENCE_LEAD_DAYS = 21
SYNC_ID = "contract_news"
STATUS_RANK = {"pending": 0, "pending_future": 1, "confirmed": 2}


# ---------- Noticias ----------

def fetch_page(session, url: str, page: int) -> bytes | None:
    """Una página del RSS; None si ya no hay más (404)."""
    response = session.get(url, params={"paged": page} if page > 1 else None, timeout=TIMEOUT)
    if response.status_code == 404:
        return None
    response.raise_for_status()
    return response.content


def collect(session, source: str, known: set[str], since: datetime) -> list[NewsItem]:
    """Noticias nuevas de una fuente: pasa páginas hasta llegar a lo ya guardado o a `since`."""
    feed = FEEDS[source]
    new_items = []
    for page in range(1, (MAX_PAGES if feed["paged"] else 1) + 1):
        if page > 1:
            time.sleep(feed["delay"])
        content = fetch_page(session, feed["url"], page)
        if content is None:
            break
        items = parse_rss(content, source)
        if not items:
            if page == 1:
                raise RuntimeError(f"{source}: el RSS no trae ninguna noticia (¿ha cambiado el formato?)")
            break
        fresh = [item for item in items if item.id not in known]
        new_items += fresh
        oldest = min(datetime.fromisoformat(item.published_at) for item in items)
        if len(fresh) < len(items) or oldest < since:
            break
    return new_items


def store_items(client, items: list[NewsItem]) -> None:
    rows = [{"id": i.id, "source": i.source, "url": i.url, "title": i.title, "published_at": i.published_at, "body": i.text} for i in items]
    for start in range(0, len(rows), 200):
        client.table("news_items").upsert(rows[start:start + 200], on_conflict="id").execute()


def load_items_about(client, last_name: str, since: str) -> list[NewsItem]:
    """Noticias recientes que mencionan el apellido: así no se descargan todas en cada pasada.
    Con `--dry-run` y sin la tabla aún creada, se buscan en las recién descargadas (en memoria)."""
    if MEMORY_ITEMS is not None:
        needle = name_key(last_name)
        return [i for i in MEMORY_ITEMS if i.published_at >= since and needle in name_key(f"{i.title} {i.text}")]
    pattern = re.sub(r"[^A-Za-z]", "_", last_name)  # comodín de un carácter para tildes y apóstrofos
    rows = (client.table("news_items").select("id, source, url, title, published_at, body").gte("published_at", since)
            .or_(f"title.ilike.*{pattern}*,body.ilike.*{pattern}*").execute().data)
    return [NewsItem(r["id"], r["source"], r["url"], r["title"], r["published_at"], r["body"]) for r in rows]


MEMORY_ITEMS: list[NewsItem] | None = None


# ---------- Contratos ----------

class YearsOfService:
    """Años de experiencia (`SEASON_EXP` de nba_api), solo de quien lo necesita y una vez por jugador."""

    def __init__(self):
        self.cache: dict[int, int | None] = {}

    def __call__(self, player_id: int) -> int | None:
        if player_id not in self.cache:
            try:
                from nba_api.stats.endpoints import commonplayerinfo

                info = commonplayerinfo.CommonPlayerInfo(player_id=player_id, timeout=60).common_player_info.get_dict()
                row = dict(zip(info["headers"], info["data"][0]))
                self.cache[player_id] = int(row["SEASON_EXP"])
            except Exception as exc:  # sin el dato, ese contrato se queda como estaba
                print(f"  ~ sin años de experiencia de {player_id}: {exc}")
                self.cache[player_id] = None
            time.sleep(API_SLEEP_SECONDS)
        return self.cache[player_id]


def improves(old: dict, new: Resolution) -> bool:
    """¿La resolución mejora lo que hay? Nunca se pierde una cifra ni se cambia una exacta por una aproximada."""
    old_status = old.get("status") or "confirmed"
    old_source = old.get("source") or {}
    if new.drop:
        return old_status == "pending"
    old_salaries = [old.get(field) for field in SALARY_FIELDS]
    if any(o is not None and n is None for o, n in zip(old_salaries, new.salaries)):
        return False
    if STATUS_RANK[new.status] != STATUS_RANK[old_status]:
        return STATUS_RANK[new.status] > STATUS_RANK[old_status]
    if old_source.get("precision") == "approx":
        return new.source["precision"] == "exact"
    if sum(s is not None for s in new.salaries) > sum(s is not None for s in old_salaries):
        return True
    # Sigue sin cifra, pero ahora sabemos lo que publica la prensa: se muestra como ayuda para estimar
    return new.status == "pending" and old_source.get("reported") != new.source.get("reported")


def updated_row(old: dict, new: Resolution, now: str) -> dict:
    official = old.get("source") if (old.get("source") or {}).get("kind") == "official" else (old.get("source") or {}).get("official")
    return {
        **{field: value for field, value in zip(SALARY_FIELDS, new.salaries)},
        "status": new.status,
        "contract_option": new.contract_option,
        "source": {**new.source, "resolved_at": now, "official": official},
        "updated_at": now,
    }


def evidence_for(client, player_name: str, team: str, signed_on: str | None, homonyms: tuple[str, ...],
                 others: frozenset[str] = frozenset()) -> list[Evidence]:
    start = (datetime.fromisoformat(signed_on or BASELINE_DATE) - timedelta(days=EVIDENCE_LEAD_DAYS)).isoformat()
    last = name_key(player_name).split()[-1] if name_key(player_name) else ""
    if not last:
        return []
    evidence = []
    for item in load_items_about(client, last, start):
        terms = extract_terms(item, player_name, team, homonyms, others)
        if terms:
            evidence.append(Evidence(item, terms))
    return evidence


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dry-run", action="store_true", help="no escribe en Supabase")
    args = parser.parse_args()
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        sys.exit("Faltan SUPABASE_URL y/o SUPABASE_KEY en backend-data/.env")
    stale = stale_season(datetime.now(timezone.utc).date())
    if stale:
        print(f"! {stale}")
        sys.exit(2)

    from supabase import create_client

    global MEMORY_ITEMS
    client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    try:
        client.table("news_items").select("id").limit(1).execute()
        has_table = True
    except Exception:
        if not args.dry_run:
            sys.exit("Falta la tabla news_items: ejecuta backend-data/schema.sql en Supabase > SQL Editor.")
        print("[dry-run] Sin la tabla news_items: las noticias se buscan en memoria.\n")
        has_table, MEMORY_ITEMS = False, []

    now_dt = datetime.now(timezone.utc)
    now = now_dt.isoformat()
    counts, feed_errors, changes = Counter(), {}, []
    try:
        # 1. Noticias nuevas
        known = {row["id"] for row in select_all(client, "news_items", "id")} if has_table else set()
        since = min(datetime.fromisoformat(BASELINE_DATE).replace(tzinfo=timezone.utc) - timedelta(days=EVIDENCE_LEAD_DAYS),
                    now_dt - timedelta(days=EVIDENCE_LEAD_DAYS)) if not known else now_dt - timedelta(days=RETENTION_DAYS)
        session = requests.Session()
        session.headers["User-Agent"] = USER_AGENT
        for source in FEEDS:
            try:
                items = collect(session, source, known, since)
                counts[f"new_{source}"] = len(items)
                if MEMORY_ITEMS is not None:
                    MEMORY_ITEMS += items
                elif items and not args.dry_run:
                    store_items(client, items)
                print(f"{source}: {len(items)} noticias nuevas")
            except Exception as exc:  # una fuente caída no frena a la otra
                feed_errors[source] = f"{type(exc).__name__}: {exc}"[:300]
                print(f"  ! {source}: {feed_errors[source]}")
        if not args.dry_run:
            cutoff = (now_dt - timedelta(days=RETENTION_DAYS)).isoformat()
            client.table("news_items").delete().lt("published_at", cutoff).execute()

        # 2. Contratos por resolver
        teams = {t["id"]: t for t in client.table("teams").select("id, abbreviation, dead_money").execute().data}
        players = select_all(client, "players", "id, full_name, is_active")
        by_last: dict[str, list[str]] = {}
        for p in players:
            key = name_key(p["full_name"])
            if key:
                by_last.setdefault(key.split()[-1], []).append(p["full_name"])
        # Para descartar frases que hablan del contrato de otro jugador en activo
        active_keys = frozenset(k for p in players if p["is_active"] and (k := name_key(p["full_name"])))
        contracts = (client.table("player_contracts").select("*, player:players!inner(full_name, team_id)")
                     .or_("status.in.(pending,pending_future),source->>precision.eq.approx").execute().data)
        years_of_service = YearsOfService()

        for contract in contracts:
            player = contract.pop("player")
            team = teams.get(player["team_id"])
            if team is None:
                continue
            name = player["full_name"]
            homonyms = tuple(n for n in by_last.get(name_key(name).split()[-1], []) if name_key(n) != name_key(name))
            evidence = evidence_for(client, name, team["abbreviation"], contract.get("signed_on"), homonyms, active_keys)
            yos = years_of_service(contract["player_id"]) if needs_years_of_service(evidence) else None
            resolution = resolve(contract, evidence, yos)
            counts["candidates"] += 1
            if resolution is None or not improves(contract, resolution):
                continue
            label = "drop" if resolution.drop else f"{resolution.status}/{resolution.source['precision']}"
            counts[label] += 1
            changes.append(f"{name} ({team['abbreviation']}): {label} {resolution.salaries}")
            print(f"  {label:<22} {name} ({team['abbreviation']}): {resolution.salaries} · {resolution.source.get('basis')}")
            if args.dry_run:
                continue
            if resolution.drop:
                client.table("player_contracts").delete().eq("player_id", contract["player_id"]).execute()
            else:
                client.table("player_contracts").update(updated_row(contract, resolution, now)).eq("player_id", contract["player_id"]).execute()

        # Cortados con contrato de campus (Exhibit 10): no dejan dinero muerto, igual que en la carga inicial
        names = {p["id"]: p["full_name"] for p in players}
        for team in teams.values():
            entries = team["dead_money"] or []
            kept = []
            for entry in entries:
                snapshot = entry.get("contract")
                if entry.get("pending") and snapshot and entry.get("player_id") in names:
                    evidence = evidence_for(client, names[entry["player_id"]], team["abbreviation"], snapshot.get("signed_on"), (), active_keys)
                    resolution = resolve(snapshot, evidence)
                    if resolution is not None and resolution.drop:
                        counts["dead_money_dropped"] += 1
                        print(f"  sin dinero muerto (Exhibit 10): {entry['name']} ({team['abbreviation']})")
                        continue
                kept.append(entry)
            if len(kept) != len(entries) and not args.dry_run:
                client.table("teams").update({"dead_money": kept}).eq("id", team["id"]).execute()

        pending = client.table("player_contracts").select("player_id", count="exact").eq("status", "pending").limit(1).execute().count
        details = {**counts, "pending_contracts": pending, "feed_errors": feed_errors, "changes": changes[-50:]}
        print(f"\nResumen: {dict(counts)} · contratos aún sin cifra: {pending}")
        if not args.dry_run:
            row = {"id": SYNC_ID, "last_run_at": now, "details": details,
                   "last_error": "; ".join(f"{k}: {v}" for k, v in feed_errors.items()) or None}
            if not feed_errors:
                row["last_success_at"] = now
            client.table("sync_status").upsert(row, on_conflict="id").execute()
    except Exception as exc:
        if not args.dry_run:
            client.table("sync_status").upsert({"id": SYNC_ID, "last_run_at": now, "last_error": f"{type(exc).__name__}: {exc}"[:500]}, on_conflict="id").execute()
        raise

    if feed_errors:
        sys.exit(2)


if __name__ == "__main__":
    main()
