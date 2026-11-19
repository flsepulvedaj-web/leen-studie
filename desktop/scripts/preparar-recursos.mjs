/**
 * Prepara los "ingredientes" que viajan dentro del instalador:
 *   python/       Python 3.12 embebido + faster-whisper, fastapi, etc.
 *   transcriber/  el código del servicio de transcripción (leen_transcriber)
 *   ffmpeg/       ffmpeg.exe y ffprobe.exe (versión "essentials", más liviana)
 *   models/small  el modelo de Whisper, para que funcione sin internet desde el día 1
 *
 * Uso:  node scripts/preparar-recursos.mjs [--sin-modelo] [--limpio]
 * Es repetible: lo que ya está listo no se vuelve a descargar.
 */
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

const require = createRequire(import.meta.url)
const { LOCAL, STAGING, CACHE, RAIZ, DESKTOP } = require('./rutas.cjs')

const SIN_MODELO = process.argv.includes('--sin-modelo')
const LIMPIO = process.argv.includes('--limpio')

const PYTHON_ZIP = 'python-3.12.10-embed-amd64.zip'
const PYTHON_URL = `https://www.python.org/ftp/python/3.12.10/${PYTHON_ZIP}`
const FFMPEG_ZIP = 'ffmpeg-9.0-essentials_build.zip'
const FFMPEG_URL = `https://github.com/GyanD/codexffmpeg/releases/download/9.0/${FFMPEG_ZIP}`
// Huella del zip de ffmpeg (se verificó la primera vez; si cambia, el script avisa).
const FFMPEG_SHA256 =
  process.env.LEEN_FFMPEG_SHA256 || 'e6b54767a6065919048f1a098eb27211ca4e12b4348a05d88777a5855d0b6e71'

// Python con el que se instalan los paquetes (debe ser 3.12, igual al embebido).
const PYTHON_HOST =
  process.env.LEEN_PYTHON || path.join(LOCAL, 'LeenStudie', 'venv', 'Scripts', 'python.exe')
const MODELO_ORIGEN =
  process.env.LEEN_MODELO_DIR || path.join(LOCAL, 'LeenStudie', 'transcriber', 'models', 'small')

const dir = (...p) => path.join(...p)
const paso = (t) => console.log(`\n▶ ${t}`)

function ejecutar(cmd, args, opciones = {}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', windowsHide: true, ...opciones })
  if (r.status !== 0) throw new Error(`Falló: ${cmd} ${args.join(' ')} (código ${r.status})`)
}

async function descargar(url, destino) {
  if (fs.existsSync(destino)) return console.log(`  ya descargado: ${path.basename(destino)}`)
  fs.mkdirSync(path.dirname(destino), { recursive: true })
  console.log(`  descargando ${url}`)
  const res = await fetch(url)
  if (!res.ok || !res.body) throw new Error(`No se pudo descargar ${url} (${res.status})`)
  const total = Number(res.headers.get('content-length')) || 0
  let hecho = 0
  let ultimo = -1
  const parcial = destino + '.parcial'
  const flujo = Readable.fromWeb(res.body)
  flujo.on('data', (c) => {
    hecho += c.length
    const pct = total ? Math.floor((hecho / total) * 10) * 10 : -1
    if (pct !== ultimo && pct >= 0) {
      ultimo = pct
      process.stdout.write(`  ${pct}%\r`)
    }
  })
  await pipeline(flujo, fs.createWriteStream(parcial))
  fs.renameSync(parcial, destino)
  console.log(`  listo (${(hecho / 1048576).toFixed(1)} MB)`)
}

function sha256(archivo) {
  const h = createHash('sha256')
  h.update(fs.readFileSync(archivo))
  return h.digest('hex')
}

function extraer(zip, destino) {
  fs.mkdirSync(destino, { recursive: true })
  ejecutar('tar', ['-xf', zip, '-C', destino]) // bsdtar viene con Windows 10/11
}

function copiar(origen, destino, filtro) {
  fs.cpSync(origen, destino, { recursive: true, force: true, filter: filtro })
}

