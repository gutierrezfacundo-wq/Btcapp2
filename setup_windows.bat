@echo off
REM setup_windows.bat - Instalacion del BTC Bot en Windows
REM Doble clic sobre este archivo o ejecutarlo desde CMD
chcp 65001 > nul
cd /d "%~dp0"

echo ==========================================
echo   BTC Bot - Instalacion para Windows
echo ==========================================
echo.

REM El lanzador "py" viene con el instalador de python.org aunque no se tilde PATH
set "PY="
py -3 --version > nul 2>&1 && set "PY=py -3"
if not defined PY (
    python --version > nul 2>&1 && set "PY=python"
)
if not defined PY (
    echo [ERROR] No se encontro Python.
    echo Descargalo de https://www.python.org/downloads/
    echo IMPORTANTE: tilda "Add python.exe to PATH" al instalar.
    pause
    exit /b 1
)
echo Usando Python: %PY%
echo.

echo [1/3] Creando entorno virtual en .venv ...
if not exist ".venv\Scripts\python.exe" (
    %PY% -m venv .venv
    if errorlevel 1 (
        echo [ERROR] No se pudo crear el entorno virtual.
        pause
        exit /b 1
    )
)

echo [2/3] Instalando dependencias ...
".venv\Scripts\python.exe" -m pip install --upgrade pip
".venv\Scripts\python.exe" -m pip install -r requirements.txt
if errorlevel 1 (
    echo.
    echo [ERROR] Fallo la instalacion de dependencias.
    echo Revisa tu conexion a internet y volve a ejecutar este archivo.
    pause
    exit /b 1
)
".venv\Scripts\python.exe" -c "import dotenv, requests, pytz"
if errorlevel 1 (
    echo.
    echo [ERROR] Las dependencias no quedaron instaladas correctamente.
    pause
    exit /b 1
)

echo [3/3] Configurando archivo .env ...
if not exist .env (
    copy .env.example .env > nul
    echo   - Archivo .env creado. Abrilo con el Bloc de notas y completa tus datos.
) else (
    echo   - Archivo .env ya existe, no se sobreescribe.
)

echo.
echo ==========================================
echo   Instalacion completada
echo ==========================================
echo.
echo Pasos siguientes:
echo   1. Edita .env:   notepad .env
echo   2. Inicia el bot: doble clic en iniciar_bot.bat
echo.
pause
