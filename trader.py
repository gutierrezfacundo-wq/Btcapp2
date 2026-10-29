"""
trader.py — Trading autónomo con presupuesto fijo.

Cómo decide:
  - ENTRADA (IA): cada AUTONOMO_INTERVALO_ANALISIS minutos, si no hay posición abierta,
    Gemini evalúa si hay un margen que valga la pena. Solo se compra si la suba esperada
    cubre las comisiones + AUTONOMO_MARGEN_MINIMO y la confianza no es baja.
    Con AUTONOMO_ENTRADA=reglas no se usa IA: compra si el RSI de 15 min está en
    sobreventa y la tendencia de 7 días es alcista, con objetivo = comisiones + margen mínimo.
  - SALIDA (reglas fijas): se vende al llegar al objetivo propuesto por la IA
    (con tope AUTONOMO_TAKE_PROFIT_MAX) o si la pérdida llega a AUTONOMO_STOP_LOSS.
    La salida nunca depende de la IA, así siempre se puede cortar una pérdida.
  - PRESUPUESTO: opera solo con AUTONOMO_PRESUPUESTO_USDT y reinvierte el resultado.
    Si ese capital cae STOP_LOSS_PORCENTAJE, el modo autónomo se pausa solo.

El estado (capital, posición abierta, activo/pausado) se guarda en SQLite,
así sobrevive a reinicios del bot.
"""

import json
import logging
import time
from datetime import datetime
from typing import Optional

import config

logger = logging.getLogger(__name__)


