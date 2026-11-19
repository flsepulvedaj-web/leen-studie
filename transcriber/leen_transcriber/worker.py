"""Cola de trabajos en segundo plano: ffprobe → ffmpeg (wav mono 16 kHz) →
faster-whisper (español, CPU, int8). Procesa de a un archivo a la vez."""

from __future__ import annotations

import json
import logging
import queue
import re
import subprocess
import sys
import threading
import time
from pathlib import Path
from typing import Callable

from . import binarios, config, db, modelos

log = logging.getLogger("leen.worker")

_NO_WINDOW = getattr(subprocess, "CREATE_NO_WINDOW", 0)

# El 5 % inicial de la barra es la extracción de audio; el resto, Whisper.
PESO_EXTRACCION = 0.05


class Cancelado(Exception):
    pass


class ErrorUsuario(Exception):
    """Error con un mensaje pensado para mostrarse tal cual en la app."""


# --- Utilidades de sistema (Windows) ----------------------------------------


def bajar_prioridad_proceso() -> None:
    """Prioridad baja para que el PC siga fluido mientras se transcribe."""
    if sys.platform != "win32":
        return
    try:
        import ctypes

        BELOW_NORMAL_PRIORITY_CLASS = 0x00004000
        k = ctypes.windll.kernel32  # type: ignore[attr-defined]
        k.SetPriorityClass(k.GetCurrentProcess(), BELOW_NORMAL_PRIORITY_CLASS)
    except Exception:  # pragma: no cover
        log.debug("No se pudo bajar la prioridad", exc_info=True)


def _mantener_despierto(activo: bool) -> None:
    """Evita que Windows se suspenda en medio de una transcripción larga."""
    if sys.platform != "win32":
        return
    try:
        import ctypes

        ES_CONTINUOUS = 0x80000000
        ES_SYSTEM_REQUIRED = 0x00000001
        flags = ES_CONTINUOUS | (ES_SYSTEM_REQUIRED if activo else 0)
        ctypes.windll.kernel32.SetThreadExecutionState(flags)  # type: ignore[attr-defined]
    except Exception:  # pragma: no cover
        log.debug("No se pudo ajustar el modo de suspensión", exc_info=True)


# --- ffprobe / ffmpeg ---------------------------------------------------------


def sondear(ruta: Path) -> tuple[float | None, bool, bool]:
    """(duración en segundos, tiene video, tiene audio)"""
    ffprobe = binarios.ffprobe()
    if not ffprobe:
        raise ErrorUsuario("No se encontró ffprobe (viene con ffmpeg).")
    res = subprocess.run(
        [
            ffprobe,
            "-v",
            "error",
            "-show_entries",
            "format=duration:stream=codec_type:stream_disposition=attached_pic",
            "-of",
            "json",
            str(ruta),
        ],
        capture_output=True,
        encoding="utf-8",
        errors="replace",
        timeout=120,
        creationflags=_NO_WINDOW,
    )
    if res.returncode != 0:
        raise ErrorUsuario(
            "No se pudo leer el archivo (¿está dañado o es de un formato raro?)."
        )
    datos = json.loads(res.stdout or "{}")
    try:
        duracion = float(datos.get("format", {}).get("duration"))
    except (TypeError, ValueError):
        duracion = None
    streams = datos.get("streams", [])
    tiene_audio = any(s.get("codec_type") == "audio" for s in streams)
    tiene_video = any(
        s.get("codec_type") == "video"
        and not s.get("disposition", {}).get("attached_pic")
        for s in streams
    )
    return duracion, tiene_video, tiene_audio


_LINEA_PROGRESO = re.compile(r"^([a-z_0-9]+)=(.*)$")


