import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { transcriberUsado } from '../lib/settings'
import { fmtTiempo, listar } from '../lib/transcriber'
import type { Transcripcion } from '../lib/types'
import { fechaLarga } from './transcripcion'

/**
 * Atajo dentro de un ramo hacia sus clases transcritas. Solo consulta al
 * servicio local si ya se usó alguna vez la función (para no pedir permisos
 * de red local a quien nunca la usa).
 */
export default function ClasesDelRamo({ ramoId }: { ramoId: string }) {
  const usado = transcriberUsado()
  const [clases, setClases] = useState<Transcripcion[] | null>(null)

  useEffect(() => {
    if (!usado) return
    let vivo = true
    listar(ramoId)
      .then((r) => vivo && setClases(r))
      .catch(() => vivo && setClases(null))
    return () => {
      vivo = false
    }
  }, [ramoId, usado])

  const recientes = (clases ?? []).slice(0, 3)

  return (
    <section className="card mx-4 mt-4 px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-base">🎙️ Clases transcritas</h2>
        <Link
          to={`/transcribir?ramo=${encodeURIComponent(ramoId)}`}
          className="btn btn-ghost !px-3 !py-1.5 !text-sm"
        >
          {clases && clases.length > 0 ? 'Ver todas' : 'Transcribir una clase'}
        </Link>
      </div>
      {recientes.length > 0 && (
        <ul className="mt-2 flex flex-col">
          {recientes.map((c) => (
            <li key={c.id}>
              <Link
                to={`/transcripcion/${c.id}`}
                className="flex items-baseline justify-between gap-2 rounded-lg px-1 py-1.5 text-sm hover:bg-[var(--color-bg)]"
              >
                <span className="truncate">{c.titulo}</span>
                <span className="shrink-0 text-xs text-[var(--color-ink-soft)]">
                  {fechaLarga(c.fechaClase)}
                  {c.duracion ? ` · ${fmtTiempo(c.duracion)}` : ''}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
