// Folds dist/index.html plus its local JS, CSS and font into ONE file: play.html.
// The Toy SDK <script> stays an external link — the platform serves it.
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const dist = path.join(root, 'dist');
const mime = { '.woff2': 'font/woff2', '.woff': 'font/woff', '.png': 'image/png', '.svg': 'image/svg+xml' };
const isExternal = url => /^(?:[a-z]+:)?\/\//i.test(url);

function dataUri(file) {
  const resolved = path.resolve(file);
  if (!resolved.startsWith(dist + path.sep)) throw new Error(`Asset is outside dist: ${file}`);
  return `data:${mime[path.extname(file)] ?? 'application/octet-stream'};base64,${fs.readFileSync(resolved).toString('base64')}`;
}

let html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');

html = html.replace(/<link\b[^>]*rel="stylesheet"[^>]*>/g, tag => {
  const href = tag.match(/href="([^"]+)"/)?.[1];
  if (!href) throw new Error('Stylesheet missing href');
  const file = path.resolve(dist, href);
  const css = fs.readFileSync(file, 'utf8').replace(/url\((['"]?)([^)'"\s]+)\1\)/g, (match, _q, url) => {
    if (url.startsWith('data:') || url.startsWith('#')) return match;
    if (isExternal(url)) throw new Error(`External asset in standalone CSS: ${url}`);
    const asset = url.startsWith('/') ? path.join(dist, url.slice(1)) : path.resolve(path.dirname(file), url);
    return `url("${dataUri(asset)}")`;
  });
  return `<style>${css.replace(/<\/style/gi, '<\\/style')}</style>`;
});

let inlined = 0;
html = html.replace(/<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/g, (tag, src) => {
  if (isExternal(src)) return tag; // the Toy SDK
  const js = fs.readFileSync(path.resolve(dist, src), 'utf8');
  if (/\bimport\s*\(/.test(js)) throw new Error('Standalone build needs a single JavaScript chunk');
  inlined++;
  return `<script type="module">${js.replace(/<\/script/gi, '<\\/script')}</script>`;
});
if (inlined !== 1) throw new Error(`Expected exactly one local script, found ${inlined}`);
if (!html.includes('toy-sdk.js')) throw new Error('Toy SDK script tag went missing');
html = html.replace(/<link\b[^>]*rel="(?:modulepreload|preload)"[^>]*>/g, '');

const license = fs.readFileSync(path.join(root, 'src/assets/FusionPixel-OFL.txt'), 'utf8');
fs.writeFileSync(path.join(dist, 'FusionPixel-OFL.txt'), license);
html = html.replace('</head>', `<!-- Bundled font: Fusion Pixel 12px, SIL Open Font License 1.1.\n${license.replace(/--/g, '—')} -->\n</head>`);

for (const out of [path.join(dist, 'play.html'), path.join(root, 'play.html')]) fs.writeFileSync(out, html);

const kb = n => `${(n / 1024).toFixed(0)} KB`;
const size = f => fs.statSync(f).size;
const assets = fs.readdirSync(path.join(dist, 'assets')).map(f => `${f} ${kb(size(path.join(dist, 'assets', f)))}`);
console.log(`dist/: index.html ${kb(size(path.join(dist, 'index.html')))} + ${assets.join(', ')}`);
console.log(`play.html (single file): ${kb(Buffer.byteLength(html))}`);
