import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  EVENTO_JOBS,
  getJobsPendientes,
  quitarJobPendiente,
} from '../lib/settings'
import { ServicioError, esActiva, fmtEta, obtener } from '../lib/transcriber'
import type { Transcripcion } from '../lib/types'

/**
 * Cinta flotante que sigue las transcripciones en curso mientras la alumna
 * usa el resto de la app. Solo consulta al servicio local si hay un trabajo
 * que ella misma lanzó (así no molesta a quien no usa esta función).
 */
export default function JobsIndicador({
  conNav,
  sobreBoton = false,
}: {
  conNav: boolean
  /** true si la pantalla tiene un botón flotante abajo que no hay que tapar */
  sobreBoton?: boolean
}) {
  const [ids, setIds] = useState<string[]>(getJobsPendientes())
  const [activas, setActivas] = useState<Transcripcion[]>([])
  const [lista, setLista] = useState<Transcripcion | null>(null)

  useEffect(() => {
    const alCambiar = () => setIds(getJobsPendientes())
    window.addEventListener(EVENTO_JOBS, alCambiar)
    window.addEventListener('storage', alCambiar)
    return () => {
      window.removeEventListener(EVENTO_JOBS, alCambiar)
      window.removeEventListener('storage', alCambiar)
    }
  }, [])

  useEffect(() => {
    if (ids.length === 0) {
      setActivas([])
      return
    }
    let vivo = true
    let timer: number | undefined

    const correr = async () => {
      const resultados = await Promise.all(
        ids.map(async (id) => {
          try {
            return await obtener(id)
          } catch (e) {
            // Si fue borrada, dejamos de seguirla. Si el servicio está
            // apagado, la seguimos esperando.
            if (e instanceof ServicioError && e.status === 404) quitarJobPendiente(id)
            return null
          }
        }),
      )
      if (!vivo) return
      const vigentes = resultados.filter((t): t is Transcripcion => t !== null)
      for (const t of vigentes) {
        if (!esActiva(t)) {
          quitarJobPendiente(t.id)
          if (t.estado === 'listo') {
            setLista(t)
            setTimeout(() => setLista((x) => (x?.id === t.id ? null : x)), 12_000)
          }
        }
      }
      setActivas(vigentes.filter(esActiva))
      timer = window.setTimeout(correr, 3_000)
    }
    void correr()
    return () => {
      vivo = false
      if (timer) clearTimeout(timer)
    }
  }, [ids])

  const t = activas[0]
  if (!t && !lista) return null

  return (
    <div
      className={`pointer-events-none fixed inset-x-0 z-30 mx-auto max-w-lg px-3 lg:max-w-3xl ${
        !conNav
          ? 'bottom-3'
          : sobreBoton
            ? 'bottom-[calc(8.75rem+env(safe-area-inset-bottom))]'
            : 'bottom-[calc(4rem+env(safe-area-inset-bottom))]'
      }`}
    >
      {t ? (
        <Link
          to={`/transcripcion/${t.id}`}
          className="pointer-events-auto flex items-center gap-2 rounded-full bg-[var(--color-navy)] px-4 py-2.5 text-sm text-white shadow-lg"
        >
          <span aria-hidden>🎙️</span>
          <span className="min-w-0 flex-1 truncate">
            {t.estado === 'en_cola' ? 'En cola' : 'Transcribiendo'}: {t.titulo}
          </span>
          <span className="shrink-0 tabular-nums opacity-90">
            {Math.round(t.progreso * 100)}%
            {t.estado === 'transcribiendo' && t.etaSeg !== null
              ? ` · ${fmtEta(t.etaSeg).replace(' restantes', '').replace(' restante', '')}`
              : ''}
          </span>
        </Link>
      ) : (
        lista && (
          <Link
            to={`/transcripcion/${lista.id}`}
            className="pointer-events-auto flex items-center gap-2 rounded-full bg-[var(--color-green)] px-4 py-2.5 text-sm text-white shadow-lg"
          >
            <span aria-hidden>✓</span>
            <span className="min-w-0 flex-1 truncate">
              Transcripción lista: {lista.titulo}
            </span>
          </Link>
        )
      )}
    </div>
  )
}
