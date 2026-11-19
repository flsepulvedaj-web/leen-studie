import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import {
  agregarJobPendiente,
  marcarTranscriberUsado,
} from '../lib/settings'
import {
  ServicioError,
  buscarEnClases,
  cancelar,
  descargarModelo,
  esActiva,
  fmtTiempo,
  listar,
  permisoRedLocal,
  salud,
  subirClase,
  type PermisoRedLocal,
} from '../lib/transcriber'
import { desktop, esDesktop } from '../lib/desktop'
import { usePolling } from '../lib/usePolling'
import type { DescargaModelo, HitBusqueda, ModeloWhisper } from '../lib/types'
import Header from '../components/Header'
import { AvisoError, Spinner } from '../components/ui'
import {
  Resaltado,
  TarjetaTranscripcion,
  BarraProgreso,
  fechaLarga,
} from '../components/transcripcion'

const URL_AYUDA =
  'https://github.com/flsepulvedaj-web/leen-studie/tree/main/transcriber'

function hoy(): string {
  return new Date().toLocaleDateString('sv-SE') // AAAA-MM-DD en hora local
}

function sinExtension(nombre: string): string {
  return nombre.replace(/\.[^.]+$/, '')
}

function mb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(bytes > 1024 ** 3 ? 0 : 1)} MB`
}

export default function TranscribirView() {
  const [params, setParams] = useSearchParams()
  const ramoFiltro = params.get('ramo') ?? ''
  const ramos = useLiveQuery(() => db.ramos.orderBy('creado').toArray(), [], undefined)
  const nombreDe = useMemo(
    () => new Map((ramos ?? []).map((r) => [r.id, r.nombre])),
    [ramos],
  )

  // En la app de escritorio el servicio arranca junto con la app: durante los
  // primeros segundos "no responde" es normal y no hay que alarmar.
  const [arrancando, setArrancando] = useState(esDesktop)
  useEffect(() => {
    if (!arrancando) return
    const t = setTimeout(() => setArrancando(false), 45_000)
    return () => clearTimeout(t)
  }, [arrancando])

  // Estado del servicio (se revisa mientras esta pantalla esté abierta; más
  // seguido mientras se baja un modelo o el servicio está arrancando).
  const { data: estado, recargar: recargarSalud } = usePolling(
    async () => ({ s: await salud() }),
    (d) => {
      const s = d?.s
      if (s === null && arrancando) return 1_500
      if (s && Object.values(s.descargas ?? {}).some((x) => x.estado === 'descargando'))
        return 1_500
      return 5_000
    },
    [],
  )
  const svc = estado?.s // undefined = cargando, null = apagado
  useEffect(() => {
    if (svc) setArrancando(false)
  }, [svc])

  // En el navegador: si no conecta, ¿está apagado o Chrome bloqueó el permiso?
  const [permiso, setPermiso] = useState<PermisoRedLocal>('desconocido')
  useEffect(() => {
    if (svc !== null || esDesktop) return
    let vivo = true
    void permisoRedLocal().then((p) => vivo && setPermiso(p))
    return () => {
      vivo = false
    }
  }, [svc])

  // Lista (más seguido mientras haya algo procesándose)
  const { data: lista, recargar } = usePolling(
    () => listar(ramoFiltro || undefined),
    (d) => (d?.some(esActiva) ? 2_000 : 8_000),
    [ramoFiltro, svc ? 1 : 0],
  )

  // --- Formulario de subida ---
  const [archivo, setArchivo] = useState<File | null>(null)
  const [ramoId, setRamoId] = useState(ramoFiltro)
  const [fecha, setFecha] = useState(hoy())
  const [titulo, setTitulo] = useState('')
  const [modelo, setModelo] = useState<ModeloWhisper>('small')
  const [subida, setSubida] = useState<number | null>(null)
  const [errorSubida, setErrorSubida] = useState<string | null>(null)
  const abortarRef = useRef<(() => void) | null>(null)
  const archivoRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!ramoId && ramos && ramos.length > 0) setRamoId(ramoFiltro || ramos[0].id)
  }, [ramos, ramoId, ramoFiltro])

  const modeloListo = svc ? svc.modelos[modelo] : false
  const puedeSubir =
    !!svc && svc.ffmpeg && modeloListo && !!archivo && !!ramoId && subida === null

  async function transcribir() {
    if (!archivo || !ramoId) return
    const ramo = ramos?.find((r) => r.id === ramoId)
    if (!ramo) return
    setErrorSubida(null)
    setSubida(0)
    const { promesa, abortar } = subirClase(
      archivo,
      {
        ramoId,
        ramoNombre: ramo.nombre,
        fecha,
        titulo: titulo.trim() || sinExtension(archivo.name),
        modelo,
      },
      setSubida,
    )
    abortarRef.current = abortar
    try {
      const t = await promesa
      marcarTranscriberUsado()
      agregarJobPendiente(t.id)
      setArchivo(null)
      setTitulo('')
      if (archivoRef.current) archivoRef.current.value = ''
      recargar()
    } catch (e) {
      setErrorSubida(
        e instanceof ServicioError ? e.message : 'No se pudo subir el archivo.',
      )
    } finally {
      setSubida(null)
      abortarRef.current = null
    }
  }

  // --- Buscador ---
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<HitBusqueda[] | null>(null)
  const [errorBusqueda, setErrorBusqueda] = useState<string | null>(null)
  // Se vuelve a buscar solo cuando cambia la cantidad de clases ya transcritas
  const nListas = lista?.filter((t) => t.estado === 'listo').length ?? 0
  useEffect(() => {
    const texto = q.trim()
    if (!texto || !svc) {
      setHits(null)
      setErrorBusqueda(null)
      return
    }
    let vivo = true
    const t = setTimeout(async () => {
      try {
        const r = await buscarEnClases(texto, ramoFiltro || undefined)
        if (vivo) {
          setHits(r)
          setErrorBusqueda(null)
        }
      } catch (e) {
        if (vivo)
          setErrorBusqueda(e instanceof ServicioError ? e.message : 'Falló la búsqueda.')
      }
    }, 350)
    return () => {
      vivo = false
      clearTimeout(t)
    }
  }, [q, ramoFiltro, svc, nListas])

  const hitsPorClase = useMemo(() => {
    const m = new Map<string, HitBusqueda[]>()
    for (const h of hits ?? []) {
      const arr = m.get(h.transcripcionId) ?? []
      arr.push(h)
      m.set(h.transcripcionId, arr)
    }
    return [...m.entries()]
  }, [hits])

  const sinRamos = ramos && ramos.length === 0

  return (
    <div className="pb-28">
      <Header titulo="Transcribir clases" />

      <div className="flex flex-col gap-5 px-4 py-4">
        {svc === null &&
          (esDesktop ? (
            arrancando ? (
              <Spinner texto="Iniciando el servicio de transcripción…" />
            ) : (
              <AvisoServicioDesktop onReiniciado={recargarSalud} />
            )
          ) : permiso === 'denied' ? (
            <AvisoPermisoBloqueado />
          ) : (
            <AvisoServicioApagado />
          ))}
        {svc && !svc.ffmpeg && (
          <AvisoError>
            Falta instalar <strong>ffmpeg</strong> en el computador.{' '}
            <a className="underline" href={URL_AYUDA} target="_blank" rel="noreferrer">
              Ver cómo
            </a>
            .
          </AvisoError>
        )}
        {svc?.modoPrueba && (
          <AvisoError>
            El servicio está en <strong>modo de prueba</strong>: genera texto
            falso, no transcribe de verdad.
          </AvisoError>
        )}

        {/* ---- Subir una clase ---- */}
        <section className="card flex flex-col gap-3 p-4">
          <h2 className="font-display text-lg">Subir una clase</h2>

          {sinRamos ? (
            <p className="text-sm text-[var(--color-ink-soft)]">
              Primero crea un ramo para asociar la clase.{' '}
              <Link to="/ramo/nuevo" className="font-medium underline">
                Agregar ramo
              </Link>
            </p>
          ) : (
            <>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">Audio o video</span>
                <input
                  ref={archivoRef}
                  type="file"
                  accept="audio/*,video/*,.mp4,.m4a,.mp3,.wav,.mkv,.mov,.webm"
                  disabled={subida !== null}
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null
                    setArchivo(f)
                    if (f && !titulo) setTitulo(sinExtension(f.name))
                  }}
                  className="text-sm file:mr-3 file:rounded-full file:border-0 file:bg-[var(--color-teal-soft)] file:px-3 file:py-2 file:font-medium file:text-[var(--color-teal)]"
                />
                {archivo && (
                  <span className="text-xs text-[var(--color-ink-soft)]">
                    {archivo.name} · {mb(archivo.size)}
                  </span>
                )}
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">Ramo</span>
                <select
                  value={ramoId}
                  onChange={(e) => setRamoId(e.target.value)}
                  disabled={subida !== null}
                  className="card px-3 py-2.5 text-[16px] outline-none focus:border-[var(--color-teal)]"
                >
                  {ramos?.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.nombre}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium">Fecha de la clase</span>
                  <input
                    type="date"
                    value={fecha}
                    max={hoy()}
                    onChange={(e) => setFecha(e.target.value)}
                    disabled={subida !== null}
                    className="card px-3 py-2.5 text-[16px] outline-none focus:border-[var(--color-teal)]"
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium">Título</span>
                  <input
                    value={titulo}
                    onChange={(e) => setTitulo(e.target.value)}
                    disabled={subida !== null}
                    placeholder="Clase 5"
                    className="card px-3 py-2.5 text-[16px] outline-none focus:border-[var(--color-teal)]"
                  />
                </label>
              </div>

              <fieldset className="flex flex-col gap-1.5">
                <legend className="mb-1 text-sm font-medium">Calidad</legend>
                {(
                  [
                    ['small', 'Rápida', 'Buena para la mayoría de las clases.'],
                    ['medium', 'Mejor calidad', 'Más precisa con términos técnicos, pero bastante más lenta.'],
                  ] as const
                ).map(([valor, nombre, desc]) => (
                  <div key={valor} className="card px-3 py-2.5">
                    <label className="flex cursor-pointer items-start gap-2.5">
                      <input
                        type="radio"
                        name="modelo"
                        checked={modelo === valor}
                        onChange={() => setModelo(valor)}
                        disabled={subida !== null}
                        className="mt-1"
                      />
                      <span className="text-sm">
                        <strong>{nombre}</strong>
                        <span className="block text-xs text-[var(--color-ink-soft)]">
                          {desc}
                        </span>
                      </span>
                    </label>
                    {svc && !svc.modelos[valor] && (
                      <DescargaDeModelo
                        modelo={valor}
                        descarga={svc.descargas?.[valor]}
                        onIniciada={recargarSalud}
                      />
                    )}
                  </div>
                ))}
              </fieldset>

              {errorSubida && <AvisoError>{errorSubida}</AvisoError>}

              {subida !== null ? (
                <div>
                  <BarraProgreso fraccion={subida} />
                  <div className="mt-1.5 flex items-center justify-between text-xs text-[var(--color-ink-soft)]">
                    <span>
                      Copiando al servicio local… {Math.round(subida * 100)}%
                    </span>
                    <button
                      className="font-medium text-[var(--color-amber)]"
                      onClick={() => abortarRef.current?.()}
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  className="btn btn-primary w-full"
                  onClick={transcribir}
                  disabled={!puedeSubir}
                >
                  Transcribir
                </button>
              )}
              <p className="text-xs text-[var(--color-ink-soft)]">
                Todo ocurre en tu computador, sin internet y sin costo. Puedes
                seguir usando la app mientras se procesa.
              </p>
            </>
          )}
        </section>

        {/* ---- Buscador ---- */}
        <section className="flex flex-col gap-2.5">
          <h2 className="font-display text-lg">Buscar en las clases</h2>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Ej: generador, alias…"
            className="card w-full px-3 py-2.5 text-[16px] outline-none focus:border-[var(--color-teal)]"
          />
          {errorBusqueda && <AvisoError>{errorBusqueda}</AvisoError>}
          {hits && hitsPorClase.length === 0 && (
            <p className="px-1 text-sm text-[var(--color-ink-soft)]">
              Nada con ese término{ramoFiltro ? ' en este ramo' : ''}.
            </p>
          )}
          {hitsPorClase.map(([id, arr]) => (
            <div key={id} className="card px-4 py-3">
              <p className="font-display leading-snug">{arr[0].titulo}</p>
              <p className="mb-1.5 text-xs text-[var(--color-ink-soft)]">
                {nombreDe.get(arr[0].ramoId) ?? arr[0].ramoNombre} ·{' '}
                {fechaLarga(arr[0].fechaClase)} · {arr.length}{' '}
                {arr.length === 1 ? 'coincidencia' : 'coincidencias'}
              </p>
              <ul className="flex flex-col gap-1">
                {arr.slice(0, 6).map((h, i) => (
                  <li key={i}>
                    <Link
                      to={`/transcripcion/${id}?t=${Math.floor(h.inicio)}&q=${encodeURIComponent(q.trim())}`}
                      className="flex gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-[var(--color-bg)]"
                    >
                      <span className="shrink-0 font-medium tabular-nums text-[var(--color-teal)]">
                        {fmtTiempo(h.inicio)}
                      </span>
                      <span className="text-[var(--color-ink-soft)]">
                        <Resaltado texto={h.texto} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              {arr.length > 6 && (
                <Link
                  to={`/transcripcion/${id}?q=${encodeURIComponent(q.trim())}`}
                  className="mt-1 inline-block px-2 text-xs font-medium text-[var(--color-teal)]"
                >
                  Ver las {arr.length} coincidencias
                </Link>
              )}
            </div>
          ))}
        </section>

        {/* ---- Lista de transcripciones ---- */}
        <section className="flex flex-col gap-3">
          <h2 className="font-display text-lg">Tus transcripciones</h2>

          {ramos && ramos.length > 1 && (
            <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
              <ChipFiltro activo={!ramoFiltro} onClick={() => setParams({})}>
                Todos
              </ChipFiltro>
              {ramos.map((r) => (
                <ChipFiltro
                  key={r.id}
                  activo={ramoFiltro === r.id}
                  onClick={() => setParams({ ramo: r.id })}
                >
                  {r.nombre}
                </ChipFiltro>
              ))}
            </div>
          )}

          {svc === null && !lista && (
            <p className="text-sm text-[var(--color-ink-soft)]">
              Cuando el servicio esté abierto, aquí aparecen tus clases.
            </p>
          )}
          {lista && lista.length === 0 && (
            <p className="py-4 text-center text-sm text-[var(--color-ink-soft)]">
              Todavía no hay transcripciones{ramoFiltro ? ' en este ramo' : ''}.
            </p>
          )}
          {lista?.map((t) => (
            <TarjetaTranscripcion
              key={t.id}
              t={t}
              nombreRamo={nombreDe.get(t.ramoId) ?? t.ramoNombre}
              onCancelar={() => void cancelar(t.id).then(recargar)}
            />
          ))}
        </section>
      </div>
    </div>
  )
}

function ChipFiltro({
  activo,
  onClick,
  children,
}: {
  activo: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-full border px-3 py-1 text-sm font-medium transition-colors ${
        activo
          ? 'border-[var(--color-navy)] bg-[var(--color-navy)] text-white'
          : 'border-[var(--color-line)] bg-[var(--color-surface)] text-[var(--color-ink-soft)]'
      }`}
    >
      {children}
    </button>
  )
}

