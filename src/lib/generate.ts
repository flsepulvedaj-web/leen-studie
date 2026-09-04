import { getApiUrl, getAccessCode } from './settings'
import type {
  FichaContenido,
  Ejercicio,
  Correccion,
  Ficha,
  PreguntaRepaso,
} from './types'

export class GenError extends Error {
  constructor(
    message: string,
    public sinConexion = false,
  ) {
    super(message)
  }
}

async function post<T>(ruta: string, body: unknown): Promise<T> {
  const base = getApiUrl()
  if (!base) {
    throw new GenError(
      'Falta configurar la app. Anda a Ajustes y pega la dirección del servidor.',
    )
  }

  let res: Response
  try {
    res = await fetch(base + ruta, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-leen-key': getAccessCode(),
      },
      body: JSON.stringify(body),
    })
  } catch {
    throw new GenError(
      'No se pudo conectar. Revisa tu internet — lo que ya guardaste igual lo puedes leer sin conexión.',
      true,
    )
  }

  if (res.status === 401 || res.status === 403) {
    throw new GenError('El código de acceso no es válido. Revísalo en Ajustes.')
  }
  if (!res.ok) {
    let detalle = ''
    try {
      detalle = (await res.json())?.error ?? ''
    } catch {
      /* sin cuerpo */
    }
    throw new GenError(
      detalle ||
        `El servidor respondió con un error (${res.status}). Prueba de nuevo en un rato.`,
    )
  }

  return (await res.json()) as T
}

export function generarFicha(
  ramo: string,
  contexto: string,
  consulta: string,
) {
  return post<FichaContenido>('/ficha', { ramo, contexto, consulta })
}

export function explicarMasSimple(ficha: Ficha, intento: number) {
  return post<{ texto: string }>('/simple', {
    titulo: ficha.titulo,
    ideaCentral: ficha.ideaCentral,
    enCriollo: ficha.enCriollo,
    ramo: ficha.ramoNombre,
    intento,
  })
}

export function seguirPreguntando(
  ficha: Ficha,
  contexto: string,
  pregunta: string,
) {
  return post<{ respuesta: string }>('/seguir', {
    titulo: ficha.titulo,
    ideaCentral: ficha.ideaCentral,
    formaFormal: ficha.formaFormal,
    enCriollo: ficha.enCriollo,
    ramo: ficha.ramoNombre,
    contexto,
    previos: ficha.seguimientos,
    pregunta,
  })
}

export function generarEjercicio(
  ficha: Ficha,
  contexto: string,
  dificultad: 1 | 2 | 3,
  previos: string[],
) {
  return post<Ejercicio>('/ejercicio', {
    titulo: ficha.titulo,
    ideaCentral: ficha.ideaCentral,
    formaFormal: ficha.formaFormal,
    ramo: ficha.ramoNombre,
    contexto,
    dificultad,
    previos,
  })
}

export function corregirRespuesta(
  ficha: Ficha,
  contexto: string,
  enunciado: string,
  respuesta: string,
) {
  return post<Correccion>('/correccion', {
    titulo: ficha.titulo,
    ideaCentral: ficha.ideaCentral,
    formaFormal: ficha.formaFormal,
    ramo: ficha.ramoNombre,
    contexto,
    enunciado,
    respuesta,
  })
}

export function generarPreguntasRepaso(
  fichas: { id: string; ramo: string; titulo: string; ideaCentral: string }[],
) {
  return post<{ preguntas: PreguntaRepaso[] }>('/repaso', { fichas })
}
