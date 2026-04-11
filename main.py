"""
main.py — Loop principal del bot de monitoreo y trading de BTC.
Orquesta todas las fases: monitoreo, análisis, trading manual y automático.
"""

import logging
import sys
import time
import uuid
from datetime import datetime

import config
from database import Database
from binance_client import BinanceClient
from gemini_client import GeminiClient
from telegram_client import TelegramClient
from analyzer import Analyzer

# --- Configurar logging ---
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler('btc_bot.log', encoding='utf-8'),
    ]
)
logger = logging.getLogger(__name__)


class BTCBot:
    """Bot principal que orquesta monitoreo, análisis y trading."""

    def __init__(self):
        logger.info("Inicializando BTC Bot...")

        # Componentes
        self.db = Database(config.DB_PATH)
        self.binance = BinanceClient()
        self.gemini = GeminiClient()
        self.telegram = TelegramClient()
        self.analyzer = Analyzer(self.db)

        # Estado
        self._resumen_enviado_key = None  # Para evitar enviar resumen duplicado
        self._corriendo = True

        # Registrar comandos de Telegram
        self._registrar_comandos()

        logger.info("Bot inicializado correctamente")

    def _registrar_comandos(self):
        """Registra los comandos disponibles en Telegram."""
        self.telegram.registrar_comando('status', self._cmd_status)
        self.telegram.registrar_comando('precio', self._cmd_precio)
        self.telegram.registrar_comando('resumen', self._cmd_resumen)
        self.telegram.registrar_comando('help', self._cmd_help)
        self.telegram.registrar_comando('ayuda', self._cmd_help)

        if config.FASE_5_AUTO:
            self.telegram.registrar_comando('auto', self._cmd_auto)
            self.telegram.registrar_comando('reporte', self._cmd_reporte)

        # Callbacks de botones inline (Fase 4)
        if config.FASE_4_MANUAL:
            self.telegram.registrar_callback('comprar_', self._callback_comprar)
            self.telegram.registrar_callback('ignorar_', self._callback_ignorar)

    # --- Comandos de Telegram ---

    def _cmd_status(self, args: list):
        """Comando /status — Estado general del bot."""
        modo = "AUTOMÁTICO" if self.db.es_modo_auto() else "MANUAL"
        fases = []
        fases.append("1-2: Monitoreo ✅")
        fases.append(f"3: Gemini {'✅' if config.FASE_3_GEMINI else '❌'}")
        fases.append(f"4: Trading manual {'✅' if config.FASE_4_MANUAL else '❌'}")
        fases.append(f"5: Auto-trading {'✅' if config.FASE_5_AUTO else '❌'}")

        ultimo_precio = self.db.obtener_ultimo_precio()
        precio_texto = f"${ultimo_precio:,.2f}" if ultimo_precio else "Sin datos"

        texto = (
            f"🤖 *Estado del Bot*\n\n"
            f"📡 Modo: *{modo}*\n"
            f"💰 Último precio: `{precio_texto}`\n"
            f"⏱ Intervalo: `{config.MONITOR_INTERVAL}s`\n\n"
            f"*Fases activas:*\n" + "\n".join(f"  {f}" for f in fases)
        )
        self.telegram.enviar_mensaje(texto)

    def _cmd_precio(self, args: list):
        """Comando /precio — Precio actual con variaciones."""
        precio = self.binance.obtener_precio()
        if not precio:
            self.telegram.enviar_mensaje("❌ No se pudo obtener el precio actual")
            return

        variaciones = self.analyzer.obtener_variaciones(precio)
        resumen = self.analyzer.formatear_resumen(variaciones)
        self.telegram.enviar_mensaje(resumen)

    def _cmd_resumen(self, args: list):
        """Comando /resumen — Resumen completo bajo demanda."""
        self._enviar_resumen()

    def _cmd_help(self, args: list):
        """Comando /help — Lista de comandos disponibles."""
        comandos = [
            "/status — Estado del bot y fases activas",
            "/precio — Precio actual con variaciones",
            "/resumen — Resumen completo",
            "/ayuda — Este mensaje",
        ]

        if config.FASE_5_AUTO:
            comandos.extend([
                "/auto on — Activar modo automático",
                "/auto off — Desactivar modo automático",
                "/reporte — Reporte semanal de operaciones",
            ])

        texto = "📖 *Comandos disponibles:*\n\n" + "\n".join(comandos)
        self.telegram.enviar_mensaje(texto)

    def _cmd_auto(self, args: list):
        """Comando /auto on|off — Activar/desactivar modo automático."""
        if not config.FASE_5_AUTO:
            self.telegram.enviar_mensaje("❌ Fase 5 (auto-trading) no está habilitada")
            return

        if not args:
            estado = "activado" if self.db.es_modo_auto() else "desactivado"
            self.telegram.enviar_mensaje(f"🤖 Modo automático: *{estado}*")
            return

        if args[0].lower() == 'on':
            self.db.set_modo_auto(True)
            self.telegram.enviar_mensaje("✅ Modo automático *ACTIVADO*")
            logger.info("Modo automático activado por comando Telegram")
        elif args[0].lower() == 'off':
            self.db.set_modo_auto(False)
            self.telegram.enviar_mensaje("⏸ Modo automático *DESACTIVADO*")
            logger.info("Modo automático desactivado por comando Telegram")
        else:
            self.telegram.enviar_mensaje("Uso: /auto on | /auto off")

    def _cmd_reporte(self, args: list):
        """Comando /reporte — Reporte semanal de operaciones."""
        self._enviar_reporte_semanal()

    # --- Callbacks de botones inline ---

    def _callback_comprar(self, callback_data: str, message_id: int):
        """Callback del botón ✅ Comprar."""
        if not config.FASE_4_MANUAL:
            return

        # Extraer monto del callback_data: comprar_<monto>_<id>
        try:
            partes = callback_data.split('_')
            monto_usdt = float(partes[1])
        except (IndexError, ValueError):
            self.telegram.enviar_mensaje("❌ Error al procesar la orden")
            return

        # Validar límite semanal
        gastado_semana = self.db.monto_operado_semana()
        if gastado_semana + monto_usdt > config.TRADE_MAX_POR_SEMANA:
            self.telegram.editar_mensaje(
                message_id,
                f"❌ Orden cancelada: excede límite semanal "
                f"(${gastado_semana:.2f} + ${monto_usdt:.2f} > "
                f"${config.TRADE_MAX_POR_SEMANA:.2f})"
            )
            return

        # Ejecutar compra
        self.telegram.editar_mensaje(message_id, "⏳ Ejecutando orden de compra...")
        resultado = self.binance.ejecutar_compra_mercado(monto_usdt)

        if resultado:
            self.db.guardar_operacion(
                tipo='compra',
                precio=resultado['precio_promedio'],
                cantidad_btc=resultado['cantidad_btc'],
                monto_usdt=resultado['monto_usdt'],
                modo='manual',
                orden_id=str(resultado['orden_id']),
                notas='Orden manual confirmada por Telegram',
            )
            texto = (
                f"✅ *Orden ejecutada*\n\n"
                f"₿ Cantidad: `{resultado['cantidad_btc']:.8f} BTC`\n"
                f"💰 Precio: `${resultado['precio_promedio']:,.2f}`\n"
                f"💸 Gastado: `${resultado['monto_usdt']:.2f} USDT`\n"
                f"🔖 Orden ID: `{resultado['orden_id']}`"
            )
            self.telegram.editar_mensaje(message_id, texto)
        else:
            self.telegram.editar_mensaje(message_id, "❌ Error ejecutando la orden")

    def _callback_ignorar(self, callback_data: str, message_id: int):
        """Callback del botón ❌ Ignorar."""
        self.telegram.editar_mensaje(
            message_id,
            "⏭ Oportunidad ignorada. Se registró la decisión."
        )
        logger.info("Usuario ignoró oportunidad de compra")

    # --- Lógica principal ---

    def _enviar_resumen(self):
        """Obtiene precio y envía resumen por Telegram."""
        precio = self.binance.obtener_precio()
        if not precio:
            logger.error("No se pudo obtener precio para resumen")
            return

        variaciones = self.analyzer.obtener_variaciones(precio)
        resumen = self.analyzer.formatear_resumen(variaciones)
        self.telegram.enviar_mensaje(resumen)

    def _enviar_reporte_semanal(self):
        """Genera y envía reporte semanal."""
        operaciones = self.db.obtener_operaciones_semana()
        balance_actual = self.binance.obtener_balance_usdt() or 0
        balance_inicial = self.db.obtener_balance_inicial() or 0

        reporte = self.analyzer.formatear_reporte_semanal(
            operaciones, balance_actual, balance_inicial
        )
        self.telegram.enviar_mensaje(reporte)

    def _procesar_alerta_gemini(self, variaciones: dict):
        """
        Fase 3: Llama a Gemini para análisis cuando hay alerta de variación.
        Fase 4: Incluye botones de comprar/ignorar.
        Fase 5: Ejecuta automáticamente si corresponde.
        """
        if not config.FASE_3_GEMINI:
            return

        # Obtener datos para Gemini
        balance_usdt = 0.0
        if config.FASE_4_MANUAL or config.FASE_5_AUTO:
            balance_usdt = self.binance.obtener_balance_usdt() or 0.0

        historial = self.db.obtener_historial_precios(168)  # 7 días

        # Llamar a Gemini
        analisis = self.gemini.analizar_mercado(
            precio_actual=variaciones['precio_actual'],
            variacion_1h=variaciones['variacion_1h'] or 0,
            variacion_24h=variaciones['variacion_24h'] or 0,
            variacion_7d=variaciones['variacion_7d'] or 0,
            historial_7d=historial,
            balance_usdt=balance_usdt,
        )

        if not analisis:
            logger.error("No se pudo obtener análisis de Gemini")
            return

        # Guardar análisis en DB
        self.db.guardar_analisis(
            precio_actual=variaciones['precio_actual'],
            variacion_1h=variaciones['variacion_1h'] or 0,
            variacion_24h=variaciones['variacion_24h'] or 0,
            variacion_7d=variaciones['variacion_7d'] or 0,
            respuesta_gemini=analisis['texto'],
            recomendacion=analisis['recomendacion'],
            porcentaje_recomendado=analisis['porcentaje_recomendado'],
        )

        # Calcular monto de compra
        monto_compra = 0.0
        if analisis['recomendacion'] == 'comprar' and balance_usdt > 0:
            monto_compra = balance_usdt * (analisis['porcentaje_recomendado'] / 100)
            monto_compra = min(monto_compra, config.TRADE_MAX_POR_OPERACION)
            monto_compra = round(monto_compra, 2)

        # Fase 5: Auto-trading
        if (config.FASE_5_AUTO and self.db.es_modo_auto()
                and analisis['recomendacion'] == 'comprar'
                and analisis['confianza'] == 'alta'
                and monto_compra > 0):

            # Verificar stop-loss
            if self.analyzer.verificar_stop_loss(balance_usdt):
                self.db.set_modo_auto(False)
                self.telegram.enviar_mensaje(
                    "🛑 *STOP-LOSS ACTIVADO*\n\n"
                    "El balance cayó demasiado. Modo automático desactivado."
                )
                return

            # Verificar límite semanal
            gastado_semana = self.db.monto_operado_semana()
            if gastado_semana + monto_compra > config.TRADE_MAX_POR_SEMANA:
                self.telegram.enviar_mensaje(
                    f"⚠️ Compra automática cancelada: excede límite semanal\n"
                    f"Gastado: ${gastado_semana:.2f} / ${config.TRADE_MAX_POR_SEMANA:.2f}"
                )
                return

            # Ejecutar compra automática
            self.telegram.enviar_mensaje(
                f"{analisis['texto']}\n\n"
                f"🤖 *Ejecutando compra automática por ${monto_compra:.2f} USDT...*"
            )

            resultado = self.binance.ejecutar_compra_mercado(monto_compra)
            if resultado:
                self.db.guardar_operacion(
                    tipo='compra',
                    precio=resultado['precio_promedio'],
                    cantidad_btc=resultado['cantidad_btc'],
                    monto_usdt=resultado['monto_usdt'],
                    modo='automatico',
                    orden_id=str(resultado['orden_id']),
                    notas=f"Auto-trade (confianza: {analisis['confianza']})",
                )
                self.telegram.enviar_mensaje(
                    f"✅ *Compra automática ejecutada*\n\n"
                    f"₿ Cantidad: `{resultado['cantidad_btc']:.8f} BTC`\n"
                    f"💰 Precio: `${resultado['precio_promedio']:,.2f}`\n"
                    f"💸 Gastado: `${resultado['monto_usdt']:.2f} USDT`"
                )
            else:
                self.telegram.enviar_mensaje("❌ Error en compra automática")
            return

        # Fase 4: Botones manuales
        if (config.FASE_4_MANUAL
                and analisis['recomendacion'] == 'comprar'
                and monto_compra > 0):
            uid = uuid.uuid4().hex[:8]
            botones = [
                {'texto': f'✅ Comprar ${monto_compra:.2f}',
                 'callback_data': f'comprar_{monto_compra}_{uid}'},
                {'texto': '❌ Ignorar',
                 'callback_data': f'ignorar_{uid}'},
            ]
            self.telegram.enviar_mensaje_con_botones(
                f"{analisis['texto']}\n\n"
                f"💵 Monto sugerido: `${monto_compra:.2f} USDT`",
                botones,
            )
        else:
            # Solo enviar análisis sin botones
            self.telegram.enviar_mensaje(analisis['texto'])

    def ciclo(self):
        """Ejecuta un ciclo completo de monitoreo."""
        # 1. Obtener precio actual
        precio = self.binance.obtener_precio()
        if not precio:
            logger.warning("No se pudo obtener precio en este ciclo")
            return

        # 2. Guardar precio en DB
        self.db.guardar_precio(precio)

        # 3. Calcular variaciones
        variaciones = self.analyzer.obtener_variaciones(precio)

        # 4. Verificar si hay que enviar resumen periódico
        if self.analyzer.es_hora_resumen():
            clave_resumen = datetime.utcnow().strftime('%Y-%m-%d-%H')
            if self._resumen_enviado_key != clave_resumen:
                self._resumen_enviado_key = clave_resumen
                resumen = self.analyzer.formatear_resumen(variaciones)
                self.telegram.enviar_mensaje(resumen)
                logger.info("Resumen periódico enviado")

        # 5. Verificar alerta de variación
        if self.analyzer.debe_alertar_variacion(variaciones):
            alerta = self.analyzer.formatear_alerta(variaciones)
            self.telegram.enviar_mensaje(alerta)

            # Fase 3+: Análisis con Gemini
            self._procesar_alerta_gemini(variaciones)

        # 6. Verificar stop-loss (Fase 5)
        if config.FASE_5_AUTO and self.db.es_modo_auto():
            balance = self.binance.obtener_balance_usdt()
            if balance is not None and self.analyzer.verificar_stop_loss(balance):
                self.db.set_modo_auto(False)
                self.telegram.enviar_mensaje(
                    "🛑 *STOP-LOSS ACTIVADO*\n\n"
                    "El portfolio cayó más del "
                    f"{config.STOP_LOSS_PORCENTAJE}% desde el inicio.\n"
                    "Modo automático *DESACTIVADO*."
                )

        # 7. Procesar comandos/callbacks de Telegram
        self.telegram.procesar_updates()

    def _guardar_balance_inicial_si_necesario(self):
        """Guarda el balance inicial si aún no se registró (para stop-loss)."""
        if config.FASE_5_AUTO and not self.db.obtener_balance_inicial():
            balance = self.binance.obtener_balance_usdt()
            if balance is not None:
                self.db.guardar_balance_inicial(balance)
                logger.info(f"Balance inicial registrado: ${balance:.2f}")

    def iniciar(self):
        """Inicia el loop principal del bot."""
        logger.info("=" * 50)
        logger.info("BTC Bot iniciando...")
        logger.info(f"Intervalo de monitoreo: {config.MONITOR_INTERVAL}s")
        logger.info(f"Fase 3 (Gemini): {'ON' if config.FASE_3_GEMINI else 'OFF'}")
        logger.info(f"Fase 4 (Manual): {'ON' if config.FASE_4_MANUAL else 'OFF'}")
        logger.info(f"Fase 5 (Auto): {'ON' if config.FASE_5_AUTO else 'OFF'}")
        logger.info("=" * 50)

        # Enviar mensaje de inicio por Telegram
        self.telegram.enviar_mensaje(
            "🟢 *BTC Bot iniciado*\n\n"
            f"⏱ Intervalo: `{config.MONITOR_INTERVAL}s`\n"
            "Enviá /help para ver los comandos disponibles."
        )

        # Guardar balance inicial si aplica
        self._guardar_balance_inicial_si_necesario()

        # Reporte semanal check (cada lunes a las 9am)
        ultimo_reporte_semanal = None

        while self._corriendo:
            try:
                self.ciclo()

                # Reporte semanal los lunes (Fase 5)
                if config.FASE_5_AUTO:
                    ahora = datetime.utcnow()
                    if (ahora.weekday() == 0 and ahora.hour == 9
                            and ultimo_reporte_semanal != ahora.date()):
                        ultimo_reporte_semanal = ahora.date()
                        self._enviar_reporte_semanal()

            except KeyboardInterrupt:
                logger.info("Bot detenido por el usuario")
                self.telegram.enviar_mensaje("🔴 *Bot detenido manualmente*")
                break
            except Exception as e:
                logger.error(f"Error en ciclo principal: {e}", exc_info=True)
                try:
                    self.telegram.enviar_alerta_error(str(e))
                except Exception:
                    logger.error("No se pudo enviar alerta de error por Telegram")

            # Esperar hasta el próximo ciclo
            try:
                time.sleep(config.MONITOR_INTERVAL)
            except KeyboardInterrupt:
                logger.info("Bot detenido por el usuario durante espera")
                self.telegram.enviar_mensaje("🔴 *Bot detenido manualmente*")
                break


if __name__ == '__main__':
    bot = BTCBot()
    bot.iniciar()
