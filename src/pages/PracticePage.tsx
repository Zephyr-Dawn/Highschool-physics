import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  DIFFICULTY_LABEL,
  MODULE_LABEL,
  type Difficulty,
  type ModuleId,
} from '../content/schema';
import { ALL_TAGS, QUESTIONS, questionById } from '../content/questions';
import { EXAM_REFERENCES } from '../content/examReferences';
import { QuestionCard } from '../features/practice/QuestionCard';
import { useProgress, progressSummary } from '../features/progress/progressStore';
import { routeForModel, SIMULATIONS } from '../simulations/registry';
import { Icon } from '../components/Icon';
import { QUESTION_STATS } from '../content/questionStats';

type ModuleFilter = 'all' | ModuleId;
type DifficultyFilter = 'all' | Difficulty;
type PracticeTab = 'original' | 'exams';

export function PracticePage() {
  const [searchParams] = useSearchParams();
  const qId = searchParams.get('q');
  const initialModel = searchParams.get('model');
  const initialModelId = SIMULATIONS.some((simulation) => simulation.id === initialModel) ? initialModel! : 'all';
  const [tab, setTab] = useState<PracticeTab>('original');
  const [modelFilter, setModelFilter] = useState(initialModelId);
  const [moduleFilter, setModuleFilter] = useState<ModuleFilter>(
    initialModel === 'particles' || initialModel === 'induction'
      ? initialModel
      : initialModel === 'p01' || initialModel === 'p03' || initialModel === 'p04' || initialModel === 'p05' || initialModel === 'p06' || initialModel === 'p07' || initialModel === 'p08'
        ? 'particles'
        : initialModel === 'i01' || initialModel === 'i02' || initialModel === 'i03' || initialModel === 'i04' || initialModel === 'i05' || initialModel === 'i06' || initialModel === 'i07' || initialModel === 'i08'
          ? 'induction'
          : 'all',
  );
  const [difficultyFilter, setDifficultyFilter] = useState<DifficultyFilter>('all');
  const [tagFilter, setTagFilter] = useState('all');
  const progress = useProgress();
  const summary = progressSummary(progress);
  const searchKey = searchParams.toString();
  const lastSearchKey = useRef<string | null>(null);

  useEffect(() => {
    if (lastSearchKey.current === searchKey) return;
    lastSearchKey.current = searchKey;
    const requested = searchParams.get('model');
    if (requested === null) {
      setModelFilter('all');
      setModuleFilter('all');
      return;
    }
    if (SIMULATIONS.some((simulation) => simulation.id === requested)) {
      setModelFilter(requested);
      setModuleFilter(requested.startsWith('p') ? 'particles' : 'induction');
    } else if (requested === 'particles' || requested === 'induction') {
      setModuleFilter(requested);
      setModelFilter('all');
    }
  }, [searchKey, searchParams]);

  useEffect(() => {
    const question = qId ? questionById(qId) : undefined;
    if (!question) return;
    setModuleFilter(question.module);
    setDifficultyFilter('all');
    setTagFilter('all');
    setTab('original');
    const timer = window.setTimeout(() => {
      document.getElementById(`question-${question.id}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [qId]);

  const filteredQuestions = useMemo(
    () =>
      QUESTIONS.filter((question) => {
        if (modelFilter !== 'all' && question.modelId !== modelFilter) return false;
        if (moduleFilter !== 'all' && question.module !== moduleFilter) return false;
        if (difficultyFilter !== 'all' && question.difficulty !== difficultyFilter) return false;
        if (tagFilter !== 'all' && !question.tags.includes(tagFilter)) return false;
        return true;
      }),
    [difficultyFilter, modelFilter, moduleFilter, tagFilter],
  );

  const resetFilters = () => {
    setModuleFilter('all');
    setDifficultyFilter('all');
    setTagFilter('all');
    setModelFilter('all');
  };

  return (
    <div className="practice-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">练习与真题索引</p>
          <h1>用原创题检验理解，用索引追踪真题</h1>
          <p className="page-lede">
            原创题答案在与仿真相同的物理规则下编写，并经过自动化题库校验与人工复核。真题只做合法外链索引，
            不转载题干、插图或未经核实的答案。
          </p>
        </div>
        <div className="practice-summary-card">
          <span>已完成题目</span>
          <strong>{summary.attempted} / {QUESTIONS.length}</strong>
          <span>当前正确率 {Math.round(summary.accuracy * 100)}% · 错题 {summary.wrong} 道</span>
        </div>
      </header>

      <div className="practice-tabs" role="tablist" aria-label="练习内容">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'original'}
          className="practice-tab"
          onClick={() => setTab('original')}
        >
          原创分层练习
          <span className="tab-count">{QUESTIONS.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'exams'}
          className="practice-tab"
          onClick={() => setTab('exams')}
        >
          真题索引（外链）
          <span className="tab-count">{EXAM_REFERENCES.length}</span>
        </button>
      </div>

      {tab === 'original' ? (
        <>
          <section className="filter-bar" aria-label="筛选题目">
            <div className="filter-group" aria-label="模块">
              <span className="filter-label">模块</span>
              {(
                [
                  ['all', '全部'],
                  ['particles', MODULE_LABEL.particles],
                  ['induction', MODULE_LABEL.induction],
                ] as Array<[ModuleFilter, string]>
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className="filter-chip"
                  aria-pressed={moduleFilter === value}
                  onClick={() => { setModuleFilter(value); setModelFilter('all'); }}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="filter-group" aria-label="难度">
              <span className="filter-label">难度</span>
              {(
                [
                  ['all', '全部'],
                  ['basic', DIFFICULTY_LABEL.basic],
                  ['intermediate', DIFFICULTY_LABEL.intermediate],
                  ['advanced', DIFFICULTY_LABEL.advanced],
                ] as Array<[DifficultyFilter, string]>
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className="filter-chip"
                  aria-pressed={difficultyFilter === value}
                  onClick={() => setDifficultyFilter(value)}
                >
                  {label}
                </button>
              ))}
            </div>
            <label className="filter-select">
              <span className="filter-label">模型</span>
              <select
                value={modelFilter}
                onChange={(event) => {
                  const next = event.target.value;
                  setModelFilter(next);
                  if (next === 'all') setModuleFilter('all');
                  else setModuleFilter(next.startsWith('p') ? 'particles' : 'induction');
                }}
                data-testid="practice-model-filter"
              >
                <option value="all">全部模型</option>
                {SIMULATIONS.map((simulation) => (
                  <option value={simulation.id} key={simulation.id}>
                    {simulation.id.toUpperCase()} · {simulation.shortTitle}（{QUESTION_STATS.byModel[simulation.id as keyof typeof QUESTION_STATS.byModel]} 题）
                  </option>
                ))}
              </select>
            </label>
            <label className="filter-select">
              <span className="filter-label">知识点</span>
              <select value={tagFilter} onChange={(event) => setTagFilter(event.target.value)}>
                <option value="all">全部知识点</option>
                {ALL_TAGS.map((tag) => (
                  <option value={tag} key={tag}>{tag}</option>
                ))}
              </select>
            </label>
            <button type="button" className="text-button filter-reset" onClick={resetFilters}>
              清除筛选
            </button>
          </section>

          <div className="results-summary">
            <span>筛选结果 <strong>{filteredQuestions.length}</strong> 道</span>
            <span>全部为原创题，可离线使用</span>
            <span>答题记录仅保存在本机</span>
          </div>

          <div className="practice-list">
            {filteredQuestions.map((question) => (
              <QuestionCard key={question.id} question={question} />
            ))}
            {filteredQuestions.length === 0 ? (
              <div className="empty-state">
                <Icon name="info" size={26} />
                <h2>没有匹配的题目</h2>
                <p>尝试放宽模块、难度或知识点筛选。</p>
                <button type="button" className="secondary-button" onClick={resetFilters}>
                  显示全部
                </button>
              </div>
            ) : null}
          </div>
        </>
      ) : (
        <section className="exam-section">
          <div className="callout callout-warning">
            <Icon name="info" size={18} />
            <div>
              <strong>真题尚未在线复核，仅作外链索引</strong>
              <p>
                以下年份、卷名、题号与考点来自项目需求文档中的第三方索引。当前执行环境未与权威原卷核对，
                页面不转载题干、图片、分问或答案，也不对链接内容作准确性保证。相关实验只对应基础能力，
                不代表已经复现整道真题。
              </p>
            </div>
          </div>
          <div className="exam-grid">
            {EXAM_REFERENCES.map((exam) => (
              <article className="exam-card" key={exam.id}>
                <div className="exam-card-head">
                  <span className="exam-year">{exam.year}</span>
                  <span className="status-pill">外链 · 未在线复核</span>
                </div>
                <h2>{exam.examName} · 第 {exam.questionNumber} 题</h2>
                <p className="exam-region">{exam.region}</p>
                <div className="tag-row">
                  {exam.topics.map((topic) => <span className="tag" key={topic}>{topic}</span>)}
                </div>
                <p className="exam-note">{exam.sourceNote}</p>
                <div className="exam-actions">
                  <a
                    className="secondary-button"
                    href={exam.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    打开来源链接
                    <Icon name="external" size={16} />
                  </a>
                  {exam.relatedModelId ? (
                    <Link
                      className="text-link"
                      to={`${routeForModel(exam.relatedModelId)}${
                        exam.relatedPresetId ? `?preset=${encodeURIComponent(exam.relatedPresetId)}` : ''
                      }`}
                    >
                      打开对应基础实验
                      <Icon name="arrowRight" size={16} />
                    </Link>
                  ) : (
                    <span className="muted-text">对应实验开发中</span>
                  )}
                </div>
              </article>
            ))}
          </div>
          <p className="exam-footnote">
            如需在课堂使用完整原题，请由辅导教师提供已获适当使用权限的试卷内容；本项目不会抓取付费题库、
            绕过登录或重新发布带版权图片。
          </p>
        </section>
      )}
    </div>
  );
}
