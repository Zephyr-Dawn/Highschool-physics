import { describe, expect, it } from 'vitest';
import katex from 'katex';
import { QUESTIONS, questionsForModel, ALL_TAGS } from '../../src/content/questions';
import { EXAM_REFERENCES } from '../../src/content/examReferences';
import {
  checkAnswer,
  emptyAnswer,
  formatAnswer,
  isAnswerComplete,
  type Question,
} from '../../src/content/schema';
import { P02_LESSON, P03_LESSON, P04_LESSON, P05_LESSON, P06_LESSON, P07_LESSON, P01_FORCE_LESSON, P01_MOTION_LESSON, P01_MOTION3D_LESSON, I01_LESSON, I02_LESSON, I03_LESSON, I04_LESSON, I05_LESSON, I06_LESSON, I07_LESSON, P08_LESSON, I08_LESSON } from '../../src/content/lessons';
import { P02_PRESETS } from '../../src/simulations/particle/params';
import { P02_MULTI_PRESETS } from '../../src/simulations/particle/p02Scene';
import { P03_PRESETS } from '../../src/simulations/particle/halfPlaneParams';
import { P03_MULTI_PRESETS } from '../../src/simulations/particle/p03Scene';
import { P01_FORCE_PRESETS } from '../../src/simulations/particle/p01ForceScene';
import { P01_PLANAR_PRESETS } from '../../src/simulations/particle/p01PlanarScene';
import { P01_THREE_PRESETS } from '../../src/simulations/particle/p01ThreeDScene';
import { I01_PRESETS } from '../../src/simulations/induction/fluxLenzParams';
import { I03_PRESETS } from '../../src/simulations/induction/params';
import { I02_PRESETS } from '../../src/simulations/induction/movingRodParams';
import { I04_PRESETS } from '../../src/simulations/induction/timeVaryingParams';
import { P06_PRESETS } from '../../src/simulations/particle/p06Scene';
import { P07_PRESETS } from '../../src/simulations/particle/p07Scene';
import { P04_PRESETS } from '../../src/simulations/particle/p04Scene';
import { P05_PRESETS } from '../../src/simulations/particle/p05Scene';
import { I05_PRESETS } from '../../src/simulations/induction/i05Scene';
import { I06_PRESETS } from '../../src/simulations/induction/i06Scene';
import { I07_PRESETS } from '../../src/simulations/induction/i07Scene';
import { P08_PRESETS } from '../../src/simulations/particle/p08Scene';
import { I08_PRESETS } from '../../src/simulations/induction/i08Scene';
import { QUESTION_STATS } from '../../src/content/questionStats';

const PRESETS_BY_MODEL = {
  p01: { ...P01_FORCE_PRESETS, ...P01_PLANAR_PRESETS, ...P01_THREE_PRESETS },
  p02: { ...P02_PRESETS, ...P02_MULTI_PRESETS },
  p03: { ...P03_PRESETS, ...P03_MULTI_PRESETS },
  p04: P04_PRESETS,
  p05: P05_PRESETS,
  p06: P06_PRESETS,
  p07: P07_PRESETS,
  i01: I01_PRESETS,
  i02: I02_PRESETS,
  i03: I03_PRESETS,
  i04: I04_PRESETS,
  i05: I05_PRESETS,
  i06: I06_PRESETS,
  i07: I07_PRESETS,
  p08: P08_PRESETS,
  i08: I08_PRESETS,
} as const;

