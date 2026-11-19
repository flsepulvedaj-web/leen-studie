/**
 * Cliente del servicio local de transcripción (carpeta /transcriber).
 * Corre en el computador de la alumna: Python + ffmpeg + faster-whisper.
 */
import { getTranscriberUrl } from './settings'
import type {
  HitBusqueda,
  ModeloWhisper,
  SaludServicio,
  Segmento,
  Transcripcion,
} from './types'

export class ServicioError extends Error {
  constructor(
    message: string,
    /** true si ni siquiera se pudo conectar con el servicio */
    public sinServicio = false,
    public status = 0,
  ) {
    super(message)
  }
}

const MSG_SIN_SERVICIO =
  'No se pudo conectar con el servicio de transcripción. ¿Está abierto en tu computador?'

async function mensajeDeError(res: Response): Promise<string> {
  try {
    const j = await res.json()
    if (typeof j?.error === 'string') return j.error
  } catch {
    /* sin cuerpo JSON */
  }
  return `El servicio respondió con un error (${res.status}).`
}

async function pedir<T>(
  ruta: string,
  init: RequestInit = {},
  timeoutMs = 20_000,
): Promise<T> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  let res: Response
  try {
    res = await fetch(getTranscriberUrl() + ruta, { ...init, signal: ctrl.signal })
  } catch {
    throw new ServicioError(MSG_SIN_SERVICIO, true)
  } finally {
    clearTimeout(timer)
  }
  if (!res.ok) throw new ServicioError(await mensajeDeError(res), false, res.status)
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

/**
 * null = el servicio no responde.
 *
 * El plazo es largo a propósito: la primera vez, Chrome muestra un diálogo
 * ("acceder a dispositivos de la red local") y la conexión queda esperando a
 * que la alumna responda. Si la cortáramos antes y reintentáramos, Chrome
 * contaría el diálogo como ignorado varias veces y terminaría bloqueando el
 * permiso. Si el servicio simplemente está apagado, la conexión falla al
 * instante, así que un plazo largo no demora nada.
 */
export async function salud(): Promise<SaludServicio | null> {
  try {
    return await pedir<SaludServicio>('/salud', {}, 60_000)
  } catch {
    return null
  }
}

export type PermisoRedLocal = 'granted' | 'prompt' | 'denied' | 'desconocido'

/**
 * Estado del permiso de "red local" de Chrome/Edge (versión 142 en adelante),
 * que se necesita para que una página https hable con 127.0.0.1.
 * 'denied' = el navegador lo está bloqueando (no es que el servicio esté apagado).
 */
export async function permisoRedLocal(): Promise<PermisoRedLocal> {
  const estados: string[] = []
  for (const nombre of ['local-network-access', 'loopback-network']) {
    try {
      const p = await navigator.permissions.query({
        name: nombre as unknown as PermissionName,
      })
      estados.push(p.state)
    } catch {
      /* ese nombre no existe en este navegador */
    }
  }
  if (estados.includes('denied')) return 'denied'
  if (estados.includes('prompt')) return 'prompt'
  if (estados.includes('granted')) return 'granted'
  return 'desconocido'
}

/** Baja un modelo de Whisper (necesita internet solo esta vez). */
export function descargarModelo(modelo: ModeloWhisper): Promise<{ iniciada: boolean }> {
  return pedir(`/modelos/${modelo}/descargar`, { method: 'POST' })
}

export function listar(ramoId?: string): Promise<Transcripcion[]> {
  const q = ramoId ? `?ramo_id=${encodeURIComponent(ramoId)}` : ''
  return pedir(`/transcripciones${q}`)
}

export function obtener(id: string): Promise<Transcripcion> {
  return pedir(`/transcripciones/${encodeURIComponent(id)}`)
}

export function listarSegmentos(id: string, desde = 0): Promise<Segmento[]> {
  return pedir(`/transcripciones/${encodeURIComponent(id)}/segmentos?desde=${desde}`)
}

