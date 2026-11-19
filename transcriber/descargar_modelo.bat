@echo off
rem Descarga un modelo de Whisper (necesita internet solo esta vez).
rem Uso:  descargar_modelo.bat small
rem       descargar_modelo.bat medium
cd /d "%~dp0"
set VENV=%LOCALAPPDATA%\LeenStudie\venv
if not exist "%VENV%\Scripts\python.exe" (
  echo Primero ejecuta instalar.bat
  pause
  exit /b 1
)
set MODELO=%1
if "%MODELO%"=="" set MODELO=small
"%VENV%\Scripts\python.exe" -m leen_transcriber.modelos %MODELO%
pause
