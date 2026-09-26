# POTRI para PC

La misma app de la TV (`webos/`) empaquetada con Electron como programa de
Windows. Acá solo está la ventana; la app es la de siempre.

## Qué cambia respecto de abrirla en un navegador

- **CORS**: los paneles Xtream no mandan cabeceras CORS, así que en Chrome la
  app no podría ni leer la lista. La ventana corre con `webSecurity: false`,
  igual que la TV la corre como app instalada. Solo carga los archivos que
  vienen adentro del programa; la navegación a otras páginas está bloqueada.
- **Vivo en `.ts`**: Chrome no reproduce MPEG-TS de fábrica. Fuera de la TV la
  app usa `mpegts.js` (se carga a demanda; la TV no lo baja nunca).

## Teclado

Flechas para moverse, Enter para elegir, Esc o Backspace para volver,
F11 pantalla completa, F12 herramientas de diagnóstico.

## Compilar

El CI lo arma en cada push (artefacto `IptvPlayer-windows`). A mano:

```sh
cd ../webos && npm ci && npm run build
cd ../desktop && npm ci && npm run copy-app
npm start            # probarla
npm run dist:win     # instalador + portable en dist/ (en Windows)
```
