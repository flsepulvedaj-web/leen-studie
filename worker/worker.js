/**
 * LEEN STUDIE — backend (Cloudflare Worker)
 *
 * Único punto que habla con la API de Anthropic. Guarda la API key fuera del
 * teléfono y arma los prompts con el formato fijo de la app.
 *
 * Variables de entorno (Settings → Variables and Secrets en el panel de Cloudflare):
 *   ANTHROPIC_API_KEY  (Secret)  — la key de la cuenta de Anthropic
 *   ACCESS_CODE        (Text)    — código que la app manda en el header x-leen-key
 *   MODEL              (Text, opcional) — por defecto "claude-sonnet-5"
 */

const DEFAULT_MODEL = 'claude-sonnet-5'
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_VERSION = '2023-06-01'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, x-leen-key',
  'Access-Control-Max-Age': '86400',
}

const PERFIL_ALUMNA = `
Estás ayudando a una estudiante de primer año de Ingeniería Civil Química en la
USACH (Chile). Ramos típicos: Cálculo, Álgebra, Química General, Física, y más
adelante Termodinámica, Balances de Masa y Energía, Fenómenos de Transporte.
Escribe en español de Chile, cercano pero no infantil. Trátala de "tú".
`.trim()

const REGLAS_FORMATO = `
Reglas de forma (obligatorias):
- Bloques cortos, mucho aire. Nada de párrafos largos.
- Toda la ficha tiene que caber en una pantalla y media de celular. Si te estás
  extendiendo, corta.
- Las fórmulas van en LaTeX: $...$ dentro de una frase, $$...$$ para una fórmula
  destacada. Define cada símbolo que uses.
- No uses un término técnico sin que aparezca en el glosario.
`.trim()

// --- Esquemas de herramienta (fuerzan JSON estructurado) ---

const TOOL_FICHA = {
  name: 'entregar_ficha',
  description: 'Entrega la ficha de estudio con el formato fijo de la app.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      titulo: {
        type: 'string',
        description: 'Título corto del tema (3-6 palabras).',
      },
      ideaCentral: {
        type: 'string',
        description:
          '2 o 3 frases. SIN fórmulas y sin usar jerga que no se explique. Qué es y para qué sirve.',
      },
      formaFormalEsFormula: {
        type: 'boolean',
        description: 'true si el tema tiene una fórmula central; false si es un concepto/definición formal.',
      },
      formaFormal: {
        type: 'string',
        description:
          'Si hay fórmula: la fórmula en $$...$$ y debajo, en lista corta, qué es cada símbolo con sus unidades. Si es un concepto: el enunciado formal preciso, en 1-3 frases. Markdown permitido.',
      },
      enCriollo: {
        type: 'string',
        description:
          'La misma idea explicada con UNA analogía concreta y cotidiana. Máximo 4 frases.',
      },
      glosario: {
        type: 'array',
        description:
          'TODOS los términos técnicos que aparecieron en los bloques anteriores. Es el corazón de la ficha: no omitas ninguno.',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            termino: { type: 'string' },
            definicion: {
              type: 'string',
              description: '1 o 2 líneas, en criollo pero precisas.',
            },
          },
          required: ['termino', 'definicion'],
        },
      },
      ojoConEsto: {
        type: 'string',
        description:
          'El error más común que cometen los estudiantes con este tema: confusión de signo, de unidades, de supuestos. Concreto, con el caso puntual.',
      },
    },
    required: [
      'titulo',
      'ideaCentral',
      'formaFormalEsFormula',
      'formaFormal',
      'enCriollo',
      'glosario',
      'ojoConEsto',
    ],
  },
}

const TOOL_SEGUIR = {
  name: 'entregar_respuesta',
  description: 'Responde la repregunta de la alumna sobre el tema de la ficha.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      respuesta: {
        type: 'string',
        description:
          'Respuesta directa a la repregunta. Bloques cortos, mucho aire. Máximo 6 frases. Markdown y LaTeX permitidos.',
      },
    },
    required: ['respuesta'],
  },
}

const TOOL_SIMPLE = {
  name: 'entregar_explicacion',
  description: 'Entrega una explicación aún más simple del mismo tema.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      texto: {
        type: 'string',
        description:
          'Explicación más simple, con una analogía DISTINTA a la anterior. Máximo 5 frases cortas. Markdown y LaTeX permitidos.',
      },
    },
    required: ['texto'],
  },
}

