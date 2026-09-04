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
