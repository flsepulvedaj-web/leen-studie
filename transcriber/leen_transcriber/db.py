"""Base de datos SQLite: transcripciones, segmentos y búsqueda de texto completo."""

from __future__ import annotations

import re
import sqlite3
import time
from contextlib import contextmanager
from typing import Any, Iterable, Iterator

from . import config

ESTADOS_ACTIVOS = ("en_cola", "extrayendo", "transcribiendo")

_COLUMNAS_EDITABLES = {
    "titulo",
    "ramo_id",
    "ramo_nombre",
    "fecha_clase",
    "es_video",
    "duracion",
    "estado",
    "progreso",
    "eta_seg",
    "error",
    "iniciada",
    "terminada",
}

_ESQUEMA = """
CREATE TABLE IF NOT EXISTS transcripciones (
  id               TEXT PRIMARY KEY,
  titulo           TEXT NOT NULL,
  ramo_id          TEXT NOT NULL,
  ramo_nombre      TEXT NOT NULL,
  fecha_clase      TEXT NOT NULL,
  archivo_original TEXT NOT NULL,
  archivo_ruta     TEXT NOT NULL,
  es_video         INTEGER NOT NULL DEFAULT 0,
  mime             TEXT NOT NULL,
  modelo           TEXT NOT NULL,
  duracion         REAL,
  estado           TEXT NOT NULL,
  progreso         REAL NOT NULL DEFAULT 0,
  eta_seg          REAL,
  error            TEXT,
  creada           INTEGER NOT NULL,
  iniciada         INTEGER,
  terminada        INTEGER
);
CREATE INDEX IF NOT EXISTS idx_transcripciones_ramo ON transcripciones(ramo_id, fecha_clase);

CREATE TABLE IF NOT EXISTS segmentos (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  transcripcion_id TEXT NOT NULL REFERENCES transcripciones(id) ON DELETE CASCADE,
  idx              INTEGER NOT NULL,
  inicio           REAL NOT NULL,
  fin              REAL NOT NULL,
  texto            TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_segmentos_trans ON segmentos(transcripcion_id, idx);
"""

_FTS = """
CREATE VIRTUAL TABLE IF NOT EXISTS segmentos_fts USING fts5(
  texto, content='segmentos', content_rowid='id',
  tokenize='unicode61 remove_diacritics 2'
);
CREATE TRIGGER IF NOT EXISTS segmentos_ai AFTER INSERT ON segmentos BEGIN
  INSERT INTO segmentos_fts(rowid, texto) VALUES (new.id, new.texto);
END;
CREATE TRIGGER IF NOT EXISTS segmentos_ad AFTER DELETE ON segmentos BEGIN
  INSERT INTO segmentos_fts(segmentos_fts, rowid, texto)
  VALUES ('delete', old.id, old.texto);
END;
"""

# Se decide al iniciar: ¿esta versión de SQLite trae FTS5?
FTS_DISPONIBLE = False


@contextmanager
def conexion() -> Iterator[sqlite3.Connection]:
    c = sqlite3.connect(config.DB_PATH, timeout=30)
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA foreign_keys=ON")
    try:
        yield c
        c.commit()
    except Exception:
        c.rollback()
        raise
    finally:
        c.close()


def init() -> None:
    global FTS_DISPONIBLE
    config.asegurar_dirs()
    with conexion() as c:
        c.execute("PRAGMA journal_mode=WAL")
        c.executescript(_ESQUEMA)
        try:
            c.executescript(_FTS)
            FTS_DISPONIBLE = True
        except sqlite3.OperationalError:
            FTS_DISPONIBLE = False


def ahora_ms() -> int:
    return int(time.time() * 1000)


# --- Transcripciones -------------------------------------------------------


def crear(
    *,
    id: str,
    titulo: str,
    ramo_id: str,
    ramo_nombre: str,
    fecha_clase: str,
    archivo_original: str,
    archivo_ruta: str,
    es_video: bool,
    mime: str,
    modelo: str,
) -> dict[str, Any]:
    with conexion() as c:
        c.execute(
            """INSERT INTO transcripciones
               (id, titulo, ramo_id, ramo_nombre, fecha_clase, archivo_original,
                archivo_ruta, es_video, mime, modelo, estado, progreso, creada)
               VALUES (?,?,?,?,?,?,?,?,?,?, 'en_cola', 0, ?)""",
            (
                id,
                titulo,
                ramo_id,
                ramo_nombre,
                fecha_clase,
                archivo_original,
                archivo_ruta,
                int(es_video),
                mime,
                modelo,
                ahora_ms(),
            ),
        )
    return obtener(id)  # type: ignore[return-value]


def obtener(id: str) -> dict[str, Any] | None:
    with conexion() as c:
        fila = c.execute("SELECT * FROM transcripciones WHERE id=?", (id,)).fetchone()
    return dict(fila) if fila else None


def listar(
    ramo_id: str | None = None, solo_activas: bool = False
) -> list[dict[str, Any]]:
    sql = "SELECT * FROM transcripciones"
    cond: list[str] = []
    args: list[Any] = []
    if ramo_id:
        cond.append("ramo_id=?")
        args.append(ramo_id)
    if solo_activas:
        cond.append(f"estado IN ({','.join('?' * len(ESTADOS_ACTIVOS))})")
        args.extend(ESTADOS_ACTIVOS)
    if cond:
        sql += " WHERE " + " AND ".join(cond)
    sql += " ORDER BY fecha_clase DESC, creada DESC"
    with conexion() as c:
        return [dict(f) for f in c.execute(sql, args).fetchall()]


