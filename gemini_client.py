"""
gemini_client.py — Integración con Gemini API (Google AI Studio, free tier).
Construye prompts con datos de mercado y obtiene análisis en español.
"""

import json
import logging
from typing import Optional

import requests

import config

logger = logging.getLogger(__name__)

GEMINI_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models/"
    "gemini-2.0-flash:generateContent"
)
TIMEOUT = 30  # segundos


class GeminiClient:
    def __init__(self):
        self.api_key = config.GEMINI_API_KEY

    def _disponible(self) -> bool:
        """Verifica si Gemini está configurado."""
        if not self.api_key:
            logger.warning("GEMINI_API_KEY no configurada")
            return False
        return True

    def analizar_mercado(self, precio_actual: float, variacion_1h: float,
                         variacion_24h: float, variacion_7d: float,
                         historial_7d: list, balance_usdt: float = 0.0) -> Optional[dict]:
        """
        Envía datos de mercado a Gemini y obtiene análisis.
        Retorna dict con 'texto', 'recomendacion' ('comprar'/'esperar'/'ignorar'),
        'porcentaje_recomendado' y 'confianza' ('alta'/'media'/'baja').
        """
        if not self._disponible():
            return None

        # Construir resumen del historial (muestreo cada 2 horas para no exceder tokens)
        historial_resumido = []
        paso = max(1, len(historial_7d) // 84)  # ~84 puntos en 7 días con muestreo cada 2h
        for i in range(0, len(historial_7d), paso):
            punto = historial_7d[i]
            historial_resumido.append(
                f"  {punto['timestamp'][:16]}: ${punto['precio']:,.2f}"
            )

        historial_texto = "\n".join(historial_resumido[-84:])  # máximo 84 puntos

        prompt = f"""Sos un analista de criptomonedas experto. Analizá los siguientes datos de Bitcoin y respondé EN ESPAÑOL.

DATOS ACTUALES:
- Precio actual: ${precio_actual:,.2f} USDT
- Variación última hora: {variacion_1h:+.2f}%
- Variación últimas 24h: {variacion_24h:+.2f}%
- Variación últimos 7 días: {variacion_7d:+.2f}%
- Balance disponible en USDT: ${balance_usdt:,.2f}

HISTORIAL DE PRECIOS (últimos 7 días):
{historial_texto}

INSTRUCCIONES:
1. Analizá brevemente qué está pasando con el precio (2-3 oraciones)
2. Indicá si es buen momento para comprar, esperar o ignorar
3. Si recomendás comprar, indicá qué porcentaje del balance disponible usar (entre 5% y 50%)
4. Indicá tu nivel de confianza: alta, media o baja

RESPONDÉ EXCLUSIVAMENTE en este formato JSON (sin markdown, sin backticks):
{{
    "analisis": "tu análisis aquí",
    "recomendacion": "comprar" o "esperar" o "ignorar",
    "porcentaje_recomendado": número entre 0 y 50,
    "confianza": "alta" o "media" o "baja"
}}"""

        try:
            response = requests.post(
                f"{GEMINI_URL}?key={self.api_key}",
                json={
                    "contents": [{"parts": [{"text": prompt}]}],
                    "generationConfig": {
                        "temperature": 0.3,
                        "maxOutputTokens": 500,
                    }
                },
                timeout=TIMEOUT,
            )
            response.raise_for_status()
            data = response.json()

            # Extraer texto de la respuesta
            texto_respuesta = (
                data.get('candidates', [{}])[0]
                .get('content', {})
                .get('parts', [{}])[0]
                .get('text', '')
            )

            if not texto_respuesta:
                logger.error("Respuesta vacía de Gemini")
                return None

            # Limpiar posibles backticks markdown
            texto_limpio = texto_respuesta.strip()
            if texto_limpio.startswith('```'):
                texto_limpio = texto_limpio.split('\n', 1)[-1]
            if texto_limpio.endswith('```'):
                texto_limpio = texto_limpio.rsplit('```', 1)[0]
            texto_limpio = texto_limpio.strip()

            # Parsear JSON
            resultado = json.loads(texto_limpio)

            # Validar campos obligatorios
            campos = ['analisis', 'recomendacion', 'porcentaje_recomendado', 'confianza']
            for campo in campos:
                if campo not in resultado:
                    logger.error(f"Campo faltante en respuesta de Gemini: {campo}")
                    return None

            # Normalizar valores
            resultado['recomendacion'] = resultado['recomendacion'].lower().strip()
            resultado['confianza'] = resultado['confianza'].lower().strip()
            resultado['porcentaje_recomendado'] = min(
                50, max(0, float(resultado['porcentaje_recomendado']))
            )

            # Agregar campo de texto formateado para Telegram
            resultado['texto'] = (
                f"🤖 *Análisis de Gemini*\n\n"
                f"{resultado['analisis']}\n\n"
                f"📊 *Recomendación:* {resultado['recomendacion'].upper()}\n"
                f"💰 *% del balance:* {resultado['porcentaje_recomendado']:.0f}%\n"
                f"🎯 *Confianza:* {resultado['confianza'].upper()}"
            )

            logger.info(
                f"Análisis Gemini: {resultado['recomendacion']} "
                f"({resultado['confianza']}) - {resultado['porcentaje_recomendado']}%"
            )
            return resultado

        except json.JSONDecodeError as e:
            logger.error(f"Error parseando respuesta JSON de Gemini: {e}")
            logger.debug(f"Respuesta raw: {texto_respuesta[:500] if 'texto_respuesta' in dir() else 'N/A'}")
            return None
        except requests.exceptions.RequestException as e:
            logger.error(f"Error de conexión con Gemini: {e}")
            return None
        except (KeyError, IndexError) as e:
            logger.error(f"Error procesando respuesta de Gemini: {e}")
            return None