const TOOL_EJERCICIO = {
  name: 'entregar_ejercicio',
  description: 'Entrega UN ejercicio.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      enunciado: {
        type: 'string',
        description:
          'Un solo ejercicio, con datos numéricos realistas y unidades. Markdown y LaTeX permitidos. NO incluyas la solución.',
      },
      dificultad: { type: 'integer', enum: [1, 2, 3] },
    },
    required: ['enunciado', 'dificultad'],
  },
}

const TOOL_CORRECCION = {
  name: 'entregar_correccion',
  description: 'Corrige la respuesta de la alumna.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      veredicto: { type: 'string', enum: ['correcto', 'parcial', 'incorrecto'] },
      dondeSeTorcio: {
        type: 'string',
        description:
          'Si no está correcto: el punto exacto donde se torció el razonamiento (no solo "está mal"). Qué paso, qué supuesto, qué signo o unidad. Si está correcto: string vacío.',
      },
      explicacion: {
        type: 'string',
        description: 'El desarrollo correcto, paso a paso pero breve. LaTeX permitido.',
      },
      problemaSimilar: {
        type: 'string',
        description:
          'Si NO estuvo correcto: un ejercicio parecido, de la misma dificultad, para reforzar (sin solución). Si estuvo correcto: string vacío "".',
      },
    },
    required: ['veredicto', 'dondeSeTorcio', 'explicacion', 'problemaSimilar'],
  },
}

const TOOL_REPASO = {
  name: 'entregar_preguntas',
  description: 'Entrega una pregunta corta de repaso por cada ficha recibida.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      preguntas: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            fichaId: { type: 'string' },
            ramo: { type: 'string' },
            titulo: { type: 'string' },
            pregunta: {
              type: 'string',
              description:
                'Pregunta corta, se responde en 1-2 frases o con un cálculo rápido. LaTeX permitido.',
            },
            respuestaEsperada: {
              type: 'string',
              description: 'La respuesta breve y correcta. LaTeX permitido.',
            },
          },
          required: ['fichaId', 'ramo', 'titulo', 'pregunta', 'respuestaEsperada'],
        },
      },
    },
    required: ['preguntas'],
  },
}

// --- Handlers por ruta ---

/** Línea de contexto del ramo, para pegar en el prompt. */
function ctx(b) {
  return b.contexto ? `\nContexto del ramo (tenlo presente): ${b.contexto}` : ''
}

