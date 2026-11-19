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

// --- Transcripción de clases (servicio local) ---------------------------------

export type EstadoTrabajo =
  | 'en_cola'
  | 'extrayendo'
  | 'transcribiendo'
  | 'listo'
  | 'error'
  | 'cancelado'

export type ModeloWhisper = 'small' | 'medium'

export interface Transcripcion {
  id: string
  titulo: string
  ramoId: string
  ramoNombre: string
  /** AAAA-MM-DD */
  fechaClase: string
  archivoOriginal: string
  esVideo: boolean
  modelo: ModeloWhisper
  /** Segundos. Null hasta que el servicio lee el archivo. */
  duracion: number | null
  estado: EstadoTrabajo
  /** 0 a 1 */
  progreso: number
  /** Segundos restantes estimados; null = todavía calculando. */
  etaSeg: number | null
  error: string | null
  creada: number
  terminada: number | null
}

export interface Segmento {
  idx: number
  inicio: number
  fin: number
  texto: string
}

export interface HitBusqueda {
  transcripcionId: string
  titulo: string
  ramoId: string
  ramoNombre: string
  fechaClase: string
  /** Segundos donde aparece la coincidencia. */
  inicio: number
  /** Texto con la coincidencia entre \u0001 y \u0002. */
  texto: string
}

export interface DescargaModelo {
  estado: 'listo' | 'descargando' | 'falta' | 'error'
  /** 0 a 1 */
  progreso: number
  error: string | null
}

export interface SaludServicio {
  ok: true
  version: string
  ffmpeg: boolean
  modelos: Record<ModeloWhisper, boolean>
  descargas: Record<ModeloWhisper, DescargaModelo>
  busquedaRapida: boolean
  modoPrueba: boolean
}

export interface PreguntaRepaso {
  fichaId: string
  ramo: string
  titulo: string
  pregunta: string
  respuestaEsperada: string
}
