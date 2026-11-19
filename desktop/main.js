'use strict'
/**
 * LEEN STUDIE — app de escritorio (proceso principal de Electron).
 *
 *  - Muestra la interfaz (carpeta ui/) con un protocolo propio: leen://app
 *  - Arranca el servicio de transcripción (Python + ffmpeg + Whisper, que van
 *    empaquetados dentro de la app) y lo cierra cuando se cierra la app.
 *  - Se actualiza sola desde GitHub Releases (electron-updater).
 */
const { app, BrowserWindow, ipcMain, protocol, session, shell, dialog, Menu } = require('electron')
const { autoUpdater } = require('electron-updater')
const path = require('node:path')
const fs = require('node:fs')
const net = require('node:net')
const http = require('node:http')
const { spawn, spawnSync } = require('node:child_process')

// --------------------------------------------------------------------------
// Rutas
// --------------------------------------------------------------------------
const EMPAQUETADA = app.isPackaged
// Python, ffmpeg y el modelo viajan en resources/ (fuera del asar).
const RECURSOS = process.env.LEEN_RECURSOS || (EMPAQUETADA ? process.resourcesPath : '')
const UI_DIR = path.resolve(process.env.LEEN_UI || path.join(__dirname, 'ui'))
const ICONO = path.join(__dirname, 'icono.png')
const DATOS_SERVICIO = path.join(
  process.env.LOCALAPPDATA || app.getPath('home'),
  'LeenStudie',
  'transcriber',
)

app.setAppUserModelId('cl.leenstudie.app')

// Puerto de depuración remota, solo para pruebas automáticas.
if (process.env.LEEN_DEBUG_PORT) {
  app.commandLine.appendSwitch('remote-debugging-port', process.env.LEEN_DEBUG_PORT)
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'leen',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true },
  },
])

// --------------------------------------------------------------------------
// Registro en archivo (para poder diagnosticar problemas en el computador de Leen)
// --------------------------------------------------------------------------
function dirLogs() {
  return path.join(app.getPath('userData'), 'logs')
}
function log(...partes) {
  const texto = partes.map((p) => (p instanceof Error ? p.stack || p.message : String(p))).join(' ')
  try {
    fs.mkdirSync(dirLogs(), { recursive: true })
    fs.appendFileSync(path.join(dirLogs(), 'app.log'), `${new Date().toISOString()} ${texto}\n`)
  } catch {
    /* sin log, no pasa nada */
  }
  console.log(texto)
}
function rotarLogs() {
  for (const nombre of ['app.log', 'servicio.log']) {
    const f = path.join(dirLogs(), nombre)
    try {
      if (fs.statSync(f).size > 3 * 1024 * 1024) fs.renameSync(f, f + '.old')
    } catch {
      /* no existe */
    }
  }
}

// --------------------------------------------------------------------------
// Servicio de transcripción (Python)
// --------------------------------------------------------------------------
const servicio = { proc: null, puerto: 0, apagando: false, reinicios: [] }

function puertoLibre() {
  return new Promise((resolve, reject) => {
    const s = net.createServer()
    s.unref()
    s.on('error', reject)
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address()
      s.close(() => resolve(port))
    })
  })
}

function pedirJson(puerto, ruta, timeout = 1500) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port: puerto, path: ruta, timeout }, (res) => {
      let cuerpo = ''
      res.on('data', (c) => (cuerpo += c))
      res.on('end', () => {
        try {
          resolve(JSON.parse(cuerpo))
        } catch {
          resolve(null)
        }
      })
    })
    req.on('error', () => resolve(null))
    req.on('timeout', () => {
      req.destroy()
      resolve(null)
    })
  })
}

const urlServicio = () => `http://127.0.0.1:${servicio.puerto}`

async function iniciarServicio() {
  if (servicio.proc) return true
  const python = path.join(RECURSOS, 'python', 'python.exe')
  if (!RECURSOS || !fs.existsSync(python)) {
    log('No se encontró el Python empaquetado en', python)
    return false
  }
  servicio.apagando = false
  if (!servicio.puerto) servicio.puerto = await puertoLibre()

  fs.mkdirSync(dirLogs(), { recursive: true })
  const salida = fs.openSync(path.join(dirLogs(), 'servicio.log'), 'a')
  const env = {
    ...process.env,
    PYTHONUTF8: '1',
    PYTHONIOENCODING: 'utf-8',
    LEEN_PORT: String(servicio.puerto),
    LEEN_PARENT_PID: String(process.pid),
    LEEN_ALLOWED_ORIGINS: 'leen://app',
    LEEN_FFMPEG: path.join(RECURSOS, 'ffmpeg', 'ffmpeg.exe'),
    LEEN_FFPROBE: path.join(RECURSOS, 'ffmpeg', 'ffprobe.exe'),
    LEEN_MODELS_EXTRA_DIR: path.join(RECURSOS, 'models'),
  }
  log('Iniciando servicio de transcripción en el puerto', servicio.puerto)
  const proc = spawn(python, ['-m', 'leen_transcriber'], {
    cwd: path.join(RECURSOS, 'transcriber'),
    env,
    windowsHide: true,
    stdio: ['ignore', salida, salida],
  })
  fs.closeSync(salida)
  servicio.proc = proc

  proc.on('error', (e) => log('Error al lanzar el servicio:', e))
  proc.on('exit', (codigo) => {
    log('El servicio terminó con código', codigo)
    if (servicio.proc === proc) servicio.proc = null
    if (!servicio.apagando) reiniciarSiCorresponde()
  })

  // Esperar a que responda (la primera vez Python tarda unos segundos en cargar).
  for (let i = 0; i < 120; i++) {
    if (await pedirJson(servicio.puerto, '/salud')) {
      log('Servicio listo.')
      return true
    }
    if (servicio.proc !== proc) return false
    await new Promise((r) => setTimeout(r, 500))
  }
  log('El servicio no respondió a tiempo.')
  return false
}

