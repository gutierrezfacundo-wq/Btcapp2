#!/usr/bin/env python3
"""
backtest.py — Backtest del bot BTC sobre datos históricos.

CONTEXTO IMPORTANTE — qué se puede y qué no se puede medir:

  * El bot real SOLO COMPRA (acumula BTC), nunca vende. No hay take-profit
    ni señal de salida. Por eso no existen "trades" con P&L cerrado: el
    rendimiento se mide como precio promedio de entrada vs. precio final,
    y como valor final del portfolio (cash + BTC) vs. capital inicial.

  * La decisión de comprar la toma Gemini (un LLM), no una regla fija.
    Eso NO es determinístico ni se puede replayear gratis. Este backtest
    evalúa la parte determinística —el trigger de variación 24h— con tres
    variantes para modelar la decisión de Gemini:

        always  → compra cada vez que el trigger se dispara (techo de actividad)
        dip     → compra solo si la variación 24h es negativa (comprar la caída)
        gemini  → llama a la API de Gemini real (lento, cuesta, no determinístico)

  Conclusión: los números de 'always' y 'dip' son reproducibles y sirven
  para decidir si el *timing* del bot le gana a DCA / Buy&Hold. La columna
  'gemini' es ilustrativa — en vivo va a dar distinto cada vez.

Uso:
    python backtest.py                      # baja 2 años de Binance (necesita internet)
    python backtest.py --csv datos.csv      # usa un CSV local en vez de la API
    python backtest.py --with-gemini        # agrega la variante Gemini real
    python backtest.py --years 1 --buy-amount 25 --threshold 4

Formato del CSV (con header). Se autodetecta:
    - Binance vision:  open_time,open,high,low,close,volume,...
    - Mínimo:          timestamp,close
"""

import argparse
import csv
import os
import sys
import time
from datetime import datetime, timedelta, timezone

import requests

# ----------------------------------------------------------------------
# Constantes — espejo de los defaults de config.py del bot.
# Son overridables por CLI; se redeclaran acá para que el backtest corra
# standalone sin necesitar el .env (config.py exige tokens de Telegram).
# ----------------------------------------------------------------------
DEFAULT_THRESHOLD = 5.0          # config.ALERTA_VARIACION_24H
COOLDOWN_MIN = 30                # Analyzer.cooldown_alerta
DEFAULT_BUY_AMOUNT = 50.0        # config.TRADE_MAX_POR_OPERACION
TRADE_MAX_POR_SEMANA = 200.0     # config.TRADE_MAX_POR_SEMANA
STOP_LOSS_PCT = 20.0             # config.STOP_LOSS_PORCENTAJE
DEFAULT_FEE = 0.001              # 0.1% — fee taker spot estándar de Binance

BINANCE_KLINES = "https://api.binance.com/api/v3/klines"


# ----------------------------------------------------------------------
# Datos
# ----------------------------------------------------------------------
def fetch_klines(symbol, interval, start_ms, end_ms):
    """Baja klines de Binance paginando de a 1000. Devuelve [(ts_ms, close), ...]."""
    out = []
    cursor = start_ms
    while cursor < end_ms:
        resp = requests.get(BINANCE_KLINES, params={
            "symbol": symbol, "interval": interval,
            "startTime": cursor, "endTime": end_ms, "limit": 1000,
        }, timeout=15)
        resp.raise_for_status()
        batch = resp.json()
        if not batch:
            break
        for k in batch:
            out.append((int(k[0]), float(k[4])))  # open_time, close
        cursor = batch[-1][0] + 1
        if len(batch) < 1000:
            break
        time.sleep(0.25)  # cortesía con el rate limit
    return out