def extraer_audio(
    entrada: Path,
    salida: Path,
    duracion: float,
    on_fraccion: Callable[[float], None],
    cancelar: threading.Event,
) -> None:
    """ffmpeg → wav mono, 16 kHz, 16 bits (lo que Whisper espera)."""
    ffmpeg = binarios.ffmpeg()
    if not ffmpeg:
        raise ErrorUsuario("No se encontró ffmpeg. Instálalo (ver README).")
    cmd = [
        ffmpeg,
        "-hide_banner",
        "-nostdin",
        "-loglevel",
        "error",
        "-y",
        "-i",
        str(entrada),
        "-vn",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-c:a",
        "pcm_s16le",
        "-progress",
        "pipe:1",
        "-nostats",
        str(salida),
    ]
    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,  # los errores llegan por el mismo canal
        encoding="utf-8",
        errors="replace",
        creationflags=_NO_WINDOW,
    )
    errores: list[str] = []
    try:
        assert proc.stdout is not None
        for linea in proc.stdout:
            if cancelar.is_set():
                proc.kill()
                raise Cancelado()
            linea = linea.strip()
            m = _LINEA_PROGRESO.match(linea)
            if m:
                if m.group(1) in ("out_time_us", "out_time_ms") and duracion > 0:
                    try:
                        # out_time_ms es en realidad microsegundos (rareza de ffmpeg)
                        seg = int(m.group(2)) / 1_000_000
                        on_fraccion(min(1.0, max(0.0, seg / duracion)))
                    except ValueError:
                        pass
            elif linea:
                errores.append(linea)
        proc.wait()
    finally:
        if proc.poll() is None:
            proc.kill()
    if proc.returncode != 0:
        detalle = "; ".join(errores[-3:]) or f"código {proc.returncode}"
        raise ErrorUsuario(f"ffmpeg no pudo extraer el audio: {detalle}")


# --- Transcripción -------------------------------------------------------------


def _estimar_eta(hecho: float, total: float, transcurrido: float) -> float | None:
    """Segundos restantes según el ritmo medio (audio procesado / tiempo real).
    Hasta tener una muestra mínima devuelve None ("calculando…")."""
    if transcurrido < 8 or hecho < 10:
        return None
    ritmo = hecho / transcurrido
    return max(0.0, (total - hecho) / ritmo)


SR = 16_000  # muestras por segundo del wav que deja ffmpeg


class AudioWav:
    """Lee por tramos un WAV mono, 16 kHz, 16 bits, sin cargarlo entero.

    Se lee nosotros (en vez de pasarle la ruta a faster-whisper) por dos
    razones: (1) faster-whisper decodifica con PyAV, y las versiones nuevas de
    PyAV le rompen (`metadata_errors`); (2) faster-whisper procesa el detector
    de voz y los espectrogramas de TODO el audio antes de entregar la primera
    palabra: en una clase de 2 horas eso son ~3 minutos sin avance y ~3 GB de
    RAM. Por tramos de ~10 minutos el texto aparece en segundos y la memoria
    queda acotada."""

    def __init__(self, ruta: Path) -> None:
        import wave

        self._w = wave.open(str(ruta), "rb")
        if (
            self._w.getnchannels(),
            self._w.getsampwidth(),
            self._w.getframerate(),
        ) != (1, 2, SR):
            self._w.close()
            raise ErrorUsuario("El audio extraído no tiene el formato esperado.")
        self.total = self._w.getnframes()

    def leer(self, ini: int, fin: int):
        """Muestras [ini, fin) como float32 en [-1, 1]."""
        import numpy as np

        ini, fin = max(0, ini), min(self.total, fin)
        if fin <= ini:
            return np.zeros(0, dtype=np.float32)
        self._w.setpos(ini)
        datos = np.frombuffer(self._w.readframes(fin - ini), dtype=np.int16)
        return datos.astype(np.float32) / 32768.0

    def cerrar(self) -> None:
        self._w.close()

    def __enter__(self) -> "AudioWav":
        return self

    def __exit__(self, *_exc) -> None:
        self.cerrar()


VENTANA = 10 * 60 * SR  # largo aproximado de cada tramo
BUSQUEDA = 30 * SR  # se busca el silencio a ±30 s del punto de corte
MIN_COLA = 60 * SR  # no dejar un último tramo diminuto


def _corte_silencioso(audio: AudioWav, objetivo: int, busqueda: int) -> int:
    """El instante más silencioso cerca de `objetivo` (para no partir una frase)."""
    import numpy as np

    ini = max(0, objetivo - busqueda)
    x = audio.leer(ini, objetivo + busqueda)
    paso = SR // 20  # 50 ms
    n = len(x) // paso
    if n == 0:
        return objetivo
    energia = (x[: n * paso].reshape(n, paso) ** 2).mean(axis=1)
    return ini + int(np.argmin(energia)) * paso + paso // 2