describe('content integrity', () => {
  it('ships 132 verified original questions across all sixteen models', () => {
    expect(QUESTIONS).toHaveLength(132);
    expect(questionsForModel('p01')).toHaveLength(14);
    expect(questionsForModel('p02')).toHaveLength(8);
    expect(questionsForModel('p03')).toHaveLength(8);
    expect(questionsForModel('p04')).toHaveLength(8);
    expect(questionsForModel('p05')).toHaveLength(8);
    expect(questionsForModel('p06')).toHaveLength(8);
    expect(questionsForModel('p07')).toHaveLength(8);
    expect(questionsForModel('i01')).toHaveLength(8);
    expect(questionsForModel('i02')).toHaveLength(8);
    expect(questionsForModel('i03')).toHaveLength(6);
    expect(questionsForModel('i04')).toHaveLength(8);
    expect(questionsForModel('i05')).toHaveLength(8);
    expect(questionsForModel('i06')).toHaveLength(8);
    expect(questionsForModel('i07')).toHaveLength(8);
    expect(questionsForModel('p08')).toHaveLength(8);
    expect(questionsForModel('i08')).toHaveLength(8);
    for (const question of QUESTIONS) {
      expect(question.sourceStatus).toBe('original');
      expect(question.verified).toBe(true);
      expect(question.licenseNote).toBeTruthy();
      expect(question.hints.length).toBeGreaterThanOrEqual(3);
      expect(question.solution.length).toBeGreaterThanOrEqual(2);
      expect(question.stem.length).toBeGreaterThan(20);
    }
    expect(new Set(QUESTIONS.map((q) => q.id)).size).toBe(QUESTIONS.length);
    expect(ALL_TAGS.length).toBeGreaterThan(5);
    expect(QUESTION_STATS.total).toBe(QUESTIONS.length);
    for (const modelId of ['p01', 'p02', 'p03', 'p04', 'p05', 'p06', 'p07', 'i01', 'i02', 'i03', 'i04', 'i05', 'i06', 'i07', 'p08', 'i08'] as const) {
      expect(QUESTION_STATS.byModel[modelId]).toBe(questionsForModel(modelId).length);
    }
  });

  it('links every question preset to an existing experiment preset', () => {
    for (const question of QUESTIONS) {
      expect(question.modelId).toBeDefined();
      expect(question.presetId).toBeDefined();
      const presets = PRESETS_BY_MODEL[question.modelId!];
      expect(presets[question.presetId!], `${question.id} → ${question.presetId}`).toBeDefined();
    }
  });

  it('keeps all exam references as unverified external indices with no reproduced stem or answer', () => {
    expect(EXAM_REFERENCES).toHaveLength(5);
    for (const exam of EXAM_REFERENCES) {
      expect(exam.verifiedOnline).toBe(false);
      expect(exam.sourceUrl.startsWith('https://')).toBe(true);
      expect(exam.sourceNote.length).toBeGreaterThan(20);
      expect('stem' in exam).toBe(false);
      expect('answer' in exam).toBe(false);
      if (exam.relatedModelId) {
        const presets = PRESETS_BY_MODEL[exam.relatedModelId];
        if (exam.relatedPresetId) expect(presets[exam.relatedPresetId]).toBeDefined();
      }
    }
  });

  it('renders every lesson and solution formula in KaTeX without errors or control characters', () => {
    const formulas: string[] = [];
    for (const question of QUESTIONS) {
      for (const step of question.solution) {
        if (step.formula) formulas.push(step.formula);
      }
    }
    for (const lesson of [P02_LESSON, P03_LESSON, P04_LESSON, P05_LESSON, P06_LESSON, P07_LESSON, P01_FORCE_LESSON, P01_MOTION_LESSON, P01_MOTION3D_LESSON, I01_LESSON, I02_LESSON, I03_LESSON, I04_LESSON, I05_LESSON, I06_LESSON, I07_LESSON, P08_LESSON, I08_LESSON]) {
      for (const step of lesson) {
        if ('formula' in step && step.formula) formulas.push(step.formula);
      }
    }
    expect(formulas.length).toBeGreaterThan(20);
    for (const formula of formulas) {
      expect(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(formula), formula).toBe(false);
      const html = katex.renderToString(formula, {
        throwOnError: false,
        strict: 'ignore',
        displayMode: true,
      });
      expect(html).not.toContain('katex-error');
    }
  });

  it('every guided lesson prediction has a valid option answer and every task preset exists', () => {
    for (const [lesson, presets] of [
      [P02_LESSON, P02_PRESETS],
      [P03_LESSON, P03_PRESETS],
      [P04_LESSON, P04_PRESETS],
      [P05_LESSON, P05_PRESETS],
      [P06_LESSON, P06_PRESETS],
      [P07_LESSON, P07_PRESETS],
      [P01_FORCE_LESSON, P01_FORCE_PRESETS],
      [P01_MOTION_LESSON, P01_PLANAR_PRESETS],
      [P01_MOTION3D_LESSON, P01_THREE_PRESETS],
      [I03_LESSON, I03_PRESETS],
      [I04_LESSON, I04_PRESETS],
    ] as Array<[typeof P02_LESSON, Record<string, unknown>]>) {
      expect(lesson.length).toBeGreaterThanOrEqual(5);
      expect(lesson.filter((step) => step.kind === 'predict').length).toBeGreaterThanOrEqual(2);
      for (const step of lesson) {
        if (step.kind === 'predict') {
          expect(step.options.length).toBeGreaterThanOrEqual(2);
          expect(step.correct).toBeGreaterThanOrEqual(0);
          expect(step.correct).toBeLessThan(step.options.length);
          expect(step.hint.length).toBeGreaterThan(5);
          expect(step.explain.length).toBeGreaterThan(5);
        }
        if (step.kind === 'task' && step.presetId) {
          expect(presets[step.presetId]).toBeDefined();
        }
      }
    }
  });
});

