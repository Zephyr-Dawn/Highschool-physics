import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  LOOP_PHASE_LABEL,
  downsampleLoopSamples,
  formatCurrentDirection,
  simulateLoop,
  stateAtTime,
} from '../../physics/induction/loopField';
import { usePersistentState } from '../../hooks/usePersistentState';
import { usePlaybackClock } from '../../hooks/usePlaybackClock';
import { formatArea, formatForce, formatLength, formatSI, formatTime } from '../../lib/format';
import { I03_DEFAULT, I03_PRESETS, i03EngineParams, type I03Params } from './params';
import { I03_LESSON } from '../../content/lessons';
import { LoopEntryStage, I03_DEFAULT_LAYERS, type I03Layers } from './LoopEntryStage';
import { PlaybackBar } from '../../components/PlaybackBar';
import { PanelTabs } from '../../components/PanelTabs';
import { ParamSlider } from '../../components/ParamSlider';
import { PARAMETER_DOMAINS } from '../../math/parameterValidation';
import { Segmented } from '../../components/Segmented';
import { ToggleSwitch } from '../../components/ToggleSwitch';
import { Icon } from '../../components/Icon';
import { LessonRunner } from '../../features/lesson/LessonRunner';
import { PracticePanel } from '../../features/practice/PracticePanel';
import { ReadoutGrid } from '../../components/ReadoutGrid';
import { MathTex } from '../../components/MathTex';
import { TeacherDock } from '../../components/TeacherDock';
import { SeriesChart } from '../../components/SeriesChart';
import type { StageMode } from '../../components/StageToolbar';
import { questionsForModel } from '../../content/questions';

type PanelTabId = 'params' | 'lesson' | 'practice' | 'data';
type LearningMode = 'guided' | 'free';

const formatWb = (value: number) => formatSI(value, 'Wb');
const formatV = (value: number) => formatSI(value, 'V');
const formatA = (value: number) => formatSI(value, 'A');