function reiniciarSiCorresponde() {
  // Máximo 3 reinicios automáticos por minuto, para no entrar en un ciclo.
  const ahora = Date.now()
  servicio.reinicios = servicio.reinicios.filter((t) => ahora - t < 60_000)
  if (servicio.reinicios.length >= 3) {
    log('Demasiados reinicios seguidos; el servicio queda detenido.')
    return
  }
  servicio.reinicios.push(ahora)
  setTimeout(() => void iniciarServicio(), 1500)
}

function detenerServicio() {
  servicio.apagando = true
  const proc = servicio.proc
  servicio.proc = null
  if (proc && proc.pid) {
    try {
      // /T mata también a los procesos hijos (ffmpeg).
      spawnSync('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { windowsHide: true })
    } catch (e) {
      log('No se pudo detener el servicio:', e)
    }
  }
}

async function transcripcionesActivas() {
  if (!servicio.proc) return 0
  const lista = await pedirJson(servicio.puerto, '/transcripciones?activas=true', 2000)
  return Array.isArray(lista) ? lista.length : 0
}

// --------------------------------------------------------------------------
// Protocolo leen://app → archivos de la interfaz
// --------------------------------------------------------------------------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.ico': 'image/x-icon',
}

function registrarProtocolo() {
  protocol.handle('leen', async (req) => {
    try {
      const { pathname } = new URL(req.url)
      let rel = decodeURIComponent(pathname)
      if (rel === '/' || rel === '') rel = '/index.html'
      const archivo = path.resolve(path.join(UI_DIR, rel))
      if (!archivo.startsWith(UI_DIR + path.sep) && archivo !== UI_DIR) {
        return new Response('Prohibido', { status: 403 })
      }
      const datos = await fs.promises.readFile(archivo)
      return new Response(datos, {
        headers: { 'content-type': MIME[path.extname(archivo).toLowerCase()] || 'application/octet-stream' },
      })
    } catch {
      return new Response('No encontrado', { status: 404 })
    }
  })
}

// --------------------------------------------------------------------------
// Ventana
// --------------------------------------------------------------------------
let ventana = null
let cierreConfirmado = false

const PERMISOS_OK = new Set([
  'local-network-access',
  'local-network',
  'loopback-network',
  'fullscreen',
  'clipboard-sanitized-write',
])

function configurarSesion() {
  const s = session.defaultSession
  s.setPermissionRequestHandler((_wc, permiso, cb) => cb(PERMISOS_OK.has(permiso)))
  s.setPermissionCheckHandler((_wc, permiso) => PERMISOS_OK.has(permiso))
}

function crearVentana() {
  ventana = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 420,
    minHeight: 600,
    show: false,
    backgroundColor: '#f4f7f8',
    title: 'LEEN STUDIE',
    icon: fs.existsSync(ICONO) ? ICONO : undefined,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: !EMPAQUETADA || Boolean(process.env.LEEN_DEVTOOLS),
      additionalArguments: [`--leen-servicio=${urlServicio()}`, `--leen-version=${app.getVersion()}`],
    },
  })
  ventana.removeMenu()

  ventana.once('ready-to-show', () => {
    // LEEN_OCULTO (solo para pruebas): "1" = no mostrar; "inactivo" = mostrar sin robar el foco.
    if (process.env.LEEN_OCULTO === 'inactivo') ventana.showInactive()
    else if (!process.env.LEEN_OCULTO) ventana.show()
  })

  // Enlaces externos → navegador del sistema; nunca navegar fuera de la app.
  ventana.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  ventana.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('leen://')) {
      e.preventDefault()
      if (/^https:\/\//i.test(url)) void shell.openExternal(url)
    }
  })

  // Si hay una transcripción en curso, avisar antes de cerrar.
  ventana.on('close', (e) => {
    if (cierreConfirmado) return
    e.preventDefault()
    void (async () => {
      const activas = await transcripcionesActivas()
      if (activas > 0) {
        const r = await dialog.showMessageBox(ventana, {
          type: 'warning',
          buttons: ['Seguir transcribiendo', 'Cerrar de todos modos'],
          defaultId: 0,
          cancelId: 0,
          title: 'Hay una transcripción en curso',
          message: 'Hay una transcripción en curso.',
          detail:
            'Si cierras LEEN STUDIE ahora, se detendrá y empezará de nuevo la próxima vez que la abras.',
        })
        if (r.response !== 1) return
      }
      cierreConfirmado = true
      ventana.close()
    })()
  })
  ventana.on('closed', () => {
    ventana = null
  })

  void ventana.loadURL('leen://app/index.html')
}

