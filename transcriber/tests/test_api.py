"""Prueba de punta a punta de la API en modo de prueba (sin ffmpeg ni Whisper)."""

import io
import time

import pytest
from docx import Document
from fastapi.testclient import TestClient

from leen_transcriber.main import app, interpretar_rango, RangoInvalido

ORIGEN = "https://flsepulvedaj-web.github.io"
PARAMS = {
    "nombre_archivo": "clase1.mp4",
    "ramo_id": "ramo-1",
    "ramo_nombre": "Física",
    "fecha": "2026-11-12",
    "modelo": "small",
    "titulo": "Clase 1",
}
CONTENIDO = bytes(range(256)) * 400  # ~100 KB


@pytest.fixture(scope="module")
def cliente():
    with TestClient(app, base_url="http://127.0.0.1:8765") as c:
        yield c


@pytest.fixture(scope="module", autouse=True)
def limpiar_al_final(cliente):
    yield
    for t in cliente.get("/transcripciones").json():
        cliente.delete(f"/transcripciones/{t['id']}", headers={"Origin": ORIGEN})


def esperar_listo(cliente, id_, timeout=20):
    fin = time.time() + timeout
    while time.time() < fin:
        t = cliente.get(f"/transcripciones/{id_}").json()
        if t["estado"] in ("listo", "error", "cancelado"):
            return t
        time.sleep(0.1)
    raise AssertionError("La transcripción no terminó a tiempo")


def subir(cliente, **extra):
    return cliente.post(
        "/transcripciones",
        params={**PARAMS, **extra},
        content=CONTENIDO,
        headers={"Content-Type": "video/mp4", "Origin": ORIGEN},
    )


def test_salud(cliente):
    r = cliente.get("/salud")
    assert r.status_code == 200
    assert r.json()["ok"] is True
    assert r.json()["modoPrueba"] is True


def test_flujo_completo(cliente):
    r = subir(cliente)
    assert r.status_code == 201, r.text
    t = r.json()
    assert t["titulo"] == "Clase 1" and t["ramoId"] == "ramo-1" and t["esVideo"] is True

    final = esperar_listo(cliente, t["id"])
    assert final["estado"] == "listo" and final["progreso"] == 1.0

    segs = cliente.get(f"/transcripciones/{t['id']}/segmentos").json()
    assert len(segs) == 20 and segs[0]["inicio"] == 0.0
    assert cliente.get(f"/transcripciones/{t['id']}/segmentos", params={"desde": 18}).json()[0]["idx"] == 18

    hits = cliente.get("/buscar", params={"q": "alias", "ramo_id": "ramo-1"}).json()
    assert len(hits) == 20 and "\x01" in hits[0]["texto"]
    assert cliente.get("/buscar", params={"q": "alias", "ramo_id": "otro"}).json() == []

    lista = cliente.get("/transcripciones", params={"ramo_id": "ramo-1"}).json()
    assert [x["id"] for x in lista] == [t["id"]]

    txt = cliente.get(f"/transcripciones/{t['id']}/exportar", params={"formato": "txt"})
    assert txt.status_code == 200 and "[0:06]" in txt.text
    assert "attachment" in txt.headers["content-disposition"]
    srt = cliente.get(f"/transcripciones/{t['id']}/exportar", params={"formato": "srt"})
    assert srt.text.startswith("1\n00:00:00,000 --> 00:00:06,000")
    dx = cliente.get(f"/transcripciones/{t['id']}/exportar", params={"formato": "docx"})
    assert Document(io.BytesIO(dx.content)).paragraphs[0].text == "Clase 1"

    editado = cliente.patch(
        f"/transcripciones/{t['id']}",
        json={"titulo": "Clase 1 (repasada)", "fechaClase": "2026-11-13"},
        headers={"Origin": ORIGEN},
    ).json()
    assert editado["titulo"] == "Clase 1 (repasada)" and editado["fechaClase"] == "2026-11-13"

    assert cliente.delete(f"/transcripciones/{t['id']}", headers={"Origin": ORIGEN}).status_code == 204
    assert cliente.get(f"/transcripciones/{t['id']}").status_code == 404
    assert cliente.get("/buscar", params={"q": "alias"}).json() == []


def test_media_con_range(cliente):
    t = subir(cliente).json()
    esperar_listo(cliente, t["id"])
    url = f"/transcripciones/{t['id']}/media"

    completo = cliente.get(url)
    assert completo.status_code == 200 and completo.content == CONTENIDO
    assert completo.headers["accept-ranges"] == "bytes"

    parcial = cliente.get(url, headers={"Range": "bytes=100-199"})
    assert parcial.status_code == 206
    assert parcial.content == CONTENIDO[100:200]
    assert parcial.headers["content-range"] == f"bytes 100-199/{len(CONTENIDO)}"

    cola = cliente.get(url, headers={"Range": "bytes=-50"})
    assert cola.content == CONTENIDO[-50:]

    assert cliente.get(url, headers={"Range": "bytes=999999999-"}).status_code == 416
    cliente.delete(f"/transcripciones/{t['id']}", headers={"Origin": ORIGEN})


def test_interpretar_rango():
    assert interpretar_rango(None, 1000) is None
    assert interpretar_rango("bytes=0-", 1000) == (0, 999)
    assert interpretar_rango("bytes=10-5000", 1000) == (10, 999)
    assert interpretar_rango("bytes=-100", 1000) == (900, 999)
    with pytest.raises(RangoInvalido):
        interpretar_rango("bytes=2000-3000", 1000)
    with pytest.raises(RangoInvalido):
        interpretar_rango("bytes=abc-", 1000)


def test_formato_no_soportado(cliente):
    r = subir(cliente, nombre_archivo="apunte.pdf")
    assert r.status_code == 415
    assert "mp4" in r.json()["error"]


def test_archivo_vacio(cliente):
    r = cliente.post(
        "/transcripciones", params=PARAMS, content=b"",
        headers={"Content-Type": "video/mp4", "Origin": ORIGEN},
    )
    assert r.status_code == 400


def test_fecha_invalida(cliente):
    assert subir(cliente, fecha="12/11/2026").status_code == 422


def test_origen_no_permitido_no_puede_escribir(cliente):
    r = cliente.post(
        "/transcripciones", params=PARAMS, content=CONTENIDO,
        headers={"Origin": "https://sitio-malo.example"},
    )
    assert r.status_code == 403


def test_host_no_local_se_rechaza():
    with TestClient(app, base_url="http://otro-host.example") as c:
        assert c.get("/salud").status_code == 400


def test_cors_y_red_local_en_preflight(cliente):
    r = cliente.options(
        "/transcripciones",
        headers={
            "Origin": ORIGEN,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
            "Access-Control-Request-Private-Network": "true",
        },
    )
    assert r.status_code == 200
    assert r.headers["access-control-allow-origin"] == ORIGEN
    assert r.headers["access-control-allow-private-network"] == "true"


def test_cancelar_en_cola(cliente):
    a = subir(cliente).json()
    b = subir(cliente).json()
    r = cliente.post(f"/transcripciones/{b['id']}/cancelar", headers={"Origin": ORIGEN})
    assert r.status_code == 200
    assert esperar_listo(cliente, b["id"])["estado"] == "cancelado"
    esperar_listo(cliente, a["id"])
    for x in (a, b):
        cliente.delete(f"/transcripciones/{x['id']}", headers={"Origin": ORIGEN})