def actualizar(id: str, **campos: Any) -> None:
    if not campos:
        return
    malos = set(campos) - _COLUMNAS_EDITABLES
    if malos:
        raise ValueError(f"Columnas no editables: {sorted(malos)}")
    sets = ", ".join(f"{k}=?" for k in campos)
    with conexion() as c:
        c.execute(f"UPDATE transcripciones SET {sets} WHERE id=?", (*campos.values(), id))


def borrar(id: str) -> None:
    with conexion() as c:
        # Se borran los segmentos a mano para que el índice FTS quede limpio.
        c.execute("DELETE FROM segmentos WHERE transcripcion_id=?", (id,))
        c.execute("DELETE FROM transcripciones WHERE id=?", (id,))


def reencolar_pendientes() -> list[str]:
    """Al arrancar: lo que quedó a medias vuelve a la cola desde cero."""
    with conexion() as c:
        filas = c.execute(
            f"""SELECT id FROM transcripciones
                WHERE estado IN ({','.join('?' * len(ESTADOS_ACTIVOS))})
                ORDER BY creada""",
            ESTADOS_ACTIVOS,
        ).fetchall()
        ids = [f["id"] for f in filas]
        for i in ids:
            c.execute("DELETE FROM segmentos WHERE transcripcion_id=?", (i,))
            c.execute(
                """UPDATE transcripciones
                   SET estado='en_cola', progreso=0, eta_seg=NULL, error=NULL
                   WHERE id=?""",
                (i,),
            )
    return ids


# --- Segmentos --------------------------------------------------------------


def agregar_segmentos(
    transcripcion_id: str, filas: Iterable[tuple[int, float, float, str]]
) -> None:
    with conexion() as c:
        c.executemany(
            """INSERT INTO segmentos (transcripcion_id, idx, inicio, fin, texto)
               VALUES (?,?,?,?,?)""",
            [(transcripcion_id, i, ini, fin, txt) for i, ini, fin, txt in filas],
        )


def segmentos(transcripcion_id: str, desde: int = 0) -> list[dict[str, Any]]:
    with conexion() as c:
        filas = c.execute(
            """SELECT idx, inicio, fin, texto FROM segmentos
               WHERE transcripcion_id=? AND idx>=? ORDER BY idx""",
            (transcripcion_id, desde),
        ).fetchall()
    return [dict(f) for f in filas]


# --- Búsqueda ---------------------------------------------------------------

_MARCA_INI = "\x01"
_MARCA_FIN = "\x02"


def _tokens(q: str) -> list[str]:
    return re.findall(r"\w+", q, flags=re.UNICODE)


def buscar(
    q: str, ramo_id: str | None = None, limite: int = 300
) -> list[dict[str, Any]]:
    """Busca palabras (sin importar mayúsculas ni tildes, y por prefijo)
    dentro de todas las transcripciones. Las coincidencias vienen marcadas
    con \\x01 ... \\x02 para que la interfaz las resalte."""
    tokens = _tokens(q)
    if not tokens:
        return []

    with conexion() as c:
        if FTS_DISPONIBLE:
            consulta = " ".join(f'"{t}"*' for t in tokens)
            sql = """
              SELECT s.transcripcion_id, s.idx, s.inicio, s.fin,
                     highlight(segmentos_fts, 0, char(1), char(2)) AS texto,
                     t.titulo, t.ramo_id, t.ramo_nombre, t.fecha_clase
              FROM segmentos_fts
              JOIN segmentos s ON s.id = segmentos_fts.rowid
              JOIN transcripciones t ON t.id = s.transcripcion_id
              WHERE segmentos_fts MATCH ?
            """
            args: list[Any] = [consulta]
            if ramo_id:
                sql += " AND t.ramo_id = ?"
                args.append(ramo_id)
            sql += " ORDER BY t.fecha_clase DESC, t.creada DESC, s.inicio LIMIT ?"
            args.append(limite)
            return [dict(f) for f in c.execute(sql, args).fetchall()]

        # Respaldo sin FTS5: más lento y sensible a tildes.
        sql = """
          SELECT s.transcripcion_id, s.idx, s.inicio, s.fin, s.texto,
                 t.titulo, t.ramo_id, t.ramo_nombre, t.fecha_clase
          FROM segmentos s JOIN transcripciones t ON t.id = s.transcripcion_id
          WHERE 1=1
        """
        args = []
        for t in tokens:
            sql += " AND s.texto LIKE ?"
            args.append(f"%{t}%")
        if ramo_id:
            sql += " AND t.ramo_id = ?"
            args.append(ramo_id)
        sql += " ORDER BY t.fecha_clase DESC, t.creada DESC, s.inicio LIMIT ?"
        args.append(limite)
        filas = [dict(f) for f in c.execute(sql, args).fetchall()]

    for f in filas:
        for t in tokens:
            f["texto"] = re.sub(
                f"({re.escape(t)})",
                f"{_MARCA_INI}\\1{_MARCA_FIN}",
                f["texto"],
                flags=re.IGNORECASE,
            )
    return filas
