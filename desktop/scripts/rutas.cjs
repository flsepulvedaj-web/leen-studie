'use strict'
/**
 * Rutas de construcción, compartidas por el script de preparación y por
 * electron-builder. Todo lo pesado queda FUERA de esta carpeta a propósito:
 * si el proyecto está en el Escritorio/Documentos, OneDrive sincronizaría
 * gigas de archivos temporales.
 */
const path = require('node:path')
const os = require('node:os')

const LOCAL = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local')
const BASE = process.env.LEEN_BUILD_DIR || path.join(LOCAL, 'LeenStudie', 'desktop-build')

module.exports = {
  LOCAL,
  BASE,
  /** Lo que se mete dentro de la app: python/, transcriber/, ffmpeg/, models/ */
  STAGING: path.join(BASE, 'staging'),
  /** Descargas reutilizables (Python embebido, ffmpeg). */
  CACHE: path.join(BASE, 'cache'),
  /** Instaladores terminados (.exe, .blockmap, latest.yml). */
  SALIDA: process.env.LEEN_SALIDA || path.join(BASE, 'release'),
  /** Raíz del repositorio (donde están package.json, src/ y transcriber/). */
  RAIZ: path.resolve(__dirname, '..', '..'),
  DESKTOP: path.resolve(__dirname, '..'),
}
