import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import {
  ServicioError,
  borrar,
  descargarExport,
  editar,
  esActiva,
  etiquetaEstado,
  fmtEta,
  fmtTiempo,
  listarSegmentos,
  obtener,
  urlMedia,
  type FormatoExport,
} from '../lib/transcriber'
import { usePolling } from '../lib/usePolling'
import type { Ramo, Segmento, Transcripcion } from '../lib/types'
import Header from '../components/Header'
import { AvisoError, RamoChip, Spinner } from '../components/ui'
import { BarraProgreso, fechaLarga } from '../components/transcripcion'

function normalizar(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
}

/** Índice del segmento que está sonando en el segundo `t` (búsqueda binaria). */
function segmentoActivo(segs: Segmento[], t: number): number {
  let lo = 0
  let hi = segs.length - 1
  let res = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (segs[mid].inicio <= t + 0.05) {
      res = mid
      lo = mid + 1
    } else hi = mid - 1
  }
  return res
}

const Fila = memo(function Fila({
  s,
  activo,
  terminos,
  onIr,
}: {
  s: Segmento
  activo: boolean
  terminos: string[]
  onIr: (t: number) => void
}) {
  return (
    <li
      id={`seg-${s.idx}`}
      className={`flex gap-2.5 rounded-lg px-2 py-1.5 transition-colors ${
        activo ? 'bg-[var(--color-teal-soft)]' : ''
      }`}
    >
      <button
        onClick={() => onIr(s.inicio)}
        title="Ir a este momento"
        className="shrink-0 self-start rounded-md bg-[var(--color-navy-soft)] px-1.5 py-0.5 text-xs font-semibold tabular-nums text-[var(--color-navy)] active:scale-95"
      >
        {fmtTiempo(s.inicio)}
      </button>
      <p className="text-[0.95rem] leading-relaxed">
        {terminos.length ? resaltar(s.texto, terminos) : s.texto}
      </p>
    </li>
  )
})

function resaltar(texto: string, terminos: string[]) {
  // Se resalta comparando sin tildes, pero mostrando el texto original.
  const n = normalizar(texto)
  const marcas: [number, number][] = []
  for (const t of terminos) {
    let desde = 0
    for (;;) {
      const i = n.indexOf(t, desde)
      if (i < 0) break
      marcas.push([i, i + t.length])
      desde = i + t.length
    }
  }
  if (!marcas.length) return texto
  marcas.sort((a, b) => a[0] - b[0])
  const unidas: [number, number][] = []
  for (const m of marcas) {
    const ult = unidas[unidas.length - 1]
    if (ult && m[0] <= ult[1]) ult[1] = Math.max(ult[1], m[1])
    else unidas.push([m[0], m[1]])
  }
  const out: React.ReactNode[] = []
  let pos = 0
  unidas.forEach(([a, b], i) => {
    if (a > pos) out.push(texto.slice(pos, a))
    out.push(
      <mark
        key={i}
        className="rounded bg-[var(--color-amber-soft)] px-0.5 text-[var(--color-ink)]"
      >
        {texto.slice(a, b)}
      </mark>,
    )
    pos = b
  })
  if (pos < texto.length) out.push(texto.slice(pos))
  return out
}

