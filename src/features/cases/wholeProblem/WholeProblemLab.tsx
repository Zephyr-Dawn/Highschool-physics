import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Icon } from '../../../components/Icon';
import { MathTex } from '../../../components/MathTex';
import { ParamSlider } from '../../../components/ParamSlider';
import { SeriesChart } from '../../../components/SeriesChart';
import { usePlaybackClock } from '../../../hooks/usePlaybackClock';
import type { WholeProblemLabItem } from './types';
import type { CasePartProgress } from '../caseSession';
import { checkCaseAnswer, ANSWER_UNIT_OPTIONS, type AnswerCheckResult } from '../solutions/caseAnswerCheck';
import { buildWholeProblemModel } from './buildWholeProblem';
import type { WholeProblemGeometry, WholeProblemModel } from './types';

interface WholeProblemLabProps {
  item: WholeProblemLabItem;
  teacherMode: boolean;
  initialParts?: Record<string, CasePartProgress>;
  onPartsChange?: (parts: Record<string, CasePartProgress>) => void;
}

interface AnswerDraft {
  raw: string;
  unit: string;
  result: AnswerCheckResult | null;
}

function formatNumber(value: number | null, unit = ''): string {
  if (value === null || !Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  const text = abs >= 1e5 || (abs > 0 && abs < 1e-4)
    ? value.toExponential(4)
    : String(Number(value.toPrecision(6)));
  return unit ? `${text} ${unit}` : text;
}

function tracePoints(points: Array<{ x: number; y: number }>): string {
  return points.map((point) => `${point.x.toFixed(4)},${point.y.toFixed(4)}`).join(' ');
}

function valueAt(points: Array<{ tS: number; value: number }>, time: number): number {
  let result = 0;
  for (const point of points) {
    if (point.tS <= time + 1e-9) result = point.value;
    else break;
  }
  return result;
}

function StageSvg({ geometry, model, time, selectedEventId }: { geometry: WholeProblemGeometry; model: WholeProblemModel; time: number; selectedEventId: string | null }) {
  const frame = model.frameAt(time);
  const { viewBox } = geometry;
  const labelSize = Math.max(0.08, (viewBox.xMax - viewBox.xMin) / 90);
  const selectedEvent = model.events.find((event) => event.id === selectedEventId);
  return (
    <svg
      className="wpl-stage-svg"
      viewBox={`${viewBox.xMin} ${viewBox.yMin} ${viewBox.xMax - viewBox.xMin} ${viewBox.yMax - viewBox.yMin}`}
      role="img"
      aria-label="整题统一物理舞台"
      data-testid="whole-problem-stage"
    >
      <rect x={viewBox.xMin} y={viewBox.yMin} width={viewBox.xMax - viewBox.xMin} height={viewBox.yMax - viewBox.yMin} fill="#f8fafc" />
      {geometry.bands.map((band) => (
        <g key={`${band.x0}-${band.x1}-${band.label}`}>
          <rect
            x={band.x0}
            y={viewBox.yMin}
            width={Math.max(0, band.x1 - band.x0)}
            height={viewBox.yMax - viewBox.yMin}
            fill={band.color}
            opacity={0.72}
          />
          <text x={(band.x0 + band.x1) / 2} y={viewBox.yMin + labelSize * 2.2} textAnchor="middle" fontSize={labelSize} fill="#334155">
            {band.label}
          </text>
          {band.glyph ? (
            <text x={(band.x0 + band.x1) / 2} y={viewBox.yMin + labelSize * 4.2} textAnchor="middle" fontSize={labelSize * 1.4} fill="#0f172a">
              {band.glyph}
            </text>
          ) : null}
        </g>
      ))}
      {geometry.verticalGuides.map((guide) => (
        <line
          key={`${guide.x}-${guide.label ?? ''}`}
          x1={guide.x}
          x2={guide.x}
          y1={viewBox.yMin}
          y2={viewBox.yMax}
          stroke={guide.color ?? '#64748b'}
          strokeWidth={0.012}
          strokeDasharray={guide.dashed === false ? undefined : '0.06 0.05'}
        />
      ))}
      {geometry.screen ? (
        <g>
          <line x1={geometry.screen.x} x2={geometry.screen.x} y1={geometry.screen.yMin} y2={geometry.screen.yMax} stroke="#7c3aed" strokeWidth={0.05} />
          <text x={geometry.screen.x} y={geometry.screen.yMax + labelSize * 1.6} textAnchor="middle" fontSize={labelSize} fill="#6d28d9">屏幕</text>
        </g>
      ) : null}
      {geometry.wall ? (
        <g>
          <line x1={geometry.wall.x} x2={geometry.wall.x} y1={viewBox.yMin} y2={viewBox.yMax} stroke="#b45309" strokeWidth={0.06} />
          <text x={geometry.wall.x} y={viewBox.yMax - labelSize * 1.2} textAnchor="end" fontSize={labelSize} fill="#b45309">挡板</text>
        </g>
      ) : null}
      {geometry.slits.map((slit) => (
        <g key={`${slit.x}-${slit.yCenter}`}>
          <line x1={slit.x} x2={slit.x} y1={viewBox.yMin} y2={slit.yCenter - slit.halfWidth} stroke="#0f172a" strokeWidth={0.035} />
          <line x1={slit.x} x2={slit.x} y1={slit.yCenter + slit.halfWidth} y2={viewBox.yMax} stroke="#0f172a" strokeWidth={0.035} />
        </g>
      ))}
      {geometry.rods ? (
        <g>
          <line x1={geometry.rods.railMinM} x2={geometry.rods.railMaxM} y1={geometry.rods.yM + 0.35} y2={geometry.rods.yM + 0.35} stroke="#475569" strokeWidth={0.035} />
          <line x1={geometry.rods.railMinM} x2={geometry.rods.railMaxM} y1={geometry.rods.yM - 0.35} y2={geometry.rods.yM - 0.35} stroke="#475569" strokeWidth={0.035} />
        </g>
      ) : null}
      {model.traces.map((trace) => (
        <polyline
          key={trace.id}
          points={tracePoints(trace.points)}
          fill="none"
          stroke={trace.color}
          strokeWidth={0.022}
          strokeOpacity={0.9}
          strokeDasharray={trace.id === 'B' ? '0.08 0.05' : undefined}
        />
      ))}
      {frame.loops.map((loop) => (
        geometry.loop ? (
          <g key={loop.id}>
            <rect
              x={loop.xM}
              y={-geometry.loop.heightM / 2}
              width={geometry.loop.widthM}
              height={geometry.loop.heightM}
              fill="#ecfeff"
              fillOpacity={0.65}
              stroke={loop.color}
              strokeWidth={0.035}
            />
            <text x={loop.xM + geometry.loop.widthM / 2} y={geometry.loop.heightM / 2 + labelSize * 1.5} textAnchor="middle" fontSize={labelSize} fill={loop.color}>
              {loop.label}
            </text>
          </g>
        ) : null
      ))}
      {frame.rods?.map((rod) => (
        <g key={rod.id}>
          <line x1={rod.xM} x2={rod.xM} y1={-0.4} y2={0.4} stroke={rod.color} strokeWidth={0.08} />
          <text x={rod.xM} y={0.55} textAnchor="middle" fontSize={labelSize} fill={rod.color}>{rod.label}</text>
        </g>
      ))}
      {model.events.map((event) => (
        event.x !== undefined && event.y !== undefined ? (
          <circle
            key={event.id}
            cx={event.x}
            cy={event.y}
            r={event.id === selectedEventId ? 0.09 : 0.04}
            fill={event.id === selectedEventId ? '#f59e0b' : '#334155'}
            opacity={event.id === selectedEventId ? 1 : 0.55}
          />
        ) : null
      ))}
      {frame.markers.map((marker) => (
        <g key={marker.id}>
          <circle data-testid={`wpl-marker-${marker.id}`} cx={marker.x} cy={marker.y} r={0.08} fill={marker.color} stroke="#ffffff" strokeWidth={0.018} />
          <text x={marker.x + 0.1} y={marker.y + 0.05} fontSize={labelSize} fill={marker.color}>{marker.label}</text>
        </g>
      ))}
      {selectedEvent?.x !== undefined && selectedEvent?.y !== undefined ? (
        <text x={selectedEvent.x} y={selectedEvent.y - 0.13} textAnchor="middle" fontSize={labelSize} fill="#b45309">
          {selectedEvent.label.slice(0, 18)}
        </text>
      ) : null}
    </svg>
  );
}

export function WholeProblemLab({ item, teacherMode, initialParts, onPartsChange }: WholeProblemLabProps) {
  const scenario = item.wholeProblem;
  const baseline = useMemo(
    () => Object.fromEntries(scenario.variations.map((variation) => [variation.parameterKey, variation.baseValue])),
    [scenario],
  );
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const modelKey = JSON.stringify(overrides);
  const model = useMemo(
    () => buildWholeProblemModel({ caseId: item.id, adapterId: scenario.adapterId, overrides, baseline }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [item.id, scenario.adapterId, modelKey],
  );
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedPart = searchParams.get('part');
  const initialPartId = item.parts.find((candidate) => candidate.id === requestedPart)?.id ?? item.parts[0]?.id ?? '';
  const [partId, setPartId] = useState(initialPartId);
  const part = item.parts.find((candidate) => candidate.id === partId) ?? item.parts[0];
  const choosePart = (id: string) => {
    setPartId(id);
    const next = new URLSearchParams(searchParams);
    next.set('part', id);
    setSearchParams(next, { replace: true });
  };

  useEffect(() => {
    if (requestedPart && item.parts.some((candidate) => candidate.id === requestedPart) && requestedPart !== partId) {
      setPartId(requestedPart);
    }
    // partId is intentionally excluded: selecting a part updates partId first.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedPart, item.id]);
  const clock = usePlaybackClock(model.durationS, model.events.map((event) => event.t), { realTime: true });
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [hintsByPart, setHintsByPart] = useState<Record<string, number>>(() =>
    Object.fromEntries(Object.entries(initialParts ?? {}).map(([id, progress]) => [id, progress.hintsRevealed])),
  );
  const [revealedByPart, setRevealedByPart] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(Object.entries(initialParts ?? {}).map(([id, progress]) => [id, progress.solutionRevealed])),
  );
  const [answers, setAnswers] = useState<Record<string, AnswerDraft>>(() =>
    Object.fromEntries(Object.entries(initialParts ?? {}).filter(([, progress]) => progress.raw).map(([id, progress]) => [id, { raw: progress.raw, unit: progress.unit, result: null }])),
  );
  const progressRef = useRef<Record<string, CasePartProgress>>({ ...(initialParts ?? {}) });
  const [teacherLocal, setTeacherLocal] = useState(false);
  const hintsRevealed = hintsByPart[part.id] ?? 0;
  const partRevealed = revealedByPart[part.id] === true;
  const showSolution = teacherMode || teacherLocal || partRevealed;
  const draft = answers[part.id] ?? {
    raw: '',
    unit: part.answerSpec.unit,
    result: null,
  };
  const frame = model.frameAt(clock.time);
  const selectedEvent = model.events.find((event) => event.id === selectedEventId);


  const selectEvent = (eventId: string) => {
    const event = model.events.find((candidate) => candidate.id === eventId);
    if (!event) return;
    setSelectedEventId(eventId);
    clock.pause();
    clock.setTime(event.t);
  };

  const updateDraft = (patch: Partial<AnswerDraft>) => {
    setAnswers((previous) => ({
      ...previous,
      [part.id]: { ...draft, ...patch },
    }));
  };

  const persistPart = (patch: Partial<CasePartProgress>) => {
    const previous = progressRef.current[part.id];
    const next: CasePartProgress = {
      raw: previous?.raw ?? draft.raw,
      unit: previous?.unit ?? draft.unit,
      correct: previous?.correct ?? null,
      status: previous?.status ?? null,
      solutionRevealed: previous?.solutionRevealed ?? false,
      hintsRevealed: previous?.hintsRevealed ?? 0,
      ...patch,
    };
    progressRef.current = { ...progressRef.current, [part.id]: next };
    onPartsChange?.(progressRef.current);
  };

  const check = () => {
    const result = checkCaseAnswer(part, draft.raw, draft.unit, model);
    updateDraft({ result });
    persistPart({
      raw: draft.raw,
      unit: draft.unit,
      correct: result.status === 'correct',
      status: result.status,
      hintsRevealed,
      solutionRevealed: showSolution,
    });
  };

  const revealPart = () => {
    setRevealedByPart((previous) => ({ ...previous, [part.id]: true }));
    persistPart({ solutionRevealed: true, hintsRevealed });
  };

  const changeOverride = (key: string, value: number) => {
    setOverrides((previous) => ({ ...previous, [key]: value }));
    setAnswers({});
    setSelectedEventId(null);
    const liveAEdit = item.id === 'case-c02-alternating-time' && key === 'aSpeedMps';
    if (!liveAEdit) {
      clock.pause();
      clock.setTime(0);
    }
  };

  const resetVariation = () => {
    setOverrides({});
    setAnswers({});
    setSelectedEventId(null);
    clock.pause();
    clock.setTime(0);
  };

  const revealHint = () => {
    const next = Math.min(part.hints.length, hintsRevealed + 1);
    setHintsByPart((previous) => ({ ...previous, [part.id]: next }));
    persistPart({ hintsRevealed: next });
  };
  const activeHints = showSolution ? part.hints : part.hints.slice(0, hintsRevealed);
  const showPartAnswer = showSolution || draft.result?.status === 'correct';
  const unitOptions = ANSWER_UNIT_OPTIONS[part.answerSpec.unit] ?? [part.answerSpec.unit];
  const answerLabel = model.answers[part.answerSpec.quantity]?.label ?? part.answerSpec.quantity;
  const dependencyChanged = part.answerSpec.dependsOn.some(
    (key) => Math.abs((model.parameterValues[key] ?? 0) - (model.baselineValues[key] ?? 0)) > 1e-12,
  );
  const currentAnswer = model.answers[part.answerSpec.quantity]?.value ?? null;
  const displayedReference = dependencyChanged
    ? currentAnswer
    : part.answerSpec.baselineValue;

  return (
    <section className="whole-problem-lab" aria-labelledby="whole-problem-title" data-testid="whole-problem-lab">
      <header className="wpl-head">
        <div>
          <p className="wpl-eyebrow">整题连续仿真 · {scenario.coverage === 'full_problem_simulated' ? 'FULL' : scenario.coverage}</p>
          <h2 id="whole-problem-title">同一舞台，从题干走到最后一问</h2>
          <p className="wpl-origin">{scenario.originDescription}</p>
        </div>
        <div className="wpl-head-actions">
          <button
            type="button"
            className={`secondary-button ${teacherLocal || teacherMode ? 'is-active' : ''}`}
            aria-pressed={teacherLocal || teacherMode}
            onClick={() => setTeacherLocal((value) => !value)}
            data-testid="wpl-teacher-toggle"
          >
            <Icon name="presentation" size={16} />{teacherLocal || teacherMode ? '教师揭示中' : '教师模式'}
          </button>
          <button type="button" className="secondary-button" onClick={resetVariation} disabled={!model.hasChanges} data-testid="wpl-reset">
            回到标准题设
          </button>
        </div>
      </header>

      <div className="wpl-status-row">
        {model.hasChanges ? (
          <span className="wpl-warning" data-testid="wpl-variant-warning">当前为变式：原题数值答案仅在依赖参数未变时有效，判题已按当前求解器重算。</span>
        ) : (
          <span className="wpl-standard"><Icon name="check" size={15} />标准题设：答案与舞台使用同一组参数</span>
        )}
        {model.issue ? <span className="wpl-warning">{model.issue}</span> : null}
      </div>

      <nav className="wpl-stage-tabs" aria-label="整题物理阶段">
        {scenario.physicalStages.map((stage, index) => (
          <button
            key={stage.id}
            type="button"
            className="chip-button"
            onClick={() => {
              if (stage.startEventId) selectEvent(stage.startEventId);
              else { clock.pause(); clock.setTime(0); }
            }}
            data-testid={`wpl-stage-${stage.id}`}
          >
            {index + 1}. {stage.title}
          </button>
        ))}
      </nav>

      <div className="wpl-grid">
        <div className="wpl-main">
          <StageSvg geometry={model.geometry} model={model} time={clock.time} selectedEventId={selectedEventId} />
          <div className="wpl-timeline">
            <button type="button" className="icon-button wpl-play" onClick={clock.toggle} aria-label={clock.playing ? '暂停整题仿真' : '播放整题仿真'} data-testid="wpl-play">
              <Icon name={clock.playing ? 'pause' : 'play'} size={18} />
            </button>
            <button type="button" className="icon-button" onClick={() => { clock.pause(); clock.setTime(0); }} aria-label="回到整题起点" data-testid="wpl-restart">
              <Icon name="restart" size={18} />
            </button>
            <button type="button" className="icon-button" onClick={() => clock.jumpKey(-1)} aria-label="上一事件">‹</button>
            <input
              className="wpl-time-range"
              type="range"
              min={0}
              max={Math.max(model.durationS, 1e-6)}
              step={0.001}
              value={Math.min(clock.time, model.durationS)}
              aria-label="整题时间轴"
              onChange={(event) => { clock.pause(); clock.setTime(Number(event.target.value)); }}
              data-testid="wpl-time"
            />
            <button type="button" className="icon-button" onClick={() => clock.jumpKey(1)} aria-label="下一事件">›</button>
            <span className="wpl-time-label" data-testid="wpl-time-label">{formatNumber(clock.time, 's')} / {formatNumber(model.durationS, 's')}</span>
          </div>
          <div className="wpl-chart-grid">
            {model.charts.map((chart) => (
              <SeriesChart
                key={chart.id}
                title={chart.title}
                unit={chart.unit}
                color={chart.color}
                points={chart.points}
                duration={model.durationS}
                time={clock.time}
                currentValue={valueAt(chart.points, clock.time)}
                formatValue={(value) => formatNumber(value)}
                signed={chart.signed ?? true}
              />
            ))}
          </div>
          <div className="wpl-event-strip" aria-label="事件时间轴">
            {model.events.map((event) => (
              <button
                key={event.id}
                type="button"
                className={`wpl-event ${selectedEventId === event.id ? 'is-active' : ''}`}
                onClick={() => selectEvent(event.id)}
                data-testid={`wpl-event-${event.id}`}
              >
                <span>{formatNumber(event.t, 's')}</span>
                <strong>{event.kind}</strong>
              </button>
            ))}
          </div>
          {selectedEvent ? (
            <p className="wpl-event-detail" role="status" data-testid="wpl-event-detail">
              <strong>{formatNumber(selectedEvent.t, 's')}</strong> {selectedEvent.label}
            </p>
          ) : null}
        </div>

        <aside className="wpl-side" aria-label="逐问解析与答案">
          <div className="wpl-observables">
            {Object.entries(frame.observables).map(([key, observable]) => (
              observable.value !== null || observable.note ? (
                <div key={key} className="wpl-observable">
                  <span>{observable.label}</span>
                  <strong>{observable.value === null ? observable.note : formatNumber(observable.value, observable.unit)}</strong>
                </div>
              ) : null
            ))}
          </div>

          <div className="wpl-parts" role="tablist" aria-label="小问">
            {item.parts.map((candidate, index) => (
              <button
                key={candidate.id}
                type="button"
                role="tab"
                aria-selected={candidate.id === part.id}
                className={`wpl-part-tab ${candidate.id === part.id ? 'is-active' : ''}`}
                onClick={() => choosePart(candidate.id)}
                data-testid={`wpl-part-${candidate.id}`}
              >
                {String.fromCharCode(97 + index)}
              </button>
            ))}
          </div>

          <div className="wpl-part-body" data-testid="wpl-part-body">
            <p className="wpl-part-prompt"><strong>({String.fromCharCode(97 + item.parts.indexOf(part))})</strong> {part.prompt}</p>
            <p className="wpl-part-meta">目标量：{part.targetQuantities.join('、')}</p>

            <div className="wpl-hints">
              <div className="wpl-subhead">
                <strong>分层提示</strong>
                <button type="button" className="chip-button" onClick={revealHint} disabled={hintsRevealed >= part.hints.length || showSolution}>
                  再给一个提示
                </button>
              </div>
              {activeHints.length === 0 ? <p className="wpl-muted">先尝试独立列式，再展开提示。</p> : null}
              <ol>{activeHints.map((hint) => <li key={hint}>{hint}</li>)}</ol>
            </div>

            <div className="wpl-derivation">
              <div className="wpl-subhead">
                <strong>逐问推导</strong>
                {!showSolution ? (
                  <button type="button" className="secondary-button" onClick={revealPart} data-testid="wpl-reveal-part">
                    展开本问推导
                  </button>
                ) : <span className="wpl-muted">已展开</span>}
              </div>
              {showSolution && dependencyChanged ? (
                <p className="wpl-warning" role="note" data-testid="wpl-derivation-stale">
                  当前为变式：以下推导中的数值和中间结果属于标准题设，不能当作当前答案；参考值与判题已按当前求解器重算。
                </p>
              ) : null}
              {showSolution ? (
                <ol className="wpl-steps">
                  {part.derivationSteps.map((step) => (
                    <li key={step.id} data-testid={`wpl-step-${step.id}`}>
                      <strong>{step.title}</strong>
                      <p>{step.explanation}</p>
                      <MathTex block>{step.formula}</MathTex>
                      {step.assumptions?.length ? <p className="wpl-muted">假设：{step.assumptions.join('；')}</p> : null}
                      {step.referenceEventId ? (
                        <button type="button" className="chip-button" onClick={() => selectEvent(step.referenceEventId!)}>
                          定位事件 {step.referenceEventId}
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="wpl-masked" data-testid="wpl-solution-masked">推导已遮罩。先预测、再在舞台上验证；需要时展开本问推导。</p>
              )}
              {showSolution ? (
                <div className="wpl-proof">
                  <strong>独立验算</strong>
                  <p>{part.independentProofRef}</p>
                  <strong>典型误区</strong>
                  <p>{part.misconception}</p>
                </div>
              ) : null}
            </div>

            <div className="wpl-answer">
              <label className="wpl-answer-label">
                <span>输入 {answerLabel}（{part.answerSpec.unit}）</span>
                <span className="wpl-answer-row">
                  <input
                    value={draft.raw}
                    onChange={(event) => updateDraft({ raw: event.target.value, result: null })}
                    onBlur={() => persistPart({ raw: draft.raw, unit: draft.unit })}
                    inputMode="text"
                    placeholder="支持 √3/2、1/3、π"
                    aria-label={`${part.answerSpec.quantity} 答案`}
                    data-testid="wpl-answer-input"
                  />
                  <select
                    value={draft.unit}
                    onChange={(event) => updateDraft({ unit: event.target.value, result: null })}
                    aria-label="答案单位"
                    data-testid="wpl-answer-unit"
                  >
                    {unitOptions.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
                  </select>
                </span>
              </label>
              <button type="button" className="primary-button" onClick={check} disabled={!draft.raw.trim()} data-testid="wpl-check-answer">
                检查答案
              </button>
              {draft.result ? (
                <p className={`wpl-answer-result is-${draft.result.status}`} role="status" data-testid="wpl-answer-result">
                  {draft.result.message}
                </p>
              ) : null}
              {showPartAnswer ? (
                <p className="wpl-answer-standard" data-testid="wpl-answer-standard">
                  参考值：{formatNumber(
                    draft.result?.expected ?? displayedReference,
                    part.answerSpec.unit,
                  )}
                  {dependencyChanged ? '（已按当前变式重算）' : '（标准题设）'}
                </p>
              ) : null}
            </div>
          </div>

          <div className="wpl-variations">
            <div className="wpl-subhead">
              <strong>变式参数</strong>
              <span className="wpl-muted">更改后舞台、事件与判题同步重算</span>
            </div>
            {scenario.variations.map((variation) => (
              <ParamSlider
                key={variation.id}
                label={variation.label}
                value={overrides[variation.parameterKey] ?? variation.baseValue}
                min={variation.min}
                max={variation.max}
                step={variation.step}
                unit={variation.unit}
                onChange={(value) => changeOverride(variation.parameterKey, value)}
                description={variation.expectedBehavior}
                testId={`wpl-variation-${variation.id}`}
              />
            ))}
          </div>

          <div className="wpl-teacher-notes">
            <strong>教师提示</strong>
            <ul>{scenario.teacherAnnotations.map((note) => <li key={note}>{note}</li>)}</ul>
          </div>
        </aside>
      </div>
    </section>
  );
}
