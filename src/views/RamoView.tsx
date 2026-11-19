import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, crearFicha } from '../lib/db'
import { generarFicha, GenError } from '../lib/generate'
import { estaConfigurada } from '../lib/settings'
import { colorRamo } from '../lib/colores'
import Header from '../components/Header'
import FichaCard from '../components/FichaCard'
import ClasesDelRamo from '../components/ClasesDelRamo'
import { Spinner, AvisoError } from '../components/ui'
import type { Ficha } from '../lib/types'

const MENSAJES = [
  'Leyendo lo que preguntaste…',
  'Separando los términos técnicos…',
  'Armando el glosario…',
  'Buscando el error típico…',
]

const ordenEstado: Record<Ficha['estado'], number> = {
  me_cuesta: 0,
  sin_marcar: 1,
  entendido: 2,
}

export default function RamoView() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const ramo = useLiveQuery(() => db.ramos.get(id), [id], undefined)
  const fichas = useLiveQuery(
    () => db.fichas.where('ramoId').equals(id).toArray(),
    [id],
    undefined,
  )

  const [consulta, setConsulta] = useState('')
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [msgIdx, setMsgIdx] = useState(0)

  useEffect(() => {
    if (!cargando) return
    const t = setInterval(
      () => setMsgIdx((i) => (i + 1) % MENSAJES.length),
      2200,
    )
    return () => clearInterval(t)
  }, [cargando])

  const ordenadas = useMemo(() => {
    if (!fichas) return []
    return [...fichas].sort((a, b) => {
      const e = ordenEstado[a.estado] - ordenEstado[b.estado]
      return e !== 0 ? e : b.actualizada - a.actualizada
    })
  }, [fichas])

  if (ramo === undefined) return <Spinner />
  if (ramo === null) {
    return (
      <div>
        <Header titulo="Ramo" volver />
        <p className="px-4 py-10 text-center text-[var(--color-ink-soft)]">
          Este ramo ya no existe.
        </p>
      </div>
    )
  }

  const c = colorRamo(ramo.color)

  async function preguntar() {
    if (!consulta.trim() || cargando || !ramo) return
    setCargando(true)
    setError(null)
    setMsgIdx(0)
    try {
      const contenido = await generarFicha(
        ramo.nombre,
        ramo.contexto,
        consulta.trim(),
      )
      const fid = await crearFicha(ramo, consulta.trim(), contenido)
      nav(`/ficha/${fid}`)
    } catch (e) {
      setError(
        e instanceof GenError
          ? e.message
          : 'Algo falló al armar la ficha. Prueba de nuevo.',
      )
      setCargando(false)
    }
  }

  return (
    <div className="pb-28">
      <Header
        titulo={ramo.nombre}
        volver
        accion={
          <Link
            to={`/ramo/${ramo.id}/editar`}
            aria-label="Editar ramo"
            className="btn btn-line h-9 w-9 !p-0 text-base"
          >
            ✎
          </Link>
        }
      />

      <div
        className="mx-4 mt-3 rounded-2xl px-4 py-4"
        style={{ background: c.bg }}
      >
        <p
          className="font-display text-lg leading-snug"
          style={{ color: c.fg }}
        >
          ¿Qué vemos hoy de {ramo.nombre}?
        </p>

        {cargando ? (
          <Spinner texto={MENSAJES[msgIdx]} />
        ) : (
          <>
            <textarea
              value={consulta}
              onChange={(e) => setConsulta(e.target.value)}
              rows={4}
              placeholder="Escribe tu pregunta o pega el trozo del apunte que no entiendes…"
              className="mt-3 w-full resize-none rounded-xl border border-white/60 bg-white/80 px-3 py-2.5 text-[16px] leading-relaxed outline-none focus:border-[var(--color-teal)]"
            />
            {!estaConfigurada() && (
              <p className="mt-2 text-xs" style={{ color: c.fg }}>
                Primero configura el servidor en Ajustes.
              </p>
            )}
            <button
              className="btn btn-primary mt-2 w-full"
              onClick={preguntar}
              disabled={!consulta.trim()}
            >
              Preguntar
            </button>
          </>
        )}
        {error && (
          <div className="mt-3">
            <AvisoError onReintentar={preguntar}>{error}</AvisoError>
          </div>
        )}
      </div>

      {ramo.contexto && (
        <p className="mx-4 mt-2 text-xs text-[var(--color-ink-soft)]">
          Contexto: {ramo.contexto}
        </p>
      )}

      <ClasesDelRamo ramoId={ramo.id} />

      <div className="mt-5 flex flex-col gap-3 px-4">
        {ordenadas.length === 0 ? (
          <p className="px-1 py-6 text-center text-sm text-[var(--color-ink-soft)]">
            Todavía no hay fichas en este ramo. Haz tu primera pregunta arriba.
          </p>
        ) : (
          <>
            <p className="px-1 text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-soft)]">
              Fichas de {ramo.nombre}
            </p>
            {ordenadas.map((f) => (
              <FichaCard key={f.id} ficha={f} />
            ))}
          </>
        )}
      </div>
    </div>
  )
}
