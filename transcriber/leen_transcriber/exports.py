"""Exportar transcripciones a .txt, .srt y .docx."""

from __future__ import annotations

import io
import re
from typing import Any, Mapping, Sequence

Segmento = Mapping[str, Any]


def fmt_hms(seg: float) -> str:
    """Marca de tiempo legible: 3:07 o 1:35:12 (minuto y segundo)."""
    s = max(0, int(seg))
    h, resto = divmod(s, 3600)
    m, ss = divmod(resto, 60)
    return f"{h}:{m:02d}:{ss:02d}" if h else f"{m}:{ss:02d}"


def fmt_srt(seg: float) -> str:
    """Formato SRT: HH:MM:SS,mmm"""
    ms_total = max(0, int(round(seg * 1000)))
    h, resto = divmod(ms_total, 3_600_000)
    m, resto = divmod(resto, 60_000)
    s, ms = divmod(resto, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def _fecha_legible(iso: str) -> str:
    m = re.fullmatch(r"(\d{4})-(\d{2})-(\d{2})", iso or "")
    return f"{m.group(3)}-{m.group(2)}-{m.group(1)}" if m else (iso or "")


def _cabecera(meta: Mapping[str, Any]) -> list[str]:
    dur = meta.get("duracion")
    lineas = [
        meta["titulo"],
        f"Ramo: {meta['ramo_nombre']}",
        f"Fecha de la clase: {_fecha_legible(meta['fecha_clase'])}",
    ]
    if dur:
        lineas.append(f"Duración: {fmt_hms(dur)}")
    lineas.append(f"Archivo: {meta['archivo_original']}")
    return lineas


def a_txt(meta: Mapping[str, Any], segs: Sequence[Segmento]) -> str:
    partes = _cabecera(meta)
    partes.append("")
    partes.extend(f"[{fmt_hms(s['inicio'])}] {s['texto'].strip()}" for s in segs)
    return "\n".join(partes) + "\n"


def a_srt(segs: Sequence[Segmento]) -> str:
    bloques: list[str] = []
    n = 0
    for s in segs:
        texto = s["texto"].strip()
        if not texto:
            continue
        n += 1
        ini = float(s["inicio"])
        fin = max(float(s["fin"]), ini + 0.5)
        bloques.append(f"{n}\n{fmt_srt(ini)} --> {fmt_srt(fin)}\n{texto}\n")
    return "\n".join(bloques)


def a_docx(
    meta: Mapping[str, Any], segs: Sequence[Segmento], bloque_seg: float = 60.0
) -> bytes:
    """Word con la transcripción agrupada en párrafos de ~1 minuto, cada uno
    con su marca de tiempo al inicio."""
    from docx import Document
    from docx.shared import Pt, RGBColor

    doc = Document()
    doc.add_heading(meta["titulo"], level=1)

    info = doc.add_paragraph()
    info.add_run(f"Ramo: {meta['ramo_nombre']}\n")
    info.add_run(f"Fecha de la clase: {_fecha_legible(meta['fecha_clase'])}\n")
    if meta.get("duracion"):
        info.add_run(f"Duración: {fmt_hms(meta['duracion'])}\n")
    info.add_run(f"Archivo: {meta['archivo_original']}")
    for run in info.runs:
        run.font.size = Pt(10)
        run.font.color.rgb = RGBColor(0x55, 0x55, 0x55)

    actual: list[str] = []
    inicio_bloque: float | None = None

    def volcar() -> None:
        nonlocal actual, inicio_bloque
        if not actual or inicio_bloque is None:
            return
        p = doc.add_paragraph()
        marca = p.add_run(f"[{fmt_hms(inicio_bloque)}] ")
        marca.bold = True
        marca.font.color.rgb = RGBColor(0x2F, 0x97, 0xA7)
        p.add_run(" ".join(actual))
        actual, inicio_bloque = [], None

    for s in segs:
        texto = s["texto"].strip()
        if not texto:
            continue
        if inicio_bloque is None:
            inicio_bloque = float(s["inicio"])
        elif float(s["inicio"]) - inicio_bloque >= bloque_seg:
            volcar()
            inicio_bloque = float(s["inicio"])
        actual.append(texto)
    volcar()

    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()
