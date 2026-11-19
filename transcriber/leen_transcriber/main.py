"""API HTTP local. Solo escucha en 127.0.0.1 y solo acepta orígenes conocidos."""

from __future__ import annotations

import inspect
import shutil
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Iterator, Literal
from urllib.parse import quote

from fastapi import FastAPI, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse, Response, StreamingResponse
from pydantic import BaseModel, Field

from . import __version__, binarios, config, db, exports, modelos
from .worker import bajar_prioridad_proceso, cola

FECHA_RE = r"^\d{4}-\d{2}-\d{2}$"


class Falla(Exception):
    def __init__(self, status: int, mensaje: str):
        self.status = status
        self.mensaje = mensaje


@asynccontextmanager
async def lifespan(_app: FastAPI):
    config.asegurar_dirs()
    db.init()
    bajar_prioridad_proceso()
    cola.iniciar()
    yield


app = FastAPI(title="LEEN STUDIE · Transcripción local", version=__version__, lifespan=lifespan)


# --- Seguridad de un servicio local ------------------------------------------


class ProteccionLocal:
    """ASGI puro (no rompe el streaming):
    - Rechaza escrituras que vengan de una página que no sea la app (Origin).
    - Responde al permiso de "red local" de Chrome (Private Network Access)."""

    METODOS_ESCRITURA = {b"POST", b"PUT", b"PATCH", b"DELETE"}

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)

        headers = {k.lower(): v for k, v in scope["headers"]}
        origen = headers.get(b"origin", b"").decode().rstrip("/")
        metodo = scope["method"].encode()

        if (
            metodo in self.METODOS_ESCRITURA
            and origen
            and origen not in config.ALLOWED_ORIGINS
        ):
            respuesta = JSONResponse(
                {"error": "Origen no permitido."}, status_code=403
            )
            return await respuesta(scope, receive, send)

        quiere_pna = (
            not _PNA_NATIVO
            and headers.get(b"access-control-request-private-network") == b"true"
        )

        async def enviar(msg):
            if quiere_pna and msg["type"] == "http.response.start":
                msg["headers"] = list(msg.get("headers", [])) + [
                    (b"access-control-allow-private-network", b"true")
                ]
            await send(msg)

        await self.app(scope, receive, enviar)


# Starlette recientes entienden el permiso de "red local" de Chrome por sí
# solos; en versiones antiguas lo cubre ProteccionLocal.
_PNA_NATIVO = "allow_private_network" in inspect.signature(CORSMiddleware.__init__).parameters
_opciones_cors: dict[str, Any] = {"allow_private_network": True} if _PNA_NATIVO else {}

# El último middleware agregado es el más externo.
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.ALLOWED_ORIGINS,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition", "Content-Range", "Accept-Ranges"],
    max_age=600,
    **_opciones_cors,
)
app.add_middleware(ProteccionLocal)
# Protege contra "DNS rebinding": solo se atiende si el Host es local.
app.add_middleware(TrustedHostMiddleware, allowed_hosts=config.ALLOWED_HOSTS)


@app.exception_handler(Falla)
async def _falla(_req: Request, e: Falla):
    return JSONResponse({"error": e.mensaje}, status_code=e.status)


@app.exception_handler(RequestValidationError)
async def _validacion(_req: Request, e: RequestValidationError):
    campos = ", ".join(str(x["loc"][-1]) for x in e.errors())
    return JSONResponse({"error": f"Datos inválidos: {campos}"}, status_code=422)


# --- Serialización ---------------------------------------------------------------


def a_api(t: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": t["id"],
        "titulo": t["titulo"],
        "ramoId": t["ramo_id"],
        "ramoNombre": t["ramo_nombre"],
        "fechaClase": t["fecha_clase"],
        "archivoOriginal": t["archivo_original"],
        "esVideo": bool(t["es_video"]),
        "modelo": t["modelo"],
        "duracion": t["duracion"],
        "estado": t["estado"],
        "progreso": t["progreso"],
        "etaSeg": t["eta_seg"],
        "error": t["error"],
        "creada": t["creada"],
        "terminada": t["terminada"],
    }


def _o_404(id: str) -> dict[str, Any]:
    t = db.obtener(id)
    if not t:
        raise Falla(404, "No existe esa transcripción.")
    return t


# --- Estado -------------------------------------------------------------------------


@app.get("/salud")
def salud():
    return {
        "ok": True,
        "version": __version__,
        "ffmpeg": True if config.FAKE else binarios.ffmpeg_ok(),
        "modelos": {t: (True if config.FAKE else ok) for t, ok in modelos.estado().items()},
        "descargas": {t: modelos.estado_descarga(t) for t in config.MODELOS},
        "busquedaRapida": db.FTS_DISPONIBLE,
        "modoPrueba": config.FAKE,
    }


