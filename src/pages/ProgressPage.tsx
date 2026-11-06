import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { questionById } from '../content/questions';
import { DIFFICULTY_LABEL } from '../content/schema';
import {
  clearAllProgress,
  exportProgressJson,
  importProgressJson,
  progressSummary,
  useProgress,
} from '../features/progress/progressStore';
import { Icon } from '../components/Icon';

function formatDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function ProgressPage() {
  const progress = useProgress();
  const summary = progressSummary(progress);
  const fileRef = useRef<HTMLInputElement>(null);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const records = Object.entries(progress.questions)
    .map(([id, record]) => ({ question: questionById(id), record }))
    .filter((entry) => entry.question)
    .sort((a, b) => (b.record.updatedAt ?? '').localeCompare(a.record.updatedAt ?? ''));

  const downloadExport = () => {
    const blob = new Blob([exportProgressJson()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    const date = new Date().toISOString().slice(0, 10);
    anchor.href = url;
    anchor.download = `em-physics-lab-progress-${date}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleImport = async (file: File | undefined) => {
    if (!file) return;
    const text = await file.text();
    const result = importProgressJson(text);
    setImportMessage(result.message);
  };

  return (
    <div className="progress-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">我的记录</p>
          <h1>本地学习进度</h1>
          <p className="page-lede">
            答题、收藏与错题记录保存在此设备的浏览器中。没有账号、没有云端同步，也不采集姓名或电话。
            你可以随时导出 JSON 备份，或导入到另一台设备。
          </p>
        </div>
      </header>

      <section className="summary-grid" aria-label="学习概览">
        <article className="summary-card">
          <span>已作答</span>
          <strong>{summary.attempted}</strong>
          <small>道题</small>
        </article>
        <article className="summary-card">
          <span>总作答次数</span>
          <strong>{summary.totalAttempts}</strong>
          <small>次</small>
        </article>
        <article className="summary-card">
          <span>最近正确率</span>
          <strong>{Math.round(summary.accuracy * 100)}%</strong>
          <small>按作答次数</small>
        </article>
        <article className="summary-card">
          <span>错题 / 收藏</span>
          <strong>{summary.wrong} / {summary.favorites}</strong>
          <small>道</small>
        </article>
      </section>

      <section className="progress-panel" aria-labelledby="records-title">
        <div className="progress-panel-head">
          <div>
            <h2 id="records-title">作答记录</h2>
            <p>只显示本机已有的题目；导入文件时会先校验格式再覆盖当前记录。</p>
          </div>
          <div className="progress-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={downloadExport}
              disabled={records.length === 0}
            >
              <Icon name="download" size={17} />
              导出 JSON
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => fileRef.current?.click()}
            >
              <Icon name="upload" size={17} />
              导入 JSON
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="sr-only"
              onChange={(event) => {
                void handleImport(event.target.files?.[0]);
                event.target.value = '';
              }}
              aria-label="选择要导入的进度 JSON 文件"
            />
          </div>
        </div>

        {importMessage ? (
          <div className="callout callout-note" role="status">
            <Icon name="info" size={18} />
            <p>{importMessage}</p>
          </div>
        ) : null}

        {records.length === 0 ? (
          <div className="empty-state">
            <Icon name="book" size={28} />
            <h2>还没有作答记录</h2>
            <p>从原创题开始；选择答案、查看提示和收藏都会保存在本机。</p>
            <Link className="primary-button" to="/practice">
              去练习
              <Icon name="arrowRight" size={17} />
            </Link>
          </div>
        ) : (
          <div className="progress-list">
            {records.map(({ question, record }) => {
              if (!question) return null;
              return (
                <article className="progress-row" key={question.id}>
                  <div className="progress-row-main">
                    <div className="progress-row-title">
                      <span className={`attempt-dot ${record.lastCorrect ? 'is-correct' : record.attempts > 0 ? 'is-wrong' : ''}`} />
                      <strong>{question.title}</strong>
                      {record.favorite ? <span className="mini-tag"><Icon name="heart" size={13} filled />收藏</span> : null}
                    </div>
                    <div className="progress-row-meta">
                      <span>{question.id.toUpperCase()}</span>
                      <span>{DIFFICULTY_LABEL[question.difficulty]}</span>
                      <span>作答 {record.attempts} 次</span>
                      <span>提示 {record.hintsUsed} 条</span>
                      <span>{formatDate(record.updatedAt)}</span>
                    </div>
                  </div>
                  <div className="progress-row-side">
                    <span className={`result-pill ${record.lastCorrect ? 'result-correct' : 'result-wrong'}`}>
                      {record.lastCorrect === null ? '未判定' : record.lastCorrect ? '最近答对' : '最近答错'}
                    </span>
                    <Link className="text-link" to={`/practice?q=${question.id}`}>
                      回到题目
                      <Icon name="arrowRight" size={15} />
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        <div className="danger-zone">
          <div>
            <h3>清空本地记录</h3>
            <p>会删除本机全部答题、提示和收藏数据，无法撤销。建议先导出备份。</p>
          </div>
          {confirmClear ? (
            <div className="confirm-row">
              <span>确认清空？</span>
              <button
                type="button"
                className="danger-button"
                onClick={() => {
                  clearAllProgress();
                  setConfirmClear(false);
                  setImportMessage('已清空本地记录。');
                }}
              >
                确认清空
              </button>
              <button type="button" className="text-button" onClick={() => setConfirmClear(false)}>
                取消
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="danger-button-outline"
              onClick={() => setConfirmClear(true)}
              disabled={records.length === 0}
            >
              <Icon name="trash" size={17} />
              清空记录
            </button>
          )}
        </div>
      </section>

      <div className="callout callout-note privacy-note">
        <Icon name="info" size={18} />
        <div>
          <strong>隐私与离线说明</strong>
          <p>
            数据保存在浏览器 localStorage 的 <code>emplab.progress.v1</code> 键中，不会发送到服务器。
            清除浏览器网站数据也会删除记录。安装为 PWA 后，内置模型与原创题可在缓存有效时离线打开；
            真题外链不保证离线可用。
          </p>
        </div>
      </div>
    </div>
  );
}
