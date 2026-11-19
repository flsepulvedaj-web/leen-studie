import io

from docx import Document

from leen_transcriber import exports

META = {
    "titulo": "Clase 3 · Generadores",
    "ramo_nombre": "Señales y Sistemas",
    "fecha_clase": "2026-11-12",
    "duracion": 5532.0,
    "archivo_original": "zoom_clase3.mp4",
}
SEGS = [
    {"inicio": 0.0, "fin": 4.2, "texto": " Buenos días a todos."},
    {"inicio": 4.2, "fin": 9.0, "texto": "Hoy vemos el generador y el alias."},
    {"inicio": 70.5, "fin": 75.0, "texto": "Segundo bloque de la clase."},
    {"inicio": 3725.0, "fin": 3730.2, "texto": "Pasó más de una hora."},
]


def test_marca_de_tiempo_legible():
    assert exports.fmt_hms(0) == "0:00"
    assert exports.fmt_hms(187) == "3:07"
    assert exports.fmt_hms(3725) == "1:02:05"
    assert exports.fmt_hms(-5) == "0:00"


def test_marca_srt():
    assert exports.fmt_srt(0) == "00:00:00,000"
    assert exports.fmt_srt(3725.5) == "01:02:05,500"
    assert exports.fmt_srt(59.9996) == "00:01:00,000"


def test_txt_tiene_cabecera_y_marcas():
    txt = exports.a_txt(META, SEGS)
    assert txt.startswith("Clase 3 · Generadores\nRamo: Señales y Sistemas\n")
    assert "Fecha de la clase: 12-11-2026" in txt
    assert "Duración: 1:32:12" in txt
    assert "[0:04] Hoy vemos el generador y el alias." in txt
    assert "[1:02:05] Pasó más de una hora." in txt


def test_srt_numera_y_ordena():
    srt = exports.a_srt(SEGS)
    bloques = srt.strip().split("\n\n")
    assert len(bloques) == 4
    assert bloques[0].splitlines()[:2] == [
        "1",
        "00:00:00,000 --> 00:00:04,200",
    ]
    assert bloques[1].splitlines()[2] == "Hoy vemos el generador y el alias."


def test_srt_ignora_vacios_y_corrige_fin():
    srt = exports.a_srt(
        [
            {"inicio": 1.0, "fin": 1.0, "texto": "corto"},
            {"inicio": 2.0, "fin": 3.0, "texto": "   "},
        ]
    )
    assert "00:00:01,000 --> 00:00:01,500" in srt
    assert srt.count("-->") == 1


def test_docx_agrupa_por_minuto():
    datos = exports.a_docx(META, SEGS)
    doc = Document(io.BytesIO(datos))
    textos = [p.text for p in doc.paragraphs]
    assert textos[0] == "Clase 3 · Generadores"
    cuerpo = [t for t in textos if t.startswith("[")]
    # 0:00 y 0:04 caen en el mismo párrafo; 1:10 y 1:02:05 son otros dos.
    assert len(cuerpo) == 3
    assert cuerpo[0].startswith("[0:00] Buenos días a todos. Hoy vemos")
    assert cuerpo[2].startswith("[1:02:05]")
