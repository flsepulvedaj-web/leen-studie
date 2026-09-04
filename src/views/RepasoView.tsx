import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, registrarRepaso } from '../lib/db'
import { elegirFichasRepaso } from '../lib/repaso'
import { generarPreguntasRepaso, GenError } from '../lib/generate'
import Header from '../components/Header'
import Markdown from '../components/Markdown'
import { Spinner, AvisoError, Vacio } from '../components/ui'
import type { PreguntaRepaso } from '../lib/types'

type Fase = 'inicio' | 'cargando' | 'jugando' | 'fin'

export default function RepasoView() {
  const difíciles = useLiveQuery(
    () => db.fichas.where('estado').equals('me_cuesta').count(),
    [],
    undefined,
  )

  const [fase, setFase] = useState<Fase>('inicio')
  const [preguntas, setPreguntas] = useState<PreguntaRepaso[]>([])
  const [idx, setIdx] = useState(0)
  const [mostrar, setMostrar] = useState(false)
  const [aciertos, setAciertos] = useState(0)
  const [error, setError] = useState<string | null>(null)

  async function empezar() {
    setFase('cargando')
    setError(null)
    try {
      const fichas = await elegirFichasRepaso(5)
      if (fichas.length === 0) {
        setFase('inicio')
        return
      }
      const { preguntas } = await generarPreguntasRepaso(
        fichas.map((f) => ({
          id: f.id,
          ramo: f.ramoNombre,
          titulo: f.titulo,
          ideaCentral: f.ideaCentral,
        })),
      )
      setPreguntas(preguntas)
      setIdx(0)
      setAciertos(0)
      setMostrar(false)
      setFase('jugando')
    } catch (e) {
      setError(e instanceof GenError ? e.message : 'No se pudo armar el repaso.')
      setFase('inicio')
    }
  }

  async function responder(acerto: boolean) {
    const p = preguntas[idx]
    await registrarRepaso(p.fichaId, acerto)
    if (acerto) setAciertos((a) => a + 1)
    if (idx + 1 >= preguntas.length) {
      setFase('fin')
    } else {
      setIdx((i) => i + 1)
      setMostrar(false)
    }
  }

  return (
    <div className="pb-24">
      <Header titulo="Repaso rápido" />
      <div className="px-4 py-4">
        {fase === 'cargando' && <Spinner texto="Eligiendo preguntas de lo que te cuesta…" />}

        {fase === 'inicio' && (
          <>
            {error && <AvisoError onReintentar={empezar}>{error}</AvisoError>}
            {difíciles === 0 ? (
              <Vacio titulo="Nada que repasar todavía">
                Cuando marques fichas como “me cuesta”, aquí te voy a tirar
                preguntas cortas de esos temas para que no se te olviden.
              </Vacio>
            ) : (
              <div className="card flex flex-col items-center gap-3 p-6 text-center">
                <p className="font-display text-lg">
                  Tienes {difíciles}{' '}
                  {difíciles === 1 ? 'tema marcado' : 'temas marcados'} como
                  difícil{difíciles === 1 ? '' : 'es'}
                </p>
                <p className="text-sm text-[var(--color-ink-soft)]">
                  Te hago hasta 5 preguntas cortas. Respondes mentalmente,
                  destapas la respuesta y me dices si la tenías.
                </p>
                <button className="btn btn-primary mt-1" onClick={empezar}>
                  Empezar repaso
                </button>
              </div>
            )}
          </>
        )}

        {fase === 'jugando' && preguntas[idx] && (
          <div className="animate-in flex flex-col gap-4">
            <div className="flex items-center gap-2">
              {preguntas.map((_, i) => (
                <div
                  key={i}
                  className={`h-1.5 flex-1 rounded-full ${
                    i < idx
                      ? 'bg-[var(--color-teal)]'
                      : i === idx
                        ? 'bg-[var(--color-navy)]'
                        : 'bg-[var(--color-line)]'
                  }`}
                />
              ))}
            </div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-soft)]">
              {preguntas[idx].ramo} · {preguntas[idx].titulo}
            </p>

            <div className="card p-4">
              <Markdown>{preguntas[idx].pregunta}</Markdown>
            </div>

            {mostrar ? (
              <>
                <div className="rounded-xl border-l-4 border-[var(--color-teal)] bg-[var(--color-teal-soft)]/50 px-4 py-3 text-sm">
                  <Markdown>{preguntas[idx].respuestaEsperada}</Markdown>
                </div>
                <div className="flex gap-2">
                  <button
                    className="btn btn-line flex-1"
                    onClick={() => responder(false)}
                  >
                    No me acordaba
                  </button>
                  <button
                    className="btn btn-primary flex-1"
                    onClick={() => responder(true)}
                  >
                    La tenía
                  </button>
                </div>
              </>
            ) : (
              <button
                className="btn btn-ghost"
                onClick={() => setMostrar(true)}
              >
                Ver respuesta
              </button>
            )}
          </div>
        )}

        {fase === 'fin' && (
          <div className="card animate-in flex flex-col items-center gap-3 p-6 text-center">
            <p className="font-display text-lg">
              {aciertos} de {preguntas.length}
            </p>
            <p className="text-sm text-[var(--color-ink-soft)]">
              {aciertos === preguntas.length
                ? 'Las tenías todas. Quizás ya puedes mover alguna a “entendido”.'
                : 'Lo que fallaste va a volver a aparecer en el próximo repaso.'}
            </p>
            <div className="flex gap-2">
              <Link className="btn btn-line" to="/">
                Volver
              </Link>
              <button className="btn btn-primary" onClick={empezar}>
                Otra ronda
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
