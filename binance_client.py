"""
binance_client.py — Consultas de precio, balance y ejecución de órdenes en Binance.
Fase 1-2: Solo precio público (sin API key).
Fase 4-5 y modo autónomo: Trading con API key autenticada.
"""

import time
import hmac
import hashlib
import logging
from decimal import Decimal, ROUND_DOWN
from urllib.parse import urlencode
from typing import Optional

import requests

import config

logger = logging.getLogger(__name__)

if config.BINANCE_TESTNET:
    # Testnet de Spot: dinero ficticio, keys creadas en testnet.binance.vision
    BASE_URL = 'https://testnet.binance.vision'
    FALLBACK_URLS = []
else:
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
        self._filtros = None  # Cache de reglas del par (stepSize, mínimo de orden)

    def _request(self, method: str, endpoint: str, params: dict = None,
                 firmado: bool = False, reintentar: bool = True) -> Optional[dict]:
        """
        Hace un request a Binance con reintentos y fallback de URLs.
        Las órdenes usan reintentar=False: si un timeout se reintentara,
        la orden podría ejecutarse dos veces.
        """
        urls = [BASE_URL] + FALLBACK_URLS
        if not reintentar:
            urls = [BASE_URL]

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

        intentos = MAX_REINTENTOS if reintentar else 1
        for intento in range(intentos):
            for base_url in urls:
                try:
                    url = f"{base_url}{endpoint}"
                    response = self.session.request(
                        method, url, params=params, timeout=TIMEOUT
                    )
                    if response.status_code >= 400:
                        # Binance explica el error en el cuerpo (saldo insuficiente, etc.)
                        logger.error(
                            f"Binance respondió {response.status_code} en {endpoint}: "
                            f"{response.text[:300]}"
                        )
                        # Un error 4xx no se arregla reintentando
                        if response.status_code < 500:
                            return None
                    response.raise_for_status()
                    return response.json()
                except requests.exceptions.RequestException as e:
                    logger.warning(
                        f"Error en {base_url}{endpoint} (intento {intento + 1}): {e}"
                    )
                    continue

            # Esperar antes de reintentar todas las URLs
            if intento < intentos - 1:
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

    def obtener_velas(self, intervalo: str, limite: int) -> list:
        """
        Obtiene velas (OHLCV) públicas del par. intervalo: '15m', '1h', '4h', etc.
        Retorna lista de dicts con timestamp (ms), apertura, maximo, minimo, cierre, volumen.
        """
        data = self._request('GET', '/api/v3/klines', {
            'symbol': config.TRADING_PAIR,
            'interval': intervalo,
            'limit': limite,
        })
        if not isinstance(data, list):
            logger.error(f"No se pudieron obtener velas {intervalo}")
            return []
        return [
            {
                'timestamp': v[0],
                'apertura': float(v[1]),
                'maximo': float(v[2]),
                'minimo': float(v[3]),
                'cierre': float(v[4]),
                'volumen': float(v[5]),
            }
            for v in data
        ]

    def obtener_filtros(self) -> Optional[dict]:
        """
        Obtiene las reglas del par: stepSize (precisión de la cantidad de BTC)
        y el monto mínimo de una orden en USDT. Se cachean porque casi nunca cambian.
        """
        if self._filtros:
            return self._filtros

        data = self._request('GET', '/api/v3/exchangeInfo', {'symbol': config.TRADING_PAIR})
        if not data or not data.get('symbols'):
            logger.error("No se pudieron obtener las reglas del par")
            return None

        filtros = {'step_size': Decimal('0.00001'), 'min_notional': 5.0}
        for f in data['symbols'][0].get('filters', []):
            if f['filterType'] == 'LOT_SIZE':
                filtros['step_size'] = Decimal(f['stepSize'])
            elif f['filterType'] in ('NOTIONAL', 'MIN_NOTIONAL'):
                filtros['min_notional'] = float(f.get('minNotional', 5.0))

        self._filtros = filtros
        return filtros

    def ajustar_cantidad(self, cantidad_btc: float) -> Decimal:
        """Redondea hacia abajo una cantidad de BTC al stepSize permitido por Binance."""
        filtros = self.obtener_filtros()
        step = filtros['step_size'] if filtros else Decimal('0.00001')
        cantidad = Decimal(str(cantidad_btc))
        return (cantidad / step).to_integral_value(rounding=ROUND_DOWN) * step

    # --- Fase 4-5: Balance y trading ---

    def obtener_balances(self) -> Optional[dict]:
        """Obtiene los balances disponibles de USDT y BTC en una sola consulta."""
        data = self._request('GET', '/api/v3/account', firmado=True)
        if not data or 'balances' not in data:
            logger.error("No se pudo obtener balance de cuenta")
            return None

        balances = {'USDT': 0.0, 'BTC': 0.0}
        for asset in data['balances']:
            if asset['asset'] in balances:
                balances[asset['asset']] = float(asset['free'])
        return balances

    def obtener_balance_usdt(self) -> Optional[float]:
        """Obtiene el balance disponible en USDT."""
        balances = self.obtener_balances()
        if balances is None:
            return None
        logger.info(f"Balance USDT disponible: {balances['USDT']}")
        return balances['USDT']

    def obtener_balance_btc(self) -> Optional[float]:
        """Obtiene el balance disponible en BTC."""
        balances = self.obtener_balances()
        if balances is None:
            return None
        logger.info(f"Balance BTC disponible: {balances['BTC']}")
        return balances['BTC']

    def obtener_valor_total(self, precio: float) -> Optional[float]:
        """Valor total de la cuenta en USDT: USDT libre + BTC valuado al precio actual."""
        balances = self.obtener_balances()
        if balances is None:
            return None
        return balances['USDT'] + balances['BTC'] * precio

    @staticmethod
    def _resumir_orden(data: dict) -> dict:
        """
        Extrae los datos relevantes de la respuesta de una orden de mercado,
        incluyendo las comisiones cobradas (vienen en el detalle de 'fills').
        """
        resultado = {
            'orden_id': data.get('orderId', ''),
            'symbol': data.get('symbol', ''),
            'status': data.get('status', ''),
            'cantidad_btc': float(data.get('executedQty', 0)),
            'monto_usdt': float(data.get('cummulativeQuoteQty', 0)),
            'comision_btc': 0.0,
            'comision_usdt': 0.0,
        }

        for fill in data.get('fills', []):
            comision = float(fill.get('commission', 0))
            if fill.get('commissionAsset') == 'BTC':
                resultado['comision_btc'] += comision
            elif fill.get('commissionAsset') == 'USDT':
                resultado['comision_usdt'] += comision

        if resultado['cantidad_btc'] > 0:
            resultado['precio_promedio'] = resultado['monto_usdt'] / resultado['cantidad_btc']
        else:
            resultado['precio_promedio'] = 0
        return resultado

    def ejecutar_compra_mercado(self, monto_usdt: float) -> Optional[dict]:
        """
        Ejecuta una orden de compra de mercado por un monto en USDT.
        Retorna detalles de la orden o None si falla.
        'cantidad_neta_btc' es lo que realmente queda en la cuenta después de la comisión.
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
            'newOrderRespType': 'FULL',
        }

        data = self._request('POST', '/api/v3/order', params=params,
                             firmado=True, reintentar=False)
        if not data:
            logger.error("Orden de compra fallida")
            return None

        resultado = self._resumir_orden(data)
        resultado['cantidad_neta_btc'] = resultado['cantidad_btc'] - resultado['comision_btc']

        logger.info(
            f"Compra ejecutada: {resultado['cantidad_btc']} BTC "
            f"a ~{resultado['precio_promedio']:.2f} USDT"
        )
        return resultado

    def ejecutar_venta_mercado(self, cantidad_btc: float) -> Optional[dict]:
        """
        Vende una cantidad de BTC a precio de mercado.
        La cantidad se redondea hacia abajo al stepSize del par.
        'monto_neto_usdt' es lo que realmente se recibe después de la comisión.
        """
        cantidad = self.ajustar_cantidad(cantidad_btc)
        if cantidad <= 0:
            logger.error(f"Cantidad inválida para venta: {cantidad_btc}")
            return None

        params = {
            'symbol': config.TRADING_PAIR,
            'side': 'SELL',
            'type': 'MARKET',
            'quantity': format(cantidad.normalize(), 'f'),
            'newOrderRespType': 'FULL',
        }

        data = self._request('POST', '/api/v3/order', params=params,
                             firmado=True, reintentar=False)
        if not data:
            logger.error("Orden de venta fallida")
            return None

        resultado = self._resumir_orden(data)
        resultado['monto_neto_usdt'] = resultado['monto_usdt'] - resultado['comision_usdt']

        logger.info(
            f"Venta ejecutada: {resultado['cantidad_btc']} BTC "
            f"a ~{resultado['precio_promedio']:.2f} USDT"
        )
        return resultado
