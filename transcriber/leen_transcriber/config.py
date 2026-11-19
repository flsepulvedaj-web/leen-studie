"""Configuración del servicio. Todo se puede cambiar con variables de entorno."""

from __future__ import annotations

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent


def _datos_por_defecto() -> Path:
    """Fuera de la carpeta del proyecto a propósito: el Escritorio y Documentos
    suelen estar sincronizados con OneDrive, que subiría los videos a la nube
    y puede corromper la base de datos."""
    if os.name == "nt" and os.environ.get("LOCALAPPDATA"):
        return Path(os.environ["LOCALAPPDATA"]) / "LeenStudie" / "transcriber"
    return Path.home() / ".local" / "share" / "leen-studie" / "transcriber"


DATA_DIR = Path(os.environ.get("LEEN_DATA_DIR", _datos_por_defecto())).resolve()
MEDIA_DIR = DATA_DIR / "media"  # copias de los audios/videos subidos
TMP_DIR = DATA_DIR / "tmp"  # wav temporales (se borran al terminar)
MODELS_DIR = DATA_DIR / "models"  # modelos de Whisper descargados
DB_PATH = DATA_DIR / "leen.db"

# El servicio solo escucha en esta máquina. No lo expongas a la red.
HOST = os.environ.get("LEEN_HOST", "127.0.0.1")
PORT = int(os.environ.get("LEEN_PORT", "8765"))

# Carpetas extra donde buscar modelos ya descargados (solo lectura). La app de
# escritorio trae el modelo "small" empaquetado y lo apunta con esta variable.
MODELS_EXTRA_DIRS = [
    Path(p).resolve()
    for p in os.environ.get("LEEN_MODELS_EXTRA_DIR", "").split(os.pathsep)
    if p.strip()
]

_ORIGENES_BASE = [
    "leen://app",  # app de escritorio (Electron)
    "https://flsepulvedaj-web.github.io",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5199",
    "http://127.0.0.1:5199",
    "http://localhost:4173",
    "http://127.0.0.1:4173",
]
ALLOWED_ORIGINS = _ORIGENES_BASE + [
    o.strip().rstrip("/")
    for o in os.environ.get("LEEN_ALLOWED_ORIGINS", "").split(",")
    if o.strip()
]
ALLOWED_HOSTS = ["127.0.0.1", "localhost", "testserver"]

MAX_UPLOAD_BYTES = int(float(os.environ.get("LEEN_MAX_UPLOAD_GB", "8")) * 1024**3)

# Modo de prueba: no usa ffmpeg ni Whisper, genera segmentos falsos.
FAKE = os.environ.get("LEEN_FAKE_TRANSCRIBER") == "1"

BEAM_SIZE = int(os.environ.get("LEEN_BEAM_SIZE", "5"))
# Dejamos un par de núcleos libres para que el PC siga usable mientras transcribe.
CPU_THREADS = int(
    os.environ.get("LEEN_CPU_THREADS", max(2, min(8, (os.cpu_count() or 4) - 2)))
)

MODELOS = ("small", "medium")

EXTENSIONES_VIDEO = {".mp4", ".m4v", ".mov", ".mkv", ".webm", ".avi"}
EXTENSIONES_AUDIO = {".m4a", ".mp3", ".wav", ".aac", ".ogg", ".opus", ".flac", ".wma"}
EXTENSIONES = EXTENSIONES_VIDEO | EXTENSIONES_AUDIO

MIME = {
    ".mp4": "video/mp4",
    ".m4v": "video/mp4",
    ".mov": "video/quicktime",
    ".mkv": "video/x-matroska",
    ".webm": "video/webm",
    ".avi": "video/x-msvideo",
    ".m4a": "audio/mp4",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".aac": "audio/aac",
    ".ogg": "audio/ogg",
    ".opus": "audio/ogg",
    ".flac": "audio/flac",
    ".wma": "audio/x-ms-wma",
}


def asegurar_dirs() -> None:
    for d in (DATA_DIR, MEDIA_DIR, TMP_DIR, MODELS_DIR):
        d.mkdir(parents=True, exist_ok=True)
