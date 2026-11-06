import { describe, expect, it } from 'vitest';
import { problemCaseById } from '../../src/content/problemCases';
import { checkCaseAnswer } from '../../src/features/cases/solutions/caseAnswerCheck';
import { buildWholeProblemModel } from '../../src/features/cases/wholeProblem/buildWholeProblem';
import type { WholeProblemModel } from '../../src/features/cases/wholeProblem/types';

function model(caseId: string, overrides: Record<string, number> = {}): WholeProblemModel {
  const item = problemCaseById(caseId);
  if (!item) throw new Error(`missing ${caseId}`);
  const baseline = Object.fromEntries(item.wholeProblem.variations.map((variation) => [variation.parameterKey, variation.baseValue]));
  return buildWholeProblemModel({ caseId, adapterId: item.wholeProblem.adapterId, overrides, baseline });
}

function part(caseId: string, partId: string) {
  const item = problemCaseById(caseId);
  const found = item?.parts.find((candidate) => candidate.id === partId);
  if (!found) throw new Error(`missing part ${caseId}/${partId}`);
  return found;
}

describe('Round 16 answer checking', () => {
  it('accepts equivalent expressions and converts compatible units', () => {
    const c03 = model('case-c03-beamline-detector');
    expect(checkCaseAnswer(part('case-c03-beamline-detector', 'a'), '2', 'm/s', c03).status).toBe('correct');
    expect(checkCaseAnswer(part('case-c03-beamline-detector', 'a'), '√4', 'm/s', c03).status).toBe('correct');
    expect(checkCaseAnswer(part('case-c03-beamline-detector', 'a'), '200', 'cm/s', c03).status).toBe('correct');
  });

  it('reports wrong value and incompatible units separately', () => {
    const c03 = model('case-c03-beamline-detector');
    expect(checkCaseAnswer(part('case-c03-beamline-detector', 'a'), '1/3', 'm/s', c03).status).toBe('incorrect');
    expect(checkCaseAnswer(part('case-c03-beamline-detector', 'a'), '2', 's', c03).status).toBe('unit_error');
    expect(checkCaseAnswer(part('case-c03-beamline-detector', 'a'), '1/0', 'm/s', c03).status).toBe('invalid');
  });

  it('marks unavailable variant answers as needs_review instead of using the standard value', () => {
    const absorbed = model('case-c03-beamline-detector', { incidentSpeedMps: 1.5 });
    const result = checkCaseAnswer(part('case-c03-beamline-detector', 'b'), '3.678299314', 's', absorbed);
    expect(result.status).toBe('needs_review');
    expect(result.observed).toBeNull();
  });

  it('recomputes answers after physical parameter changes', () => {
    const elastic = model('case-c06-opposite-wall', { restitution: 1 });
    const result = checkCaseAnswer(part('case-c06-opposite-wall', 'b'), '0', 'J', elastic);
    expect(result.status).toBe('correct');
    expect(result.recomputed).toBe(true);
    expect(result.expected).toBeCloseTo(0, 8);

    const noField = model('case-c08-dual-rod-contact', { bz: 0 });
    const heat = checkCaseAnswer(part('case-c08-dual-rod-contact', 'c'), '0', 'J', noField);
    expect(heat.status).toBe('correct');
    expect(heat.recomputed).toBe(true);
  });

  it('rejects the stale baseline answer in a meaningfully changed variant', () => {
    const noField = model('case-c08-dual-rod-contact', { bz: 0 });
    const stale = checkCaseAnswer(part('case-c08-dual-rod-contact', 'c'), '0.75', 'J', noField);
    expect(stale.status).toBe('incorrect');
  });
});
