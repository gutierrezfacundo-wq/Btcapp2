#!/usr/bin/env bash
# ==============================================
# setup_pc.sh — Instalación del BTC Bot en Linux / macOS
# Ejecutar: bash setup_pc.sh
# ==============================================

set -e
cd "$(dirname "$0")"

echo "=========================================="
echo "  BTC Bot — Instalación para Linux / macOS"
echo "=========================================="

if ! command -v python3 &> /dev/null; then
    echo "[ERROR] python3 no está instalado."
    echo "  Ubuntu/Debian: sudo apt install python3 python3-venv"
    echo "  macOS:         brew install python"
    exit 1
fi

echo "[1/3] Creando entorno virtual en .venv ..."
[ -d .venv ] || python3 -m venv .venv

echo "[2/3] Instalando dependencias ..."
.venv/bin/pip install --upgrade pip
.venv/bin/pip install -r requirements.txt

echo "[3/3] Configurando archivo .env ..."
if [ ! -f .env ]; then
    cp .env.example .env
    echo "  → Archivo .env creado. Editalo con: nano .env"
else
    echo "  → Archivo .env ya existe, no se sobreescribe"
fi

echo ""
echo "Instalación completada. Para iniciar el bot:"
echo "  .venv/bin/python main.py"
echo ""
echo "En segundo plano:"
echo "  nohup .venv/bin/python main.py > /dev/null 2>&1 &"