def load_csv(path):
    """Carga klines de un CSV local. Autodetecta columnas. Devuelve [(ts_ms, close), ...]."""
    out = []
    with open(path, newline="") as f:
        reader = csv.reader(f)
        header = next(reader)
        cols = [c.strip().lower() for c in header]

        def find(*names):
            for n in names:
                if n in cols:
                    return cols.index(n)
            return None

        i_close = find("close", "price", "close_price")
        i_time = find("open_time", "timestamp", "time", "date", "datetime")
        if i_close is None:
            # sin header reconocible: asumimos col0=tiempo, última col numérica=close
            i_time, i_close = 0, len(cols) - 1
            out.append(_parse_row(header, i_time, i_close))  # la "header" era data

        for row in reader:
            parsed = _parse_row(row, i_time, i_close)
            if parsed:
                out.append(parsed)
    out.sort(key=lambda x: x[0])
    return out


def _parse_row(row, i_time, i_close):
    try:
        raw_t = row[i_time].strip()
        if raw_t.isdigit():
            ts = int(raw_t)
            if ts < 10_000_000_000:   # segundos → ms
                ts *= 1000
        else:
            dt = datetime.fromisoformat(raw_t.replace("Z", "+00:00"))
            ts = int(dt.timestamp() * 1000)
        return (ts, float(row[i_close]))
    except (ValueError, IndexError):
        return None


# ----------------------------------------------------------------------
# Decisiones (modelan qué hace el bot cuando el trigger se dispara)
# ----------------------------------------------------------------------
def decide_always(ctx):
    """Compra siempre. fraction=None → usa el monto fijo por compra."""
    return True, None


def decide_dip(ctx):
    """Compra solo en caídas (variación 24h negativa)."""
    return ctx["var_24h"] < 0, None


def make_decide_gemini(max_calls):
    """
    Devuelve una función de decisión que llama a la API de Gemini real.
    Reutiliza el GeminiClient del bot para máxima fidelidad. Requiere
    GEMINI_API_KEY. Si no está configurada, la variante se omite.
    """
    # config.py exige TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID al importarse.
    # El backtest no usa Telegram, así que ponemos placeholders inocuos
    # para poder importar gemini_client sin un .env completo.
    os.environ.setdefault("TELEGRAM_BOT_TOKEN", "backtest-noop")
    os.environ.setdefault("TELEGRAM_CHAT_ID", "backtest-noop")
    try:
        from gemini_client import GeminiClient
    except Exception as e:
        print(f"  [gemini] no se pudo importar gemini_client: {e}")
        return None

    client = GeminiClient()
    if not client.api_key:
        print("  [gemini] GEMINI_API_KEY no configurada — variante omitida.")
        return None

    state = {"calls": 0}

    def decide(ctx):
        if state["calls"] >= max_calls:
            return False, None
        state["calls"] += 1
        historial = [
            {"timestamp": datetime.fromtimestamp(t / 1000, timezone.utc).isoformat(),
             "precio": p}
            for t, p in ctx["historial_7d"]
        ]
        analisis = client.analizar_mercado(
            precio_actual=ctx["price"],
            variacion_1h=ctx["var_1h"],
            variacion_24h=ctx["var_24h"],
            variacion_7d=ctx["var_7d"],
            historial_7d=historial,
            balance_usdt=ctx["cash"],
        )
        if not analisis:
            return False, None
        # El bot real solo auto-compra con recomendacion 'comprar' + confianza 'alta'.
        if analisis["recomendacion"] == "comprar" and analisis["confianza"] == "alta":
            return True, analisis["porcentaje_recomendado"] / 100.0
        return False, None

    return decide


