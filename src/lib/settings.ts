import { desktop } from './desktop'

/**
 * Configuración que la alumna puede editar en "Ajustes", guardada en el
 * dispositivo. Así se puede cambiar la URL del backend o el código de acceso
 * sin recompilar la app.
 */

const K_URL = 'leen.apiUrl'
const K_CODE = 'leen.accessCode'

const ENV_URL = (import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, '')
const ENV_CODE = import.meta.env.VITE_ACCESS_CODE ?? ''

export function getApiUrl(): string {
  try {
    const v = localStorage.getItem(K_URL)
    if (v) return v.replace(/\/$/, '')
  } catch {
    /* localStorage no disponible */
  }
  return ENV_URL
}

export function setApiUrl(url: string) {
  try {
    localStorage.setItem(K_URL, url.trim().replace(/\/$/, ''))
  } catch {
    /* no-op */
  }
}

export function getAccessCode(): string {
  try {
    const v = localStorage.getItem(K_CODE)
    if (v) return v
  } catch {
    /* localStorage no disponible */
  }
  return ENV_CODE
}

export function setAccessCode(code: string) {
  try {
    localStorage.setItem(K_CODE, code.trim())
  } catch {
    /* no-op */
  }
}

export function estaConfigurada(): boolean {
  return getApiUrl().length > 0
}

// --- Servicio local de transcripción de clases ---------------------------------

const K_TR_URL = 'leen.transcriberUrl'
const K_TR_USADO = 'leen.transcriberUsado'
const K_TR_JOBS = 'leen.transcriberJobs'

export const TRANSCRIBER_URL_POR_DEFECTO = 'http://127.0.0.1:8765'

export function getTranscriberUrl(): string {
  // En la app de escritorio, el servicio lo arranca ella misma en un puerto propio.
  if (desktop) return desktop.servicioUrl.replace(/\/$/, '')
  try {
    const v = localStorage.getItem(K_TR_URL)
    if (v) return v.replace(/\/$/, '')
  } catch {
    /* localStorage no disponible */
  }
  return TRANSCRIBER_URL_POR_DEFECTO
}

export function setTranscriberUrl(url: string) {
  try {
    const limpia = url.trim().replace(/\/$/, '')
    if (limpia && limpia !== TRANSCRIBER_URL_POR_DEFECTO)
      localStorage.setItem(K_TR_URL, limpia)
    else localStorage.removeItem(K_TR_URL)
  } catch {
    /* no-op */
  }
}

/**
 * ¿Ya usó alguna vez la transcripción? Mientras no, la app no le habla al
 * servicio local en segundo plano (así Chrome no pregunta por "red local"
 * a quien nunca va a usar esta función).
 */
export function transcriberUsado(): boolean {
  try {
    return localStorage.getItem(K_TR_USADO) === '1'
  } catch {
    return false
  }
}

export function marcarTranscriberUsado() {
  try {
    localStorage.setItem(K_TR_USADO, '1')
  } catch {
    /* no-op */
  }
}

export const EVENTO_JOBS = 'leen-jobs'

export function getJobsPendientes(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(K_TR_JOBS) ?? '[]')
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}

function guardarJobs(ids: string[]) {
  try {
    localStorage.setItem(K_TR_JOBS, JSON.stringify(ids))
  } catch {
    /* no-op */
  }
  window.dispatchEvent(new Event(EVENTO_JOBS))
}

export function agregarJobPendiente(id: string) {
  const ids = getJobsPendientes()
  if (!ids.includes(id)) guardarJobs([...ids, id])
}

export function quitarJobPendiente(id: string) {
  const ids = getJobsPendientes()
  if (ids.includes(id)) guardarJobs(ids.filter((x) => x !== id))
}