const RUTAS = {
  '/ficha': (b) => ({
    tool: TOOL_FICHA,
    system: `${PERFIL_ALUMNA}\n\nTu tarea: armar una FICHA DE ESTUDIO.\n\n${REGLAS_FORMATO}`,
    user: `Ramo: ${b.ramo || '(no indicado)'}${ctx(b)}\n\nTema o apunte de la alumna:\n"""\n${b.consulta}\n"""\n\nArma la ficha llamando a entregar_ficha.`,
  }),

  '/seguir': (b) => ({
    tool: TOOL_SEGUIR,
    system: `${PERFIL_ALUMNA}\n\nLa alumna está mirando una ficha y te hace una repregunta. Respóndela directo y corto, sin repetir toda la ficha. Bloques cortos. Fórmulas en LaTeX.`,
    user: `Tema de la ficha: ${b.titulo}\nRamo: ${b.ramo}${ctx(b)}\nIdea central: ${b.ideaCentral}\nForma formal: ${b.formaFormal}\nEn criollo: ${b.enCriollo}\n${
      b.previos?.length
        ? `\nRepreguntas anteriores:\n${b.previos.map((p) => `P: ${p.pregunta}\nR: ${p.respuesta}`).join('\n\n')}\n`
        : ''
    }\nNueva repregunta:\n"""\n${b.pregunta}\n"""\n\nLlama a entregar_respuesta.`,
  }),

  '/simple': (b) => ({
    tool: TOOL_SIMPLE,
    system: `${PERFIL_ALUMNA}\n\nLa alumna ya leyó una ficha y pidió "explícamelo más simple"${
      b.intento > 1 ? ` (es la ${b.intento}ª vez que lo pide, hazlo todavía más básico)` : ''
    }. Da una explicación más simple, con otra analogía. Bloques cortos.`,
    user: `Tema: ${b.titulo}\nRamo: ${b.ramo}\nIdea central que ya vio: ${b.ideaCentral}\nAnalogía que ya vio: ${b.enCriollo}\n\nLlama a entregar_explicacion.`,
  }),

  '/ejercicio': (b) => ({
    tool: TOOL_EJERCICIO,
    system: `${PERFIL_ALUMNA}\n\nGenera UN ejercicio del tema, de dificultad ${b.dificultad}/3 (1 = para entrar en calor, 3 = el difícil). Debe poder resolverse con lo de la ficha. Datos realistas y con unidades. No des la solución.`,
    user: `Tema: ${b.titulo}\nRamo: ${b.ramo}${ctx(b)}\nIdea central: ${b.ideaCentral}\nForma formal: ${b.formaFormal}\n${
      b.previos?.length
        ? `\nYa le diste estos ejercicios, haz uno DISTINTO:\n- ${b.previos.join('\n- ')}`
        : ''
    }\n\nLlama a entregar_ejercicio con dificultad ${b.dificultad}.`,
  }),

  '/correccion': (b) => ({
    tool: TOOL_CORRECCION,
    system: `${PERFIL_ALUMNA}\n\nCorrige la respuesta. Lo importante: si está mal o a medias, muéstrale DÓNDE se torció el razonamiento (qué paso, qué supuesto, qué signo/unidad), no solo si acertó. Sé claro y breve. Si estuvo bien, felicítala corto y pon problemaSimilar en null.`,
    user: `Tema: ${b.titulo}\nRamo: ${b.ramo}${ctx(b)}\nForma formal: ${b.formaFormal}\n\nEjercicio:\n"""\n${b.enunciado}\n"""\n\nRespuesta de la alumna:\n"""\n${b.respuesta}\n"""\n\nLlama a entregar_correccion.`,
  }),

  '/repaso': (b) => ({
    tool: TOOL_REPASO,
    system: `${PERFIL_ALUMNA}\n\nSon temas que ella marcó como difíciles y no quiere que se le olviden. Haz UNA pregunta corta de recuerdo por cada ficha (que se responda rápido). Usa el fichaId exacto que te paso.`,
    user: `Fichas:\n${b.fichas
      .map((f) => `- fichaId=${f.id} | ${f.ramo} | ${f.titulo} | ${f.ideaCentral}`)
      .join('\n')}\n\nLlama a entregar_preguntas con una pregunta por ficha.`,
  }),
}

// --- Worker ---

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS })
    }
    if (request.method !== 'POST') {
      return json({ error: 'Método no permitido' }, 405)
    }

    const url = new URL(request.url)
    const ruta = url.pathname.replace(/\/$/, '') || '/'
    const build = RUTAS[ruta]
    if (!build) return json({ error: 'Ruta desconocida' }, 404)

    if (env.ACCESS_CODE && request.headers.get('x-leen-key') !== env.ACCESS_CODE) {
      return json({ error: 'Código de acceso inválido' }, 403)
    }
    if (!env.ANTHROPIC_API_KEY) {
      return json({ error: 'El servidor no tiene configurada la API key' }, 500)
    }

    let body
    try {
      body = await request.json()
    } catch {
      return json({ error: 'Cuerpo inválido' }, 400)
    }

    let plan
    try {
      plan = build(body)
    } catch {
      return json({ error: 'Faltan datos en la solicitud' }, 400)
    }

    const payload = {
      model: env.MODEL || DEFAULT_MODEL,
      max_tokens: 4000,
      system: plan.system,
      tools: [plan.tool],
      tool_choice: { type: 'tool', name: plan.tool.name },
      messages: [{ role: 'user', content: plan.user }],
    }

    let apiRes
    try {
      apiRes = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': ANTHROPIC_VERSION,
        },
        body: JSON.stringify(payload),
      })
    } catch {
      return json({ error: 'No se pudo contactar al modelo. Probá de nuevo.' }, 502)
    }

    if (!apiRes.ok) {
      const detalle = await apiRes.text()
      console.log('Anthropic error', apiRes.status, detalle)
      return json(
        { error: `El modelo respondió con error (${apiRes.status}).` },
        502,
      )
    }

    const data = await apiRes.json()
    const bloque = (data.content || []).find((c) => c.type === 'tool_use')
    if (!bloque) {
      return json({ error: 'El modelo no devolvió una respuesta usable.' }, 502)
    }

    return json(bloque.input, 200)
  },
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json', ...CORS },
  })
}
