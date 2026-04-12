"""
telegram_client.py — Envío de mensajes, botones inline y recepción de comandos/callbacks.
Usa la API HTTP de Telegram directamente (sin dependencias pesadas).
"""

import json
import logging
import time
from typing import Optional, Callable

import requests

import config

logger = logging.getLogger(__name__)

BASE_URL = f"https://api.telegram.org/bot{config.TELEGRAM_BOT_TOKEN}"
TIMEOUT = 15


class TelegramClient:
    def __init__(self):
        self.chat_id = config.TELEGRAM_CHAT_ID
        self.ultimo_update_id = 0
        self.session = requests.Session()
        # Handlers para comandos y callbacks
        self._command_handlers: dict[str, Callable] = {}
        self._callback_handlers: dict[str, Callable] = {}

    def _request(self, method: str, data: dict = None) -> Optional[dict]:
        """Hace un request a la API de Telegram con reintentos."""
        for intento in range(3):
            try:
                response = self.session.post(
                    f"{BASE_URL}/{method}",
                    json=data,
                    timeout=TIMEOUT,
                )
                result = response.json()
                if not result.get('ok'):
                    logger.error(
                        f"Error Telegram API ({method}): "
                        f"{result.get('description', 'desconocido')}"
                    )
                    return None
                return result.get('result')
            except requests.exceptions.RequestException as e:
                logger.warning(f"Error Telegram (intento {intento + 1}): {e}")
                if intento < 2:
                    time.sleep(2 ** intento)
        logger.error(f"Todos los reintentos fallaron para Telegram {method}")
        return None

    # --- Envío de mensajes ---

    def enviar_mensaje(self, texto: str, parse_mode: str = 'Markdown') -> bool:
        """Envía un mensaje de texto al chat configurado."""
        result = self._request('sendMessage', {
            'chat_id': self.chat_id,
            'text': texto,
            'parse_mode': parse_mode,
        })
        if result:
            logger.debug(f"Mensaje enviado: {texto[:50]}...")
            return True
        return False

    def enviar_mensaje_con_botones(self, texto: str, botones: list,
                                    parse_mode: str = 'Markdown') -> bool:
        """
        Envía un mensaje con botones inline.
        botones: lista de dicts con 'texto' y 'callback_data'
        Ejemplo: [{'texto': '✅ Comprar', 'callback_data': 'comprar_123'}]
        """
        keyboard = {
            'inline_keyboard': [[
                {'text': b['texto'], 'callback_data': b['callback_data']}
                for b in botones
            ]]
        }

        result = self._request('sendMessage', {
            'chat_id': self.chat_id,
            'text': texto,
            'parse_mode': parse_mode,
            'reply_markup': json.dumps(keyboard),
        })
        if result:
            logger.debug("Mensaje con botones enviado")
            return True
        return False

    def editar_mensaje(self, message_id: int, texto: str,
                       parse_mode: str = 'Markdown') -> bool:
        """Edita un mensaje existente (quita botones al editar)."""
        result = self._request('editMessageText', {
            'chat_id': self.chat_id,
            'message_id': message_id,
            'text': texto,
            'parse_mode': parse_mode,
        })
        return result is not None

    def enviar_alerta_error(self, error: str):
        """Envía una alerta de error crítico por Telegram."""
        texto = f"🚨 *ERROR CRÍTICO*\n\n{error}\n\nEl bot sigue corriendo pero revisá el log."
        self.enviar_mensaje(texto)

    # --- Registro de handlers ---

    def registrar_comando(self, comando: str, handler: Callable):
        """Registra un handler para un comando (ej: /status, /auto)."""
        self._command_handlers[comando] = handler
        logger.debug(f"Comando registrado: /{comando}")

    def registrar_callback(self, prefijo: str, handler: Callable):
        """Registra un handler para un callback de botón inline."""
        self._callback_handlers[prefijo] = handler
        logger.debug(f"Callback registrado: {prefijo}")

    # --- Polling de updates ---

    def procesar_updates(self):
        """
        Obtiene y procesa updates pendientes de Telegram (comandos y callbacks).
        Diseñado para ser llamado periódicamente desde el loop principal.
        """
        data = self._request('getUpdates', {
            'offset': self.ultimo_update_id + 1,
            'timeout': 1,  # polling corto para no bloquear el loop
            'allowed_updates': ['message', 'callback_query'],
        })

        if not data:
            return

        for update in data:
            update_id = update.get('update_id', 0)
            if update_id > self.ultimo_update_id:
                self.ultimo_update_id = update_id

            # Procesar mensajes (comandos)
            message = update.get('message', {})
            texto = message.get('text', '')
            chat_id = str(message.get('chat', {}).get('id', ''))

            # Solo procesar mensajes del chat autorizado
            if texto and chat_id == str(self.chat_id):
                self._procesar_comando(texto)

            # Procesar callbacks de botones inline
            callback = update.get('callback_query')
            if callback:
                callback_chat_id = str(
                    callback.get('message', {}).get('chat', {}).get('id', '')
                )
                if callback_chat_id == str(self.chat_id):
                    self._procesar_callback(callback)

    def _procesar_comando(self, texto: str):
        """Procesa un comando recibido."""
        if not texto.startswith('/'):
            return

        partes = texto.split()
        comando = partes[0][1:]  # Quitar el /
        args = partes[1:] if len(partes) > 1 else []

        if comando in self._command_handlers:
            try:
                self._command_handlers[comando](args)
                logger.info(f"Comando procesado: /{comando} {' '.join(args)}")
            except Exception as e:
                logger.error(f"Error procesando comando /{comando}: {e}")
                self.enviar_mensaje(f"❌ Error procesando /{comando}: {e}")
        else:
            logger.debug(f"Comando no reconocido: /{comando}")

    def _procesar_callback(self, callback: dict):
        """Procesa un callback de botón inline."""
        callback_id = callback.get('id')
        callback_data = callback.get('data', '')
        message_id = callback.get('message', {}).get('message_id')

        # Responder al callback para quitar el "reloj" del botón
        self._request('answerCallbackQuery', {'callback_query_id': callback_id})

        # Buscar handler por prefijo
        for prefijo, handler in self._callback_handlers.items():
            if callback_data.startswith(prefijo):
                try:
                    handler(callback_data, message_id)
                    logger.info(f"Callback procesado: {callback_data}")
                except Exception as e:
                    logger.error(f"Error procesando callback {callback_data}: {e}")
                    self.enviar_mensaje(f"❌ Error procesando acción: {e}")
                return

        logger.debug(f"Callback no manejado: {callback_data}")
