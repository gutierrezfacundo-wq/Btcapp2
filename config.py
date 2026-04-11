"""
config.py — Carga de configuración desde archivo .env
Todas las API keys y parámetros configurables se leen desde variables de entorno.
"""

import os
from dotenv import load_dotenv

# Cargar variables desde .env en el directorio del script
load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), '.env'))


def _get_env(key: str, default: str = None, required: bool = False) -> str:
    """Obtiene variable de entorno con validación opcional."""
    valor = os.getenv(key, default)
    if required and not valor:
        raise EnvironmentError(f"Variable de entorno requerida no configurada: {key}")
    return valor


def _get_bool(key: str, default: bool = False) -> bool:
    """Obtiene variable de entorno como booleano."""
    return _get_env(key, str(default)).lower() in ('true', '1', 'yes', 'si')


def _get_float(key: str, default: float = 0.0) -> float:
    """Obtiene variable de entorno como float."""
    try:
        return float(_get_env(key, str(default)))
    except (ValueError, TypeError):
        return default


def _get_int(key: str, default: int = 0) -> int:
    """Obtiene variable de entorno como entero."""
    try:
        return int(_get_env(key, str(default)))
    except (ValueError, TypeError):
        return default


# --- Telegram ---
TELEGRAM_BOT_TOKEN = _get_env('TELEGRAM_BOT_TOKEN', required=True)
TELEGRAM_CHAT_ID = _get_env('TELEGRAM_CHAT_ID', required=True)

# --- Binance ---
BINANCE_API_KEY = _get_env('BINANCE_API_KEY', '')
BINANCE_API_SECRET = _get_env('BINANCE_API_SECRET', '')

# --- Gemini (Google AI Studio) ---
GEMINI_API_KEY = _get_env('GEMINI_API_KEY', '')

# --- Base de datos ---
DB_PATH = _get_env('DB_PATH', 'btc_bot.db')

# --- Intervalo de monitoreo (segundos) ---
MONITOR_INTERVAL = _get_int('MONITOR_INTERVAL', 300)  # 5 minutos

# --- Horarios de resumen diario (formato HH:MM, separados por coma) ---
RESUMEN_HORARIOS = _get_env('RESUMEN_HORARIOS', '09:00,21:00')

# --- Umbral de alerta de variación 24h (porcentaje) ---
ALERTA_VARIACION_24H = _get_float('ALERTA_VARIACION_24H', 5.0)

# --- Flags de fases ---
FASE_3_GEMINI = _get_bool('FASE_3_GEMINI', False)
FASE_4_MANUAL = _get_bool('FASE_4_MANUAL', False)
FASE_5_AUTO = _get_bool('FASE_5_AUTO', False)

# --- Fase 4/5: Límites de trading ---
TRADE_MAX_POR_OPERACION = _get_float('TRADE_MAX_POR_OPERACION', 50.0)  # USD
TRADE_MAX_POR_SEMANA = _get_float('TRADE_MAX_POR_SEMANA', 200.0)  # USD
STOP_LOSS_PORCENTAJE = _get_float('STOP_LOSS_PORCENTAJE', 20.0)  # % caída para pausa

# --- Símbolo de trading ---
TRADING_PAIR = _get_env('TRADING_PAIR', 'BTCUSDT')

# --- Zona horaria ---
TIMEZONE = _get_env('TIMEZONE', 'America/Argentina/Buenos_Aires')