# ----------------------------------------------------------------------
# Motor de backtest
# ----------------------------------------------------------------------
def run_strategy(candles, decide_fn, args, steps_per_hour):
    """
    Corre la lógica del bot (trigger 24h + cooldown + stop-loss) sobre las
    velas. Devuelve un dict de métricas.
    """
    h1 = steps_per_hour
    h24 = 24 * steps_per_hour
    h168 = 168 * steps_per_hour

    cash = args.capital
    btc = 0.0
    buys = []                       # (ts_ms, usdt, price)
    last_alert_ms = None
    cooldown_ms = COOLDOWN_MIN * 60 * 1000
    stopped = False                 # stop-loss disparado
    equity_curve = []               # valor de portfolio en cada vela

    for i, (ts, price) in enumerate(candles):
        # valor actual del portfolio (para curva de equity y stop-loss)
        equity = cash + btc * price
        equity_curve.append(equity)

        if i < h24:                 # falta historia para la variación 24h
            continue

        # stop-loss: el bot real pausa el modo auto si cae STOP_LOSS_PCT desde el inicio
        if not stopped and equity <= args.capital * (1 - STOP_LOSS_PCT / 100):
            stopped = True
        if stopped:
            continue

        var_24h = (price - candles[i - h24][1]) / candles[i - h24][1] * 100
        if abs(var_24h) < args.threshold:
            continue
        if last_alert_ms is not None and (ts - last_alert_ms) < cooldown_ms:
            continue
        last_alert_ms = ts

        var_1h = (price - candles[i - h1][1]) / candles[i - h1][1] * 100 if i >= h1 else 0.0
        var_7d = (price - candles[i - h168][1]) / candles[i - h168][1] * 100 if i >= h168 else 0.0

        ctx = {
            "price": price, "var_1h": var_1h, "var_24h": var_24h, "var_7d": var_7d,
            "cash": cash, "historial_7d": candles[max(0, i - h168):i + 1],
        }
        should_buy, fraction = decide_fn(ctx)
        if not should_buy or cash <= 0:
            continue

        # sizing: fracción del cash (variante gemini) o monto fijo, con tope por operación
        amount = cash * fraction if fraction is not None else args.buy_amount
        amount = min(amount, args.buy_amount, cash)

        # límite semanal rodante (config.TRADE_MAX_POR_SEMANA)
        week_ago = ts - 7 * 24 * 3600 * 1000
        spent_week = sum(u for (t, u, _) in buys if t >= week_ago)
        amount = min(amount, max(0.0, TRADE_MAX_POR_SEMANA - spent_week))
        if amount <= 0:
            continue

        btc += (amount * (1 - args.fee)) / price
        cash -= amount
        buys.append((ts, amount, price))

    final_price = candles[-1][1]
    return _metrics("Bot (%s)" % decide_fn.__name__.replace("decide_", "").replace("decide", ""),
                    cash, btc, buys, final_price, args.capital, equity_curve, stopped)


def run_buy_hold(candles, args):
    """Benchmark: gastar todo el capital el día 1 y no tocar nada."""
    price0 = candles[0][1]
    btc = (args.capital * (1 - args.fee)) / price0
    buys = [(candles[0][0], args.capital, price0)]
    equity = [btc * p for _, p in candles]
    return _metrics("Buy & Hold", 0.0, btc, buys, candles[-1][1],
                    args.capital, equity, False)


def run_dca(candles, args, steps_per_hour):
    """Benchmark: DCA — comprar buy_amount cada dca_days días hasta quedarse sin cash."""
    cash = args.capital
    btc = 0.0
    buys = []
    step_ms = args.dca_days * 24 * 3600 * 1000
    next_buy_ms = candles[0][0]
    equity_curve = []
    for ts, price in candles:
        equity_curve.append(cash + btc * price)
        if ts >= next_buy_ms and cash > 0:
            amount = min(args.buy_amount, cash)
            btc += (amount * (1 - args.fee)) / price
            cash -= amount
            buys.append((ts, amount, price))
            next_buy_ms += step_ms
    return _metrics("DCA fijo", cash, btc, buys, candles[-1][1],
                    args.capital, equity_curve, False)


