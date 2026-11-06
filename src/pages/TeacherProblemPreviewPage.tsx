import { useEffect, useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { WholeProblemLab } from '../features/cases/wholeProblem/WholeProblemLab';
import { compileTeacherProblem } from '../features/problem-authoring/problemCompiler';
import { adapterSupportLabel } from '../features/problem-authoring/problemAdapterRegistry';
import type { DraftReviewStatus } from '../features/problem-authoring/teacherProblemSchema';
import { loadTeacherDrafts } from '../features/problem-authoring/teacherProblemStore';

const STATUS_LABEL: Record<DraftReviewStatus, string> = {
  draft: '草稿',
  content_incomplete: '内容未完成',
  physics_unverified: '物理待检查',
  simulation_verified: '仿真已验证',
  unsupported: '不支持',
};

export function TeacherProblemPreviewPage() {
  const { draftId } = useParams();
  const loaded = useMemo(() => loadTeacherDrafts(), []);
  const draft = loaded.state.drafts.find((candidate) => candidate.id === draftId);
  const compile = useMemo(() => (draft ? compileTeacherProblem(draft) : null), [draft]);

  useEffect(() => {
    if (draft) document.title = `${draft.title || '教师草稿'} · 本机预览｜EM Physics Lab`;
  }, [draft]);

  if (!draft || !compile) {
    return (
      <div className="teacher-page" data-testid="teacher-preview-missing">
        <h1>找不到这份教师草稿</h1>
        <p>{loaded.error ?? '草稿 ID 无效，或本地存储中的记录已损坏。'}</p>
        <Link className="secondary-button" to="/teacher/problems">返回教师题目列表</Link>
      </div>
    );
  }

  return (
    <div className="teacher-page teacher-preview-page" data-testid="teacher-preview">
      <nav className="path-breadcrumb" aria-label="面包屑">
        <Link to="/teacher/problems">教师题目</Link>
        <span>/</span>
        <Link to={`/teacher/problems/${draft.id}/edit`}>编辑</Link>
        <span>/</span>
        <span aria-current="page">学生视图预览</span>
      </nav>

      <header className="teacher-preview-head">
        <div>
          <p className="eyebrow">本机教师草稿 · 非官方真题</p>
          <h1>{draft.title || '未命名教师题目'}</h1>
          <p className="page-lede">{draft.subtitle || '教师私有草稿'}</p>
          <div className="teacher-boundary-row">
            <span className={`teacher-status is-${compile.status}`} data-testid="teacher-preview-status">{STATUS_LABEL[compile.status]}</span>
            <span className="status-pill">{adapterSupportLabel(compile.adapter?.support ?? 'unsupported')}</span>
            <span className="status-pill">来源：{draft.provenance.kind}</span>
            <span className="status-pill">核验：{draft.provenance.sourceReview}</span>
            <span className="status-pill">权利：{draft.provenance.rights}</span>
          </div>
        </div>
        <Link className="secondary-button" to={`/teacher/problems/${draft.id}/edit`} data-testid="teacher-back-editor">
          <Icon name="chevronLeft" size={16} />返回编辑器
        </Link>
      </header>

      <p className="teacher-alert is-warning" data-testid="teacher-preview-disclaimer">
        本页是本机教师草稿的学生视图，不是官方真题，也未自动获得公开转载许可。预览不会写入内置案例进度，
        也不会让草稿进入生产构建或离线预缓存。
      </p>

      <section className="case-panel teacher-preview-stem" aria-labelledby="teacher-preview-stem-title">
        <h2 id="teacher-preview-stem-title">题干</h2>
        <p>{draft.stem || '题干尚未填写。'}</p>
      </section>

      {compile.item ? (
        <>
          {compile.status !== 'simulation_verified' ? (
            <p className="teacher-alert is-warning">
              当前草稿尚未达到“仿真已验证”的内容门槛。舞台与判题使用真实求解器，但请回到编辑器查看阻断项。
            </p>
          ) : null}
          <WholeProblemLab key={compile.item.id} item={compile.item} teacherMode={false} />
        </>
      ) : (
        <section className="case-panel teacher-blocked-preview" data-testid="teacher-preview-blocked">
          <h2>当前草稿不能生成学生视图</h2>
          <p>预览被以下检查阻断；不会用占位动画或默认答案替代物理结果。</p>
          <ul>{compile.errors.map((item) => <li key={item}>{item}</li>)}</ul>
          <Link className="secondary-button" to={`/teacher/problems/${draft.id}/edit`}>返回编辑器修复</Link>
        </section>
      )}

      {compile.warnings.length > 0 ? (
        <section className="case-panel teacher-preview-checks">
          <h2>限制与提醒</h2>
          <ul>{compile.warnings.map((item) => <li key={item}>{item}</li>)}</ul>
        </section>
      ) : null}
    </div>
  );
}
