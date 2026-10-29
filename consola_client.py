"""
consola_client.py — Alternativa a Telegram: muestra los mensajes en la consola
y lee comandos escritos por teclado. Tiene la misma interfaz que TelegramClient,
así main.py puede usar uno u otro sin cambios.
"""

import logging
import queue
import re
import sys
import threading
from datetime import datetime
from typing import Callable

logger = logging.getLogger(__name__)

SEPARADOR = "─" * 50


def _limpiar_markdown(texto: str) -> str:
    """Quita los marcadores de Markdown de Telegram (* y `) para la consola."""
    return re.sub(r'[*`]', '', texto)


class ConsolaClient:
    # main.py revisa la entrada cada segundo durante la espera entre ciclos
    polling_rapido = True

    def __init__(self):
        self._command_handlers: dict[str, Callable] = {}
        self._callback_handlers: dict[str, Callable] = {}
        self._entradas: queue.Queue = queue.Queue()
        # Botones pendientes: número que escribe el usuario -> (callback_data, message_id)
        self._opciones: dict[str, tuple] = {}
        self._ultima_opcion = 0
        self._ultimo_message_id = 0

        hilo = threading.Thread(target=self._leer_teclado, daemon=True)
        hilo.start()

    def _leer_teclado(self):
        """Hilo que lee líneas del teclado y las encola para el loop principal."""
        try:
            for linea in sys.stdin:
                linea = linea.strip()
                if linea:
                    self._entradas.put(linea)
        except (OSError, ValueError):
            # Sin consola interactiva (ej: corriendo en segundo plano)
            pass

    def _imprimir(self, texto: str) -> int:
        hora = datetime.now().strftime('%H:%M:%S')
        print(f"\n{SEPARADOR}\n[{hora}]\n{_limpiar_markdown(texto)}\n{SEPARADOR}", flush=True)
        self._ultimo_message_id += 1
        return self._ultimo_message_id

    # --- Envío de mensajes ---

    def enviar_mensaje(self, texto: str, parse_mode: str = 'Markdown') -> bool:
        self._imprimir(texto)
        return True

    def enviar_mensaje_con_botones(self, texto: str, botones: list,
                                    parse_mode: str = 'Markdown') -> bool:
        """Muestra el mensaje con opciones numeradas en lugar de botones."""
        message_id = self._imprimir(texto)
        lineas = []
        for boton in botones:
            self._ultima_opcion += 1
            numero = str(self._ultima_opcion)
            self._opciones[numero] = (boton['callback_data'], message_id)
            lineas.append(f"  [{numero}] {boton['texto']}")
        print("Escribí el número de la opción y apretá Enter:\n" + "\n".join(lineas), flush=True)
        return True

    def editar_mensaje(self, message_id: int, texto: str,
                       parse_mode: str = 'Markdown') -> bool:
        # En consola no se puede editar lo ya impreso: se muestra como mensaje nuevo
        self._imprimir(texto)
        return True

    def enviar_alerta_error(self, error: str):
        self._imprimir(f"🚨 ERROR CRÍTICO\n\n{error}\n\nEl bot sigue corriendo pero revisá el log.")

    # --- Registro de handlers ---

    def registrar_comando(self, comando: str, handler: Callable):
        self._command_handlers[comando] = handler

    def registrar_callback(self, prefijo: str, handler: Callable):
        self._callback_handlers[prefijo] = handler

    # --- Procesamiento de entradas ---

    def procesar_updates(self):
        """Procesa los comandos y opciones escritos por teclado desde el último llamado."""
        while not self._entradas.empty():
            linea = self._entradas.get_nowait()
            if linea in self._opciones:
                self._procesar_opcion(linea)
            elif linea.startswith('/'):
                self._procesar_comando(linea)
            else:
                print("Comando no reconocido. Escribí /help para ver los comandos.", flush=True)

    def _procesar_comando(self, texto: str):
        partes = texto.split()
        comando = partes[0][1:]
        args = partes[1:]

        handler = self._command_handlers.get(comando)
        if not handler:
            print(f"Comando no reconocido: /{comando}. Escribí /help.", flush=True)
            return
        try:
            handler(args)
        except Exception as e:
            logger.error(f"Error procesando comando /{comando}: {e}")
            self._imprimir(f"❌ Error procesando /{comando}: {e}")

    def _procesar_opcion(self, numero: str):
        callback_data, message_id = self._opciones[numero]
        # Una vez elegida una opción, se descartan las demás del mismo mensaje
        self._opciones = {
            k: v for k, v in self._opciones.items() if v[1] != message_id
        }
        for prefijo, handler in self._callback_handlers.items():
            if callback_data.startswith(prefijo):
                try:
                    handler(callback_data, message_id)
                except Exception as e:
                    logger.error(f"Error procesando opción {callback_data}: {e}")
                    self._imprimir(f"❌ Error procesando acción: {e}")
                return