def calcular_ventanas(
    audio: AudioWav,
    ventana: int = VENTANA,
    busqueda: int = BUSQUEDA,
    min_cola: int = MIN_COLA,
) -> list[tuple[int, int]]:
    """Parte el audio en tramos contiguos de ~`ventana` muestras, cortando en
    los silencios. Cubre [0, total) sin huecos ni solapes."""
    cortes = [0]
    objetivo = ventana
    while audio.total - objetivo > min_cola + busqueda:
        corte = _corte_silencioso(audio, objetivo, busqueda)
        cortes.append(corte)
        objetivo = corte + ventana
    cortes.append(audio.total)
    return list(zip(cortes[:-1], cortes[1:]))


def transcribir(
    wav: Path,
    duracion: float,
    modelo: str,
    on_progreso: Callable[[float, float | None], None],
    on_segmentos: Callable[[list[tuple[int, float, float, str]]], None],
    cancelar: threading.Event,
) -> None:
    if config.FAKE:
        _transcribir_falso(duracion, on_progreso, on_segmentos, cancelar)
        return

    m = modelos.cargar(modelo)
    with AudioWav(wav) as audio:
        total_s = audio.total / SR or duracion
        ventanas = calcular_ventanas(audio)
        t0 = time.monotonic()
        ultimo_volcado = t0
        lote: list[tuple[int, float, float, str]] = []
        n = 0

        for ini, fin in ventanas:
            if cancelar.is_set():
                raise Cancelado()
            desfase = ini / SR
            segmentos, _info = m.transcribe(
                audio.leer(ini, fin),
                language="es",
                beam_size=config.BEAM_SIZE,
                vad_filter=True,
                vad_parameters={"min_silence_duration_ms": 700},
                condition_on_previous_text=False,
            )
            for seg in segmentos:
                if cancelar.is_set():
                    raise Cancelado()
                texto = seg.text.strip()
                if texto and getattr(seg, "no_speech_prob", 0.0) <= 0.9:
                    lote.append(
                        (n, desfase + float(seg.start), desfase + float(seg.end), texto)
                    )
                    n += 1
                ahora = time.monotonic()
                if len(lote) >= 15 or (lote and ahora - ultimo_volcado >= 4):
                    on_segmentos(lote)
                    lote, ultimo_volcado = [], ahora
                hecho = min(desfase + float(seg.end), total_s)
                on_progreso(
                    min(1.0, hecho / total_s),
                    _estimar_eta(hecho, total_s, ahora - t0),
                )
            # Al cerrar el tramo (aunque no tuviera voz) se actualiza el avance.
            hecho = min(fin / SR, total_s)
            on_progreso(
                min(1.0, hecho / total_s),
                _estimar_eta(hecho, total_s, time.monotonic() - t0),
            )
        if lote:
            on_segmentos(lote)


