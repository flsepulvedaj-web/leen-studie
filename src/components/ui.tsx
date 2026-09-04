import type { ReactNode } from 'react'
import type { Estado } from '../lib/types'

export function EstadoChip({ estado }: { estado: Estado }) {
  if (estado === 'entendido') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-green-soft)] px-2 py-0.5 text-xs font-medium text-[var(--color-green)]">
        ✓ Entendido
      </span>
    )
  }
  if (estado === 'me_cuesta') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-amber-soft)] px-2 py-0.5 text-xs font-medium text-[var(--color-amber)]">
        ● Me cuesta
      </span>
    )
  }
  return null
}

export function RamoChip({ ramo }: { ramo: string }) {
  return (
    <span className="inline-flex items-center rounded-full bg-[var(--color-navy-soft)] px-2 py-0.5 text-xs font-medium text-[var(--color-navy)]">
      {ramo}
    </span>
  )
}

export function Spinner({ texto }: { texto?: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-[var(--color-ink-soft)]">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-line)] border-t-[var(--color-teal)]" />
      {texto && <p className="text-sm">{texto}</p>}
    </div>
  )
}

export function AvisoError({
  children,
  onReintentar,
}: {
  children: ReactNode
  onReintentar?: () => void
}) {
  return (
    <div className="card animate-in border-[var(--color-amber)] bg-[var(--color-amber-soft)] p-4 text-sm">
      <p className="text-[var(--color-ink)]">{children}</p>
      {onReintentar && (
        <button className="btn btn-line mt-3" onClick={onReintentar}>
          Reintentar
        </button>
      )}
    </div>
  )
}

export function Vacio({
  titulo,
  children,
}: {
  titulo: string
  children?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
      <p className="font-display text-lg text-[var(--color-ink)]">{titulo}</p>
      {children && (
        <p className="max-w-xs text-sm text-[var(--color-ink-soft)]">{children}</p>
      )}
    </div>
  )
}
