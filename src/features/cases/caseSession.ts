export const CASE_BACKUP_STORAGE_KEY = 'emplab.case.sceneBackup.v1';
export const CASE_PROGRESS_STORAGE_KEY = 'emplab.cases.progress.v1';
export const CASE_RETURN_STORAGE_KEY = 'emplab.case.return.v1';

export const CASE_MODEL_SCENE_KEYS: Record<string, string> = {
  p01: 'emplab.p01.three.scene.v2',
  p02: 'emplab.p02.scene.v2',
  p03: 'emplab.p03.scene.v2',
  p04: 'emplab.p04.scene.v2',
  p05: 'emplab.p05.scene.v2',
  p06: 'emplab.p06.scene.v2',
  p07: 'emplab.p07.scene.v2',
  p08: 'emplab.p08.scene.v2',
  i01: 'emplab.i01.params.v1',
  i02: 'emplab.i02.params.v1',
  i03: 'emplab.i03.params.v1',
  i04: 'emplab.i04.params.v1',
  i05: 'emplab.i05.scene.v2',
  i06: 'emplab.i06.scene.v2',
  i07: 'emplab.i07.scene.v2',
  i08: 'emplab.i08.scene.v2',
};

interface SceneBackup {
  present: boolean;
  raw: string | null;
  savedAt: string;
}

interface CaseBackupState {
  version: 1;
  backups: Record<string, SceneBackup>;
}

function readBackupState(): CaseBackupState {
  if (typeof window === 'undefined') return { version: 1, backups: {} };
  try {
    const raw = window.localStorage.getItem(CASE_BACKUP_STORAGE_KEY);
    if (!raw) return { version: 1, backups: {} };
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null) return { version: 1, backups: {} };
    const candidate = parsed as { version?: unknown; backups?: unknown };
    if (candidate.version !== 1 || typeof candidate.backups !== 'object' || candidate.backups === null) {
      return { version: 1, backups: {} };
    }
    const backups: Record<string, SceneBackup> = {};
    for (const [modelId, value] of Object.entries(candidate.backups as Record<string, unknown>)) {
      if (!(modelId in CASE_MODEL_SCENE_KEYS) || typeof value !== 'object' || value === null) continue;
      const item = value as Partial<SceneBackup>;
      if (typeof item.present !== 'boolean') continue;
      if (item.present && typeof item.raw !== 'string') continue;
      backups[modelId] = {
        present: item.present,
        raw: item.present ? item.raw as string : null,
        savedAt: typeof item.savedAt === 'string' ? item.savedAt : '',
      };
    }
    return { version: 1, backups };
  } catch {
    return { version: 1, backups: {} };
  }
}

function writeBackupState(state: CaseBackupState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CASE_BACKUP_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // A case can still run without persistence; never break the simulation.
  }
}

export function backupCaseScene(modelId: string): boolean {
  if (typeof window === 'undefined') return false;
  const key = CASE_MODEL_SCENE_KEYS[modelId];
  if (!key) return false;
  const state = readBackupState();
  if (state.backups[modelId]) return false;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(key);
  } catch {
    raw = null;
  }
  state.backups[modelId] = {
    present: raw !== null,
    raw,
    savedAt: new Date().toISOString(),
  };
  writeBackupState(state);
  return true;
}

export interface CaseReturnContext {
  caseId: string;
  stageId: string;
  scrollY: number;
}

export function saveCaseReturnContext(context: CaseReturnContext): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(CASE_RETURN_STORAGE_KEY, JSON.stringify(context));
  } catch {
    // Return position is optional.
  }
}

export function readCaseReturnContext(caseId: string): CaseReturnContext | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(CASE_RETURN_STORAGE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<CaseReturnContext>;
    if (value.caseId !== caseId || typeof value.stageId !== 'string') return null;
    return {
      caseId,
      stageId: value.stageId,
      scrollY: typeof value.scrollY === 'number' && Number.isFinite(value.scrollY) ? value.scrollY : 0,
    };
  } catch {
    return null;
  }
}

export function pendingCaseBackups(): string[] {
  return Object.keys(readBackupState().backups);
}

