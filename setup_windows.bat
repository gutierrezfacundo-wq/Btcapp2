@echo off
REM ==============================================
REM setup_windows.bat — Instalación del BTC Bot en Windows
REM Doble clic sobre este archivo o ejecutarlo desde CMD
REM ==============================================
chcp 65001 > nul
cd /d "%~dp0"

echo ==========================================
echo   BTC Bot - Instalacion para Windows
echo ==========================================
echo.

REM Verificar que Python esté instalado
where python > nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python no esta instalado o no esta en el PATH.
    echo Descargalo de https://www.python.org/downloads/
    echo IMPORTANTE: tilda "Add python.exe to PATH" al instalar.
    pause
    exit /b 1
)

echo [1/3] Creando entorno virtual en .venv ...
if not exist .venv (
    python -m venv .venv
)

echo [2/3] Instalando dependencias ...
call .venv\Scripts\activate.bat
python -m pip install --upgrade pip
pip install -r requirements.txt

echo [3/3] Configurando archivo .env ...
if not exist .env (
    copy .env.example .env > nul
    echo   - Archivo .env creado. Abrilo con el Bloc de notas y completa tus API keys.
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
