'use strict'
/**
 * Configuración del instalador (electron-builder).
 * Los ingredientes pesados (Python, ffmpeg, modelo) se arman antes con
 * `npm run preparar` y se leen desde la carpeta de trabajo definida en
 * scripts/rutas.cjs (fuera de OneDrive).
 */
const path = require('node:path')
const { STAGING, SALIDA } = require('./scripts/rutas.cjs')

module.exports = {
  appId: 'cl.leenstudie.app',
  productName: 'LEEN STUDIE',
  copyright: 'LEEN STUDIE',
  directories: { output: SALIDA, buildResources: 'build' },

  // Dentro del .asar: la ventana, el puente y la interfaz ya construida.
  files: [
    'main.js',
    'preload.js',
    'icono.png',
    'package.json',
    { from: '../dist-desktop', to: 'ui', filter: ['**/*'] },
  ],
  asar: true,

  // Fuera del .asar (hay que poder ejecutarlos): Python, ffmpeg y el modelo.
  extraResources: [
    { from: path.join(STAGING, 'python'), to: 'python' },
    { from: path.join(STAGING, 'transcriber'), to: 'transcriber' },
    { from: path.join(STAGING, 'ffmpeg'), to: 'ffmpeg' },
    { from: path.join(STAGING, 'models'), to: 'models' },
  ],

  compression: 'normal',

  win: {
    target: [{ target: 'nsis', arch: ['x64'] }],
    icon: 'build/icon.png',
    artifactName: 'LEEN-STUDIE-Setup-${version}.${ext}',
  },

  nsis: {
    oneClick: true, // un solo clic: instala y abre, sin preguntas
    perMachine: false, // por usuario: no pide permisos de administrador
    allowToChangeInstallationDirectory: false,
    deleteAppDataOnUninstall: false, // desinstalar NO borra sus fichas ni sus clases
    createDesktopShortcut: 'always',
    createStartMenuShortcut: true,
    shortcutName: 'LEEN STUDIE',
    runAfterFinish: true,
    differentialPackage: true, // las actualizaciones bajan solo lo que cambió
  },

  // De dónde la app instalada busca versiones nuevas.
  publish: [{ provider: 'github', owner: 'flsepulvedaj-web', repo: 'leen-studie', releaseType: 'release' }],
}