def _transcribir_falso(
    duracion: float,
    on_progreso: Callable[[float, float | None], None],
    on_segmentos: Callable[[list[tuple[int, float, float, str]]], None],
    cancelar: threading.Event,
) -> None:
    """Modo de prueba: sin Whisper. Útil para probar la interfaz."""
    paso = 6.0
    n = int(duracion // paso)
    t0 = time.monotonic()
    for i in range(n):
        if cancelar.is_set():
            raise Cancelado()
        ini = i * paso
        texto = (
            f"Fragmento de prueba número {i + 1}. Hoy vemos el generador "
            f"y el alias de la señal."
        )
        on_segmentos([(i, ini, ini + paso, texto)])
        hecho = ini + paso
        on_progreso(
            hecho / duracion, _estimar_eta(hecho, duracion, (time.monotonic() - t0) * 40)
        )
        time.sleep(0.08)


# --- Cola ---------------------------------------------------------------------


class Cola:
    def __init__(self) -> None:
        self._q: queue.Queue[str] = queue.Queue()
        self._cancelar: dict[str, threading.Event] = {}
        self._lock = threading.Lock()
        self._activo: str | None = None
        self._hilo: threading.Thread | None = None

    # API pública
    def iniciar(self) -> None:
        if self._hilo and self._hilo.is_alive():
            return
        for id_ in db.reencolar_pendientes():
            self.encolar(id_)
        self._hilo = threading.Thread(
            target=self._bucle, name="transcriptor", daemon=True
        )
        self._hilo.start()

    def encolar(self, id_: str) -> None:
        with self._lock:
            self._cancelar[id_] = threading.Event()
        self._q.put(id_)

    def cancelar(self, id_: str) -> bool:
        with self._lock:
            ev = self._cancelar.get(id_)
        if ev is None:
            return False
        ev.set()
        return True

    def cancelar_y_esperar(self, id_: str, timeout: float = 15.0) -> None:
        self.cancelar(id_)
        fin = time.monotonic() + timeout
        while self._activo == id_ and time.monotonic() < fin:
            time.sleep(0.1)

    # Internos
    def _bucle(self) -> None:
        while True:
            id_ = self._q.get()
            try:
                self._procesar(id_)
            except Exception:  # pragma: no cover
                log.exception("Falló el trabajo %s", id_)
            finally:
                if self._q.empty():
                    modelos.liberar()  # suelta la RAM cuando no hay más cola

    def _procesar(self, id_: str) -> None:
        t = db.obtener(id_)
        with self._lock:
            ev = self._cancelar.setdefault(id_, threading.Event())
        if not t or t["estado"] != "en_cola":
            with self._lock:  # cancelada o borrada mientras esperaba en la cola
                self._cancelar.pop(id_, None)
            return
        if ev.is_set():
            db.actualizar(id_, estado="cancelado", terminada=db.ahora_ms())
            return

        self._activo = id_
        _mantener_despierto(True)
        wav = config.TMP_DIR / f"{id_}.wav"
        ultimo_pct = {"v": -1.0, "t": 0.0}

        def guardar(progreso: float, eta: float | None, estado: str | None = None) -> None:
            ahora = time.monotonic()
            # Evita escribir en disco más de una vez por segundo.
            if ahora - ultimo_pct["t"] < 1.0 and abs(progreso - ultimo_pct["v"]) < 0.01:
                return
            ultimo_pct["v"], ultimo_pct["t"] = progreso, ahora
            if ev.is_set():
                return
            campos: dict = {"progreso": round(progreso, 4), "eta_seg": eta}
            if estado:
                campos["estado"] = estado
            db.actualizar(id_, **campos)

        try:
            db.actualizar(
                id_,
                estado="extrayendo",
                iniciada=db.ahora_ms(),
                progreso=0.0,
                eta_seg=None,
                error=None,
            )
            ruta = config.MEDIA_DIR / t["archivo_ruta"]

            if config.FAKE:
                duracion, es_video = 120.0, bool(t["es_video"])
            else:
                duracion, es_video, tiene_audio = sondear(ruta)
                if not tiene_audio:
                    raise ErrorUsuario("El archivo no tiene pista de audio.")
                if not duracion or duracion <= 0:
                    raise ErrorUsuario("No se pudo leer la duración del archivo.")
            db.actualizar(id_, duracion=duracion, es_video=int(es_video))

            if not config.FAKE:
                extraer_audio(
                    ruta,
                    wav,
                    duracion,
                    lambda f: guardar(PESO_EXTRACCION * f, None),
                    ev,
                )

            db.actualizar(
                id_, estado="transcribiendo", progreso=PESO_EXTRACCION, eta_seg=None
            )

            def volcar(lote: list[tuple[int, float, float, str]]) -> None:
                if ev.is_set():
                    raise Cancelado()
                db.agregar_segmentos(id_, lote)

            transcribir(
                wav,
                duracion,
                t["modelo"],
                lambda f, eta: guardar(PESO_EXTRACCION + (1 - PESO_EXTRACCION) * f, eta),
                volcar,
                ev,
            )
            if ev.is_set():
                raise Cancelado()
            db.actualizar(
                id_,
                estado="listo",
                progreso=1.0,
                eta_seg=0,
                terminada=db.ahora_ms(),
            )
        except Cancelado:
            if db.obtener(id_):
                db.actualizar(
                    id_, estado="cancelado", eta_seg=None, terminada=db.ahora_ms()
                )
        except (ErrorUsuario, FileNotFoundError) as e:
            self._fallar(id_, str(e))
        except Exception as e:  # noqa: BLE001
            log.exception("Error inesperado en %s", id_)
            self._fallar(id_, f"Error inesperado: {e}")
        finally:
            wav.unlink(missing_ok=True)
            _mantener_despierto(False)
            self._activo = None
            with self._lock:
                self._cancelar.pop(id_, None)

    @staticmethod
    def _fallar(id_: str, mensaje: str) -> None:
        if db.obtener(id_):
            db.actualizar(
                id_,
                estado="error",
                error=mensaje,
                eta_seg=None,
                terminada=db.ahora_ms(),
            )


cola = Cola()
