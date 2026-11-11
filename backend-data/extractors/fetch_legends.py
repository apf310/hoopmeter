"""Tarea 4.3 — Leyendas retiradas para el comparador y sus fichas de jugador.

Da de alta en `players` (`is_active = false`, sin equipo) a los jugadores de LEGENDS y llena su
trayectoria y palmarés con las mismas funciones que `fetch_career_awards.py`. Son una lista curada
y no los ~4.700 retirados de la NBA: cada uno cuesta 3 llamadas a stats.nba.com.

- Se saltan los que ya están en `players` como activos: su ficha la mantienen los otros scripts.
- La NBA no registró robos y tapones hasta 1973-74 ni triples hasta 1979-80: esos datos quedan en NULL.
- Solo hay estadísticas de la NBA: los años en la ABA (Erving, Gervin, Moses Malone…) no cuentan.

Uso (desde backend-data/):
    python -m extractors.fetch_legends                            # todas (~8 min)
    python -m extractors.fetch_legends --resume                   # solo las que aún no están guardadas
    python -m extractors.fetch_legends --name "Michael Jordan" --dry-run
"""
import argparse
import sys
import time
import unicodedata

from nba_api.stats.endpoints import commonplayerinfo
from nba_api.stats.static import players as static_players
from nba_api.stats.static import teams as static_teams
from requests.exceptions import RequestException

from config import API_SLEEP_SECONDS, SUPABASE_SERVICE_KEY, SUPABASE_URL
from extractors.fetch_career_awards import MAX_CONSECUTIVE_FAILS, build_awards, build_stats, load_processed_ids, nba_call, save_player
from extractors.fetch_teams_players import clean, height_to_meters, upsert, weight_to_kg

# Equipo del 75.º aniversario de la NBA, otras figuras y los nombres propios del público español
LEGENDS = (
    "Kareem Abdul-Jabbar", "Carmelo Anthony", "Nate Archibald", "Paul Arizin", "Charles Barkley", "Rick Barry",
    "Elgin Baylor", "Dave Bing", "Larry Bird", "Kobe Bryant", "Wilt Chamberlain", "Bob Cousy", "Dave Cowens",
    "Billy Cunningham", "Dave DeBusschere", "Clyde Drexler", "Tim Duncan", "Julius Erving", "Patrick Ewing",
    "Walt Frazier", "Kevin Garnett", "George Gervin", "Hal Greer", "John Havlicek", "Elvin Hayes", "Allen Iverson",
    "Magic Johnson", "Sam Jones", "Michael Jordan", "Jason Kidd", "Jerry Lucas", "Karl Malone", "Moses Malone",
    "Pete Maravich", "Bob McAdoo", "Kevin McHale", "George Mikan", "Reggie Miller", "Earl Monroe", "Steve Nash",
    "Dirk Nowitzki", "Shaquille O'Neal", "Hakeem Olajuwon", "Robert Parish", "Gary Payton", "Bob Pettit", "Paul Pierce",
    "Scottie Pippen", "Willis Reed", "Oscar Robertson", "David Robinson", "Dennis Rodman", "Bill Russell",
    "Dolph Schayes", "Bill Sharman", "John Stockton", "Isiah Thomas", "Nate Thurmond", "Wes Unseld", "Dwyane Wade",
    "Bill Walton", "Jerry West", "Lenny Wilkens", "Dominique Wilkins", "James Worthy",
    "Tracy McGrady", "Vince Carter", "Yao Ming", "Manu Ginobili", "Tony Parker", "Dwight Howard", "Derrick Rose",
    "Ray Allen", "Chris Bosh", "Alonzo Mourning", "Grant Hill", "Anfernee Hardaway", "Dikembe Mutombo", "Ben Wallace",
    "Blake Griffin", "Chris Webber", "Dennis Johnson", "Joe Dumars", "Adrian Dantley", "Alex English", "Bernard King",
    "Artis Gilmore", "Sidney Moncrief", "Mitch Richmond", "Tim Hardaway", "Shawn Kemp", "Drazen Petrovic", "Toni Kukoc",
    "Vlade Divac", "Arvydas Sabonis", "Peja Stojakovic", "Steve Kerr", "Robert Horry", "Rasheed Wallace",
    "Chauncey Billups", "Amar'e Stoudemire", "LaMarcus Aldridge", "Gilbert Arenas", "Kevin Johnson", "Mark Price",
    "Pau Gasol", "Marc Gasol", "Jose Calderon", "Juan Carlos Navarro", "Rudy Fernandez", "Sergio Rodriguez",
    "Ricky Rubio", "Serge Ibaka",
)

