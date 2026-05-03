# Álbum Panini Mundial 26 · fuentes

Tracker single-file del álbum Panini de la Copa del Mundo 2026.

## Quickstart con Claude Code

```bash
# Instalar dependencias
npm install

# Build completo (genera dist/index.html)
npm run build

# Modo watch durante desarrollo
npm run watch:js   # en una terminal
npm run watch:css  # en otra terminal
node inline.mjs    # cuando querés rebuilder el HTML final
```

Después abrí Claude Code en este folder:

```bash
claude
```

Te lee `CLAUDE.md` automáticamente y queda al tanto de la arquitectura,
las convenciones (numeración real de las figuritas, claves de storage,
etc.) y de qué cosas NO hacer (imágenes copyrighted, dependencias en
runtime, etc.).

## Deploy

`dist/index.html` + `dist/.nojekyll` es todo lo que necesitás subir.

- **Netlify Drop**: arrastrar el folder `dist/` a https://app.netlify.com/drop
- **GitHub Pages**: pushear, Settings → Pages → main / `/ (root)`
- **Cloudflare Pages, Vercel, etc.**: igual de directo

Para generar un `.apk` real, una vez hospedado:
1. https://www.pwabuilder.com
2. Pegar la URL
3. Package for stores → Android
4. Bajar el ZIP con el `.apk` y las signing keys

## Estructura

```
panini-tracker.jsx     ← el componente React entero
entry.jsx              ← monta <App /> en #root
template.html          ← wrapper HTML con placeholders __INLINE_*__
input.css              ← directivas de Tailwind + utilidades custom
tailwind.config.js     ← scanea los JSX
inline.mjs             ← combina bundle + css + manifest → dist/index.html
package.json           ← scripts y deps
CLAUDE.md              ← contexto para Claude Code
README.md              ← este archivo
.gitignore
dist/                  ← output del build (ya viene pre-built)
  ├── index.html       ← la app entera, ~230 KB
  └── .nojekyll
```

Para más detalle sobre la arquitectura y convenciones, leé `CLAUDE.md`.
