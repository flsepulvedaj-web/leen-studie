import { Link } from 'react-router-dom'
import type { Ficha } from '../lib/types'
import { EstadoChip, RamoChip } from './ui'

function fechaCorta(ts: number) {
  const d = new Date(ts)
  return d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
}

export default function FichaCard({ ficha }: { ficha: Ficha }) {
  return (
    <Link
      to={`/ficha/${ficha.id}`}
      className="card block px-4 py-3 transition-transform active:scale-[0.99]"
    >
      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
        <RamoChip ramo={ficha.ramoNombre} />
        <EstadoChip estado={ficha.estado} />
        <span className="ml-auto text-xs text-[var(--color-ink-soft)]">
          {fechaCorta(ficha.actualizada)}
        </span>
      </div>
      <p className="font-display text-[1.05rem] leading-snug text-[var(--color-ink)]">
        {ficha.titulo}
      </p>
      <p className="mt-0.5 line-clamp-2 text-sm text-[var(--color-ink-soft)]">
        {ficha.ideaCentral}
      </p>
    </Link>
  )
}