# CommonPlayerInfo da la posición completa; `players` la guarda abreviada como PlayerIndex
POSITIONS = {
    "Guard": "G", "Forward": "F", "Center": "C", "Guard-Forward": "G-F", "Forward-Guard": "F-G",
    "Forward-Center": "F-C", "Center-Forward": "C-F",
}


def plain_name(name: str) -> str:
    """Sin tildes ni mayúsculas, pero con sufijos: 'Gary Payton' no es 'Gary Payton II'."""
    return "".join(c for c in unicodedata.normalize("NFKD", name.lower()) if c.isascii())


def resolve_ids(names: tuple[str, ...]) -> tuple[list[int], list[str]]:
    """Ids de la NBA de una lista de nombres; devuelve (ids, nombres sin encontrar)."""
    ids_by_name = {}
    for p in static_players.get_players():
        key = plain_name(p["full_name"])
        ids_by_name[key] = min(p["id"], ids_by_name.get(key, p["id"]))  # Homónimos, como Ewing y su hijo: el más antiguo
    ids = [ids_by_name.get(plain_name(name)) for name in names]
    return [pid for pid in ids if pid], [name for name, pid in zip(names, ids) if not pid]


def digits(value) -> int | None:
    """'1984' -> 1984; 'Undrafted', '' y None -> None."""
    return int(value) if str(value).isdigit() else None


def build_player(player_id: int) -> dict:
    info = nba_call(commonplayerinfo.CommonPlayerInfo, player_id=player_id)["CommonPlayerInfo"].iloc[0]
    birth = clean(info["BIRTHDATE"])
    return {
        "id": player_id,
        "team_id": None,
        "full_name": info["DISPLAY_FIRST_LAST"],
        "position": POSITIONS.get(info["POSITION"], clean(info["POSITION"])),
        "height": height_to_meters(info["HEIGHT"]),
        "weight": weight_to_kg(info["WEIGHT"]),
        "country": clean(info["COUNTRY"]),
        "birth_date": birth[:10] if birth else None,
        "draft_year": digits(info["DRAFT_YEAR"]),
        "draft_number": digits(info["DRAFT_NUMBER"]),
        "is_active": False,
    }


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--name", action="append", help="procesa solo este jugador (repetible)")
    parser.add_argument("--dry-run", action="store_true", help="no escribe en Supabase")
    parser.add_argument("--resume", action="store_true", help="salta los que ya tienen trayectoria guardada")
    args = parser.parse_args()

    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        sys.exit("Faltan SUPABASE_URL y/o SUPABASE_KEY en backend-data/.env")

    from supabase import create_client

    client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    ids, unknown = resolve_ids(tuple(args.name or LEGENDS))
    if unknown:
        print("Sin encontrar en nba_api:", ", ".join(unknown))

    active = {p["id"] for p in client.table("players").select("id").eq("is_active", True).execute().data}
    skipped = load_processed_ids(client) if args.resume else set()
    pending = [pid for pid in ids if pid not in active and pid not in skipped]
    print(f"Procesando {len(pending)} leyendas ({len(ids) - len(pending)} se saltan)...")

    team_ids = {t["id"] for t in static_teams.get_teams()}
    failed, n_stats, n_awards, consecutive = [], 0, 0, 0
    for i, player_id in enumerate(pending, 1):
        try:
            player = build_player(player_id)
            time.sleep(API_SLEEP_SECONDS)
            stats = build_stats(player_id, team_ids)
            time.sleep(API_SLEEP_SECONDS)
            awards = build_awards(player_id)
            time.sleep(API_SLEEP_SECONDS)
            if args.dry_run:
                print("[dry-run]", player, f"· {len(stats)} filas · {len(awards)} premios")
            else:
                upsert(client, "players", [player])  # primero el jugador: sus estadísticas lo referencian
                save_player(client, player_id, stats, awards)
            n_stats += len(stats)
            n_awards += len(awards)
            consecutive = 0
        except Exception as exc:  # una leyenda fallida no debe abortar el resto
            failed.append(player_id)
            print(f"  ! {player_id}: {exc!r}")
            consecutive = consecutive + 1 if isinstance(exc, RequestException) else 0
            if consecutive >= MAX_CONSECUTIVE_FAILS:
                print("stats.nba.com está bloqueando: espera 15-30 min y relanza con --resume.")
                break
        if i % 20 == 0:
            print(f"  {i}/{len(pending)}")

    print(f"\nFilas de temporada: {n_stats} · premios: {n_awards} · fallidos: {len(failed)}")
    if failed:
        print("Relanza con --resume para reintentar los que falten.")


if __name__ == "__main__":
    main()
