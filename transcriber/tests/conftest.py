"""Las pruebas usan un directorio temporal y el modo de prueba (sin Whisper)."""

import os
import sys
import tempfile
from pathlib import Path

_TMP = tempfile.mkdtemp(prefix="leen-tests-")
os.environ["LEEN_DATA_DIR"] = _TMP
os.environ["LEEN_FAKE_TRANSCRIBER"] = "1"

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
