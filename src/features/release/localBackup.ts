import { APP_VERSION } from '../../lib/appInfo';

export const LOCAL_BACKUP_FORMAT = 'emplab.local-backup';
export const LOCAL_BACKUP_SCHEMA_VERSION = 1;
export const MAX_LOCAL_BACKUP_BYTES = 4 * 1024 * 1024;
export const MAX_LOCAL_BACKUP_ENTRIES = 1000;
export const MAX_LOCAL_BACKUP_VALUE_BYTES = 1024 * 1024;

const EXCLUDED_KEYS = new Set([
  'emplab.case.return.v1',
  'emplab.case.sceneBackup.v1',
  'emplab.teacher.editorReturn.v1',
]);

const KEY_PATTERN = /^emplab\.[A-Za-z0-9_.-]{1,120}$/;

export interface BackupStorage {
  length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface LocalBackupSummary {
  entries: number;
  totalBytes: number;
  teacherDrafts: number;
  questionRecords: number;
  caseRecords: number;
  scenes: number;
  lessonRecords: number;
  deviceRecords: number;
}

export interface LocalBackupPackage {
  format: typeof LOCAL_BACKUP_FORMAT;
  schemaVersion: typeof LOCAL_BACKUP_SCHEMA_VERSION;
  appVersion: string;
  exportedAt: string;
  summary: LocalBackupSummary;
  entries: Record<string, string>;
}

export interface BackupParseResult {
  ok: boolean;
  error: string | null;
  package: LocalBackupPackage | null;
  summary: LocalBackupSummary | null;
  conflicts: number;
}

export interface BackupApplyResult {
  ok: boolean;
  error: string | null;
  written: number;
}

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isForbiddenKey(key: string): boolean {
  return key === '__proto__' || key === 'prototype' || key === 'constructor';
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function countTeacherDrafts(text: string | undefined): number {
  if (!text) return 0;
  const parsed = safeJson(text);
  if (!isPlainRecord(parsed) || !Array.isArray(parsed.drafts)) return 0;
  return parsed.drafts.length;
}

function countRecords(text: string | undefined, key: string): number {
  if (!text) return 0;
  const parsed = safeJson(text);
  if (!isPlainRecord(parsed) || !isPlainRecord(parsed[key])) return 0;
  return Object.keys(parsed[key] as Record<string, unknown>).length;
}

function summarize(entries: Record<string, string>): LocalBackupSummary {
  let totalBytes = 0;
  let scenes = 0;
  let lessonRecords = 0;
  let deviceRecords = 0;
  for (const [key, value] of Object.entries(entries)) {
    totalBytes += byteLength(key) + byteLength(value);
    if (key.endsWith('.scene.v2') || key.endsWith('.scene.v1')) scenes += 1;
    if (key.includes('.lesson.') || key.includes('.learning.') || key.endsWith('.mode.v1')) lessonRecords += 1;
    if (key.startsWith('emplab.deviceCheck.')) deviceRecords += 1;
  }
  return {
    entries: Object.keys(entries).length,
    totalBytes,
    teacherDrafts: countTeacherDrafts(entries['emplab.teacher-problems.v1']),
    questionRecords: countRecords(entries['emplab.progress.v1'], 'questions'),
    caseRecords: countRecords(entries['emplab.cases.progress.v1'], 'cases'),
    scenes,
    lessonRecords,
    deviceRecords,
  };
}

function resolveStorage(storage?: BackupStorage | null): BackupStorage | null {
  if (storage !== undefined) return storage;
  try {
    return typeof globalThis.localStorage === 'undefined' ? null : globalThis.localStorage as BackupStorage;
  } catch {
    return null;
  }
}

export function collectLocalBackup(storage?: BackupStorage | null): { ok: true; package: LocalBackupPackage } | { ok: false; error: string } {
  const target = resolveStorage(storage);
  if (!target) return { ok: false, error: '当前浏览器不允许访问本地存储，无法导出备份。' };
  const entries: Record<string, string> = {};
  for (let index = 0; index < target.length; index += 1) {
    const key = target.key(index);
    if (!key || isForbiddenKey(key) || !KEY_PATTERN.test(key) || EXCLUDED_KEYS.has(key)) continue;
    const value = target.getItem(key);
    if (value === null) continue;
    if (byteLength(value) > MAX_LOCAL_BACKUP_VALUE_BYTES) {
      return { ok: false, error: `键 ${key} 超过单条 1 MiB 上限；请先在应用内清理或导出对应数据。` };
    }
    entries[key] = value;
  }
  const summary = summarize(entries);
  if (summary.entries > MAX_LOCAL_BACKUP_ENTRIES) {
    return { ok: false, error: `本地数据条目超过 ${MAX_LOCAL_BACKUP_ENTRIES} 上限。` };
  }
  if (summary.totalBytes > MAX_LOCAL_BACKUP_BYTES) {
    return { ok: false, error: '本地数据超过 4 MiB 备份上限。' };
  }
  const backup: LocalBackupPackage = {
    format: LOCAL_BACKUP_FORMAT,
    schemaVersion: LOCAL_BACKUP_SCHEMA_VERSION,
    appVersion: APP_VERSION,
    exportedAt: new Date().toISOString(),
    summary,
    entries,
  };
  return { ok: true, package: backup };
}

export function exportLocalBackupJson(storage?: BackupStorage | null): { ok: true; text: string; summary: LocalBackupSummary } | { ok: false; error: string } {
  const collected = collectLocalBackup(storage);
  if (!collected.ok) return collected;
  return {
    ok: true,
    text: `${JSON.stringify(collected.package, null, 2)}\n`,
    summary: collected.package.summary,
  };
}

export function parseLocalBackup(text: string, storage?: BackupStorage | null): BackupParseResult {
  const fail = (error: string): BackupParseResult => ({ ok: false, error, package: null, summary: null, conflicts: 0 });
  if (typeof text !== 'string' || text.length === 0) return fail('备份文件为空。');
  if (byteLength(text) > MAX_LOCAL_BACKUP_BYTES + 256 * 1024) return fail('备份文件超过 4 MiB 上限，已拒绝。');
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return fail('备份文件不是合法 JSON，已拒绝；本机数据未改变。');
  }
  if (!isPlainRecord(parsed)) return fail('备份文件结构不正确。');
  if (parsed.format !== LOCAL_BACKUP_FORMAT || parsed.schemaVersion !== LOCAL_BACKUP_SCHEMA_VERSION) {
    return fail('备份格式或版本不兼容。');
  }
  if (!isPlainRecord(parsed.entries)) return fail('备份缺少 entries 对象。');
  const entries: Record<string, string> = {};
  let totalBytes = 0;
  for (const [key, value] of Object.entries(parsed.entries)) {
    if (!KEY_PATTERN.test(key) || isForbiddenKey(key) || EXCLUDED_KEYS.has(key)) return fail(`备份包含不允许的键：${key}`);
    if (typeof value !== 'string') return fail(`键 ${key} 的值必须是字符串。`);
    if (byteLength(value) > MAX_LOCAL_BACKUP_VALUE_BYTES) return fail(`键 ${key} 超过单条 1 MiB 上限。`);
    if (value.trim().startsWith('{') || value.trim().startsWith('[')) {
      if (safeJson(value) === null) return fail(`键 ${key} 的值不是合法 JSON。`);
    }
    totalBytes += byteLength(key) + byteLength(value);
    entries[key] = value;
  }
  const summary = summarize(entries);
  if (summary.entries > MAX_LOCAL_BACKUP_ENTRIES || totalBytes > MAX_LOCAL_BACKUP_BYTES) {
    return fail('备份超过条目或总大小上限。');
  }
  if (entries['emplab.teacher-problems.v1']) {
    const teacher = safeJson(entries['emplab.teacher-problems.v1']);
    if (!isPlainRecord(teacher) || teacher.version !== 1 || !Array.isArray(teacher.drafts)) {
      return fail('教师草稿存档结构不兼容；为避免覆盖，已拒绝整个备份。');
    }
  }
  const target = resolveStorage(storage);
  let conflicts = 0;
  if (target) {
    for (const key of Object.keys(entries)) {
      if (target.getItem(key) !== null) conflicts += 1;
    }
  }
  const backup: LocalBackupPackage = {
    format: LOCAL_BACKUP_FORMAT,
    schemaVersion: LOCAL_BACKUP_SCHEMA_VERSION,
    appVersion: typeof parsed.appVersion === 'string' ? parsed.appVersion.slice(0, 64) : 'unknown',
    exportedAt: typeof parsed.exportedAt === 'string' ? parsed.exportedAt.slice(0, 64) : '',
    summary,
    entries,
  };
  return { ok: true, error: null, package: backup, summary, conflicts };
}

export function applyLocalBackup(backup: LocalBackupPackage, storage?: BackupStorage | null): BackupApplyResult {
  const target = resolveStorage(storage);
  if (!target) return { ok: false, error: '当前浏览器不允许访问本地存储，备份未写入。', written: 0 };
  const previous = new Map<string, string | null>();
  const written: string[] = [];
  try {
    for (const [key, value] of Object.entries(backup.entries)) {
      previous.set(key, target.getItem(key));
      target.setItem(key, value);
      written.push(key);
    }
    return { ok: true, error: null, written: written.length };
  } catch {
    for (const key of written) {
      const old = previous.get(key);
      try {
        if (old == null) target.removeItem(key);
        else target.setItem(key, old);
      } catch {
        // Best-effort rollback; report the original failure.
      }
    }
    return { ok: false, error: '写入本地存储失败，已尝试恢复原有数据；请保留备份文件并重试。', written: 0 };
  }
}
