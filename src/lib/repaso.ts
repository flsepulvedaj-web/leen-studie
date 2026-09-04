import { db } from './db'
import type { Ficha } from './types'

const DIA = 86_400_000

/**
 * Elige hasta `n` fichas para repasar. Prioriza:
 *  1. Las marcadas "me cuesta".
 *  2. Dentro de esas, las que hace más tiempo no se repasan (o nunca).
 *  3. Penaliza levemente las que se respondieron bien hace poco.
 */
export async function elegirFichasRepaso(n = 5): Promise<Ficha[]> {
  const dificiles = await db.fichas
    .where('estado')
    .equals('me_cuesta')
    .toArray()
  if (dificiles.length === 0) return []

  const logs = await db.repasoLog.toArray()
  const porFicha = new Map<string, { ultima: number; aciertoReciente: boolean }>()
  for (const l of logs) {
    const prev = porFicha.get(l.fichaId)
    if (!prev || l.fecha > prev.ultima) {
      porFicha.set(l.fichaId, { ultima: l.fecha, aciertoReciente: l.acerto })
    }
  }

  const ahora = Date.now()
  return dificiles
    .map((f) => {
      const r = porFicha.get(f.id)
      const diasSinRepasar = r ? (ahora - r.ultima) / DIA : 999
      let score = diasSinRepasar
      if (r?.aciertoReciente && diasSinRepasar < 3) score -= 5
      return { f, score }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
    .map((x) => x.f)
}
