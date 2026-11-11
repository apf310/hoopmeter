"""Cifras del convenio colectivo (CBA) de la temporada en curso, para calcular contratos exactos.

Revisar todo este bloque cada verano, igual que el de web-app/src/lib/trade-rules.ts (un test
comprueba que el tope y el mínimo coinciden en los dos sitios).

Fuentes 2026-27:
- Tope y excepciones: nota oficial de la NBA (pr.nba.com/2026-27-salary-cap).
- Mínimos por años de experiencia: tabla de Hoops Rumors ("NBA minimum salaries for 2026/27").
- Excepción bianual: Hoops Rumors ("Values of 2026/27 mid-level, bi-annual exceptions").
"""
from datetime import date

SEASON = "2026-27"
SALARY_CAP = 164_961_000

# Primer y último día de la temporada regular (hora del Este): 174 días, la base del prorrateo
REGULAR_SEASON_START = date(2026, 10, 20)
REGULAR_SEASON_END = date(2027, 4, 11)

# Salario mínimo según años de experiencia (`SEASON_EXP` de nba_api): 10 = diez o más
MINIMUM_SALARY = {
    0: 1_357_763,
    1: 2_185_116,
    2: 2_449_421,
    3: 2_537_526,
    4: 2_625_627,
    5: 2_845_883,
    6: 3_066_143,
    7: 3_286_399,
    8: 3_506_659,
    9: 3_524_115,
    10: 3_876_529,
}

# Primer año de un contrato firmado con la excepción completa
FULL_EXCEPTIONS = {
    "non_taxpayer_mle": 15_044_000,
    "taxpayer_mle": 6_064_000,
    "room_mle": 9_366_000,
    "bi_annual": 5_477_000,
}

# Un contrato nuevo nunca pasa del 35 % del tope (salvo el 105 % de su salario anterior, muy raro)
MAX_SALARY = round(SALARY_CAP * 0.35)


def stale_season(today: date) -> str | None:
    """Aviso si ya empezó el año de liga siguiente (1 de julio) y estas cifras siguen siendo las de antes.

    A partir de ese día los contratos cambian de temporada: aplicar movimientos con las cifras viejas
    los estropearía, así que los procesos se paran y avisan hasta que se revise este bloque.
    """
    next_league_year = date(int(SEASON[:4]) + 1, 7, 1)
    if today < next_league_year:
        return None
    return (f"Ha empezado el año de liga {next_league_year.year}-{(next_league_year.year + 1) % 100:02d} y las cifras del convenio "
            f"siguen siendo las de {SEASON}: actualiza processors/cba.py y web-app/src/lib/trade-rules.ts y aplica el cambio de temporada.")


def minimum_salary(years_of_service: int) -> int:
    return MINIMUM_SALARY[min(max(years_of_service, 0), 10)]


def prorated(full_salary: int, signed_on: date, season_start: date, season_end: date) -> tuple[int, bool]:
    """Salario de quien firma con la temporada ya empezada: lo que queda de ella, día a día.

    Devuelve (cifra, exacta). Antes del primer partido cobra la temporada entera (exacta); después,
    la parte proporcional de días, que puede variar en un día según cómo los cuente la liga.
    """
    if signed_on <= season_start:
        return full_salary, True
    total_days = (season_end - season_start).days + 1
    remaining = max((season_end - signed_on).days + 1, 0)
    return round(full_salary * remaining / total_days), False
