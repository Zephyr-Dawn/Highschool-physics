import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { MathTargetInput } from '../components/ParamSlider';
import { adapterSupportLabel } from '../features/problem-authoring/problemAdapterRegistry';
import { compileTeacherProblem } from '../features/problem-authoring/problemCompiler';
import {
  newTeacherPartId,
  teacherAnswerUnitSchema,
  teacherProblemDraftSchema,
  type DraftReviewStatus,
  type TeacherPart,
  type TeacherProblemDraft,
} from '../features/problem-authoring/teacherProblemSchema';
import {
  exportTeacherProblemPackage,
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

const DIFFICULTY_LABEL = {
  basic: '基础',
  advanced: '提升',
  integrated: '综合',
} as const;

const SOURCE_LABEL = {
  teacher_private: '教师私有',
  original_case: '项目原创',
  exam_reference: '真题引用',
} as const;

const ANSWER_UNITS = teacherAnswerUnitSchema.options;

function optionalText(value: string): string | undefined {
  return value.trim() ? value : undefined;
}

function newStepId(partIndex: number, stepIndex: number): string {
  return `step-${partIndex + 1}-${stepIndex + 1}-${Math.random().toString(36).slice(2, 7)}`;
}

function newStageId(index: number): string {
  return `stage-${index + 1}-${Math.random().toString(36).slice(2, 7)}`;
}

function emptyPart(index: number): TeacherPart {
  const id = newTeacherPartId(index + 1);
  return {
    id,
    prompt: '',
    targetQuantities: [],
    hints: ['', ''],
    derivationSteps: [1, 2, 3].map((step) => ({
      id: newStepId(index, step - 1),
      title: `第 ${step} 步`,
      explanation: '',
      formula: '',
    })),
    answerSpec: {
      quantity: '',
      unit: 'm',
      tolerance: { abs: 1e-6, rel: 1e-6 },
      dependsOn: [],
    },
    misconception: '',
    independentProofRef: '',
  };
}

function downloadText(text: string, filename: string): void {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function TeacherProblemEditorPage() {
  const { draftId } = useParams();
  const navigate = useNavigate();
  const loaded = useMemo(() => loadTeacherDrafts(), []);
  const sourceDraft = loaded.state.drafts.find((candidate) => candidate.id === draftId);
  const [draft, setDraft] = useState<TeacherProblemDraft | null>(sourceDraft ?? null);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(loaded.error);
  const compile = useMemo(() => (draft ? compileTeacherProblem(draft) : null), [draft]);

  useEffect(() => {
    if (sourceDraft) document.title = `编辑 ${sourceDraft.title || '教师题目'}｜EM Physics Lab`;
    try {
      const raw = window.sessionStorage.getItem('emplab.teacher.editorReturn.v1');
      if (!raw || !sourceDraft) return;
      const saved = JSON.parse(raw) as { draftId?: unknown; scrollY?: unknown };
      if (saved.draftId === sourceDraft.id && typeof saved.scrollY === 'number') {
        window.requestAnimationFrame(() => window.scrollTo({ top: saved.scrollY as number, behavior: 'auto' }));
      }
    } catch {
      // Session-only restoration is best effort and must never block editing.
    }
  }, [sourceDraft]);

  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    const linkGuard = (event: MouseEvent) => {
      const anchor = (event.target as HTMLElement | null)?.closest('a');
      if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return;
      if (!window.confirm('你有未保存的教师题目更改，确定离开吗？')) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener('beforeunload', handler);
    document.addEventListener('click', linkGuard, true);
    return () => {
      window.removeEventListener('beforeunload', handler);
      document.removeEventListener('click', linkGuard, true);
    };
  }, [dirty]);

  if (!draft || !compile) {
    return (
      <div className="teacher-page" data-testid="teacher-editor-missing">
        <h1>找不到这份教师草稿</h1>
        <p>{loaded.error ?? '草稿 ID 无效，或本地存储中的该条记录已损坏。'}</p>
        <Link className="secondary-button" to="/teacher/problems">返回教师题目列表</Link>
      </div>
    );
  }

  const updateDraft = (updater: (current: TeacherProblemDraft) => TeacherProblemDraft) => {
    setDraft((current) => {
      if (!current) return current;
      return { ...updater(current), updatedAt: new Date().toISOString() };
    });
    setDirty(true);
    setMessage(null);
  };

  const updatePart = (index: number, patch: Partial<TeacherPart>) => {
    updateDraft((current) => ({
      ...current,
      parts: current.parts.map((part, partIndex) => (partIndex === index ? { ...part, ...patch } : part)),
    }));
  };

  const updateStep = (partIndex: number, stepIndex: number, patch: Partial<TeacherPart['derivationSteps'][number]>) => {
    updateDraft((current) => ({
      ...current,
      parts: current.parts.map((part, index) => index !== partIndex
        ? part
        : {
            ...part,
            derivationSteps: part.derivationSteps.map((step, candidateIndex) =>
              candidateIndex === stepIndex ? { ...step, ...patch } : step),
          }),
    }));
  };

  const save = (successMessage = '草稿已保存到本机；建议导出 JSON 备份。'): boolean => {
    const parsed = teacherProblemDraftSchema.safeParse(draft);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      setError(`保存被拒绝：${first.path.join('.') || '根对象'} ${first.message}`);
      return false;
    }
    const saved = upsertTeacherDraft(parsed.data);
    if (!saved.ok) {
      setError(saved.error);
      return false;
    }
    setDraft(parsed.data);
    setDirty(false);
    setError(null);
    setMessage(successMessage);
    return true;
  };

  const saveAndPreview = () => {
    if (!compile.item) {
      setError('当前草稿仍有阻断预览的检查项。请查看下方“物理与内容检查”。');
      return;
    }
    if (!save('已保存，正在打开学生视图预览。')) return;
    try {
      window.sessionStorage.setItem(
        'emplab.teacher.editorReturn.v1',
        JSON.stringify({ draftId: draft.id, scrollY: window.scrollY }),
      );
    } catch {
      // Ignore session storage limits; navigation still proceeds.
    }
    navigate(`/teacher/problems/${draft.id}/preview`);
  };

  const handleExport = () => {
    try {
      downloadText(exportTeacherProblemPackage(draft), teacherPackageFilename(draft));
      setMessage('已生成私有题包下载。');
      setError(null);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : '题包导出失败。');
    }
  };

  const provenance = draft.provenance;
  const scenario = draft.scenario;
  const unitOptionsFor = (quantity: string) => {
    const observed = compile.observableOptions.find((option) => option.key === quantity);
    if (observed) return [observed.unit];
    return ANSWER_UNITS;
  };

  return (
    <div className="teacher-page teacher-editor-page" data-testid="teacher-editor">
      <nav className="path-breadcrumb" aria-label="面包屑">
        <Link to="/teacher/problems" onClick={(event) => { if (dirty && !window.confirm('有未保存更改，仍要离开吗？')) event.preventDefault(); }}>
          教师题目
        </Link>
        <span>/</span>
        <span aria-current="page">{draft.title || '未命名教师题目'}</span>
      </nav>

      <header className="teacher-editor-head">
        <div>
          <p className="eyebrow">教师题目编辑器 · 本机私有</p>
          <h1>{draft.title || '未命名教师题目'}</h1>
          <div className="teacher-boundary-row">
            <span className={`teacher-status is-${compile.status}`} data-testid="teacher-editor-status">{STATUS_LABEL[compile.status]}</span>
            <span className="status-pill">{SOURCE_LABEL[provenance.kind]}</span>
            <span className="status-pill">核验：{provenance.sourceReview}</span>
            <span className="status-pill">权利：{provenance.rights}</span>
            {dirty ? <span className="status-pill teacher-unsaved" data-testid="teacher-unsaved">有未保存更改</span> : null}
          </div>
          <p className="teacher-source-warning">本机教师草稿，非官方真题。仿真通过不会自动改变来源核验或公开转载权利。</p>
        </div>
        <div className="teacher-editor-actions">
          <button type="button" className="secondary-button" onClick={() => save()} data-testid="teacher-save">保存</button>
          <button type="button" className="primary-button" onClick={saveAndPreview} disabled={!compile.item} data-testid="teacher-save-preview">
            <Icon name="play" size={16} />保存并预览
          </button>
          <button type="button" className="secondary-button" onClick={handleExport} data-testid="teacher-editor-export">
            <Icon name="download" size={16} />导出
          </button>
        </div>
      </header>

      {error ? <p className="teacher-alert is-error" role="alert" data-testid="teacher-editor-error">{error}</p> : null}
      {message ? <p className="teacher-alert" role="status" data-testid="teacher-editor-notice">{message}</p> : null}

      <div className="teacher-editor-grid">
        <div className="teacher-editor-main">
          <section className="case-panel" aria-labelledby="teacher-content-title">
            <div className="section-heading">
              <div><p className="eyebrow">内容层</p><h2 id="teacher-content-title">题干与小问</h2></div>
              <p className="section-lede">文本按纯文本渲染；公式使用可信数学记号，不接收任意 HTML 或脚本。</p>
            </div>
            <div className="teacher-form-grid">
              <label className="teacher-field teacher-field-wide">
                <span>题目名称</span>
                <input
                  value={draft.title}
                  maxLength={160}
                  onChange={(event) => updateDraft((current) => ({ ...current, title: event.target.value }))}
                  data-testid="teacher-title"
                />
              </label>
              <label className="teacher-field">
                <span>副标题</span>
                <input
                  value={draft.subtitle}
                  maxLength={300}
                  onChange={(event) => updateDraft((current) => ({ ...current, subtitle: event.target.value }))}
                  data-testid="teacher-subtitle"
                />
              </label>
              <label className="teacher-field">
                <span>难度</span>
                <select
                  value={draft.difficulty}
                  onChange={(event) => updateDraft((current) => ({ ...current, difficulty: event.target.value as TeacherProblemDraft['difficulty'] }))}
                >
                  {Object.entries(DIFFICULTY_LABEL).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
                </select>
              </label>
              <label className="teacher-field teacher-field-wide">
                <span>知识点（逗号分隔）</span>
                <input
                  value={draft.topicTags.join('，')}
                  onChange={(event) => updateDraft((current) => ({
                    ...current,
                    topicTags: event.target.value.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean),
                  }))}
                />
              </label>
              <label className="teacher-field teacher-field-wide">
                <span>题干</span>
                <textarea
                  value={draft.stem}
                  rows={5}
                  maxLength={8000}
                  onChange={(event) => updateDraft((current) => ({ ...current, stem: event.target.value }))}
                  data-testid="teacher-stem"
                />
              </label>
            </div>

            <div className="teacher-parts-head">
              <h3>逐问解析与答案绑定</h3>
              <button
                type="button"
                className="secondary-button"
                onClick={() => updateDraft((current) => ({ ...current, parts: [...current.parts, emptyPart(current.parts.length)] }))}
                data-testid="teacher-add-part"
              >
                <Icon name="plus" size={16} />新增小问
              </button>
            </div>

            {draft.parts.length === 0 ? (
              <p className="teacher-empty-inline">尚未添加小问。完整题至少需要 3 个小问才能标记为仿真已验证。</p>
            ) : null}

            {draft.parts.map((part, partIndex) => {
              const binding = compile.item?.parts.find((item) => item.id === part.id);
              const baseline = compile.model?.answers[part.answerSpec.quantity]?.value ?? null;
              return (
                <details className="teacher-part-editor" key={part.id} open data-testid={`teacher-part-editor-${part.id}`}>
                  <summary>
                    <span>{String.fromCharCode(97 + partIndex)}. {part.prompt || '未命名小问'}</span>
                    <span className="teacher-part-summary-actions">
                      {baseline !== null ? `${baseline.toPrecision(6)} ${part.answerSpec.unit}` : '未绑定答案'}
                    </span>
                  </summary>
                  <div className="teacher-part-toolbar">
                    <button type="button" className="chip-button" disabled={partIndex === 0} onClick={() => updateDraft((current) => {
                      const parts = [...current.parts];
                      [parts[partIndex - 1], parts[partIndex]] = [parts[partIndex], parts[partIndex - 1]];
                      return { ...current, parts };
                    })}>上移</button>
                    <button type="button" className="chip-button" disabled={partIndex === draft.parts.length - 1} onClick={() => updateDraft((current) => {
                      const parts = [...current.parts];
                      [parts[partIndex + 1], parts[partIndex]] = [parts[partIndex], parts[partIndex + 1]];
                      return { ...current, parts };
                    })}>下移</button>
                    <button type="button" className="chip-button is-danger" onClick={() => {
                      if (window.confirm(`删除小问 ${part.id}？`)) {
                        updateDraft((current) => ({ ...current, parts: current.parts.filter((_, index) => index !== partIndex) }));
                      }
                    }} data-testid={`teacher-remove-part-${part.id}`}>删除小问</button>
                  </div>
                  <div className="teacher-form-grid">
                    <label className="teacher-field teacher-field-wide">
                      <span>小问题干</span>
                      <textarea
                        rows={3}
                        value={part.prompt}
                        maxLength={3000}
                        onChange={(event) => updatePart(partIndex, { prompt: event.target.value })}
                        data-testid={`teacher-part-prompt-${part.id}`}
                      />
                    </label>
                    <label className="teacher-field teacher-field-wide">
                      <span>目标量（逗号分隔）</span>
                      <input
                        value={part.targetQuantities.join('，')}
                        onChange={(event) => updatePart(partIndex, {
                          targetQuantities: event.target.value.split(/[,，]/).map((value) => value.trim()).filter(Boolean),
                        })}
                      />
                    </label>
                    <label className="teacher-field">
                      <span>绑定观测量</span>
                      <select
                        value={part.answerSpec.quantity}
                        onChange={(event) => {
                          const quantity = event.target.value;
                          const observed = compile.observableOptions.find((option) => option.key === quantity);
                          updatePart(partIndex, {
                            answerSpec: {
                              ...part.answerSpec,
                              quantity,
                              ...(observed ? { unit: observed.unit as typeof part.answerSpec.unit } : {}),
                            },
                            targetQuantities: [...new Set([...part.targetQuantities, quantity].filter(Boolean))],
                          });
                        }}
                        data-testid={`teacher-part-observable-${part.id}`}
                      >
                        <option value="">选择求解器观测量</option>
                        {compile.observableOptions.map((option) => (
                          <option key={option.key} value={option.key}>{option.label}（{option.unit}）</option>
                        ))}
                      </select>
                    </label>
                    <label className="teacher-field">
                      <span>答案单位（随观测量）</span>
                      <select
                        value={part.answerSpec.unit}
                        onChange={(event) => updatePart(partIndex, { answerSpec: { ...part.answerSpec, unit: event.target.value as typeof part.answerSpec.unit } })}
                        data-testid={`teacher-part-unit-${part.id}`}
                      >
                        {unitOptionsFor(part.answerSpec.quantity).map((unit) => <option value={unit} key={unit}>{unit}</option>)}
                      </select>
                    </label>
                    <label className="teacher-field">
                      <span>绝对容差</span>
                      <input type="number" min={1e-12} step={1e-9} value={part.answerSpec.tolerance.abs} onChange={(event) => updatePart(partIndex, {
                        answerSpec: { ...part.answerSpec, tolerance: { ...part.answerSpec.tolerance, abs: Number(event.target.value) || 1e-12 } },
                      })} />
                    </label>
                    <label className="teacher-field">
                      <span>相对容差</span>
                      <input type="number" min={1e-12} max={0.2} step={1e-9} value={part.answerSpec.tolerance.rel} onChange={(event) => updatePart(partIndex, {
                        answerSpec: { ...part.answerSpec, tolerance: { ...part.answerSpec.tolerance, rel: Number(event.target.value) || 1e-12 } },
                      })} />
                    </label>
                    <label className="teacher-field teacher-field-wide">
                      <span>两层提示（每行一条，至少 2 条）</span>
                      <textarea
                        rows={3}
                        value={part.hints.join('\n')}
                        onChange={(event) => updatePart(partIndex, { hints: event.target.value.split('\n') })}
                        data-testid={`teacher-part-hints-${part.id}`}
                      />
                    </label>
                    <label className="teacher-field teacher-field-wide">
                      <span>常见误区</span>
                      <textarea rows={2} value={part.misconception} maxLength={2000} onChange={(event) => updatePart(partIndex, { misconception: event.target.value })} />
                    </label>
                    <label className="teacher-field teacher-field-wide">
                      <span>独立验算依据</span>
                      <textarea rows={2} value={part.independentProofRef} maxLength={2000} onChange={(event) => updatePart(partIndex, { independentProofRef: event.target.value })} />
                    </label>
                  </div>

                  <div className="teacher-derivations-head">
                    <strong>推导步骤</strong>
                    <button type="button" className="chip-button" onClick={() => updatePart(partIndex, {
                      derivationSteps: [...part.derivationSteps, {
                        id: newStepId(partIndex, part.derivationSteps.length),
                        title: '',
                        explanation: '',
                        formula: '',
                      }],
                    })}>新增步骤</button>
                  </div>
                  {part.derivationSteps.map((step, stepIndex) => (
                    <article className="teacher-step-editor" key={step.id}>
                      <div className="teacher-form-grid">
                        <label className="teacher-field">
                          <span>步骤标题</span>
                          <input value={step.title} onChange={(event) => updateStep(partIndex, stepIndex, { title: event.target.value })} />
                        </label>
                        <label className="teacher-field">
                          <span>引用事件 ID（可选）</span>
                          <input value={step.referenceEventId ?? ''} onChange={(event) => updateStep(partIndex, stepIndex, { referenceEventId: optionalText(event.target.value) })} list="teacher-event-ids" />
                        </label>
                        <label className="teacher-field teacher-field-wide">
                          <span>推导说明</span>
                          <textarea rows={2} value={step.explanation} onChange={(event) => updateStep(partIndex, stepIndex, { explanation: event.target.value })} />
                        </label>
                        <label className="teacher-field teacher-field-wide">
                          <span>公式（KaTeX 安全记号）</span>
                          <input value={step.formula} onChange={(event) => updateStep(partIndex, stepIndex, { formula: event.target.value })} />
                        </label>
                      </div>
                      <button type="button" className="chip-button is-danger" onClick={() => updatePart(partIndex, {
                        derivationSteps: part.derivationSteps.filter((_, index) => index !== stepIndex),
                      })}>删除步骤</button>
                    </article>
                  ))}
                  {binding ? (
                    <p className="teacher-binding-ok" data-testid={`teacher-binding-${part.id}`}>
                      已绑定当前求解器观测量；标准值 {binding.answerSpec.baselineValue.toPrecision(8)} {binding.answerSpec.unit}。
                      任何变式改动后，判题会按当前参数重新求解。
                    </p>
                  ) : (
                    <p className="teacher-binding-warn">尚未通过答案绑定检查。请选择观测量并补齐至少 2 条提示、3 个推导步骤、误区和验算依据。</p>
                  )}
                </details>
              );
            })}
          </section>

          <section className="case-panel" aria-labelledby="teacher-physics-title">
            <div className="section-heading">
              <div><p className="eyebrow">物理层 · 白名单</p><h2 id="teacher-physics-title">阶段与参数变式</h2></div>
              <span className="status-pill">{adapterSupportLabel(compile.adapter?.support ?? 'unsupported')}</span>
            </div>
            <p className="teacher-physics-engine">
              适配器：<code>{scenario.adapterId}</code> · {compile.adapter?.engine ?? '未知'}
            </p>
            <p className="teacher-limitations">
              {compile.adapter?.limitations.join('；') ?? '未注册适配器不允许运行。'}
            </p>
            <label className="teacher-field teacher-field-wide">
              <span>舞台坐标与时间说明</span>
              <textarea
                rows={3}
                value={scenario.originDescription}
                onChange={(event) => updateDraft((current) => ({
                  ...current,
                  scenario: { ...current.scenario, originDescription: event.target.value },
                }))}
              />
            </label>
            <label className="teacher-field teacher-field-wide">
              <span>教师提示（每行一条）</span>
              <textarea
                rows={2}
                value={scenario.teacherAnnotations.join('\n')}
                onChange={(event) => updateDraft((current) => ({
                  ...current,
                  scenario: { ...current.scenario, teacherAnnotations: event.target.value.split('\n') },
                }))}
              />
            </label>
            <div className="teacher-parts-head">
              <h3>物理阶段</h3>
              <button type="button" className="chip-button" onClick={() => updateDraft((current) => ({
                ...current,
                scenario: {
                  ...current.scenario,
                  physicalStages: [...current.scenario.physicalStages, {
                    id: newStageId(current.scenario.physicalStages.length),
                    title: '',
                    limitations: [],
                  }],
                },
              }))}>新增阶段</button>
            </div>
            {scenario.physicalStages.map((stage, index) => (
              <div className="teacher-stage-row" key={stage.id}>
                <label className="teacher-field">
                  <span>阶段 {index + 1} 标题</span>
                  <input value={stage.title} onChange={(event) => updateDraft((current) => ({
                    ...current,
                    scenario: {
                      ...current.scenario,
                      physicalStages: current.scenario.physicalStages.map((candidate) =>
                        candidate.id === stage.id ? { ...candidate, title: event.target.value } : candidate),
                    },
                  }))} />
                </label>
                <label className="teacher-field">
                  <span>起始事件 ID</span>
                  <input value={stage.startEventId ?? ''} list="teacher-event-ids" onChange={(event) => updateDraft((current) => ({
                    ...current,
                    scenario: {
                      ...current.scenario,
                      physicalStages: current.scenario.physicalStages.map((candidate) =>
                        candidate.id === stage.id ? { ...candidate, startEventId: optionalText(event.target.value) } : candidate),
                    },
                  }))} />
                </label>
                <label className="teacher-field">
                  <span>结束事件 ID</span>
                  <input value={stage.endEventId ?? ''} list="teacher-event-ids" onChange={(event) => updateDraft((current) => ({
                    ...current,
                    scenario: {
                      ...current.scenario,
                      physicalStages: current.scenario.physicalStages.map((candidate) =>
                        candidate.id === stage.id ? { ...candidate, endEventId: optionalText(event.target.value) } : candidate),
                    },
                  }))} />
                </label>
                <label className="teacher-field teacher-field-wide">
                  <span>阶段限制（每行一条）</span>
                  <textarea rows={2} value={stage.limitations.join('\n')} onChange={(event) => updateDraft((current) => ({
                    ...current,
                    scenario: {
                      ...current.scenario,
                      physicalStages: current.scenario.physicalStages.map((candidate) =>
                        candidate.id === stage.id ? { ...candidate, limitations: event.target.value.split('\n') } : candidate),
                    },
                  }))} />
                </label>
                <button type="button" className="chip-button is-danger" onClick={() => updateDraft((current) => ({
                  ...current,
                  scenario: {
                    ...current.scenario,
                    physicalStages: current.scenario.physicalStages.filter((candidate) => candidate.id !== stage.id),
                  },
                }))}>删除阶段</button>
              </div>
            ))}
            <datalist id="teacher-event-ids">
              {(compile.model?.events ?? []).map((event) => <option value={event.id} key={event.id}>{event.kind} · {event.label}</option>)}
            </datalist>

            <div className="teacher-parts-head">
              <h3>参数变式</h3>
              <span className="teacher-muted">只允许适配器注册的参数；修改后整题与逐问答案重新求解。</span>
            </div>
            {scenario.variations.map((variation) => (
              <div className="teacher-variation-row" key={variation.id}>
                <label className="teacher-field">
                  <span>显示名称</span>
                  <input value={variation.label} onChange={(event) => updateDraft((current) => ({
                    ...current,
                    scenario: {
                      ...current.scenario,
                      variations: current.scenario.variations.map((candidate) =>
                        candidate.id === variation.id ? { ...candidate, label: event.target.value } : candidate),
                    },
                  }))} />
                </label>
                <code>{variation.parameterKey}</code>
                <MathTargetInput
                  label={`${variation.label} 标准值`}
                  value={variation.baseValue}
                  unit={variation.unit}
                  onCommit={(value) => updateDraft((current) => ({
                    ...current,
                    scenario: {
                      ...current.scenario,
                      variations: current.scenario.variations.map((candidate) =>
                        candidate.id === variation.id ? { ...candidate, baseValue: value } : candidate),
                    },
                  }))}
                  testId={`teacher-variation-base-${variation.parameterKey}`}
                />
                <label className="teacher-field">
                  <span>最小</span>
                  <input type="number" value={variation.min} onChange={(event) => updateDraft((current) => ({
                    ...current,
                    scenario: {
                      ...current.scenario,
                      variations: current.scenario.variations.map((candidate) =>
                        candidate.id === variation.id ? { ...candidate, min: Number(event.target.value) } : candidate),
                    },
                  }))} />
                </label>
                <label className="teacher-field">
                  <span>最大</span>
                  <input type="number" value={variation.max} onChange={(event) => updateDraft((current) => ({
                    ...current,
                    scenario: {
                      ...current.scenario,
                      variations: current.scenario.variations.map((candidate) =>
                        candidate.id === variation.id ? { ...candidate, max: Number(event.target.value) } : candidate),
                    },
                  }))} />
                </label>
                <label className="teacher-field">
                  <span>步长</span>
                  <input type="number" min={1e-9} value={variation.step} onChange={(event) => updateDraft((current) => ({
                    ...current,
                    scenario: {
                      ...current.scenario,
                      variations: current.scenario.variations.map((candidate) =>
                        candidate.id === variation.id ? { ...candidate, step: Number(event.target.value) } : candidate),
                    },
                  }))} />
                </label>
              </div>
            ))}
          </section>
        </div>

        <aside className="teacher-editor-side">
          <section className="case-panel" aria-labelledby="teacher-provenance-title">
            <h2 id="teacher-provenance-title">来源、核验与权利</h2>
            <p className="teacher-muted">两个独立字段：来源核验只说明资料身份；转载权利说明是否可公开使用。</p>
            <label className="teacher-field">
              <span>来源类型</span>
              <select value={provenance.kind} onChange={(event) => updateDraft((current) => ({
                ...current,
                provenance: { ...current.provenance, kind: event.target.value as typeof current.provenance.kind },
              }))} data-testid="teacher-provenance-kind">
                <option value="teacher_private">教师私有（非真题）</option>
                <option value="original_case">项目原创</option>
                <option value="exam_reference">真题引用</option>
              </select>
            </label>
            <label className="teacher-field">
              <span>来源核验（教师声明）</span>
              <select value={provenance.sourceReview} onChange={(event) => updateDraft((current) => ({
                ...current,
                provenance: { ...current.provenance, sourceReview: event.target.value as typeof current.provenance.sourceReview },
              }))}>
                {['unverified', 'metadata_verified', 'paper_and_solution_verified'].map((value) => <option value={value} key={value}>{value}</option>)}
              </select>
            </label>
            <label className="teacher-field">
              <span>公开转载权利</span>
              <select value={provenance.rights} onChange={(event) => updateDraft((current) => ({
                ...current,
                provenance: { ...current.provenance, rights: event.target.value as typeof current.provenance.rights },
              }))} data-testid="teacher-provenance-rights">
                {['unknown', 'link_only', 'permission_granted', 'original'].map((value) => <option value={value} key={value}>{value}</option>)}
              </select>
            </label>
            <label className="teacher-field">
              <span>来源链接（http/https）</span>
              <input value={provenance.sourceUrl ?? ''} onChange={(event) => updateDraft((current) => ({
                ...current,
                provenance: { ...current.provenance, sourceUrl: optionalText(event.target.value) },
              }))} placeholder="https://…" />
            </label>
            <div className="teacher-form-grid">
              <label className="teacher-field">
                <span>年份</span>
                <input type="number" min={1900} max={2200} value={provenance.examYear ?? ''} onChange={(event) => updateDraft((current) => ({
                  ...current,
                  provenance: { ...current.provenance, examYear: event.target.value ? Number(event.target.value) : undefined },
                }))} />
              </label>
              <label className="teacher-field">
                <span>题号</span>
                <input value={provenance.questionNumber ?? ''} maxLength={40} onChange={(event) => updateDraft((current) => ({
                  ...current,
                  provenance: { ...current.provenance, questionNumber: optionalText(event.target.value) },
                }))} />
              </label>
              <label className="teacher-field teacher-field-wide">
                <span>卷名</span>
                <input value={provenance.paperName ?? ''} maxLength={200} onChange={(event) => updateDraft((current) => ({
                  ...current,
                  provenance: { ...current.provenance, paperName: optionalText(event.target.value) },
                }))} />
              </label>
              <label className="teacher-field teacher-field-wide">
                <span>来源出版方</span>
                <input value={provenance.sourcePublisher ?? ''} maxLength={200} onChange={(event) => updateDraft((current) => ({
                  ...current,
                  provenance: { ...current.provenance, sourcePublisher: optionalText(event.target.value) },
                }))} />
              </label>
            </div>
            <label className="teacher-field">
              <span>核验证据</span>
              <textarea rows={2} value={provenance.reviewEvidence ?? ''} onChange={(event) => updateDraft((current) => ({
                ...current,
                provenance: { ...current.provenance, reviewEvidence: optionalText(event.target.value) },
              }))} />
            </label>
            <label className="teacher-field">
              <span>权利依据</span>
              <textarea rows={2} value={provenance.rightsEvidence ?? ''} onChange={(event) => updateDraft((current) => ({
                ...current,
                provenance: { ...current.provenance, rightsEvidence: optionalText(event.target.value) },
              }))} />
            </label>
            <label className="teacher-field">
              <span>备注</span>
              <textarea rows={2} value={provenance.reviewNotes ?? ''} onChange={(event) => updateDraft((current) => ({
                ...current,
                provenance: { ...current.provenance, reviewNotes: optionalText(event.target.value) },
              }))} />
            </label>
            {provenance.kind === 'exam_reference' && provenance.rights !== 'permission_granted' ? (
              <p className="teacher-alert is-warning">未记录公开转载许可：只能本机预览，不得对外发布题面、图片或官方解析。</p>
            ) : null}
          </section>

          <section className="case-panel teacher-check-panel" aria-labelledby="teacher-check-title">
            <div className="teacher-check-head">
              <h2 id="teacher-check-title">物理与内容检查</h2>
              <span className={`teacher-status is-${compile.status}`}>{STATUS_LABEL[compile.status]}</span>
            </div>
            <p className="teacher-muted">
              验证状态来自当前引擎实时构建，不是题包内的自述；来源与权利状态不会因仿真通过而改变。
            </p>
            <ul className="teacher-check-list">
              {compile.checks.map((check) => (
                <li key={check.id} className={`is-${check.status}`} data-testid={`teacher-check-${check.id}`}>
                  <strong>{check.label}</strong>
                  <span>{check.detail}</span>
                </li>
              ))}
            </ul>
            {compile.errors.length > 0 ? (
              <div className="teacher-check-errors" data-testid="teacher-compile-errors">
                <strong>阻断项</strong>
                <ul>{compile.errors.map((item) => <li key={item}>{item}</li>)}</ul>
              </div>
            ) : null}
            {compile.warnings.length > 0 ? (
              <div className="teacher-check-warnings">
                <strong>限制与提醒</strong>
                <ul>{compile.warnings.map((item) => <li key={item}>{item}</li>)}</ul>
              </div>
            ) : null}
            {compile.evidence.length > 0 ? (
              <div className="teacher-check-evidence">
                <strong>引擎证据</strong>
                <ul>{compile.evidence.map((item) => <li key={item}>{item}</li>)}</ul>
              </div>
            ) : null}
            <button type="button" className="secondary-button" onClick={() => save('已保存并重新运行当前引擎检查。')}>
              保存并运行检查
            </button>
          </section>
        </aside>
      </div>
    </div>
  );
}
