import { Link } from 'react-router-dom'
import type { Transcripcion } from '../lib/types'
import {
  esActiva,
  etiquetaEstado,
  fmtEta,
  fmtTiempo,
} from '../lib/transcriber'
import { RamoChip } from './ui'

/** Pinta en destacado lo que el servicio marcó entre \u0001 y \u0002. */
export function Resaltado({ texto }: { texto: string }) {
  const partes = texto.split(/(\u0001[^\u0002]*\u0002)/)
  return (
    <>
      {partes.map((p, i) =>
        p.startsWith('\u0001') ? (
          <mark
            key={i}
            className="rounded bg-[var(--color-amber-soft)] px-0.5 text-[var(--color-ink)]"
          >
            {p.slice(1, -1)}
          </mark>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  )
}

export function BarraProgreso({ fraccion }: { fraccion: number }) {
  const pct = Math.round(Math.min(1, Math.max(0, fraccion)) * 100)
  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full bg-[var(--color-line)]"
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full bg-[var(--color-teal)] transition-[width] duration-500"
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

export function fechaLarga(iso: string): string {
  const [a, m, d] = iso.split('-').map(Number)
  if (!a || !m || !d) return iso
  return new Date(a, m - 1, d).toLocaleDateString('es-CL', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function TarjetaTranscripcion({
  t,
  nombreRamo,
  onCancelar,
}: {
  t: Transcripcion
  nombreRamo: string
  onCancelar?: () => void
}) {
  const activa = esActiva(t)
  return (
    <div className="card px-4 py-3">
      <Link to={`/transcripcion/${t.id}`} className="block">
        <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
          <RamoChip ramo={nombreRamo} />
          <span className="text-xs text-[var(--color-ink-soft)]">
            {fechaLarga(t.fechaClase)}
            {t.duracion ? ` · ${fmtTiempo(t.duracion)}` : ''}
          </span>
          {!activa && t.estado !== 'listo' && (
            <span className="ml-auto rounded-full bg-[var(--color-amber-soft)] px-2 py-0.5 text-xs font-medium text-[var(--color-amber)]">
              {etiquetaEstado(t)}
            </span>
          )}
        </div>
        <p className="font-display text-[1.05rem] leading-snug text-[var(--color-ink)]">
          {t.titulo}
        </p>
      </Link>

      {activa && (
        <div className="mt-2.5">
          <BarraProgreso fraccion={t.progreso} />
          <div className="mt-1.5 flex items-center justify-between gap-2 text-xs text-[var(--color-ink-soft)]">
            <span>
              {etiquetaEstado(t)} {Math.round(t.progreso * 100)}%
              {t.estado === 'transcribiendo' && ` · ${fmtEta(t.etaSeg)}`}
            </span>
            {onCancelar && (
              <button
                onClick={onCancelar}
                className="font-medium text-[var(--color-amber)]"
              >
                Cancelar
              </button>
            )}
          </div>
        </div>
      )}

      {t.estado === 'error' && t.error && (
        <p className="mt-2 text-sm text-[var(--color-amber)]">{t.error}</p>
      )}
    </div>
  )
}
