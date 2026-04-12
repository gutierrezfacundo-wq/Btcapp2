"""
analyzer.py — Cálculo de variaciones de precio y lógica de alertas.
Determina cuándo enviar alertas, resúmenes y cuándo activar análisis de Gemini.
"""

import logging
from datetime import datetime, timedelta
from typing import Optional

from database import Database
import config

logger = logging.getLogger(__name__)


class Analyzer:
    def __init__(self, db: Database):
        self.db = db
        self._ultima_alerta_24h: Optional[datetime] = None
        # Cooldown entre alertas para no spamear (30 minutos)
        self.cooldown_alerta = timedelta(minutes=30)

    def calcular_variacion(self, precio_actual: float, precio_anterior: float) -> float:
        """Calcula variación porcentual entre dos precios."""
        if not precio_anterior or precio_anterior == 0:
            return 0.0
        return ((precio_actual - precio_anterior) / precio_anterior) * 100

    def obtener_variaciones(self, precio_actual: float) -> dict:
        """
        Calcula variaciones en todos los timeframes.
        Retorna dict con variaciones y precios anteriores.
        """
        precio_1h = self.db.obtener_precio_hace(1)
        precio_24h = self.db.obtener_precio_hace(24)
        precio_7d = self.db.obtener_precio_hace(168)

        variaciones = {
            'precio_actual': precio_actual,
            'variacion_1h': self.calcular_variacion(precio_actual, precio_1h) if precio_1h else None,
            'variacion_24h': self.calcular_variacion(precio_actual, precio_24h) if precio_24h else None,
            'variacion_7d': self.calcular_variacion(precio_actual, precio_7d) if precio_7d else None,
            'precio_1h': precio_1h,
            'precio_24h': precio_24h,
            'precio_7d': precio_7d,
        }

        logger.debug(
            f"Variaciones: 1h={variaciones['variacion_1h']}, "
            f"24h={variaciones['variacion_24h']}, 7d={variaciones['variacion_7d']}"
        )
        return variaciones

    def debe_alertar_variacion(self, variaciones: dict) -> bool:
        """
        Determina si se debe enviar alerta por variación de precio.
        Alerta si la variación 24h supera el umbral configurado.
        Respeta cooldown para no enviar alertas repetidas.
        """
        var_24h = variaciones.get('variacion_24h')
        if var_24h is None:
            return False

        if abs(var_24h) < config.ALERTA_VARIACION_24H:
            return False

        # Verificar cooldown
        ahora = datetime.utcnow()
        if self._ultima_alerta_24h and (ahora - self._ultima_alerta_24h) < self.cooldown_alerta:
            logger.debug("Alerta en cooldown, esperando...")
            return False

        self._ultima_alerta_24h = ahora
        logger.info(f"Alerta activada: variación 24h = {var_24h:+.2f}%")
        return True

    def es_hora_resumen(self) -> bool:
        """
        Verifica si es hora de enviar el resumen periódico.
        Compara la hora actual con los horarios configurados.
        Usa una ventana de 5 minutos para no perder el momento.
        """
        try:
            # Importar pytz solo si se usa zona horaria
            import pytz
            tz = pytz.timezone(config.TIMEZONE)
            ahora = datetime.now(tz)
        except (ImportError, Exception):
            ahora = datetime.utcnow()
            logger.warning("pytz no disponible, usando UTC para horarios")

        hora_actual = ahora.strftime('%H:%M')
        horarios = [h.strip() for h in config.RESUMEN_HORARIOS.split(',')]

        for horario in horarios:
            try:
                hora_cfg = datetime.strptime(horario, '%H:%M')
                hora_check = ahora.replace(
                    hour=hora_cfg.hour, minute=hora_cfg.minute, second=0, microsecond=0
                )
                # Ventana de 5 minutos
                diferencia = abs((ahora - hora_check).total_seconds())
                if diferencia < 300:  # 5 minutos = 300 segundos
                    logger.info(f"Es hora de resumen ({horario})")
                    return True
            except ValueError:
                logger.warning(f"Horario mal formateado: {horario}")

        return False

    def formatear_resumen(self, variaciones: dict) -> str:
        """Formatea un mensaje de resumen para Telegram."""
        precio = variaciones['precio_actual']

        lineas = [
            "📊 *Resumen BTC/USDT*\n",
            f"💰 Precio actual: `${precio:,.2f}`\n",
        ]

        if variaciones['variacion_1h'] is not None:
            emoji = "📈" if variaciones['variacion_1h'] >= 0 else "📉"
            lineas.append(
                f"{emoji} Última hora: `{variaciones['variacion_1h']:+.2f}%`"
            )

        if variaciones['variacion_24h'] is not None:
            emoji = "📈" if variaciones['variacion_24h'] >= 0 else "📉"
            lineas.append(
                f"{emoji} Últimas 24h: `{variaciones['variacion_24h']:+.2f}%`"
            )

        if variaciones['variacion_7d'] is not None:
            emoji = "📈" if variaciones['variacion_7d'] >= 0 else "📉"
            lineas.append(
                f"{emoji} Últimos 7 días: `{variaciones['variacion_7d']:+.2f}%`"
            )

        return "\n".join(lineas)

    def formatear_alerta(self, variaciones: dict) -> str:
        """Formatea un mensaje de alerta de variación para Telegram."""
        precio = variaciones['precio_actual']
        var_24h = variaciones['variacion_24h']

        if var_24h >= 0:
            emoji = "🚀"
            direccion = "SUBIDA"
        else:
            emoji = "🔻"
            direccion = "CAÍDA"

        lineas = [
            f"{emoji} *ALERTA: {direccion} FUERTE*\n",
            f"💰 Precio actual: `${precio:,.2f}`",
            f"📊 Variación 24h: `{var_24h:+.2f}%`\n",
        ]

        if variaciones['variacion_1h'] is not None:
            lineas.append(f"⏱ Última hora: `{variaciones['variacion_1h']:+.2f}%`")

        if variaciones['variacion_7d'] is not None:
            lineas.append(f"📅 Últimos 7 días: `{variaciones['variacion_7d']:+.2f}%`")

        return "\n".join(lineas)

    def formatear_reporte_semanal(self, operaciones: list,
                                   balance_actual: float,
                                   balance_inicial: float) -> str:
        """Formatea el reporte semanal de operaciones para Telegram."""
        total_operaciones = len(operaciones)
        total_gastado = sum(op['monto_usdt'] for op in operaciones)
        total_btc = sum(op['cantidad_btc'] for op in operaciones)

        if balance_inicial and balance_inicial > 0:
            rendimiento = ((balance_actual - balance_inicial) / balance_inicial) * 100
            rendimiento_texto = f"`{rendimiento:+.2f}%`"
        else:
            rendimiento_texto = "N/A"

        lineas = [
            "📋 *Reporte Semanal*\n",
            f"📊 Operaciones: `{total_operaciones}`",
            f"💸 Total invertido: `${total_gastado:,.2f} USDT`",
            f"₿ BTC comprado: `{total_btc:.8f}`",
            f"💰 Balance actual: `${balance_actual:,.2f} USDT`",
            f"📈 Rendimiento: {rendimiento_texto}",
        ]

        if operaciones:
            lineas.append("\n*Últimas operaciones:*")
            for op in operaciones[:5]:  # Mostrar últimas 5
                lineas.append(
                    f"  • {op['timestamp'][:10]}: "
                    f"{op['cantidad_btc']:.6f} BTC "
                    f"(${op['monto_usdt']:.2f}) "
                    f"[{op['modo']}]"
                )

        return "\n".join(lineas)

    def verificar_stop_loss(self, balance_actual: float) -> bool:
        """
        Verifica si el balance cayó más del porcentaje de stop-loss
        respecto al balance inicial. Retorna True si se debe pausar.
        """
        balance_inicial = self.db.obtener_balance_inicial()
        if not balance_inicial or balance_inicial <= 0:
            return False

        caida = ((balance_inicial - balance_actual) / balance_inicial) * 100

        if caida >= config.STOP_LOSS_PORCENTAJE:
            logger.warning(
                f"STOP-LOSS activado: balance cayó {caida:.2f}% "
                f"(inicial: ${balance_inicial:.2f}, actual: ${balance_actual:.2f})"
            )
            return True

        return False
