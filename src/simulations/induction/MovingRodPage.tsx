import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  MANUAL_ROD_SETTINGS,
  ManualRodSession,
} from '../../physics/induction/manualRodMotion';
import {
  ROD_MODE_LABEL,
  formatRodCurrentDirection,
  rodStateAt,
  solveRod,
  type RodMode,
  type RodSnapshot,
} from '../../physics/induction/movingRod';
import { usePersistentState } from '../../hooks/usePersistentState';
import { usePlaybackClock } from '../../hooks/usePlaybackClock';
import { formatForce, formatSI, formatTime } from '../../lib/format';
import { I02_DEFAULT, I02_PRESETS, i02EngineParams, sanitizeI02Params, type I02Params } from './movingRodParams';
import { MovingRodStage, I02_DEFAULT_LAYERS, type I02Layers } from './MovingRodStage';
import { MovingRodCharts } from './MovingRodCharts';
import { I02_LESSON } from '../../content/lessons';
import { PlaybackBar, type KeyFrame } from '../../components/PlaybackBar';
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
import type { StageMode } from '../../components/StageToolbar';
import { questionsForModel } from '../../content/questions';

type PanelTabId = 'params' | 'lesson' | 'practice' | 'data';
type LearningMode = 'guided' | 'free';

const MANUAL_DURATION_S = 120;

const MODE_DESCRIPTION: Record<RodMode, string> = {
  'constant-speed': '速度由外部规定，外力自动平衡安培力。',
  'free-decay': '无外力，只有安培力做负功，速度按指数衰减。',
  'constant-force': '恒定外力与速度相关安培力共同决定加速度。',
  'manual-drag': '手指规定当前位置，速度由最近时间窗的位置导数估计。',
};

function statusLabel(snapshot: RodSnapshot, manual: boolean): string {
  if (snapshot.status === 'boundary-stop') return '接触左端停止';
  if (snapshot.status === 'rest') return '静止';
  return manual ? '手势驱动（估算）' : '运动中';
}

