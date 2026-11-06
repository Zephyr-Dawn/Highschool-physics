import { useState } from 'react';
import { usePersistentState } from '../../hooks/usePersistentState';
import { MathTex } from '../../components/MathTex';
import { Icon } from '../../components/Icon';
import type { LessonAnswerState, LessonProgress, LessonStep } from './types';

export interface LessonOverview {
  goals: string[];
  prerequisites: string[];
  misconceptions: string[];
}

interface LessonRunnerProps {
  steps: LessonStep[];
  storageKey: string;
  overview?: LessonOverview;
  onApplyPreset?: (presetId: string) => void;
  onGoPractice?: () => void;
}

const DEFAULT_STEP_STATE: LessonAnswerState = {
  selected: null,
  correct: null,
  hintShown: false,
  completed: false,
};

export function LessonRunner({ steps, storageKey, overview, onApplyPreset, onGoPractice }: LessonRunnerProps) {
  const [progress, setProgress] = usePersistentState<LessonProgress>(storageKey, {
    stepIndex: 0,
    answers: {},
  });
  const [appliedPreset, setAppliedPreset] = useState<string | null>(null);
  const stepIndex = Math.min(Math.max(progress.stepIndex, 0), steps.length - 1);
  const step = steps[stepIndex];
  const state = progress.answers[step.id] ?? DEFAULT_STEP_STATE;
  const isLast = stepIndex === steps.length - 1;
  const completedCount = steps.reduce((count, candidate, index) => {
    if (index < stepIndex) return count + 1;
    if (index > stepIndex) return count;
    const answer = progress.answers[candidate.id];
    if (!answer) return count;
    if (candidate.kind === 'predict') return count + (answer.correct === true ? 1 : 0);
    if (candidate.kind === 'task') return count + (answer.completed ? 1 : 0);
    return count + 1;
  }, 0);

  const updateState = (patch: Partial<LessonAnswerState>) => {
    setProgress((prev) => ({
      ...prev,
      answers: {
        ...prev.answers,
        [step.id]: { ...(prev.answers[step.id] ?? DEFAULT_STEP_STATE), ...patch },
      },
    }));
  };

  const goTo = (index: number) => {
    setProgress((prev) => ({ ...prev, stepIndex: Math.min(Math.max(index, 0), steps.length - 1) }));
    setAppliedPreset(null);
  };

  const canContinue = (() => {
    if (step.kind === 'predict') return state.correct === true;
    if (step.kind === 'task') return state.completed;
    return true;
  })();

  const resetLesson = () => {
    if (window.confirm('重新开始本节引导学习？已保存的练习作答不会删除。')) {
      setProgress({ stepIndex: 0, answers: {} });
      setAppliedPreset(null);
    }
  };

  return (
    <div className="lesson-runner">
      <div className="lesson-meta">
        <div className="lesson-dots" aria-hidden="true">
          {steps.map((candidate, index) => (
            <span
              key={candidate.id}
              className={`lesson-dot ${index === stepIndex ? 'is-current' : ''} ${
                index < stepIndex ? 'is-past' : ''
              }`}
            />
          ))}
        </div>
        <span className="lesson-count">
          第 {stepIndex + 1} / {steps.length} 步 · 已完成 {completedCount} 步
        </span>
        <button type="button" className="text-button" onClick={resetLesson}>
          重新学习
        </button>
      </div>

      {overview ? (
        <details className="lesson-overview">
          <summary>
            <Icon name="book" size={16} />
            本节目标 · 前置知识 · 常见误区
            <span className="overview-chevron" aria-hidden="true">⌄</span>
          </summary>
          <div className="overview-grid">
            <div>
              <h3>学习目标</h3>
              <ul>
                {overview.goals.map((goal) => <li key={goal}>{goal}</li>)}
              </ul>
            </div>
            <div>
              <h3>前置知识</h3>
              <ul>
                {overview.prerequisites.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
            <div>
              <h3>常见误区</h3>
              <ul>
                {overview.misconceptions.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
          </div>
        </details>
      ) : null}

      <article className="lesson-step">
        <p className="eyebrow">{step.kind === 'predict' ? '先想一想' : step.kind === 'task' ? '动手观察' : '知识讲解'}</p>
        <h2>{step.title}</h2>

        {step.kind === 'read' ? (
          <>
            {step.body.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
            {step.formula ? (
              <div className="formula-block">
                <MathTex block>{step.formula}</MathTex>
              </div>
            ) : null}
            {step.note ? (
              <div className="callout callout-note">
                <Icon name="info" size={18} />
                <p>{step.note}</p>
              </div>
            ) : null}
          </>
        ) : null}

        {step.kind === 'predict' ? (
          <>
            <p className="lesson-question">{step.question}</p>
            <div className="lesson-options" role="radiogroup" aria-label={step.title}>
              {step.options.map((option, index) => {
                const selected = state.selected === index;
                const isCorrect = state.correct === true && index === step.correct;
                const isWrongChoice = state.correct === false && selected;
                return (
                  <button
                    key={option}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    className={`lesson-option ${selected ? 'is-selected' : ''} ${
                      isCorrect ? 'is-correct' : ''
                    } ${isWrongChoice ? 'is-wrong' : ''}`}
                    disabled={state.correct === true}
                    onClick={() => updateState({ selected: index, correct: null })}
                  >
                    <span className="option-letter">{String.fromCharCode(65 + index)}</span>
                    <span>{option}</span>
                    {isCorrect ? <Icon name="check" size={19} /> : null}
                  </button>
                );
              })}
            </div>

            {state.correct === null ? (
              <div className="lesson-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => updateState({ hintShown: true })}
                >
                  <Icon name="bulb" size={17} />
                  查看提示
                </button>
                <button
                  type="button"
                  className="primary-button"
                  disabled={state.selected === null}
                  onClick={() => {
                    const correct = state.selected === step.correct;
                    updateState({ correct, hintShown: !correct || state.hintShown });
                  }}
                >
                  检查预测
                </button>
              </div>
            ) : null}

            {state.hintShown && state.correct !== true ? (
              <div className="callout callout-hint">
                <Icon name="bulb" size={18} />
                <div>
                  <strong>提示</strong>
                  <p>{step.hint}</p>
                </div>
              </div>
            ) : null}

            {state.correct === false ? (
              <div className="callout callout-wrong" role="status">
                <Icon name="close" size={18} />
                <div>
                  <strong>还不对，先别急着看答案</strong>
                  <p>回到公式或动画中确认方向与符号，再修改选项重新检查。</p>
                </div>
              </div>
            ) : null}

            {state.correct === true ? (
              <div className="callout callout-correct" role="status">
                <Icon name="check" size={18} />
                <div>
                  <strong>预测正确</strong>
                  <p>{step.explain}</p>
                  {step.formula ? <MathTex block>{step.formula}</MathTex> : null}
                </div>
              </div>
            ) : null}
          </>
        ) : null}

        {step.kind === 'task' ? (
          <>
            <p className="lesson-question">{step.instruction}</p>
            <ul className="observation-list">
              {step.observations.map((item, index) => (
                <li key={item}>
                  <span className="observation-number">{index + 1}</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            {step.presetId ? (
              <div className="lesson-actions">
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => {
                    onApplyPreset?.(step.presetId!);
                    setAppliedPreset(step.presetId ?? null);
                  }}
                >
                  <Icon name="sliders" size={17} />
                  {step.presetLabel ?? '载入演示参数'}
                </button>
                {appliedPreset === step.presetId ? (
                  <span className="inline-success" role="status">
                    <Icon name="check" size={16} />
                    已载入，按播放观察
                  </span>
                ) : null}
              </div>
            ) : null}
            <button
              type="button"
              className={`task-check ${state.completed ? 'is-done' : ''}`}
              aria-pressed={state.completed}
              onClick={() => updateState({ completed: !state.completed })}
            >
              <span className="task-check-box" aria-hidden="true">
                {state.completed ? <Icon name="check" size={15} /> : null}
              </span>
              我已完成观察并理解上述现象
            </button>
          </>
        ) : null}
      </article>

      <div className="lesson-footer">
        <button
          type="button"
          className="secondary-button"
          onClick={() => goTo(stepIndex - 1)}
          disabled={stepIndex === 0}
        >
          <Icon name="chevronLeft" size={18} />
          上一步
        </button>
        <div className="lesson-footer-right">
          {!canContinue && step.kind === 'predict' ? (
            <span className="lesson-hint-text">完成预测后可继续</span>
          ) : null}
          {!canContinue && step.kind === 'task' ? (
            <span className="lesson-hint-text">勾选观察任务后可继续</span>
          ) : null}
          {isLast ? (
            <button
              type="button"
              className="primary-button"
              disabled={!canContinue}
              onClick={() => onGoPractice?.()}
            >
              去做本节练习
              <Icon name="arrowRight" size={18} />
            </button>
          ) : (
            <button
              type="button"
              className="primary-button"
              disabled={!canContinue}
              onClick={() => goTo(stepIndex + 1)}
            >
              下一步
              <Icon name="chevronRight" size={18} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