// --------------------------------------------------------------------------
// Actualizaciones automáticas
// --------------------------------------------------------------------------
let estadoActualizacion = { estado: 'sin-actualizar' }

function emitirActualizacion(estado) {
  estadoActualizacion = estado
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send('actualizacion:estado', estado)
  }
}

function configurarActualizador() {
  autoUpdater.logger = {
    info: (...a) => log('[updater]', ...a),
    warn: (...a) => log('[updater] AVISO', ...a),
    error: (...a) => log('[updater] ERROR', ...a),
    debug: () => {},
  }
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.allowPrerelease = false
  // Solo para pruebas: un servidor propio en vez de GitHub.
  if (process.env.LEEN_UPDATE_URL) {
    autoUpdater.setFeedURL({ provider: 'generic', url: process.env.LEEN_UPDATE_URL })
    autoUpdater.forceDevUpdateConfig = true
  }

  autoUpdater.on('checking-for-update', () => emitirActualizacion({ estado: 'buscando' }))
  autoUpdater.on('update-available', () => emitirActualizacion({ estado: 'descargando', progreso: 0 }))
  autoUpdater.on('update-not-available', () => emitirActualizacion({ estado: 'sin-actualizar' }))
  autoUpdater.on('download-progress', (p) =>
    emitirActualizacion({ estado: 'descargando', progreso: Math.min(1, p.percent / 100) }),
  )
  autoUpdater.on('update-downloaded', (info) =>
    emitirActualizacion({ estado: 'lista', version: info.version }),
  )
  autoUpdater.on('error', (err) =>
    emitirActualizacion({
      estado: 'error',
      mensaje: String((err && err.message) || err).split('\n')[0].slice(0, 200),
    }),
  )
}

const ACTUALIZACIONES_ACTIVAS = EMPAQUETADA || Boolean(process.env.LEEN_UPDATE_URL)

async function buscarActualizacion() {
  if (!ACTUALIZACIONES_ACTIVAS) {
    return { estado: 'error', mensaje: 'Las actualizaciones solo funcionan en la app instalada.' }
  }
  // Si ya hay una actualización descargada esperando, no se vuelve a buscar:
  // el aviso "reiniciar para actualizar" no debe volver a mostrarse como descarga.
  if (estadoActualizacion.estado === 'lista') return estadoActualizacion
  try {
    await autoUpdater.checkForUpdates()
  } catch (e) {
    // Sin internet u otro problema: no es grave, se vuelve a intentar más tarde.
    log('No se pudo buscar actualizaciones:', e)
    emitirActualizacion({ estado: 'sin-actualizar' })
  }
  return estadoActualizacion
}

function programarBusquedas() {
  if (!ACTUALIZACIONES_ACTIVAS) return
  setTimeout(() => void buscarActualizacion(), 20_000) // poco después de abrir
  setInterval(() => void buscarActualizacion(), 4 * 60 * 60 * 1000) // y cada 4 horas
}

// --------------------------------------------------------------------------
// Comunicación con la interfaz
// --------------------------------------------------------------------------
ipcMain.handle('servicio:reiniciar', async () => {
  detenerServicio()
  await new Promise((r) => setTimeout(r, 800))
  return iniciarServicio()
})
ipcMain.handle('actualizacion:buscar', () => buscarActualizacion())
ipcMain.handle('actualizacion:estado-actual', () => estadoActualizacion)
ipcMain.on('actualizacion:instalar', () => {
  cierreConfirmado = true
  detenerServicio() // que no queden archivos en uso cuando corra el instalador
  autoUpdater.quitAndInstall(true, true)
})
ipcMain.on('datos:abrir', () => {
  fs.mkdirSync(DATOS_SERVICIO, { recursive: true })
  void shell.openPath(DATOS_SERVICIO)
})

// --------------------------------------------------------------------------
// Ciclo de vida
// --------------------------------------------------------------------------
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (ventana) {
      if (ventana.isMinimized()) ventana.restore()
      ventana.focus()
    }
  })

  app.whenReady().then(async () => {
    rotarLogs()
    log(`LEEN STUDIE ${app.getVersion()} arrancando (empaquetada=${EMPAQUETADA})`)
    Menu.setApplicationMenu(null)
    configurarSesion()
    registrarProtocolo()
    configurarActualizador()

    // La ventana se abre al tiro; el servicio termina de arrancar en paralelo
    // (la interfaz espera con paciencia y lo muestra en la pestaña Clases).
    if (!servicio.puerto) servicio.puerto = await puertoLibre()
    crearVentana()
    void iniciarServicio()
    programarBusquedas()
  })

  app.on('before-quit', detenerServicio)
  app.on('window-all-closed', () => app.quit())
}
