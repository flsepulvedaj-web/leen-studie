import wave

import numpy as np
import pytest

from leen_transcriber import worker
from leen_transcriber.worker import SR, AudioWav


def _wav(ruta, muestras, tasa=SR, canales=1):
    with wave.open(str(ruta), "wb") as w:
        w.setnchannels(canales)
        w.setsampwidth(2)
        w.setframerate(tasa)
        w.writeframes(np.asarray(muestras, dtype=np.int16).tobytes())


def test_leer_normaliza_a_float32(tmp_path):
    ruta = tmp_path / "a.wav"
    _wav(ruta, [0, 16384, -16384, 32767, -32768])
    with AudioWav(ruta) as a:
        assert a.total == 5
        x = a.leer(0, 5)
    assert x.dtype == np.float32 and x.shape == (5,)
    assert x[1] == pytest.approx(0.5)
    assert x[2] == pytest.approx(-0.5)
    assert x[4] == pytest.approx(-1.0)


def test_leer_por_tramos_y_limites(tmp_path):
    ruta = tmp_path / "largo.wav"
    n = 2_500_000
    _wav(ruta, np.arange(n) % 1000)
    with AudioWav(ruta) as a:
        medio = a.leer(1_000_000, 1_000_010)
        assert medio[3] == pytest.approx(((1_000_003) % 1000) / 32768.0)
        assert a.leer(n - 5, n + 100).shape == (5,)  # se recorta al final
        assert a.leer(-50, 3).shape == (3,)  # y al inicio
        assert a.leer(10, 10).shape == (0,)


def test_rechaza_formato_inesperado(tmp_path):
    ruta = tmp_path / "estereo.wav"
    _wav(ruta, [0, 1, 2, 3], canales=2)
    with pytest.raises(worker.ErrorUsuario):
        AudioWav(ruta)


def _audio_con_silencios(tmp_path, segundos, silencios):
    """Ruido con tramos de silencio en los segundos indicados [(ini, fin), ...]."""
    rng = np.random.default_rng(0)
    x = rng.integers(-8000, 8000, segundos * SR)
    for ini, fin in silencios:
        x[int(ini * SR) : int(fin * SR)] = 0
    ruta = tmp_path / "s.wav"
    _wav(ruta, x)
    return AudioWav(ruta)


def test_los_cortes_caen_en_silencios_y_cubren_todo(tmp_path):
    with _audio_con_silencios(tmp_path, 33, [(9.4, 10.6), (19.5, 20.7)]) as a:
        ventanas = worker.calcular_ventanas(
            a, ventana=10 * SR, busqueda=2 * SR, min_cola=3 * SR
        )
    assert len(ventanas) == 3
    # contiguas, sin huecos ni solapes, desde 0 hasta el final
    assert ventanas[0][0] == 0 and ventanas[-1][1] == 33 * SR
    for (_, fin), (ini, _) in zip(ventanas, ventanas[1:]):
        assert fin == ini
    corte1, corte2 = ventanas[0][1] / SR, ventanas[1][1] / SR
    assert 9.4 <= corte1 <= 10.6
    assert 19.5 <= corte2 <= 20.7


def test_audio_corto_es_una_sola_ventana(tmp_path):
    with _audio_con_silencios(tmp_path, 8, []) as a:
        assert worker.calcular_ventanas(a, ventana=10 * SR, busqueda=2 * SR) == [
            (0, 8 * SR)
        ]


def test_no_deja_una_cola_diminuta(tmp_path):
    # 22 s con ventana de 10 s: el 2.º corte dejaría solo ~2 s al final → se absorbe.
    with _audio_con_silencios(tmp_path, 22, []) as a:
        ventanas = worker.calcular_ventanas(
            a, ventana=10 * SR, busqueda=2 * SR, min_cola=5 * SR
        )
    assert ventanas[-1][1] - ventanas[-1][0] >= 5 * SR


def test_eta_espera_muestra_minima():
    assert worker._estimar_eta(5, 100, 3) is None
    # 30 s de audio en 10 s reales = 3x más rápido que el tiempo real;
    # faltan 270 s de audio → ~90 s.
    assert worker._estimar_eta(30, 300, 10) == pytest.approx(90.0)
    assert worker._estimar_eta(300, 300, 100) == 0.0