export function editar(
  id: string,
  cambios: {
    titulo?: string
    fechaClase?: string
    ramoId?: string
    ramoNombre?: string
  },
): Promise<Transcripcion> {
  return pedir(`/transcripciones/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(cambios),
  })
}

export function cancelar(id: string): Promise<Transcripcion> {
  return pedir(`/transcripciones/${encodeURIComponent(id)}/cancelar`, {
    method: 'POST',
  })
}

export function borrar(id: string): Promise<void> {
  return pedir(`/transcripciones/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export function buscarEnClases(q: string, ramoId?: string): Promise<HitBusqueda[]> {
  const p = new URLSearchParams({ q })
  if (ramoId) p.set('ramo_id', ramoId)
  return pedir(`/buscar?${p}`)
}

export function urlMedia(id: string): string {
  return `${getTranscriberUrl()}/transcripciones/${encodeURIComponent(id)}/media`
}

// --- Subida (XHR para poder mostrar el avance de la copia) --------------------

export interface DatosSubida {
  ramoId: string
  ramoNombre: string
  fecha: string
  titulo: string
  modelo: ModeloWhisper
}

export function subirClase(
  archivo: File,
  datos: DatosSubida,
  onProgreso: (fraccion: number) => void,
): { promesa: Promise<Transcripcion>; abortar: () => void } {
  const xhr = new XMLHttpRequest()
  const promesa = new Promise<Transcripcion>((resolve, reject) => {
    const q = new URLSearchParams({
      nombre_archivo: archivo.name,
      ramo_id: datos.ramoId,
      ramo_nombre: datos.ramoNombre,
      fecha: datos.fecha,
      modelo: datos.modelo,
      titulo: datos.titulo,
    })
    xhr.open('POST', `${getTranscriberUrl()}/transcripciones?${q}`)
    xhr.setRequestHeader('Content-Type', archivo.type || 'application/octet-stream')
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgreso(e.loaded / e.total)
    }
    xhr.onload = () => {
      let cuerpo: unknown = null
      try {
        cuerpo = JSON.parse(xhr.responseText)
      } catch {
        /* sin JSON */
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(cuerpo as Transcripcion)
      } else {
        const msg =
          (cuerpo as { error?: string } | null)?.error ??
          `El servicio respondió con un error (${xhr.status}).`
        reject(new ServicioError(msg, false, xhr.status))
      }
    }
    xhr.onerror = () => reject(new ServicioError(MSG_SIN_SERVICIO, true))
    xhr.onabort = () => reject(new ServicioError('Subida cancelada.'))
    xhr.send(archivo)
  })
  return { promesa, abortar: () => xhr.abort() }
}

// --- Exportar -------------------------------------------------------------------

export type FormatoExport = 'txt' | 'srt' | 'docx'

function nombreArchivoExport(t: Transcripcion, formato: FormatoExport): string {
  const base = `${t.ramoNombre} - ${t.titulo} - ${t.fechaClase}`
    .replace(/[<>:"/\\|?*\r\n\t]/g, '')
    .trim()
  return `${base || 'transcripcion'}.${formato}`
}

export async function descargarExport(t: Transcripcion, formato: FormatoExport) {
  let res: Response
  try {
    res = await fetch(
      `${getTranscriberUrl()}/transcripciones/${encodeURIComponent(t.id)}/exportar?formato=${formato}`,
    )
  } catch {
    throw new ServicioError(MSG_SIN_SERVICIO, true)
  }
  if (!res.ok) throw new ServicioError(await mensajeDeError(res), false, res.status)
  const blob = await res.blob()
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = nombreArchivoExport(t, formato)
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000)
}

// --- Formatos de tiempo -----------------------------------------------------------

/** 187 → "3:07"; 3725 → "1:02:05" (minuto y segundo). */
export function fmtTiempo(seg: number): string {
  const s = Math.max(0, Math.floor(seg))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = s % 60
  const dos = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${dos(m)}:${dos(ss)}` : `${m}:${dos(ss)}`
}

/** "~12 min restantes", "calculando…" */
export function fmtEta(seg: number | null): string {
  if (seg === null) return 'calculando el tiempo…'
  if (seg < 60) return 'menos de 1 min restante'
  if (seg < 3600) return `~${Math.round(seg / 60)} min restantes`
  const h = Math.floor(seg / 3600)
  const m = Math.round((seg % 3600) / 60)
  return `~${h} h ${m} min restantes`
}

export function esActiva(t: Transcripcion): boolean {
  return (
    t.estado === 'en_cola' ||
    t.estado === 'extrayendo' ||
    t.estado === 'transcribiendo'
  )
}

export function etiquetaEstado(t: Transcripcion): string {
  switch (t.estado) {
    case 'en_cola':
      return 'En cola…'
    case 'extrayendo':
      return 'Preparando el audio…'
    case 'transcribiendo':
      return 'Transcribiendo…'
    case 'listo':
      return 'Lista'
    case 'cancelado':
      return 'Cancelada'
    case 'error':
      return 'Falló'
  }
}
