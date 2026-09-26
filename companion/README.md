# POTRI Companion (configurar la TV desde el celular vía QR)

App web + relay para cargar tu lista (Xtream / M3U) y la API key de OpenSubtitles
desde el celular, escaneando un QR que muestra la TV. **Todo el código vive en este
repo** y corre gratis en Cloudflare Pages (incluye las Functions del relay + un KV).

```
companion/
  index.html                 ← formulario (estático)
  functions/api/pair/[code].js ← relay (Cloudflare Pages Function)
```

## Cómo funciona

1. En la TV: **Mis Listas → Vincular con el celular** muestra un QR con un código de un solo uso.
2. Escaneás el QR → abre esta web app con `?code=XXXXXX`.
3. Cargás los datos y tocás **Enviar** → la web hace `POST /api/pair/XXXXXX` (se guarda en KV, expira a los 10 min).
4. La TV hace `GET /api/pair/XXXXXX`, recibe la config, la aplica y entra al inicio. El dato se borra al leerse (un solo uso).

No pasa ninguna credencial por servidores de terceros: el relay es **tuyo**.

## Deploy en Cloudflare Pages (gratis, ~5 min, una sola vez)

1. Entrá a https://dash.cloudflare.com → **Workers & Pages → Create → Pages → Connect to Git**.
2. Elegí este repo. En la configuración de build:
   - **Framework preset:** None
   - **Build command:** (vacío)
   - **Build output directory:** `companion`
   - **Root directory:** `/` (las Functions se toman de `companion/functions` porque es el output)
   > Si tu setup no detecta las Functions, poné **Root directory: `companion`** y **Build output directory: `.`**
3. **Deploy.** Te queda una URL tipo `https://tu-proyecto.pages.dev`.
4. Creá el almacén KV y vinculalo:
   - **Workers & Pages → KV → Create namespace** (ej. `POTRI_PAIR`).
   - En tu proyecto Pages → **Settings → Functions → KV namespace bindings → Add binding**:
     - **Variable name:** `PAIR`  (exactamente así)
     - **KV namespace:** el que creaste
   - Volvé a desplegar (Deployments → Retry/redeploy) para que tome el binding.
5. En la TV: **Mis Listas → URL de tu companion** → pegá `https://tu-proyecto.pages.dev` → **Vincular con el celular**.

## Alternativa: Vercel

Servís `companion/index.html` como estático y portás `functions/api/pair/[code].js` a
`api/pair/[code].js` (formato de Vercel Functions) usando Vercel KV / Upstash. La lógica
es la misma (POST guarda, GET lee-y-borra, TTL 600s).

## Probar local

`npx wrangler pages dev companion` (requiere `--kv PAIR` para simular el namespace).
