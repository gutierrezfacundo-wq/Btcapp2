// Inlines app.bundle.js, output.css, and a PWA manifest data URL
// into template.html, producing dist/index.html.
//
// Run after build:js and build:css. Or use `npm run build` which chains all three.

import fs from 'node:fs';
import { Buffer } from 'node:buffer';

const jsBundle = fs.readFileSync('app.bundle.js', 'utf8');
const css      = fs.readFileSync('output.css', 'utf8');
const template = fs.readFileSync('template.html', 'utf8');

const icon192 = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192"><rect width="192" height="192" rx="42" fill="#E11D48"/><text x="96" y="138" font-family="Helvetica,Arial,sans-serif" font-weight="900" font-size="92" fill="white" text-anchor="middle">26</text></svg>`;
const icon512 = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="#E11D48"/><text x="256" y="370" font-family="Helvetica,Arial,sans-serif" font-weight="900" font-size="246" fill="white" text-anchor="middle">26</text></svg>`;

const manifest = {
  name: 'Álbum Panini Mundial 26',
  short_name: 'Álbum 26',
  description: 'Tracker del álbum Panini del Mundial 2026',
  start_url: './',
  scope: './',
  display: 'standalone',
  orientation: 'portrait',
  background_color: '#FAFAF7',
  theme_color: '#E11D48',
  lang: 'es',
  icons: [
    { src: 'data:image/svg+xml;utf8,' + encodeURIComponent(icon192), sizes: '192x192', type: 'image/svg+xml', purpose: 'any maskable' },
    { src: 'data:image/svg+xml;utf8,' + encodeURIComponent(icon512), sizes: '512x512', type: 'image/svg+xml', purpose: 'any maskable' },
  ],
};

const manifestB64 = Buffer.from(JSON.stringify(manifest)).toString('base64');
const manifestUrl = 'data:application/manifest+json;base64,' + manifestB64;

const html = template
  .replace('__MANIFEST_DATA_URL__', manifestUrl)
  .replace('__INLINE_CSS__', css)
  .replace('__INLINE_JS__', jsBundle);

fs.mkdirSync('dist', { recursive: true });
fs.writeFileSync('dist/index.html', html);
fs.writeFileSync('dist/.nojekyll', '');

const size = fs.statSync('dist/index.html').size;
console.log(`✓ dist/index.html  ${(size / 1024).toFixed(1)} KB`);
