# IPTV Player — LG webOS

App webOS (TV) para reproducir IPTV de listas M3U/M3U8 y portales Xtream Codes. Pensada para LG OLED y similares con webOS 5.0+ (incluida la **C2**).

## Stack

| Capa | Librería |
|------|----------|
| UI | React 18 + React Router (hash) |
| Build | Vite + TypeScript |
| Foco con control remoto | `@noriginmedia/norigin-spatial-navigation` |
| Reproducción HLS | `hls.js` (fallback al `<video>` nativo para MP4/TS) |
| Estado | Zustand |
| Persistencia | `localStorage` (fuente activa, favoritos) |
| EPG | `fast-xml-parser` sobre XMLTV |

## Estructura

```
webos/
├── appinfo.json          ─ Manifest de la app webOS
├── icon.png / icon_large.png
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
└── src/
    ├── main.tsx          ─ Bootstrap React + spatial nav
    ├── App.tsx           ─ Router + back-key global
    ├── data/
    │   ├── types.ts      ─ Tipos y helpers de Xtream
    │   ├── m3u.ts        ─ Parser M3U
    │   ├── m3uCatalog.ts ─ Carga de catálogo desde M3U
    │   ├── xmltv.ts      ─ Parser EPG (XMLTV)
    │   └── xtream.ts     ─ Cliente Xtream Codes
    ├── store/
    │   └── useAppStore.ts ─ Zustand store con persistencia
    ├── components/
    │   ├── FocusableButton.tsx
    │   ├── FocusableInput.tsx
    │   ├── ChannelRow.tsx
    │   ├── PosterCard.tsx
    │   └── CategoryChips.tsx
    ├── screens/
    │   ├── Setup.tsx
    │   ├── Home.tsx       ─ Tabs: Live / Movies / Series / Favoritos
    │   ├── SeriesDetail.tsx
    │   └── Player.tsx     ─ hls.js + overlay + back-key
    ├── styles/
    │   ├── global.css
    │   └── components.css
    └── webos/
        └── remote-keys.ts
```

## Setup

```bash
cd webos
npm install
npm run dev          # http://localhost:5173 — probá en Chrome con DevTools (resolución 1920x1080)
```

## Empaquetar para webOS

Necesitás el **webOS TV CLI** (`@webos-tools/cli`):

```bash
npm i -g @webos-tools/cli
ares-setup-device                     # registrá tu TV
npm run package                       # genera build/com.iptv.player.webos_0.1.0_all.ipk
npm run install:tv                    # instala el ipk en la TV
npm run launch:tv                     # lanza la app
npm run inspect:tv                    # abre DevTools de la TV en tu navegador
```

Para que la TV acepte instalaciones por CLI necesitás activar **Developer Mode** en la C2:

1. Abrí la app **Developer Mode** desde la tienda (LG Content Store).
2. Iniciá sesión con una cuenta LG developer.
3. Activá Dev Mode y Key Server. Anotá la IP que muestra.
4. En la PC: `ares-setup-device` → agregás un device con esa IP y la passphrase.

## Cómo se usa

1. Al abrir la app aparece **Configurar fuente**.
2. Elegí **Lista M3U** (URL .m3u/.m3u8, EPG XMLTV opcional) o **Xtream Codes** (servidor + usuario + clave).
3. Tocar **OK** en *Guardar y cargar*.
4. Navegación con el control remoto:
   - **D-pad**: mover foco entre tabs/canales/posters/episodios.
   - **OK**: abrir/reproducir.
   - **Atrás (◁)**: volver / cerrar app desde Home.
   - **Play/Pause**: en el reproductor.

## Notas técnicas

- En webOS los streams HTTP cleartext están permitidos sin configuración extra (a diferencia de Android).
- `hls.js` se usa cuando la URL termina en `.m3u8`. Para todo lo demás (MP4 / MPEG-TS / DASH) cae al `<video>` nativo del browser, que en webOS soporta HEVC/AVC + AAC out of the box.
- `disableBackHistoryAPI: true` en `appinfo.json` hace que la tecla *Atrás* no navegue automáticamente — la manejamos a nivel router.
- El foco visual está controlado vía CSS `.focusable.focused` (outline + scale). Las TVs no tienen `:hover`, por eso usamos clase explícita.

## Roadmap corto

- Mini-EPG sobre el video (programa actual + siguiente).
- Búsqueda con teclado en pantalla webOS (`window.webOS.keyboard`).
- Cache de imágenes/posters en `caches` API para listas grandes.
- Resume de reproducción para VOD/series.

## Aviso legal

La app no incluye ni distribuye contenido. Solo reproduce streams provistos por el usuario. Asegurate de tener derechos legítimos sobre las fuentes que cargues.
