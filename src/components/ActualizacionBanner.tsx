import { useEffect, useState } from 'react'
import { desktop, type EstadoActualizacion } from '../lib/desktop'

/** Estado de las actualizaciones de la app de escritorio (null si no aplica). */
export function useActualizacion(): EstadoActualizacion | null {
  const [estado, setEstado] = useState<EstadoActualizacion | null>(null)
  useEffect(() => {
    if (!desktop) return
    return desktop.alCambiarActualizacion(setEstado)
  }, [])
  return estado
}

/**
 * Aviso flotante cuando ya se descargó una versión nueva. La instalación es
 * con un clic: la app se cierra, se actualiza y se vuelve a abrir sola.
 * Si la alumna lo ignora, igual se instala al cerrar la app.
 */
export default function ActualizacionBanner() {
  const estado = useActualizacion()
  const [oculto, setOculto] = useState(false)

  if (!desktop || estado?.estado !== 'lista' || oculto) return null

  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-50 mx-auto max-w-lg px-3 lg:max-w-3xl">
      <div className="pointer-events-auto flex items-center gap-3 rounded-2xl bg-[var(--color-navy)] px-4 py-3 text-sm text-white shadow-lg">
        <span aria-hidden>⬆️</span>
        <span className="min-w-0 flex-1">
          Hay una versión nueva de LEEN STUDIE ({estado.version}) lista.
        </span>
        <button
          className="shrink-0 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-[var(--color-navy)]"
          onClick={() => desktop?.instalarActualizacion()}
        >
          Actualizar ahora
        </button>
        <button
          className="shrink-0 px-1 text-lg leading-none opacity-70"
          aria-label="Más tarde"
          title="Más tarde (se instalará al cerrar la app)"
          onClick={() => setOculto(true)}
        >
          ×
        </button>
      </div>
    </div>
  )
}
