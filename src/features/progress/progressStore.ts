import { useSyncExternalStore } from 'react';
import { isRecord } from '../../hooks/usePersistentState';
import type { UserAnswer } from '../../content/schema';

export const PROGRESS_STORAGE_KEY = 'emplab.progress.v1';

export interface QuestionRecord {
  favorite: boolean;
  attempts: number;
  correctCount: number;
  lastCorrect: boolean | null;
  lastAnswer: UserAnswer | null;
  hintsUsed: number;
  updatedAt: string | null;
}

export interface ProgressState {
  version: 1;
  questions: Record<string, QuestionRecord>;
}

const EMPTY_STATE: ProgressState = { version: 1, questions: {} };

function emptyRecord(): QuestionRecord {
  return {
    favorite: false,
    attempts: 0,
    correctCount: 0,
    lastCorrect: null,
    lastAnswer: null,
    hintsUsed: 0,
    updatedAt: null,
  };
}

function isAnswer(value: unknown): value is UserAnswer {
  if (!isRecord(value)) return false;
  if (value.kind === 'single') {
    return value.value === null || (typeof value.value === 'number' && Number.isFinite(value.value));
  }
  if (value.kind === 'multiple') {
    return (
      Array.isArray(value.value) &&
      value.value.length <= 20 &&
      value.value.every((v) => typeof v === 'number' && Number.isFinite(v))
    );
  }
  if (value.kind === 'numeric') return typeof value.value === 'string' && value.value.length <= 500;
  return false;
}

function sanitizeRecord(value: unknown): QuestionRecord | null {
  if (!isRecord(value)) return null;
  return {
    favorite: value.favorite === true,
    attempts: typeof value.attempts === 'number' && value.attempts >= 0 ? Math.floor(value.attempts) : 0,
    correctCount:
      typeof value.correctCount === 'number' && value.correctCount >= 0 ? Math.floor(value.correctCount) : 0,
    lastCorrect: typeof value.lastCorrect === 'boolean' ? value.lastCorrect : null,
    lastAnswer: isAnswer(value.lastAnswer) ? value.lastAnswer : null,
    hintsUsed: typeof value.hintsUsed === 'number' && value.hintsUsed >= 0 ? Math.floor(value.hintsUsed) : 0,
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : null,
  };
}

function sanitizeState(value: unknown): ProgressState | null {
  if (!isRecord(value)) return null;
  if (value.version !== 1 || !isRecord(value.questions)) return null;
  const entries = Object.entries(value.questions).slice(0, 2000);
  const questions: Record<string, QuestionRecord> = {};
  for (const [id, record] of entries) {
    if (!id || id.length > 120) continue;
    const sanitized = sanitizeRecord(record);
    if (sanitized) questions[id] = sanitized;
  }
  return { version: 1, questions };
}

function loadState(): ProgressState {
  if (typeof window === 'undefined') return EMPTY_STATE;
  try {
    const raw = window.localStorage.getItem(PROGRESS_STORAGE_KEY);
    if (!raw) return EMPTY_STATE;
    return sanitizeState(JSON.parse(raw)) ?? EMPTY_STATE;
  } catch {
    return EMPTY_STATE;
  }
}

let state: ProgressState = loadState();
const listeners = new Set<() => void>();

function persist(next: ProgressState) {
  state = next;
  try {
    window.localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Local storage can be unavailable; the in-memory session still works.
  }
  listeners.forEach((listener) => listener());
}

function updateQuestion(id: string, updater: (record: QuestionRecord) => QuestionRecord) {
  const previous = state.questions[id] ?? emptyRecord();
  const nextRecord = updater(previous);
  persist({
    version: 1,
    questions: { ...state.questions, [id]: nextRecord },
  });
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== PROGRESS_STORAGE_KEY) return;
    const next = loadState();
    state = next;
    listeners.forEach((listener) => listener());
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return state;
}

export function useProgress(): ProgressState {
  return useSyncExternalStore(subscribe, getSnapshot, () => EMPTY_STATE);
}

export function getQuestionRecord(id: string): QuestionRecord {
  return state.questions[id] ?? emptyRecord();
}

export function saveDraft(id: string, answer: UserAnswer, hintsUsed = 0) {
  updateQuestion(id, (record) => ({
    ...record,
    lastAnswer: answer,
    hintsUsed: Math.max(record.hintsUsed, hintsUsed),
  }));
}

export function recordAttempt(
  id: string,
  answer: UserAnswer,
  correct: boolean,
  hintsUsed: number,
) {
  updateQuestion(id, (record) => ({
    ...record,
    attempts: record.attempts + 1,
    correctCount: record.correctCount + (correct ? 1 : 0),
    lastCorrect: correct,
    lastAnswer: answer,
    hintsUsed: Math.max(record.hintsUsed, hintsUsed),
    updatedAt: new Date().toISOString(),
  }));
}

export function toggleFavorite(id: string) {
  updateQuestion(id, (record) => ({ ...record, favorite: !record.favorite }));
}

export function clearAllProgress() {
  persist({ version: 1, questions: {} });
}

export function exportProgressJson(): string {
  return JSON.stringify(
    {
      app: 'EM Physics Lab',
      exportedAt: new Date().toISOString(),
      note: '仅包含本机练习记录，不包含姓名、账号或设备标识。',
      progress: state,
    },
    null,
    2,
  );
}

export function importProgressJson(text: string): { ok: boolean; message: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, message: '文件不是有效的 JSON。' };
  }
  if (!isRecord(parsed)) return { ok: false, message: '文件结构不正确。' };
  const candidate = isRecord(parsed.progress) ? parsed.progress : parsed;
  const sanitized = sanitizeState(candidate);
  if (!sanitized) return { ok: false, message: '没有找到可识别的记录格式（version 1）。' };
  persist(sanitized);
  return { ok: true, message: `已导入 ${Object.keys(sanitized.questions).length} 条题目记录。` };
}

export function progressSummary(progress: ProgressState) {
  const records = Object.values(progress.questions);
  const attempted = records.filter((record) => record.attempts > 0);
  const solved = attempted.filter((record) => record.lastCorrect === true);
  const wrong = attempted.filter((record) => record.lastCorrect === false);
  const favorites = records.filter((record) => record.favorite);
  const totalAttempts = records.reduce((sum, record) => sum + record.attempts, 0);
  return {
    attempted: attempted.length,
    solved: solved.length,
    wrong: wrong.length,
    favorites: favorites.length,
    totalAttempts,
    accuracy: totalAttempts > 0
      ? records.reduce((sum, record) => sum + record.correctCount, 0) / totalAttempts
      : 0,
  };
}
