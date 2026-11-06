import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearAllProgress,
  exportProgressJson,
  getQuestionRecord,
  importProgressJson,
  PROGRESS_STORAGE_KEY,
  progressSummary,
  recordAttempt,
  saveDraft,
  toggleFavorite,
} from '../../src/features/progress/progressStore';

describe('local progress store', () => {
  beforeEach(() => {
    clearAllProgress();
    window.localStorage.clear();
  });

  it('persists drafts without counting them as attempts', () => {
    saveDraft('p02-01', { kind: 'single', value: 1 }, 2);
    const record = getQuestionRecord('p02-01');
    expect(record.attempts).toBe(0);
    expect(record.lastAnswer).toEqual({ kind: 'single', value: 1 });
    expect(record.hintsUsed).toBe(2);
    const raw = JSON.parse(window.localStorage.getItem(PROGRESS_STORAGE_KEY) ?? '{}');
    expect(raw.version).toBe(1);
    expect(raw.questions['p02-01'].lastAnswer.value).toBe(1);
  });

  it('records attempts, correctness and favorites, and summarizes them', () => {
    recordAttempt('p02-01', { kind: 'single', value: 1 }, false, 1);
    recordAttempt('p02-01', { kind: 'single', value: 1 }, true, 1);
    recordAttempt('i03-02', { kind: 'numeric', value: '0.4' }, true, 0);
    toggleFavorite('i03-02');
    const record = getQuestionRecord('p02-01');
    expect(record.attempts).toBe(2);
    expect(record.correctCount).toBe(1);
    expect(record.lastCorrect).toBe(true);
    expect(getQuestionRecord('i03-02').favorite).toBe(true);
    const raw = JSON.parse(window.localStorage.getItem(PROGRESS_STORAGE_KEY) ?? '{}');
    const summary = progressSummary(raw);
    expect(summary.attempted).toBe(2);
    expect(summary.solved).toBe(2);
    expect(summary.totalAttempts).toBe(3);
    expect(summary.accuracy).toBeCloseTo(2 / 3, 6);
    expect(summary.favorites).toBe(1);
  });

  it('exports a privacy-scoped JSON and imports a sanitized copy', () => {
    recordAttempt('p02-01', { kind: 'single', value: 1 }, true, 1);
    const exported = exportProgressJson();
    expect(exported).toContain('EM Physics Lab');
    expect(exported).toContain('不包含姓名');
    const parsed = JSON.parse(exported);
    parsed.progress.questions['p02-01'].attempts = 99;
    parsed.progress.questions['xss'] = {
      favorite: true,
      attempts: 2,
      correctCount: 1,
      lastCorrect: true,
      lastAnswer: { kind: 'numeric', value: '<script>alert(1)</script>' },
      hintsUsed: 1,
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const result = importProgressJson(JSON.stringify(parsed));
    expect(result.ok).toBe(true);
    expect(getQuestionRecord('p02-01').attempts).toBe(99);
    expect(getQuestionRecord('xss').lastAnswer).toEqual({
      kind: 'numeric',
      value: '<script>alert(1)</script>',
    });
    // Text is stored as data only and never treated as HTML by the UI.
  });

  it('rejects malformed files and accepts a bare progress object', () => {
    expect(importProgressJson('not-json').ok).toBe(false);
    expect(importProgressJson(JSON.stringify({ hello: 1 })).ok).toBe(false);
    const result = importProgressJson(
      JSON.stringify({ version: 1, questions: { 'i03-01': { favorite: true } } }),
    );
    expect(result.ok).toBe(true);
    expect(getQuestionRecord('i03-01').favorite).toBe(true);
    expect(getQuestionRecord('i03-01').attempts).toBe(0);
  });

  it('clears everything', () => {
    recordAttempt('p02-01', { kind: 'single', value: 1 }, true, 0);
    clearAllProgress();
    expect(getQuestionRecord('p02-01').attempts).toBe(0);
    const raw = JSON.parse(window.localStorage.getItem(PROGRESS_STORAGE_KEY) ?? '{}');
    expect(raw.questions).toEqual({});
  });
});