function tamano(carpeta) {
  let total = 0
  for (const e of fs.readdirSync(carpeta, { withFileTypes: true, recursive: true })) {
    if (e.isFile()) total += fs.statSync(path.join(e.parentPath, e.name)).size
  }
  return total
}
const mb = (n) => `${(n / 1048576).toFixed(0)} MB`

// ----------------------------------------------------------------------------

if (LIMPIO) {
  paso('Borrando lo preparado antes')
  fs.rmSync(STAGING, { recursive: true, force: true })
}
fs.mkdirSync(STAGING, { recursive: true })
fs.mkdirSync(CACHE, { recursive: true })

// 1. Python embebido ---------------------------------------------------------
const pyDir = dir(STAGING, 'python')
if (!fs.existsSync(dir(pyDir, 'python.exe'))) {
  paso('Python embebido 3.12')
  await descargar(PYTHON_URL, dir(CACHE, PYTHON_ZIP))
  fs.rmSync(pyDir, { recursive: true, force: true })
  extraer(dir(CACHE, PYTHON_ZIP), pyDir)
}
// Rutas de búsqueda: Lib\site-packages (paquetes) y ..\transcriber (nuestro código).
fs.writeFileSync(
  dir(pyDir, 'python312._pth'),
  ['python312.zip', '.', 'Lib\\site-packages', '..\\transcriber', 'import site', ''].join('\r\n'),
)

// 2. Paquetes de Python ------------------------------------------------------
const reqs = dir(RAIZ, 'transcriber', 'requirements.txt')
const huella = sha256(reqs)
const marca = dir(pyDir, '.reqs-sha256')
if (!fs.existsSync(marca) || fs.readFileSync(marca, 'utf8') !== huella) {
  paso('Instalando paquetes de Python dentro del paquete')
  if (!fs.existsSync(PYTHON_HOST)) {
    throw new Error(`Falta Python 3.12 para instalar paquetes: ${PYTHON_HOST} (define LEEN_PYTHON).`)
  }
  const sitio = dir(pyDir, 'Lib', 'site-packages')
  fs.rmSync(sitio, { recursive: true, force: true })
  ejecutar(PYTHON_HOST, [
    '-m', 'pip', 'install', '--no-warn-script-location', '--disable-pip-version-check',
    '--target', sitio, '--only-binary=:all:',
    '--platform', 'win_amd64', '--python-version', '3.12', '--implementation', 'cp',
    '-r', reqs,
  ])
  // Ejecutables sueltos (uvicorn.exe, etc.) apuntan al Python de esta máquina: no sirven.
  fs.rmSync(dir(sitio, 'bin'), { recursive: true, force: true })
  fs.rmSync(dir(sitio, 'Scripts'), { recursive: true, force: true })
  fs.writeFileSync(marca, huella)
}

// 3. DLL de Visual C++ (por si el PC de Leen no las tiene) ---------------------
paso('Bibliotecas de Visual C++ junto a Python')
for (const n of ['msvcp140.dll', 'msvcp140_1.dll', 'msvcp140_2.dll', 'vcruntime140_1.dll', 'concrt140.dll']) {
  const origen = dir(process.env.WINDIR || 'C:\\Windows', 'System32', n)
  if (fs.existsSync(origen)) fs.copyFileSync(origen, dir(pyDir, n))
  else console.log(`  AVISO: no está ${n} en este PC`)
}

// 4. Código del servicio -------------------------------------------------------
paso('Código del servicio de transcripción')
const codigoDestino = dir(STAGING, 'transcriber', 'leen_transcriber')
fs.rmSync(dir(STAGING, 'transcriber'), { recursive: true, force: true })
copiar(dir(RAIZ, 'transcriber', 'leen_transcriber'), codigoDestino, (src) => !src.includes('__pycache__'))

