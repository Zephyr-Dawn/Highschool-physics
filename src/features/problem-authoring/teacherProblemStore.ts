import {
  MAX_TEACHER_DRAFT_BYTES,
  MAX_TEACHER_JSON_DEPTH,
  MAX_TEACHER_PACKAGE_BYTES,
  TEACHER_PACKAGE_FORMAT,
  TEACHER_PROBLEM_STORAGE_KEY,
  cloneTeacherDraft,
  teacherPackageSchema,
  teacherProblemDraftSchema,
  type TeacherPackage,
  type TeacherProblemDraft,
} from './teacherProblemSchema';
import { z } from 'zod';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const teacherStoreStateSchema = z
  .object({
    version: z.literal(1),
    drafts: z.array(teacherProblemDraftSchema).max(80),
  })
  .strict()
  .superRefine((value, ctx) => {
    const ids = new Set<string>();
    for (const draft of value.drafts) {
      if (ids.has(draft.id)) ctx.addIssue({ code: 'custom', message: `存档中存在重复草稿 ID：${draft.id}` });
      ids.add(draft.id);
    }
  });

export interface TeacherStoreState {
  version: 1;
  drafts: TeacherProblemDraft[];
}

export interface LoadTeacherDraftsResult {
  state: TeacherStoreState;
  error: string | null;
  available: boolean;
}

export type ImportTeacherPackageResult =
  | { ok: true; draft: TeacherProblemDraft; warning: string | null }
  | { ok: false; error: string };

function resolveStorage(storage?: StorageLike | null): StorageLike | null {
  if (storage !== undefined) return storage;
  try {
    return typeof globalThis.localStorage === 'undefined' ? null : globalThis.localStorage;
  } catch {
    return null;
  }
}

function emptyState(): TeacherStoreState {
  return { version: 1, drafts: [] };
}

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

function inspectJsonValue(value: unknown, depth = 0, seen = new Set<object>()): string | null {
  if (depth > MAX_TEACHER_JSON_DEPTH) return '题包嵌套过深。';
  if (value === null || typeof value !== 'object') return null;
  if (seen.has(value as object)) return '题包包含循环结构。';
  seen.add(value as object);
  if (Array.isArray(value)) {
    for (const item of value) {
      const issue = inspectJsonValue(item, depth + 1, seen);
      if (issue) return issue;
    }
    seen.delete(value as object);
    return null;
  }
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (key === '__proto__' || key === 'prototype' || key === 'constructor') {
      return `题包含有禁止的对象键：${key}`;
    }
    const issue = inspectJsonValue(item, depth + 1, seen);
    if (issue) return issue;
  }
  seen.delete(value as object);
  return null;
}

export function loadTeacherDrafts(storage?: StorageLike | null): LoadTeacherDraftsResult {
  const target = resolveStorage(storage);
  if (!target) {
    return { state: emptyState(), error: '当前浏览器不允许访问本地存储；教师草稿只能临时编辑，无法保存。', available: false };
  }
  let raw: string | null = null;
  try {
    raw = target.getItem(TEACHER_PROBLEM_STORAGE_KEY);
  } catch {
    return { state: emptyState(), error: '读取本机教师草稿失败；原始存储未被修改。', available: false };
  }
  if (!raw) return { state: emptyState(), error: null, available: true };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { state: emptyState(), error: '本机教师草稿存档不是合法 JSON；已停止解析，原始数据未被覆盖。', available: true };
  }
  const result = teacherStoreStateSchema.safeParse(parsed);
  if (!result.success) {
    return { state: emptyState(), error: '本机教师草稿存档结构损坏或版本不兼容；原始数据未被覆盖。', available: true };
  }
  return { state: result.data, error: null, available: true };
}

export function saveTeacherDrafts(
  state: TeacherStoreState,
  storage?: StorageLike | null,
): { ok: true } | { ok: false; error: string } {
  const target = resolveStorage(storage);
  if (!target) return { ok: false, error: '当前浏览器不允许访问本地存储，草稿未保存。' };
  const parsed = teacherStoreStateSchema.safeParse(state);
  if (!parsed.success) return { ok: false, error: '草稿状态未通过安全校验，未写入本机存储。' };
  const text = JSON.stringify(parsed.data);
  if (byteLength(text) > MAX_TEACHER_PACKAGE_BYTES) {
    return { ok: false, error: '教师草稿总量超过本机安全上限，未写入存储。' };
  }
  try {
    target.setItem(TEACHER_PROBLEM_STORAGE_KEY, text);
    return { ok: true };
  } catch {
    return { ok: false, error: '浏览器拒绝写入本地存储（可能空间已满或处于隐私模式）；原存档未被清除。' };
  }
}

