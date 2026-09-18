"""
MatrixCapture Server Configuration Module.
Centralizes loading of configuration variables from root .env with robust defaults.
"""
import os
import json
from pathlib import Path
from typing import List

# Try importing python-dotenv
try:
    from dotenv import load_dotenv
except ImportError:
    load_dotenv = None

# Directory Paths
SERVER_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SERVER_DIR.parent
STORAGE_DIR = SERVER_DIR / "storage"
FRAMES_DIR = STORAGE_DIR / "frames"
DATA_DIR = STORAGE_DIR / "data"

for directory in [STORAGE_DIR, FRAMES_DIR, DATA_DIR]:
    directory.mkdir(parents=True, exist_ok=True)

CONFIG_FILE = DATA_DIR / "config.json"
DOCUMENT_FILE = DATA_DIR / "document_state.json"
RECAPTURE_QUEUE_FILE = DATA_DIR / "recapture_queue.json"

# Load environment from project root .env, then server-local .env
if load_dotenv:
    root_env = PROJECT_ROOT / ".env"
    if root_env.exists():
        load_dotenv(dotenv_path=root_env, override=False)
    server_env = SERVER_DIR / ".env"
    if server_env.exists():
        load_dotenv(dotenv_path=server_env, override=False)

# 1. Gemini AI OCR Configuration
_persisted_key = ""
if CONFIG_FILE.exists():
    try:
        with open(CONFIG_FILE, "r", encoding="utf-8") as f:
            cfg = json.load(f)
            _persisted_key = cfg.get("api_key", "").strip()
    except Exception:
        pass

GEMINI_API_KEY: str = os.environ.get("GEMINI_API_KEY", "").strip() or _persisted_key
GEMINI_PRIMARY_MODEL: str = os.environ.get("GEMINI_PRIMARY_MODEL", "gemini-3.6-flash").strip()

_raw_fallbacks = os.environ.get("GEMINI_FALLBACK_MODELS", "gemini-3.5-flash-lite,gemini-3.1-flash-lite")
GEMINI_FALLBACK_MODELS: List[str] = [m.strip() for m in _raw_fallbacks.split(",") if m.strip()]

GEMINI_RETRY_ATTEMPTS: int = int(os.environ.get("GEMINI_RETRY_ATTEMPTS", "3"))
GEMINI_RETRY_BACKOFF_BASE: float = float(os.environ.get("GEMINI_RETRY_BACKOFF_BASE", "2.0"))

GEMINI_PRICE_PER_MILLION_PROMPT_TOKENS: float = float(
    os.environ.get("GEMINI_PRICE_PER_MILLION_PROMPT_TOKENS", "0.075")
)
GEMINI_PRICE_PER_MILLION_CANDIDATE_TOKENS: float = float(
    os.environ.get("GEMINI_PRICE_PER_MILLION_CANDIDATE_TOKENS", "0.30")
)

# 2. FastAPI Backend Server & Network
SERVER_HOST: str = os.environ.get("SERVER_HOST", "0.0.0.0").strip()
SERVER_PORT: int = int(os.environ.get("SERVER_PORT", "8000"))

_raw_cors = os.environ.get("CORS_ALLOWED_ORIGINS", "*").strip()
if _raw_cors == "*":
    CORS_ALLOWED_ORIGINS: List[str] = ["*"]
else:
    CORS_ALLOWED_ORIGINS: List[str] = [origin.strip() for origin in _raw_cors.split(",") if origin.strip()]

# 3. Pacer & Document Defaults
TARGET_TOTAL_LINES: int = int(os.environ.get("TARGET_TOTAL_LINES", "9487"))
PACER_LINE_PITCH_PX: float = float(os.environ.get("PACER_LINE_PITCH_PX", "32.0"))
PACER_AUTO_TUNE_FACTOR: float = float(os.environ.get("PACER_AUTO_TUNE_FACTOR", "1.0"))


def set_api_key(new_key: str) -> None:
    """Updates API key in memory and persists to storage."""
    global GEMINI_API_KEY
    GEMINI_API_KEY = new_key.strip()
    try:
        with open(CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump({"api_key": GEMINI_API_KEY}, f, indent=2)
    except Exception as e:
        print(f"Error persisting API key: {e}")


def get_candidate_models() -> List[str]:
    """Returns candidate models in prioritized order: primary followed by fallbacks."""
    models = [GEMINI_PRIMARY_MODEL]
    for fb in GEMINI_FALLBACK_MODELS:
        if fb not in models:
            models.append(fb)
    return models
