import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

describe('Round 18 release and native-pilot safeguards', () => {
  it('generates a build-id/sha manifest and scans release artifacts for private data', () => {
    const script = readFileSync(join(root, 'scripts', 'check-static-build.mjs'), 'utf8');
    expect(script).toContain('schemaVersion: 2');
    expect(script).toContain('buildId');
    expect(script).toContain('appVersion');
    expect(script).toContain('forbiddenExtensions');
    expect(script).toContain('high-confidence');
  });

  it('provides an explicit URL-only staging smoke script with no invented default site', () => {
    const script = readFileSync(join(root, 'scripts', 'smoke-staging.mjs'), 'utf8');
    expect(script).toContain('Usage: npm run smoke:staging');
    expect(script).toContain('https:');
    expect(script).not.toMatch(/https:\/\/[a-z0-9-]+\.netlify\.app/i);
    expect(script).toContain('release-manifest.json');
    expect(script).toContain('buildId');
  });

  it('keeps the Capacitor pilot isolated from PWA assets and pinned to explicit versions', () => {
    const nativeDir = join(root, 'native', 'capacitor-pilot');
    expect(existsSync(join(nativeDir, 'capacitor.config.ts'))).toBe(true);
    expect(existsSync(join(nativeDir, 'package.json'))).toBe(true);
    const config = readFileSync(join(nativeDir, 'capacitor.config.ts'), 'utf8');
    expect(config).toContain("webDir: '../../dist'");
    expect(config).not.toMatch(/server:\s*\{[^}]*url:/s);
    const pkg = JSON.parse(readFileSync(join(nativeDir, 'package.json'), 'utf8')) as { dependencies: Record<string, string> };
    expect(pkg.dependencies['@capacitor/core']).toBe('8.6.0');
    expect(pkg.dependencies['@capacitor/android']).toBe('8.6.0');
    const main = readFileSync(join(root, 'src', 'main.tsx'), 'utf8');
    expect(main).toContain('shouldRegisterServiceWorker');
    expect(main).toContain('detectRuntimePlatform');
  });

  it('keeps backup import local-only and avoids clear-all recovery shortcuts', () => {
    const backup = readFileSync(join(root, 'src', 'features', 'release', 'localBackup.ts'), 'utf8');
    expect(backup).not.toContain('fetch(');
    expect(backup).not.toContain('XMLHttpRequest');
    expect(backup).not.toContain('localStorage.clear');
    expect(backup).toContain('MAX_LOCAL_BACKUP_BYTES');
    expect(backup).toContain('__proto__');
  });

  it('defaults stale derivation text to collapsed after a variant parameter changes', () => {
    const lab = readFileSync(join(root, 'src', 'features', 'cases', 'wholeProblem', 'WholeProblemLab.tsx'), 'utf8');
    expect(lab).toContain('wpl-stale-derivation-guard');
    expect(lab).toContain('wpl-reveal-stale-derivation');
    expect(lab).toContain('staleRevealedByPart');
    expect(lab).toContain('仍查看标准推导');
  });

  it('reports Round 18 app version and retains the PWA registration guard', () => {
    const appInfo = readFileSync(join(root, 'src', 'lib', 'appInfo.ts'), 'utf8');
    expect(appInfo).toContain('0.1.0-round18');
    const main = readFileSync(join(root, 'src', 'main.tsx'), 'utf8');
    expect(main).toContain('registerSW');
  });
});
