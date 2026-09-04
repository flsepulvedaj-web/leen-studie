import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import {
  getApiUrl,
  setApiUrl,
  getAccessCode,
  setAccessCode,
} from '../lib/settings'
import type { Ficha, Ramo } from '../lib/types'
import Header from '../components/Header'

export default function AjustesView() {
  const total = useLiveQuery(() => db.fichas.count(), [], undefined)
  const [url, setUrl] = useState(getApiUrl())
  const [code, setCode] = useState(getAccessCode())
  const [guardado, setGuardado] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  function guardar() {
    setApiUrl(url)
    setAccessCode(code)
    setGuardado(true)
    setTimeout(() => setGuardado(false), 1800)
  }

  async function exportar() {
    const ramos = await db.ramos.toArray()
    const fichas = await db.fichas.toArray()
    const logs = await db.repasoLog.toArray()
    const blob = new Blob(
      [JSON.stringify({ version: 2, ramos, fichas, logs }, null, 2)],
      { type: 'application/json' },
    )
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `leen-studie-respaldo-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  async function importar(file: File) {
    try {
      const data = JSON.parse(await file.text())
      const fichas: Ficha[] = data.fichas ?? []
      const ramos: Ramo[] = data.ramos ?? []
      if (!Array.isArray(fichas) || fichas.length === 0) {
        alert('El archivo no tiene fichas.')
        return
      }
      if (ramos.length) await db.ramos.bulkPut(ramos)
      await db.fichas.bulkPut(fichas)
      if (Array.isArray(data.logs)) {
        await db.repasoLog.bulkAdd(
          data.logs.map((l: { id?: number }) => {
            const { id: _omit, ...rest } = l
            void _omit
            return rest
          }),
        )
      }
      alert(`Listo: ${fichas.length} fichas importadas.`)
    } catch {
      alert('No se pudo leer el archivo.')
    }
  }

  return (
    <div className="pb-24">
      <Header titulo="Ajustes" />

      <div className="flex flex-col gap-6 px-4 py-4">
        <section className="flex flex-col gap-3">
          <h2 className="font-display text-lg">Servidor</h2>
          <p className="text-sm text-[var(--color-ink-soft)]">
            La app usa un servidor propio para generar las fichas con IA. Pega
            aquí la dirección que te pasó quien lo instaló.
          </p>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Dirección del servidor</span>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…workers.dev"
              autoCapitalize="off"
              autoCorrect="off"
              className="card px-3 py-2.5 text-[16px] outline-none focus:border-[var(--color-teal)]"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Código de acceso</span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="El código que te dieron"
              autoCapitalize="off"
              autoCorrect="off"
              className="card px-3 py-2.5 text-[16px] outline-none focus:border-[var(--color-teal)]"
            />
          </label>
          <button className="btn btn-primary" onClick={guardar}>
            {guardado ? 'Guardado ✓' : 'Guardar'}
          </button>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="font-display text-lg">Tus datos</h2>
          <p className="text-sm text-[var(--color-ink-soft)]">
            {total ?? 0} fichas guardadas en este dispositivo. No se suben a
            ningún lado. Haz un respaldo antes de cambiar de teléfono.
          </p>
          <div className="flex gap-2">
            <button className="btn btn-line flex-1" onClick={exportar}>
              Exportar respaldo
            </button>
            <button
              className="btn btn-line flex-1"
              onClick={() => fileRef.current?.click()}
            >
              Importar
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void importar(f)
              e.target.value = ''
            }}
          />
          <button
            className="btn btn-line !text-[var(--color-amber)]"
            onClick={async () => {
              if (
                confirm(
                  '¿Borrar TODOS los ramos y fichas de este dispositivo? Haz un respaldo primero.',
                )
              ) {
                await db.ramos.clear()
                await db.fichas.clear()
                await db.repasoLog.clear()
              }
            }}
          >
            Borrar todo
          </button>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="font-display text-lg">Cómo funciona</h2>
          <p className="text-sm text-[var(--color-ink-soft)]">
            Para crear o simplificar fichas y para los ejercicios se necesita
            internet. Todo lo que ya guardaste se lee sin conexión.
          </p>
        </section>
      </div>
    </div>
  )
}