/** Botón + barra para bajar un modelo de Whisper (solo la primera vez). */
function DescargaDeModelo({
  modelo,
  descarga,
  onIniciada,
}: {
  modelo: ModeloWhisper
  descarga?: DescargaModelo
  onIniciada: () => void
}) {
  const [error, setError] = useState<string | null>(null)
  const bajando = descarga?.estado === 'descargando'
  const peso = modelo === 'small' ? '~0,5 GB' : '~1,5 GB'

  async function iniciar() {
    setError(null)
    try {
      await descargarModelo(modelo)
      onIniciada()
    } catch (e) {
      setError(e instanceof ServicioError ? e.message : 'No se pudo iniciar la descarga.')
    }
  }

  return (
    <div className="mt-2 rounded-lg bg-[var(--color-amber-soft)] px-3 py-2 text-xs">
      {bajando ? (
        <>
          <BarraProgreso fraccion={descarga?.progreso ?? 0} />
          <p className="mt-1 text-[var(--color-ink-soft)]">
            Descargando… {Math.round((descarga?.progreso ?? 0) * 100)}%. Puedes
            seguir usando la app; solo se hace una vez.
          </p>
        </>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <span className="text-[var(--color-ink)]">
            Este modelo todavía no está en tu computador.
          </span>
          <button className="btn btn-ghost !px-3 !py-1.5 !text-xs" onClick={iniciar}>
            Descargar ({peso})
          </button>
        </div>
      )}
      {(error || descarga?.estado === 'error') && (
        <p className="mt-1 text-[var(--color-amber)]">{error ?? descarga?.error}</p>
      )}
      {!bajando && (
        <p className="mt-1 text-[var(--color-ink-soft)]">
          Necesita internet solo esta vez; después funciona sin conexión.
        </p>
      )}
    </div>
  )
}

