import { describe, expect, it } from 'vitest';
import {
  CASE_BACKUP_STORAGE_KEY,
  CASE_MODEL_SCENE_KEYS,
  backupCaseScene,
  loadCaseProgress,
  parseCaseProgress,
  restoreCaseBackups,
  saveCaseProgress,
} from '../../src/features/cases/caseSession';

describe('case scene backup and progress storage', () => {
  it('backs up a personal scene before a case and restores it afterwards', () => {
    const key = CASE_MODEL_SCENE_KEYS.p04;
    window.localStorage.setItem(key, '{"schemaVersion":2,"model":"p04","marker":"personal"}');
    expect(backupCaseScene('p04')).toBe(true);
    expect(window.localStorage.getItem(CASE_BACKUP_STORAGE_KEY)).toContain('marker');
    window.localStorage.setItem(key, '{"schemaVersion":2,"model":"p04","marker":"case"}');
    expect(restoreCaseBackups()).toEqual(['p04']);
    expect(window.localStorage.getItem(key)).toContain('personal');
    expect(restoreCaseBackups()).toEqual([]);
  });

  it('removes a case scene that did not exist before the launch', () => {
    const key = CASE_MODEL_SCENE_KEYS.i03;
    window.localStorage.removeItem(key);
    expect(backupCaseScene('i03')).toBe(true);
    window.localStorage.setItem(key, '{"schemaVersion":2,"model":"i03"}');
    expect(restoreCaseBackups()).toEqual(['i03']);
    expect(window.localStorage.getItem(key)).toBeNull();
  });

  it('does not overwrite an existing backup when launching another stage', () => {
    const key = CASE_MODEL_SCENE_KEYS.p05;
    window.localStorage.setItem(key, 'personal-p05');
    expect(backupCaseScene('p05')).toBe(true);
    window.localStorage.setItem(key, 'case-p05');
    expect(backupCaseScene('p05')).toBe(false);
    restoreCaseBackups();
    expect(window.localStorage.getItem(key)).toBe('personal-p05');
  });

  it('sanitizes invalid case progress and preserves valid entries', () => {
    const parsed = parseCaseProgress({
      version: 1,
      cases: {
        'case-c01-boundary-exit': {
          visitedStage: 'c01-strip',
          predictionSelected: 1,
          predictionCorrect: true,
          solutionRevealed: true,
          checkpointSelected: 1,
          checkpointCorrect: true,
          lastOpenedAt: '2026-11-04T00:00:00.000Z',
          parts: {
            a: { raw: '√4', unit: 'm/s', correct: true, status: 'correct', solutionRevealed: true, hintsRevealed: 1 },
            bad: { raw: 42 },
          },
        },
        bad: { visitedStage: 42 },
      },
    });
    expect(parsed.cases['case-c01-boundary-exit'].predictionCorrect).toBe(true);
    expect(parsed.cases['case-c01-boundary-exit'].parts?.a.raw).toBe('√4');
    expect(parsed.cases['case-c01-boundary-exit'].parts?.a.correct).toBe(true);
    expect(parsed.cases['case-c01-boundary-exit'].parts?.bad.raw).toBe('');
    expect(parsed.cases.bad).toBeUndefined();
    expect(parseCaseProgress({ version: 2, cases: {} }).version).toBe(1);
    saveCaseProgress(parsed);
    expect(loadCaseProgress().cases['case-c01-boundary-exit'].visitedStage).toBe('c01-strip');
  });
});
