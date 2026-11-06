#!/usr/bin/env node
/*
 * Local Build A -> Build B service-worker upgrade simulation.
 * This is intentionally labelled SIMULATED: it uses two archived copies of the
 * real production dist, not a public staging origin. It verifies that an SW
 * update/reload does not clear the versioned local data keys.
 */
import { createServer } from 'node:http';
import { cpSync, createReadStream, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync, appendFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { chromium } from '@playwright/test';

const ROOT = process.cwd();
const DIST = join(ROOT, 'dist');
const EVIDENCE = join(ROOT, '.local-evidence', 'round18');
const A = join(EVIDENCE, 'pwa-a');
const B = join(EVIDENCE, 'pwa-b');
const PORT = 4177;
if (!existsSync(join(DIST, 'index.html'))) {
  console.error('dist/index.html missing; run npm run build first.');
  process.exit(2);
}

mkdirSync(EVIDENCE, { recursive: true });
rmSync(A, { recursive: true, force: true });
rmSync(B, { recursive: true, force: true });
cpSync(DIST, A, { recursive: true });
cpSync(DIST, B, { recursive: true });
appendFileSync(join(B, 'sw.js'), '\n// Round 18 local Build B marker\n');
writeFileSync(join(B, 'build-b.txt'), 'simulated build B\n');
const manifestB = JSON.parse(readFileSync(join(B, 'release-manifest.json'), 'utf8'));
manifestB.buildId = 'simulated-build-b';
manifestB.generatedAt = new Date().toISOString();
writeFileSync(join(B, 'release-manifest.json'), `${JSON.stringify(manifestB, null, 2)}\n`);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};

let server = null;
let activeDir = A;
function start(dir) {
  activeDir = dir;
  return new Promise((resolveStart) => {
    server = createServer((req, res) => {
      const requestPath = decodeURIComponent((req.url ?? '/').split('?')[0]);
      let file = join(activeDir, requestPath === '/' ? 'index.html' : requestPath);
      if (!existsSync(file) || statSync(file).isDirectory()) file = join(activeDir, 'index.html');
      if (!existsSync(file)) {
        res.writeHead(404); res.end('not found'); return;
      }
      const ext = extname(file);
      res.writeHead(200, {
        'Content-Type': MIME[ext] ?? 'application/octet-stream',
        'Cache-Control': requestPath === '/sw.js' ? 'no-cache' : ext === '.html' ? 'no-cache' : 'public, max-age=60',
      });
      createReadStream(file).pipe(res);
    });
    server.listen(PORT, '127.0.0.1', resolveStart);
  });
}
function stop() {
  return new Promise((resolveStop) => {
    if (!server) return resolveStop();
    server.close(() => { server = null; resolveStop(); });
  });
}

const keys = {
  'emplab.progress.v1': JSON.stringify({ version: 1, questions: { 'p07-01': { favorite: true, attempts: 1, correctCount: 1, lastCorrect: true, lastAnswer: null, hintsUsed: 1, updatedAt: '2026-11-06T00:00:00.000Z' } } }),
  'emplab.cases.progress.v1': JSON.stringify({ version: 1, cases: { 'case-c03-beamline-detector': { visitedStage: 'c03-standard', predictionSelected: 1, predictionCorrect: true, solutionRevealed: true, checkpointSelected: null, checkpointCorrect: null, lastOpenedAt: '2026-11-06T00:00:00.000Z' } } }),
  'emplab.i05.scene.v2': JSON.stringify({ schemaVersion: 2, model: 'i05', marker: 'upgrade-simulation' }),
  'emplab.teacher-problems.v1': JSON.stringify({ version: 1, drafts: [] }),
};

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext();
const page = await context.newPage();
let failed = false;
try {
  await start(A);
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller), null, { timeout: 30000 });
  await page.evaluate((entries) => {
    for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, value);
  }, keys);
  await page.reload();
  for (const [key, value] of Object.entries(keys)) {
    const got = await page.evaluate((k) => localStorage.getItem(k), key);
    if (got !== value) throw new Error(`Build A data mismatch for ${key}`);
  }
  await stop();
  await start(B);
  const updated = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) return false;
    await registration.update();
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      if (registration.installing || registration.waiting) return true;
      await new Promise((resolveWait) => setTimeout(resolveWait, 250));
    }
    return false;
  });
  if (!updated) throw new Error('Build B service worker was not detected');
  await page.reload();
  await page.waitForTimeout(1200);
  for (const [key, value] of Object.entries(keys)) {
    const got = await page.evaluate((k) => localStorage.getItem(k), key);
    if (got !== value) throw new Error(`Build B data mismatch for ${key}`);
  }
  await page.goto(`http://127.0.0.1:${PORT}/#/cases/case-c03-beamline-detector`);
  await page.waitForFunction(() => Boolean(document.querySelector('[data-testid="case-detail"]')), null, { timeout: 20000 });
  console.log('PWA_UPGRADE_SIMULATED_PASS');
  console.log('source=simulated-local-build-a-to-build-b');
  console.log(`keys-preserved=${Object.keys(keys).join(',')}`);
  console.log('note=not a real HTTPS staging upgrade; real staging remains BLOCKED without hosting authorization');
} catch (error) {
  failed = true;
  console.error(`PWA_UPGRADE_SIMULATED_FAIL: ${error instanceof Error ? error.message : String(error)}`);
} finally {
  await browser.close();
  await stop();
}
if (failed) process.exit(1);
