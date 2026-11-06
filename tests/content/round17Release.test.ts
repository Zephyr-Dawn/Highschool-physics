import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AUTHORING_ADAPTERS, AUTHORABLE_ADAPTER_IDS } from '../../src/features/problem-authoring/problemAdapterRegistry';
import {
  MAX_TEACHER_PACKAGE_BYTES,
  TEACHER_PROBLEM_STORAGE_KEY,
} from '../../src/features/problem-authoring/teacherProblemSchema';

const root = process.cwd();

describe('Round 17 release and integration safeguards', () => {
  it('generates a hash manifest and rejects third-party scripts during static verification', () => {
    const script = readFileSync(join(root, 'scripts', 'check-static-build.mjs'), 'utf8');
    expect(script).toContain('release-manifest.json');
    expect(script).toContain('createHash');
    expect(script).toContain('sha256');
    expect(script).toContain('third-party script');
    expect(script).toContain('manifest.webmanifest');
    expect(script).toContain('_headers');
  });

  it('keeps teacher routes lazy-loaded and out of the global model registry', () => {
    const app = readFileSync(join(root, 'src', 'app', 'App.tsx'), 'utf8');
    expect(app).toContain('TeacherProblemListPage');
    expect(app).toContain('TeacherProblemEditorPage');
    expect(app).toContain('TeacherProblemPreviewPage');
    expect(app).toContain('/teacher/problems');
    const registry = readFileSync(join(root, 'src', 'simulations', 'registry.ts'), 'utf8');
    expect(registry).not.toContain('teacher');
    expect(registry).not.toContain('a17');
  });

  it('declares only whitelisted physics adapters and no executable adapter payload', () => {
    expect(AUTHORABLE_ADAPTER_IDS.sort()).toEqual(['a17-electric-magnetic-screen', 'i07-opposite-wall']);
    const source = readFileSync(join(root, 'src', 'features', 'problem-authoring', 'problemAdapterRegistry.ts'), 'utf8');
    expect(source).not.toContain('eval(');
    expect(source).not.toContain('new Function');
    expect(source).not.toContain('import(');
    for (const adapter of Object.values(AUTHORING_ADAPTERS)) {
      expect(typeof adapter.id).toBe('string');
      expect(adapter.parameters.every((parameter) => Number.isFinite(parameter.baseValue))).toBe(true);
    }
  });

  it('uses a versioned local-only teacher namespace with bounded import size', () => {
    expect(TEACHER_PROBLEM_STORAGE_KEY).toBe('emplab.teacher-problems.v1');
    expect(MAX_TEACHER_PACKAGE_BYTES).toBe(512 * 1024);
    const store = readFileSync(join(root, 'src', 'features', 'problem-authoring', 'teacherProblemStore.ts'), 'utf8');
    expect(store).not.toContain('fetch(');
    expect(store).not.toContain('XMLHttpRequest');
    expect(store).toContain('__proto__');
  });

  it('keeps deployment blocked and real-device statuses honest in documentation', () => {
    const deployment = readFileSync(join(root, 'docs', 'ROUND17_DEVICE_RELEASE_MATRIX.md'), 'utf8');
    expect(deployment).toContain('BLOCKED');
    expect(deployment).toContain('NOT_TESTED');
    expect(deployment).toContain('SIMULATED');
    expect(deployment).not.toMatch(/https:\/\/[a-z0-9-]+\.netlify\.app/i);
  });

  it('keeps A17-01 outside the 16-model registry while preserving the case route', () => {
    const registry = readFileSync(join(root, 'src', 'simulations', 'registry.ts'), 'utf8');
    expect(registry).toContain("id: 'p01'");
    expect(registry).toContain("id: 'i08'");
    expect(registry).not.toContain('a17');
    const cases = readFileSync(join(root, 'src', 'content', 'problemCases.ts'), 'utf8');
    expect(cases).toContain('A17_CASE');
  });
});
