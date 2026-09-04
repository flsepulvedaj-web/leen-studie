import type { Ficha } from './types'

function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
}

/** Busca el término en título, consulta, idea central, criollo y glosario. */
export function buscarFichas(fichas: Ficha[], query: string): Ficha[] {
  const q = normalizar(query).trim()
  if (!q) return fichas
  const terminos = q.split(/\s+/)

  return fichas
    .map((f) => {
      const heno = normalizar(
        [
          f.titulo,
          f.consulta,
          f.ideaCentral,
          f.enCriollo,
          f.ramoNombre,
          ...f.glosario.map((g) => `${g.termino} ${g.definicion}`),
        ].join(' \n '),
      )
      let puntaje = 0
      for (const t of terminos) {
        if (!heno.includes(t)) return { f, puntaje: -1 }
        puntaje += heno.split(t).length - 1
        if (normalizar(f.titulo).includes(t)) puntaje += 5
      }
      return { f, puntaje }
    })
    .filter((x) => x.puntaje >= 0)
    .sort((a, b) => b.puntaje - a.puntaje)
    .map((x) => x.f)
}
