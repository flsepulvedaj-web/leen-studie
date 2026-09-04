import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { estaConfigurada } from '../lib/settings'
import { colorRamo } from '../lib/colores'
import { Vacio } from '../components/ui'
import type { Ficha } from '../lib/types'

export default function RamosView() {
  const ramos = useLiveQuery(
    () => db.ramos.orderBy('creado').toArray(),
    [],
    undefined,
  )
  const fichas = useLiveQuery(() => db.fichas.toArray(), [], [] as Ficha[])

  const conteo = new Map<string, number>()
  const cuestan = new Map<string, number>()
  for (const f of fichas ?? []) {
    conteo.set(f.ramoId, (conteo.get(f.ramoId) ?? 0) + 1)
    if (f.estado === 'me_cuesta')
      cuestan.set(f.ramoId, (cuestan.get(f.ramoId) ?? 0) + 1)
  }

  return (
    <div className="pb-28">
      <header className="flex items-center gap-2.5 px-4 pb-2 pt-5">
        <img src="icon-192.png" alt="" className="h-9 w-9 rounded-lg" />
        <div>
          <h1 className="font-display text-xl leading-none">LEEN STUDIE</h1>
          <p className="text-xs text-[var(--color-ink-soft)]">Tus ramos</p>
        </div>
      </header>

      {!estaConfigurada() && (
        <div className="mx-4 mt-2">
          <Link
            to="/ajustes"
            className="card block bg-[var(--color-amber-soft)] px-4 py-3 text-sm"
          >
            <strong>Falta un paso.</strong> Pega la dirección del servidor en
            Ajustes para poder preguntar. Lo guardado se lee igual.
          </Link>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 px-4 pt-3">
        {ramos && ramos.length === 0 && (
          <div className="col-span-2">
            <Vacio titulo="Todavía no tienes ramos">
              Agrega un ramo (Termodinámica, Cálculo…) y dentro de él pregunta lo
              que quieras. Cada respuesta se guarda ahí.
            </Vacio>
          </div>
        )}

        {ramos?.map((r) => {
          const c = colorRamo(r.color)
          const n = conteo.get(r.id) ?? 0
          const mc = cuestan.get(r.id) ?? 0
          return (
            <Link
              key={r.id}
              to={`/ramo/${r.id}`}
              className="card flex min-h-[7rem] flex-col justify-between p-3.5 transition-transform active:scale-[0.98]"
              style={{ background: c.bg }}
            >
              <span
                className="font-display text-[1.05rem] leading-tight"
                style={{ color: c.fg }}
              >
                {r.nombre}
              </span>
              <span className="text-xs" style={{ color: c.fg, opacity: 0.8 }}>
                {n} {n === 1 ? 'ficha' : 'fichas'}
                {mc > 0 && ` · ${mc} te cuesta${mc === 1 ? '' : 'n'}`}
              </span>
            </Link>
          )
        })}
      </div>

      <Link
        to="/ramo/nuevo"
        className="btn btn-primary fixed bottom-20 left-1/2 z-20 -translate-x-1/2 shadow-lg"
      >
        + Agregar ramo
      </Link>
    </div>
  )
}
