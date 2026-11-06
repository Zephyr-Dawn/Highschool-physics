import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dist = 'dist';
const required = [
  'index.html',
  'sw.js',
  'manifest.webmanifest',
  'favicon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/maskable-512.png',
  '_headers',
];
const missing = required.filter((file) => !existsSync(join(dist, file)));
if (missing.length > 0) {
  console.error('Static build missing:', missing.join(', '));
  process.exit(1);
}

const assets = readdirSync(join(dist, 'assets')).sort();
const js = assets.filter((file) => file.endsWith('.js'));
const css = assets.filter((file) => file.endsWith('.css'));
if (js.length === 0 || css.length === 0) {
  console.error('No JS/CSS asset emitted');
  process.exit(1);
}

const indexPath = join(dist, 'index.html');
const indexHtml = readFileSync(indexPath, 'utf8');
if (!indexHtml.includes('id="root"')) {
  console.error('index.html is missing the React root element');
  process.exit(1);
}
if (/<script[^>]+src=["']https?:\/\//i.test(indexHtml)) {
  console.error('index.html loads a third-party script; static release must stay self-contained');
  process.exit(1);
}

let manifest;
try {
  manifest = JSON.parse(readFileSync(join(dist, 'manifest.webmanifest'), 'utf8'));
} catch {
  console.error('manifest.webmanifest is not valid JSON');
  process.exit(1);
}
if (manifest.display !== 'standalone' || !Array.isArray(manifest.icons) || manifest.icons.length < 3) {
  console.error('manifest.webmanifest does not describe an installable standalone app with three icons');
  process.exit(1);
}
if (!manifest.start_url) {
  console.error('manifest.webmanifest is missing start_url');
  process.exit(1);
}

const headers = readFileSync(join(dist, '_headers'), 'utf8');
if (!headers.includes('/sw.js') || !headers.includes('Cache-Control: no-cache')) {
  console.error('_headers does not protect the service worker from stale caching');
  process.exit(1);
}

const sw = readFileSync(join(dist, 'sw.js'), 'utf8');
if (!sw.includes('precache') && !sw.includes('workbox')) {
  console.error('Service worker does not look like a Workbox build');
  process.exit(1);
}
if (/emplab\.teacher-problem-package[\s\S]{0,200}"draft"/.test(sw)) {
  console.error('Service worker appears to contain exported teacher draft content');
  process.exit(1);
}

function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

const total = assets.reduce((sum, file) => sum + statSync(join(dist, 'assets', file)).size, 0);
const artifactFiles = [
  ...required,
  ...assets.map((file) => `assets/${file}`),
].sort();

const artifact = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  appVersion: JSON.parse(readFileSync('package.json', 'utf8')).version,
  entry: 'index.html',
  serviceWorker: 'sw.js',
  counts: { js: js.length, css: css.length, assets: artifactFiles.length },
  bytes: {
    assets: total,
    serviceWorker: statSync(join(dist, 'sw.js')).size,
  },
  files: artifactFiles.map((relative) => {
    const file = join(dist, relative);
    return { path: relative, bytes: statSync(file).size, sha256: sha256(file) };
  }),
};

const manifestPath = join(dist, 'release-manifest.json');
writeFileSync(manifestPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');

console.log(
  `Static build OK: ${js.length} JS, ${css.length} CSS, assets ${(total / 1024).toFixed(1)} KiB, `
  + `${artifactFiles.length} files, sha ${sha256(join(dist, 'sw.js')).slice(0, 12)}, release-manifest.json written`,
);
