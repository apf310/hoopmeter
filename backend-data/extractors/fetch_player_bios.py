"""Tarea 5.2b — Ficha (posición, altura, peso, país, nacimiento, draft) de los jugadores que llegan nuevos.

Los jugadores que aparecen por primera vez en un boxscore o en un fichaje se crean solo con su nombre. Este
script rellena los campos vacíos con la ficha de su página en nba.com (la NBA la incluye en el HTML, en
`__NEXT_DATA__`). Nunca sobrescribe un dato que ya exista. Solo jugadores activos con algún hueco.

Uso (desde backend-data/):
    python -m extractors.fetch_player_bios            # rellena los huecos
    python -m extractors.fetch_player_bios --dry-run  # muestra qué haría

Sale con 1 si nba.com no responde o ha cambiado de formato (los jugadores siguen sin ficha: nada se rompe).
"""
import argparse
import sys
import time

from config import API_SLEEP_SECONDS
from db import connect, select_all
from extractors import nba_web
from extractors.fetch_teams_players import clean, height_to_meters, to_int, weight_to_kg

FIELDS = ("position", "height", "weight", "country", "birth_date", "draft_year", "draft_number")
MAX_PER_RUN = 40  # unos pocos al mes; el tope evita martillear nba.com si algo va mal


def bio_from_info(info: dict) -> dict:
    birth = clean(info.get("BIRTHDATE"))
    draft_year = clean(info.get("DRAFT_YEAR"))
    return {
        "position": clean(info.get("POSITION")),
        "height": height_to_meters(info.get("HEIGHT")),
        "weight": weight_to_kg(info.get("WEIGHT")),
        "country": clean(info.get("COUNTRY")),
        "birth_date": str(birth)[:10] if birth else None,
        "draft_year": to_int(draft_year) if draft_year and str(draft_year).isdigit() else None,
        "draft_number": to_int(info.get("DRAFT_NUMBER")) if str(info.get("DRAFT_NUMBER") or "").isdigit() else None,
    }


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dry-run", action="store_true", help="muestra qué haría, sin escribir")
    args = parser.parse_args()

    client = connect()
    players = select_all(client, "players", "id, full_name, " + ", ".join(FIELDS), lambda q: q.eq("is_active", True))
    # draft_year/draft_number faltan con razón en los no elegidos: solo cuentan los huecos de la ficha básica
    missing = [p for p in players if any(p.get(f) in (None, "") for f in ("position", "height", "weight", "country", "birth_date"))]
    print(f"Jugadores activos con la ficha incompleta: {len(missing)}")

    errors, filled = [], 0
    for i, p in enumerate(missing[:MAX_PER_RUN]):
        if i:
            time.sleep(API_SLEEP_SECONDS)
        try:
            bio = bio_from_info(nba_web.player_info(p["id"]))
        except Exception as exc:
            errors.append(p["id"])
            print(f"  ! {p['full_name']} ({p['id']}): {exc!r}")
            continue
        update = {f: v for f, v in bio.items() if v is not None and p.get(f) in (None, "")}
        if not update:
            continue
        print(f"  {p['full_name']}: {', '.join(sorted(update))}")
        if not args.dry_run:
            client.table("players").update(update).eq("id", p["id"]).execute()
        filled += 1

    print(f"Fichas completadas: {filled} · fallidas: {len(errors)}")
    if errors and len(errors) == len(missing[:MAX_PER_RUN]):
        sys.exit(1)  # ni una sola página: nba.com bloquea o ha cambiado


if __name__ == "__main__":
    main()