describe('answer checking', () => {
  const single = QUESTIONS.find((q) => q.type === 'single')!;
  const multiple = QUESTIONS.find((q) => q.type === 'multiple')!;
  const numeric = QUESTIONS.find((q) => q.type === 'numeric')!;

  it('grades single choice, rejects an empty answer and formats the key', () => {
    expect(single.type).toBe('single');
    const empty = emptyAnswer(single);
    expect(isAnswerComplete(single, empty)).toBe(false);
    if (single.type !== 'single') return;
    expect(checkAnswer(single, { kind: 'single', value: single.answer })).toBe(true);
    expect(checkAnswer(single, { kind: 'single', value: (single.answer + 1) % single.options.length })).toBe(false);
    expect(formatAnswer(single)).toContain(single.options[single.answer]);
  });

  it('grades multi-select order-insensitively', () => {
    if (multiple.type !== 'multiple') return;
    const reversed = [...multiple.answer].reverse();
    expect(checkAnswer(multiple, { kind: 'multiple', value: reversed })).toBe(true);
    expect(checkAnswer(multiple, { kind: 'multiple', value: multiple.answer.slice(0, -1) })).toBe(false);
  });

  it('uses the declared numeric tolerance, including boundaries', () => {
    if (numeric.type !== 'numeric') return;
    const { value, tolerance } = numeric.answer;
    expect(checkAnswer(numeric, { kind: 'numeric', value: String(value) })).toBe(true);
    expect(checkAnswer(numeric, { kind: 'numeric', value: String(value + tolerance) })).toBe(true);
    expect(checkAnswer(numeric, { kind: 'numeric', value: String(value - tolerance) })).toBe(true);
    expect(checkAnswer(numeric, { kind: 'numeric', value: String(value + tolerance * 1.5) })).toBe(false);
    expect(checkAnswer(numeric, { kind: 'numeric', value: '' })).toBe(false);
    expect(isAnswerComplete(numeric, { kind: 'numeric', value: 'abc' })).toBe(false);
  });

  it('keeps the known answer keys for the anchor questions including P03', () => {
    const force = QUESTIONS.find((q) => q.id === 'p02-01') as Question;
    const emf = QUESTIONS.find((q) => q.id === 'i03-02') as Question;
    const exitDistance = QUESTIONS.find((q) => q.id === 'p03-03') as Question;
    const inducedEmf = QUESTIONS.find((q) => q.id === 'i04-02') as Question;
    expect(force.type).toBe('single');
    expect(force.type === 'single' && force.options[force.answer]).toBe('竖直向下');
    expect(emf.type).toBe('numeric');
    expect(emf.type === 'numeric' && emf.answer.value).toBe(0.4);
    expect(exitDistance.type).toBe('numeric');
    expect(exitDistance.type === 'numeric' && exitDistance.answer.value).toBe(8);
    expect(inducedEmf.type).toBe('numeric');
    expect(inducedEmf.type === 'numeric' && inducedEmf.answer.value).toBe(0.1);
  });
});