/** App de escritorio: el servicio no responde (lo arranca la propia app). */
function AvisoServicioDesktop({ onReiniciado }: { onReiniciado: () => void }) {
  const [reiniciando, setReiniciando] = useState(false)
  return (
    <div className="card animate-in border-[var(--color-amber)] bg-[var(--color-amber-soft)] p-4 text-sm">
      <p className="font-semibold">El servicio de transcripción no está respondiendo</p>
      <p className="mt-1 text-[var(--color-ink)]">
        Es la parte de LEEN STUDIE que convierte la clase en texto. Prueba
        reiniciarla; si sigue igual, cierra y vuelve a abrir la aplicación.
      </p>
      <button
        className="btn btn-primary mt-3"
        disabled={reiniciando}
        onClick={async () => {
          setReiniciando(true)
          await desktop?.reiniciarServicio()
          setReiniciando(false)
          onReiniciado()
        }}
      >
        {reiniciando ? 'Reiniciando…' : 'Reiniciar el servicio'}
      </button>
    </div>
  )
}

function AvisoPermisoBloqueado() {
  return (
    <div className="card animate-in border-[var(--color-amber)] bg-[var(--color-amber-soft)] p-4 text-sm">
      <p className="font-semibold">El navegador está bloqueando la conexión</p>
      <p className="mt-1 text-[var(--color-ink)]">
        Para hablar con el servicio de transcripción (que corre en tu propio
        computador), Chrome o Edge necesitan tu permiso. Haz clic en el candado
        (o en el ícono de ajustes) junto a la dirección de la página →{' '}
        <strong>Configuración del sitio</strong> → busca{' '}
        <strong>Acceso a la red local</strong> (o <em>Aplicaciones y servicios
        en este dispositivo</em>) → <strong>Permitir</strong>. Después recarga la
        página.
      </p>
      <p className="mt-2 text-xs text-[var(--color-ink-soft)]">
        Si sigue sin funcionar, asegúrate de que <code>iniciar.bat</code> esté
        abierto.{' '}
        <a className="underline" href={URL_AYUDA} target="_blank" rel="noreferrer">
          Guía de instalación
        </a>
      </p>
    </div>
  )
}

function AvisoServicioApagado() {
  return (
    <div className="card animate-in border-[var(--color-amber)] bg-[var(--color-amber-soft)] p-4 text-sm">
      <p className="font-semibold">El servicio de transcripción no está abierto</p>
      <p className="mt-1 text-[var(--color-ink)]">
        Esta función corre en tu computador (no en la nube). Abre la carpeta{' '}
        <code>transcriber</code> y haz doble clic en <code>iniciar.bat</code>;
        deja esa ventana abierta. Si es la primera vez, antes ejecuta{' '}
        <code>instalar.bat</code>.
      </p>
      <p className="mt-2 text-xs text-[var(--color-ink-soft)]">
        Si Chrome pregunta por conectarse a dispositivos de la red local, di que
        sí: es tu propio computador.{' '}
        <a className="underline" href={URL_AYUDA} target="_blank" rel="noreferrer">
          Guía de instalación
        </a>
      </p>
    </div>
  )
}