@app.post("/modelos/{tamano}/descargar", status_code=202)
def descargar_modelo(tamano: Literal["small", "medium"]):
    """Baja un modelo de Whisper en segundo plano (solo la primera vez; necesita
    internet). El avance se ve en `descargas` de /salud."""
    return {"iniciada": modelos.iniciar_descarga(tamano)}


# --- Subir y listar -------------------------------------------------------------------


@app.post("/transcripciones", status_code=201)
async def subir(
    request: Request,
    nombre_archivo: str = Query(..., min_length=1, max_length=300),
    ramo_id: str = Query(..., min_length=1, max_length=100),
    ramo_nombre: str = Query(..., min_length=1, max_length=200),
    fecha: str = Query(..., pattern=FECHA_RE),
    modelo: Literal["small", "medium"] = Query("small"),
    titulo: str = Query("", max_length=200),
):
    """El archivo va en el cuerpo de la petición (se escribe a disco por
    pedazos, así un video de varios GB no se carga en memoria)."""
    ext = Path(nombre_archivo).suffix.lower()
    if ext not in config.EXTENSIONES:
        raise Falla(
            415,
            f"Formato no soportado ({ext or 'sin extensión'}). "
            f"Prueba con mp4, m4a, mp3 o wav.",
        )
    if not config.FAKE:
        if not binarios.ffmpeg_ok():
            raise Falla(409, "Falta instalar ffmpeg (ver README).")
        if not modelos.disponible(modelo):
            raise Falla(
                409,
                f"Falta descargar el modelo '{modelo}'. "
                f"Ejecuta: descargar_modelo.bat {modelo}",
            )

    declarado = request.headers.get("content-length")
    if declarado and declarado.isdigit():
        tam = int(declarado)
        if tam > config.MAX_UPLOAD_BYTES:
            raise Falla(413, "El archivo es demasiado grande.")
        libre = shutil.disk_usage(config.DATA_DIR).free
        if libre < tam + 1.5 * 1024**3:
            raise Falla(507, "No hay espacio suficiente en el disco.")

    id_ = uuid.uuid4().hex[:12]
    nombre_guardado = f"{id_}{ext}"
    destino = config.MEDIA_DIR / nombre_guardado
    total = 0
    try:
        with open(destino, "wb") as f:
            async for trozo in request.stream():
                total += len(trozo)
                if total > config.MAX_UPLOAD_BYTES:
                    raise Falla(413, "El archivo es demasiado grande.")
                f.write(trozo)
    except BaseException:
        destino.unlink(missing_ok=True)
        raise
    if total == 0:
        destino.unlink(missing_ok=True)
        raise Falla(400, "El archivo llegó vacío.")

    titulo_final = titulo.strip() or Path(nombre_archivo).stem
    fila = db.crear(
        id=id_,
        titulo=titulo_final,
        ramo_id=ramo_id,
        ramo_nombre=ramo_nombre.strip(),
        fecha_clase=fecha,
        archivo_original=nombre_archivo,
        archivo_ruta=nombre_guardado,
        es_video=ext in config.EXTENSIONES_VIDEO,
        mime=config.MIME.get(ext, "application/octet-stream"),
        modelo=modelo,
    )
    cola.encolar(id_)
    return a_api(fila)


@app.get("/transcripciones")
def listar(ramo_id: str | None = None, activas: bool = False):
    return [a_api(t) for t in db.listar(ramo_id=ramo_id, solo_activas=activas)]


@app.get("/transcripciones/{id}")
def detalle(id: str):
    return a_api(_o_404(id))


class Edicion(BaseModel):
    titulo: str | None = Field(None, min_length=1, max_length=200)
    fechaClase: str | None = Field(None, pattern=FECHA_RE)
    ramoId: str | None = Field(None, min_length=1, max_length=100)
    ramoNombre: str | None = Field(None, min_length=1, max_length=200)


@app.patch("/transcripciones/{id}")
def editar(id: str, cambios: Edicion):
    _o_404(id)
    campos: dict[str, Any] = {}
    if cambios.titulo is not None:
        campos["titulo"] = cambios.titulo.strip()
    if cambios.fechaClase is not None:
        campos["fecha_clase"] = cambios.fechaClase
    if cambios.ramoId is not None and cambios.ramoNombre is not None:
        campos["ramo_id"] = cambios.ramoId
        campos["ramo_nombre"] = cambios.ramoNombre.strip()
    db.actualizar(id, **campos)
    return a_api(_o_404(id))


@app.post("/transcripciones/{id}/cancelar")
def cancelar(id: str):
    t = _o_404(id)
    if t["estado"] == "en_cola":
        db.actualizar(id, estado="cancelado", terminada=db.ahora_ms())
    cola.cancelar(id)
    return a_api(_o_404(id))


