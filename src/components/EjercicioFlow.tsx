import { useEffect, useState } from 'react'
import type { Ficha, Ejercicio, Correccion } from '../lib/types'
import { generarEjercicio, corregirRespuesta, GenError } from '../lib/generate'
import Markdown from './Markdown'
import { Spinner, AvisoError } from './ui'

const DIFICULTADES = ['Para entrar en calor', 'Un poco más exigente', 'El difícil']

const VEREDICTO_UI: Record<
  Correccion['veredicto'],
  { texto: string; clase: string }
> = {
  correcto: {
    texto: '¡Bien! Lo resolviste',
    clase: 'bg-[var(--color-green-soft)] text-[var(--color-green)]',
  },
  parcial: {
    texto: 'Vas bien, pero te faltó algo',
    clase: 'bg-[var(--color-amber-soft)] text-[var(--color-amber)]',
  },
  incorrecto: {
    texto: 'Se torció el razonamiento — miremos dónde',
    clase: 'bg-[var(--color-amber-soft)] text-[var(--color-amber)]',
  },
}

export default function EjercicioFlow({
  ficha,
  contexto,
  onSalir,
}: {
  ficha: Ficha
  contexto: string
  onSalir: () => void
}) {
  const [nivel, setNivel] = useState<1 | 2 | 3>(1)
  const [previos, setPrevios] = useState<string[]>([])
  const [ejercicio, setEjercicio] = useState<Ejercicio | null>(null)
  const [respuesta, setRespuesta] = useState('')
  const [correccion, setCorreccion] = useState<Correccion | null>(null)
  const [cargando, setCargando] = useState(false)
  const [revisando, setRevisando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [terminado, setTerminado] = useState(false)

  async function pedirEjercicio(n: 1 | 2 | 3, refuerzo = false) {
    setCargando(true)
    setError(null)
    setCorreccion(null)
    setRespuesta('')
    try {
      const ej = await generarEjercicio(ficha, contexto, n, previos)
      setEjercicio(refuerzo ? { ...ej, dificultad: n } : ej)
      setNivel(n)
    } catch (e) {
      setError(e instanceof GenError ? e.message : 'No se pudo generar el ejercicio.')
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    void pedirEjercicio(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function revisar() {
    if (!ejercicio || !respuesta.trim() || revisando) return
    setRevisando(true)
    setError(null)
    try {
      const c = await corregirRespuesta(
        ficha,
        contexto,
        ejercicio.enunciado,
        respuesta.trim(),
      )
      setCorreccion(c)
      setPrevios((p) => [...p, ejercicio.enunciado])
    } catch (e) {
      setError(e instanceof GenError ? e.message : 'No se pudo revisar la respuesta.')
    } finally {
      setRevisando(false)
    }
  }

  function siguiente() {
    if (nivel >= 3) {
      setTerminado(true)
      return
    }
    void pedirEjercicio((nivel + 1) as 1 | 2 | 3)
  }

  if (terminado) {
    return (
      <div className="card animate-in flex flex-col items-center gap-3 p-6 text-center">
        <p className="font-display text-lg">Terminaste los tres 💪</p>
        <p className="text-sm text-[var(--color-ink-soft)]">
          Si algo te costó, marca la ficha como “me cuesta” y va a volver en el
          modo repaso.
        </p>
        <button className="btn btn-primary" onClick={onSalir}>
          Volver a la ficha
        </button>
      </div>
    )
  }

  if (cargando) return <Spinner texto="Preparando el ejercicio…" />

  if (error && !ejercicio) {
    return <AvisoError onReintentar={() => pedirEjercicio(nivel)}>{error}</AvisoError>
  }

  if (!ejercicio) return null

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        {[1, 2, 3].map((n) => (
          <div
            key={n}
            className={`h-1.5 flex-1 rounded-full ${
              n <= nivel ? 'bg-[var(--color-teal)]' : 'bg-[var(--color-line)]'
            }`}
          />
        ))}
      </div>
      <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-soft)]">
        Ejercicio {nivel} de 3 · {DIFICULTADES[nivel - 1]}
      </p>

      <div className="card p-4">
        <Markdown>{ejercicio.enunciado}</Markdown>
      </div>

      {!correccion ? (
        <>
          <textarea
            value={respuesta}
            onChange={(e) => setRespuesta(e.target.value)}
            rows={5}
            placeholder="Escribí tu desarrollo y tu resultado…"
            className="card resize-none px-3 py-2.5 text-[16px] leading-relaxed outline-none focus:border-[var(--color-teal)]"
          />
          {error && <AvisoError onReintentar={revisar}>{error}</AvisoError>}
          <div className="flex gap-2">
            <button className="btn btn-line flex-1" onClick={onSalir}>
              Salir
            </button>
            <button
              className="btn btn-primary flex-1"
              onClick={revisar}
              disabled={!respuesta.trim() || revisando}
            >
              {revisando ? 'Revisando…' : 'Revisar'}
            </button>
          </div>
        </>
      ) : (
        <div className="animate-in flex flex-col gap-3">
          <div
            className={`rounded-xl px-4 py-2.5 text-sm font-semibold ${VEREDICTO_UI[correccion.veredicto].clase}`}
          >
            {VEREDICTO_UI[correccion.veredicto].texto}
          </div>

          {correccion.veredicto !== 'correcto' && (
            <div>
              <h4 className="mb-1 text-[0.7rem] font-semibold uppercase tracking-wider text-[var(--color-ink-soft)]">
                Dónde se torció
              </h4>
              <div className="rounded-xl border-l-4 border-[var(--color-amber)] bg-[var(--color-amber-soft)]/60 px-4 py-3 text-sm">
                <Markdown>{correccion.dondeSeTorcio}</Markdown>
              </div>
            </div>
          )}

          <div>
            <h4 className="mb-1 text-[0.7rem] font-semibold uppercase tracking-wider text-[var(--color-ink-soft)]">
              Cómo se hacía
            </h4>
            <div className="card p-4 text-sm">
              <Markdown>{correccion.explicacion}</Markdown>
            </div>
          </div>

          {correccion.problemaSimilar && (
            <button
              className="btn btn-ghost"
              onClick={() => {
                setEjercicio({
                  enunciado: correccion.problemaSimilar!,
                  dificultad: nivel,
                })
                setCorreccion(null)
                setRespuesta('')
              }}
            >
              Practicar uno parecido
            </button>
          )}

          <button className="btn btn-primary" onClick={siguiente}>
            {nivel >= 3 ? 'Terminar' : 'Siguiente ejercicio'}
          </button>
        </div>
      )}
    </div>
  )
}