export default function TranscripcionView() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const [params] = useSearchParams()
  const tInicial = Math.max(0, Number(params.get('t')) || 0)
  const ramos = useLiveQuery(() => db.ramos.toArray(), [], [] as Ramo[])

  const { data: t, error, recargar } = usePolling<Transcripcion>(
    () => obtener(id),
    (d) => (d && !esActiva(d) ? null : 2_000),
    [id],
  )
  const activa = t ? esActiva(t) : true

  // --- Segmentos (se van sumando mientras la transcripción avanza) ---
  const [segs, setSegs] = useState<Segmento[]>([])
  const segsRef = useRef<Segmento[]>([])
  useEffect(() => {
    segsRef.current = []
    setSegs([])
  }, [id])
  useEffect(() => {
    let vivo = true
    let timer: number | undefined
    const correr = async () => {
      try {
        const nuevos = await listarSegmentos(id, segsRef.current.length)
        if (!vivo) return
        if (nuevos.length) {
          segsRef.current = segsRef.current.concat(nuevos)
          setSegs(segsRef.current)
        }
      } catch {
        /* se reintenta */
      }
      if (vivo && activa) timer = window.setTimeout(correr, 2_500)
    }
    void correr()
    return () => {
      vivo = false
      if (timer) clearTimeout(timer)
    }
  }, [id, activa])

  // --- Reproductor ---
  const mediaRef = useRef<HTMLMediaElement | null>(null)
  const [actual, setActual] = useState(-1)
  const [seguir, setSeguir] = useState(true)
  const [mediaError, setMediaError] = useState(false)
  const segsParaEvento = useRef<Segmento[]>([])
  segsParaEvento.current = segs

  const irA = useCallback((seg: number) => {
    const el = mediaRef.current
    if (!el) return
    el.currentTime = seg
    void el.play().catch(() => undefined)
  }, [])

  const alActualizarTiempo = useCallback(() => {
    const el = mediaRef.current
    if (!el) return
    const i = segmentoActivo(segsParaEvento.current, el.currentTime)
    setActual((prev) => (prev === i ? prev : i))
  }, [])

  const alCargarMetadatos = useCallback(() => {
    const el = mediaRef.current
    if (el && tInicial > 0) el.currentTime = tInicial
  }, [tInicial])

  useEffect(() => {
    if (!seguir || actual < 0) return
    document
      .getElementById(`seg-${segsParaEvento.current[actual]?.idx}`)
      ?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [actual, seguir])

  // --- Búsqueda dentro de la transcripción ---
  const [q, setQ] = useState(params.get('q') ?? '')
  const terminos = useMemo(
    () => normalizar(q).split(/\s+/).filter(Boolean),
    [q],
  )
  const visibles = useMemo(() => {
    if (!terminos.length) return segs
    return segs.filter((s) => {
      const n = normalizar(s.texto)
      return terminos.every((x) => n.includes(x))
    })
  }, [segs, terminos])

  // --- Edición / exportar / borrar ---
  const [editando, setEditando] = useState(false)
  const [formTitulo, setFormTitulo] = useState('')
  const [formFecha, setFormFecha] = useState('')
  const [formRamo, setFormRamo] = useState('')
  const [aviso, setAviso] = useState<string | null>(null)
  const [exportando, setExportando] = useState<FormatoExport | null>(null)

  function abrirEdicion() {
    if (!t) return
    setFormTitulo(t.titulo)
    setFormFecha(t.fechaClase)
    setFormRamo(t.ramoId)
    setEditando(true)
  }

  async function guardarEdicion() {
    if (!t) return
    const ramo = ramos.find((r) => r.id === formRamo)
    try {
      await editar(t.id, {
        titulo: formTitulo.trim() || t.titulo,
        fechaClase: formFecha || t.fechaClase,
        ...(ramo ? { ramoId: ramo.id, ramoNombre: ramo.nombre } : {}),
      })
      setEditando(false)
      recargar()
    } catch (e) {
      setAviso(e instanceof ServicioError ? e.message : 'No se pudo guardar.')
    }
  }

  async function exportar(f: FormatoExport) {
    if (!t) return
    setExportando(f)
    setAviso(null)
    try {
      await descargarExport(t, f)
    } catch (e) {
      setAviso(e instanceof ServicioError ? e.message : 'No se pudo exportar.')
    } finally {
      setExportando(null)
    }
  }

  async function eliminar() {
    if (!t) return
    if (!confirm('¿Borrar esta transcripción y el archivo de la clase? No se puede deshacer.'))
      return
    try {
      await borrar(t.id)
      nav('/transcribir', { replace: true })
    } catch (e) {
      setAviso(e instanceof ServicioError ? e.message : 'No se pudo borrar.')
    }
  }

  if (error?.status === 404) {
    return (
      <div>
        <Header titulo="Transcripción" volver />
        <p className="px-4 py-10 text-center text-[var(--color-ink-soft)]">
          Esta transcripción ya no existe.
        </p>
      </div>
    )
  }
  if (!t) {
    return (
      <div>
        <Header titulo="Transcripción" volver />
        {error ? (
          <div className="px-4 py-6">
            <AvisoError onReintentar={recargar}>{error.message}</AvisoError>
          </div>
        ) : (
          <Spinner />
        )}
      </div>
    )
  }

  const nombreRamo = ramos.find((r) => r.id === t.ramoId)?.nombre ?? t.ramoNombre
  const src = urlMedia(t.id)

  return (
    <div className="pb-16">
      <Header titulo={t.titulo} volver />

      {/* Reproductor fijo arriba mientras se lee */}
      <div className="sticky top-[57px] z-10 border-b border-[var(--color-line)] bg-[var(--color-bg)]/95 px-4 py-2 backdrop-blur">
        {mediaError ? (
          <p className="py-2 text-sm text-[var(--color-ink-soft)]">
            Tu navegador no puede reproducir este formato de archivo. La
            transcripción sí funciona; las marcas de tiempo solo no moverán el
            video.
          </p>
        ) : t.esVideo ? (
          <video
            ref={(el) => {
              mediaRef.current = el
            }}
            src={src}
            controls
            playsInline
            preload="metadata"
            onTimeUpdate={alActualizarTiempo}
            onLoadedMetadata={alCargarMetadatos}
            onError={() => setMediaError(true)}
            className="max-h-[32vh] w-full rounded-xl bg-black"
          />
        ) : (
          <audio
            ref={(el) => {
              mediaRef.current = el
            }}
            src={src}
            controls
            preload="metadata"
            onTimeUpdate={alActualizarTiempo}
            onLoadedMetadata={alCargarMetadatos}
            onError={() => setMediaError(true)}
            className="w-full"
          />
        )}
      </div>

      <div className="flex flex-col gap-4 px-4 pt-3">
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-[var(--color-ink-soft)]">
          <RamoChip ramo={nombreRamo} />
          <span>
            {fechaLarga(t.fechaClase)}
            {t.duracion ? ` · ${fmtTiempo(t.duracion)}` : ''} · modelo{' '}
            {t.modelo === 'small' ? 'rápido' : 'mejor calidad'}
          </span>
          <button
            onClick={abrirEdicion}
            className="ml-auto font-medium text-[var(--color-teal)]"
          >
            Editar
          </button>
        </div>

        {editando && (
          <div className="card animate-in flex flex-col gap-3 p-4">
            <label className="flex flex-col gap-1 text-sm font-medium">
              Título
              <input
                value={formTitulo}
                onChange={(e) => setFormTitulo(e.target.value)}
                className="card px-3 py-2 text-[16px] font-normal outline-none"
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-sm font-medium">
                Fecha de la clase
                <input
                  type="date"
                  value={formFecha}
                  onChange={(e) => setFormFecha(e.target.value)}
                  className="card px-3 py-2 text-[16px] font-normal outline-none"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm font-medium">
                Ramo
                <select
                  value={formRamo}
                  onChange={(e) => setFormRamo(e.target.value)}
                  className="card px-3 py-2 text-[16px] font-normal outline-none"
                >
                  {ramos.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.nombre}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="flex gap-2">
              <button className="btn btn-line flex-1" onClick={() => setEditando(false)}>
                Cancelar
              </button>
              <button className="btn btn-primary flex-1" onClick={guardarEdicion}>
                Guardar
              </button>
            </div>
          </div>
        )}

        {activa && (
          <div className="card p-4">
            <BarraProgreso fraccion={t.progreso} />
            <p className="mt-1.5 text-xs text-[var(--color-ink-soft)]">
              {etiquetaEstado(t)} {Math.round(t.progreso * 100)}%
              {t.estado === 'transcribiendo' && ` · ${fmtEta(t.etaSeg)}`}. Puedes
              ir leyendo lo que ya está listo y seguir usando la app.
            </p>
          </div>
        )}
        {t.estado === 'error' && (
          <AvisoError>{t.error ?? 'La transcripción falló.'}</AvisoError>
        )}
        {t.estado === 'cancelado' && (
          <AvisoError>Esta transcripción se canceló antes de terminar.</AvisoError>
        )}
        {aviso && <AvisoError>{aviso}</AvisoError>}

        {/* Exportar */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-soft)]">
            Exportar
          </span>
          {(['txt', 'srt', 'docx'] as const).map((f) => (
            <button
              key={f}
              className="btn btn-line !px-3 !py-1.5 !text-sm"
              disabled={exportando !== null || segs.length === 0}
              onClick={() => exportar(f)}
            >
              {exportando === f ? '…' : `.${f}`}
            </button>
          ))}
        </div>

        {/* Buscar dentro de esta clase */}
        <div className="flex items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar en esta clase…"
            className="card min-w-0 flex-1 px-3 py-2 text-[16px] outline-none focus:border-[var(--color-teal)]"
          />
          <label className="flex shrink-0 items-center gap-1.5 text-xs text-[var(--color-ink-soft)]">
            <input
              type="checkbox"
              checked={seguir}
              onChange={(e) => setSeguir(e.target.checked)}
            />
            Seguir audio
          </label>
        </div>
        {terminos.length > 0 && (
          <p className="-mt-2 text-xs text-[var(--color-ink-soft)]">
            {visibles.length} de {segs.length} fragmentos
          </p>
        )}

        {/* Transcripción */}
        {segs.length === 0 ? (
          <p className="py-8 text-center text-sm text-[var(--color-ink-soft)]">
            {activa
              ? 'Todavía no hay texto. En cuanto Whisper avance, va apareciendo aquí.'
              : 'Esta transcripción no tiene texto.'}
          </p>
        ) : (
          <ul className="flex flex-col">
            {visibles.map((s) => (
              <Fila
                key={s.idx}
                s={s}
                activo={!terminos.length && s.idx === segs[actual]?.idx}
                terminos={terminos}
                onIr={irA}
              />
            ))}
          </ul>
        )}

        <button
          onClick={eliminar}
          className="btn btn-line mt-4 !text-[var(--color-amber)]"
        >
          Borrar transcripción
        </button>
      </div>
    </div>
  )
}
