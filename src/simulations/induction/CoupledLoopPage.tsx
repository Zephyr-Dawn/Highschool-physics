import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { usePersistentState } from '../../hooks/usePersistentState';
import { usePlaybackClock } from '../../hooks/usePlaybackClock';
import { formatNumber, formatSI, formatTime } from '../../lib/format';
import { I05_LESSON } from '../../content/lessons';
import { questionsForModel } from '../../content/questions';
import { ParamSlider, MathTargetInput } from '../../components/ParamSlider';
import { PARAMETER_DOMAINS } from '../../math/parameterValidation';
import { Segmented } from '../../components/Segmented';
import { ToggleSwitch } from '../../components/ToggleSwitch';
import { PanelTabs } from '../../components/PanelTabs';
import { PlaybackBar, type KeyFrame } from '../../components/PlaybackBar';
import { ReadoutGrid } from '../../components/ReadoutGrid';
import { TeacherDock } from '../../components/TeacherDock';
import { Icon } from '../../components/Icon';
import { MathTex } from '../../components/MathTex';
import { LessonRunner } from '../../features/lesson/LessonRunner';
import { PracticePanel } from '../../features/practice/PracticePanel';
import type { StageMode } from '../../components/StageToolbar';
import {
  solveI05,
  stateAtI05Time,
} from '../../physics/induction/movingLoopSolver';
import {
  type I05FieldSource,
  type I05Params,
  type I05Snapshot,
  type I05Solution,
} from '../../physics/induction/movingLoopTimeField';
import {
  applyManualTarget,
  createManualTimeline,
  type ManualFieldTimeline,
} from '../../physics/induction/timeVaryingField';
import { ManualLoopSession } from '../../physics/induction/manualLoopMotion';
import { I05Charts } from './I05Charts';
import { I05Stage } from './I05Stage';
import {
  I05_DEFAULT_LAYERS,
  I05_PRESETS,
  I05_SCENE_STORAGE_KEY,
  decodeI05SceneJson,
  loadInitialI05Scene,
  parseI05StoredScene,
  serializeI05Scene,
  type I05Layers,
  type I05Scene,
} from './i05Scene';

type PanelTabId = 'params' | 'lesson' | 'practice' | 'data';
type LearningMode = 'guided' | 'free';

const MODE_ITEMS: Array<{ id: I05Params['mode']; title: string; subtitle: string }> = [
  { id: 'prescribed', title: 'M1 匀速约束', subtitle: '外部保持匀速度，求所需外力与能量' },
  { id: 'dynamic', title: 'M2 自由动力学', subtitle: '外力 + 磁场力耦合，数值 ODE' },
  { id: 'manual-b', title: 'M3 手动调磁', subtitle: '播放中拖动 B，0.4 s ramp / 4 T·s⁻¹' },
  { id: 'manual-x', title: 'M4 手动拖线框', subtitle: '手指移动线框，速度由时间戳估计' },
];

const LAYER_ITEMS: Array<{ key: keyof I05Layers; label: string }> = [
  { key: 'field', label: '磁场符号与条带' },
  { key: 'overlap', label: '有效重叠面积与历史' },
  { key: 'current', label: '感应电流方向' },
  { key: 'velocity', label: '速度与动生 EMF' },
  { key: 'force', label: '磁场力' },
  { key: 'emfDecomposition', label: 'ε_t / ε_m 分解' },
  { key: 'energy', label: '能量读数' },
  { key: 'events', label: '状态与事件提示' },
  { key: 'maskAnswers', label: '遮蔽方向/数值答案（先预测）' },
];

