import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { PROBLEM_CASES } from '../content/problemCases';
import { EXAM_REFERENCES } from '../content/examReferences';
import { SIMULATIONS } from '../simulations/registry';
import { loadCaseProgress, restoreCaseBackups } from '../features/cases/caseSession';

const DIFFICULTY_LABEL = {
  basic: '基础',
  advanced: '提升',
  integrated: '综合',
} as const;

export function CaseListPage() {
  const [progress] = useState(() => loadCaseProgress());
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const restored = restoreCaseBackups();
    if (restored.length > 0) {
      setNotice(`已恢复 ${restored.length} 个进入案例实验前的个人场景。`);
    }
  }, []);

  return (
    <div className="cases-page" data-testid="cases-page">
      <header className="cases-hero">
        <div>
          <p className="eyebrow">题目实验 · 原创高考风格案例</p>
          <h1>从题目走到真实模拟器，再带着推导回来</h1>
          <p className="page-lede">
            每个案例都给出可复现的物理条件、模型参数映射、独立验算与变式。进入实验不会保存为你的个人场景；
            返回时会恢复原来的实验配置。所有案例均为原创，不冒充高考原卷。
          </p>
        </div>
        <div className="cases-hero-actions">
          <Link className="secondary-button" to="/path"><Icon name="book" size={17} />按知识路线学习</Link>
          <Link className="secondary-button" to="/device-check"><Icon name="target" size={17} />课堂设备检测</Link>
        </div>
      </header>

      {notice ? <p className="case-restore-notice" role="status" data-testid="case-restore-notice">{notice}</p> : null}

      <div className="case-grid">
        {PROBLEM_CASES.map((item) => {
          const entry = progress.cases[item.id];
          return (
            <article className="case-card" key={item.id} data-testid={`case-card-${item.id}`}>
              <div className="case-card-head">
                <div>
                  <span className="model-number">{item.id.replace('case-', '').toUpperCase()}</span>
                  <h2>{item.title}</h2>
                </div>
                <span className="status-pill status-ready">原创 · 高考风格</span>
              </div>
              <p className="case-subtitle">{item.subtitle}</p>
              <p>{item.stem.slice(0, 105)}…</p>
              <div className="tag-row">
                <span className="tag">{DIFFICULTY_LABEL[item.difficulty]}</span>
                {item.topicTags.slice(0, 3).map((tag) => <span className="tag" key={tag}>{tag}</span>)}
              </div>
              <div className="case-stage-summary">
                {item.stages.map((stage) => {
                  const simulation = SIMULATIONS.find((candidate) => candidate.id === stage.modelId);
                  return <span key={stage.id}>{stage.modelId.toUpperCase()} · {simulation?.shortTitle ?? stage.modelId}</span>;
                })}
              </div>
              <div className="case-card-footer">
                <span className="case-progress-note">
                  {entry ? (entry.checkpointCorrect ? '已完成最终检查' : `已访问：${entry.visitedStage}`) : '未开始'}
                </span>
                <Link className="model-link" to={`/cases/${item.id}`} data-testid={`case-open-${item.id}`}>
                  查看案例 <Icon name="arrowRight" size={16} />
                </Link>
              </div>
            </article>
          );
        })}
      </div>

      <section className="case-source-section" aria-labelledby="case-source-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">仅元数据 · 外链</p>
            <h2 id="case-source-title">真题来源索引</h2>
          </div>
          <p className="section-lede">
            以下条目只记录年份、卷名、题号与来源链接；全部 **未在线复核**，没有题干、截图或答案。
            离线时外链不可用。授权与核验状态见 <code>docs/EXAM_SOURCE_AUDIT.md</code>。
          </p>
        </div>
        <div className="case-source-grid">
          {EXAM_REFERENCES.map((reference) => (
            <article className="case-source-card" key={reference.id} data-testid={`case-source-${reference.id}`}>
              <div className="case-source-head">
                <strong>{reference.year} · {reference.examName}</strong>
                <span className="status-pill">{reference.verifiedOnline ? '已在线复核' : '未在线复核'}</span>
              </div>
              <p>题号：{reference.questionNumber} · {reference.region}</p>
              <p className="case-source-note">{reference.sourceNote}</p>
              <div className="case-source-meta">
                <span>来源：{reference.sourcePublisher ?? '第三方索引'}</span>
                <span>权利：{reference.rights === 'link_only' ? '仅链接' : reference.rights ?? '未知'}</span>
              </div>
              <a href={reference.sourceUrl} target="_blank" rel="noreferrer noopener">打开外部来源（非离线）</a>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
