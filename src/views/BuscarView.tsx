import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { buscarFichas } from '../lib/buscar'
import Header from '../components/Header'
import FichaCard from '../components/FichaCard'
import { Vacio } from '../components/ui'

export default function BuscarView() {
  const fichas = useLiveQuery(() => db.fichas.toArray(), [], undefined)
  const [q, setQ] = useState('')

  const resultados = useMemo(
    () => (fichas ? buscarFichas(fichas, q) : []),
    [fichas, q],
  )

  return (
    <div className="pb-24">
      <Header titulo="Buscar en tus fichas" />

      <div className="px-4 py-3">
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Término, fórmula, ramo…"
          className="card w-full px-3 py-2.5 text-[16px] outline-none focus:border-[var(--color-teal)]"
        />
      </div>

      <div className="flex flex-col gap-3 px-4">
        {fichas && resultados.length === 0 && (
          <Vacio titulo={q ? 'Nada con ese término' : 'Escribí algo para buscar'}>
            {q
              ? 'Prueba con otra palabra, o con el nombre de un término del glosario.'
              : 'Busca por título, por un concepto del glosario o por ramo.'}
          </Vacio>
        )}
        {resultados.map((f) => (
          <FichaCard key={f.id} ficha={f} />
        ))}
      </div>
    </div>
  )
}