export function upsertTeacherDraft(
  draft: TeacherProblemDraft,
  storage?: StorageLike | null,
): { ok: true; state: TeacherStoreState } | { ok: false; error: string } {
  const parsed = teacherProblemDraftSchema.safeParse(draft);
  if (!parsed.success) return { ok: false, error: '草稿未通过安全校验，未保存。' };
  const text = JSON.stringify(parsed.data);
  if (byteLength(text) > MAX_TEACHER_DRAFT_BYTES) {
    return { ok: false, error: '单个教师草稿超过 256 KiB 安全上限，未保存。' };
  }
  const loaded = loadTeacherDrafts(storage);
  if (loaded.error) return { ok: false, error: `${loaded.error} 未写入任何内容。` };
  const drafts = loaded.state.drafts.filter((item) => item.id !== parsed.data.id);
  const next: TeacherStoreState = { version: 1, drafts: [...drafts, parsed.data] };
  const saved = saveTeacherDrafts(next, storage);
  if (!saved.ok) return saved;
  return { ok: true, state: next };
}

export function deleteTeacherDraft(
  draftId: string,
  storage?: StorageLike | null,
): { ok: true; state: TeacherStoreState } | { ok: false; error: string } {
  const loaded = loadTeacherDrafts(storage);
  if (loaded.error) return { ok: false, error: loaded.error };
  const next: TeacherStoreState = {
    version: 1,
    drafts: loaded.state.drafts.filter((draft) => draft.id !== draftId),
  };
  const saved = saveTeacherDrafts(next, storage);
  if (!saved.ok) return saved;
  return { ok: true, state: next };
}

export function duplicateTeacherDraft(
  draftId: string,
  storage?: StorageLike | null,
): { ok: true; state: TeacherStoreState; draft: TeacherProblemDraft } | { ok: false; error: string } {
  const loaded = loadTeacherDrafts(storage);
  if (loaded.error) return { ok: false, error: loaded.error };
  const source = loaded.state.drafts.find((draft) => draft.id === draftId);
  if (!source) return { ok: false, error: '找不到要复制的教师草稿。' };
  const copy = cloneTeacherDraft(source);
  const saved = upsertTeacherDraft(copy, storage);
  if (!saved.ok) return saved;
  return { ok: true, state: saved.state, draft: copy };
}

function packageText(draft: TeacherProblemDraft, exportedAt: string): string {
  const payload: TeacherPackage = {
    format: TEACHER_PACKAGE_FORMAT,
    schemaVersion: 1,
    exportedAt,
    draft,
  };
  return JSON.stringify(payload, null, 2);
}

export function exportTeacherProblemPackage(draft: TeacherProblemDraft, exportedAt = new Date().toISOString()): string {
  const parsed = teacherProblemDraftSchema.safeParse(draft);
  if (!parsed.success) throw new Error('草稿未通过安全校验，不能导出。');
  return packageText(parsed.data, exportedAt);
}

export function teacherPackageFilename(draft: TeacherProblemDraft): string {
  const safeTitle = draft.title.replace(/[\\/:*?"<>|\s]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'teacher-problem';
  return `${safeTitle}-${draft.id}.json`;
}

export function importTeacherProblemPackage(
  text: string,
  options: { existingIds?: Iterable<string>; now?: string } = {},
): ImportTeacherPackageResult {
  if (typeof text !== 'string') return { ok: false, error: '导入内容必须是文本。' };
  if (byteLength(text) > MAX_TEACHER_PACKAGE_BYTES) {
    return { ok: false, error: '题包超过 512 KiB 安全上限，已拒绝。' };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: '题包不是合法 JSON，已拒绝；本机存档未改变。' };
  }
  const structureIssue = inspectJsonValue(parsed);
  if (structureIssue) return { ok: false, error: `${structureIssue} 已拒绝；本机存档未改变。` };
  const packageResult = teacherPackageSchema.safeParse(parsed);
  if (!packageResult.success) {
    const first = packageResult.error.issues[0];
    return {
      ok: false,
      error: `题包结构或字段不合法：${first?.path.join('.') || 'root'} ${first?.message || ''}`.trim(),
    };
  }
  const existing = new Set(options.existingIds ?? []);
  const imported = packageResult.data.draft;
  const now = options.now ?? new Date().toISOString();
  let draft: TeacherProblemDraft = { ...imported, updatedAt: now };
  let warning: string | null = null;
  if (existing.has(imported.id)) {
    draft = { ...imported, id: cloneTeacherDraft(imported).id, updatedAt: now };
    warning = '题包 ID 与本机已有草稿冲突，已自动分配新 ID；物理绑定与内容保持不变。';
  }
  const draftBytes = byteLength(JSON.stringify(draft));
  if (draftBytes > MAX_TEACHER_DRAFT_BYTES) {
    return { ok: false, error: '题包内单个草稿超过 256 KiB 安全上限，已拒绝。' };
  }
  return { ok: true, draft, warning };
}

export function importIntoStore(
  text: string,
  storage?: StorageLike | null,
): { ok: true; state: TeacherStoreState; draft: TeacherProblemDraft; warning: string | null } | { ok: false; error: string } {
  const loaded = loadTeacherDrafts(storage);
  if (loaded.error) return { ok: false, error: `${loaded.error} 未导入任何内容。` };
  const imported = importTeacherProblemPackage(text, {
    existingIds: loaded.state.drafts.map((draft) => draft.id),
  });
  if (!imported.ok) return imported;
  const saved = upsertTeacherDraft(imported.draft, storage);
  if (!saved.ok) return saved;
  return { ok: true, state: saved.state, draft: imported.draft, warning: imported.warning };
}
