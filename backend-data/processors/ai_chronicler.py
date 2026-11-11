"""APARCADO (2026-11-04): fuera del pipeline. `watcher.py` ya no lo llama; la app funciona solo
con la nota para no depender de las cuotas de Gemini. Se conserva por si se recupera más adelante.

Textos IA de cada partido terminado con Gemini Flash.

- Pista Nivel 2 (`ai_teaser_level2`): 1-2 frases sobre el ritmo y el tipo de duelo, SIN ganador,
  marcador, prórrogas, récords ni nada sobre el final. Doble blindaje:
    1. El modelo solo recibe `safe_facts` (lista blanca sin esos datos): no puede filtrar lo que no sabe.
    2. `spoiler_hits` revisa la respuesta; si cuela algo se reintenta y, si vuelve a fallar, se descarta.
- Crónica Nivel 3 (`ai_summary_full`): crónica táctica completa con todos los datos (`full_facts`).

Uso (desde backend-data/):
    python -m processors.ai_chronicler 0022600170    # genera y muestra ambos textos, sin escribir
"""
import json
import re
import sys
import time
import unicodedata

from config import AI_SLEEP_SECONDS, GEMINI_API_KEY, GEMINI_FALLBACK_MODELS, GEMINI_MODEL

RETRIES = 2
GEMINI_TIMEOUT_SECONDS = 90
# Espera (s) tras cada intento fallido de un mismo modelo antes de reintentar o pasar al siguiente
MODEL_RETRY_WAITS = (5, 15)

TEASER_SYSTEM = """Eres un periodista de baloncesto NBA que escribe en español de España para una app SIN SPOILERS.
Escribes la "pista" de un partido ya terminado para alguien que aún NO lo ha visto y quiere saber si merece la pena,
explicando por qué tiene su nota de espectáculo sin estropearle nada.

Reglas OBLIGATORIAS:
- 1 o 2 frases, máximo 40 palabras. Solo el texto, sin comillas, títulos ni emojis.
- Usa SOLO los datos que se te dan. No inventes nada.
- PROHIBIDO: decir o insinuar quién ganó o perdió, el marcador o diferencias, si hubo prórroga,
  cómo fue el final o los últimos minutos, remontadas, récords, cifras individuales o cualquier número.
- No repitas la nota numérica. Habla del ritmo, el acierto, el estilo de juego y los jugadores a seguir.
- Los datos son etiquetas internas: no las copies literalmente ("acierto normal", "alternancia media"),
  tradúcelas a lenguaje natural de periodista y quédate solo con lo más atractivo.
- Sé coherente con la nota (1-10): si es baja, sé honesto (puede valer para ver a alguna estrella o un estilo
  concreto) y no lo vendas como imprescindible; si es alta, transmite que merece la pena."""

CHRONICLE_SYSTEM = """Eres un analista táctico de la NBA que escribe crónicas en español de España.
Escribe la crónica de un partido terminado para aficionados que ya conocen el resultado.

Reglas:
- 150-220 palabras en 2 o 3 párrafos separados por una línea en blanco. Texto plano: sin títulos, listas ni markdown.
- Empieza por el resultado y explica POR QUÉ ganó el vencedor: claves tácticas (rebote, pérdidas, pintura,
  triples, banquillo, transiciones, parciales decisivos) y cómo se decidió el final.
- Destaca a los jugadores clave con sus cifras.
- Usa SOLO los datos proporcionados: no inventes jugadas, lesiones, declaraciones ni contexto externo."""

# Sobre el texto normalizado (minúsculas y sin tildes). Las raíces van ancladas al inicio de
# palabra (\b) para no saltar dentro de otras: "protAGONIsmo", "conVENCer", "RECORDar".
SPOILER_PATTERNS = [
    r"\d",                                                    # marcadores, cifras, la propia nota
    r"\bprorroga|\btiempo extra|\bovertime|\bot\b|\bclutch",
    r"\bgan(o|a|an|ar|aron|ador|adores|adora)\b|\bvictori|\bderrot|\bvenc(e|i|ed)|\btriunf|\bperdi(o|eron|dos?\b)|\bperdedor|\bse impus|\bimponerse",
    r"\bremont|\bpaliza|\barroll|\baplast|\bsentenc|\bdesenlace|hasta el final|\bventaja|\bigualad|\bapretad|\bajustad|\binfarto|\bagonic",
    r"\bultim[oa]s? (segundo|minuto|tiro|cuarto|posesion|accion|jugada)|\bbocina|\bbuzzer|canasta ganadora|tiro ganador",
    r"\brecords?\b|\bhistoric|career high|maximo de su carrera|\btriple.?doble|\bpuntos\b",
]