// 5. ffmpeg --------------------------------------------------------------------
const ffDir = dir(STAGING, 'ffmpeg')
if (!fs.existsSync(dir(ffDir, 'ffmpeg.exe')) || !fs.existsSync(dir(ffDir, 'ffprobe.exe'))) {
  paso('ffmpeg (versión essentials)')
  const zip = dir(CACHE, FFMPEG_ZIP)
  await descargar(FFMPEG_URL, zip)
  const real = sha256(zip)
  if (FFMPEG_SHA256 && real !== FFMPEG_SHA256.toLowerCase()) {
    throw new Error(`La huella de ${FFMPEG_ZIP} no coincide.\n  esperada: ${FFMPEG_SHA256}\n  real:     ${real}`)
  }
  console.log(`  sha256: ${real}`)
  const tmp = dir(CACHE, 'ffmpeg-extraido')
  fs.rmSync(tmp, { recursive: true, force: true })
  extraer(zip, tmp)
  const raiz = fs.readdirSync(tmp).find((n) => fs.existsSync(dir(tmp, n, 'bin', 'ffmpeg.exe')))
  if (!raiz) throw new Error('No encontré bin/ffmpeg.exe dentro del zip de ffmpeg.')
  fs.rmSync(ffDir, { recursive: true, force: true })
  fs.mkdirSync(ffDir, { recursive: true })
  for (const f of ['ffmpeg.exe', 'ffprobe.exe']) fs.copyFileSync(dir(tmp, raiz, 'bin', f), dir(ffDir, f))
  for (const f of ['LICENSE', 'README.txt']) {
    if (fs.existsSync(dir(tmp, raiz, f))) fs.copyFileSync(dir(tmp, raiz, f), dir(ffDir, f))
  }
  fs.rmSync(tmp, { recursive: true, force: true })
}

// 6. Modelo de Whisper -----------------------------------------------------------
const modelosDir = dir(STAGING, 'models')
fs.mkdirSync(modelosDir, { recursive: true })
if (SIN_MODELO) {
  paso('Modelo: se omite (--sin-modelo); la app lo descargará desde la pestaña Clases')
  fs.rmSync(dir(modelosDir, 'small'), { recursive: true, force: true })
} else if (!fs.existsSync(dir(modelosDir, 'small', 'model.bin'))) {
  paso('Modelo de Whisper "small"')
  if (!fs.existsSync(dir(MODELO_ORIGEN, 'model.bin'))) {
    throw new Error(`No encuentro el modelo en ${MODELO_ORIGEN}. Descárgalo o usa --sin-modelo.`)
  }
  fs.rmSync(dir(modelosDir, 'small'), { recursive: true, force: true })
  copiar(MODELO_ORIGEN, dir(modelosDir, 'small'), (src) => !src.includes(`${path.sep}.cache`))
}

// 7. Íconos ------------------------------------------------------------------------
paso('Íconos')
fs.mkdirSync(dir(DESKTOP, 'build'), { recursive: true })
fs.copyFileSync(dir(RAIZ, 'public', 'icon-512.png'), dir(DESKTOP, 'build', 'icon.png'))
fs.copyFileSync(dir(RAIZ, 'public', 'icon-512.png'), dir(DESKTOP, 'icono.png'))

// 8. Interfaz construida --------------------------------------------------------------
if (!fs.existsSync(dir(RAIZ, 'dist-desktop', 'index.html'))) {
  throw new Error('Falta la interfaz: ejecuta primero "npm run build:desktop" en la raíz del proyecto.')
}

// 9. Prueba de humo: ¿arranca Python con todo lo necesario? -----------------------------
paso('Prueba de humo del Python empaquetado')
ejecutar(
  dir(pyDir, 'python.exe'),
  [
    '-c',
    'import faster_whisper, ctranslate2, onnxruntime, av, numpy, fastapi, uvicorn, docx, sqlite3, wave; ' +
      'import leen_transcriber.main; print("  imports OK · ctranslate2", ctranslate2.__version__)',
  ],
  { cwd: dir(STAGING, 'transcriber') },
)

console.log('\n✔ Ingredientes listos en', STAGING)
for (const n of ['python', 'transcriber', 'ffmpeg', 'models']) {
  const d = dir(STAGING, n)
  if (fs.existsSync(d)) console.log(`   ${n.padEnd(12)} ${mb(tamano(d))}`)
}