class TraderAutonomo:
    def __init__(self, db, binance, gemini, notificador):
        self.db = db
        self.binance = binance
        self.gemini = gemini
        self.notificador = notificador
        self._ultimo_analisis = 0.0  # time.monotonic() de la última consulta a la IA

    # --- Estado persistente ---

    def activo(self) -> bool:
        """El modo autónomo arranca activo; /autonomo off o el stop global lo pausan."""
        return self.db.obtener_config('autonomo_activo', 'true') == 'true'

    def set_activo(self, activo: bool):
        self.db.guardar_config('autonomo_activo', str(activo).lower())

    def capital(self) -> float:
        """USDT disponibles para el bot (presupuesto inicial +/- resultados)."""
        valor = self.db.obtener_config('autonomo_capital', '')
        return float(valor) if valor else config.AUTONOMO_PRESUPUESTO_USDT

    def _set_capital(self, capital: float):
        self.db.guardar_config('autonomo_capital', f"{capital:.8f}")

    def posicion(self) -> Optional[dict]:
        """Posición abierta: cantidad_btc, costo_usdt, precio_entrada, objetivo_pct, timestamp."""
        valor = self.db.obtener_config('autonomo_posicion', '')
        return json.loads(valor) if valor else None

    def _set_posicion(self, posicion: Optional[dict]):
        self.db.guardar_config('autonomo_posicion', json.dumps(posicion) if posicion else '')

    def polvo_btc(self) -> float:
        """
        Resto de BTC que quedó sin vender porque Binance solo acepta cantidades
        múltiplo del stepSize (0.00001 BTC). Se suma a la próxima venta.
        """
        valor = self.db.obtener_config('autonomo_polvo_btc', '')
        return float(valor) if valor else 0.0

    def _set_polvo_btc(self, cantidad: float):
        self.db.guardar_config('autonomo_polvo_btc', f"{max(cantidad, 0.0):.8f}")

    # --- Cálculos ---

    @staticmethod
    def _comision_ida_vuelta() -> float:
        return config.COMISION_PORCENTAJE * 2

    def _resultado_posicion(self, posicion: dict, precio: float) -> tuple:
        """
        Devuelve (valor_neto_usdt, resultado_pct) si se vendiera ahora,
        ya descontada la comisión de venta.
        """
        valor_neto = posicion['cantidad_btc'] * precio * (1 - config.COMISION_PORCENTAJE / 100)
        resultado_pct = (valor_neto - posicion['costo_usdt']) / posicion['costo_usdt'] * 100
        return valor_neto, resultado_pct

    def valor_total(self, precio: float) -> float:
        """Valor del presupuesto del bot: capital libre + posición + polvo, al precio actual."""
        total = self.capital() + self.polvo_btc() * precio
        posicion = self.posicion()
        if posicion:
            total += self._resultado_posicion(posicion, precio)[0]
        return total

    # --- Ciclo ---

    def ciclo(self, precio: float):
        """Se llama en cada ciclo de monitoreo con el precio actual."""
        if not self.activo():
            return

        posicion = self.posicion()
        if posicion:
            self._revisar_salida(posicion, precio)
            return

        if self._stop_global(precio):
            return

        intervalo = config.AUTONOMO_INTERVALO_ANALISIS * 60
        if self._ultimo_analisis and time.monotonic() - self._ultimo_analisis < intervalo:
            return
        self._ultimo_analisis = time.monotonic()
        self._evaluar_entrada(precio)

    def _stop_global(self, precio: float) -> bool:
        """Pausa el modo autónomo si el presupuesto cayó más de STOP_LOSS_PORCENTAJE."""
        presupuesto = config.AUTONOMO_PRESUPUESTO_USDT
        valor = self.valor_total(precio)
        caida = (presupuesto - valor) / presupuesto * 100
        if caida < config.STOP_LOSS_PORCENTAJE:
            return False

        self.set_activo(False)
        logger.warning(f"Stop global autónomo: presupuesto cayó {caida:.2f}%")
        self.notificador.enviar_mensaje(
            "🛑 *STOP GLOBAL — Modo autónomo pausado*\n\n"
            f"El presupuesto cayó `{caida:.2f}%` "
            f"(`${presupuesto:.2f}` → `${valor:.2f}`).\n"
            "Revisá la situación y usá /autonomo on para reanudar."
        )
        return True

    def _evaluar_entrada(self, precio: float):
        """Consulta a la IA y compra si hay un margen que valga la pena."""
        capital = self.capital()
        filtros = self.binance.obtener_filtros()
        minimo = filtros['min_notional'] if filtros else 5.0

        monto = min(capital, config.TRADE_MAX_POR_OPERACION)
        if monto < minimo:
            self.set_activo(False)
            self.notificador.enviar_mensaje(
                f"⚠️ *Modo autónomo pausado*\n\n"
                f"El capital disponible (`${monto:.2f}`) es menor al mínimo "
                f"de Binance por orden (`${minimo:.2f}`)."
            )
            return

        velas_4h = self.binance.obtener_velas('4h', 42)
        velas_15m = self.binance.obtener_velas('15m', 48)
        if not velas_4h or not velas_15m:
            logger.warning("Sin velas para evaluar entrada, se reintenta en el próximo análisis")
            return

        if config.AUTONOMO_ENTRADA == 'reglas':
            evaluacion = self._evaluar_por_reglas(precio, velas_4h, velas_15m)
        else:
            evaluacion = self.gemini.evaluar_margen(
                precio_actual=precio,
                velas_4h=velas_4h,
                velas_15m=velas_15m,
                comision_ida_vuelta=self._comision_ida_vuelta(),
                margen_minimo=config.AUTONOMO_MARGEN_MINIMO,
                stop_loss=config.AUTONOMO_STOP_LOSS,
                take_profit_max=config.AUTONOMO_TAKE_PROFIT_MAX,
            )
        if not evaluacion:
            logger.error("No se pudo obtener la evaluación de margen de la IA")
            return

        self.db.guardar_analisis(
            precio_actual=precio,
            variacion_1h=0, variacion_24h=0, variacion_7d=0,
            respuesta_gemini=evaluacion['texto'],
            recomendacion=evaluacion['decision'],
            porcentaje_recomendado=evaluacion['ganancia_esperada_pct'],
        )

        # Validación propia: no se confía ciegamente en la decisión de la IA
        umbral = self._comision_ida_vuelta() + config.AUTONOMO_MARGEN_MINIMO
        ganancia = evaluacion['ganancia_esperada_pct']
        if (evaluacion['decision'] != 'comprar'
                or evaluacion['confianza'] == 'baja'
                or ganancia < umbral):
            # Las esperas no se notifican para no llenar el chat; quedan en el log y la DB
            logger.info(
                f"Sin entrada: decisión={evaluacion['decision']}, "
                f"confianza={evaluacion['confianza']}, suba esperada={ganancia:+.2f}% "
                f"(mínimo {umbral:.2f}%)"
            )
            return

        self._comprar(monto, precio, evaluacion)

    @staticmethod
    def _rsi(cierres: list, periodos: int = 14) -> Optional[float]:
        """RSI de Wilder sobre una lista de precios de cierre."""
        if len(cierres) <= periodos:
            return None
        cambios = [b - a for a, b in zip(cierres, cierres[1:])]
        suba = sum(max(c, 0) for c in cambios[:periodos]) / periodos
        baja = sum(max(-c, 0) for c in cambios[:periodos]) / periodos
        for c in cambios[periodos:]:
            suba = (suba * (periodos - 1) + max(c, 0)) / periodos
            baja = (baja * (periodos - 1) + max(-c, 0)) / periodos
        if baja == 0:
            return 100.0
        return 100 - 100 / (1 + suba / baja)

    def _evaluar_por_reglas(self, precio: float, velas_4h: list, velas_15m: list) -> Optional[dict]:
        """
        Entrada sin IA: compra en una caída de corto plazo (RSI 15m en sobreventa)
        solo si la tendencia de 7 días es alcista (precio sobre el promedio de las velas de 4h).
        Devuelve el mismo formato que evaluar_margen de la IA.
        """
        rsi = self._rsi([v['cierre'] for v in velas_15m])
        if rsi is None:
            return None
        promedio_7d = sum(v['cierre'] for v in velas_4h) / len(velas_4h)
        tendencia_alcista = precio > promedio_7d
        sobreventa = rsi < config.AUTONOMO_RSI_COMPRA

        umbral = self._comision_ida_vuelta() + config.AUTONOMO_MARGEN_MINIMO
        decision = 'comprar' if tendencia_alcista and sobreventa else 'esperar'
        analisis = (
            f"RSI 15m: {rsi:.1f} (compra bajo {config.AUTONOMO_RSI_COMPRA:.0f}). "
            f"Precio {'sobre' if tendencia_alcista else 'bajo'} el promedio de 7 días "
            f"(${promedio_7d:,.0f})."
        )
        logger.info(f"Reglas: {analisis} → {decision}")
        return {
            'analisis': analisis,
            'decision': decision,
            'ganancia_esperada_pct': umbral if decision == 'comprar' else 0.0,
            'horizonte_horas': 0.0,
            'confianza': 'media',
            'texto': (
                f"📐 *Entrada por reglas*\n\n{analisis}\n\n"
                f"📊 *Decisión:* {decision.upper()}"
            ),
        }

    def _comprar(self, monto: float, precio: float, evaluacion: dict):
        """Ejecuta la compra y registra la posición."""
        balances = self.binance.obtener_balances()
        if balances is None:
            return
        if balances['USDT'] < monto:
            self.notificador.enviar_mensaje(
                f"⚠️ Compra autónoma cancelada: la cuenta tiene `${balances['USDT']:.2f}` USDT "
                f"libres y el bot necesita `${monto:.2f}`."
            )
            return

        monto = int(monto * 100) / 100  # Redondeo hacia abajo a centavos
        resultado = self.binance.ejecutar_compra_mercado(monto)
        if not resultado or resultado['cantidad_btc'] <= 0:
            self.notificador.enviar_mensaje("❌ Error en la compra autónoma. Ver btc_bot.log")
            return

        # Objetivo de venta: lo que propuso la IA, entre el umbral mínimo y el tope
        umbral = self._comision_ida_vuelta() + config.AUTONOMO_MARGEN_MINIMO
        objetivo_bruto = max(
            min(evaluacion['ganancia_esperada_pct'], config.AUTONOMO_TAKE_PROFIT_MAX), umbral
        )
        # El objetivo se mide sobre el resultado neto, descontando la comisión
        # de compra y la de venta
        factor_comision = (1 - config.COMISION_PORCENTAJE / 100) ** 2
        objetivo_neto = ((1 + objetivo_bruto / 100) * factor_comision - 1) * 100

        costo = resultado['monto_usdt'] + resultado['comision_usdt']
        posicion = {
            'cantidad_btc': resultado['cantidad_neta_btc'],
            'costo_usdt': costo,
            'precio_entrada': resultado['precio_promedio'],
            'objetivo_pct': objetivo_neto,
            'timestamp': datetime.utcnow().isoformat(),
        }
        self._set_posicion(posicion)
        self._set_capital(self.capital() - costo)

        self.db.guardar_operacion(
            tipo='compra',
            precio=resultado['precio_promedio'],
            cantidad_btc=resultado['cantidad_btc'],
            monto_usdt=resultado['monto_usdt'],
            modo='autonomo',
            orden_id=str(resultado['orden_id']),
            notas=(f"IA: suba esperada {evaluacion['ganancia_esperada_pct']:+.2f}%, "
                   f"confianza {evaluacion['confianza']}"),
        )

        precio_objetivo = posicion['precio_entrada'] * (1 + objetivo_bruto / 100)
        precio_stop = posicion['precio_entrada'] * (1 - config.AUTONOMO_STOP_LOSS / 100)
        self.notificador.enviar_mensaje(
            f"{evaluacion['texto']}\n\n"
            f"🟢 *Compra autónoma ejecutada*\n"
            f"₿ Cantidad: `{posicion['cantidad_btc']:.8f} BTC`\n"
            f"💰 Precio: `${posicion['precio_entrada']:,.2f}`\n"
            f"💸 Invertido: `${costo:.2f} USDT`\n"
            f"🎯 Vende con ganancia neta de `{objetivo_neto:+.2f}%` (~`${precio_objetivo:,.0f}`)\n"
            f"🛑 Vende con pérdida de `-{config.AUTONOMO_STOP_LOSS:.2f}%` (~`${precio_stop:,.0f}`)"
        )

    def _revisar_salida(self, posicion: dict, precio: float):
        """Vende si se alcanzó el objetivo o el stop-loss de la posición."""
        _, resultado_pct = self._resultado_posicion(posicion, precio)
        # Redondeo para que errores de punto flotante no impidan la venta en el objetivo
        resultado_pct = round(resultado_pct, 4)

        if resultado_pct >= round(posicion['objetivo_pct'], 4):
            self.vender('🎯 Objetivo alcanzado')
        elif resultado_pct <= -config.AUTONOMO_STOP_LOSS:
            self.vender('🛑 Stop-loss')

    def vender(self, motivo: str) -> bool:
        """Cierra la posición abierta a precio de mercado."""
        posicion = self.posicion()
        if not posicion:
            return False

        # Se suma el polvo de ventas anteriores, sin vender nunca más BTC
        # del que la cuenta tiene libre
        balances = self.binance.obtener_balances()
        if balances is None:
            return False
        a_vender = posicion['cantidad_btc'] + self.polvo_btc()
        cantidad = min(a_vender, balances['BTC'])

        resultado = self.binance.ejecutar_venta_mercado(cantidad)
        if not resultado or resultado['cantidad_btc'] <= 0:
            # La posición queda abierta y se reintenta en el próximo ciclo
            self.notificador.enviar_alerta_error(
                f"No se pudo vender la posición autónoma ({motivo}). "
                "Se reintenta en el próximo ciclo."
            )
            return False

        recibido = resultado['monto_neto_usdt']
        polvo_anterior = self.polvo_btc()
        polvo_nuevo = max(a_vender - resultado['cantidad_btc'], 0.0)
        # El polvo que queda en la cuenta sigue valiendo plata: se valúa al precio
        # de venta para que el resultado refleje la operación real
        variacion_polvo = (polvo_nuevo - polvo_anterior) * resultado['precio_promedio']
        ganancia = recibido + variacion_polvo - posicion['costo_usdt']
        ganancia_pct = ganancia / posicion['costo_usdt'] * 100

        self._set_posicion(None)
        self._set_capital(self.capital() + recibido)
        self._set_polvo_btc(polvo_nuevo)
        # Después de vender se espera un intervalo completo antes de volver a evaluar
        self._ultimo_analisis = time.monotonic()

        self.db.guardar_operacion(
            tipo='venta',
            precio=resultado['precio_promedio'],
            cantidad_btc=resultado['cantidad_btc'],
            monto_usdt=resultado['monto_usdt'],
            modo='autonomo',
            orden_id=str(resultado['orden_id']),
            notas=f"{motivo}: resultado {ganancia:+.4f} USDT ({ganancia_pct:+.2f}%)",
        )

        emoji = "✅" if ganancia >= 0 else "🔻"
        self.notificador.enviar_mensaje(
            f"{emoji} *Venta autónoma — {motivo}*\n\n"
            f"₿ Vendido: `{resultado['cantidad_btc']:.8f} BTC`\n"
            f"💰 Precio: `${resultado['precio_promedio']:,.2f}`\n"
            f"💵 Recibido: `${recibido:.2f} USDT`\n"
            f"📊 Resultado: `{ganancia:+.2f} USDT ({ganancia_pct:+.2f}%)`\n"
            f"🏦 Capital del bot: `${self.capital():.2f} USDT`"
        )
        return True

    # --- Texto para comandos ---

    def estado_texto(self, precio: Optional[float]) -> str:
        """Resumen del modo autónomo para el comando /autonomo."""
        estado = "ACTIVO" if self.activo() else "PAUSADO"
        lineas = [
            f"🤖 *Modo autónomo: {estado}*\n",
            f"💼 Presupuesto inicial: `${config.AUTONOMO_PRESUPUESTO_USDT:.2f} USDT`",
            f"🏦 Capital libre: `${self.capital():.2f} USDT`",
        ]

        posicion = self.posicion()
        if posicion and precio:
            valor, resultado_pct = self._resultado_posicion(posicion, precio)
            lineas.extend([
                "\n*Posición abierta:*",
                f"₿ `{posicion['cantidad_btc']:.8f} BTC` a `${posicion['precio_entrada']:,.2f}`",
                f"📊 Resultado actual: `{resultado_pct:+.2f}%` (valor `${valor:.2f}`)",
                f"🎯 Objetivo: `{posicion['objetivo_pct']:+.2f}%` | "
                f"🛑 Stop: `-{config.AUTONOMO_STOP_LOSS:.2f}%`",
            ])
        elif posicion:
            lineas.append(f"\n₿ Posición abierta: `{posicion['cantidad_btc']:.8f} BTC`")
        else:
            lineas.append("\nSin posición abierta, esperando una oportunidad.")

        if precio:
            valor_total = self.valor_total(precio)
            rendimiento = ((valor_total - config.AUTONOMO_PRESUPUESTO_USDT)
                           / config.AUTONOMO_PRESUPUESTO_USDT * 100)
            lineas.append(f"\n📈 Valor total: `${valor_total:.2f}` (`{rendimiento:+.2f}%`)")

        if config.BINANCE_TESTNET:
            lineas.append("\n🧪 Operando en TESTNET (dinero ficticio)")
        return "\n".join(lineas)
