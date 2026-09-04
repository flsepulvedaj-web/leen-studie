import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  db,
  marcarEstado,
  agregarSimplificacion,
  agregarSeguimiento,
  borrarFicha,
} from '../lib/db'
import { explicarMasSimple, seguirPreguntando, GenError } from '../lib/generate'
import Header from '../components/Header'
import FichaView from '../components/FichaView'
import EjercicioFlow from '../components/EjercicioFlow'
import Markdown from '../components/Markdown'
import { Spinner, AvisoError, RamoChip } from '../components/ui'
import type { Estado } from '../lib/types'

export default function FichaDetailView() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const ficha = useLiveQuery(() => db.fichas.get(id), [id], undefined)
  const ramo = useLiveQuery(
    () => (ficha ? db.ramos.get(ficha.ramoId) : undefined),
    [ficha?.ramoId],
    undefined,
  )
  const contexto = ramo?.contexto ?? ''

  const [modo, setModo] = useState<'ficha' | 'ejercicios'>('ficha')
  const [simplificando, setSimplificando] = useState(false)
  const [pregunta, setPregunta] = useState('')
  const [preguntando, setPreguntando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [menu, setMenu] = useState(false)

  if (ficha === undefined) return <Spinner />
  if (ficha === null) {
    return (
      <div>
        <Header titulo="Ficha" volver />
        <p className="px-4 py-10 text-center text-[var(--color-ink-soft)]">
          Esta ficha ya no existe.
        </p>
      </div>
    )
  }

  async function toggleEstado(e: Estado) {
    if (!ficha) return
    await marcarEstado(ficha.id, ficha.estado === e ? 'sin_marcar' : e)
  }

  async function masSimple() {
    if (!ficha || simplificando) return
    setSimplificando(true)
    setError(null)
    try {
      const { texto } = await explicarMasSimple(
        ficha,
        ficha.simplificaciones.length + 1,
      )
      await agregarSimplificacion(ficha.id, texto)
    } catch (err) {
      setError(
        err instanceof GenError ? err.message : 'No se pudo simplificar ahora.',
      )
    } finally {
      setSimplificando(false)
    }
  }

  async function repreguntar() {
    if (!ficha || !pregunta.trim() || preguntando) return
    setPreguntando(true)
    setError(null)
    try {
      const { respuesta } = await seguirPreguntando(
        ficha,
        contexto,
        pregunta.trim(),
      )
      await agregarSeguimiento(ficha.id, { pregunta: pregunta.trim(), respuesta })
      setPregunta('')
    } catch (err) {
      setError(
        err instanceof GenError ? err.message : 'No se pudo responder ahora.',
      )
    } finally {
      setPreguntando(false)
    }
  }

  return (
    <div className="pb-10">
      <Header
        titulo={ficha.ramoNombre}
        volver
        accion={
          <button
            onClick={() => setMenu((m) => !m)}
            aria-label="Más opciones"
            className="btn btn-line h-9 w-9 !p-0 text-lg"
          >
            ⋯
          </button>
        }
      />

      {menu && (
        <div className="mx-4 mt-2">
          <button
            className="card w-full px-4 py-2.5 text-left text-sm text-[var(--color-amber)]"
            onClick={async () => {
              if (confirm('¿Borrar esta ficha? No se puede deshacer.')) {
                const volverA = ficha.ramoId
                await borrarFicha(ficha.id)
                nav(`/ramo/${volverA}`, { replace: true })
              }
            }}
          >
            Borrar ficha
          </button>
        </div>
      )}

      <div className="px-4 pt-3">
        <div className="mb-2 flex items-center gap-1.5">
          <RamoChip ramo={ficha.ramoNombre} />
        </div>
        <h2 className="font-display text-2xl leading-tight">{ficha.titulo}</h2>

        <div className="mt-3 flex gap-2">
          <button
            onClick={() => toggleEstado('entendido')}
            className={`btn flex-1 ${
              ficha.estado === 'entendido' ? 'btn-primary' : 'btn-line'
            }`}
          >
            ✓ Entendido
          </button>
          <button
            onClick={() => toggleEstado('me_cuesta')}
            className={`btn flex-1 ${
              ficha.estado === 'me_cuesta'
                ? '!bg-[var(--color-amber)] text-white'
                : 'btn-line'
            }`}
          >
            ● Me cuesta
          </button>
        </div>
      </div>

      <div className="mt-5 px-4">
        {modo === 'ficha' ? (
          <>
            <FichaView ficha={ficha} simplificaciones={ficha.simplificaciones} />

            {ficha.seguimientos.length > 0 && (
              <section className="mt-6">
                <h3 className="mb-2 text-[0.7rem] font-semibold uppercase tracking-wider text-[var(--color-ink-soft)]">
                  Lo que preguntaste después
                </h3>
                <div className="flex flex-col gap-3">
                  {ficha.seguimientos.map((s, i) => (
                    <div key={i} className="card p-3.5 text-sm">
                      <p className="mb-1 font-medium text-[var(--color-navy)]">
                        {s.pregunta}
                      </p>
                      <Markdown>{s.respuesta}</Markdown>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {simplificando && <Spinner texto="Buscándole otra vuelta…" />}
            {preguntando && <Spinner texto="Pensando tu pregunta…" />}
            {error && (
              <div className="mt-4">
                <AvisoError>{error}</AvisoError>
              </div>
            )}

            <div className="mt-6">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">Seguir preguntando</span>
                <textarea
                  value={pregunta}
                  onChange={(e) => setPregunta(e.target.value)}
                  rows={2}
                  placeholder="¿Y por qué el signo es negativo?"
                  className="card resize-none px-3 py-2.5 text-[16px] leading-relaxed outline-none focus:border-[var(--color-teal)]"
                />
              </label>
              <button
                className="btn btn-line mt-2 w-full"
                onClick={repreguntar}
                disabled={!pregunta.trim() || preguntando}
              >
                Preguntar sobre esto
              </button>
            </div>

            <div className="mt-6 flex flex-col gap-2">
              <button
                className="btn btn-ghost"
                onClick={masSimple}
                disabled={simplificando}
              >
                Explícamelo más simple
              </button>
              <button
                className="btn btn-primary"
                onClick={() => setModo('ejercicios')}
              >
                Dame ejercicios
              </button>
              <Link className="btn btn-line" to={`/ramo/${ficha.ramoId}`}>
                Otra pregunta de {ficha.ramoNombre}
              </Link>
            </div>
          </>
        ) : (
          <EjercicioFlow
            ficha={ficha}
            contexto={contexto}
            onSalir={() => setModo('ficha')}
          />
        )}
      </div>
    </div>
  )
}
