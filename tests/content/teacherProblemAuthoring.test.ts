import { describe, expect, it } from 'vitest';
import {
  A17_CASE_ID,
} from '../../src/content/round17Case';
import { PROBLEM_CASES } from '../../src/content/problemCases';
import { compileTeacherProblem } from '../../src/features/problem-authoring/problemCompiler';
import {
  AUTHORING_ADAPTERS,
  AUTHORABLE_ADAPTER_IDS,
  adapterRegistryEntry,
} from '../../src/features/problem-authoring/problemAdapterRegistry';
import {
  createA17InductionTemplate,
  createA17TeacherTemplate,
  copyBuiltInCaseAsDraft,
} from '../../src/features/problem-authoring/round17Templates';
import {
  createBlankTeacherDraft,
  newTeacherPartId,
  teacherProblemDraftSchema,
} from '../../src/features/problem-authoring/teacherProblemSchema';
import {
  deleteTeacherDraft,
  duplicateTeacherDraft,
  exportTeacherProblemPackage,
  importIntoStore,
  importTeacherProblemPackage,
  loadTeacherDrafts,
  saveTeacherDrafts,
  upsertTeacherDraft,
  type StorageLike,
} from '../../src/features/problem-authoring/teacherProblemStore';

class MemoryStorage implements StorageLike {
  data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

function templateDraft() {
  const draft = createA17TeacherTemplate();
  expect(teacherProblemDraftSchema.safeParse(draft).success).toBe(true);
  return draft;
}

describe('teacher problem schemas and whitelist', () => {
  it('registers only explicit, non-executable physics adapters', () => {
    expect(AUTHORABLE_ADAPTER_IDS.sort()).toEqual(['a17-electric-magnetic-screen', 'i07-opposite-wall']);
    for (const id of AUTHORABLE_ADAPTER_IDS) {
      const adapter = AUTHORING_ADAPTERS[id];
      expect(adapter.parameters.length).toBeGreaterThan(0);
      expect(adapter.observables.length).toBeGreaterThan(0);
      expect(adapter.support).toBe('continuous');
    }
    expect(adapterRegistryEntry('eval')).toBeNull();
    expect(adapterRegistryEntry('__proto__')).toBeNull();
  });

  it('compiles the A17-01 teacher template into a student whole-problem item', () => {
    const draft = templateDraft();
    const result = compileTeacherProblem(draft);
    expect(result.errors).toEqual([]);
    expect(result.status).toBe('simulation_verified');
    expect(result.item).not.toBeNull();
    expect(result.item!.parts).toHaveLength(3);
    expect(result.model?.adapterId).toBe('a17-electric-magnetic-screen');
    expect(result.item!.wholeProblem.variations).toHaveLength(4);
    const screenPart = result.item!.parts.find((part) => part.id === 'c')!;
    expect(screenPart.answerSpec.baselineValue).toBeCloseTo((4 * Math.sqrt(3)) / 3 - 1.5, 9);
    expect(screenPart.answerSpec.dependsOn.sort()).toEqual([
      'electricFieldX',
      'magneticFieldZ',
      'magneticWidthM',
      'screenGapM',
    ]);
    expect(result.checks.find((check) => check.id === 'stage-continuity')?.status).toBe('pass');
    expect(result.checks.find((check) => check.id === 'local-only')?.status).toBe('pass');
  });

  it('compiles the A17-02 I07 template with separate Q_J and Q_impact bindings', () => {
    const draft = createA17InductionTemplate();
    expect(teacherProblemDraftSchema.safeParse(draft).success).toBe(true);
    const result = compileTeacherProblem(draft);
    expect(result.errors).toEqual([]);
    expect(result.status).toBe('simulation_verified');
    expect(result.item).not.toBeNull();
    expect(result.item!.parts).toHaveLength(4);
    const joule = result.item!.parts.find((part) => part.answerSpec.quantity === 'jouleHeatAtBounceJ')!;
    const impact = result.item!.parts.find((part) => part.answerSpec.quantity === 'impactLossJ')!;
    expect(joule.answerSpec.baselineValue).toBeCloseTo(30.38, 3);
    expect(impact.answerSpec.baselineValue).toBeCloseTo(1.215, 6);
    expect(joule.answerSpec.baselineValue).not.toBeCloseTo(impact.answerSpec.baselineValue, 3);
    expect(result.item!.wholeProblem.adapterId).toBe('i07-opposite-wall');
  });

  it('copies built-in cases without mutating them or losing preview bindings', () => {
    const before = JSON.stringify(PROBLEM_CASES);
    for (const caseItem of PROBLEM_CASES) {
      const draft = copyBuiltInCaseAsDraft(caseItem.id);
      expect(draft, caseItem.id).not.toBeNull();
      expect(teacherProblemDraftSchema.safeParse(draft).success, caseItem.id).toBe(true);
      expect(draft!.id).not.toBe(caseItem.id);
      expect(draft!.sourceCaseId).toBe(caseItem.id);
      const result = compileTeacherProblem(draft!);
      expect(result.errors, `${caseItem.id}: ${result.errors.join(' / ')}`).toEqual([]);
      expect(result.item, caseItem.id).not.toBeNull();
      expect(result.status, caseItem.id).toBe('simulation_verified');
    }
    expect(JSON.stringify(PROBLEM_CASES)).toBe(before);
  });

  it('keeps A17-01 available as a public built-in case without changing the 16-model count', () => {
    expect(PROBLEM_CASES.some((item) => item.id === A17_CASE_ID)).toBe(true);
    const publicCase = PROBLEM_CASES.find((item) => item.id === A17_CASE_ID)!;
    expect(publicCase.wholeProblem.adapterId).toBe('a17-electric-magnetic-screen');
    expect(publicCase.parts).toHaveLength(3);
  });

  it('rejects unknown adapters, duplicate IDs and unsupported units at the schema boundary', () => {
    const base = templateDraft();
    const unknown = structuredClone(base);
    unknown.scenario.adapterId = 'eval' as typeof unknown.scenario.adapterId;
    expect(teacherProblemDraftSchema.safeParse(unknown).success).toBe(false);

    const duplicateParts = structuredClone(base);
    duplicateParts.parts.push({ ...duplicateParts.parts[0] });
    expect(teacherProblemDraftSchema.safeParse(duplicateParts).success).toBe(false);

    const badUnit = structuredClone(base);
    badUnit.parts[0].answerSpec.unit = 'furlong' as never;
    expect(teacherProblemDraftSchema.safeParse(badUnit).success).toBe(false);

    const badUrl = structuredClone(base);
    badUrl.provenance.sourceUrl = 'javascript:alert(1)';
    expect(teacherProblemDraftSchema.safeParse(badUrl).success).toBe(false);

    const unknownPackage = JSON.stringify({
      ...JSON.parse(exportTeacherProblemPackage(base)),
      draft: { ...base, scenario: { ...base.scenario, adapterId: 'dynamic-import-evil' } },
    });
    expect(importTeacherProblemPackage(unknownPackage).ok).toBe(false);
  });

  it('keeps source verification and publication rights independent', () => {
    const base = templateDraft();
    const claimed = structuredClone(base);
    claimed.provenance.sourceReview = 'paper_and_solution_verified';
    claimed.provenance.reviewEvidence = '教师在本地查看了自己持有的试卷与答案。';
    claimed.provenance.rights = 'unknown';
    expect(teacherProblemDraftSchema.safeParse(claimed).success).toBe(true);
    const result = compileTeacherProblem(claimed);
    expect(result.status).toBe('simulation_verified');
    expect(result.item!.provenance.rights).toBe('unknown');
    expect(result.item!.provenance.sourceReview).toBe('paper_and_solution_verified');
    expect(result.warnings.some((warning) => warning.includes('不是系统认证'))).toBe(true);

    const permissionWithoutEvidence = structuredClone(base);
    permissionWithoutEvidence.provenance.rights = 'permission_granted';
    expect(teacherProblemDraftSchema.safeParse(permissionWithoutEvidence).success).toBe(false);
  });

  it('blocks dangerous HTML/link commands in formulas before preview', () => {
    const draft = templateDraft();
    draft.parts[0].derivationSteps[0].formula = '\\href{javascript:alert(1)}{click}';
    const result = compileTeacherProblem(draft);
    expect(result.status).toBe('content_incomplete');
    expect(result.errors.some((error) => error.includes('HTML/外部资源'))).toBe(true);
    expect(result.item).toBeNull();
  });

  it('requires three complete parts before marking a draft simulation verified', () => {
    const blank = createBlankTeacherDraft('a17-electric-magnetic-screen');
    expect(teacherProblemDraftSchema.safeParse(blank).success).toBe(true);
    const blankResult = compileTeacherProblem(blank);
    expect(blankResult.status).toBe('content_incomplete');
    expect(blankResult.item).toBeNull();

    const incomplete = templateDraft();
    incomplete.parts = [incomplete.parts[0]];
    const result = compileTeacherProblem(incomplete);
    expect(result.status).toBe('content_incomplete');
    expect(result.warnings.some((warning) => warning.includes('至少需要 3 个小问'))).toBe(true);
    expect(result.item).not.toBeNull();
  });

  it('creates unique part ids for editor-created questions', () => {
    const ids = new Set(Array.from({ length: 20 }, (_, index) => newTeacherPartId(index + 1)));
    expect(ids.size).toBe(20);
  });
});

describe('teacher local-only storage and safe import/export', () => {
  it('round-trips a private package and preserves physics answer bindings', () => {
    const draft = templateDraft();
    const text = exportTeacherProblemPackage(draft, '2026-11-05T10:00:00.000Z');
    const imported = importTeacherProblemPackage(text);
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    expect(imported.draft.id).toBe(draft.id);
    const before = compileTeacherProblem(draft);
    const after = compileTeacherProblem(imported.draft);
    expect(after.item?.parts[0].answerSpec.baselineValue).toBeCloseTo(before.item!.parts[0].answerSpec.baselineValue, 12);
    expect(after.item?.parts[2].answerSpec.baselineValue).toBeCloseTo(before.item!.parts[2].answerSpec.baselineValue, 12);
  });

  it('generates a new ID on conflict without changing content or physics', () => {
    const draft = templateDraft();
    const text = exportTeacherProblemPackage(draft);
    const imported = importTeacherProblemPackage(text, { existingIds: [draft.id] });
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    expect(imported.draft.id).not.toBe(draft.id);
    expect(imported.warning).toContain('新 ID');
    expect(imported.draft.parts).toHaveLength(draft.parts.length);
    expect(imported.draft.scenario.adapterId).toBe(draft.scenario.adapterId);
  });

  it('rejects oversized, malformed and prototype-pollution packages without touching existing data', () => {
    const storage = new MemoryStorage();
    const draft = templateDraft();
    expect(upsertTeacherDraft(draft, storage).ok).toBe(true);
    const original = storage.getItem('emplab.teacher-problems.v1');
    const validPackageText = exportTeacherProblemPackage(draft);
    const validPackage = JSON.parse(validPackageText);
    const polluted = validPackageText.replace('"draft": {', '"draft": {"__proto__":{"polluted":true},');
    expect(polluted).not.toBe(validPackageText);
    const pollutedResult = importIntoStore(polluted, storage);
    expect(pollutedResult.ok).toBe(false);
    expect(storage.getItem('emplab.teacher-problems.v1')).toBe(original);

    const broken = '{ not json';
    expect(importIntoStore(broken, storage).ok).toBe(false);
    expect(storage.getItem('emplab.teacher-problems.v1')).toBe(original);

    const oversized = JSON.stringify({ ...validPackage, padding: 'x'.repeat(600 * 1024) });
    expect(importTeacherProblemPackage(oversized).ok).toBe(false);

    const deep: Record<string, unknown> = {};
    let cursor = deep;
    for (let i = 0; i < 30; i += 1) {
      const next: Record<string, unknown> = {};
      cursor.next = next;
      cursor = next;
    }
    const deepPackage = JSON.stringify({ ...validPackage, extra: deep });
    expect(importTeacherProblemPackage(deepPackage).ok).toBe(false);
  });

  it('never changes the previous store on a failed save or import', () => {
    const storage = new MemoryStorage();
    const draft = templateDraft();
    expect(upsertTeacherDraft(draft, storage).ok).toBe(true);
    const before = storage.getItem('emplab.teacher-problems.v1');
    const state = loadTeacherDrafts(storage);
    expect(state.state.drafts).toHaveLength(1);
    const invalidState = {
      version: 1 as const,
      drafts: [{ ...draft, scenario: { ...draft.scenario, adapterId: 'unknown' } }],
    };
    expect(saveTeacherDrafts(invalidState as never, storage).ok).toBe(false);
    expect(storage.getItem('emplab.teacher-problems.v1')).toBe(before);

    const broken = importIntoStore('{"format":"wrong"}', storage);
    expect(broken.ok).toBe(false);
    expect(storage.getItem('emplab.teacher-problems.v1')).toBe(before);
  });

  it('supports explicit save, duplicate and delete without touching built-in content', () => {
    const storage = new MemoryStorage();
    storage.setItem('emplab.cases.progress.v1', '{"version":1,"cases":{"case-c01-boundary-exit":{"visitedStage":"c01-strip"}}}');
    storage.setItem('emplab.p04.scene.v2', '{"schemaVersion":2,"model":"p04","marker":"personal"}');
    const builtInBefore = JSON.stringify(PROBLEM_CASES);
    const draft = templateDraft();
    expect(upsertTeacherDraft(draft, storage).ok).toBe(true);
    const duplicate = duplicateTeacherDraft(draft.id, storage);
    expect(duplicate.ok).toBe(true);
    if (!duplicate.ok) return;
    expect(duplicate.draft.id).not.toBe(draft.id);
    expect(duplicate.state.drafts).toHaveLength(2);
    const deleted = deleteTeacherDraft(draft.id, storage);
    expect(deleted.ok).toBe(true);
    if (!deleted.ok) return;
    expect(deleted.state.drafts).toHaveLength(1);
    expect(deleted.state.drafts[0].id).toBe(duplicate.draft.id);
    expect(storage.getItem('emplab.cases.progress.v1')).toContain('case-c01-boundary-exit');
    expect(storage.getItem('emplab.p04.scene.v2')).toContain('personal');
    expect(JSON.stringify(PROBLEM_CASES)).toBe(builtInBefore);
  });
});
