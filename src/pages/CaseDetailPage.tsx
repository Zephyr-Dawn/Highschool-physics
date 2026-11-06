import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { problemCaseById } from '../content/problemCases';
import { WholeProblemLab } from '../features/cases/wholeProblem/WholeProblemLab';
import { SIMULATIONS, routeForModel } from '../simulations/registry';
import {
  backupCaseScene,
  readCaseReturnContext,
  saveCaseReturnContext,
  loadCaseProgress,
  restoreCaseBackups,
  saveCaseProgress,
  type CaseProgressEntry,
  type CaseProgressState,
} from '../features/cases/caseSession';

const DIFFICULTY_LABEL = {
  basic: '基础',
  advanced: '提升',
  integrated: '综合',
} as const;

function defaultEntry(stageId: string): CaseProgressEntry {
  return {
    visitedStage: stageId,
    predictionSelected: null,
    predictionCorrect: null,
    solutionRevealed: false,
    checkpointSelected: null,
    checkpointCorrect: null,
    lastOpenedAt: new Date().toISOString(),
  };
}

export function CaseDetailPage() {
  const { caseId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const item = caseId ? problemCaseById(caseId) : undefined;
  const stageParam = searchParams.get('stage');
  const stageIndex = Math.max(0, item?.stages.findIndex((stage) => stage.id === stageParam) ?? 0);
  const stage = item?.stages[stageIndex] ?? item?.stages[0];
  const [progressState, setProgressState] = useState<CaseProgressState>(() => loadCaseProgress());
  const [predictionSelected, setPredictionSelected] = useState<number | null>(null);
  const [predictionChecked, setPredictionChecked] = useState(false);
  const [solutionRevealed, setSolutionRevealed] = useState(false);
  const [checkpointSelected, setCheckpointSelected] = useState<number | null>(null);
  const [checkpointChecked, setCheckpointChecked] = useState(false);
  const [teacherReveal, setTeacherReveal] = useState(false);
  const [restoreNotice, setRestoreNotice] = useState<string | null>(null);
  const [launchNotice, setLaunchNotice] = useState<string | null>(null);

  useEffect(() => {
    const restored = restoreCaseBackups();
    if (restored.length > 0) {
      setRestoreNotice(`已恢复进入案例实验前的个人场景：${restored.join(' / ')}。`);
    }
    if (caseId) {
      const context = readCaseReturnContext(caseId);
      if (context) {
        window.requestAnimationFrame(() => window.scrollTo({ top: context.scrollY, behavior: 'auto' }));
      }
    }
  }, [caseId]);

  useEffect(() => {
    if (!item) return;
    document.title = `${item.title} · 题目实验｜EM Physics Lab`;
  }, [item]);

  useEffect(() => {
    if (!item) return;
    setProgressState((previous) => {
      const entry = previous.cases[item.id] ?? defaultEntry(item.stages[0].id);
      const next: CaseProgressState = {
        version: 1,
        cases: {
          ...previous.cases,
          [item.id]: { ...entry, visitedStage: stage?.id ?? entry.visitedStage, lastOpenedAt: new Date().toISOString() },
        },
      };
      saveCaseProgress(next);
      return next;
    });
    const entry = loadCaseProgress().cases[item.id];
    setPredictionSelected(entry?.predictionSelected ?? null);
    setPredictionChecked(entry?.predictionCorrect !== null && entry?.predictionCorrect !== undefined);
    setSolutionRevealed(entry?.solutionRevealed ?? false);
    setCheckpointSelected(entry?.checkpointSelected ?? null);
    setCheckpointChecked(entry?.checkpointCorrect !== null && entry?.checkpointCorrect !== undefined);
    // Only reset answer state when the case changes, not on every stage navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId]);

  const entry = item ? progressState.cases[item.id] : undefined;
  const simulation = useMemo(
    () => (stage ? SIMULATIONS.find((candidate) => candidate.id === stage.modelId) : undefined),
    [stage],
  );

  const updateEntry = (patch: Partial<CaseProgressEntry>) => {
    if (!item) return;
    setProgressState((previous) => {
      const current = previous.cases[item.id] ?? defaultEntry(item.stages[0].id);
      const next: CaseProgressState = {
        version: 1,
        cases: {
          ...previous.cases,
          [item.id]: { ...current, ...patch, lastOpenedAt: new Date().toISOString() },
        },
      };
      saveCaseProgress(next);
      return next;
    });
  };

  if (!item || !stage || !simulation) {
    return (
      <div className="case-detail-page" data-testid="case-detail-missing">
        <h1>找不到这个题目实验</h1>
        <p>案例编号或实验阶段无效。</p>
        <Link className="secondary-button" to="/cases">返回题目实验列表</Link>
      </div>
    );
  }

  const showSolution = solutionRevealed || entry?.solutionRevealed === true || teacherReveal;
  const predictionCorrect = predictionSelected === item.prediction.correct;
  const checkpointCorrect = checkpointSelected === item.checkpoint.correct;

  const launch = (presetId: string, launchStageId = stage.id, label = '题目条件') => {
    backupCaseScene(stage.modelId);
    saveCaseReturnContext({ caseId: item.id, stageId: launchStageId, scrollY: window.scrollY });
    setLaunchNotice(`正在打开 ${simulation.shortTitle} · ${label}；返回题目时会恢复你进入前的个人场景。`);
    navigate(`${routeForModel(stage.modelId)}?preset=${presetId}&case=${item.id}&stage=${launchStageId}`);
  };

  return (
    <div className="case-detail-page" data-testid="case-detail">
      <nav className="path-breadcrumb" aria-label="面包屑">
        <Link to="/cases">题目实验</Link>
        <span>/</span>
        <span aria-current="page">{item.title}</span>
      </nav>

      <header className="case-detail-head">
        <div>
          <div className="case-badges">
            <span className="status-pill status-ready">原创 · 高考风格</span>
            <span className="status-pill">{DIFFICULTY_LABEL[item.difficulty]}</span>
            <span className="status-pill">不冒充真题</span>
          </div>
          <h1 data-testid="case-title">{item.title}</h1>
          <p className="page-lede">{item.subtitle}</p>
          <p className="case-provenance">
            来源：{item.provenance.sourceKind === 'original_case' ? '本项目原创' : '真题引用'} ·
            核验：{item.provenance.verification} · 权利：{item.provenance.rights}
          </p>
        </div>
        <button
          type="button"
          className={`secondary-button ${teacherReveal ? 'is-active' : ''}`}
          aria-pressed={teacherReveal}
          onClick={() => setTeacherReveal((value) => !value)}
          data-testid="case-teacher-toggle"
        >
          <Icon name="presentation" size={17} />{teacherReveal ? '关闭教师揭示' : '教师揭示答案'}
        </button>
      </header>

      {restoreNotice ? <p className="case-restore-notice" role="status" data-testid="case-return-notice">{restoreNotice}</p> : null}
      {launchNotice ? <p className="case-restore-notice" role="status" data-testid="case-launch-notice">{launchNotice}</p> : null}

      <WholeProblemLab key={item.id} item={item} teacherMode={teacherReveal} initialParts={entry?.parts} onPartsChange={(parts) => updateEntry({ parts })} />

      <p className="case-legacy-note" data-testid="case-legacy-note">
        以下为分阶段基础模型对照，只用于打开单个模型；整题连续仿真与逐问判题以上方工作台为准，不把模型跳转当作整题完成。
      </p>

      <nav className="case-stage-tabs" aria-label="案例阶段">
        {item.stages.map((candidate, index) => (
          <button
            key={candidate.id}
            type="button"
            className={`case-stage-tab ${candidate.id === stage.id ? 'is-active' : ''}`}
            aria-pressed={candidate.id === stage.id}
            onClick={() => {
              updateEntry({ visitedStage: candidate.id });
              navigate(`/cases/${item.id}?stage=${candidate.id}`, { replace: true });
            }}
            data-testid={`case-stage-${candidate.id}`}
          >
            <span>{index + 1}</span>{candidate.title}
          </button>
        ))}
      </nav>

      <div className="case-detail-grid">
        <section className="case-panel case-problem-panel" aria-labelledby="case-problem-title">
          <h2 id="case-problem-title">1 · 读题与预测</h2>
          <p className="case-stem" data-testid="case-stem">{item.stem}</p>
          <div className="case-question-block" data-testid="case-prediction">
            <h3>先预测，再看模拟</h3>
            <p>{item.prediction.question}</p>
            <div className="case-options" role="radiogroup" aria-label="案例预测题">
              {item.prediction.options.map((option, index) => (
                <label className={`case-option ${predictionSelected === index ? 'is-selected' : ''}`} key={option}>
                  <input
                    type="radio"
                    name={`prediction-${item.id}`}
                    checked={predictionSelected === index}
                    onChange={() => {
                      setPredictionSelected(index);
                      setPredictionChecked(false);
                      updateEntry({ predictionSelected: index, predictionCorrect: null });
                    }}
                  />
                  <span>{String.fromCharCode(65 + index)}. {option}</span>
                </label>
              ))}
            </div>
            <div className="case-action-row">
              <button
                type="button"
                className="secondary-button case-action"
                disabled={predictionSelected === null}
                onClick={() => {
                  setPredictionChecked(true);
                  updateEntry({ predictionSelected, predictionCorrect });
                }}
                data-testid="case-check-prediction"
              >
                检查预测
              </button>
              {predictionChecked && entry?.predictionCorrect !== null ? (
                <span className={`case-answer-status ${predictionCorrect ? 'is-correct' : 'is-wrong'}`}>
                  {predictionCorrect ? '正确。' : '再想想：'}{item.prediction.explain}
                </span>
              ) : null}
            </div>
          </div>
        </section>

        <section className="case-panel case-mapping-panel" aria-labelledby="case-mapping-title">
          <h2 id="case-mapping-title">2 · 建立模型</h2>
          <p>
            当前阶段：<strong>{stage.title}</strong> · 覆盖：<span className={`case-match case-match-${stage.modelMatch}`}>{stage.modelMatch}</span>
          </p>
          <p className="case-model-line">
            {stage.modelId.toUpperCase()} · {simulation.shortTitle} · 预设 <code>{stage.presetId}</code>
          </p>
          <div className="case-mapping-table" role="table" aria-label="题目变量到模型参数">
            <div className="case-mapping-row case-mapping-head" role="row">
              <span>题目符号</span><span>模型参数</span><span>单位</span><span>说明</span>
            </div>
            {stage.parameterMappings.map((mapping) => (
              <div className="case-mapping-row" role="row" key={`${mapping.questionSymbol}-${mapping.modelParameter}`}>
                <span>{mapping.questionSymbol}</span><span>{mapping.modelParameter}</span><span>{mapping.units}</span><span>{mapping.explanation}</span>
              </div>
            ))}
          </div>
          <div className="case-limits">
            <strong>模型边界</strong>
            <ul>{stage.limitations.map((limit) => <li key={limit}>{limit}</li>)}</ul>
          </div>
          <div className="case-action-row">
            <button type="button" className="primary-button case-action" onClick={() => launch(stage.presetId)} data-testid="case-open-experiment">
              <Icon name="play" size={17} />{stage.modelMatch === 'exact_model' ? '打开真实实验' : '打开阶段组件'}
            </button>
            <button type="button" className="secondary-button case-action" onClick={() => launch(stage.presetId, stage.id, '重置题目条件')} data-testid="case-reset-experiment">
              <Icon name="reset" size={17} />重置到题目条件
            </button>
          </div>
          <p className="case-return-hint">实验页顶部会出现“返回题目”；返回时自动恢复进入前的个人场景，不覆盖你的已保存配置。</p>
        </section>

        <section className="case-panel case-solution-panel" aria-labelledby="case-solution-title">
          <h2 id="case-solution-title">3 · 分阶段基础模型锚点（固定预设）</h2>
          <p>以下是基础模型固定预设的引擎锚点，只用于核对单个模型；整题变式后的答案以上方工作台重算为准。</p>
          <button
            type="button"
            className="secondary-button case-action"
            onClick={() => {
              setSolutionRevealed(true);
              updateEntry({ solutionRevealed: true });
            }}
            data-testid="case-reveal-solution"
          >
            <Icon name="bulb" size={17} />{showSolution ? '已展开推导' : '展开推导与期望值'}
          </button>
          {showSolution ? (
            <div className="case-solution-body" data-testid="case-solution">
              <ol className="case-reasoning">
                {item.reasoningSteps.map((step) => <li key={step}>{step}</li>)}
              </ol>
              <div className="case-expected" data-testid="case-expected">
                <h3>可核验结果</h3>
                <div className="case-expected-grid">
                  {Object.entries(stage.expected).map(([key, observable]) => (
                    <div className="case-expected-item" key={key}>
                      <span>{key}</span>
                      <strong>{observable.value} {observable.unit}</strong>
                      <small>容差 {observable.tolerance} {observable.unit}</small>
                    </div>
                  ))}
                </div>
              </div>
              <div className="case-verification">
                <strong>独立验算</strong>
                <p>{item.independentVerification}</p>
              </div>
              <div className="case-verification">
                <strong>量纲核对</strong>
                <p>{item.dimensionalCheck}</p>
              </div>
              <div className="case-limits">
                <strong>常见误区</strong>
                <ul>{item.commonMistakes.map((mistake) => <li key={mistake}>{mistake}</li>)}</ul>
              </div>
            </div>
          ) : null}
        </section>

        <section className="case-panel case-variation-panel" aria-labelledby="case-variation-title">
          <h2 id="case-variation-title">4 · 变式迁移</h2>
          <ul className="case-variation-list">
            {item.variations.map((variation) => (
              <li key={variation.title}>
                <strong>{variation.title}</strong>
                <p>{variation.detail}</p>
                {variation.presetId ? (
                  <button
                    type="button"
                    className="chip-button"
                    onClick={() => launch(variation.presetId!, stage.id, variation.title)}
                    data-testid={`case-variation-${variation.title}`}
                  >
                    载入此变式
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
          <div className="case-guiding">
            <strong>引导问题</strong>
            <ul>{item.guidingQuestions.map((question) => <li key={question}>{question}</li>)}</ul>
          </div>
        </section>

        <section className="case-panel case-check-panel" aria-labelledby="case-check-title">
          <h2 id="case-check-title">5 · 最终理解检查</h2>
          <p>{item.checkpoint.question}</p>
          <div className="case-options" role="radiogroup" aria-label="案例最终检查">
            {item.checkpoint.options.map((option, index) => (
              <label className={`case-option ${checkpointSelected === index ? 'is-selected' : ''}`} key={option}>
                <input
                  type="radio"
                  name={`checkpoint-${item.id}`}
                  checked={checkpointSelected === index}
                  onChange={() => {
                    setCheckpointSelected(index);
                    setCheckpointChecked(false);
                    updateEntry({ checkpointSelected: index, checkpointCorrect: null });
                  }}
                />
                <span>{String.fromCharCode(65 + index)}. {option}</span>
              </label>
            ))}
          </div>
          <button
            type="button"
            className="secondary-button case-action"
            disabled={checkpointSelected === null}
            onClick={() => {
              setCheckpointChecked(true);
              updateEntry({ checkpointSelected, checkpointCorrect });
            }}
            data-testid="case-check-checkpoint"
          >
            提交最终检查
          </button>
          {checkpointChecked && entry?.checkpointCorrect !== null ? (
            <p className={`case-answer-status ${checkpointCorrect ? 'is-correct' : 'is-wrong'}`}>
              {checkpointCorrect ? '正确。' : '再想想：'}{item.checkpoint.explain}
            </p>
          ) : null}
        </section>
      </div>

      <footer className="case-detail-footer">
        <Link className="secondary-button" to="/cases"><Icon name="chevronLeft" size={17} />返回题目实验列表</Link>
        <Link className="secondary-button" to="/device-check"><Icon name="target" size={17} />课堂设备检测</Link>
      </footer>
    </div>
  );
}
