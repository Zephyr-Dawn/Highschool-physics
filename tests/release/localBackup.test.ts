import { describe, expect, it } from 'vitest';
import {
  MAX_LOCAL_BACKUP_BYTES,
  applyLocalBackup,
  collectLocalBackup,
  exportLocalBackupJson,
  parseLocalBackup,
  type BackupStorage,
} from '../../src/features/release/localBackup';

class MemoryStorage implements BackupStorage {
  map = new Map<string, string>();
  failOnKey: string | null = null;
  get length() { return this.map.size; }
  key(index: number) { return [...this.map.keys()][index] ?? null; }
  getItem(key: string) { return this.map.get(key) ?? null; }
  setItem(key: string, value: string) {
    if (key === this.failOnKey) throw new Error('quota');
    this.map.set(key, value);
  }
  removeItem(key: string) { this.map.delete(key); }
}

function seed(storage: MemoryStorage) {
  storage.setItem('emplab.progress.v1', JSON.stringify({ version: 1, questions: { q1: { attempts: 1 } } }));
  storage.setItem('emplab.cases.progress.v1', JSON.stringify({ version: 1, cases: { c1: { visitedStage: 'a' } } }));
  storage.setItem('emplab.teacher-problems.v1', JSON.stringify({ version: 1, drafts: [{ id: 'draft-one' }] }));
  storage.setItem('emplab.i05.scene.v2', JSON.stringify({ schemaVersion: 2, model: 'i05' }));
  storage.setItem('emplab.case.sceneBackup.v1', 'transient');
  storage.setItem('other.app', 'ignore');
}

describe('Round 18 local backup and migration', () => {
  it('exports allowlisted app data with counts and excludes transient backups', () => {
    const storage = new MemoryStorage();
    seed(storage);
    const result = exportLocalBackupJson(storage);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.summary.questionRecords).toBe(1);
    expect(result.summary.caseRecords).toBe(1);
    expect(result.summary.teacherDrafts).toBe(1);
    expect(result.summary.scenes).toBe(1);
    expect(result.text).not.toContain('case.sceneBackup');
    expect(result.text).not.toContain('other.app');
  });

  it('round-trips a backup into a fresh storage without clearing unrelated current data', () => {
    const source = new MemoryStorage();
    seed(source);
    const exported = exportLocalBackupJson(source);
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;
    const target = new MemoryStorage();
    target.setItem('other.current', 'keep-me');
    const parsed = parseLocalBackup(exported.text, target);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok || !parsed.package) return;
    const applied = applyLocalBackup(parsed.package, target);
    expect(applied.ok).toBe(true);
    expect(target.getItem('other.current')).toBe('keep-me');
    expect(target.getItem('emplab.progress.v1')).toContain('q1');
    expect(target.getItem('emplab.teacher-problems.v1')).toContain('draft-one');
  });

  it('rejects malformed, wrong-format and unsafe backups without modifying storage', () => {
    const storage = new MemoryStorage();
    storage.setItem('emplab.progress.v1', '{"version":1,"questions":{}}');
    const original = storage.getItem('emplab.progress.v1');
    expect(parseLocalBackup('{bad json', storage).ok).toBe(false);
    expect(parseLocalBackup(JSON.stringify({ format: 'wrong', schemaVersion: 1, entries: {} }), storage).ok).toBe(false);
    const proto = '{"format":"emplab.local-backup","schemaVersion":1,"appVersion":"x","exportedAt":"x","summary":{},"entries":{"__proto__":"{}"}}';
    expect(parseLocalBackup(proto, storage).ok).toBe(false);
    expect(storage.getItem('emplab.progress.v1')).toBe(original);
  });

  it('rejects oversized backups and malformed teacher draft storage', () => {
    const huge = 'x'.repeat(MAX_LOCAL_BACKUP_BYTES + 1);
    expect(parseLocalBackup(huge).ok).toBe(false);
    const badTeacher = JSON.stringify({
      format: 'emplab.local-backup', schemaVersion: 1, appVersion: 'x', exportedAt: 'x', summary: {},
      entries: { 'emplab.teacher-problems.v1': JSON.stringify({ version: 1, drafts: 'nope' }) },
    });
    const result = parseLocalBackup(badTeacher);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('教师草稿');
  });

  it('rolls back already-written keys when a later write fails', () => {
    const source = new MemoryStorage();
    seed(source);
    const exported = exportLocalBackupJson(source);
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;
    const target = new MemoryStorage();
    target.setItem('emplab.progress.v1', 'old-progress');
    target.failOnKey = 'emplab.cases.progress.v1';
    const parsed = parseLocalBackup(exported.text, target);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok || !parsed.package) return;
    const applied = applyLocalBackup(parsed.package, target);
    expect(applied.ok).toBe(false);
    expect(target.getItem('emplab.progress.v1')).toBe('old-progress');
    expect(target.getItem('emplab.cases.progress.v1')).toBeNull();
  });

  it('accepts an empty backup and reports zero counts', () => {
    const storage = new MemoryStorage();
    const result = collectLocalBackup(storage);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.package.summary.entries).toBe(0);
  });
});
