# Transcribir clases — servicio local de LEEN STUDIE

Convierte la grabación de una clase (audio o video, incluso un Zoom de 2 horas)
en texto con marcas de tiempo. **Todo ocurre en tu computador: sin costo, sin
cuenta y sin internet** (salvo la instalación inicial).

```
Leen Studie (en el navegador)  ──►  servicio local (Python, este computador)
        pestaña "Clases"              ffmpeg  →  faster-whisper (CPU)
```

La app web de Leen Studie no puede transcribir sola (Whisper no corre dentro
de un navegador con archivos de este tamaño), por eso hay un programita que
corre en el computador mientras transcribes.

> Funciona en **Windows 10/11 con Chrome o Edge**. No funciona desde el
> celular: el servicio vive en el computador.

## Qué necesitas

| | |
|---|---|
| Python 3.12 | para correr el servicio |
| ffmpeg | para sacar el audio del video |
| Modelo Whisper `small` | ~0,5 GB de descarga (una sola vez) |
| Modelo `medium` (opcional) | ~1,5 GB, mejor calidad pero más lento |
| Espacio en disco | el servicio guarda una copia de cada clase (un Zoom de 1 h pesa 150–400 MB) |
| RAM | 4 GB libres con `small`; unos 6 GB con `medium` |

## Instalación (una sola vez, con internet)

Abre **PowerShell** o **Símbolo del sistema**.

**1. Instalar Python 3.12**

```
winget install Python.Python.3.12
```

**2. Instalar ffmpeg**

```
winget install Gyan.FFmpeg
```

**3. Cierra la ventana y abre una nueva** (para que Windows reconozca los
programas recién instalados). Comprueba que funcionan:

```
py -3.12 --version
ffmpeg -version
```

