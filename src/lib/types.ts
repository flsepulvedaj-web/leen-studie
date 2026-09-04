export type Estado = 'sin_marcar' | 'entendido' | 'me_cuesta'

export interface GlosarioItem {
  termino: string
  definicion: string
}

export interface Ramo {
  id: string
  nombre: string
  /** Nota de contexto para afinar las respuestas: en qué unidad va, qué notación usa la profe, etc. */
  contexto: string
  /** Índice de color (0-5) para la tarjeta. */
  color: number
  creado: number
}

/** El contenido estructurado de una ficha, tal como lo devuelve el modelo. */
export interface FichaContenido {
  titulo: string
  ideaCentral: string
  formaFormal: string
  formaFormalEsFormula: boolean
  enCriollo: string
  glosario: GlosarioItem[]
  ojoConEsto: string
}

/** Un turno de conversación de seguimiento sobre una ficha. */
export interface Seguimiento {
  pregunta: string
  respuesta: string
}

export interface Ficha extends FichaContenido {
  id: string
  ramoId: string
  ramoNombre: string
  estado: Estado
  creada: number
  actualizada: number
  /** Texto original que la alumna escribió o pegó. */
  consulta: string
  /** Versiones "más simples" pedidas después. */
  simplificaciones: string[]
  /** Repreguntas y sus respuestas. */
  seguimientos: Seguimiento[]
}

export type Veredicto = 'correcto' | 'parcial' | 'incorrecto'

export interface Ejercicio {
  enunciado: string
  dificultad: 1 | 2 | 3
}

export interface Correccion {
  veredicto: Veredicto
  dondeSeTorcio: string
  explicacion: string
  problemaSimilar: string | null
}

export interface PreguntaRepaso {
  fichaId: string
  ramo: string
  titulo: string
  pregunta: string
  respuestaEsperada: string
}
