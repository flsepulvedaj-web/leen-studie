import { NavLink } from 'react-router-dom'

const items = [
  { to: '/', label: 'Inicio', icon: '🏠', end: true },
  { to: '/buscar', label: 'Buscar', icon: '🔎', end: false },
  { to: '/repaso', label: 'Repaso', icon: '🔁', end: false },
  { to: '/transcribir', label: 'Clases', icon: '🎙️', end: false },
  { to: '/ajustes', label: 'Ajustes', icon: '⚙️', end: false },
]

export default function BottomNav() {
  return (
    <nav className="sticky bottom-0 z-20 border-t border-[var(--color-line)] bg-[var(--color-surface)]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <div className="mx-auto flex max-w-lg lg:max-w-3xl">
        {items.map((it) => (
          <NavLink
            key={it.to}
            to={it.to}
            end={it.end}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-0.5 py-2 text-[0.68rem] font-medium transition-colors ${
                isActive
                  ? 'text-[var(--color-navy)]'
                  : 'text-[var(--color-ink-soft)]'
              }`
            }
          >
            <span className="text-lg leading-none">{it.icon}</span>
            {it.label}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
