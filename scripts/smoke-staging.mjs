#!/usr/bin/env node
/*
 * Explicit staging smoke check. Requires a real HTTPS URL supplied by the operator.
 * Never insert a default URL here: a missing URL means BLOCKED, not a fabricated site.
 */
const rawUrl = process.argv[2] ?? '';
if (!rawUrl) {
  console.error('Usage: npm run smoke:staging -- https://your-real-staging.example');
  console.error('No URL is hardcoded. Without operator authorization and a real HTTPS URL, STAGING_DEPLOYED remains BLOCKED.');
  process.exit(2);
}

let base;
try {
  base = new URL(rawUrl);
} catch {
  console.error('Invalid staging URL.');
  process.exit(2);
}
const local = base.hostname === 'localhost' || base.hostname === '127.0.0.1';
if (base.protocol !== 'https:' && !(local && base.protocol === 'http:')) {
  console.error('Staging smoke requires HTTPS (localhost HTTP is allowed only for local development).');
  process.exit(2);
}
base.hash = '';
base.search = '';
const root = base.toString().replace(/\/$/, '');

async function check(path, label, expectedType = '') {
  const response = await fetch(`${root}${path}`, { redirect: 'follow' });
  if (!response.ok) throw new Error(`${label}: HTTP ${response.status}`);
  const type = response.headers.get('content-type') ?? '';
  if (expectedType && !type.toLowerCase().includes(expectedType)) {
    throw new Error(`${label}: expected content-type containing ${expectedType}, got ${type || '(missing)'}`);
  }
  return response;
}

try {
  const home = await check('/', 'home', 'text/html');
  const html = await home.text();
  if (!html.includes('id="root"')) throw new Error('home: missing React root');
  if (/<script[^>]+src=["']https?:\/\//i.test(html)) throw new Error('home: third-party script tag found');

  const manifestResponse = await check('/manifest.webmanifest', 'manifest', 'json');
  const manifest = await manifestResponse.json();
  if (manifest.display !== 'standalone' || !Array.isArray(manifest.icons) || manifest.icons.length < 3) {
    throw new Error('manifest: not a standalone installable manifest with three icons');
  }

  const swResponse = await check('/sw.js', 'service worker');
  const swCache = swResponse.headers.get('cache-control') ?? '';
  if (!/no-cache/i.test(swCache)) throw new Error('service worker must be served with no-cache');
  const sw = await swResponse.text();
  if (!sw.includes('workbox') && !sw.includes('precache')) throw new Error('service worker does not look like Workbox');

  const releaseResponse = await check('/release-manifest.json', 'release manifest', 'json');
  const release = await releaseResponse.json();
  if (release.schemaVersion !== 2 || !Array.isArray(release.files) || release.files.length === 0) {
    throw new Error('release manifest schema not recognized');
  }
  if (!release.buildId) throw new Error('release manifest missing buildId');

  console.log(`SMOKE OK ${root}`);
  console.log(`buildId=${release.buildId} appVersion=${release.appVersion ?? 'unknown'} files=${release.files.length}`);
} catch (error) {
  console.error(`STAGING_SMOKE_FAILED: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
