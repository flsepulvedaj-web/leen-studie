"""Modelos de Whisper: ubicar, descargar (solo la primera vez) y cargar."""

from __future__ import annotations

import gc
import sys
import threading
from pathlib import Path
from typing import Any

from . import config

_cache: dict[str, object] = {}

# Tamaño aproximado de cada descarga, para mostrar un porcentaje.
TAMANO_APROX = {"small": 486_000_000, "medium": 1_530_000_000}

_descargas: dict[str, dict[str, Any]] = {}
_lock = threading.Lock()


def ruta(tamano: str) -> Path:
    """Dónde SE DESCARGA el modelo (carpeta de datos de la usuaria)."""
    return config.MODELS_DIR / tamano


def ubicar(tamano: str) -> Path | None:
    """Carpeta donde YA está el modelo: primero la de la usuaria y después las
    extra (p. ej. el modelo empaquetado dentro de la app de escritorio)."""
    for base in [config.MODELS_DIR, *config.MODELS_EXTRA_DIRS]:
        if (base / tamano / "model.bin").exists():
            return base / tamano
    return None


def disponible(tamano: str) -> bool:
    return ubicar(tamano) is not None


def estado() -> dict[str, bool]:
    return {t: disponible(t) for t in config.MODELOS}


# --- Descarga con progreso -----------------------------------------------------


def _bytes_descargados(tamano: str) -> int:
    """Suma lo que hay en disco (incluye los archivos .incomplete en curso)."""
    destino = ruta(tamano)
    total = 0
    if destino.exists():
        for p in destino.rglob("*"):
            try:
                if p.is_file():
                    total += p.stat().st_size
            except OSError:
                pass
    return total


def estado_descarga(tamano: str) -> dict[str, Any]:
    with _lock:
        d = dict(_descargas.get(tamano, {}))
    if disponible(tamano):
        return {"estado": "listo", "progreso": 1.0, "error": None}
    if d.get("estado") == "descargando":
        aprox = TAMANO_APROX.get(tamano, 1)
        # Nunca mostramos 100 % hasta que termine de verdad.
        d["progreso"] = round(min(0.99, _bytes_descargados(tamano) / aprox), 4)
        return d
    if d.get("estado") == "error":
        return {"estado": "error", "progreso": 0.0, "error": d.get("error")}
    return {"estado": "falta", "progreso": 0.0, "error": None}


def descargar(tamano: str) -> Path:
    """Baja el modelo desde Hugging Face a data/models/<tamano>.
    Necesita internet SOLO esta vez; después se carga desde el disco."""
    if tamano not in config.MODELOS:
        raise ValueError(f"Modelo desconocido: {tamano}")
    from faster_whisper import download_model

    destino = ruta(tamano)
    destino.mkdir(parents=True, exist_ok=True)
    download_model(tamano, output_dir=str(destino))
    return destino


def iniciar_descarga(tamano: str) -> bool:
    """Lanza la descarga en segundo plano. False si ya está o ya se está bajando."""
    if tamano not in config.MODELOS:
        raise ValueError(f"Modelo desconocido: {tamano}")
    with _lock:
        if disponible(tamano) or _descargas.get(tamano, {}).get("estado") == "descargando":
            return False
        _descargas[tamano] = {"estado": "descargando", "progreso": 0.0, "error": None}

    def correr() -> None:
        try:
            descargar(tamano)
            with _lock:
                _descargas.pop(tamano, None)
        except Exception as e:  # noqa: BLE001
            with _lock:
                _descargas[tamano] = {
                    "estado": "error",
                    "progreso": 0.0,
                    "error": (
                        "No se pudo descargar el modelo. Revisa tu conexión a "
                        f"internet e inténtalo de nuevo. ({type(e).__name__})"
                    ),
                }

    threading.Thread(target=correr, name=f"descarga-{tamano}", daemon=True).start()
    return True


# --- Carga -----------------------------------------------------------------------


def cargar(tamano: str):
    """Carga el modelo en CPU con cuantización int8. Se reutiliza entre
    trabajos mientras haya cola; liberar() lo suelta cuando queda ocioso."""
    if tamano in _cache:
        return _cache[tamano]
    donde = ubicar(tamano)
    if donde is None:
        raise FileNotFoundError(
            f"Falta descargar el modelo '{tamano}'. Puedes hacerlo desde la "
            f"pestaña Clases de la app."
        )
    from faster_whisper import WhisperModel

    _cache.clear()
    modelo = WhisperModel(
        str(donde),
        device="cpu",
        compute_type="int8",
        cpu_threads=config.CPU_THREADS,
    )
    _cache[tamano] = modelo
    return modelo


def liberar() -> None:
    if _cache:
        _cache.clear()
        gc.collect()


def _main(argv: list[str]) -> int:
    tamanos = argv or ["small"]
    for t in tamanos:
        if t not in config.MODELOS:
            print(f"Modelo desconocido: {t}. Opciones: {', '.join(config.MODELOS)}")
            return 2
    for t in tamanos:
        if disponible(t):
            print(f"El modelo '{t}' ya está descargado en {ubicar(t)}")
            continue
        print(f"Descargando el modelo '{t}' (solo se hace una vez)...")
        print(f"Destino: {ruta(t)}")
        descargar(t)
        print(f"Listo: modelo '{t}' descargado.")
    return 0


if __name__ == "__main__":
    sys.exit(_main(sys.argv[1:]))
