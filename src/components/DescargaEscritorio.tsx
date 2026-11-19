import { useEffect, useState } from 'react'
import { esDesktop } from '../lib/desktop'

const REPO = 'flsepulvedaj-web/leen-studie'
const PAGINA_RELEASES = `https://github.com/${REPO}/releases/latest`
const CLAVE_OCULTO = 'leen-descarga-oculta'

interface Instalador {
  url: string
  version: string
  mb: number
}

function esWindowsDeEscritorio(): boolean {
  const ua = navigator.userAgent
  return /Windows/i.test(ua) && !/Mobile|Android/i.test(ua)
}

/** Busca el instalador de la última versión publicada (siempre el más nuevo). */
async function buscarInstalador(): Promise<Instalador | null> {
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json' },
    })
    if (!r.ok) return null
    const d = (await r.json()) as {
      tag_name: string
      assets: { name: string; browser_download_url: string; size: number }[]
    }
    const exe = d.assets.find((a) => /Setup.*\.exe$/i.test(a.name))
    if (!exe) return null
    return {
      url: exe.browser_download_url,
      version: d.tag_name.replace(/^v/, ''),
      mb: Math.round(exe.size / 1024 / 1024),
    }
  } catch {
    return null
  }
}

/**
 * Botón para bajar la app de escritorio (la que transcribe clases).
 * No aparece dentro de la propia app de escritorio. `compacto` es la tarjeta
 * de la pantalla principal (se puede cerrar); la versión completa va en Ajustes.
 */
export default function DescargaEscritorio({ compacto = false }: { compacto?: boolean }) {
  const [inst, setInst] = useState<Instalador | null>(null)
  const [oculto, setOculto] = useState(() => {
    try {
      return compacto && localStorage.getItem(CLAVE_OCULTO) === '1'
    } catch {
      return false
    }
  })

  useEffect(() => {
    if (esDesktop || oculto) return
    let vivo = true
    void buscarInstalador().then((i) => vivo && setInst(i))
    return () => {
      vivo = false
    }
  }, [oculto])

  if (esDesktop || oculto) return null

  const windows = esWindowsDeEscritorio()
  // En el celular no sirve: solo se muestra la explicación en Ajustes.
  if (compacto && !windows) return null

  function cerrar() {
    setOculto(true)
    try {
      localStorage.setItem(CLAVE_OCULTO, '1')
    } catch {
      /* sin almacenamiento: solo se oculta ahora */
    }
  }

  const href = inst?.url ?? PAGINA_RELEASES

  return (
    <section className="card flex flex-col gap-2 bg-[var(--color-amber-soft)] px-4 py-3 text-sm">
      <div className="flex items-start gap-2">
        <span aria-hidden className="text-lg leading-none">
          💻
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">
            Instala LEEN STUDIE en tu computador y podrás transcribir clases 🎉
          </p>
          <p className="mt-0.5 text-[var(--color-ink-soft)]">
            Sube tus clases de Zoom, audios o videos y quedan escritas, sin internet y
            sin costo. Se instala una vez y se actualiza sola.
          </p>
        </div>
        {compacto && (
          <button
            type="button"
            onClick={cerrar}
            aria-label="Cerrar"
            className="-mr-1 -mt-1 px-2 py-1 text-[var(--color-ink-soft)]"
          >
            ✕
          </button>
        )}
      </div>

      <a
        href={href}
        className="rounded-xl bg-[var(--color-navy)] px-4 py-2.5 text-center font-semibold text-white"
      >
        Descargar para Windows{inst ? ` (${inst.mb} MB)` : ''}
      </a>

      {!compacto && (
        <p className="text-xs text-[var(--color-ink-soft)]">
          {windows
            ? 'Al abrirlo, si Windows dice "Windows protegió su PC", toca "Más información" y luego "Ejecutar de todas formas". Es normal en programas nuevos.'
            : 'Es para computadores con Windows: ábrela desde el PC para descargarla.'}
          {inst ? ` Versión ${inst.version}.` : ''}
        </p>
      )}
    </section>
  )
}
