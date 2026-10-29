# BTC Bot — Monitor y Trading de Bitcoin

Bot de monitoreo y trading de BTC que corre en Termux (Android). Consulta precios desde Binance, analiza con Gemini AI y notifica/opera por Telegram.

## Fases

| Fase | Descripción | Flag en .env |
|------|-------------|-------------|
| 1-2 | Monitoreo de precios, variaciones y alertas | Siempre activo |
| 3 | Análisis con Gemini AI en alertas | `FASE_3_GEMINI=true` |
| 4 | Compra manual con botones en Telegram | `FASE_4_MANUAL=true` |
| 5 | Auto-trading con límites de seguridad | `FASE_5_AUTO=true` |
| Autónomo | Compra y vende solo con un presupuesto fijo | `AUTONOMO=true` |

## Instalación en Termux

```bash
# Clonar el repo
git clone https://github.com/tu-usuario/Btcapp2.git
cd Btcapp2

# Ejecutar instalación
bash setup.sh

# Configurar API keys
nano .env
```

## Instalación en PC

### Windows

1. Instalá Python 3.10+ desde https://www.python.org/downloads/ (tildá **"Add python.exe to PATH"**)
2. Descargá el repo (botón *Code → Download ZIP* en GitHub, o `git clone`)
3. Doble clic en `setup_windows.bat`
4. Abrí `.env` con el Bloc de notas y completá tus keys
5. Doble clic en `iniciar_bot.bat`

Para que arranque solo al prender la PC: `Win + R` → `shell:startup` → pegá ahí un acceso directo a `iniciar_bot.bat`.

### Linux / macOS

```bash
git clone https://github.com/gutierrezfacundo-wq/Btcapp2.git
cd Btcapp2
bash setup_pc.sh
nano .env
.venv/bin/python main.py
```

### Problemas comunes en Windows

**`ModuleNotFoundError: No module named 'dotenv'`**: las dependencias no se instalaron. Abrí una consola en la carpeta del bot (escribí `cmd` en la barra de direcciones del Explorador) y ejecutá:

```
.venv\Scripts\python.exe -m pip install -r requirements.txt
```

Si no existe la carpeta `.venv`, volvé a ejecutar `setup_windows.bat`.

> El bot solo envía alertas mientras la PC está prendida. Desactivá la suspensión automática si lo querés 24/7.

## Modo consola (sin Telegram)

Si preferís ver todo en la ventana de la consola en lugar de Telegram, poné en `.env`:

```
NOTIFICACIONES=consola
```

Con esto no hace falta configurar `TELEGRAM_BOT_TOKEN` ni `TELEGRAM_CHAT_ID`.

- Los resúmenes, alertas y análisis se muestran en la consola
- Los comandos (`/precio`, `/status`, `/help`, etc.) se escriben en la misma ventana y se confirman con Enter
- Los botones de compra (Fase 4) aparecen como opciones numeradas: escribí `1` o `2` y apretá Enter
- En la consola solo se ven advertencias y errores del log; el log completo queda en `btc_bot.log`

## Trading autónomo

El bot compra y vende BTC solo, usando únicamente el presupuesto que le asignes (por defecto 20 USDT).

**Cómo decide:**

1. **Compra (decide la IA):** cada hora (`AUTONOMO_INTERVALO_ANALISIS`), si no tiene BTC comprado, le pasa a Gemini las velas reales de Binance (7 días + últimas 12 horas) y le pregunta si hay un margen que valga la pena. Solo compra si la suba esperada cubre las comisiones (0,2% ida y vuelta) más `AUTONOMO_MARGEN_MINIMO`, y si la confianza no es baja. El bot vuelve a verificar esos números: no confía ciegamente en la IA.
2. **Venta (reglas fijas):** vende cuando llega al objetivo que propuso la IA (con tope `AUTONOMO_TAKE_PROFIT_MAX`) o cuando pierde `AUTONOMO_STOP_LOSS`. La venta no depende de la IA, así una pérdida siempre se corta.
3. **Protección global:** si el presupuesto cae `STOP_LOSS_PORCENTAJE` (20% por defecto), se pausa solo y te avisa.

Las esperas no se notifican (para no llenar el chat): quedan en `btc_bot.log`. Las compras y ventas sí.

**Configuración:**

```
AUTONOMO=true
AUTONOMO_PRESUPUESTO_USDT=20
BINANCE_API_KEY=...        # con permiso de Spot Trading, SIN permiso de retiro
BINANCE_API_SECRET=...
GEMINI_API_KEY=...
```

