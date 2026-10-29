"""
gemini_client.py — Integración con Gemini API (Google AI Studio, free tier).
Construye prompts con datos de mercado y obtiene análisis en español.
"""

import json
from datetime import datetime
import logging
from typing import Optional

import requests

import config

logger = logging.getLogger(__name__)

GEMINI_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models/"
    f"{config.GEMINI_MODEL}:generateContent"
)
OPENAI_URL = "https://api.openai.com/v1/chat/completions"
TIMEOUT = 60  # segundos


class GeminiClient:
    """Cliente de IA. Usa Gemini u OpenAI según IA_PROVEEDOR en .env."""

    def __init__(self):
        self.usa_openai = config.IA_PROVEEDOR == 'openai'
        if self.usa_openai:
            self.api_key = config.OPENAI_API_KEY
            self.nombre = 'OpenAI'
        else:
            self.api_key = config.GEMINI_API_KEY
            self.nombre = 'Gemini'

    def _disponible(self) -> bool:
        """Verifica si el proveedor de IA está configurado."""
        if not self.api_key:
            logger.warning(f"{'OPENAI' if self.usa_openai else 'GEMINI'}_API_KEY no configurada")
            return False
        return True

    def _pedir_texto_gemini(self, prompt: str) -> str:
        response = requests.post(
            f"{GEMINI_URL}?key={self.api_key}",
            json={
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {
                    "temperature": 0.3,
                    # Margen amplio: los modelos 2.5 gastan tokens "pensando"
                    "maxOutputTokens": 4096,
                    "responseMimeType": "application/json",
                }
            },
            timeout=TIMEOUT,
        )
        response.raise_for_status()
        data = response.json()
        return (
            data.get('candidates', [{}])[0]
            .get('content', {})
            .get('parts', [{}])[0]
            .get('text', '')
        )

    def _pedir_texto_openai(self, prompt: str) -> str:
        response = requests.post(
            OPENAI_URL,
            headers={"Authorization": f"Bearer {self.api_key}"},
            json={
                "model": config.OPENAI_MODEL,
                "messages": [{"role": "user", "content": prompt}],
                "response_format": {"type": "json_object"},
            },
            timeout=TIMEOUT,
        )
        response.raise_for_status()
        data = response.json()
        return (
            data.get('choices', [{}])[0]
            .get('message', {})
            .get('content') or ''
        )

    def _consultar(self, prompt: str) -> Optional[dict]:
        """
        Envía un prompt a la IA pidiendo respuesta en JSON y la devuelve como dict.
        Retorna None si hay error de conexión o la respuesta no es JSON válido.
        """
        texto_respuesta = ''
        try:
            if self.usa_openai:
                texto_respuesta = self._pedir_texto_openai(prompt)
            else:
                texto_respuesta = self._pedir_texto_gemini(prompt)

            if not texto_respuesta:
                logger.error(f"Respuesta vacía de {self.nombre}")
                return None

            # Limpiar posibles backticks markdown
            texto_limpio = texto_respuesta.strip()
            if texto_limpio.startswith('```'):
                texto_limpio = texto_limpio.split('\n', 1)[-1]
            if texto_limpio.endswith('```'):
                texto_limpio = texto_limpio.rsplit('```', 1)[0]

            resultado = json.loads(texto_limpio.strip())
            if not isinstance(resultado, dict):
                logger.error(f"{self.nombre} no devolvió un objeto JSON")
                return None
            return resultado

        except json.JSONDecodeError as e:
            logger.error(f"Error parseando respuesta JSON de {self.nombre}: {e}")
            logger.debug(f"Respuesta raw: {texto_respuesta[:500]}")
            return None
        except requests.exceptions.RequestException as e:
            # No se loguea el error tal cual porque la URL incluye la API key
            detalle = type(e).__name__
            if e.response is not None:
                detalle = f"HTTP {e.response.status_code}: {e.response.text[:300]}"
            logger.error(f"Error de conexión con {self.nombre}: {detalle}")
            return None
        except (KeyError, IndexError, AttributeError) as e:
            logger.error(f"Error procesando respuesta de {self.nombre}: {e}")
            return None

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

        resultado = self._consultar(prompt)
        if not resultado:
            return None

        try:
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

        except (TypeError, ValueError, AttributeError) as e:
            logger.error(f"Respuesta de Gemini con formato inválido: {e}")
            return None

    def evaluar_margen(self, precio_actual: float, velas_4h: list, velas_15m: list,
                       comision_ida_vuelta: float, margen_minimo: float,
                       stop_loss: float, take_profit_max: float) -> Optional[dict]:
        """
        Modo autónomo: pregunta a Gemini si hay un margen de ganancia que valga la pena.
        Retorna dict con 'decision' ('comprar'/'esperar'), 'ganancia_esperada_pct',
        'horizonte_horas', 'confianza', 'analisis' y 'texto' formateado.
        """
        if not self._disponible():
            return None

        def _formatear(velas: list, formato_fecha: str) -> str:
            lineas = []
            for v in velas:
                fecha = datetime.utcfromtimestamp(v['timestamp'] / 1000).strftime(formato_fecha)
                lineas.append(
                    f"  {fecha} | max {v['maximo']:.0f} | min {v['minimo']:.0f} | "
                    f"cierre {v['cierre']:.0f} | vol {v['volumen']:.0f}"
                )
            return "\n".join(lineas)

        umbral = comision_ida_vuelta + margen_minimo

        prompt = f"""Sos un trader de Bitcoin cuidadoso. Manejás un capital chico y tu prioridad es no perder plata. Respondé EN ESPAÑOL.

SITUACIÓN:
- Precio actual BTC/USDT: {precio_actual:,.2f}
- Comisiones de compra + venta: {comision_ida_vuelta:.2f}% en total
- Solo vale la pena comprar si esperás una suba de al menos {umbral:.2f}% (comisiones + {margen_minimo:.2f}% de ganancia neta)
- Si después de comprar el precio cae {stop_loss:.2f}%, se vende automáticamente con pérdida
- El objetivo de venta no puede superar {take_profit_max:.2f}%

VELAS DE 4 HORAS (últimos 7 días, hora UTC):
{_formatear(velas_4h, '%m-%d %H:%M')}

VELAS DE 15 MINUTOS (últimas 12 horas, hora UTC):
{_formatear(velas_15m, '%H:%M')}

TAREA:
Evaluá si AHORA hay una oportunidad de compra con un margen que valga la pena.
Pensá en tendencia, soportes y resistencias, volumen y volatilidad reciente.
¿Es más probable que el precio llegue a +{umbral:.2f}% antes que a -{stop_loss:.2f}%?
Si no lo ves claro, la respuesta correcta es "esperar". Esperar no cuesta nada.

RESPONDÉ EXCLUSIVAMENTE con este JSON:
{{
    "analisis": "2-3 oraciones explicando tu razonamiento",
    "decision": "comprar" o "esperar",
    "ganancia_esperada_pct": suba que esperás desde el precio actual (número, ej: 1.8),
    "horizonte_horas": en cuántas horas esperás esa suba (número),
    "confianza": "alta" o "media" o "baja"
}}"""

        resultado = self._consultar(prompt)
        if not resultado:
            return None

        try:
            campos = ['analisis', 'decision', 'ganancia_esperada_pct', 'confianza']
            for campo in campos:
                if campo not in resultado:
                    logger.error(f"Campo faltante en respuesta de Gemini: {campo}")
                    return None

            resultado['decision'] = str(resultado['decision']).lower().strip()
            resultado['confianza'] = str(resultado['confianza']).lower().strip()
            resultado['ganancia_esperada_pct'] = float(resultado['ganancia_esperada_pct'])
            resultado['horizonte_horas'] = float(resultado.get('horizonte_horas') or 0)

            if resultado['decision'] not in ('comprar', 'esperar'):
                resultado['decision'] = 'esperar'

            resultado['texto'] = (
                f"🤖 *Evaluación de margen*\n\n"
                f"{resultado['analisis']}\n\n"
                f"📊 *Decisión:* {resultado['decision'].upper()}\n"
                f"📈 *Suba esperada:* {resultado['ganancia_esperada_pct']:+.2f}% "
                f"en ~{resultado['horizonte_horas']:.0f}h\n"
                f"🎯 *Confianza:* {resultado['confianza'].upper()}"
            )

            logger.info(
                f"Evaluación de margen: {resultado['decision']} "
                f"({resultado['confianza']}) suba esperada {resultado['ganancia_esperada_pct']:+.2f}%"
            )
            return resultado

        except (TypeError, ValueError, AttributeError) as e:
            logger.error(f"Respuesta de Gemini con formato inválido: {e}")
            return None