def _metrics(name, cash, btc, buys, final_price, capital, equity_curve, stopped):
    invested = sum(u for (_, u, _) in buys)
    avg_entry = invested / sum(u / p for (_, u, p) in buys) if buys else 0.0
    final_value = cash + btc * final_price
    ret_pct = (final_value - capital) / capital * 100 if capital else 0.0
    # max drawdown sobre la curva de equity
    peak = float("-inf")
    max_dd = 0.0
    for v in equity_curve:
        peak = max(peak, v)
        if peak > 0:
            max_dd = max(max_dd, (peak - v) / peak * 100)
    return {
        "name": name, "n_buys": len(buys), "invested": invested,
        "btc": btc, "avg_entry": avg_entry, "cash_left": cash,
        "final_value": final_value, "return_pct": ret_pct,
        "max_dd": max_dd, "stopped": stopped,
    }


# ----------------------------------------------------------------------
# Reporte
# ----------------------------------------------------------------------
def print_report(results, args, candles, interval):
    p0, pN = candles[0][1], candles[-1][1]
    d0 = datetime.fromtimestamp(candles[0][0] / 1000, timezone.utc).date()
    dN = datetime.fromtimestamp(candles[-1][0] / 1000, timezone.utc).date()
    hold_ret = (pN - p0) / p0 * 100

    print()
    print("=" * 78)
    print("  BACKTEST — Bot BTC (acumulador, solo compra)")
    print("=" * 78)
    print(f"  Período:        {d0} → {dN}  ({len(candles)} velas de {interval})")
    print(f"  Precio BTC:     ${p0:,.0f} → ${pN:,.0f}  ({hold_ret:+.1f}%)")
    print(f"  Capital inicial: ${args.capital:,.2f}   |   Monto/compra: ${args.buy_amount:,.2f}"
          f"   |   Fee: {args.fee*100:.2f}%")
    print(f"  Trigger:        |variación 24h| ≥ {args.threshold}%   |   Cooldown: {COOLDOWN_MIN} min"
          f"   |   Stop-loss: {STOP_LOSS_PCT}%")
    print("-" * 78)
    hdr = f"  {'Estrategia':<20}{'Compras':>8}{'Invertido':>12}{'BTC':>12}" \
          f"{'P.entrada':>12}{'Valor fin':>12}{'Retorno':>10}{'MaxDD':>8}"
    print(hdr)
    print("-" * 78)
    for r in results:
        flag = " *" if r["stopped"] else ""
        print(f"  {r['name']:<20}{r['n_buys']:>8}{r['invested']:>11,.0f}$"
              f"{r['btc']:>12.6f}{r['avg_entry']:>11,.0f}$"
              f"{r['final_value']:>11,.0f}${r['return_pct']:>9.1f}%{r['max_dd']:>7.1f}%{flag}")
    print("-" * 78)
    if any(r["stopped"] for r in results):
        print("  * el stop-loss se disparó y el bot dejó de comprar durante el período")
    print()
    # lectura rápida
    bench = next((r for r in results if r["name"] == "DCA fijo"), None)
    bots = [r for r in results if r["name"].startswith("Bot")]
    if bench and bots:
        print("  Lectura:")
        for b in bots:
            delta = b["return_pct"] - bench["return_pct"]
            verdict = "le gana a" if delta > 0 else "pierde contra"
            print(f"    - {b['name']:<20} {verdict} DCA por {abs(delta):.1f} pts de retorno")
        print()
    print("  Recordá: la variante 'gemini' es no-determinística (en vivo da distinto");
    print("  cada vez). 'always' y 'dip' sí son reproducibles. Y el bot nunca vende:")
    print("  todo el 'retorno' es apreciación no realizada del BTC acumulado.")
    print("=" * 78)
    print()