> ¿Sin winget? Python: <https://www.python.org/downloads/> (marca
> *"Add python.exe to PATH"*). ffmpeg: descarga el `.zip` "essentials" desde
> <https://www.gyan.dev/ffmpeg/builds/> y copia `ffmpeg.exe` y `ffprobe.exe`
> a `transcriber\tools\ffmpeg\bin\`.

**4. Ejecutar `instalar.bat`** (doble clic en esta carpeta). Hace tres cosas:

1. crea un entorno de Python solo para esto, en
   `%LOCALAPPDATA%\LeenStudie\venv` (fuera de esta carpeta a propósito: si está
   en el Escritorio o Documentos, OneDrive la sincroniza y puede dañar el entorno),
2. instala los paquetes (`faster-whisper`, `fastapi`, …),
3. **descarga el modelo `small`** (a `%LOCALAPPDATA%\LeenStudie\transcriber\models`).

Para tener también el modelo de mayor calidad:

```
descargar_modelo.bat medium
```

Eso es todo. **Después de este paso ya no necesitas internet.**

## Uso diario

1. Doble clic en **`iniciar.bat`**. Se abre una ventana negra: déjala abierta
   mientras transcribes (al cerrarla, el servicio se detiene).
2. En Leen Studie abre la pestaña **Clases** 🎙️.
   - La primera vez, Chrome/Edge preguntan si permites a la página conectarse
     a otros dispositivos o aplicaciones de tu computador. Di **Permitir**
     (es tu propio computador); sin eso no puede funcionar. Si cierras el
     aviso sin responder, Chrome puede bloquear el permiso: ver *Solución de
     problemas*.
3. Elige el archivo, el ramo, la fecha de la clase y la calidad →
   **Transcribir**.
4. Puedes seguir usando la app (hacer fichas, repasar…). Una cinta abajo te
   muestra el avance y el tiempo estimado. Si cierras el navegador, el
   trabajo sigue mientras `iniciar.bat` esté abierto.
5. Al terminar, abre la transcripción: haz clic en cualquier marca de tiempo
   (`12:34`) y el video salta a ese momento.

### Qué puedes hacer con una transcripción

- **Buscar** una palabra en todas las clases de un ramo (por ejemplo
  `generador` o `alias`). Ignora mayúsculas y tildes y encuentra variantes
  (`generador` → `generadores`).
- **Exportar** a `.txt`, `.srt` (subtítulos) o `.docx` (Word, con párrafos de
  ~1 minuto).
- Cambiar título, fecha o ramo con **Editar**, o borrarla.

## Cuánto demora

Depende del procesador. **Medido** con el modelo `small` en un notebook potente
(AMD Ryzen 9 6900HX, 8 núcleos, 23 GB de RAM) con un video de 2 horas y 336 MB:

| | |
|---|---|
| Copiar el archivo al servicio | 8 segundos |
| Extraer el audio (ffmpeg) | ~10 segundos |
| Transcribir | **~55 minutos** para 2 horas (≈ 0,46 × la duración) |
| Memoria RAM del servicio | máx. ~0,6 GB |

En un PC más modesto (4 núcleos, procesador de bajo consumo) cuenta con el
doble o más. El modelo `medium` es bastante más lento todavía (no lo medimos).
Una clase corta de 5 minutos tardó ~2 min en total.

La app calcula el tiempo restante mientras avanza. Para que el PC siga
usable, el servicio trabaja con prioridad baja, deja un par de núcleos libres y
evita que Windows se suspenda mientras transcribe. Procesa la clase en tramos
de ~10 minutos (cortando en los silencios), por eso el texto empieza a aparecer
a los pocos segundos y la memoria no crece con clases largas.

## Dónde quedan los datos

Todo en `%LOCALAPPDATA%\LeenStudie\transcriber\` (normalmente
`C:\Users\TU-USUARIO\AppData\Local\LeenStudie\transcriber`). Está **fuera del
Escritorio y de Documentos a propósito**: esas carpetas suelen sincronizarse con
OneDrive, que subiría los videos a la nube y puede dañar la base de datos.

| Carpeta/archivo | Contenido |
|---|---|
| `leen.db` | transcripciones y su texto |
| `media\` | copia de cada audio/video subido |
| `models\` | modelos de Whisper |

Para un respaldo, copia esa carpeta. Borrar una transcripción desde la app
también borra su copia del video. Si prefieres otro lugar, define la variable
de entorno `LEEN_DATA_DIR`.

## Solución de problemas

| Síntoma | Qué hacer |
|---|---|
| La pestaña Clases dice "el servicio no está abierto" | Abre `iniciar.bat`. Si dice que falta instalar, ejecuta `instalar.bat`. |
| Chrome/Edge bloquea la conexión | Desde la versión 142, una página https necesita tu permiso para hablar con servicios de tu propio computador. Toca el candado junto a la dirección → *Configuración del sitio* → *Acceso a la red local* → **Permitir**, y recarga. La app detecta este caso y te lo explica. Safari y Firefox no están soportados. |
| "Falta instalar ffmpeg" | Instálalo (paso 2) y reinicia `iniciar.bat` en una ventana nueva. |
| "Falta descargar el modelo" | `descargar_modelo.bat small` (o `medium`). |
| El puerto 8765 está ocupado | Cierra otra copia de `iniciar.bat`, o cambia el puerto con la variable `LEEN_PORT` (y la dirección en *Ajustes → Transcripción de clases*). |
| El texto sale con errores en nombres técnicos | Prueba la calidad **Mejor calidad** (`medium`). |
| El video no se reproduce pero la transcripción sí | El navegador no soporta ese formato (ej. `.mkv`, `.avi`). Convierte a `.mp4` o usa solo el audio. |
| Quedó una transcripción "a medias" tras apagar el PC | Al abrir `iniciar.bat` se reintenta sola desde el principio. |

## Para quien desarrolla

```
set VENV=%LOCALAPPDATA%\LeenStudie\venv   # (instalar.bat ya lo crea)
%VENV%\Scripts\python -m pip install -r requirements-dev.txt
%VENV%\Scripts\python -m pytest           # pruebas (modo de prueba, sin Whisper)
set LEEN_FAKE_TRANSCRIBER=1               # servicio con texto falso, para probar la interfaz
%VENV%\Scripts\python -m leen_transcriber
```

Variables de entorno: `LEEN_PORT`, `LEEN_DATA_DIR`, `LEEN_ALLOWED_ORIGINS`
(orígenes extra separados por coma), `LEEN_MAX_UPLOAD_GB`, `LEEN_BEAM_SIZE`,
`LEEN_CPU_THREADS`, `LEEN_FFMPEG`, `LEEN_FFPROBE`.

Seguridad: el servicio solo escucha en `127.0.0.1`, solo atiende peticiones
con `Host` local, solo acepta escrituras de orígenes conocidos (la app en
GitHub Pages y `localhost` de desarrollo) y responde al permiso de red local
de Chrome (Private Network Access).

### API

| Método y ruta | Qué hace |
|---|---|
| `GET /salud` | estado: ffmpeg, modelos descargados |
| `POST /transcripciones?...` | sube un archivo (cuerpo = el archivo) y lo encola |
| `GET /transcripciones?ramo_id=` | lista |
| `GET /transcripciones/{id}` | estado, progreso y tiempo estimado |
| `GET /transcripciones/{id}/segmentos?desde=` | texto con marcas de tiempo |
| `PATCH /transcripciones/{id}` | cambiar título, fecha o ramo |
| `POST /transcripciones/{id}/cancelar` | cancelar |
| `DELETE /transcripciones/{id}` | borrar (y su archivo) |
| `GET /transcripciones/{id}/media` | el audio/video original (con `Range`) |
| `GET /transcripciones/{id}/exportar?formato=txt\|srt\|docx` | descarga |
| `GET /buscar?q=&ramo_id=` | búsqueda en todas las transcripciones |
