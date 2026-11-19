'use strict'
const { contextBridge, ipcRenderer } = require('electron')

const argumento = (nombre) => {
  const prefijo = `--${nombre}=`
  const a = process.argv.find((x) => x.startsWith(prefijo))
  return a ? a.slice(prefijo.length) : ''
}

contextBridge.exposeInMainWorld('leenDesktop', {
  version: argumento('leen-version'),
  servicioUrl: argumento('leen-servicio'),
  reiniciarServicio: () => ipcRenderer.invoke('servicio:reiniciar'),
  buscarActualizacion: () => ipcRenderer.invoke('actualizacion:buscar'),
  instalarActualizacion: () => ipcRenderer.send('actualizacion:instalar'),
  alCambiarActualizacion: (cb) => {
    const escuchar = (_evento, estado) => cb(estado)
    ipcRenderer.on('actualizacion:estado', escuchar)
    void ipcRenderer.invoke('actualizacion:estado-actual').then(cb)
    return () => ipcRenderer.removeListener('actualizacion:estado', escuchar)
  },
  abrirCarpetaDatos: () => ipcRenderer.send('datos:abrir'),
})
