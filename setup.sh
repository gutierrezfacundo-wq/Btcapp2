#!/data/data/com.termux/files/usr/bin/bash
# ==============================================
# setup.sh — Instalación del BTC Bot en Termux
# ==============================================
# Ejecutar: bash setup.sh
# ==============================================

set -e

echo "=========================================="
echo "  BTC Bot — Instalación para Termux"
echo "=========================================="
echo ""

# Actualizar paquetes de Termux
echo "[1/5] Actualizando paquetes de Termux..."
pkg update -y && pkg upgrade -y

# Instalar Python y dependencias del sistema
echo "[2/5] Instalando Python y herramientas..."
pkg install -y python git

# Instalar dependencias de Python
echo "[3/5] Instalando dependencias de Python..."
pip install --upgrade pip
pip install -r requirements.txt

# Crear archivo .env si no existe
echo "[4/5] Configurando archivo .env..."
if [ ! -f .env ]; then
    cp .env.example .env
    echo "  → Archivo .env creado. Editalo con: nano .env"
    echo "  → IMPORTANTE: Configurá al menos TELEGRAM_BOT_TOKEN y TELEGRAM_CHAT_ID"
else
    echo "  → Archivo .env ya existe, no se sobreescribe"
fi

# Configurar Termux para que no mate el proceso en segundo plano
echo "[5/5] Configurando Termux..."
if ! command -v termux-wake-lock &> /dev/null; then
    echo "  → Instalando termux-api para wake-lock..."
    pkg install -y termux-api
fi

echo ""
echo "=========================================="
echo "  Instalación completada"
echo "=========================================="
echo ""
echo "Pasos siguientes:"
echo "  1. Editá el archivo .env con tus API keys:"
echo "     nano .env"
echo ""
echo "  2. Para ejecutar el bot:"
echo "     python main.py"
echo ""
echo "  3. Para ejecutar en segundo plano (no se cierra al salir de Termux):"
echo "     termux-wake-lock"
echo "     nohup python main.py > /dev/null 2>&1 &"
echo ""
echo "  4. Para ver los logs en tiempo real:"
echo "     tail -f btc_bot.log"
echo ""
echo "  5. Para detener el bot en segundo plano:"
echo "     pkill -f 'python main.py'"
echo ""