export function CoupledLoopPage() {
  const initialScene = useMemo(() => loadInitialI05Scene(), []);
  const [storedScene, setStoredScene] = usePersistentState<unknown>(
    I05_SCENE_STORAGE_KEY,
    initialScene,
  );
  const scene = useMemo(
    () => parseI05StoredScene(storedScene).scene ?? initialScene,
    [initialScene, storedScene],
  );
  const params = scene.params;
  const layers = scene.layers;
  const [learningMode, setLearningMode] = usePersistentState<LearningMode>('emplab.i05.mode.v1', 'guided');
  const [teacher, setTeacher] = useState(false);
  const [stageMode, setStageMode] = useState<StageMode>('interact');
  const [tab, setTab] = useState<PanelTabId>(learningMode === 'guided' ? 'lesson' : 'params');
  const [notice, setNotice] = useState<string | null>(null);
  const [manualTimeline, setManualTimeline] = useState<ManualFieldTimeline>(() =>
    createManualTimeline(params.manualStartBzTesla),
  );
  const [manualTarget, setManualTarget] = useState(params.manualStartBzTesla);
  const [manualLimited, setManualLimited] = useState(false);
  const [manualDragging, setManualDragging] = useState(false);
  const [manualSnapshot, setManualSnapshot] = useState<I05Snapshot | null>(null);
  const [manualHistory, setManualHistory] = useState<I05Snapshot[]>([]);
  const [manualRevision, setManualRevision] = useState(0);
  const [searchParams] = useSearchParams();
  const presetId = searchParams.get('preset');
  const appliedPresetRef = useRef<string | null>(null);
  const importRef = useRef<HTMLInputElement | null>(null);
  const noticeTimer = useRef<number | null>(null);
  const manualSessionRef = useRef<ManualLoopSession | null>(null);
  const manualOriginRef = useRef<{ wallSeconds: number; simulationSeconds: number } | null>(null);
  const manualXRef = useRef(params.startXM);

  const sceneRef = useRef(scene);
  sceneRef.current = scene;
  const paramsSignature = JSON.stringify(params);

  const showNotice = useCallback((text: string) => {
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
    setNotice(text);
    noticeTimer.current = window.setTimeout(() => {
      setNotice(null);
      noticeTimer.current = null;
    }, 3200);
  }, []);
  useEffect(() => () => {
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
  }, []);

  const commitScene = useCallback(
    (next: I05Scene) => setStoredScene(next),
    [setStoredScene],
  );

  const fieldSource = useMemo<I05FieldSource>(
    () =>
      params.mode === 'manual-b'
        ? { kind: 'manual', timeline: manualTimeline }
        : { kind: 'waveform', waveform: params.waveform },
    [manualTimeline, params.mode, params.waveform],
  );

  const solvedSolution = useMemo(() => solveI05(params, fieldSource), [fieldSource, params]);

  const manualSolution = useMemo<I05Solution>(() => {
    const initial = manualHistory[0] ?? manualSnapshot ?? solvedSolution.initial;
    const final = manualHistory[manualHistory.length - 1] ?? manualSnapshot ?? initial;
    const samples = manualHistory.length > 0 ? manualHistory : [initial];
    return {
      params,
      fieldSource,
      sourceKind: fieldSource.kind,
      initial,
      final,
      samples,
      events: [],
      keyTimesS: [0, ...samples.map((sample) => sample.timeS), params.durationS]
        .filter((time) => Number.isFinite(time))
        .sort((a, b) => a - b),
      durationS: params.durationS,
      status: 'ok',
      issue: null,
    };
  }, [fieldSource, manualHistory, manualSnapshot, params, solvedSolution.initial]);

  const manualX = params.mode === 'manual-x';
  const manualB = params.mode === 'manual-b';
  const solution = manualX ? manualSolution : solvedSolution;
  const keyFrames: KeyFrame[] = useMemo(() => {
    const frames: KeyFrame[] = [{ time: 0, label: '起点' }];
    for (const event of solution.events) {
      if (event.timeS > 0 && event.timeS < solution.durationS - 1e-9) {
        frames.push({ time: event.timeS, label: event.label });
      }
    }
    frames.push({ time: solution.durationS, label: '结束' });
    const seen = new Set<string>();
    return frames.filter((frame) => {
      const key = frame.time.toFixed(7);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [solution.durationS, solution.events]);

  const clock = usePlaybackClock(params.durationS, keyFrames.map((frame) => frame.time), {
    realTime: manualB || manualX,
  });
  const snapshot = manualX
    ? manualSnapshot ?? solution.initial
    : stateAtI05Time(solvedSolution, clock.time);

  useEffect(() => {
    if (!manualB && !manualX) return;
    clock.setSpeed(1);
  }, [clock.setSpeed, manualB, manualX]);

  useEffect(() => {
    setTab(learningMode === 'guided' ? 'lesson' : 'params');
    setTeacher(false);
  }, [learningMode]);

  useEffect(() => {
    const preset = presetId ? I05_PRESETS[presetId] : undefined;
    if (!preset || appliedPresetRef.current === presetId) return;
    appliedPresetRef.current = presetId;
    commitScene({
      schemaVersion: 2,
      model: 'i05',
      params: { ...preset, waveform: { ...preset.waveform } },
      layers: { ...I05_DEFAULT_LAYERS },
    });
    setManualSnapshot(null);
    setManualHistory([]);
    setManualDragging(false);
    setManualTimeline(createManualTimeline(preset.manualStartBzTesla));
    setManualTarget(preset.manualStartBzTesla);
    setManualLimited(false);
    clock.reset();
    showNotice('已载入 I05 可复现预设 · 实验定义重建，t=0');
  }, [clock.reset, commitScene, presetId, showNotice]);

  // A parameter edit is an experiment-definition change, not a live gesture.
  useEffect(() => {
    clock.reset();
    setManualDragging(false);
    setManualOriginRefNull();
    manualXRef.current = params.startXM;
    if (params.mode === 'manual-b') {
      setManualTimeline(createManualTimeline(params.manualStartBzTesla));
      setManualTarget(params.manualStartBzTesla);
      setManualLimited(false);
    }
    if (params.mode === 'manual-x') {
      const session = new ManualLoopSession(params, fieldSource);
      const initial = session.reset(0, params.startXM);
      manualSessionRef.current = session;
      setManualSnapshot(initial);
      setManualHistory([initial]);
      setManualRevision((value) => value + 1);
    } else {
      manualSessionRef.current = null;
      setManualSnapshot(null);
      setManualHistory([]);
    }
    // paramsSignature intentionally owns this reset; fieldSource follows params.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramsSignature]);

  const setManualOriginRefNull = () => {
    manualOriginRef.current = null;
  };

  const updateParams = (patch: Partial<I05Params>, message = '实验参数改变：定义重建，t=0') => {
    commitScene({
      ...sceneRef.current,
      params: { ...params, ...patch, waveform: patch.waveform ?? params.waveform },
    });
    showNotice(message);
  };

  const updateWaveform = (patch: Partial<I05Params['waveform']>) => {
    updateParams({ waveform: { ...params.waveform, ...patch } }, 'B(t) 波形改变：实验定义重建，t=0');
  };

  const applyPreset = (id: string) => {
    const preset = I05_PRESETS[id];
    if (!preset) return;
    commitScene({
      schemaVersion: 2,
      model: 'i05',
      params: { ...preset, waveform: { ...preset.waveform } },
      layers: { ...I05_DEFAULT_LAYERS },
    });
    setManualSnapshot(null);
    setManualHistory([]);
    setManualDragging(false);
    setManualTimeline(createManualTimeline(preset.manualStartBzTesla));
    setManualTarget(preset.manualStartBzTesla);
    setManualLimited(false);
    clock.reset();
    showNotice('已载入 I05 预设 · 实验定义重建，t=0');
  };

  const setMode = (mode: I05Params['mode']) => {
    if (mode === params.mode) return;
    updateParams({ mode }, `切换 ${MODE_ITEMS.find((item) => item.id === mode)?.title ?? mode}：实验定义重建，t=0`);
  };

  const exportScene = () => {
    const blob = new Blob([serializeI05Scene(sceneRef.current)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'i05-scene.json';
    anchor.click();
    URL.revokeObjectURL(url);
    showNotice('I05 场景已导出为 JSON');
  };

  const importScene = async (file: File) => {
    const text = await file.text();
    const parsed = decodeI05SceneJson(text);
    if (!parsed.scene) {
      showNotice(`I05 场景导入失败：${parsed.error ?? '格式无效'}`);
      return;
    }
    commitScene(parsed.scene);
    setManualSnapshot(null);
    setManualHistory([]);
    setManualDragging(false);
    clock.reset();
    showNotice('I05 场景已导入 · 从 t=0 重建');
  };

  const sampleManualTime = () => {
    const origin = manualOriginRef.current;
    if (!origin) return clock.getTime();
    return origin.simulationSeconds + Math.max(0, performance.now() / 1000 - origin.wallSeconds);
  };

  const manualEnabled = (manualB || manualX) && clock.playing;

  const updateManualSessionState = (snapshotValue: I05Snapshot, session: ManualLoopSession) => {
    setManualSnapshot(snapshotValue);
    setManualHistory([...session.getHistory()]);
    setManualRevision((value) => value + 1);
  };

  const handleManualStart = (xM: number) => {
    if (!manualX) return;
    if (!clock.playing) clock.play();
    if (!manualSessionRef.current) {
      manualSessionRef.current = new ManualLoopSession(params, fieldSource);
      manualSessionRef.current.reset(clock.getTime(), xM);
    }
    const session = manualSessionRef.current;
    manualXRef.current = xM;
    manualOriginRef.current = {
      wallSeconds: performance.now() / 1000,
      simulationSeconds: clock.getTime(),
    };
    const snapshotValue = session.beginDrag(sampleManualTime(), xM);
    updateManualSessionState(snapshotValue, session);
    setManualDragging(true);
    showNotice('正在拖动线框：速度由真实时间戳估计；第二指可安全取消');
  };

  const handleManualChange = (xM: number) => {
    if (!manualX || !clock.playing) return;
    const session = manualSessionRef.current;
    if (!session) return;
    manualXRef.current = xM;
    updateManualSessionState(session.record(sampleManualTime(), xM), session);
  };

  const handleManualEnd = () => {
    const session = manualSessionRef.current;
    if (!session) return;
    updateManualSessionState(session.endDrag(Math.max(sampleManualTime(), session.getLastTime())), session);
    setManualDragging(false);
    manualOriginRef.current = null;
    showNotice('松手：线框由外部保持静止；当前若 B 仍变化，感生电流仍可由 ε_t 产生');
  };

  const handleManualCancel = () => {
    const session = manualSessionRef.current;
    if (!session) return;
    updateManualSessionState(session.cancel(Math.max(sampleManualTime(), session.getLastTime())), session);
    setManualDragging(false);
    manualOriginRef.current = null;
    showNotice('手势已取消：未记录取消瞬间的伪速度或热量');
  };

  useEffect(() => {
    if (!manualX || !manualDragging || !clock.playing) return;
    let frame = 0;
    let last = 0;
    const tick = (now: number) => {
      if (now - last >= 40) {
        last = now;
        const session = manualSessionRef.current;
        if (session) {
          updateManualSessionState(
            session.record(sampleManualTime(), manualXRef.current),
            session,
          );
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [clock.playing, manualDragging, manualX]);

  useEffect(() => {
    if (!manualX || manualDragging || !clock.playing) return;
    const timer = window.setInterval(() => {
      const session = manualSessionRef.current;
      if (!session) return;
      updateManualSessionState(session.idle(clock.getTime()), session);
    }, 100);
    return () => window.clearInterval(timer);
  }, [clock.getTime, clock.playing, manualDragging, manualX]);

  useEffect(() => {
    if (!manualX || !manualDragging || clock.playing) return;
    handleManualCancel();
    // The cancel helper is intentionally ref-stable enough for this transition.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clock.playing, manualDragging, manualX]);

  const commitManualBTarget = (target: number): string | null => {
    if (!manualB) return '当前不是 M3 手动调磁模式。';
    if (!clock.playing) {
      const message = '暂停中不会记录手动调磁；请先按播放。';
      showNotice(message);
      return message;
    }
    const lastEventTime = manualTimeline.keyframes[manualTimeline.keyframes.length - 1]?.tS ?? 0;
    if (clock.getTime() < lastEventTime - 1e-9) {
      const message = '当前正在查看较早的手动 B 历史；请回到最新时刻或复位后再追加目标。';
      showNotice(message);
      return message;
    }
    const result = applyManualTarget(manualTimeline, clock.getTime(), target);
    setManualTimeline(result.timeline);
    setManualTarget(result.appliedTargetBzTesla);
    setManualLimited(result.limited);
    setManualRevision((value) => value + 1);
    showNotice(result.limited
      ? `目标受 0.4 s / 4 T·s⁻¹ 限速，实际目标 ${formatNumber(result.appliedTargetBzTesla, 3)} T`
      : '已追加手动 B 目标；B(t) 按有限斜率连续变化，时间轴不重置');
    return null;
  };

  const handleBHandleTarget = (target: number) => {
    commitManualBTarget(target);
  };

  const updateLayers = (patch: Partial<I05Layers>) => {
    commitScene({ ...sceneRef.current, layers: { ...layers, ...patch } });
  };

  const teacherControls = (
    <div className="teacher-layer-bar" role="group" aria-label="I05 教师图层">
      {LAYER_ITEMS.map((item) => (
        <button
          key={item.key}
          type="button"
          className="teacher-layer-chip"
          aria-pressed={layers[item.key]}
          onClick={() => updateLayers({ [item.key]: !layers[item.key] } as Partial<I05Layers>)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );

  const timeLabel = formatTime(clock.time);
  const modeLabel = MODE_ITEMS.find((item) => item.id === params.mode)?.title ?? params.mode;
  const questionCount = questionsForModel('i05').length;
  const phaseAngleDeg = (params.waveform.phaseRad * 180) / Math.PI;
  const lastManualTime = manualTimeline.keyframes[manualTimeline.keyframes.length - 1]?.tS ?? 0;

  return (
    <div className={`sim-page ${teacher ? 'sim-teacher' : ''}`} data-sim-playing={clock.playing} data-sim-time={clock.time} data-i05-mode={params.mode} data-manual-revision={manualRevision}>
      <header className="sim-header">
        <div className="sim-title-block">
          <p className="eyebrow">I05 · 模块 B · 电磁感应</p>
          <h1>时变磁场中的运动线框</h1>
          <p className="sim-subtitle">
            同一个矩形线框同时经历感生电动势 ε_t = −N hℓ dB/dt 与动生电动势 ε_m = −N hB g vx；用同一快照追踪 Φ、I、F、能量与边界事件。
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
          <I05Stage
            params={params}
            snapshot={snapshot}
            solution={solution}
            layers={layers}
            stageMode={stageMode}
            onStageModeChange={setStageMode}
            initialDragEnabled={!clock.playing}
            manualEnabled={manualEnabled}
            manualDragging={manualDragging}
            onInitialLoopChange={(xM) => updateParams({ startXM: xM }, '拖动初态：线框初始位置改变，实验从 t=0 重建')}
            onManualStart={handleManualStart}
            onManualChange={handleManualChange}
            onManualEnd={handleManualEnd}
            onManualCancel={handleManualCancel}
            onManualBTarget={handleBHandleTarget}
            bTarget={manualTarget}
          />
          {notice ? <div className="stage-condition-notice" data-testid="i05-condition-notice" role="status">{notice}</div> : null}
          {teacher ? (
            <TeacherDock
              formula={'\\Phi=B_z h\\ell,\\quad \\varepsilon_t=-Nh\\ell\\dot B_z,\\quad \\varepsilon_m=-NhB_zgv_x,\\quad F_{Bx}=NIhB_zg'}
              stats={[
                { label: '模式', value: modeLabel },
                { label: 'x', value: `${formatNumber(snapshot.xM, 3)} m` },
                { label: 'vx', value: `${formatNumber(snapshot.velocityMps, 3)} m/s` },
                { label: 'ε_t', value: snapshot.emfTransformerV === null ? '—' : formatSI(snapshot.emfTransformerV, 'V') },
                { label: 'ε_m', value: snapshot.emfMotionalV === null ? '—' : formatSI(snapshot.emfMotionalV, 'V') },
                { label: 'ε 总', value: snapshot.emfTotalV === null ? '—' : formatSI(snapshot.emfTotalV, 'V') },
                { label: 'I', value: snapshot.currentA === null ? '—' : formatSI(snapshot.currentA, 'A') },
                { label: 'F_Bx', value: snapshot.magneticForceX === null ? '—' : formatSI(snapshot.magneticForceX, 'N') },
                { label: '能量残差', value: snapshot.energyResidualJ === null ? '不适用' : formatSI(snapshot.energyResidualJ, 'J') },
              ]}
              footnote={`t = ${timeLabel} · ${snapshot.status} · ${manualLimited ? 'B 目标受限速' : 'B 斜率正常'}`}
              controls={teacherControls}
            />
          ) : null}
          <PlaybackBar
            clock={clock}
            duration={params.durationS}
            keyFrames={keyFrames}
            timeLabel={timeLabel}
            secondaryLabel={`${modeLabel} · x=${formatNumber(snapshot.xM, 2)} m${manualB ? ` · 目标 ${formatNumber(manualTarget, 2)} T` : ''}`}
            timelineLabel="I05 同一全局仿真时间轴"
            note={manualB || manualX
              ? '手动模式固定 1× 真实仿真时间；暂停时不记录手势或 B 目标，历史不重置。'
              : 'B(t)、x(t)、EMF 和能量积分共用仿真时间；拖动时间轴只查看同一确定性解。'}
            speeds={manualB || manualX ? [1] : undefined}
          />
        </div>

        {!teacher ? (
          <aside className="sim-panel" aria-label="I05 实验控制台">
            <PanelTabs<PanelTabId>
              label="实验面板"
              active={tab}
              onChange={setTab}
              tabs={[
                { id: 'params', label: '参数', icon: <Icon name="sliders" size={16} /> },
                { id: 'lesson', label: '讲解', icon: <Icon name="book" size={16} /> },
                { id: 'practice', label: '练习', count: questionCount, icon: <Icon name="check" size={16} /> },
                { id: 'data', label: '数据与图像', icon: <Icon name="ruler" size={16} /> },
              ]}
            />
            <div className="sim-panel-body" role="tabpanel">
              {tab === 'params' ? (
                <div className="panel-section-stack">
                  <div className="panel-intro">
                    <div>
                      <h2>感生 + 动生 · 同一回路</h2>
                      <p>模式或波形改变是实验定义重建；M3/M4 中的手指调磁与拖动不重置时间轴。</p>
                    </div>
                  </div>
                  <div className="mode-card-grid" role="group" aria-label="I05 交互模式">
                    {MODE_ITEMS.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={`mode-card ${params.mode === item.id ? 'is-active' : ''}`}
                        aria-pressed={params.mode === item.id}
                        onClick={() => setMode(item.id)}
                        data-testid={`i05-mode-${item.id}`}
                      >
                        <strong>{item.title}</strong>
                        <span>{item.subtitle}</span>
                      </button>
                    ))}
                  </div>
                  <div className="preset-chips" aria-label="I05 预设">
                    {Object.keys(I05_PRESETS).map((id) => (
                      <button key={id} type="button" className="chip-button" onClick={() => applyPreset(id)} data-testid={`i05-preset-${id}`}>
                        {id.replace('i05-', '')}
                      </button>
                    ))}
                  </div>

                  <section className="panel-section">
                    <h3 className="section-title">几何与回路</h3>
                    <ParamSlider label="线框宽度 w" value={params.widthM} min={0.2} max={3} step={0.1} unit="m" decimals={2} domain={PARAMETER_DOMAINS.positiveLength} onChange={(value) => updateParams({ widthM: value })} />
                    <ParamSlider label="线框高度 h" value={params.heightM} min={0.1} max={2} step={0.1} unit="m" decimals={2} domain={PARAMETER_DOMAINS.positiveLength} onChange={(value) => updateParams({ heightM: value })} />
                    <ParamSlider label="磁场左边界 a" value={params.fieldLeftM} min={-2} max={2} step={0.1} unit="m" decimals={2} validateValue={(value) => value < params.fieldRightM ? null : '左边界 a 必须小于右边界 b。'} onChange={(value) => updateParams({ fieldLeftM: value })} />
                    <ParamSlider label="磁场右边界 b" value={params.fieldRightM} min={0} max={5} step={0.1} unit="m" decimals={2} validateValue={(value) => value > params.fieldLeftM ? null : '右边界 b 必须大于左边界 a。'} onChange={(value) => updateParams({ fieldRightM: value })} />
                    <ParamSlider label="匝数 N" value={params.turns} min={1} max={20} step={1} unit="turn" decimals={0} domain={PARAMETER_DOMAINS.turns} onChange={(value) => updateParams({ turns: value })} />
                    <ParamSlider label="总电阻 R" value={params.resistanceOhm} min={0.1} max={20} step={0.1} unit="Ω" decimals={2} domain={PARAMETER_DOMAINS.resistance} onChange={(value) => updateParams({ resistanceOhm: value })} />
                    <ParamSlider label="线框质量 m" value={params.massKg} min={0.1} max={5} step={0.1} unit="kg" decimals={2} domain={PARAMETER_DOMAINS.positiveMass} onChange={(value) => updateParams({ massKg: value })} />
                    <ToggleSwitch label="闭合回路（关闭为开路）" checked={params.circuitClosed} onChange={(checked) => updateParams({ circuitClosed: checked })} />
                  </section>

                  <section className="panel-section">
                    <h3 className="section-title">初态与驱动力</h3>
                    <ParamSlider label="初始位置 x₀" value={params.startXM} min={-2} max={2} step={0.05} unit="m" decimals={2} onChange={(value) => updateParams({ startXM: value })} />
                    <ParamSlider label="初速度 vx₀" value={params.initialSpeedMps} min={-3} max={3} step={0.1} unit="m/s" decimals={2} domain={PARAMETER_DOMAINS.signedSpeed} onChange={(value) => updateParams({ initialSpeedMps: value })} />
                    {params.mode === 'dynamic' || params.mode === 'manual-b' ? (
                      <ParamSlider label="恒定外力 F_ext" value={params.externalForceN} min={-3} max={3} step={0.1} unit="N" decimals={2} domain={PARAMETER_DOMAINS.signedForce} onChange={(value) => updateParams({ externalForceN: value })} description="M2/M3 的动力学方程 m dv/dt = F_ext + F_Bx；M1 所需外力由约束自动求出。" />
                    ) : null}
                    <ParamSlider label="演示时长" value={params.durationS} min={0.5} max={20} step={0.5} unit="s" decimals={1} domain={PARAMETER_DOMAINS.i04Duration} onChange={(value) => updateParams({ durationS: value, waveform: { ...params.waveform, durationS: value } })} />
                  </section>

                  {!manualB ? (
                    <section className="panel-section">
                      <h3 className="section-title">外加 B(t) 波形</h3>
                      <Segmented
                        ariaLabel="I05 B(t) 波形"
                        size="sm"
                        value={params.waveform.kind}
                        onChange={(kind) => updateWaveform({ kind })}
                        options={[
                          { value: 'constant', label: '恒定' },
                          { value: 'linear', label: '线性' },
                          { value: 'sine', label: '正弦' },
                          { value: 'triangle', label: '三角' },
                        ]}
                      />
                      <ParamSlider label="偏置 B₀" value={params.waveform.b0Tesla} min={-2} max={2} step={0.05} unit="T" decimals={2} domain={PARAMETER_DOMAINS.i04Field} onChange={(value) => updateWaveform({ b0Tesla: value })} />
                      {params.waveform.kind === 'linear' ? (
                        <ParamSlider label="斜率 k = dB/dt" value={params.waveform.slopeTeslaPerS} min={-2} max={2} step={0.05} unit="T/s" decimals={2} domain={PARAMETER_DOMAINS.i04Slope} onChange={(value) => updateWaveform({ slopeTeslaPerS: value })} />
                      ) : null}
                      {params.waveform.kind === 'sine' ? (
                        <>
                          <ParamSlider label="振幅 A_B" value={params.waveform.amplitudeTesla} min={0} max={2} step={0.05} unit="T" decimals={2} domain={PARAMETER_DOMAINS.i04Amplitude} onChange={(value) => updateWaveform({ amplitudeTesla: value })} />
                          <ParamSlider label="频率 f" value={params.waveform.frequencyHz} min={0.1} max={3} step={0.1} unit="Hz" decimals={1} domain={PARAMETER_DOMAINS.i04Frequency} onChange={(value) => updateWaveform({ frequencyHz: value })} />
                          <ParamSlider label="初相 φ" value={phaseAngleDeg} min={0} max={360} step={15} unit="°" decimals={0} onChange={(value) => updateWaveform({ phaseRad: (value * Math.PI) / 180 })} description="单位是度（°）；π/2 rad 需写 90°。" />
                        </>
                      ) : null}
                      {params.waveform.kind === 'triangle' ? (
                        <>
                          <ParamSlider label="三角波振幅" value={params.waveform.amplitudeTesla} min={0} max={2} step={0.05} unit="T" decimals={2} domain={PARAMETER_DOMAINS.i04Amplitude} onChange={(value) => updateWaveform({ amplitudeTesla: value })} />
                          <ParamSlider label="上升时间" value={params.waveform.riseS} min={0.1} max={2} step={0.1} unit="s" decimals={1} domain={PARAMETER_DOMAINS.i04EdgeTime} onChange={(value) => updateWaveform({ riseS: value })} />
                          <ParamSlider label="顶部平台" value={params.waveform.topS} min={0} max={2} step={0.1} unit="s" decimals={1} domain={PARAMETER_DOMAINS.i04HoldTime} onChange={(value) => updateWaveform({ topS: value })} />
                          <ParamSlider label="下降时间" value={params.waveform.fallS} min={0.1} max={2} step={0.1} unit="s" decimals={1} domain={PARAMETER_DOMAINS.i04EdgeTime} onChange={(value) => updateWaveform({ fallS: value })} />
                          <ParamSlider label="底部平台" value={params.waveform.bottomS} min={0} max={2} step={0.1} unit="s" decimals={1} domain={PARAMETER_DOMAINS.i04HoldTime} onChange={(value) => updateWaveform({ bottomS: value })} />
                        </>
                      ) : null}
                    </section>
                  ) : (
                    <section className="panel-section">
                      <h3 className="section-title">手动调磁</h3>
                      <ParamSlider label="手动实验起始 B" value={params.manualStartBzTesla} min={-2} max={2} step={0.05} unit="T" decimals={2} domain={PARAMETER_DOMAINS.manualField} onChange={(value) => updateParams({ manualStartBzTesla: value })} description="复位或切换模式时，手动实验从该 B 值开始。" />
                      <MathTargetInput label="实时目标 B" value={manualTarget} unit="T" decimals={4} domain={PARAMETER_DOMAINS.manualField} testId="i05-manual-target" onCommit={commitManualBTarget} description="提交后按既有 0.4 s / 4 T·s⁻¹ ramp 逼近；暂停或查看旧历史时不追加。" />
                      <p className="param-description" data-testid="i05-manual-note">
                        当前 B = {formatNumber(snapshot.Bz, 3)} T，目标 = {formatNumber(manualTarget, 3)} T，最后输入时刻 = {formatNumber(lastManualTime, 2)} s；{manualLimited ? '本次目标受限速。' : '斜率在限速内。'}
                      </p>
                    </section>
                  )}

                  <section className="panel-section">
                    <h3 className="section-title">显示图层</h3>
                    <div className="toggle-list">
                      {LAYER_ITEMS.map((item) => (
                        <ToggleSwitch key={item.key} label={item.label} checked={layers[item.key]} onChange={() => updateLayers({ [item.key]: !layers[item.key] } as Partial<I05Layers>)} />
                      ))}
                    </div>
                  </section>

                  <section className="panel-section">
                    <h3 className="section-title">场景数据</h3>
                    <div className="scene-io-row">
                      <button type="button" className="secondary-button" onClick={exportScene}><Icon name="download" size={16} />导出场景 JSON</button>
                      <button type="button" className="secondary-button" onClick={() => importRef.current?.click()}><Icon name="upload" size={16} />导入场景 JSON</button>
                      <input ref={importRef} type="file" accept="application/json,.json" hidden data-testid="i05-scene-import" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importScene(file); event.target.value = ''; }} />
                    </div>
                  </section>
                  <button type="button" className="secondary-button wide-button" onClick={() => applyPreset('i05-static-entry')}><Icon name="reset" size={17} />恢复默认 I05 场景</button>
                </div>
              ) : null}

              {tab === 'lesson' ? (
                <LessonRunner
                  steps={I05_LESSON}
                  storageKey="emplab.i05.lesson.v1"
                  overview={{
                    goals: [
                      '区分感生电动势与动生电动势，并用同一符号约定合成总电动势。',
                      '理解完全在匀强场内时 g=0：可以有感生电流，但没有净 x 磁场力。',
                      '用感生 + 动生分解、功率与能量账本解释外部场源和机械外力的能量来源。',
                    ],
                    prerequisites: ['磁通量 Φ=B·S_eff 与磁链 Ψ=NΦ。', '法拉第定律、楞次定律、右手螺旋定则。', 'I03 的线框进出与 I04 的 B(t) 图像。'],
                    misconceptions: ['把感生电动势和动生电动势重复计入总电动势。', '认为线框完全在磁场内时一定没有电流。', '把变化磁场源提供的能量漏掉，导致能量账本对不上。'],
                  }}
                  onApplyPreset={applyPreset}
                  onGoPractice={() => setTab('practice')}
                />
              ) : null}

              {tab === 'practice' ? <PracticePanel modelId="i05" /> : null}

              {tab === 'data' ? (
                <div className="panel-section-stack">
                  <div className="panel-intro">
                    <div>
                      <h2>同一快照 · 同一能量账本</h2>
                      <p>t = {timeLabel}；模式 {modeLabel}；{snapshot.status === 'open-circuit' ? '开路' : snapshot.status === 'at-boundary' ? '边界单侧状态' : '闭合回路'}。</p>
                    </div>
                  </div>
                  <ReadoutGrid
                    items={[
                      { label: '位置 x', value: `${formatNumber(snapshot.xM, 3)} m`, testId: 'i05-x' },
                      { label: '速度 vx', value: `${formatNumber(snapshot.velocityMps, 3)} m/s`, testId: 'i05-v' },
                      { label: '外加 Bz', value: `${formatNumber(snapshot.Bz, 3)} T`, testId: 'i05-bz' },
                      { label: 'dBz/dt', value: snapshot.dBzDt === null ? '折点：左右不唯一' : `${formatNumber(snapshot.dBzDt, 3)} T/s`, testId: 'i05-dbdt' },
                      { label: '重叠长度 ℓ', value: `${formatNumber(snapshot.overlapLengthM, 3)} m`, hint: `g = ${snapshot.overlapSlope === null ? '—' : snapshot.overlapSlope}${snapshot.slopeOneSided ? '（单侧）' : ''}`, testId: 'i05-overlap' },
                      { label: '单匝磁通 Φ', value: formatSI(snapshot.fluxWb, 'Wb'), testId: 'i05-flux' },
                      { label: 'N 匝磁链 Ψ', value: `${formatNumber(snapshot.linkageWbTurn, 4)} Wb·turn`, testId: 'i05-linkage' },
                      { label: '感生 ε_t', value: snapshot.emfTransformerV === null ? '不可用（折点）' : formatSI(snapshot.emfTransformerV, 'V'), testId: 'i05-emf-t' },
                      { label: '动生 ε_m', value: snapshot.emfMotionalV === null ? '不可用' : formatSI(snapshot.emfMotionalV, 'V'), testId: 'i05-emf-m' },
                      { label: '总电动势 ε', value: snapshot.emfTotalV === null ? '不可用' : formatSI(snapshot.emfTotalV, 'V'), testId: 'i05-emf-total' },
                      { label: '电流 I', value: snapshot.currentA === null ? '不可用' : formatSI(snapshot.currentA, 'A'), testId: 'i05-current' },
                      { label: '磁场力 F_Bx', value: snapshot.magneticForceX === null ? '不可用' : formatSI(snapshot.magneticForceX, 'N'), testId: 'i05-force' },
                      { label: '焦耳功率 P_J', value: snapshot.joulePowerW === null ? '不可用' : formatSI(snapshot.joulePowerW, 'W'), testId: 'i05-joule-power' },
                      { label: '场源功率 Iε_t', value: snapshot.transformerSourcePowerW === null ? '不可用' : formatSI(snapshot.transformerSourcePowerW, 'W'), testId: 'i05-source-power' },
                      { label: '动能 K', value: formatSI(snapshot.kineticEnergyJ, 'J'), testId: 'i05-kinetic' },
                      { label: '焦耳热 Q_J', value: formatSI(snapshot.jouleHeatJ, 'J'), testId: 'i05-heat' },
                      { label: '外力功 W_ext', value: formatSI(snapshot.externalWorkJ, 'J'), testId: 'i05-work-ext' },
                      { label: '场源交换 W_ts', value: formatSI(snapshot.transformerSourceWorkJ, 'J'), testId: 'i05-work-source' },
                      { label: '能量残差', value: snapshot.energyResidualJ === null ? '不适用（手动模式）' : formatSI(snapshot.energyResidualJ, 'J'), testId: 'i05-energy-residual' },
                    ]}
                  />
                  <I05Charts solution={solution} snapshot={snapshot} timeS={clock.time} />
                  <section className="panel-section">
                    <h3 className="section-title">事件时间轴</h3>
                    <div className="p04-event-list" data-testid="i05-event-list">
                      {solution.events.map((event, index) => (
                        <div className="p04-event-row" key={`${event.kind}-${event.timeS}-${index}`} data-testid={`i05-event-${index}`}>
                          <strong>{event.label}</strong>
                          <span>{formatTime(event.timeS)}</span>
                          <span>x = {formatNumber(event.xM, 3)} m</span>
                          <span>vx = {formatNumber(event.velocityMps, 3)} m/s</span>
                        </div>
                      ))}
                    </div>
                  </section>
                  <section className="formula-card">
                    <p className="eyebrow">同一快照的公式与代值</p>
                    <MathTex block>{'\\varepsilon_t=-Nh\\ell\\dot B_z,\\quad \\varepsilon_m=-NhB_zgv_x,\\quad \\varepsilon=\\varepsilon_t+\\varepsilon_m,\\quad F_{Bx}=NIhB_zg'}</MathTex>
                    <p>
                      ℓ = {formatNumber(snapshot.overlapLengthM, 3)} m，g = {snapshot.overlapSlope === null ? '—' : snapshot.overlapSlope}，
                      ε_t = {snapshot.emfTransformerV === null ? '—' : formatSI(snapshot.emfTransformerV, 'V')}，
                      ε_m = {snapshot.emfMotionalV === null ? '—' : formatSI(snapshot.emfMotionalV, 'V')}。
                    </p>
                    <p className="formula-result">
                      I = {snapshot.currentA === null ? '—' : formatSI(snapshot.currentA, 'A')}；F_Bx = {snapshot.magneticForceX === null ? '—' : formatSI(snapshot.magneticForceX, 'N')}；
                      能量账本 (K−K₀)+Q_J−W_ext−W_ts = {snapshot.energyResidualJ === null ? '手动模式不提供' : formatSI(snapshot.energyResidualJ, 'J')}。
                    </p>
                  </section>
                  <div className="callout callout-note">
                    <Icon name="info" size={18} />
                    <div>
                      <strong>I05 与 I03/I04 的边界</strong>
                      <p>I03 是静态 B 的线框进出；I04 是固定线圈的 B(t)。I05 两者同时发生：ε_t 由 B 变化产生，ε_m 由空间重叠变化产生；外部场源可以对回路做功，因此能量账本必须包含 W_ts。</p>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
