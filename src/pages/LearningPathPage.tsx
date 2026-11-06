import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { DEMO_ROUTES, LEARNING_PATHS, type LearningPath, type LearningPathStep } from '../content/learningPath';
import { QUESTION_STATS } from '../content/questionStats';
import { useProgress, type ProgressState } from '../features/progress/progressStore';
import { SIMULATIONS, routeForModel } from '../simulations/registry';

function attemptedForModel(progress: ProgressState, modelId: string): number {
  return Object.entries(progress.questions).filter(([id, record]) => (
    (id === modelId || id.startsWith(`${modelId}-`)) && record.attempts > 0
  )).length;
}

function StepCard({ path, step, index }: { path: LearningPath; step: LearningPathStep; index: number }) {
  const progress = useProgress();
  const simulation = SIMULATIONS.find((item) => item.id === step.modelId);
  const total = QUESTION_STATS.byModel[step.modelId];
  const attempted = attemptedForModel(progress, step.modelId);
  const percent = total > 0 ? Math.round((attempted / total) * 100) : 0;
  const experimentRoute = `${routeForModel(step.modelId)}?preset=${step.presetId}`;
  return (
    <article className="path-step-card" data-testid={`path-step-${step.modelId}`}>
      <div className="path-step-index">{(index + 1).toString().padStart(2, '0')}</div>
      <div className="path-step-main">
        <div className="path-step-head">
          <div>
            <span className="model-number">{step.modelId.toUpperCase()}</span>
            <h3>{simulation?.title ?? step.modelId}</h3>
          </div>
          <span className="status-pill status-ready">可运行</span>
        </div>
        <p>{step.concept}</p>
        <div className="path-step-presets">
          <span className="path-label">推荐预设</span>
          <Link className="chip-button" to={experimentRoute}>{step.presetLabel}</Link>
          {(step.extraPresetIds ?? []).map((presetId) => (
            <Link className="chip-button" to={`${routeForModel(step.modelId)}?preset=${presetId}`} key={presetId}>
              {presetId.replace(`${step.modelId}-`, '')}
            </Link>
          ))}
        </div>
        <div className="path-progress-row" aria-label={`${step.modelId} 本地练习记录`}>
          <span className="path-progress-label">本地作答 {attempted}/{total}</span>
          <span className="path-progress-track" aria-hidden="true"><span style={{ width: `${percent}%` }} /></span>
          <span className="path-progress-percent">{percent}%</span>
        </div>
        <div className="path-step-actions">
          <Link className="primary-button path-action" to={`/path/${path.id}/${step.modelId}`} data-testid={`path-lesson-${step.modelId}`}>
            <Icon name="book" size={16} />开始讲解
          </Link>
          <Link className="secondary-button path-action" to={experimentRoute} data-testid={`path-open-${step.modelId}`}>
            <Icon name="play" size={16} />打开实验
          </Link>
          <Link className="secondary-button path-action" to={`/practice?model=${step.modelId}`} data-testid={`path-practice-${step.modelId}`}>
            <Icon name="check" size={16} />配套练习
          </Link>
        </div>
      </div>
    </article>
  );
}

export function LearningPathPage() {
  const progress = useProgress();
  const totalAttempted = Object.values(progress.questions).filter((record) => record.attempts > 0).length;
  return (
    <div className="learning-path-page" data-testid="learning-path-page">
      <header className="path-hero">
        <div>
          <p className="eyebrow">知识路线 · 16 个真实模型</p>
          <h1>按知识顺序，从实验走到练习</h1>
          <p className="page-lede">
            两条路线只是推荐顺序，不是解锁门槛。每个模型都可以直接打开实验、阅读真实讲解、只筛选该模型的原创练习；
            本地完成度来自已有答题记录，不会伪造“已掌握”。
          </p>
        </div>
        <div className="path-hero-stats">
          <span>模型</span><strong>16</strong>
          <span>原创题</span><strong>{QUESTION_STATS.total}</strong>
          <span>本地已作答</span><strong>{totalAttempted}</strong>
        </div>
      </header>

      <div className="path-route-list">
        {LEARNING_PATHS.map((path) => (
          <section className="path-route" key={path.id} data-testid={`path-${path.id}`} aria-labelledby={`path-${path.id}-title`}>
            <div className="path-route-head">
              <div>
                <h2 id={`path-${path.id}-title`}>{path.title}</h2>
                <p>{path.description}</p>
                <p className="path-goal">{path.goal}</p>
              </div>
              <span className="path-route-count">{path.steps.length} 站</span>
            </div>
            <div className="path-step-list">
              {path.steps.map((step, index) => (
                <StepCard path={path} step={step} index={index} key={step.modelId} />
              ))}
            </div>
          </section>
        ))}
      </div>

      <section className="path-demo-section" aria-labelledby="path-demo-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">教师使用</p>
            <h2 id="path-demo-title">课堂演示路径</h2>
          </div>
          <p className="section-lede">直接串联 2–4 个已有实验预设；不复制模型，也不伪造跨模型状态。</p>
        </div>
        <div className="path-demo-grid">
          {DEMO_ROUTES.map((route) => (
            <article className="path-demo-card" key={route.id} data-testid={`demo-${route.id}`}>
              <h3>{route.title}</h3>
              <p>{route.description}</p>
              <div className="path-demo-links">
                {route.steps.map((step) => (
                  <Link key={`${route.id}-${step.modelId}`} to={`${routeForModel(step.modelId)}?preset=${step.presetId}`}>
                    {step.label}
                  </Link>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="boundary-note" aria-label="学习路线说明">
        <div className="boundary-icon"><Icon name="info" size={22} /></div>
        <div>
          <h2>路线不是完成度证明</h2>
          <p>
            “16 个模型齐备”只表示 16 个原始编号都有可运行页面与物理证据；真题授权、真实 iPad/Android 验收和公网 HTTPS 仍未完成。
            本地作答记录只保存在本机，可在“我的记录”中导出/导入。
          </p>
          <p><Link to="/progress">查看我的记录</Link> · <Link to="/practice">打开全部原创练习</Link></p>
        </div>
      </section>
    </div>
  );
}
