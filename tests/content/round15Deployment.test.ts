import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EXAM_REFERENCES } from '../../src/content/examReferences';
import { PROBLEM_CASES } from '../../src/content/problemCases';

const root = process.cwd();

describe('Round 15 deployment and source safeguards', () => {
  it('ships a static Netlify configuration with SPA redirect and no secrets', () => {
    const config = readFileSync(join(root, 'netlify.toml'), 'utf8');
    expect(config).toContain('command = "npm run build"');
    expect(config).toContain('publish = "dist"');
    expect(config).toContain('to = "/index.html"');
    expect(config).not.toMatch(/token|secret|password/i);
    const headers = readFileSync(join(root, 'public', '_headers'), 'utf8');
    expect(headers).toContain('/sw.js');
    expect(headers).toContain('Cache-Control: no-cache');
    expect(existsSync(join(root, 'scripts', 'check-static-build.mjs'))).toBe(true);
  });

  it('keeps every exam reference unverified and link-only', () => {
    expect(EXAM_REFERENCES.length).toBeGreaterThanOrEqual(5);
    for (const reference of EXAM_REFERENCES) {
      expect(reference.verifiedOnline).toBe(false);
      expect(reference.sourceKind).toBe('exam_reference');
      expect(reference.verification).toBe('unverified');
      expect(reference.rights).toBe('link_only');
      expect('stem' in reference).toBe(false);
      expect('answer' in reference).toBe(false);
    }
  });

  it('keeps all eight cases original and independent of exam rights', () => {
    expect(PROBLEM_CASES).toHaveLength(9);
    for (const item of PROBLEM_CASES) {
      expect(item.provenance.sourceKind).toBe('original_case');
      expect(item.provenance.rights).toBe('original');
      expect(item.provenance.verification).toBe('paper_and_solution_verified');
      expect(item.stem).not.toContain('高考原题');
    }
  });

  it('keeps deployment docs aligned with the live public site', () => {
    const deployment = readFileSync(join(root, 'docs', 'DEPLOYMENT_STAGING.md'), 'utf8');
    expect(deployment).toContain('https://soft-toffee-cbd208.netlify.app/');
    expect(deployment).toContain('npm run verify:static');
    expect(deployment).toContain('release-manifest.json');
    expect(deployment).not.toContain('BLOCKED: hosting authorization unavailable');
  });
});
