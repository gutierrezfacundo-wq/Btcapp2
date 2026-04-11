"""
binance_client.py — Consultas de precio, balance y ejecución de órdenes en Binance.
Fase 1-2: Solo precio público (sin API key).
Fase 4-5: Trading con API key autenticada.
"""

import time
import hmac
import hashlib
import logging
from urllib.parse import urlencode
from typing import Optional

import requests

import config

logger = logging.getLogger(__name__)

BASE_URL = 'https://api.binance.com'
# Fallback si la API principal no responde
FALLBACK_URLS = [
    'https://api1.binance.com',
    'https://api2.binance.com',
    'https://api3.binance.com',
]

MAX_REINTENTOS = 3
TIMEOUT = 10  # segundos


class BinanceClient:
    def __init__(self):
        self.api_key = config.BINANCE_API_KEY
        self.api_secret = config.BINANCE_API_SECRET
        self.session = requests.Session()
        if self.api_key:
            self.session.headers.update({'X-MBX-APIKEY': self.api_key})

    def _request(self, method: str, endpoint: str, params: dict = None,
                 firmado: bool = False) -> Optional[dict]:
        """Hace un request a Binance con reintentos y fallback de URLs."""
        urls = [BASE_URL] + FALLBACK_URLS

        if firmado:
            if not self.api_key or not self.api_secret:
                logger.error("API key/secret de Binance no configuradas para request firmado")
                return None
            params = params or {}
            params['timestamp'] = int(time.time() * 1000)
            params['recvWindow'] = 5000
            query_string = urlencode(params)
            params['signature'] = hmac.new(
                self.api_secret.encode('utf-8'),
                query_string.encode('utf-8'),
                hashlib.sha256
            ).hexdigest()

        for intento in range(MAX_REINTENTOS):
            for base_url in urls:
                try:
                    url = f"{base_url}{endpoint}"
                    response = self.session.request(
                        method, url, params=params, timeout=TIMEOUT
                    )
                    response.raise_for_status()
                    return response.json()
                except requests.exceptions.RequestException as e:
                    logger.warning(
                        f"Error en {base_url}{endpoint} (intento {intento + 1}): {e}"
                    )
                    continue

            # Esperar antes de reintentar todas las URLs
            if intento < MAX_REINTENTOS - 1:
                espera = 2 ** intento
                logger.info(f"Esperando {espera}s antes de reintentar...")
                time.sleep(espera)

        logger.error(f"Todos los reintentos fallaron para {endpoint}")
        return None

    # --- Fase 1-2: Precio público ---

    def obtener_precio(self, symbol: str = None) -> Optional[float]:
        """Obtiene el precio actual de BTC/USDT (endpoint público, sin API key)."""
        symbol = symbol or config.TRADING_PAIR
        data = self._request('GET', '/api/v3/ticker/price', {'symbol': symbol})
        if data and 'price' in data:
            precio = float(data['price'])
            logger.debug(f"Precio {symbol}: {precio}")
            return precio
        logger.error(f"No se pudo obtener precio para {symbol}")
        return None

    # --- Fase 4-5: Balance y trading ---

    def obtener_balance_usdt(self) -> Optional[float]:
        """Obtiene el balance disponible en USDT."""
        data = self._request('GET', '/api/v3/account', firmado=True)
        if not data or 'balances' not in data:
            logger.error("No se pudo obtener balance de cuenta")
            return None

        for asset in data['balances']:
            if asset['asset'] == 'USDT':
                balance = float(asset['free'])
                logger.info(f"Balance USDT disponible: {balance}")
                return balance

        logger.warning("No se encontró balance USDT")
        return 0.0

    def obtener_balance_btc(self) -> Optional[float]:
        """Obtiene el balance disponible en BTC."""
        data = self._request('GET', '/api/v3/account', firmado=True)
        if not data or 'balances' not in data:
            logger.error("No se pudo obtener balance de cuenta")
            return None

        for asset in data['balances']:
            if asset['asset'] == 'BTC':
                balance = float(asset['free'])
                logger.info(f"Balance BTC disponible: {balance}")
                return balance

        logger.warning("No se encontró balance BTC")
        return 0.0

    def ejecutar_compra_mercado(self, monto_usdt: float) -> Optional[dict]:
        """
        Ejecuta una orden de compra de mercado por un monto en USDT.
        Retorna detalles de la orden o None si falla.
        """
        if monto_usdt <= 0:
            logger.error(f"Monto inválido para compra: {monto_usdt}")
            return None

        # Validar límite por operación
        if monto_usdt > config.TRADE_MAX_POR_OPERACION:
            logger.error(
                f"Monto {monto_usdt} excede límite por operación "
                f"({config.TRADE_MAX_POR_OPERACION})"
            )
            return None

        params = {
            'symbol': config.TRADING_PAIR,
            'side': 'BUY',
            'type': 'MARKET',
            'quoteOrderQty': f"{monto_usdt:.2f}",
        }

        data = self._request('POST', '/api/v3/order', params=params, firmado=True)

        if not data:
            logger.error("Orden de compra fallida")
            return None

        # Extraer info relevante de la respuesta
        resultado = {
            'orden_id': data.get('orderId', ''),
            'symbol': data.get('symbol', ''),
            'status': data.get('status', ''),
            'cantidad_btc': float(data.get('executedQty', 0)),
            'monto_usdt': float(data.get('cummulativeQuoteQty', 0)),
        }

        # Calcular precio promedio
        if resultado['cantidad_btc'] > 0:
            resultado['precio_promedio'] = (
                resultado['monto_usdt'] / resultado['cantidad_btc']
            )
        else:
            resultado['precio_promedio'] = 0

        logger.info(
            f"Orden ejecutada: {resultado['cantidad_btc']} BTC "
            f"a ~{resultado['precio_promedio']:.2f} USDT"
        )
        return resultado
