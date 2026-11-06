#!/usr/bin/env node
/* Local release-header smoke test. Applies the global CSP from dist/_headers to dist. */
import { createServer } from 'node:http';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import { chromium } from '@playwright/test';

const root = join(process.cwd(), 'dist');
if (!existsSync(join(root, 'index.html'))) {
  console.error('dist missing; run npm run build first.');
  process.exit(2);
}
const headerText = readFileSync(join(root, '_headers'), 'utf8');
const globalBlock = headerText.split(/\n(?=\S)/).find((block) => block.startsWith('/*'));
if (!globalBlock) {
  console.error('_headers has no global /* block.');
  process.exit(2);
}
const headers = {};
for (const line of globalBlock.split('\n').slice(1)) {
  const index = line.indexOf(':');
  if (index < 0) continue;
  headers[line.slice(0, index).trim()] = line.slice(index + 1).trim();
}
if (!headers['Content-Security-Policy'] || !headers['Permissions-Policy']) {
  console.error('global security headers are incomplete.');
  process.exit(2);
}
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
const server = createServer((req, res) => {
  const pathname = decodeURIComponent((req.url ?? '/').split('?')[0]);
  let file = join(root, pathname === '/' ? 'index.html' : pathname);
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(root, 'index.html');
  const ext = extname(file);
  res.writeHead(200, {
    'Content-Type': MIME[ext] ?? 'application/octet-stream',
    'Cache-Control': pathname === '/sw.js' ? 'no-cache' : ext === '.html' ? 'no-cache' : 'public, max-age=60',
    ...headers,
  });
  createReadStream(file).pipe(res);
});
await new Promise((resolve) => server.listen(4178, '127.0.0.1', resolve));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
try {
  await page.goto('http://127.0.0.1:4178/');
  await page.waitForSelector('h1', { timeout: 15000 });
  await page.goto('http://127.0.0.1:4178/#/cases/case-a17-electric-magnetic-screen');
  await page.getByTestId('whole-problem-lab').waitFor({ timeout: 15000 });
  await page.goto('http://127.0.0.1:4178/#/teacher/problems');
  await page.getByTestId('teacher-problem-list').waitFor({ timeout: 15000 });
  if (errors.length) throw new Error(`console/page errors: ${errors.join(' | ')}`);
  console.log('RELEASE_HEADERS_SMOKE_PASS');
  console.log('csp=applied permissions-policy=applied routes=home+case+teacher');
} catch (error) {
  console.error(`RELEASE_HEADERS_SMOKE_FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}
