# LEEN STUDIE para escritorio (Windows)

Un instalador que trae **todo adentro**: la app, el módulo de transcripción de
clases (Python + ffmpeg + Whisper) y el modelo `small`. Se instala con un clic,
funciona sin internet para transcribir y **se actualiza sola**.

> Para quien instala en el computador de Leen: ver [Instalación](#instalación-para-leen).
> Para quien mantiene la app (publicar versiones nuevas): ver [Publicar una actualización](#publicar-una-actualización).

## Qué incluye

| Pieza | Para qué |
|---|---|
| Interfaz de LEEN STUDIE | fichas, ramos, ejercicios, repaso, buscador |
| Servicio de transcripción | convierte clases (audio/video) en texto con marcas de tiempo |
| Python 3.12 + faster-whisper | el motor de transcripción (corre en la CPU) |
| ffmpeg | saca el audio de los videos |
| Modelo Whisper `small` | español, sin internet desde el primer día |

Qué necesita internet: crear/simplificar fichas y los ejercicios (usan Claude a
través del servidor de Cloudflare), descargar el modelo `medium` (opcional) y
buscar actualizaciones. **Transcribir clases y leer lo guardado funciona sin conexión.**

## Instalación (para Leen)

1. Descarga `LEEN-STUDIE-Setup-X.Y.Z.exe` desde la página de versiones:
   <https://github.com/flsepulvedaj-web/leen-studie/releases/latest>
2. Haz doble clic. Es un solo clic: se instala y se abre sola (no pide
   permisos de administrador). Deja un ícono en el escritorio y en el menú Inicio.
3. **Windows puede mostrar "Windows protegió su PC"** (porque la app no tiene
   firma digital, que cuesta dinero). Es normal. Toca **Más información** →
   **Ejecutar de todas formas**. Solo pasa la primera vez.

Pesa cerca de 800 MB porque lleva el modelo de transcripción adentro.

### Actualizaciones

No tienes que hacer nada. La app busca versiones nuevas al abrirse (y cada 4
horas) y las descarga sola en segundo plano; casi siempre es una descarga
pequeña porque solo baja lo que cambió. Cuando está lista aparece un aviso
**"Actualizar ahora"**. Si lo ignoras, se instala al cerrar la app.
También puedes forzarlo en **Ajustes → Buscar actualizaciones**.

Tus fichas, ramos y clases transcritas **se conservan** al actualizar e incluso
al desinstalar.

### Desinstalar

Configuración de Windows → Aplicaciones → LEEN STUDIE → Desinstalar. Esto no
borra tus datos. Si quieres borrarlos también:
`%LOCALAPPDATA%\LeenStudie` (clases, base de datos de transcripciones) y
`%APPDATA%\LEEN STUDIE` (fichas y ramos).

### Si algo falla

- La pestaña **Clases** avisa si el servicio no responde y tiene un botón
  **Reiniciar el servicio**.
- Archivos de registro (para mandárselos a quien mantiene la app):
  `%APPDATA%\LEEN STUDIE\logs\app.log` y `servicio.log`.
- Al cerrar la ventana con una transcripción en curso, la app pregunta antes de
  cerrar (si cierras, se detiene y empieza de nuevo la próxima vez).

## Dónde quedan los datos

| Qué | Dónde |
|---|---|
| Fichas, ramos, repaso, ajustes | `%APPDATA%\LEEN STUDIE` (dentro de la app) |
| Transcripciones, copias de las clases, modelo `medium` | `%LOCALAPPDATA%\LeenStudie\transcriber` |

Las fichas de la versión de celular (PWA) **no** se pasan solas: en el celular
usa Ajustes → *Exportar respaldo* y en el escritorio Ajustes → *Importar*.

---

## Para quien mantiene la app

### Cómo está armado

```
Electron (ventana, instalador, actualizaciones)
 ├─ interfaz React (misma de la web, compilada con `--mode desktop`)
 │    se sirve con un protocolo propio: leen://app
 └─ servicio de transcripción (resources/python, resources/transcriber)
      lo lanza y vigila la app; se cierra solo si la app desaparece
```

- `main.js`: ventana, protocolo `leen://`, servicio Python, actualizaciones, avisos al cerrar.
- `preload.js`: puente seguro con la interfaz (`window.leenDesktop`).
- `scripts/preparar-recursos.mjs`: arma Python embebido, ffmpeg y el modelo.
- `electron-builder.config.js`: configuración del instalador.

Todo lo pesado (ingredientes, instaladores) se genera en
`%LOCALAPPDATA%\LeenStudie\desktop-build` (**fuera** de OneDrive a propósito).

### Construir el instalador

Requisitos: Node 22+, Python 3.12 con los paquetes instalados
(`transcriber\instalar.bat`), el modelo `small` descargado, internet (primera vez).

```bash
cd desktop
npm install                 # solo la primera vez
npm run dist                # interfaz + ingredientes + instalador
```

El resultado queda en `%LOCALAPPDATA%\LeenStudie\desktop-build\release\`:
`LEEN-STUDIE-Setup-X.Y.Z.exe`, `…exe.blockmap` y `latest.yml`.

Pasos sueltos: `npm run ui`, `npm run preparar [-- --sin-modelo]`, `npm run instalador`.
Para probar sin instalador: `npm run empaquetar` (deja `win-unpacked/`).

### Publicar una actualización

1. Sube el número en `desktop/package.json` (`"version": "1.0.1"`). **Siempre
   debe ser mayor que el anterior**, o las apps instaladas no la verán.
2. `npm run dist`.
3. Crea la versión en GitHub subiendo **los tres archivos**
   (`.exe`, `.exe.blockmap` y `latest.yml`):

   ```bash
   gh release create v1.0.1 \
     "%LOCALAPPDATA%\LeenStudie\desktop-build\release\LEEN-STUDIE-Setup-1.0.1.exe" \
     "%LOCALAPPDATA%\LeenStudie\desktop-build\release\LEEN-STUDIE-Setup-1.0.1.exe.blockmap" \
     "%LOCALAPPDATA%\LeenStudie\desktop-build\release\latest.yml" \
     --title "LEEN STUDIE 1.0.1" --notes "Qué cambió…"
   ```
4. Listo: las apps instaladas la detectan solas (al abrir o en máximo 4 horas).

Notas:
- El repositorio debe ser **público** (las apps instaladas leen las versiones
  sin credenciales).
- Una versión marcada como *draft* o *pre-release* no se distribuye.
- Las actualizaciones son diferenciales: gracias al `.blockmap` solo se baja lo
  que cambió, no los ~800 MB completos.

### Variables para pruebas (no se usan en producción)

| Variable | Efecto |
|---|---|
| `LEEN_OCULTO=1` / `inactivo` | no mostrar la ventana / mostrarla sin robar el foco |
| `LEEN_DEBUG_PORT=9333` | abre el puerto de depuración remota |
| `LEEN_UPDATE_URL=http://…` | busca actualizaciones en un servidor propio en vez de GitHub |
| `LEEN_DEVTOOLS=1` | permite las herramientas de desarrollo en la app instalada |

### Firma digital

El instalador no está firmado, por eso Windows muestra el aviso de SmartScreen
la primera vez. Firmarlo requiere un certificado de firma de código (pago).
Si algún día se compra, basta con definir `CSC_LINK` y `CSC_KEY_PASSWORD`
al construir; no hay que cambiar nada más.

### Licencias de terceros

Incluye ffmpeg (build "essentials" de gyan.dev, GPL v3; su licencia viaja en
`resources/ffmpeg/`), Python (PSF), Electron (MIT), faster-whisper (MIT) y el
modelo Whisper de OpenAI (MIT).
