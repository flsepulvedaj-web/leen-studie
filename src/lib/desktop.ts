/**
 * Puente con la app de escritorio (Electron). En el navegador / celular
 * `window.leenDesktop` no existe y todo sigue funcionando como PWA.
 */

export type EstadoActualizacion =
  | { estado: 'sin-actualizar' }
  | { estado: 'buscando' }
  | { estado: 'descargando'; progreso: number }
  | { estado: 'lista'; version: string }
  | { estado: 'error'; mensaje: string }

export interface LeenDesktop {
  /** Versión instalada de la app de escritorio, p. ej. "1.0.0". */
  version: string
  /** Dirección del servicio local de transcripción que arrancó la app. */
  servicioUrl: string
  /** Reinicia el servicio de transcripción (si se cayó). */
  reiniciarServicio(): Promise<boolean>
  buscarActualizacion(): Promise<EstadoActualizacion>
  /** Cierra la app, instala la actualización descargada y la vuelve a abrir. */
  instalarActualizacion(): void
  /** Avisos de actualización. Devuelve la función para dejar de escuchar. */
  alCambiarActualizacion(cb: (e: EstadoActualizacion) => void): () => void
  abrirCarpetaDatos(): void
}

declare global {
  interface Window {
    leenDesktop?: LeenDesktop
  }
}

export const desktop: LeenDesktop | undefined =
  typeof window !== 'undefined' ? window.leenDesktop : undefined

export const esDesktop = desktop !== undefined