**Probalo primero con dinero ficticio:** creá keys en https://testnet.binance.vision (te loguea con GitHub), ponelas en `.env` y agregá `BINANCE_TESTNET=true`. Cuando estés conforme, cambiá a tus keys reales y `BINANCE_TESTNET=false`. Si pasás de testnet a real, borrá `btc_bot.db` para que el bot no arrastre el estado de la testnet.

**Comandos:**

| Comando | Descripción |
|---------|-------------|
| `/autonomo` | Capital, posición abierta y rendimiento |
| `/autonomo off` | Pausa (no compra ni vende) |
| `/autonomo on` | Reanuda |
| `/vender` | Cierra ya la posición abierta |

**A tener en cuenta:**

- El bot revisa el precio cada `MONITOR_INTERVAL` (5 min). Si el precio se mueve muy rápido, la venta puede ejecutarse un poco más allá del stop-loss.
- Binance solo deja vender en múltiplos de 0.00001 BTC (~1 USD). El resto ("polvo") queda en la cuenta y se vende junto con la próxima operación; cuenta en el valor total del bot.
- El bot tiene que estar corriendo para vigilar la posición. Si se apaga con BTC comprado, al volver a arrancar retoma la posición donde la dejó.
- Ninguna IA predice el precio con certeza: usá solo plata que puedas perder.

## Configuración mínima (.env)

Para las fases 1-2 solo necesitás:

```
TELEGRAM_BOT_TOKEN=tu_token_de_botfather
TELEGRAM_CHAT_ID=tu_chat_id
```

Para obtener estos valores:
1. **TELEGRAM_BOT_TOKEN**: Hablá con [@BotFather](https://t.me/BotFather) en Telegram, creá un bot con `/newbot` y copiá el token
2. **TELEGRAM_CHAT_ID**: Hablá con [@userinfobot](https://t.me/userinfobot) y te da tu ID

## Ejecutar

```bash
# Modo normal
python main.py

# En segundo plano (Termux)
termux-wake-lock
nohup python main.py > /dev/null 2>&1 &

# Ver logs en tiempo real
tail -f btc_bot.log

# Detener
pkill -f 'python main.py'
```

## Comandos de Telegram

| Comando | Descripción |
|---------|-------------|
| `/status` | Estado del bot y fases activas |
| `/precio` | Precio actual con variaciones |
| `/resumen` | Resumen completo bajo demanda |
| `/help` | Lista de comandos |
| `/auto on` | Activar modo automático (Fase 5) |
| `/auto off` | Desactivar modo automático (Fase 5) |
| `/reporte` | Reporte semanal de operaciones (Fase 5) |
| `/autonomo [on\|off]` | Estado / reanudar / pausar el trading autónomo |
| `/vender` | Cerrar la posición autónoma abierta |

## Estructura del proyecto

```
main.py              — Loop principal y orquestación
config.py            — Carga de variables desde .env
database.py          — Operaciones SQLite
binance_client.py    — Consultas y trading en Binance
gemini_client.py     — Análisis con Gemini AI
telegram_client.py   — Bot de Telegram
analyzer.py          — Cálculo de variaciones y alertas
trader.py            — Trading autónomo (entrada por IA, salida por reglas)
consola_client.py    — Mensajes por consola en lugar de Telegram
requirements.txt     — Dependencias Python
.env.example         — Template de configuración
setup.sh             — Script de instalación para Termux
```

## Activar fases incrementalmente

Editá el archivo `.env` para activar cada fase:

```bash
# Fase 3: Requiere GEMINI_API_KEY
FASE_3_GEMINI=true

# Fase 4: Requiere BINANCE_API_KEY + BINANCE_API_SECRET con permisos de Spot
FASE_4_MANUAL=true

# Fase 5: Mismos requisitos que Fase 4
FASE_5_AUTO=true
```

## Seguridad

- Todas las API keys están en `.env` (nunca en el código)
- `.env` está en `.gitignore` (nunca se sube al repo)
- Límites configurables por operación y por semana
- Stop-loss global que pausa el bot automáticamente (calculado sobre USDT + BTC)
- El modo autónomo solo usa el presupuesto asignado y las órdenes nunca se reintentan solas (para no duplicarlas)
- Creá la API key de Binance **sin permiso de retiro**
- Nunca ejecuta órdenes sin confirmación (Fase 4) o sin modo auto activo (Fase 5)
- Cualquier error crítico envía alerta por Telegram
