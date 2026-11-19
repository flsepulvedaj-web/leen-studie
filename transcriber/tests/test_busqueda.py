import pytest

from leen_transcriber import db


@pytest.fixture(scope="module", autouse=True)
def base():
    db.init()
    for id_, ramo_id, ramo, fecha, textos in [
        ("a1", "r-se", "Señales", "2026-11-10", ["Hoy vemos el generador de señales.", "Cuidado con el alias al muestrear."]),
        ("a2", "r-se", "Señales", "2026-11-12", ["El generador produce una onda cuadrada."]),
        ("b1", "r-ca", "Cálculo", "2026-11-11", ["La derivada del seno es el coseno.", "Los generadores de un grupo..."]),
    ]:
        db.crear(
            id=id_, titulo=f"Clase {id_}", ramo_id=ramo_id, ramo_nombre=ramo,
            fecha_clase=fecha, archivo_original="x.mp4", archivo_ruta=f"{id_}.mp4",
            es_video=True, mime="video/mp4", modelo="small",
        )
        db.agregar_segmentos(id_, [(i, i * 5.0, i * 5.0 + 5, t) for i, t in enumerate(textos)])
        db.actualizar(id_, estado="listo")  # que el worker no las vuelva a encolar


def test_busca_en_todas_las_clases():
    hits = db.buscar("generador")
    assert {h["transcripcion_id"] for h in hits} == {"a1", "a2", "b1"}  # "generadores" por prefijo


def test_filtra_por_ramo():
    hits = db.buscar("generador", ramo_id="r-se")
    assert {h["transcripcion_id"] for h in hits} == {"a1", "a2"}


def test_ignora_tildes_y_mayusculas():
    assert db.buscar("CALCULO") == []  # el texto no dice "cálculo", dice derivada
    hits = db.buscar("señales")
    assert any("\x01" in h["texto"] for h in hits)
    assert db.buscar("senales")  # sin tilde encuentra "señales"


def test_marca_la_coincidencia():
    hits = db.buscar("alias")
    assert len(hits) == 1
    assert hits[0]["texto"] == "Cuidado con el \x01alias\x02 al muestrear."
    assert hits[0]["inicio"] == 5.0


def test_varias_palabras_son_y():
    assert len(db.buscar("generador onda")) == 1
    assert db.buscar("generador derivada") == []


def test_consulta_con_caracteres_raros_no_rompe():
    assert db.buscar('"; DROP TABLE segmentos; --') == []
    assert db.buscar("   ") == []


def test_borrar_limpia_el_indice():
    db.borrar("b1")
    assert db.obtener("b1") is None
    assert db.buscar("derivada") == []