# ----------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser(description="Backtest del bot BTC")
    ap.add_argument("--csv", help="CSV local con datos históricos (en vez de la API de Binance)")
    ap.add_argument("--symbol", default="BTCUSDT")
    ap.add_argument("--interval", default="1h", help="1h, 4h, 1d, ... (default 1h)")
    ap.add_argument("--years", type=float, default=2.0, help="años de historia a bajar (default 2)")
    ap.add_argument("--capital", type=float, default=1000.0, help="capital inicial USDT (default 1000)")
    ap.add_argument("--buy-amount", type=float, default=DEFAULT_BUY_AMOUNT,
                    help=f"USDT por compra (default {DEFAULT_BUY_AMOUNT})")
    ap.add_argument("--threshold", type=float, default=DEFAULT_THRESHOLD,
                    help=f"umbral de variación 24h %% (default {DEFAULT_THRESHOLD})")
    ap.add_argument("--dca-days", type=int, default=7, help="frecuencia de compra del DCA (default 7)")
    ap.add_argument("--fee", type=float, default=DEFAULT_FEE, help=f"fee por operación (default {DEFAULT_FEE})")
    ap.add_argument("--with-gemini", action="store_true",
                    help="incluir la variante Gemini real (necesita GEMINI_API_KEY)")
    ap.add_argument("--gemini-max-calls", type=int, default=100,
                    help="tope de llamadas a Gemini para no disparar costos (default 100)")
    args = ap.parse_args()

    # --- cargar datos ---
    if args.csv:
        print(f"Cargando datos de {args.csv} ...")
        candles = load_csv(args.csv)
    else:
        end_ms = int(time.time() * 1000)
        start_ms = end_ms - int(args.years * 365 * 24 * 3600 * 1000)
        print(f"Bajando {args.years} año(s) de {args.symbol} ({args.interval}) de Binance ...")
        try:
            candles = fetch_klines(args.symbol, args.interval, start_ms, end_ms)
        except requests.exceptions.RequestException as e:
            print(f"\nERROR bajando datos de Binance: {e}")
            print("Si estás en un entorno sin internet, usá --csv con un archivo local.")
            sys.exit(1)

    if len(candles) < 24 * 2:
        print(f"ERROR: muy pocos datos ({len(candles)} velas). Se necesitan al menos ~48.")
        sys.exit(1)
    print(f"  {len(candles)} velas cargadas.\n")

    # pasos por hora según el intervalo (para las ventanas 1h/24h/7d)
    interval_minutes = {"1m": 1, "3m": 3, "5m": 5, "15m": 15, "30m": 30,
                        "1h": 60, "2h": 120, "4h": 240, "6h": 360,
                        "12h": 720, "1d": 1440}
    mins = interval_minutes.get(args.interval)
    if not mins:
        print(f"ERROR: intervalo '{args.interval}' no soportado.")
        sys.exit(1)
    steps_per_hour = max(1, 60 // mins) if mins <= 60 else 1
    if mins > 60:
        # con velas > 1h las ventanas se miden en velas; reescalamos
        steps_per_hour = 1
        # nota: con --interval 1d, "24h" = 1 vela. Avísanos si querés precisión sub-diaria.

    # --- correr estrategias ---
    results = []
    print("Corriendo estrategias ...")
    print("  - Bot variante 'always' (compra siempre que el trigger se dispara)")
    results.append(run_strategy(candles, decide_always, args, steps_per_hour))
    print("  - Bot variante 'dip' (compra solo en caídas)")
    results.append(run_strategy(candles, decide_dip, args, steps_per_hour))

    if args.with_gemini:
        print("  - Bot variante 'gemini' (API real — puede tardar)")
        decide_gemini = make_decide_gemini(args.gemini_max_calls)
        if decide_gemini:
            decide_gemini.__name__ = "decide_gemini"
            results.append(run_strategy(candles, decide_gemini, args, steps_per_hour))
    else:
        print("  - Bot variante 'gemini' OMITIDA (pasá --with-gemini y configurá GEMINI_API_KEY)")

    print("  - Benchmark Buy & Hold")
    results.append(run_buy_hold(candles, args))
    print("  - Benchmark DCA fijo")
    results.append(run_dca(candles, args, steps_per_hour))

    print_report(results, args, candles, args.interval)


if __name__ == "__main__":
    main()
