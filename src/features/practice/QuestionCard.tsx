import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  checkAnswer,
  DIFFICULTY_LABEL,
  emptyAnswer,
  formatAnswer,
  isAnswerComplete,
  MODULE_LABEL,
  type Question,
  type UserAnswer,
} from '../../content/schema';
import { Icon } from '../../components/Icon';
import { MathTex } from '../../components/MathTex';
import {
  recordAttempt,
  saveDraft,
  toggleFavorite,
  useProgress,
} from '../progress/progressStore';
import { routeForModel, simTitleForModel } from '../../simulations/registry';

interface QuestionCardProps {
  question: Question;
  compact?: boolean;
}

export function QuestionCard({ question, compact = false }: QuestionCardProps) {
  const progress = useProgress();
  const record = progress.questions[question.id];
  const [answer, setAnswer] = useState<UserAnswer>(
    () => record?.lastAnswer ?? emptyAnswer(question),
  );
  const [hintsShown, setHintsShown] = useState(() =>
    Math.min(record?.hintsUsed ?? 0, question.hints.length),
  );
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);
  const [showSolution, setShowSolution] = useState(false);

  const complete = isAnswerComplete(question, answer);
  const favorite = record?.favorite ?? false;
  const attempts = record?.attempts ?? 0;

  const updateAnswer = (next: UserAnswer) => {
    setAnswer(next);
    setFeedback(null);
    setShowSolution(false);
    saveDraft(question.id, next, hintsShown);
  };

  const revealNextHint = () => {
    if (hintsShown >= question.hints.length) return;
    const next = hintsShown + 1;
    setHintsShown(next);
    saveDraft(question.id, answer, next);
  };

  const submit = () => {
    if (!complete) return;
    const correct = checkAnswer(question, answer);
    recordAttempt(question.id, answer, correct, hintsShown);
    setFeedback(correct ? 'correct' : 'wrong');
    if (correct) setShowSolution(true);
    if (!correct && hintsShown < question.hints.length) {
      const next = hintsShown + 1;
      setHintsShown(next);
      saveDraft(question.id, answer, next);
    }
  };

  return (
    <article className={`question-card ${compact ? 'question-card-compact' : ''}`} id={`question-${question.id}`}>
      <header className="question-head">
        <div className="question-badges">
          <span className="badge badge-original">原创</span>
          <span className="badge">{DIFFICULTY_LABEL[question.difficulty]}</span>
          <span className="badge badge-quiet">{MODULE_LABEL[question.module]}</span>
          {question.verified ? <span className="badge badge-verified">已自检</span> : null}
        </div>
        <button
          type="button"
          className={`favorite-button ${favorite ? 'is-favorite' : ''}`}
          aria-pressed={favorite}
          aria-label={favorite ? '取消收藏' : '收藏本题'}
          onClick={() => toggleFavorite(question.id)}
        >
          <Icon name="heart" size={19} filled={favorite} />
          <span>{favorite ? '已收藏' : '收藏'}</span>
        </button>
      </header>

      <h3 className="question-title">{question.title}</h3>
      <p className="question-stem">{question.stem}</p>

      {question.type === 'single' || question.type === 'multiple' ? (
        <div
          className="question-options"
          role={question.type === 'single' ? 'radiogroup' : 'group'}
          aria-label={question.type === 'single' ? '单选选项' : '多选选项'}
        >
          {question.options.map((option, index) => {
            const selected =
              answer.kind === 'single'
                ? answer.value === index
                : answer.kind === 'multiple' && answer.value.includes(index);
            return (
              <button
                key={option}
                type="button"
                className={`question-option ${selected ? 'is-selected' : ''}`}
                role={question.type === 'single' ? 'radio' : undefined}
                aria-checked={question.type === 'single' ? selected : undefined}
                aria-pressed={question.type === 'multiple' ? selected : undefined}
                onClick={() => {
                  if (question.type === 'single') {
                    updateAnswer({ kind: 'single', value: index });
                  } else {
                    const current = answer.kind === 'multiple' ? answer.value : [];
                    const next = current.includes(index)
                      ? current.filter((value) => value !== index)
                      : [...current, index];
                    updateAnswer({ kind: 'multiple', value: next });
                  }
                }}
              >
                <span className="question-option-letter">{String.fromCharCode(65 + index)}</span>
                <span className="question-option-text">{option}</span>
                {selected ? <Icon name="check" size={18} /> : null}
              </button>
            );
          })}
        </div>
      ) : null}

      {question.type === 'numeric' ? (
        <div className="numeric-answer">
          <label>
            <span>你的答案</span>
            <div className="numeric-input-wrap">
              <input
                type="text"
                inputMode="decimal"
                value={answer.kind === 'numeric' ? answer.value : ''}
                onChange={(event) => updateAnswer({ kind: 'numeric', value: event.target.value })}
                aria-label="数值答案"
                placeholder="填写数值"
              />
              <span className="numeric-unit">{question.answer.unit}</span>
            </div>
          </label>
          <p className="numeric-tolerance">允许误差 ±{question.answer.tolerance} {question.answer.unit}，只填数值即可。</p>
        </div>
      ) : null}

      <div className="question-actions">
        <button
          type="button"
          className="primary-button"
          onClick={submit}
          disabled={!complete}
          data-testid={`check-${question.id}`}
        >
          检查答案
        </button>
        <button
          type="button"
          className="secondary-button"
          onClick={revealNextHint}
          disabled={hintsShown >= question.hints.length}
        >
          <Icon name="bulb" size={17} />
          {hintsShown === 0 ? '看提示' : `再提示 (${hintsShown}/${question.hints.length})`}
        </button>
        {attempts > 0 ? (
          <button
            type="button"
            className="text-button"
            onClick={() => setShowSolution((value) => !value)}
          >
            {showSolution ? '收起解析' : '查看解析'}
          </button>
        ) : null}
      </div>

      {hintsShown > 0 ? (
        <div className="hint-stack" aria-live="polite">
          <p className="hint-heading">
            <Icon name="bulb" size={17} />
            分层提示
          </p>
          {question.hints.slice(0, hintsShown).map((hint, index) => (
            <div className="hint-item" key={hint}>
              <span>{index + 1}</span>
              <p>{hint}</p>
            </div>
          ))}
        </div>
      ) : null}

      {feedback ? (
        <div
          className={`feedback ${feedback === 'correct' ? 'feedback-correct' : 'feedback-wrong'}`}
          role="status"
          aria-live="polite"
        >
          <Icon name={feedback === 'correct' ? 'check' : 'close'} size={19} />
          <div>
            <strong>{feedback === 'correct' ? '回答正确' : '还不正确'}</strong>
            <p>
              {feedback === 'correct'
                ? '解析已经展开。尝试回到仿真中观察同一状态，再读一遍推理。'
                : '先看已展开的提示，回到模型确认方程与符号，再修改答案。'}
            </p>
          </div>
        </div>
      ) : null}

      {showSolution ? (
        <section className="solution" aria-label="答案与解析">
          <div className="solution-head">
            <h4>答案与解析</h4>
            <span className="solution-answer">{formatAnswer(question)}</span>
          </div>
          <ol className="solution-steps">
            {question.solution.map((step, index) => (
              <li key={`${step.text}-${index}`}>
                <span className="step-number">{index + 1}</span>
                <div>
                  <p>{step.text}</p>
                  {step.formula ? (
                    <div className="formula-block formula-block-sm">
                      <MathTex block>{step.formula}</MathTex>
                    </div>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
          {question.commonMistakes?.length ? (
            <div className="common-mistakes">
              <strong>常见错误</strong>
              <ul>
                {question.commonMistakes.map((mistake) => (
                  <li key={mistake}>{mistake}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      <footer className="question-footer">
        <div className="question-footer-meta">
          <span>{question.tags.join(' · ')}</span>
          {question.licenseNote ? <span>{question.licenseNote}</span> : null}
          {attempts > 0 ? <span>已作答 {attempts} 次</span> : null}
        </div>
        {question.modelId ? (
          <Link
            className="question-model-link"
            to={`${routeForModel(question.modelId)}${
              question.presetId ? `?preset=${encodeURIComponent(question.presetId)}` : ''
            }`}
          >
            <Icon name="target" size={16} />
            进入实验验证 · {simTitleForModel(question.modelId)}
            <Icon name="arrowRight" size={16} />
          </Link>
        ) : null}
      </footer>
    </article>
  );
}
