@echo off
rem Instala el servicio de transcripcion de LEEN STUDIE (una sola vez, con internet).
rem Uso:  instalar.bat           -> modelo "small"
rem       instalar.bat medium    -> modelo "medium" (mejor calidad, mas lento)
rem
rem El entorno de Python se crea FUERA de esta carpeta (en %LOCALAPPDATA%) a
rem proposito: si esta carpeta esta en el Escritorio o Documentos, OneDrive la
rem sincroniza y puede danar los archivos del entorno.
cd /d "%~dp0"

set MODELO=%1
if "%MODELO%"=="" set MODELO=small
set VENV=%LOCALAPPDATA%\LeenStudie\venv

set PY=
py -3.12 --version >nul 2>&1 && set PY=py -3.12
if "%PY%"=="" py -3 --version >nul 2>&1 && set PY=py -3
if "%PY%"=="" (
  echo No encontre Python. Instalalo con:  winget install Python.Python.3.12
  echo Despues cierra esta ventana y vuelve a abrirla.
  pause
  exit /b 1
)

where ffmpeg >nul 2>&1
if errorlevel 1 (
  echo AVISO: no encuentro ffmpeg en esta ventana. Si ya lo instalaste, cierra y abre
  echo una ventana nueva. Si no, instalalo con:  winget install Gyan.FFmpeg
  echo Voy a seguir con el resto de la instalacion.
)

if not exist "%VENV%\Scripts\python.exe" (
  echo Creando entorno de Python en %VENV% ...
  %PY% -m venv "%VENV%"
  if errorlevel 1 (
    echo No pude crear el entorno de Python.
    pause
    exit /b 1
  )
)

echo Instalando paquetes...
"%VENV%\Scripts\python.exe" -m pip install --upgrade pip
"%VENV%\Scripts\python.exe" -m pip install -r requirements.txt
if errorlevel 1 (
  echo Fallo la instalacion de paquetes.
  pause
  exit /b 1
)

echo Descargando el modelo "%MODELO%" (solo esta vez)...
"%VENV%\Scripts\python.exe" -m leen_transcriber.modelos %MODELO%
if errorlevel 1 (
  echo Fallo la descarga del modelo. Revisa tu conexion y ejecuta de nuevo.
  pause
  exit /b 1
)

echo.
echo Listo. Para usarlo, abre iniciar.bat y deja esa ventana abierta.
pause
