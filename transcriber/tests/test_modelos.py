from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from leen_transcriber import config, modelos
from leen_transcriber.main import app


@pytest.fixture()
def carpetas(tmp_path, monkeypatch):
    propia, extra = tmp_path / "propia", tmp_path / "extra"
    propia.mkdir()
    extra.mkdir()
    monkeypatch.setattr(config, "MODELS_DIR", propia)
    monkeypatch.setattr(config, "MODELS_EXTRA_DIRS", [extra])
    modelos._descargas.clear()
    return propia, extra


def _modelo(base: Path, tam: str):
    (base / tam).mkdir(parents=True)
    (base / tam / "model.bin").write_bytes(b"x")


def test_encuentra_el_modelo_empaquetado_en_la_carpeta_extra(carpetas):
    _, extra = carpetas
    assert not modelos.disponible("small")
    _modelo(extra, "small")
    assert modelos.disponible("small")
    assert modelos.ubicar("small") == extra / "small"


def test_la_carpeta_propia_tiene_prioridad(carpetas):
    propia, extra = carpetas
    _modelo(extra, "small")
    _modelo(propia, "small")
    assert modelos.ubicar("small") == propia / "small"


def test_estado_de_descarga_sin_hacer_nada(carpetas):
    assert modelos.estado_descarga("medium") == {
        "estado": "falta", "progreso": 0.0, "error": None,
    }


def test_progreso_sale_de_los_bytes_en_disco(carpetas):
    propia, _ = carpetas
    modelos._descargas["small"] = {"estado": "descargando", "progreso": 0.0, "error": None}
    parcial = propia / "small" / ".cache" / "huggingface" / "download"
    parcial.mkdir(parents=True)
    (parcial / "model.bin.abc.incomplete").write_bytes(b"0" * 243_000)
    # 243.000 de ~486.000.000 → 0,05 %
    d = modelos.estado_descarga("small")
    assert d["estado"] == "descargando"
    assert 0.0004 < d["progreso"] < 0.0006


def test_no_llega_a_100_hasta_terminar(carpetas, monkeypatch):
    modelos._descargas["small"] = {"estado": "descargando", "progreso": 0.0, "error": None}
    monkeypatch.setattr(modelos, "_bytes_descargados", lambda _t: 10**12)
    assert modelos.estado_descarga("small")["progreso"] == 0.99


def test_descarga_exitosa_y_fallida(carpetas, monkeypatch):
    propia, _ = carpetas

    def falla(_t):
        raise OSError("sin red")

    monkeypatch.setattr(modelos, "descargar", falla)
    assert modelos.iniciar_descarga("small") is True
    for _ in range(50):
        if modelos.estado_descarga("small")["estado"] == "error":
            break
        import time; time.sleep(0.05)
    d = modelos.estado_descarga("small")
    assert d["estado"] == "error" and "conexión" in d["error"]

    def exito(t):
        _modelo(propia, t)
        return propia / t

    monkeypatch.setattr(modelos, "descargar", exito)
    assert modelos.iniciar_descarga("small") is True  # se puede reintentar tras un error
    for _ in range(50):
        if modelos.disponible("small"):
            break
        import time; time.sleep(0.05)
    assert modelos.estado_descarga("small")["estado"] == "listo"
    assert modelos.iniciar_descarga("small") is False  # ya está


def test_no_inicia_dos_descargas_a_la_vez(carpetas, monkeypatch):
    import threading
    liberar = threading.Event()
    monkeypatch.setattr(modelos, "descargar", lambda t: liberar.wait(5))
    assert modelos.iniciar_descarga("medium") is True
    assert modelos.iniciar_descarga("medium") is False
    liberar.set()


def test_endpoint_inicia_descarga_y_salud_la_informa(carpetas, monkeypatch):
    import threading
    liberar = threading.Event()
    monkeypatch.setattr(modelos, "descargar", lambda t: liberar.wait(5))
    with TestClient(app, base_url="http://127.0.0.1:8765") as c:
        r = c.post("/modelos/medium/descargar", headers={"Origin": "leen://app"})
        assert r.status_code == 202 and r.json() == {"iniciada": True}
        assert c.get("/salud").json()["descargas"]["medium"]["estado"] == "descargando"
        assert c.post("/modelos/otro/descargar").status_code == 422
    liberar.set()


def test_la_app_de_escritorio_es_un_origen_permitido():
    assert "leen://app" in config.ALLOWED_ORIGINS
    with TestClient(app, base_url="http://127.0.0.1:8765") as c:
        r = c.options(
            "/transcripciones",
            headers={
                "Origin": "leen://app",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type",
            },
        )
        assert r.status_code == 200
        assert r.headers["access-control-allow-origin"] == "leen://app"
