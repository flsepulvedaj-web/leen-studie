"""Localiza ffmpeg y ffprobe."""

from __future__ import annotations

import os
import shutil
import sys
from pathlib import Path

from . import config


def _candidatos(nombre: str) -> list[Path]:
    exe = f"{nombre}.exe" if sys.platform == "win32" else nombre
    rutas = [config.BASE_DIR / "tools" / "ffmpeg" / "bin" / exe]
    local = os.environ.get("LOCALAPPDATA")
    if local:
        # winget instala ffmpeg aquí; el PATH de una ventana abierta antes de
        # instalarlo todavía no lo conoce, así que lo buscamos a mano.
        winget = Path(local) / "Microsoft" / "WinGet"
        rutas.append(winget / "Links" / exe)
        rutas.extend(sorted((winget / "Packages").glob(f"Gyan.FFmpeg*/*/bin/{exe}")))
    return rutas


def _buscar(nombre: str, variable_env: str) -> str | None:
    forzado = os.environ.get(variable_env)
    if forzado and Path(forzado).exists():
        return forzado
    en_path = shutil.which(nombre)
    if en_path:
        return en_path
    for ruta in _candidatos(nombre):
        if ruta.exists():
            return str(ruta)
    return None


def ffmpeg() -> str | None:
    return _buscar("ffmpeg", "LEEN_FFMPEG")


def ffprobe() -> str | None:
    return _buscar("ffprobe", "LEEN_FFPROBE")


def ffmpeg_ok() -> bool:
    return ffmpeg() is not None and ffprobe() is not None