@app.delete("/transcripciones/{id}", status_code=204)
def borrar(id: str):
    t = _o_404(id)
    cola.cancelar_y_esperar(id)
    db.borrar(id)
    (config.MEDIA_DIR / t["archivo_ruta"]).unlink(missing_ok=True)
    return Response(status_code=204)


@app.get("/transcripciones/{id}/segmentos")
def listar_segmentos(id: str, desde: int = Query(0, ge=0)):
    _o_404(id)
    return db.segmentos(id, desde)


# --- Búsqueda ----------------------------------------------------------------------------


@app.get("/buscar")
def buscar(
    q: str = Query(..., min_length=1, max_length=200),
    ramo_id: str | None = None,
    limite: int = Query(300, ge=1, le=1000),
):
    return [
        {
            "transcripcionId": f["transcripcion_id"],
            "titulo": f["titulo"],
            "ramoId": f["ramo_id"],
            "ramoNombre": f["ramo_nombre"],
            "fechaClase": f["fecha_clase"],
            "inicio": f["inicio"],
            "texto": f["texto"],
        }
        for f in db.buscar(q, ramo_id=ramo_id, limite=limite)
    ]


# --- Reproducción (con soporte de Range para poder saltar a un minuto) -----------------


class RangoInvalido(Exception):
    pass


def interpretar_rango(cabecera: str | None, tamano: int) -> tuple[int, int] | None:
    """'bytes=100-199' → (100, 199). None si no hay cabecera Range."""
    if not cabecera or not cabecera.startswith("bytes="):
        return None
    pedido = cabecera[6:].split(",")[0].strip()
    ini_s, _, fin_s = pedido.partition("-")
    try:
        if ini_s == "":  # "-500" = los últimos 500 bytes
            n = int(fin_s)
            ini, fin = max(0, tamano - n), tamano - 1
        else:
            ini = int(ini_s)
            fin = int(fin_s) if fin_s else tamano - 1
    except ValueError as e:
        raise RangoInvalido from e
    fin = min(fin, tamano - 1)
    if ini < 0 or ini > fin or ini >= tamano:
        raise RangoInvalido
    return ini, fin


def _leer(ruta: Path, ini: int, fin: int, trozo: int = 1024 * 1024) -> Iterator[bytes]:
    with open(ruta, "rb") as f:
        f.seek(ini)
        restante = fin - ini + 1
        while restante > 0:
            datos = f.read(min(trozo, restante))
            if not datos:
                break
            restante -= len(datos)
            yield datos


@app.get("/transcripciones/{id}/media")
def media(id: str, request: Request):
    t = _o_404(id)
    ruta = config.MEDIA_DIR / t["archivo_ruta"]
    if not ruta.exists():
        raise Falla(404, "El archivo original ya no está en el disco.")
    tamano = ruta.stat().st_size
    base = {"Accept-Ranges": "bytes", "Content-Type": t["mime"]}
    try:
        rango = interpretar_rango(request.headers.get("range"), tamano)
    except RangoInvalido:
        return Response(
            status_code=416, headers={"Content-Range": f"bytes */{tamano}"}
        )
    if rango is None:
        return StreamingResponse(
            _leer(ruta, 0, tamano - 1),
            headers={**base, "Content-Length": str(tamano)},
        )
    ini, fin = rango
    return StreamingResponse(
        _leer(ruta, ini, fin),
        status_code=206,
        headers={
            **base,
            "Content-Range": f"bytes {ini}-{fin}/{tamano}",
            "Content-Length": str(fin - ini + 1),
        },
    )


# --- Exportar -------------------------------------------------------------------------------

_MEDIA_EXPORT = {
    "txt": "text/plain; charset=utf-8",
    "srt": "application/x-subrip; charset=utf-8",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}


def _nombre_seguro(t: dict[str, Any], ext: str) -> str:
    base = f"{t['ramo_nombre']} - {t['titulo']} - {t['fecha_clase']}"
    base = "".join(c for c in base if c not in '<>:"/\\|?*\r\n\t').strip()
    return f"{base or 'transcripcion'}.{ext}"


@app.get("/transcripciones/{id}/exportar")
def exportar(id: str, formato: Literal["txt", "srt", "docx"] = Query("txt")):
    t = _o_404(id)
    segs = db.segmentos(id)
    if formato == "txt":
        contenido: bytes = exports.a_txt(t, segs).encode("utf-8")
    elif formato == "srt":
        contenido = exports.a_srt(segs).encode("utf-8")
    else:
        contenido = exports.a_docx(t, segs)
    nombre = _nombre_seguro(t, formato)
    ascii_ = nombre.encode("ascii", "ignore").decode() or f"transcripcion.{formato}"
    return Response(
        content=contenido,
        media_type=_MEDIA_EXPORT[formato],
        headers={
            "Content-Disposition": (
                f'attachment; filename="{ascii_}"; filename*=UTF-8\'\'{quote(nombre)}'
            )
        },
    )
