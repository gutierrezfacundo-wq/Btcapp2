@echo off
REM iniciar_bot.bat — Arranca el bot en Windows usando el entorno virtual
chcp 65001 > nul
cd /d "%~dp0"

if not exist .venv (
    echo Primero ejecuta setup_windows.bat
    pause
    exit /b 1
)

call .venv\Scripts\activate.bat
python main.py
pause
