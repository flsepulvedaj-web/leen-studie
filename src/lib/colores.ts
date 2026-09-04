/** Paleta para las tarjetas de ramo. Índice 0-5. */
export const RAMO_COLORES = [
  { bg: '#e5edf3', fg: '#1c3f5f' }, // navy
  { bg: '#e2f1f3', fg: '#276b76' }, // teal
  { bg: '#fbeede', fg: '#b06a1c' }, // amber
  { bg: '#e6f1ec', fg: '#3f8f6b' }, // green
  { bg: '#eee7f2', fg: '#6d4d8e' }, // plum
  { bg: '#f7e6e6', fg: '#a34a4a' }, // clay
]

export function colorRamo(i: number) {
  return RAMO_COLORES[((i % RAMO_COLORES.length) + RAMO_COLORES.length) % RAMO_COLORES.length]
}
