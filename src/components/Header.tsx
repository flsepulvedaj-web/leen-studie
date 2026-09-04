import { useNavigate } from 'react-router-dom'
import type { ReactNode } from 'react'

export default function Header({
  titulo,
  volver,
  accion,
}: {
  titulo: string
  volver?: boolean
  accion?: ReactNode
}) {
  const nav = useNavigate()
  return (
    <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-[var(--color-line)] bg-[var(--color-bg)]/90 px-3 py-2.5 backdrop-blur">
      {volver && (
        <button
          onClick={() => nav(-1)}
          aria-label="Volver"
          className="btn btn-line -ml-1 h-9 w-9 !p-0 text-lg"
        >
          ‹
        </button>
      )}
      <h1 className="flex-1 truncate font-display text-lg">{titulo}</h1>
      {accion}
    </header>
  )
}