function keyframesFor(solution: ReturnType<typeof solveRod>): KeyFrame[] {
  const frames: KeyFrame[] = [{ time: 0, label: '起点' }, { time: solution.durationS, label: '结束' }];
  if (solution.alphaPerS > 1e-9 && solution.params.mode !== 'constant-speed') {
    frames.push({
      time: 1 / solution.alphaPerS,
      label: solution.params.mode === 'free-decay' ? '速度降至约 37%' : '达到约 63% 终端速度',
    });
    frames.push({
      time: 3 / solution.alphaPerS,
      label: solution.params.mode === 'free-decay' ? '速度余约 5%' : '接近终端速度',
    });
  }
  for (const event of solution.events) frames.push({ time: event.tS, label: event.label });
  const seen = new Set<number>();
  return frames
    .filter((frame) => {
      if (!Number.isFinite(frame.time) || frame.time < 0 || frame.time > solution.durationS + 1e-9) return false;
      const key = Math.round(frame.time * 1e6) / 1e6;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((left, right) => left.time - right.time);
}

export function MovingRodPage() {
  const [storedParams, setStoredParams] = usePersistentState<I02Params>('emplab.i02.params.v1', I02_DEFAULT);
  const params = useMemo(() => sanitizeI02Params(storedParams), [storedParams]);
  const setParams = useCallback<Dispatch<SetStateAction<I02Params>>>(
    (value) => {
      setStoredParams((previous) => {
        const safePrevious = sanitizeI02Params(previous);
        return sanitizeI02Params(typeof value === 'function' ? value(safePrevious) : value);
      });
    },
    [setStoredParams],
  );
  const [layers, setLayers] = usePersistentState<I02Layers>('emplab.i02.layers.v1', I02_DEFAULT_LAYERS);
  const [learningMode, setLearningMode] = usePersistentState<LearningMode>('emplab.i02.learning.v1', 'guided');
  const [teacher, setTeacher] = useState(false);
  const [formulaVisible, setFormulaVisible] = useState(true);
  const [stageMode, setStageMode] = useState<StageMode>('interact');
  const [tab, setTab] = useState<PanelTabId>(learningMode === 'guided' ? 'lesson' : 'params');
  const [searchParams] = useSearchParams();
  const presetId = searchParams.get('preset');

  const manualMode = params.mode === 'manual-drag';
  const engineParams = useMemo(() => i02EngineParams(params), [params]);
  const solution = useMemo(() => solveRod(engineParams), [engineParams]);
  const paramSignature = useMemo(() => JSON.stringify(params), [params]);
  const previousParamSignature = useRef(paramSignature);
  const manualSignature = `${params.BzSign}|${params.BzMagnitudeT}|${params.lengthM}|${params.resistanceOhm}|${params.massKg}|${params.circuitClosed}|${params.startXM}`;
  const questionCount = questionsForModel('i02').length;

  const manualSession = useMemo(() => {
    if (!manualMode) return null;
    const session = new ManualRodSession(engineParams, MANUAL_ROD_SETTINGS);
    session.reset(0, params.startXM);
    return session;
  }, [manualMode, manualSignature]);

  const manualSessionRef = useRef<ManualRodSession | null>(null);
  const [manualSnapshot, setManualSnapshot] = useState<RodSnapshot | null>(null);
  const [manualRevision, setManualRevision] = useState(0);
  const [manualDragging, setManualDragging] = useState(false);
  const [manualNotice, setManualNotice] = useState<string | null>(null);
  const [initialDragging, setInitialDragging] = useState(false);
  const initialDragWasPlaying = useRef(false);
  const initialDragOriginalX = useRef(params.startXM);
  const manualX = useRef(params.startXM);
  const manualTimeOrigin = useRef<{ wallSeconds: number; simulationSeconds: number } | null>(null);

  const duration = manualMode ? MANUAL_DURATION_S : solution.durationS;
  const clockKeyFrames = useMemo(() => (manualMode ? [{ time: 0, label: '开始' }, { time: MANUAL_DURATION_S, label: '手动时限' }] : keyframesFor(solution)), [manualMode, solution]);
  const clockKeyTimes = useMemo(() => clockKeyFrames.map((frame) => frame.time), [clockKeyFrames]);
  const clock = usePlaybackClock(duration, clockKeyTimes, { realTime: manualMode });

  useEffect(() => {
    setTab(learningMode === 'guided' ? 'lesson' : 'params');
    setTeacher(false);
  }, [learningMode]);

  useEffect(() => {
    const preset = presetId ? I02_PRESETS[presetId] : undefined;
    if (preset) setParams({ ...preset });
  }, [presetId, setParams]);

  useEffect(() => {
    if (previousParamSignature.current === paramSignature) return;
    previousParamSignature.current = paramSignature;
    clock.restart();
  }, [paramSignature, clock.restart]);

  useEffect(() => {
    if (!manualSession) {
      manualSessionRef.current = null;
      setManualSnapshot(null);
      setManualDragging(false);
      setManualNotice(null);
      return;
    }
    manualSessionRef.current = manualSession;
    const snapshot = manualSession.reset(0, params.startXM);
    manualX.current = params.startXM;
    manualTimeOrigin.current = null;
    setManualSnapshot(snapshot);
    setManualRevision((revision) => revision + 1);
    setManualDragging(false);
    setManualNotice('手势模式：直接拖动导体棒；拖动不会把实验时间归零。');
  }, [manualSession, params.startXM]);

  useEffect(() => {
    if (JSON.stringify(params) === JSON.stringify(storedParams)) return;
    setStoredParams(params);
  }, [params, setStoredParams, storedParams]);

  useEffect(() => {
    if (!manualMode) return;
    if (!clock.playing) {
      setManualNotice('实验已暂停：拖动会自动继续计时，不会重置时间。');
    } else {
      setManualNotice((previous) =>
        previous === '实验已暂停：拖动会自动继续计时，不会重置时间。' ? null : previous,
      );
    }
  }, [clock.playing, manualMode]);

  useEffect(() => {
    if (!manualMode || !manualDragging || !clock.playing) return;
    let frame = 0;
    let last = 0;
    const tick = (now: number) => {
      if (now - last >= 40) {
        last = now;
        const session = manualSessionRef.current;
        if (session) {
          const snapshot = session.record(sampleManualTime(), manualX.current);
          setManualSnapshot(snapshot);
          setManualRevision((revision) => revision + 1);
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [clock.getTime, clock.playing, manualDragging, manualMode]);

  useEffect(() => {
    if (!manualMode || manualDragging || !clock.playing) return;
    const timer = window.setInterval(() => {
      const session = manualSessionRef.current;
      if (!session) return;
      const snapshot = session.idle(clock.getTime());
      setManualSnapshot(snapshot);
      setManualRevision((revision) => revision + 1);
    }, 100);
    return () => window.clearInterval(timer);
  }, [clock.getTime, clock.playing, manualDragging, manualMode]);

  const sampleManualTime = () => {
    const origin = manualTimeOrigin.current;
    if (!origin) return clock.getTime();
    return origin.simulationSeconds + Math.max(0, performance.now() / 1000 - origin.wallSeconds);
  };

  const applyPatch = (patch: Partial<I02Params>) => setParams((previous) => ({ ...previous, ...patch }));
  const applyPreset = (id: string) => {
    const preset = I02_PRESETS[id];
    if (!preset) return;
    setParams({ ...preset });
  };

  const handleManualStart = (xM: number) => {
    if (!clock.playing) clock.play();
    const session = manualSessionRef.current;
    if (!session) return;
    manualX.current = xM;
    manualTimeOrigin.current = {
      wallSeconds: performance.now() / 1000,
      simulationSeconds: clock.getTime(),
    };
    const snapshot = session.beginDrag(sampleManualTime(), xM);
    setManualSnapshot(snapshot);
    setManualRevision((revision) => revision + 1);
    setManualDragging(true);
    setManualNotice(null);
  };

  const handleManualMove = (xM: number) => {
    if (!clock.playing) return;
    manualX.current = xM;
    const session = manualSessionRef.current;
    if (!session) return;
    const snapshot = session.record(sampleManualTime(), xM);
    setManualSnapshot(snapshot);
    setManualRevision((revision) => revision + 1);
  };

  const handleManualEnd = () => {
    const session = manualSessionRef.current;
    if (!session) return;
    const snapshot = session.endDrag(Math.max(sampleManualTime(), session.getLastTime()));
    setManualSnapshot(snapshot);
    setManualRevision((revision) => revision + 1);
    setManualDragging(false);
    setManualNotice('松手：规定运动停止，v/ε/I/F/P 归零；这不是无外力自由滑行。');
  };

  const handleManualCancel = () => {
    const session = manualSessionRef.current;
    if (!session) return;
    const snapshot = session.cancel(Math.max(sampleManualTime(), session.getLastTime()));
    setManualSnapshot(snapshot);
    setManualRevision((revision) => revision + 1);
    setManualDragging(false);
    setManualNotice('手势已取消：未记录取消瞬间的伪速度或热量。');
  };

  const handleInitialDragStart = () => {
    initialDragWasPlaying.current = clock.playing;
    initialDragOriginalX.current = params.startXM;
    setInitialDragging(true);
    clock.pause();
  };

  const handleInitialDragChange = (xM: number) => {
    applyPatch({ startXM: Number(xM.toFixed(3)) });
  };

  const handleInitialDragEnd = () => {
    setInitialDragging(false);
    clock.restart();
    if (initialDragWasPlaying.current) clock.play();
  };

  const handleInitialDragCancel = () => {
    setInitialDragging(false);
    applyPatch({ startXM: initialDragOriginalX.current });
    clock.restart();
    if (initialDragWasPlaying.current) clock.play();
  };

  useEffect(() => {
    if (!manualMode || !manualDragging || clock.playing) return;
    const session = manualSessionRef.current;
    if (session) {
      const snapshot = session.cancel(Math.max(sampleManualTime(), session.getLastTime()));
      setManualSnapshot(snapshot);
      setManualRevision((revision) => revision + 1);
    }
    setManualDragging(false);
    setManualNotice('实验已暂停：已终止手势，不记录暂停后的假速度或热量。');
  }, [clock.playing, manualDragging, manualMode]);

  const displayedSnapshot = manualMode
    ? manualSnapshot ?? manualSession?.getSnapshot() ?? solution.initial
    : rodStateAt(solution, clock.time);
  const manualHistory = useMemo(
    () => (manualMode && manualSessionRef.current ? [...manualSessionRef.current.getHistory()] : []),
    [manualMode, manualRevision],
  );
  const chartSamples = manualMode ? manualHistory : solution.samples;
  const chartDuration = manualMode ? Math.max(8, Math.min(MANUAL_DURATION_S, Math.ceil(clock.time + 1))) : solution.durationS;
  const chartTime = manualMode ? displayedSnapshot.tS : clock.time;
  const timeLabel = formatTime(clock.time);
  const currentDirection = formatRodCurrentDirection(displayedSnapshot);
  const forceDirection =
    displayedSnapshot.magneticForceXN < -1e-12
      ? '向左（阻碍运动）'
      : displayedSnapshot.magneticForceXN > 1e-12
        ? '向右'
        : '零';
  const estimatePrefix = displayedSnapshot.estimated ? '≈ ' : '';
  const heatLabel =
    displayedSnapshot.jouleHeatJ === null
      ? '不适用'
      : `${estimatePrefix}${formatSI(displayedSnapshot.jouleHeatJ, 'J')}`;
  const workLabel =
    displayedSnapshot.externalWorkJ === null
      ? '不适用（外部手势做功未建模）'
      : formatSI(displayedSnapshot.externalWorkJ, 'J');
  const residualLabel =
    displayedSnapshot.energyResidualJ === null
      ? displayedSnapshot.status === 'boundary-stop'
        ? '接触后不再适用'
        : '不适用'
      : `${formatSI(displayedSnapshot.energyResidualJ, 'J')}（仅接触前）`;

  const teacherStats = [
    { label: '模式', value: ROD_MODE_LABEL[params.mode] },
    { label: '速度 v', value: `${estimatePrefix}${formatSI(displayedSnapshot.velocityMps, 'm/s')}` },
    { label: '电动势 ε', value: `${estimatePrefix}${formatSI(displayedSnapshot.emfV, 'V')}` },
    { label: '电流 I', value: `${estimatePrefix}${formatSI(displayedSnapshot.currentA, 'A')}` },
    { label: '安培力 F安', value: `${estimatePrefix}${formatForce(displayedSnapshot.magneticForceXN)}` },
  ];

  const teacherLayerItems: Array<{ key: keyof I02Layers; label: string }> = [
    { key: 'field', label: '磁场' },
    { key: 'flux', label: '磁通量' },
    { key: 'current', label: '电流' },
    { key: 'vectors', label: '力矢量' },
    { key: 'normal', label: '正法线' },
    { key: 'power', label: '功率流' },
    { key: 'energy', label: '能量' },
    { key: 'ghosts', label: '历史位置' },
  ];
  const teacherControls = (
    <div className="teacher-layer-bar" role="group" aria-label="I02 教师视图显示图层">
      {teacherLayerItems.map((item) => (
        <button
          key={item.key}
          type="button"
          className="teacher-layer-chip"
          aria-pressed={layers[item.key]}
          onClick={() => setLayers((previous) => ({ ...previous, [item.key]: !previous[item.key] }))}
        >
          {item.label}
        </button>
      ))}
      <button
        type="button"
        className="teacher-layer-chip teacher-formula-toggle"
        aria-pressed={formulaVisible}
        onClick={() => setFormulaVisible((value) => !value)}
      >
        公式
      </button>
    </div>
  );

  return (
    <div
      className={`sim-page ${teacher ? 'sim-teacher' : ''}`}
      data-sim-playing={clock.playing}
      data-sim-editing={manualDragging || initialDragging}
      data-sim-time={clock.time}
      data-i02-mode={params.mode}
      data-i02-manual={manualMode}
    >
      <header className="sim-header">
        <div className="sim-title-block">
          <p className="eyebrow">I02 · 模块 A · 电磁感应</p>
          <h1>单导体棒切割磁感线</h1>
          <p className="sim-subtitle">
            在同一回路中追踪 Φ、ε、I、安培力与能量；可直接用手指推拉导体棒，比较匀速、自由滑行与恒力驱动。
          </p>
        </div>
        <div className="sim-header-actions">
          {!teacher ? (
            <Segmented<LearningMode>
              ariaLabel="学习模式"
              value={learningMode}
              onChange={setLearningMode}
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
          <MovingRodStage
            solution={solution}
            snapshot={displayedSnapshot}
            params={params}
            layers={layers}
            stageMode={stageMode}
            onStageModeChange={setStageMode}
            initialDragging={initialDragging}
            onInitialDragStart={handleInitialDragStart}
            onInitialDragChange={handleInitialDragChange}
            onInitialDragEnd={handleInitialDragEnd}
            onInitialDragCancel={handleInitialDragCancel}
            manualMode={manualMode}
            manualDragging={manualDragging}
            manualResetToken={manualSignature}
            manualHistory={manualHistory}
            manualNotice={manualNotice}
            onManualStart={handleManualStart}
            onManualMove={handleManualMove}
            onManualEnd={handleManualEnd}
            onManualCancel={handleManualCancel}
          />
          {teacher ? teacherControls : null}
          {teacher ? (
            <TeacherDock
              formula={'\\varepsilon=-BLv,\\qquad I=\\frac{\\varepsilon}{R},\\qquad F_B=-\\frac{B^2L^2v}{R}'}
              stats={teacherStats}
              formulaVisible={formulaVisible}
              footnote={`${ROD_MODE_LABEL[params.mode]} · ${statusLabel(displayedSnapshot, manualMode)} · t = ${timeLabel}${
                displayedSnapshot.estimated ? ' · 手势量为估计值' : ''
              }`}
            />
          ) : null}
          <PlaybackBar
            clock={clock}
            duration={duration}
            keyFrames={clockKeyFrames}
            timeLabel={timeLabel}
            secondaryLabel={`${ROD_MODE_LABEL[params.mode]} · ${statusLabel(displayedSnapshot, manualMode)}`}
            timelineLabel="I02 实验时间轴"
            note={
              manualMode
                ? '手势模式固定 1× 实时；拖动不会重置时间。松手后由外部约束停止，不是自由惯性滑行；焦耳热由 v² 时间积分估算。'
                : '1× 约 8 秒演示完整物理区间；参数编辑保留播放/暂停状态并从 t=0 重演。B/L/R 为静态实验条件。'
            }
            speeds={manualMode ? [1] : undefined}
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
                      <p>{MODE_DESCRIPTION[params.mode]} 修改静态参数会从 t=0 重演，但保留播放/暂停意图。</p>
                    </div>
                  </div>

                  <div className="preset-chips" aria-label="快速实验">
                    <button type="button" className="chip-button" onClick={() => applyPreset('i02-default')}>S1 向右匀速</button>
                    <button type="button" className="chip-button" onClick={() => applyPreset('i02-reverse-field')}>S2 B 反向</button>
                    <button type="button" className="chip-button" onClick={() => applyPreset('i02-reverse-motion')}>S3 v 反向</button>
                    <button type="button" className="chip-button" onClick={() => applyPreset('i02-open-circuit')}>S4 开路</button>
                    <button type="button" className="chip-button" onClick={() => applyPreset('i02-free-decay')}>S5 自由滑行</button>
                    <button type="button" className="chip-button" onClick={() => applyPreset('i02-constant-force')}>S6 恒力驱动</button>
                    <button type="button" className="chip-button" onClick={() => applyPreset('i02-turnaround')}>S7 折返</button>
                    <button type="button" className="chip-button" onClick={() => applyPreset('i02-manual')}>S8 手指推拉</button>
                  </div>

                  <section className="panel-section">
                    <h3 className="section-title">运动模式</h3>
                    <Segmented<RodMode>
                      ariaLabel="I02 运动模式"
                      size="sm"
                      value={params.mode}
                      onChange={(value) => applyPatch({ mode: value })}
                      options={[
                        { value: 'constant-speed', label: '匀速切割' },
                        { value: 'free-decay', label: '自由滑行' },
                        { value: 'constant-force', label: '恒力驱动' },
                        { value: 'manual-drag', label: '手指推拉' },
                      ]}
                    />
                    <p className="param-description">{MODE_DESCRIPTION[params.mode]}</p>
                  </section>

                  <section className="panel-section">
                    <h3 className="section-title">磁场与回路</h3>
                    <div className="field-label-row">
                      <div>
                        <span className="field-label">磁场方向</span>
                        <p className="field-hint">B 的正方向为垂直纸面向外 ⊙</p>
                      </div>
                      <Segmented
                        ariaLabel="I02 磁场方向"
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
                      label="导轨间距 L"
                      value={params.lengthM}
                      min={0.2}
                      max={2}
                      step={0.1}
                      unit="m"
                      decimals={1}
                      onChange={(value) => applyPatch({ lengthM: value })}
                    />
                    <ParamSlider
                      label="回路电阻 R"
                      value={params.resistanceOhm}
                      min={0.1}
                      max={10}
                      step={0.1}
                      unit="Ω"
                      decimals={1}
                      onChange={(value) => applyPatch({ resistanceOhm: value })}
                    />
                    <ParamSlider
                      label="导体棒质量 m"
                      value={params.massKg}
                      min={0.1}
                      max={5}
                      step={0.1}
                      unit="kg"
                      decimals={1}
                      onChange={(value) => applyPatch({ massKg: value })}
                    />
                    <ToggleSwitch
                      label="闭合回路（关闭后为开路）"
                      checked={params.circuitClosed}
                      onChange={(checked) => applyPatch({ circuitClosed: checked })}
                    />
                  </section>

                  <section className="panel-section">
                    <h3 className="section-title">运动参数</h3>
                    {params.mode !== 'manual-drag' ? (
                      <ParamSlider
                        label={params.mode === 'constant-speed' ? '设定速度 v_set' : '初速度 v₀'}
                        value={params.initialSpeedMps}
                        min={-3}
                        max={3}
                        step={0.1}
                        unit="m/s"
                        decimals={1}
                        onChange={(value) => applyPatch({ initialSpeedMps: value })}
                      />
                    ) : (
                      <p className="param-description">
                        手动模式下初始速度不参与计算；速度由拖动样本估计。触摸导体棒即可推拉。
                      </p>
                    )}
                    {params.mode === 'constant-force' ? (
                      <ParamSlider
                        label="恒定外力 F_ext"
                        value={params.externalForceN}
                        min={-3}
                        max={3}
                        step={0.1}
                        unit="N"
                        decimals={1}
                        onChange={(value) => applyPatch({ externalForceN: value })}
                        description={`终端速度 v∞ = F_ext/k，当前 ${solution.terminalVelocityMps === null ? '不适用' : formatSI(solution.terminalVelocityMps, 'm/s')}。`}
                      />
                    ) : null}
                    <ParamSlider
                      label={params.mode === 'manual-drag' ? '初始位置 x₀' : '初始位置 x₀'}
                      value={params.startXM}
                      min={0.05}
                      max={8}
                      step={0.05}
                      unit="m"
                      decimals={2}
                      domain={PARAMETER_DOMAINS.i02StartX}
                      onChange={(value) => applyPatch({ startXM: value })}
                      description="x 必须大于 0；左端 x=0 是真实接触边界，面积不能变为负。"
                    />
                    {params.mode === 'constant-speed' ? (
                      <p className="param-description">
                        匀速所需外力 F_ext = −F安 = (B²L²/R)v_set；开路或 B=0 时为 0。
                      </p>
                    ) : null}
                  </section>

                  <section className="panel-section">
                    <h3 className="section-title">显示图层</h3>
                    <div className="toggle-list">
                      <ToggleSwitch label="磁场符号" checked={layers.field} onChange={(checked) => setLayers({ ...layers, field: checked })} />
                      <ToggleSwitch label="磁通量区域" checked={layers.flux} onChange={(checked) => setLayers({ ...layers, flux: checked })} />
                      <ToggleSwitch label="感应电流" checked={layers.current} onChange={(checked) => setLayers({ ...layers, current: checked })} />
                      <ToggleSwitch label="速度与力矢量" checked={layers.vectors} onChange={(checked) => setLayers({ ...layers, vectors: checked })} />
                      <ToggleSwitch label="历史位置" checked={layers.ghosts} onChange={(checked) => setLayers({ ...layers, ghosts: checked })} />
                    </div>
                  </section>

                  <button
                    type="button"
                    className="secondary-button wide-button"
                    onClick={() => {
                      setParams({ ...I02_DEFAULT });
                      setLayers({ ...I02_DEFAULT_LAYERS });
                    }}
                  >
                    <Icon name="reset" size={17} />
                    恢复默认参数与图层
                  </button>
                </div>
              ) : null}

              {tab === 'lesson' ? (
                <LessonRunner
                  steps={I02_LESSON}
                  storageKey="emplab.i02.lesson.v1"
                  overview={{
                    goals: [
                      '用 ε=−BLv 与楞次定律判断感应电动势、电流和安培力方向。',
                      '把 Φ=B L x、dΦ/dt 与 ε 统一到同一物理状态。',
                      '解释匀速切割 P_ext=P_J、自由滑行 K+Q_J 守恒、恒力驱动趋近终端速度。',
                    ],
                    prerequisites: [
                      '磁通量 Φ=B·S、法拉第电磁感应定律与楞次定律。',
                      '闭合电路欧姆定律 I=ε/R 与安培力 F=BIL。',
                      '动能定理与功率 P=Fv。',
                    ],
                    misconceptions: [
                      '认为磁场越强，感应电动势一定越大（还需要看速度）。',
                      '认为开路时动生电动势也消失，或认为开路仍有闭合电流。',
                      '认为自由滑行时速度线性减小，或把接触停止的机械能损失算成焦耳热。',
                    ],
                  }}
                  onApplyPreset={applyPreset}
                  onGoPractice={() => setTab('practice')}
                />
              ) : null}

              {tab === 'practice' ? <PracticePanel modelId="i02" /> : null}

              {tab === 'data' ? (
                <div className="panel-section-stack">
                  <div className="panel-intro">
                    <div>
                      <h2>实时数据</h2>
                      <p>
                        当前 t = {timeLabel}；所有读数与曲线来自同一物理快照。
                        {manualMode ? ' 手势模式的速度、电动势、电流、力与焦耳热均为估计值。' : ''}
                      </p>
                    </div>
                  </div>

                  <ReadoutGrid
                    items={[
                      { label: '模式', value: ROD_MODE_LABEL[params.mode], hint: MODE_DESCRIPTION[params.mode], testId: 'i02-mode' },
                      { label: '状态', value: statusLabel(displayedSnapshot, manualMode), testId: 'i02-status' },
                      { label: '位置 x', value: formatSI(displayedSnapshot.xM, 'm'), hint: '回路面积 A=Lx', testId: 'i02-x' },
                      {
                        label: '速度 v',
                        value: `${estimatePrefix}${formatSI(displayedSnapshot.velocityMps, 'm/s')}`,
                        hint: displayedSnapshot.estimated ? '由最近约 120 ms 时间戳样本估计' : '来自解析解',
                        testId: 'i02-velocity',
                      },
                      { label: '磁通量 Φ', value: formatSI(displayedSnapshot.fluxWb, 'Wb'), hint: '取 +z 为回路正法向；开路时仍作为几何参考', testId: 'i02-flux' },
                      {
                        label: '电动势 ε',
                        value: `${estimatePrefix}${formatSI(displayedSnapshot.emfV, 'V')}`,
                        hint: 'ε = −Bz L v，正值驱动逆时针电流',
                        testId: 'i02-emf',
                      },
                      {
                        label: '电流 I',
                        value: `${estimatePrefix}${formatSI(displayedSnapshot.currentA, 'A')}`,
                        hint: currentDirection,
                        testId: 'i02-current',
                      },
                      {
                        label: '安培力 F安',
                        value: `${estimatePrefix}${formatForce(displayedSnapshot.magneticForceXN)}`,
                        hint: forceDirection,
                        testId: 'i02-force',
                      },
                      {
                        label: '焦耳功率 P_J',
                        value: `${estimatePrefix}${formatSI(displayedSnapshot.joulePowerW, 'W')}`,
                        hint: 'P_J = I²R ≥ 0',
                        testId: 'i02-power',
                      },
                      {
                        label: '焦耳热 Q_J',
                        value: heatLabel,
                        hint: manualMode ? '∫P_J dt 的手势积分估算' : '解析热积分',
                        testId: 'i02-heat',
                      },
                      {
                        label: '动能 K',
                        value: formatSI(displayedSnapshot.kineticEnergyJ, 'J'),
                        hint: 'K = ½mv²',
                        testId: 'i02-kinetic',
                      },
                      { label: '外力功 W_ext', value: workLabel, testId: 'i02-work' },
                      {
                        label: '能量残差',
                        value: residualLabel,
                        hint: '自由/恒力/匀速仅在接触前检查',
                        testId: 'i02-residual',
                      },
                      {
                        label: '终端速度 v∞',
                        value: solution.terminalVelocityMps === null ? '—' : formatSI(solution.terminalVelocityMps, 'm/s'),
                        hint: params.mode === 'constant-force' ? 'F_ext/k（k>0）' : '仅恒力模式适用',
                        testId: 'i02-terminal',
                      },
                      {
                        label: '左端事件',
                        value: solution.boundaryTimeS === null ? '无（窗口内）' : formatTime(solution.boundaryTimeS),
                        hint: solution.boundaryTimeS === null ? '未触及 x=0' : '首次接触后停止，接触耗散不计入 Q_J',
                        testId: 'i02-boundary',
                      },
                    ]}
                  />

                  <MovingRodCharts
                    samples={chartSamples}
                    snapshot={displayedSnapshot}
                    duration={chartDuration}
                    time={chartTime}
                    manual={manualMode}
                  />

                  <section className="event-section">
                    <h3 className="section-title">物理事件</h3>
                    {solution.events.length > 0 ? (
                      <div className="event-list">
                        {solution.events.map((event) => (
                          <button
                            key={`${event.kind}-${event.tS}`}
                            type="button"
                            className="event-item"
                            onClick={() => clock.setTime(event.tS)}
                          >
                            <span className="event-time">{formatTime(event.tS)}</span>
                            <span className="event-label">{event.label}</span>
                            <span className="event-value">
                              v {formatSI(event.velocityMps, 'm/s')} · ε {formatSI(event.emfV, 'V')} · I {formatSI(event.currentA, 'A')}
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="muted-text">当前参数在演示时间窗内没有接触或速度过零事件。</p>
                    )}
                  </section>

                  <section className="formula-card">
                    <p className="eyebrow">符号约定与公式</p>
                    <MathTex block>{'\\Phi=B_zLx,\\qquad \\varepsilon=-\\frac{d\\Phi}{dt}=-B_zLv,\\qquad I=\\frac{\\varepsilon}{R}'}</MathTex>
                    <MathTex block>{'F_B=I L B_z=-\\frac{B_z^2L^2}{R}v,\\qquad P_J=I^2R=\\frac{B_z^2L^2}{R}v^2'}</MathTex>
                    <p className="formula-result">
                      当前 Φ ≈ {formatSI(displayedSnapshot.fluxWb, 'Wb')}，ε ≈{' '}
                      {estimatePrefix}{formatSI(displayedSnapshot.emfV, 'V')}，I ≈{' '}
                      {estimatePrefix}{formatSI(displayedSnapshot.currentA, 'A')}，F安 ≈{' '}
                      {estimatePrefix}{formatForce(displayedSnapshot.magneticForceXN)}
                    </p>
                  </section>

                  {!params.circuitClosed ? (
                    <div className="callout callout-warning">
                      <Icon name="info" size={18} />
                      <p>开路：导体棒两端仍有动生电动势 ε=−BzLv，但 I=0、F安=0、P_J=0，不绘制不存在的闭合环流。</p>
                    </div>
                  ) : null}

                  {manualMode ? (
                    <div className="callout callout-note" data-testid="i02-manual-data-note">
                      <Icon name="info" size={18} />
                      <p>
                        手势推拉是外部规定的运动：松手后由外部约束停止，不是自由惯性滑行；停手瞬间的机械能去向不属于焦耳热。
                        速度使用最近约 120 ms 的位置序列做线性回归，异常大 dt 会被拒绝，不累计伪热量。
                      </p>
                    </div>
                  ) : null}

                  {solution.boundaryTimeS !== null ? (
                    <div className="callout callout-warning">
                      <Icon name="info" size={18} />
                      <p>导体棒会在 {formatTime(solution.boundaryTimeS)} 首次接触左端 x=0；之后运动冻结，接触耗散不计入 Q_J。</p>
                    </div>
                  ) : null}

                  {solution.issue ? (
                    <div className="callout callout-warning">
                      <Icon name="info" size={18} />
                      <p>{solution.issue}</p>
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
