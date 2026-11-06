import { useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import {
  applyLocalBackup,
  exportLocalBackupJson,
  parseLocalBackup,
  type BackupParseResult,
  type LocalBackupSummary,
} from '../features/release/localBackup';

function summaryText(summary: LocalBackupSummary | null): string {
  if (!summary) return '';
  return [
    `${summary.entries} 个存储键`,
    `${summary.questionRecords} 道题记录`,
    `${summary.caseRecords} 个案例进度`,
    `${summary.teacherDrafts} 个教师草稿`,
    `${summary.scenes} 个模型场景`,
    `${summary.lessonRecords} 个讲解/模式记录`,
  ].join(' · ');
}

export function LocalBackupPanel() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [preview, setPreview] = useState<BackupParseResult | null>(null);

  const exportAll = () => {
    const result = exportLocalBackupJson();
    if (!result.ok) {
      setMessage(result.error);
      return;
    }
    const blob = new Blob([result.text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    const date = new Date().toISOString().slice(0, 10);
    anchor.href = url;
    anchor.download = `em-physics-lab-local-backup-${date}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setPreview(null);
    setMessage(`已生成完整本地备份：${summaryText(result.summary)}。文件只在本机下载，没有上传。`);
  };

  const inspectFile = async (file: File | undefined) => {
    if (!file) return;
    const text = await file.text();
    const parsed = parseLocalBackup(text);
    setPreview(parsed);
    setMessage(parsed.ok ? '备份已读取，尚未写入本机；请核对摘要后确认恢复。' : parsed.error);
  };

  const restore = () => {
    if (!preview?.ok || !preview.package) return;
    const result = applyLocalBackup(preview.package);
    if (!result.ok) {
      setMessage(result.error);
      return;
    }
    setMessage(`已恢复 ${result.written} 个本地存储键；页面即将刷新，原数据未被清除。`);
    window.setTimeout(() => window.location.reload(), 650);
  };

  return (
    <section className="progress-panel backup-panel" aria-labelledby="backup-title" data-testid="local-backup-panel">
      <div className="progress-panel-head">
        <div>
          <h2 id="backup-title">完整本地数据备份与迁移</h2>
          <p>
            包含 16 模型场景、132 题进度、案例逐问进度、教师私有草稿、讲解/模式与设备自测记录。
            备份仅在本机生成；换 origin、PWA 主屏幕或原生 WebView 不会自动共享数据。
          </p>
        </div>
        <div className="progress-actions">
          <button type="button" className="secondary-button" onClick={exportAll} data-testid="backup-export">
            <Icon name="download" size={17} />
            导出完整备份
          </button>
          <button type="button" className="secondary-button" onClick={() => fileRef.current?.click()} data-testid="backup-import">
            <Icon name="upload" size={17} />
            选择备份文件
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            aria-label="选择完整本地数据备份 JSON"
            onChange={(event) => {
              void inspectFile(event.target.files?.[0]);
              event.target.value = '';
            }}
          />
        </div>
      </div>

      <div className="callout callout-note">
        <Icon name="info" size={18} />
        <div>
          <strong>这是人工迁移，不是云同步</strong>
          <p>
            恢复会覆盖备份中同名的本地键，但不会调用 <code>localStorage.clear()</code>，也不会删除备份未包含的其它键。
            教师草稿可能包含私有题目，请像试卷文件一样保管，不要公开发送。
          </p>
        </div>
      </div>

      {message ? <p className="backup-message" role="status" data-testid="backup-message">{message}</p> : null}

      {preview?.ok && preview.summary ? (
        <div className="backup-preview" data-testid="backup-preview">
          <h3>备份预览</h3>
          <p>{summaryText(preview.summary)}</p>
          <p>
            导出时间：{preview.package?.exportedAt || '未知'} · 备份版本：
            {preview.package?.appVersion || '未知'} · 与现有数据同名键：{preview.conflicts} 个
          </p>
          <div className="confirm-row">
            <button type="button" className="primary-button" onClick={restore} data-testid="backup-restore">
              确认恢复并刷新
            </button>
            <button type="button" className="text-button" onClick={() => { setPreview(null); setMessage('已取消恢复，本机数据未改变。'); }}>
              取消
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
