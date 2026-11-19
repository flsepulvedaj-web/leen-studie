@echo off
rem Arranca el servicio de transcripcion. Dejalo abierto mientras usas la app.
cd /d "%~dp0"
set VENV=%LOCALAPPDATA%\LeenStudie\venv
if not exist "%VENV%\Scripts\python.exe" (
  echo Primero ejecuta instalar.bat
  pause
  exit /b 1
)
"%VENV%\Scripts\python.exe" -m leen_transcriber
pause