export function restoreCaseBackups(): string[] {
  if (typeof window === 'undefined') return [];
  const state = readBackupState();
  const restored: string[] = [];
  for (const [modelId, backup] of Object.entries(state.backups)) {
    const key = CASE_MODEL_SCENE_KEYS[modelId];
    if (!key) continue;
    try {
      if (backup.present && backup.raw !== null) window.localStorage.setItem(key, backup.raw);
      else window.localStorage.removeItem(key);
      restored.push(modelId);
    } catch {
      // Ignore storage write failures; the case page must remain usable.
    }
  }
  if (restored.length > 0) writeBackupState({ version: 1, backups: {} });
  return restored;
}

export interface CasePartProgress {
  raw: string;
  unit: string;
  correct: boolean | null;
  status: string | null;
  solutionRevealed: boolean;
  hintsRevealed: number;
}

export interface CaseProgressEntry {
  visitedStage: string;
  predictionSelected: number | null;
  predictionCorrect: boolean | null;
  solutionRevealed: boolean;
  checkpointSelected: number | null;
  checkpointCorrect: boolean | null;
  lastOpenedAt: string;
  parts?: Record<string, CasePartProgress>;
}

export interface CaseProgressState {
  version: 1;
  cases: Record<string, CaseProgressEntry>;
}

const EMPTY_CASE_PROGRESS: CaseProgressState = { version: 1, cases: {} };

function sanitizeEntry(value: unknown): CaseProgressEntry | null {
  if (typeof value !== 'object' || value === null) return null;
  const item = value as Partial<CaseProgressEntry>;
  if (typeof item.visitedStage !== 'string') return null;
  const numberOrNull = (input: unknown) => (typeof input === 'number' && Number.isFinite(input) ? input : null);
  const boolOrNull = (input: unknown) => (typeof input === 'boolean' ? input : null);
  const parts: Record<string, CasePartProgress> = {};
  if (typeof item.parts === 'object' && item.parts !== null) {
    for (const [partId, rawPart] of Object.entries(item.parts as Record<string, unknown>)) {
      if (typeof rawPart !== 'object' || rawPart === null) continue;
      const part = rawPart as Partial<CasePartProgress>;
      parts[partId] = {
        raw: typeof part.raw === 'string' ? part.raw.slice(0, 128) : '',
        unit: typeof part.unit === 'string' ? part.unit.slice(0, 16) : '',
        correct: boolOrNull(part.correct),
        status: typeof part.status === 'string' ? part.status.slice(0, 32) : null,
        solutionRevealed: part.solutionRevealed === true,
        hintsRevealed: typeof part.hintsRevealed === 'number' && Number.isFinite(part.hintsRevealed) ? Math.max(0, Math.min(20, Math.floor(part.hintsRevealed))) : 0,
      };
    }
  }
  return {
    visitedStage: item.visitedStage,
    predictionSelected: numberOrNull(item.predictionSelected),
    predictionCorrect: boolOrNull(item.predictionCorrect),
    solutionRevealed: item.solutionRevealed === true,
    checkpointSelected: numberOrNull(item.checkpointSelected),
    checkpointCorrect: boolOrNull(item.checkpointCorrect),
    lastOpenedAt: typeof item.lastOpenedAt === 'string' ? item.lastOpenedAt : '',
    parts,
  };
}

export function parseCaseProgress(raw: unknown): CaseProgressState {
  if (typeof raw !== 'object' || raw === null) return EMPTY_CASE_PROGRESS;
  const candidate = raw as { version?: unknown; cases?: unknown };
  if (candidate.version !== 1 || typeof candidate.cases !== 'object' || candidate.cases === null) {
    return EMPTY_CASE_PROGRESS;
  }
  const cases: Record<string, CaseProgressEntry> = {};
  for (const [id, value] of Object.entries(candidate.cases as Record<string, unknown>)) {
    const entry = sanitizeEntry(value);
    if (entry) cases[id] = entry;
  }
  return { version: 1, cases };
}

export function loadCaseProgress(): CaseProgressState {
  if (typeof window === 'undefined') return EMPTY_CASE_PROGRESS;
  try {
    const raw = window.localStorage.getItem(CASE_PROGRESS_STORAGE_KEY);
    return raw ? parseCaseProgress(JSON.parse(raw)) : EMPTY_CASE_PROGRESS;
  } catch {
    return EMPTY_CASE_PROGRESS;
  }
}

export function saveCaseProgress(state: CaseProgressState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CASE_PROGRESS_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // In-memory progress still works for the current page.
  }
}
