import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { compileTeacherProblem } from '../features/problem-authoring/problemCompiler';
import { adapterSupportLabel } from '../features/problem-authoring/problemAdapterRegistry';
import {
  builtInCaseCopyOptions,
  copyBuiltInCaseAsDraft,
  TEACHER_TEMPLATES,
} from '../features/problem-authoring/round17Templates';
import {
  createBlankTeacherDraft,
  type DraftReviewStatus,
  type TeacherProblemDraft,
} from '../features/problem-authoring/teacherProblemSchema';
import {
  deleteTeacherDraft,
  duplicateTeacherDraft,
  exportTeacherProblemPackage,
  importIntoStore,
  loadTeacherDrafts,
  teacherPackageFilename,
  upsertTeacherDraft,
} from '../features/problem-authoring/teacherProblemStore';

const STATUS_LABEL: Record<DraftReviewStatus, string> = {
  draft: '草稿',
  content_incomplete: '内容未完成',
  physics_unverified: '物理待检查',
  simulation_verified: '仿真已验证',
  unsupported: '不支持',
};

const SOURCE_LABEL = {
  teacher_private: '教师私有',
  original_case: '项目原创',
  exam_reference: '真题引用',
} as const;

function downloadText(text: string, filename: string): void {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function draftDate(draft: TeacherProblemDraft): string {
  const stamp = Date.parse(draft.updatedAt);
  if (!Number.isFinite(stamp)) return '未知时间';
  return new Date(stamp).toLocaleString('zh-CN', { hour12: false });
}

export function TeacherProblemListPage() {
  const navigate = useNavigate();
  const [loaded, setLoaded] = useState(() => loadTeacherDrafts());
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(loaded.error);
  const [copyCaseId, setCopyCaseId] = useState(() => builtInCaseCopyOptions()[0]?.id ?? '');
  const fileInput = useRef<HTMLInputElement>(null);
  const caseOptions = useMemo(() => builtInCaseCopyOptions(), []);
  const evaluations = useMemo(
    () => loaded.state.drafts.map((draft) => ({ draft, compile: compileTeacherProblem(draft) })),
    [loaded],
  );

  const refresh = (message?: string) => {
    const next = loadTeacherDrafts();
    setLoaded(next);
    setError(next.error);
    if (message) setNotice(message);
  };

  const createDraft = (draft: TeacherProblemDraft, message: string) => {
    const saved = upsertTeacherDraft(draft);
    if (!saved.ok) {
      setError(saved.error);
      return;
    }
    setError(null);
    navigate(`/teacher/problems/${draft.id}/edit`);
    setNotice(message);
  };

  const handleCopy = () => {
    const draft = copyCaseId ? copyBuiltInCaseAsDraft(copyCaseId) : null;
    if (!draft) {
      setError('找不到要复制的内置案例。');
      return;
    }
    createDraft(draft, '已创建内置案例的本机私有副本；内置案例本身不会被修改。');
  };

  const handleDuplicate = (draftId: string) => {
    const result = duplicateTeacherDraft(draftId);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    refresh('已复制为本机新草稿。');
  };

  const handleDelete = (draft: TeacherProblemDraft) => {
    if (typeof window !== 'undefined' && !window.confirm(`删除本机草稿“${draft.title}”？此操作只影响草稿，不影响内置案例。`)) return;
    const result = deleteTeacherDraft(draft.id);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    refresh('草稿已删除。');
  };

  const handleExport = (draft: TeacherProblemDraft) => {
    try {
      downloadText(exportTeacherProblemPackage(draft), teacherPackageFilename(draft));
      setNotice('已生成私有题包下载；导出只在你点击时发生。');
      setError(null);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : '题包导出失败。');
    }
  };

  const handleImportFile = async (file: File | null) => {
    if (!file) return;
    try {
      const text = await file.text();
      const result = importIntoStore(text);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setNotice(result.warning ?? '题包已导入本机；物理绑定将在预览时重新求解。');
      setError(null);
      refresh();
    } catch {
      setError('无法读取题包文件；本机存档未改变。');
    } finally {
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  return (
    <div className="teacher-page" data-testid="teacher-problem-list">
      <header className="teacher-hero">
        <div>
          <p className="eyebrow">教师工作台 · 本机私有</p>
          <h1>把一道复杂电磁题，变成同一舞台上的连续实验</h1>
          <p className="page-lede">
            从白名单模板创建题目，编辑题干、逐问推导、参数变式与答案绑定。私有草稿只保存在当前浏览器；
            浏览器清理存储会丢失草稿，请主动导出题包或使用 <Link to="/progress">我的记录 → 完整本地数据备份</Link>。题目可通过引擎检查，但不会被自动标成官方真题或已获转载授权。
          </p>
          <div className="teacher-boundary-row">
            <span className="status-pill">本机私有</span>
            <span className="status-pill">不执行任意代码</span>
            <span className="status-pill">物理验证 ≠ 来源核验</span>
          </div>
        </div>
        <div className="teacher-hero-actions">
          <button
            type="button"
            className="primary-button"
            onClick={() => createDraft(createBlankTeacherDraft('a17-electric-magnetic-screen'), '已创建空白 A17-01 草稿。')}
            data-testid="teacher-create-blank"
          >
            <Icon name="plus" size={17} />新建空白题
          </button>
          <button type="button" className="secondary-button" onClick={() => fileInput.current?.click()} data-testid="teacher-import-button">
            <Icon name="upload" size={17} />导入私有题包
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="teacher-file-input"
            aria-label="导入教师私有题包 JSON"
            onChange={(event) => void handleImportFile(event.target.files?.[0] ?? null)}
            data-testid="teacher-import-input"
          />
        </div>
      </header>

      {error ? <p className="teacher-alert is-error" role="alert" data-testid="teacher-error">{error}</p> : null}
      {notice ? <p className="teacher-alert" role="status" data-testid="teacher-notice">{notice}</p> : null}

      <section className="case-panel teacher-template-panel" aria-labelledby="teacher-template-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">原创模板 · 白名单物理</p>
            <h2 id="teacher-template-title">从真实连续题开始</h2>
          </div>
          <p className="section-lede">模板只包含受信任的适配器标识与有限参数，不会把自定义代码写入题包。</p>
        </div>
        <div className="teacher-template-grid">
          {TEACHER_TEMPLATES.map((template) => (
            <article className="teacher-template-card" key={template.id} data-testid={`teacher-template-${template.id}`}>
              <h3>{template.title}</h3>
              <p>{template.description}</p>
              <button
                type="button"
                className="secondary-button"
                onClick={() => createDraft(template.create(), `已从 ${template.id} 模板创建本机私有草稿。`)}
              >
                使用模板
              </button>
            </article>
          ))}
          <article className="teacher-template-card">
            <h3>复制内置原创案例</h3>
            <p>复制 C01–C08 与 A17-01 为本机私有草稿；原始内置题目保持不变。</p>
            <div className="teacher-inline-form">
              <select value={copyCaseId} onChange={(event) => setCopyCaseId(event.target.value)} aria-label="选择要复制的内置案例">
                {caseOptions.map((option) => <option value={option.id} key={option.id}>{option.title}</option>)}
              </select>
              <button type="button" className="secondary-button" onClick={handleCopy} data-testid="teacher-copy-case">复制</button>
            </div>
          </article>
        </div>
      </section>

      <section className="case-panel" aria-labelledby="teacher-drafts-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">本机生命周期</p>
            <h2 id="teacher-drafts-title">私有题目草稿</h2>
          </div>
          <span className="teacher-count" data-testid="teacher-draft-count">{loaded.state.drafts.length} 份</span>
        </div>

        {evaluations.length === 0 ? (
          <div className="teacher-empty" data-testid="teacher-empty">
            <Icon name="layers" size={26} />
            <p>还没有教师草稿。使用上方模板或新建空白题开始。</p>
          </div>
        ) : (
          <div className="teacher-draft-list">
            {evaluations.map(({ draft, compile }) => (
              <article className="teacher-draft-card" key={draft.id} data-testid={`teacher-draft-${draft.id}`}>
                <div className="teacher-draft-head">
                  <div>
                    <h3>{draft.title || '未命名教师题目'}</h3>
                    <p>{draft.subtitle || '本机教师草稿'}</p>
                  </div>
                  <span className={`teacher-status is-${compile.status}`} data-testid={`teacher-status-${draft.id}`}>
                    {STATUS_LABEL[compile.status]}
                  </span>
                </div>
                <div className="teacher-draft-meta">
                  <span>{SOURCE_LABEL[draft.provenance.kind]}</span>
                  <span>核验：{draft.provenance.sourceReview}</span>
                  <span>权利：{draft.provenance.rights}</span>
                  <span>更新：{draftDate(draft)}</span>
                </div>
                <p className="teacher-draft-summary">
                  {compile.adapter ? `${compile.adapter.shortLabel} · ${compile.adapter.label}` : '未知适配器'}
                  {' · '}
                  {draft.parts.length} 个小问
                  {compile.errors.length > 0 ? ` · ${compile.errors.length} 项检查未通过` : ''}
                </p>
                <p className="teacher-draft-support">{adapterSupportLabel(compile.adapter?.support ?? 'unsupported')}</p>
                <div className="teacher-draft-actions">
                  <Link className="secondary-button" to={`/teacher/problems/${draft.id}/edit`} data-testid={`teacher-edit-${draft.id}`}>
                    <Icon name="sliders" size={16} />编辑
                  </Link>
                  {compile.item ? (
                    <Link className="secondary-button" to={`/teacher/problems/${draft.id}/preview`} data-testid={`teacher-preview-${draft.id}`}>
                      <Icon name="play" size={16} />学生视图预览
                    </Link>
                  ) : (
                    <button type="button" className="secondary-button" disabled title="先补齐阻断预览的检查项">学生视图预览</button>
                  )}
                  <button type="button" className="chip-button" onClick={() => handleDuplicate(draft.id)} data-testid={`teacher-duplicate-${draft.id}`}>
                    复制
                  </button>
                  <button type="button" className="chip-button" onClick={() => handleExport(draft)} data-testid={`teacher-export-${draft.id}`}>
                    <Icon name="download" size={15} />导出
                  </button>
                  <button type="button" className="chip-button is-danger" onClick={() => handleDelete(draft)} data-testid={`teacher-delete-${draft.id}`}>
                    <Icon name="trash" size={15} />删除
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
        <p className="teacher-storage-note">
          <Icon name="info" size={15} />
          本地存储容量有限；大型图片不应写入草稿。清理浏览器站点数据会删除这些草稿，请定期导出题包，或在 <Link to="/progress">我的记录</Link> 导出包含场景、答题与教师草稿的完整备份。
        </p>
      </section>
    </div>
  );
}
