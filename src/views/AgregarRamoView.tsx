import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, crearRamo, actualizarRamo, borrarRamo } from '../lib/db'
import Header from '../components/Header'
import { Spinner } from '../components/ui'

export default function AgregarRamoView() {
  const nav = useNavigate()
  const { id } = useParams()
  const editando = Boolean(id)
  const ramo = useLiveQuery(
    () => (id ? db.ramos.get(id) : undefined),
    [id],
    undefined,
  )

  const [nombre, setNombre] = useState('')
  const [contexto, setContexto] = useState('')

  useEffect(() => {
    if (ramo) {
      setNombre(ramo.nombre)
      setContexto(ramo.contexto)
    }
  }, [ramo])

  if (editando && ramo === undefined) return <Spinner />

  async function guardar() {
    if (!nombre.trim()) return
    if (editando && id) {
      await actualizarRamo(id, { nombre: nombre.trim(), contexto: contexto.trim() })
      nav(`/ramo/${id}`, { replace: true })
    } else {
      const nuevoId = await crearRamo(nombre, contexto)
      nav(`/ramo/${nuevoId}`, { replace: true })
    }
  }

  return (
    <div>
      <Header titulo={editando ? 'Editar ramo' : 'Nuevo ramo'} volver />
      <div className="flex flex-col gap-4 px-4 py-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Nombre del ramo</span>
          <input
            autoFocus={!editando}
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ej: Termodinámica"
            className="card px-3 py-2.5 text-[16px] outline-none focus:border-[var(--color-teal)]"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">
            ¿En qué van? <span className="text-[var(--color-ink-soft)]">(opcional)</span>
          </span>
          <textarea
            value={contexto}
            onChange={(e) => setContexto(e.target.value)}
            rows={4}
            placeholder="Ej: vamos en la 1ª ley y sistemas cerrados. La profe parte todo desde balances de energía."
            className="card resize-none px-3 py-2.5 text-[16px] leading-relaxed outline-none focus:border-[var(--color-teal)]"
          />
          <span className="text-xs text-[var(--color-ink-soft)]">
            Esto ayuda a que las respuestas vayan al nivel del curso. Lo puedes
            cambiar cuando quieras.
          </span>
        </label>

        <button
          className="btn btn-primary w-full"
          onClick={guardar}
          disabled={!nombre.trim()}
        >
          {editando ? 'Guardar cambios' : 'Crear ramo'}
        </button>

        {editando && id && (
          <button
            className="btn btn-line !text-[var(--color-amber)]"
            onClick={async () => {
              if (
                confirm(
                  '¿Borrar este ramo y todas sus fichas? No se puede deshacer.',
                )
              ) {
                await borrarRamo(id)
                nav('/', { replace: true })
              }
            }}
          >
            Borrar ramo
          </button>
        )}
      </div>
    </div>
  )
}
