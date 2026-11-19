"""Arranque: python -m leen_transcriber"""

import logging
import os
import sys
import threading
import time

import uvicorn

from . import __version__, binarios, config, modelos
from .main import app


def _vigilar_proceso_padre(pid: int) -> None:
    """Si el proceso que nos lanzó (la app de escritorio) desaparece, nos
    cerramos: así nunca quedan servicios huérfanos ocupando memoria."""

    def esperar() -> None:
        if sys.platform == "win32":
            import ctypes

            SYNCHRONIZE = 0x00100000
            INFINITE = 0xFFFFFFFF
            k = ctypes.windll.kernel32  # type: ignore[attr-defined]
            handle = k.OpenProcess(SYNCHRONIZE, False, pid)
            if not handle:
                os._exit(0)  # el padre ya no existe
            k.WaitForSingleObject(handle, INFINITE)
        else:
            while True:
                try:
                    os.kill(pid, 0)
                except OSError:
                    break
                time.sleep(2)
        os._exit(0)

    threading.Thread(target=esperar, name="vigilante-padre", daemon=True).start()


def main() -> None:
    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s"
    )
    padre = os.environ.get("LEEN_PARENT_PID", "").strip()
    if padre.isdigit():
        _vigilar_proceso_padre(int(padre))

    if config.HOST not in ("127.0.0.1", "localhost"):
        print(
            "AVISO: el servicio está pensado para escuchar solo en este "
            "computador (127.0.0.1). Cambiar LEEN_HOST lo expone a tu red."
        )
    print(f"LEEN STUDIE · Transcripción local v{__version__}")
    print(f"Escuchando en http://{config.HOST}:{config.PORT}")
    print(f"Datos en: {config.DATA_DIR}")
    print(f"ffmpeg:   {'encontrado' if binarios.ffmpeg_ok() else 'NO encontrado (ver README)'}")
    print(
        "Modelos:  "
        + ", ".join(f"{t}={'listo' if ok else 'falta'}" for t, ok in modelos.estado().items())
    )
    print("Deja esta ventana abierta mientras transcribes. Ciérrala para detenerlo.\n")
    uvicorn.run(app, host=config.HOST, port=config.PORT, log_level="warning")


if __name__ == "__main__":
    main()
