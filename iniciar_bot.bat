@echo off
REM iniciar_bot.bat - Arranca el bot en Windows usando el entorno virtual
chcp 65001 > nul
cd /d "%~dp0"

set "VENV_PY=.venv\Scripts\python.exe"

if not exist "%VENV_PY%" (
    echo No se encontro el entorno virtual. Primero ejecuta setup_windows.bat
    pause
    exit /b 1
)

REM Si faltan dependencias (instalacion incompleta), se instalan antes de arrancar
"%VENV_PY%" -c "import dotenv, requests, pytz" > nul 2>&1
if errorlevel 1 (
    echo Faltan dependencias, instalando...
    "%VENV_PY%" -m pip install -r requirements.txt
    if errorlevel 1 (
        echo [ERROR] No se pudieron instalar las dependencias. Revisa tu conexion a internet.
        pause
        exit /b 1
    )
)

"%VENV_PY%" main.py
pause