class AIUnavailable(RuntimeError):
    """Ningún modelo responde (cuota agotada o saturación): el watcher pausa la IA un rato."""


def normalize(text: str) -> str:
    text = unicodedata.normalize("NFKD", text.lower())
    return "".join(c for c in text if not unicodedata.combining(c))


def spoiler_hits(text: str) -> list[str]:
    """Fragmentos del texto que destripan algo (lista vacía = pista segura)."""
    norm = normalize(text)
    return [m.group(0) for pattern in SPOILER_PATTERNS for m in [re.search(pattern, norm)] if m]


_client = None


def client():
    global _client
    if _client is None:
        if not GEMINI_API_KEY:
            raise RuntimeError("Falta GEMINI_API_KEY en backend-data/.env")
        from google import genai

        _client = genai.Client(api_key=GEMINI_API_KEY)
    return _client


def is_retryable(exc: Exception) -> bool:
    """Saturación (503), cuota por minuto (429), modelo retirado (404) o corte de red/timeout."""
    from google.genai import errors

    if isinstance(exc, errors.APIError):
        return exc.code in (404, 429, 500, 502, 503, 504)
    return isinstance(exc, (TimeoutError, ConnectionError)) or "timeout" in type(exc).__name__.lower()


def generate(system: str, prompt: str, temperature: float) -> str:
    """Prueba el modelo principal y luego los de reserva, con espera creciente entre intentos."""
    from google.genai import types

    config = types.GenerateContentConfig(
        system_instruction=system,
        temperature=temperature,
        http_options=types.HttpOptions(timeout=GEMINI_TIMEOUT_SECONDS * 1000),  # en ms
    )
    models = [GEMINI_MODEL] + [m for m in GEMINI_FALLBACK_MODELS if m != GEMINI_MODEL]
    last_error = None
    for model in models:
        for attempt, wait in enumerate(MODEL_RETRY_WAITS, 1):
            try:
                response = client().models.generate_content(model=model, contents=prompt, config=config)
                time.sleep(AI_SLEEP_SECONDS)  # margen para el límite de peticiones por minuto del plan gratuito
                return (response.text or "").strip()
            except Exception as exc:
                if not is_retryable(exc):
                    raise
                last_error = exc
                code = getattr(exc, "code", type(exc).__name__)
                print(f"  ~ {model} no disponible ({code}), intento {attempt}/{len(MODEL_RETRY_WAITS)}")
                daily_quota = getattr(exc, "code", None) == 429 and "PerDay" in str(exc)
                if getattr(exc, "code", None) == 404 or daily_quota:
                    break  # modelo retirado o cuota diaria agotada: esperar no sirve, siguiente modelo
                time.sleep(wait)
    raise AIUnavailable(f"ningún modelo de Gemini disponible ({', '.join(models)})") from last_error


def generate_teaser(safe_facts: dict) -> str | None:
    """Pista Nivel 2, o None si el modelo no consigue una sin spoilers."""
    prompt = "Datos del partido (sin spoilers):\n" + json.dumps(safe_facts, ensure_ascii=False, indent=2)
    for attempt in range(1, RETRIES + 1):
        text = generate(TEASER_SYSTEM, prompt, temperature=0.8)
        hits = spoiler_hits(text)
        if text and not hits:
            return text
        print(f"  ~ pista descartada ({attempt}/{RETRIES}) por {hits}: {text!r}")
        prompt += f"\n\nTu respuesta anterior incumplía las reglas por: {', '.join(hits)}. Reescríbela sin eso."
    return None


def generate_chronicle(full_facts: dict) -> str | None:
    prompt = "Datos del partido:\n" + json.dumps(full_facts, ensure_ascii=False, indent=2)
    return generate(CHRONICLE_SYSTEM, prompt, temperature=0.6) or None


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    from processors.excitement_calculator import analyze_game

    result = analyze_game(sys.argv[1])
    print(f"Nota: {result['excitement_score']}\n")
    print("Pista Nivel 2:\n ", generate_teaser(result["safe_facts"]), "\n")
    print("Crónica Nivel 3:\n", generate_chronicle(result["full_facts"]))


if __name__ == "__main__":
    main()