export function LoopEntryPage() {
  const [params, setParams] = usePersistentState<I03Params>('emplab.i03.params.v1', I03_DEFAULT);
  const [layers, setLayers] = usePersistentState<I03Layers>('emplab.i03.layers.v1', I03_DEFAULT_LAYERS);
  const [mode, setMode] = usePersistentState<LearningMode>('emplab.i03.mode.v1', 'guided');
  const [teacher, setTeacher] = useState(false);
  const [stageMode, setStageMode] = useState<StageMode>('interact');
  const [tab, setTab] = useState<PanelTabId>(mode === 'guided' ? 'lesson' : 'params');
  const [searchParams] = useSearchParams();
  const presetId = searchParams.get('preset');

  const engParams = useMemo(() => i03EngineParams(params), [params]);
  const sim = useMemo(() => simulateLoop(engParams), [engParams]);
  const keyFrames = useMemo(() => {
    const entries = [
      { time: 0, label: '起点' },
      ...sim.events.map((event) => ({ time: event.tS, label: event.label })),
      { time: sim.durationS, label: '结束' },
    ];
    const seen = new Set<number>();
    return entries
      .filter((entry) => {
        const key = Math.round(entry.time * 1e6) / 1e6;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => a.time - b.time);
  }, [sim]);
  const clock = usePlaybackClock(
    sim.durationS,
    keyFrames.map((frame) => frame.time),
  );
  const snapshot = stateAtTime(sim, clock.time);
  const paramSignature = useMemo(() => JSON.stringify(params), [params]);
  const questionCount = questionsForModel('i03').length;

  useEffect(() => {
    clock.reset();
  }, [paramSignature, clock.reset]);

  useEffect(() => {
    const preset = presetId ? I03_PRESETS[presetId] : undefined;
    if (preset) {
      setParams({ ...preset });
      clock.reset();
    }
  }, [presetId, setParams, clock.reset]);

  useEffect(() => {
    setTab(mode === 'guided' ? 'lesson' : 'params');
    setTeacher(false);
  }, [mode]);

  const applyPatch = (patch: Partial<I03Params>) => setParams((prev) => ({ ...prev, ...patch }));
  const applyPreset = (id: string) => {
    const preset = I03_PRESETS[id];
    if (!preset) return;
    setParams({ ...preset });
    clock.reset();
  };

  const chartSamples = useMemo(() => downsampleLoopSamples(sim.samples, 240), [sim]);
  const fluxPoints = useMemo(
    () => chartSamples.map((sample) => ({ tS: sample.tS, value: sample.fluxWb })),
    [chartSamples],
  );
  const emfPoints = useMemo(
    () => chartSamples.map((sample) => ({ tS: sample.tS, value: sample.emfV })),
    [chartSamples],
  );
  const currentPoints = useMemo(
    () => chartSamples.map((sample) => ({ tS: sample.tS, value: sample.currentA })),
    [chartSamples],
  );

  const currentDirectionLabel = formatCurrentDirection(snapshot.currentA);
  const forceDirectionLabel =
    snapshot.forceXN < -1e-12 ? '向左（阻碍运动）' : snapshot.forceXN > 1e-12 ? '向右' : '零';
  const timeLabel = formatTime(clock.time);
  const teacherStats = [
    { label: '阶段', value: LOOP_PHASE_LABEL[snapshot.phase] },
    { label: '电动势 ε', value: formatSI(snapshot.emfV, 'V') },
    { label: '电流 I', value: formatSI(snapshot.currentA, 'A') },
    { label: '安培力 F', value: formatSI(snapshot.forceXN, 'N') },
  ];

  return (
    <div className={`sim-page ${teacher ? 'sim-teacher' : ''}`}>
      <header className="sim-header">
        <div className="sim-title-block">
          <p className="eyebrow">I03 · 模块 B · 电磁感应</p>
          <h1>矩形线框进入 / 离开磁场</h1>
          <p className="sim-subtitle">
            用同一组初态追踪磁通量、感应电动势、电流与安培力；可在边界事件处暂停并逐段推理。
          </p>
        </div>
        <div className="sim-header-actions">
          {!teacher ? (
            <Segmented<LearningMode>
              ariaLabel="学习模式"
              value={mode}
              onChange={setMode}
              options={[
                { value: 'guided', label: '引导学习', icon: <Icon name="book" size={17} /> },
                { value: 'free', label: '自由实验', icon: <Icon name="sliders" size={17} /> },
              ]}
            />
          ) : null}
          <button
            type="button"
            className={`tool-button ${teacher ? 'is-active' : ''}`}
            onClick={() => setTeacher((value) => !value)}
            aria-pressed={teacher}
          >
            <Icon name="target" size={17} />
            {teacher ? '退出教师视图' : '教师视图'}
          </button>
        </div>
      </header>

      <div className={`sim-layout ${teacher ? 'sim-layout-teacher' : ''}`}>
        <div className="sim-stage-column">
          <LoopEntryStage
            sim={sim}
            snapshot={snapshot}
            params={params}
            layers={layers}
            stageMode={stageMode}
            onStageModeChange={setStageMode}
            onParamsChange={applyPatch}
            onSceneInteractionStart={clock.pause}
          />
          {teacher ? (
            <TeacherDock
              formula={'\\varepsilon=-\\frac{d\\Phi}{dt},\\qquad F_{\\text{安}}=-\\frac{B^2H^2v}{R}'}
              stats={teacherStats}
              footnote={`t = ${timeLabel} · ${LOOP_PHASE_LABEL[snapshot.phase]}`}
            />
          ) : null}
          <PlaybackBar
            clock={clock}
            duration={sim.durationS}
            keyFrames={keyFrames}
            timeLabel={timeLabel}
            secondaryLabel={LOOP_PHASE_LABEL[snapshot.phase]}
            timelineLabel="线框运动时间轴"
            note="1× 时约 8 秒演示此次完整过程；关键帧自动定位到进入、完全进入、离开与完全离开等边界事件。"
          />
        </div>

        {!teacher ? (
          <aside className="sim-panel" aria-label="实验控制台">
            <PanelTabs<PanelTabId>
              label="实验面板"
              active={tab}
              onChange={setTab}
              tabs={[
                { id: 'params', label: '参数', icon: <Icon name="sliders" size={16} /> },
                { id: 'lesson', label: '讲解', icon: <Icon name="book" size={16} /> },
                { id: 'practice', label: '练习', count: questionCount, icon: <Icon name="check" size={16} /> },
                { id: 'data', label: '数据', icon: <Icon name="ruler" size={16} /> },
              ]}
            />
            <div className="sim-panel-body" role="tabpanel">
              {tab === 'params' ? (
                <div className="panel-section-stack">
                  <div className="panel-intro">
                    <div>
                      <h2>实验参数</h2>
                      <p>改变任一参数都会按确定性模型重新计算，并把时间归零；也可直接拖动线框与磁场边界。</p>
                    </div>
                  </div>

                  <div className="preset-chips" aria-label="快速实验">
                    <button type="button" className="chip-button" onClick={() => applyPreset('i03-default')}>
                      默认
                    </button>
                    <button type="button" className="chip-button" onClick={() => applyPreset('i03-free')}>
                      自由滑行
                    </button>
                    <button type="button" className="chip-button" onClick={() => applyPreset('i03-reverse-field')}>
                      B 反向
                    </button>
                    <button type="button" className="chip-button" onClick={() => applyPreset('i03-fast')}>
                      高速
                    </button>
                    <button type="button" className="chip-button" onClick={() => applyPreset('i03-zero-field')}>
                      B = 0
                    </button>
                  </div>

                  <section className="panel-section">
                    <h3 className="section-title">磁场</h3>
                    <div className="field-label-row">
                      <div>
                        <span className="field-label">磁场方向</span>
                        <p className="field-hint">B 的正方向为垂直纸面向外 ⊙</p>
                      </div>
                      <Segmented
                        ariaLabel="磁场方向"
                        size="sm"
                        value={params.BzSign}
                        onChange={(value) => applyPatch({ BzSign: value === 1 ? 1 : -1 })}
                        options={[
                          { value: 1, label: '⊙ 出纸面' },
                          { value: -1, label: '× 入纸面' },
                        ]}
                      />
                    </div>
                    <ParamSlider
                      label="磁感应强度 |B|"
                      value={params.BzMagnitudeT}
                      min={0}
                      max={2}
                      step={0.05}
                      unit="T"
                      decimals={2}
                      onChange={(value) => applyPatch({ BzMagnitudeT: value })}
                    />
                    <ParamSlider
                      label="磁场宽度"
                      value={params.fieldWidthM}
                      min={0.05}
                      max={1.2}
                      step={0.05}
                      unit="m"
                      decimals={2}
                      domain={PARAMETER_DOMAINS.i03FieldWidth}
                      onChange={(value) => applyPatch({ fieldWidthM: value })}
                      description="磁场区域是一条竖直无限长条形区；只改变其宽度，左边界固定。"
                    />
                  </section>

                  <section className="panel-section">
                    <h3 className="section-title">线框与回路</h3>
                    <ParamSlider
                      label="线框水平边长 d"
                      value={params.loopWidthM}
                      min={0.05}
                      max={0.8}
                      step={0.05}
                      unit="m"
                      decimals={2}
                      domain={PARAMETER_DOMAINS.i03LoopLength}
                      onChange={(value) => applyPatch({ loopWidthM: value })}
                    />
                    <ParamSlider
                      label="线框竖直边长 L"
                      value={params.loopHeightM}
                      min={0.05}
                      max={0.5}
                      step={0.05}
                      unit="m"
                      decimals={2}
                      domain={PARAMETER_DOMAINS.i03LoopLength}
                      onChange={(value) => applyPatch({ loopHeightM: value })}
                    />
                    <ParamSlider
                      label="回路总电阻 R"
                      value={params.resistanceOhm}
                      min={0.1}
                      max={2}
                      step={0.1}
                      unit="Ω"
                      decimals={1}
                      onChange={(value) => applyPatch({ resistanceOhm: value })}
                    />
                    <ParamSlider
                      label="线框质量 m"
                      value={params.massKg}
                      min={0.02}
                      max={1}
                      step={0.01}
                      unit="kg"
                      decimals={2}
                      domain={PARAMETER_DOMAINS.i03Mass}
                      onChange={(value) => applyPatch({ massKg: value })}
                      description="质量只影响自由滑行时的加速度，不影响匀速驱动模式。"
                    />
                  </section>

                  <section className="panel-section">
                    <h3 className="section-title">运动方式</h3>
                    <div className="field-label-row">
                      <div>
                        <span className="field-label">驱动方式</span>
                        <p className="field-hint">匀速：外力自动平衡安培力；自由滑行：只有安培力</p>
                      </div>
                    </div>
                    <Segmented<'uniform' | 'free'>
                      ariaLabel="驱动方式"
                      size="sm"
                      value={params.mode}
                      onChange={(value) => applyPatch({ mode: value })}
                      options={[
                        { value: 'uniform', label: '匀速驱动' },
                        { value: 'free', label: '自由滑行' },
                      ]}
                    />
                    <ParamSlider
                      label="初速度 v₀"
                      value={params.initialSpeedMps}
                      min={0}
                      max={3}
                      step={0.1}
                      unit="m/s"
                      decimals={1}
                      domain={PARAMETER_DOMAINS.i03Speed}
                      onChange={(value) => applyPatch({ initialSpeedMps: value })}
                    />
                    <ParamSlider
                      label="初始位置 x"
                      value={params.startXM * 100}
                      min={-80}
                      max={80}
                      step={1}
                      unit="cm"
                      decimals={0}
                      onChange={(value) => applyPatch({ startXM: value / 100 })}
                      description="x 是线框左边缘的位置；磁场左边界固定在 0.20 m。"
                    />
                  </section>

                  <section className="panel-section">
                    <h3 className="section-title">显示图层</h3>
                    <div className="toggle-list">
                      <ToggleSwitch
                        label="磁场符号与边界"
                        checked={layers.field}
                        onChange={(checked) => setLayers({ ...layers, field: checked })}
                      />
                      <ToggleSwitch
                        label="有效面积（磁通量）"
                        checked={layers.flux}
                        onChange={(checked) => setLayers({ ...layers, flux: checked })}
                      />
                      <ToggleSwitch
                        label="感应电流方向"
                        checked={layers.current}
                        onChange={(checked) => setLayers({ ...layers, current: checked })}
                      />
                      <ToggleSwitch
                        label="速度与安培力"
                        checked={layers.vectors}
                        onChange={(checked) => setLayers({ ...layers, vectors: checked })}
                      />
                      <ToggleSwitch
                        label="历史位置"
                        checked={layers.ghosts}
                        onChange={(checked) => setLayers({ ...layers, ghosts: checked })}
                      />
                    </div>
                  </section>

                  <button
                    type="button"
                    className="secondary-button wide-button"
                    onClick={() => {
                      setParams({ ...I03_DEFAULT });
                      setLayers({ ...I03_DEFAULT_LAYERS });
                      clock.reset();
                    }}
                  >
                    <Icon name="reset" size={17} />
                    恢复默认参数与图层
                  </button>
                </div>
              ) : null}

              {tab === 'lesson' ? (
                <LessonRunner
                  steps={I03_LESSON}
                  storageKey="emplab.i03.lesson.v1"
                  overview={{
                    goals: [
                      '判断线框进入 / 完全进入 / 离开阶段中 Φ、ε、I 的符号与变化。',
                      '用楞次定律确定感应电流方向，用 B、L、v、R 求电动势、电流和安培力。',
                      '区分“每条边的动生电动势”与“回路总电动势”，理解完全进入后 I = 0。',
                    ],
                    prerequisites: [
                      '磁通量 Φ = B·S_有效 与磁通量变化率。',
                      '法拉第电磁感应定律、楞次定律、右手螺旋定则。',
                      '闭合电路欧姆定律 I = ε/R 与安培力 F = BIL。',
                    ],
                    misconceptions: [
                      '认为完全进入匀强磁场后仍有感应电流。',
                      '认为进入与离开的感应电流方向相同。',
                      '把单条边切割产生的电动势当成整个回路的总电动势。',
                    ],
                  }}
                  onApplyPreset={applyPreset}
                  onGoPractice={() => setTab('practice')}
                />
              ) : null}

              {tab === 'practice' ? <PracticePanel modelId="i03" /> : null}

              {tab === 'data' ? (
                <div className="panel-section-stack">
                  <div className="panel-intro">
                    <div>
                      <h2>实时数据与阶段</h2>
                      <p>当前时刻 {timeLabel}，所有曲线与舞台取自同一段确定性仿真。</p>
                    </div>
                  </div>

                  <ReadoutGrid
                    items={[
                      {
                        label: '阶段',
                        value: LOOP_PHASE_LABEL[snapshot.phase],
                        testId: 'i03-phase',
                      },
                      {
                        label: '磁通量 Φ',
                        value: formatSI(snapshot.fluxWb, 'Wb'),
                        hint: '取 +z（出纸面）为回路正法向',
                        testId: 'i03-flux',
                      },
                      {
                        label: 'dΦ/dt',
                        value: `${formatSI(snapshot.fluxRateWbPerS, 'Wb/s')}`,
                        hint: 'ε = −dΦ/dt',
                        testId: 'i03-flux-rate',
                      },
                      {
                        label: '感应电动势 ε',
                        value: formatSI(snapshot.emfV, 'V'),
                        hint: '正值驱动逆时针电流',
                        testId: 'i03-emf',
                      },
                      {
                        label: '感应电流 I',
                        value: formatSI(snapshot.currentA, 'A'),
                        hint: currentDirectionLabel,
                        testId: 'i03-current',
                      },
                      {
                        label: '安培力 F',
                        value: formatForce(snapshot.forceXN),
                        hint: forceDirectionLabel,
                        testId: 'i03-force',
                      },
                      {
                        label: '线框速度 v',
                        value: formatSI(snapshot.velocityMps, 'm/s'),
                        hint: params.mode === 'free' ? '只受安培力，速率会变化' : '匀速驱动',
                        testId: 'i03-velocity',
                      },
                      {
                        label: '有效面积',
                        value: formatArea(snapshot.overlapAreaM2),
                        hint: `重叠宽度 ${formatLength(snapshot.overlapWidthM)}`,
                        testId: 'i03-area',
                      },
                      {
                        label: '全过程焦耳热',
                        value: formatSI(sim.jouleHeatJ, 'J'),
                        hint: params.mode === 'free'
                          ? `机械能减少 ${formatSI(sim.mechanicalEnergyLossJ, 'J')}`
                          : '由 I²R 对时间积分',
                        testId: 'i03-heat',
                      },
                    ]}
                  />

                  <section className="charts-section">
                    <h3 className="section-title">随时间变化</h3>
                    <SeriesChart
                      title="磁通量 Φ"
                      unit="Wb"
                      color="var(--flux)"
                      points={fluxPoints}
                      duration={sim.durationS}
                      time={clock.time}
                      currentValue={snapshot.fluxWb}
                      formatValue={formatWb}
                    />
                    <SeriesChart
                      title="感应电动势 ε"
                      unit="V"
                      color="var(--emf)"
                      points={emfPoints}
                      duration={sim.durationS}
                      time={clock.time}
                      currentValue={snapshot.emfV}
                      formatValue={formatV}
                    />
                    <SeriesChart
                      title="感应电流 I"
                      unit="A"
                      color="var(--current)"
                      points={currentPoints}
                      duration={sim.durationS}
                      time={clock.time}
                      currentValue={snapshot.currentA}
                      formatValue={formatA}
                    />
                  </section>

                  <section className="event-section">
                    <h3 className="section-title">边界事件</h3>
                    {sim.events.length > 0 ? (
                      <div className="event-list">
                        {sim.events.map((event) => (
                          <button
                            key={`${event.tS}-${event.phase}`}
                            type="button"
                            className="event-item"
                            onClick={() => clock.setTime(event.tS)}
                          >
                            <span className="event-time">{formatTime(event.tS)}</span>
                            <span className="event-label">{event.label}</span>
                            <span className="event-value">
                              ε {formatSI(event.emfV, 'V')} · I {formatSI(event.currentA, 'A')}
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="muted-text">当前参数不会跨越新的磁场边界，因此没有阶段切换事件。</p>
                    )}
                  </section>

                  <section className="formula-card">
                    <p className="eyebrow">符号约定与公式</p>
                    <MathTex block>{'\\Phi=B S_{\\text{有效}},\\qquad \\varepsilon=-\\frac{d\\Phi}{dt},\\qquad I=\\frac{\\varepsilon}{R}'}</MathTex>
                    <p>
                      进入阶段：dΦ/dt = B·L·v，ε = −B·L·v，I = BLv/R，安培力 F = B²L²v/R；
                      完全进入后 dΦ/dt = 0。
                    </p>
                    <MathTex block>{'F_{\\text{安}}=\\frac{B^2L^2v}{R}'}</MathTex>
                    <p className="formula-result">
                      当前 Φ ≈ {formatWb(snapshot.fluxWb)}，ε ≈ {formatV(snapshot.emfV)}，I ≈{' '}
                      {formatA(snapshot.currentA)}，F ≈ {formatSI(snapshot.forceXN, 'N')}
                    </p>
                  </section>

                  <div className="callout callout-note">
                    <Icon name="info" size={18} />
                    <div>
                      <strong>模型边界</strong>
                      <p>
                        磁场为竖直无限长条形区域；线框为刚性矩形，忽略自感、边缘效应、摩擦与空气阻力。
                        该模型适合“进入 / 离开 + 匀速或自由滑行”的基础教学，不等同于复现完整高考综合题。
                        动画为示教慢放；物理时间按秒计算。
                      </p>
                    </div>
                  </div>

                  {sim.stoppedInsideField ? (
                    <div className="callout callout-warning">
                      <Icon name="info" size={18} />
                      <p>自由滑行下，线框在未完全离开磁场前速度减为零；这不是“卡死”，而是本模型速度过低时的稳定终态。</p>
                    </div>
                  ) : null}

                  {sim.issue ? (
                    <div className="callout callout-warning">
                      <Icon name="info" size={18} />
                      <p>{sim.issue}</p>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
