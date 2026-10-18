# IPTV Player (Android) + BTC Bot

Este repo aloja dos proyectos en branches separados:

- **`claude/iptv-player-app-*`** — App Android nativa para reproducir IPTV (ver abajo).
- **`main`** — Bot Python de monitoreo de BTC (sección al final).

---

## IPTV Player — App Android

App nativa en Kotlin + Jetpack Compose con ExoPlayer (Media3) para reproducir listas IPTV de tipo M3U/M3U8 y portales Xtream Codes. Pensada para móvil y Android TV.

### Features

- Soporte para **listas M3U/M3U8** (URL remota) y **Xtream Codes API** (servidor + usuario + clave).
- **En vivo**, **Películas (VOD)** y **Series** con sus episodios por temporada.
- **Categorías** filtrables como chips.
- **Favoritos** persistidos localmente (Room).
- **EPG** (XMLTV) con "ahora en pantalla" por canal (cuando la fuente provee EPG).
- Reproducción HLS, DASH y MPEG-TS via ExoPlayer.
- Permite **cleartext HTTP** porque la mayoría de fuentes IPTV no usan TLS.

### Cómo abrir / buildear

Requisitos: Android Studio Ladybug (o superior), Android SDK 35, JDK 17.

```bash
# Abrir en Android Studio (File → Open → seleccionar la raíz del repo)
# o desde la línea de comandos:
./gradlew :app:assembleDebug

# Instalar en un dispositivo conectado:
./gradlew :app:installDebug
```

Si Android Studio te pide `local.properties`, creá el archivo con:

```
sdk.dir=/ruta/al/Android/Sdk
```

### Stack

| Capa | Librería |
|------|----------|
| UI | Jetpack Compose + Material 3 + Navigation |
| Player | androidx.media3 (ExoPlayer, HLS, DASH, OkHttp DataSource) |
| Red | Retrofit + OkHttp + kotlinx.serialization |
| Storage | Room (favoritos) + DataStore (config de fuente) |
| Imágenes | Coil |

### Estructura

```
app/src/main/java/com/iptv/player/
├── IptvApp.kt
├── MainActivity.kt
├── di/AppContainer.kt          ─ DI manual
├── data/
│   ├── model/                  ─ Channel, Movie, SeriesInfo, Episode, EpgProgram, SourceConfig
│   ├── parser/                 ─ M3uParser, XmltvParser
│   ├── remote/                 ─ XtreamApi (Retrofit) + DTOs
│   ├── local/                  ─ Room (favoritos) + DataStore (prefs)
│   └── repository/             ─ IptvRepository, EpgRepository
└── ui/
    ├── Navigation.kt
    ├── setup/                  ─ Pantalla de configuración inicial
    ├── home/                   ─ Tabs: Live / Movies / Series / Favoritos
    ├── series/                 ─ Detalle de serie con episodios
    ├── player/                 ─ ExoPlayer + PlayerView
    ├── components/             ─ ChannelRow, PosterCard
    └── theme/
```

### Cómo se usa la app

1. Abrir la app → pantalla **Configurar fuente**.
2. Elegir tab **Lista M3U** (pegar URL `.m3u` o `.m3u8`, opcionalmente URL EPG XMLTV) o **Xtream Codes** (servidor `https://host:puerto`, usuario, clave).
3. Tocar **Guardar y cargar**. La app descarga y parsea el catálogo.
4. Navegar por **En vivo / Películas / Series / Favoritos** en la barra inferior.
5. Tocar el corazón para marcar favoritos. Tocar el ícono de ajustes (arriba) para cambiar de fuente.

> **Aviso legal:** la app no incluye ni distribuye contenido. Solo reproduce streams provistos por el usuario. Asegurate de tener derechos legítimos sobre las fuentes que cargues.

### Build automático con GitHub Actions

El repo incluye `.github/workflows/build.yml`. En cada push compila APK Android + IPK webOS y los deja como artifacts descargables.

**Para generar APK ahora** (sin tener que instalar Android Studio):

1. Entrá al repo en GitHub → pestaña **Actions**.
2. En la sidebar elegí **Build apps**.
3. Botón **Run workflow** → elegí el branch `claude/iptv-player-app-BMB34` → **Run**.
4. Esperá ~5-7 min hasta que termine.
5. Entrá al run → al fondo de la página hay sección **Artifacts** → bajá `IptvPlayer-apk.zip` (contiene el `.apk` debug-signed).

**Para publicar una release con APK + IPK adjuntos:**

```bash
git tag v0.1.0
git push origin v0.1.0
```

El workflow corre, crea una GitHub Release con changelog automático, y adjunta ambos archivos.

### Instalar el APK en el teléfono

1. Pasá el `.apk` al celu (USB, Drive, Telegram a vos mismo, etc.).
2. En **Configuración → Apps → Acceso especial → Instalar apps desconocidas**, habilitá tu file manager o navegador.
3. Tocá el `.apk` → Instalar. (Android puede pedir Play Protect skip, dale "Instalar igual".)
4. Abrí *IPTV Player* → pegá M3U o credenciales Xtream → listo.

---

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
