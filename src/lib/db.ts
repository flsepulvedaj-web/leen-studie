import Dexie, { type Table } from 'dexie'
import type { Ficha, FichaContenido, Estado, Ramo, Seguimiento } from './types'

export interface RepasoLog {
  id?: number
  fichaId: string
  fecha: number
  acerto: boolean
}

class LeenDB extends Dexie {
  ramos!: Table<Ramo, string>
  fichas!: Table<Ficha, string>
  repasoLog!: Table<RepasoLog, number>

  constructor() {
    super('leen-studie')

    // v1: modelo viejo (ficha.ramo string, sin tabla de ramos)
    this.version(1).stores({
      fichas: 'id, ramo, estado, actualizada, creada',
      repasoLog: '++id, fichaId, fecha',
    })

    // v2: ramos como entidad propia
    this.version(2)
      .stores({
        ramos: 'id, nombre, creado',
        fichas: 'id, ramoId, estado, actualizada, creada',
        repasoLog: '++id, fichaId, fecha',
      })
      .upgrade(async (tx) => {
        const fichas = await tx.table('fichas').toArray()
        const porNombre = new Map<string, string>()
        let i = 0
        for (const f of fichas) {
          const nombre: string = f.ramo || 'Sin ramo'
          let ramoId = porNombre.get(nombre)
          if (!ramoId) {
            ramoId = uid()
            porNombre.set(nombre, ramoId)
            await tx.table('ramos').add({
              id: ramoId,
              nombre,
              contexto: '',
              color: i++ % 6,
              creado: Date.now(),
            })
          }
          await tx.table('fichas').update(f.id, {
            ramoId,
            ramoNombre: nombre,
            seguimientos: f.seguimientos ?? [],
          })
        }
      })
  }
}

export const db = new LeenDB()

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

// --- Ramos ---

export async function crearRamo(
  nombre: string,
  contexto: string,
): Promise<string> {
  const n = await db.ramos.count()
  const ramo: Ramo = {
    id: uid(),
    nombre: nombre.trim() || 'Sin nombre',
    contexto: contexto.trim(),
    color: n % 6,
    creado: Date.now(),
  }
  await db.ramos.add(ramo)
  return ramo.id
}

export async function actualizarRamo(
  id: string,
  cambios: { nombre?: string; contexto?: string },
) {
  await db.ramos.update(id, cambios)
  if (cambios.nombre) {
    const fichas = await db.fichas.where('ramoId').equals(id).toArray()
    await Promise.all(
      fichas.map((f) => db.fichas.update(f.id, { ramoNombre: cambios.nombre! })),
    )
  }
}

export async function borrarRamo(id: string) {
  const fichas = await db.fichas.where('ramoId').equals(id).toArray()
  await Promise.all(fichas.map((f) => borrarFicha(f.id)))
  await db.ramos.delete(id)
}

// --- Fichas ---

export async function crearFicha(
  ramo: Ramo,
  consulta: string,
  contenido: FichaContenido,
): Promise<string> {
  const now = Date.now()
  const ficha: Ficha = {
    ...contenido,
    id: uid(),
    ramoId: ramo.id,
    ramoNombre: ramo.nombre,
    estado: 'sin_marcar',
    consulta,
    simplificaciones: [],
    seguimientos: [],
    creada: now,
    actualizada: now,
  }
  await db.fichas.add(ficha)
  return ficha.id
}

export async function marcarEstado(id: string, estado: Estado) {
  await db.fichas.update(id, { estado, actualizada: Date.now() })
}

export async function agregarSimplificacion(id: string, texto: string) {
  const f = await db.fichas.get(id)
  if (!f) return
  await db.fichas.update(id, {
    simplificaciones: [...f.simplificaciones, texto],
    actualizada: Date.now(),
  })
}

export async function agregarSeguimiento(id: string, s: Seguimiento) {
  const f = await db.fichas.get(id)
  if (!f) return
  await db.fichas.update(id, {
    seguimientos: [...(f.seguimientos ?? []), s],
    actualizada: Date.now(),
  })
}

export async function borrarFicha(id: string) {
  await db.fichas.delete(id)
  await db.repasoLog.where('fichaId').equals(id).delete()
}

export async function registrarRepaso(fichaId: string, acerto: boolean) {
  await db.repasoLog.add({ fichaId, fecha: Date.now(), acerto })
}
