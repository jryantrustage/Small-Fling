"""MatrixCapture Server Configuration Module."""
import os, json
from pathlib import Path
from typing import List

try:
    from dotenv import load_dotenv
except ImportError:
    load_dotenv = None

SERVER_DIR = Path(__file__).resolve().parent
PROJECT_ROOT, STORAGE_DIR = SERVER_DIR.parent, SERVER_DIR / "storage"
FRAMES_DIR, DATA_DIR = STORAGE_DIR / "frames", STORAGE_DIR / "data"
for d in [STORAGE_DIR, FRAMES_DIR, DATA_DIR]: d.mkdir(parents=True, exist_ok=True)

CONFIG_FILE = DATA_DIR / "config.json"
DOCUMENT_FILE = DATA_DIR / "document_state.json"
RECAPTURE_QUEUE_FILE = DATA_DIR / "recapture_queue.json"

if load_dotenv:
    for env_path in [PROJECT_ROOT / ".env", SERVER_DIR / ".env"]:
        if env_path.exists(): load_dotenv(dotenv_path=env_path, override=False)

_persisted_key = ""
if CONFIG_FILE.exists():
    try:
        with open(CONFIG_FILE, "r", encoding="utf-8") as f:
            _persisted_key = json.load(f).get("api_key", "").strip()
    except Exception: pass

GEMINI_API_KEY: str = os.environ.get("GEMINI_API_KEY", "").strip() or _persisted_key
GEMINI_PRIMARY_MODEL: str = os.environ.get("GEMINI_PRIMARY_MODEL", "gemini-3.6-flash").strip()
GEMINI_FALLBACK_MODELS: List[str] = [m.strip() for m in os.environ.get("GEMINI_FALLBACK_MODELS", "gemini-3.7-flash,gemini-3.8-flash,gemini-flash-latest,gemini-pro-latest").split(",") if m.strip()]
GEMINI_RETRY_ATTEMPTS: int = int(os.environ.get("GEMINI_RETRY_ATTEMPTS", "3"))
GEMINI_RETRY_BACKOFF_BASE: float = float(os.environ.get("GEMINI_RETRY_BACKOFF_BASE", "2.0"))
GEMINI_PRICE_PER_MILLION_PROMPT_TOKENS: float = float(os.environ.get("GEMINI_PRICE_PER_MILLION_PROMPT_TOKENS", "0.075"))
GEMINI_PRICE_PER_MILLION_CANDIDATE_TOKENS: float = float(os.environ.get("GEMINI_PRICE_PER_MILLION_CANDIDATE_TOKENS", "0.30"))

SERVER_HOST: str = os.environ.get("SERVER_HOST", "0.0.0.0").strip()
SERVER_PORT: int = int(os.environ.get("SERVER_PORT", "8000"))
_cors = os.environ.get("CORS_ALLOWED_ORIGINS", "*").strip()
CORS_ALLOWED_ORIGINS: List[str] = ["*"] if _cors == "*" else [o.strip() for o in _cors.split(",") if o.strip()]

TARGET_TOTAL_LINES: int = int(os.environ.get("TARGET_TOTAL_LINES", "0"))
PACER_LINE_PITCH_PX: float = float(os.environ.get("PACER_LINE_PITCH_PX", "32.0"))
PACER_AUTO_TUNE_FACTOR: float = float(os.environ.get("PACER_AUTO_TUNE_FACTOR", "1.0"))
OLLAMA_URL: str = os.environ.get("OLLAMA_URL", "http://127.0.0.1:11434").strip()
OLLAMA_VISION_MODEL: str = os.environ.get("OLLAMA_VISION_MODEL", "llama3.2-vision").strip()
OLLAMA_CODER_MODEL: str = os.environ.get("OLLAMA_CODER_MODEL", "qwen2.5-coder").strip()
OLLAMA_MODEL: str = os.environ.get("OLLAMA_MODEL", OLLAMA_VISION_MODEL).strip()
OLLAMA_TIMEOUT: int = int(os.environ.get("OLLAMA_TIMEOUT", "45"))

def set_api_key(new_key: str) -> None:
    global GEMINI_API_KEY
    GEMINI_API_KEY = new_key.strip()
    try:
        with open(CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump({"api_key": GEMINI_API_KEY}, f, indent=2)
    except Exception as e: print(f"Error persisting API key: {e}")

def get_candidate_models() -> List[str]:
    return [GEMINI_PRIMARY_MODEL] + [fb for fb in GEMINI_FALLBACK_MODELS if fb != GEMINI_PRIMARY_MODEL]
