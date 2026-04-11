# BTC Bot — Monitor y Trading de Bitcoin

Bot de monitoreo y trading de BTC que corre en Termux (Android). Consulta precios desde Binance, analiza con Gemini AI y notifica/opera por Telegram.

## Fases

| Fase | Descripción | Flag en .env |
|------|-------------|-------------|
| 1-2 | Monitoreo de precios, variaciones y alertas | Siempre activo |
| 3 | Análisis con Gemini AI en alertas | `FASE_3_GEMINI=true` |
| 4 | Compra manual con botones en Telegram | `FASE_4_MANUAL=true` |
| 5 | Auto-trading con límites de seguridad | `FASE_5_AUTO=true` |

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

## Estructura del proyecto

```
main.py              — Loop principal y orquestación
config.py            — Carga de variables desde .env
database.py          — Operaciones SQLite
binance_client.py    — Consultas y trading en Binance
gemini_client.py     — Análisis con Gemini AI
telegram_client.py   — Bot de Telegram
analyzer.py          — Cálculo de variaciones y alertas
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
- Stop-loss global que pausa el bot automáticamente
- Nunca ejecuta órdenes sin confirmación (Fase 4) o sin modo auto activo (Fase 5)
- Cualquier error crítico envía alerta por Telegram
