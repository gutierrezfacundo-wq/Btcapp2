# CLAUDE.md

Project context for Claude Code. Keep this updated as the project evolves.

## What this is

Single-file PWA tracker for the **Panini FIFA World Cup 2026 sticker album**.
The whole app — React component, ~864 player names, styles, PWA manifest —
ships as one self-contained `dist/index.html` (~230 KB). No backend, no
runtime dependencies beyond Google Fonts (which cache after first load).

Persistence: `localStorage`. Storage keys are versioned (`-v2`) so you can
bump them when the data shape changes.

## Build pipeline

Three steps wired through `npm run build`:

1. **`build:js`** — `esbuild` bundles `entry.jsx` (which imports
   `panini-tracker.jsx`) plus React + lucide-react into a single minified
   `app.bundle.js` (~200 KB).
2. **`build:css`** — `tailwindcss` CLI scans the JSX files and emits only
   the used utility classes into `output.css` (~16 KB), plus the custom
   utilities defined in `input.css` (`font-display`, `panini-shadow`,
   `sticker-tap`, etc.).
3. **`build:inline`** — `node inline.mjs` reads `app.bundle.js`,
   `output.css`, and `template.html`; injects the PWA manifest as a
   base64 data URL; writes everything inline into `dist/index.html` plus
   a `.nojekyll` marker.

Watch mode for hacking: `npm run watch:js` and `npm run watch:css` in
parallel, then re-run `node inline.mjs` whenever you want to rebuild
the final HTML.

## Project structure

```
panini-tracker.jsx    The whole app — one big React component file
entry.jsx             Mounts <App /> on #root
template.html         HTML wrapper with __INLINE_CSS__/__INLINE_JS__/__MANIFEST_DATA_URL__
input.css             Tailwind directives + custom utilities
tailwind.config.js    Scans panini-tracker.jsx + entry.jsx + template.html
inline.mjs            Combines bundle + css + manifest into dist/index.html
dist/                 Build output (gitignored except in releases)
```

## Code conventions

### Sticker numbering matches the real Panini album

- `#1` = team crest (Escudo)
- `#2–#12` = 11 player stickers
- `#13` = team photo (Equipo)
- `#14–#20` = 7 player stickers

Stickers `#1` and `#13` are **not** editable — `isPlayer` returns false
for those. Don't reintroduce the old (wrong) `#2 = Equipo` numbering.

### Data structures

- `TEAMS_BY_GROUP` — 12 groups × 4 teams, each with `code`, `name`,
  `flag`, `color`. Order within each group is the album order.
- `ALL_TEAMS` / `TEAM_BY_CODE` — derived flat / lookup.
- `DEFAULT_NAMES` — `{ 'ARG-17': 'Lionel Messi', ... }` 864 entries
  from the Panini USA-edition checklist.
- `INTRO_INFO` (9), `MUSEUM_INFO` (11), `COCA_INFO` (12) — per-sticker
  info for the special sections (`label`, `code`, `accent`, `flag`).
- `ALL_PAGES` — album-order array used by the prev/next page nav,
  built as `[INTRO, ...48 teams, MUSEUM, COCA]`.

### Storage shape

```
panini26-counts-v2 → { 'ARG-17': 1, 'ARG-5': 2, 'INTRO-3': 1, ... }
panini26-names-v2  → { 'ARG-17': 'Messi (custom)' }   // user overrides only
```

If you change the schema, bump to `-v3` so old data doesn't poison
the new structure.

### Resolving a player name

Always go through `resolveName(id, names)` — it falls back to
`DEFAULT_NAMES[id]` when the user hasn't overridden, and returns
`''` for special slots that don't have a name.

### View / navigation

- `view` is `{ type: 'home' | 'groups' | 'team' | 'simple' | 'search' | 'repes', ... }`
- All view changes go through one of these helpers in `App`:
  - `navigate(newView)` → `history.pushState`, sets view, closes modals
  - `replaceView(newView)` → `history.replaceState` (used by prev/next paging)
  - `goBack()` → `history.back()`
  - `openEditModal` / `advanceEditModal` / `closeEditModal` for the name editor
  - `openConfirmReset` / `closeConfirmReset` for the reset modal
- A single `popstate` listener syncs React state from the history entry.
  This makes the Android hardware back button "just work".

If you add a new screen, **don't** call `setView` directly — go through
`navigate` so the back button stays consistent.

### Styling

- Only Tailwind core classes — no custom Tailwind config or plugins.
- Custom CSS classes (`font-display`, `font-mono-special`,
  `panini-shadow`, `sticker-tap`, `pop`) live in `input.css`. If you add
  a new utility, add it there so Tailwind keeps it.
- Fonts: `Archivo Black` (display), `DM Sans` (body),
  `JetBrains Mono` (numbers). Loaded via Google Fonts in `template.html`.
- Color contrast: when putting text on team color, use
  `textOn(hex)` (dark text on yellows/light blues, white otherwise).
  Threshold is `0.55` luminance.

## Constraints / things not to do

- **No copyrighted images.** Player photos, the actual Panini sticker
  artwork, and FIFA/team logos are licensed and stay out. The app uses
  factual data only (player names, country flags via emoji, team colors)
  and a Panini-style mockup of what a "stuck on" sticker looks like.
- **No external runtime CSS/JS** beyond Google Fonts. Everything else
  must be inlined so the app works offline.
- **No `localStorage`-incompatible APIs** if you ever port to a context
  where storage is async — the code currently relies on synchronous
  reads at startup.
- The bundle has to fit `localStorage` — values are capped at ~5 MB per
  origin, which is plenty for the JSON we store, but be careful if you
  start storing user images or large blobs.

## Hosting & APK

- `dist/index.html` + `dist/.nojekyll` is the entire deployable.
- Drop on any static host: GitHub Pages, Netlify, Vercel, Cloudflare
  Pages. URL must serve over HTTPS for the PWA install prompt to fire.
- For a real `.apk`: host the URL, run it through
  https://www.pwabuilder.com → Package for stores → Android. Output is
  a TWA wrapper (Trusted Web Activity).
- Local Bubblewrap if you have Android SDK installed:
  `npx @bubblewrap/cli init --manifest=https://your-url/manifest.json`.

## Recent state

The app currently has:

- Home with progress %, 4 section cards, plus quick-access tiles for
  Search and Repes.
- Team view with album-style "WE ARE [country]" header, the full
  20-sticker grid (4 cols × 5 rows), pre-filled player names with
  custom-override support, repes-for-trade list.
- Special sections (Introducción, Museo FIFA, Extras Coca-Cola) with
  per-sticker labels, flags, and per-sticker accent colors.
- Search with diacritic-insensitive matching across player names,
  countries, FIFA codes, sticker numbers, museum years.
- Repes view grouped by section with mode toggle to add/subtract.
- Prev/next page navigation in album order with `replaceState`.
- Hardware-back-button support via History API.

## Open ideas (not implemented)

- Export/import progress as a shareable JSON blob (for moving between
  devices or sharing repes lists with friends).
- Highlight/scroll-to-sticker when arriving from search.
- Optional EU/Latam edition for the Coca-Cola stickers (5 names differ).
- A "Próximas figuritas que te faltan" suggestion based on recent activity.
- Bulk-edit mode for re-numbering or batch-renaming a team's players.
