import os

from dotenv import load_dotenv

load_dotenv()

# supabase-py espera la URL base del proyecto, sin el sufijo /rest/v1/
SUPABASE_URL = os.getenv("SUPABASE_URL", "").split("/rest/v1")[0].rstrip("/")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_KEY", "")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

# Pausa entre llamadas consecutivas a endpoints estadísticos de nba_api
API_SLEEP_SECONDS = 0.6
