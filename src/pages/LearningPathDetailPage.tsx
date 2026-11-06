import { useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { LESSON_BY_MODEL } from '../content/pathLessonCatalog';
import { QUESTION_STATS } from '../content/questionStats';
import { pathById, stepForModel } from '../content/learningPath';
import { useProgress } from '../features/progress/progressStore';
import { LessonRunner } from '../features/lesson/LessonRunner';
import { SIMULATIONS, routeForModel } from '../simulations/registry';

export function LearningPathDetailPage() {
  const { pathId, modelId } = useParams();
  const navigate = useNavigate();
  const progress = useProgress();
  const path = pathId ? pathById(pathId) : undefined;
  const found = path && modelId ? stepForModel(path, modelId) : null;
  const simulation = modelId ? SIMULATIONS.find((item) => item.id === modelId) : undefined;
  const lesson = modelId && modelId in LESSON_BY_MODEL ? LESSON_BY_MODEL[modelId as keyof typeof LESSON_BY_MODEL] : null;

  useEffect(() => {
    if (simulation) document.title = `${simulation.shortTitle} · 学习路线｜EM Physics Lab`;
  }, [simulation]);

  if (!path || !found || !simulation || !lesson) {
    return (
      <div className="learning-path-detail" data-testid="path-detail-missing">
        <h1>找不到这条学习路线</h1>
        <p>路径或模型编号无效。</p>
        <Link className="secondary-button" to="/path">返回学习路线</Link>
      </div>
    );
  }

  const { step, index } = found;
  const previous = index > 0 ? path.steps[index - 1] : null;
  const next = index + 1 < path.steps.length ? path.steps[index + 1] : null;
  const attempted = Object.entries(progress.questions).filter(([id, record]) => (
    (id === modelId || id.startsWith(`${modelId}-`)) && record.attempts > 0
  )).length;
  const total = QUESTION_STATS.byModel[modelId as keyof typeof QUESTION_STATS.byModel];
  const experimentRoute = `${routeForModel(step.modelId)}?preset=${step.presetId}`;

  return (
    <div className="learning-path-detail" data-testid="path-detail-page">
      <nav className="path-breadcrumb" aria-label="面包屑">
        <Link to="/path">知识路线</Link>
        <span>/</span>
        <Link to="/path">{path.title}</Link>
        <span>/</span>
        <span aria-current="page">{step.modelId.toUpperCase()}</span>
      </nav>

      <header className="path-detail-head">
        <div>
          <p className="eyebrow">第 {index + 1} / {path.steps.length} 站 · {path.title}</p>
          <h1 data-testid="path-detail-title">{step.modelId.toUpperCase()} {simulation.title}</h1>
          <p className="page-lede">{step.concept}</p>
          <p className="path-detail-progress">本地作答 {attempted}/{total} 题 · 讲解进度与模型页面分开保存，不会覆盖。</p>
        </div>
        <div className="path-detail-actions">
          <Link className="primary-button" to={experimentRoute} data-testid="path-open-experiment">
            <Icon name="play" size={17} />打开实验
          </Link>
          <Link className="secondary-button" to={`/practice?model=${step.modelId}`} data-testid="path-open-practice">
            <Icon name="check" size={17} />只练本模型
          </Link>
        </div>
      </header>

      <section className="path-detail-presets" aria-label="本模型实验预设">
        <span className="path-label">推荐预设</span>
        <Link className="chip-button" to={experimentRoute}>{step.presetLabel}</Link>
        {(step.extraPresetIds ?? []).map((presetId) => (
          <Link className="chip-button" key={presetId} to={`${routeForModel(step.modelId)}?preset=${presetId}`}>
            {presetId.replace(`${step.modelId}-`, '')}
          </Link>
        ))}
      </section>

      <section className="path-lesson-panel" aria-label={`${simulation.shortTitle} 的真实分步讲解`}>
        <LessonRunner
          steps={lesson}
          storageKey={`emplab.path.${step.modelId}.lesson.v1`}
          onApplyPreset={(presetId) => navigate(`${routeForModel(step.modelId)}?preset=${presetId}`)}
          onGoPractice={() => navigate(`/practice?model=${step.modelId}`)}
        />
      </section>

      <nav className="path-prev-next" aria-label="路线前后模型">
        {previous ? (
          <Link className="secondary-button" to={`/path/${path.id}/${previous.modelId}`} data-testid="path-prev">
            <Icon name="chevronLeft" size={16} />上一站：{previous.modelId.toUpperCase()}
          </Link>
        ) : <span />}
        <Link className="secondary-button" to="/path"><Icon name="book" size={16} />返回路线</Link>
        {next ? (
          <Link className="secondary-button" to={`/path/${path.id}/${next.modelId}`} data-testid="path-next">
            下一站：{next.modelId.toUpperCase()}<Icon name="arrowRight" size={16} />
          </Link>
        ) : <span />}
      </nav>
    </div>
  );
}
