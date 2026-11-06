import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { usePersistentState } from '../../hooks/usePersistentState';
import { usePlaybackClock } from '../../hooks/usePlaybackClock';
import { formatNumber, formatSI, formatTime } from '../../lib/format';
import { I06_LESSON } from '../../content/lessons';
import { questionsForModel } from '../../content/questions';
import { ParamSlider } from '../../components/ParamSlider';
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
  solveDualRod,
  stateAtDualRodTime,
  type DualRodParams,
  type DualRodSnapshot,
  type DualRodSolution,
} from '../../physics/induction/dualRodCoupling';
import { ManualDualRodSession } from '../../physics/induction/manualDualRodMotion';
import { I06Charts } from './I06Charts';
import { DualRodsStage } from './DualRodsStage';
import {
  I06_DEFAULT_LAYERS,
  I06_PRESETS,
  I06_SCENE_STORAGE_KEY,
  decodeI06SceneJson,
  loadInitialI06Scene,
  parseI06StoredScene,
  serializeI06Scene,
  type I06Layers,
  type I06Scene,
} from './i06Scene';

type PanelTabId = 'params' | 'lesson' | 'practice' | 'data';
type LearningMode = 'guided' | 'free';

const I06_MANUAL_DURATION_S = 20;

const MODE_ITEMS: Array<{ id: DualRodParams['mode']; title: string; subtitle: string }> = [
  { id: 'free', title: 'D1 自由双棒', subtitle: '无外力；相对速度指数衰减，动量守恒' },
  { id: 'forces', title: 'D2 恒力驱动', subtitle: '独立 F₁/F₂；质心加速 + 相对运动' },
  { id: 'manual-rod1', title: 'D4 手推杆 1', subtitle: '杆 2 被夹持；手势速度由时间戳估计' },
  { id: 'manual-rod2', title: 'D4 手推杆 2', subtitle: '杆 1 被夹持；同一回路电流' },
];

const LAYER_ITEMS: Array<{ key: keyof I06Layers; label: string }> = [
  { key: 'field', label: '匀强磁场符号' },
  { key: 'current', label: '同一回路电流' },
  { key: 'velocity', label: '两杆速度' },
  { key: 'force', label: '两杆磁场力' },
  { key: 'flux', label: '回路面积' },
  { key: 'momentum', label: '总动量读数' },
  { key: 'energy', label: '能量读数' },
  { key: 'events', label: '接触/事件提示' },
  { key: 'maskAnswers', label: '遮蔽方向/数值答案（先预测）' },
];

export function DualRodsPage() {
  const initialScene = useMemo(() => loadInitialI06Scene(), []);
  const [storedScene, setStoredScene] = usePersistentState<unknown>(I06_SCENE_STORAGE_KEY, initialScene);
  const scene = useMemo(() => parseI06StoredScene(storedScene).scene ?? initialScene, [initialScene, storedScene]);
  const params = scene.params;
  const layers = scene.layers;
  const [learningMode, setLearningMode] = usePersistentState<LearningMode>('emplab.i06.mode.v1', 'guided');
  const [teacher, setTeacher] = useState(false);
  const [stageMode, setStageMode] = useState<StageMode>('interact');
  const [tab, setTab] = useState<PanelTabId>(learningMode === 'guided' ? 'lesson' : 'params');
  const [notice, setNotice] = useState<string | null>(null);
  const [manualDragging, setManualDragging] = useState(false);
  const [manualSnapshot, setManualSnapshot] = useState<DualRodSnapshot | null>(null);
  const [manualHistory, setManualHistory] = useState<DualRodSnapshot[]>([]);
  const [manualRevision, setManualRevision] = useState(0);
  const [searchParams] = useSearchParams();
  const presetId = searchParams.get('preset');
  const appliedPresetRef = useRef<string | null>(null);
  const importRef = useRef<HTMLInputElement | null>(null);
  const noticeTimer = useRef<number | null>(null);
  const manualSessionRef = useRef<ManualDualRodSession | null>(null);
  const manualOriginRef = useRef<{ wallSeconds: number; simulationSeconds: number } | null>(null);
  const manualXRef = useRef(0);
  const sceneRef = useRef(scene);
  sceneRef.current = scene;
  const paramsSignature = JSON.stringify(params);
  const manualMode = params.mode === 'manual-rod1' || params.mode === 'manual-rod2';

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

  const commitScene = useCallback((next: I06Scene) => setStoredScene(next), [setStoredScene]);
  const analyticSolution = useMemo(() => solveDualRod(params), [params]);
  const analytic = !manualMode;

  const manualSolution = useMemo<DualRodSolution>(() => {
    const initial = manualHistory[0] ?? manualSnapshot ?? analyticSolution.initial;
    const final = manualHistory[manualHistory.length - 1] ?? manualSnapshot ?? initial;
    const samples = manualHistory.length > 0 ? manualHistory : [initial];
    return {
      params,
      k: analyticSolution.k,
      alpha: analyticSolution.alpha,
      centerOfMassVelocity0: analyticSolution.centerOfMassVelocity0,
      centerOfMassAcceleration: analyticSolution.centerOfMassAcceleration,
      relativeVelocity0: analyticSolution.relativeVelocity0,
      relativeVelocityInfinity: analyticSolution.relativeVelocityInfinity,
      initial,
      final,
      samples,
      events: [],
      keyTimesS: [0, ...samples.map((sample) => sample.timeS), I06_MANUAL_DURATION_S]
        .filter(Number.isFinite)
        .sort((a, b) => a - b),
      durationS: I06_MANUAL_DURATION_S,
      contactTimeS: null,
      status: initial.status,
      issue: null,
    };
  }, [analyticSolution, manualHistory, manualSnapshot, params]);

  const durationS = analytic ? analyticSolution.durationS : I06_MANUAL_DURATION_S;
  const solution = analytic ? analyticSolution : manualSolution;
  const keyFrames: KeyFrame[] = useMemo(() => {
    const frames: KeyFrame[] = [{ time: 0, label: '起点' }];
    for (const event of solution.events) {
      if (event.timeS > 0 && event.timeS < durationS - 1e-9) frames.push({ time: event.timeS, label: event.label });
    }
    frames.push({ time: durationS, label: analytic && solution.contactTimeS !== null ? '接触停止' : '结束' });
    const seen = new Set<string>();
    return frames.filter((frame) => {
      const key = frame.time.toFixed(7);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [analytic, durationS, solution.contactTimeS, solution.events]);

  const clock = usePlaybackClock(durationS, keyFrames.map((frame) => frame.time), { realTime: manualMode });
  const snapshot = manualMode
    ? manualSnapshot ?? manualSolution.initial
    : stateAtDualRodTime(analyticSolution, clock.time);
  const history = manualMode ? manualSolution.samples : analyticSolution.samples;

  useEffect(() => {
    if (manualMode) clock.setSpeed(1);
  }, [clock.setSpeed, manualMode]);

  useEffect(() => {
    setTab(learningMode === 'guided' ? 'lesson' : 'params');
    setTeacher(false);
  }, [learningMode]);

  useEffect(() => {
    const preset = presetId ? I06_PRESETS[presetId] : undefined;
    if (!preset || appliedPresetRef.current === presetId) return;
    appliedPresetRef.current = presetId;
    commitScene({ schemaVersion: 2, model: 'i06', params: { ...preset }, layers: { ...I06_DEFAULT_LAYERS } });
    setManualSnapshot(null);
    setManualHistory([]);
    setManualDragging(false);
    clock.reset();
    showNotice('已载入 I06 可复现预设 · 实验定义重建，t=0');
  }, [clock.reset, commitScene, presetId, showNotice]);

  useEffect(() => {
    clock.reset();
    setManualDragging(false);
    manualOriginRef.current = null;
    manualXRef.current = params.mode === 'manual-rod2' ? params.x2M : params.x1M;
    if (manualMode) {
      const session = new ManualDualRodSession(params);
      const initial = session.reset(0, params.x1M, params.x2M);
      manualSessionRef.current = session;
      setManualSnapshot(initial);
      setManualHistory([initial]);
      setManualRevision((value) => value + 1);
    } else {
      manualSessionRef.current = null;
      setManualSnapshot(null);
      setManualHistory([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramsSignature]);

  const updateParams = (patch: Partial<DualRodParams>, message = '实验参数改变：定义重建，t=0') => {
    commitScene({ ...sceneRef.current, params: { ...params, ...patch } });
    showNotice(message);
  };

  const applyPreset = (id: string) => {
    const preset = I06_PRESETS[id];
    if (!preset) return;
    commitScene({ schemaVersion: 2, model: 'i06', params: { ...preset }, layers: { ...I06_DEFAULT_LAYERS } });
    setManualSnapshot(null);
    setManualHistory([]);
    setManualDragging(false);
    clock.reset();
    showNotice('已载入 I06 预设 · 实验定义重建，t=0');
  };

  const setMode = (mode: DualRodParams['mode']) => {
    if (mode === params.mode) return;
    updateParams({ mode }, `切换 ${MODE_ITEMS.find((item) => item.id === mode)?.title ?? mode}：实验定义重建，t=0`);
  };

  const exportScene = () => {
    const blob = new Blob([serializeI06Scene(sceneRef.current)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'i06-scene.json';
    anchor.click();
    URL.revokeObjectURL(url);
    showNotice('I06 场景已导出为 JSON');
  };

  const importScene = async (file: File) => {
    const text = await file.text();
    const parsed = decodeI06SceneJson(text);
    if (!parsed.scene) {
      showNotice(`I06 场景导入失败：${parsed.error ?? '格式无效'}`);
      return;
    }
    commitScene(parsed.scene);
    setManualSnapshot(null);
    setManualHistory([]);
    setManualDragging(false);
    clock.reset();
    showNotice('I06 场景已导入 · 从 t=0 重建');
  };

  const sampleManualTime = () => {
    const origin = manualOriginRef.current;
    if (!origin) return clock.getTime();
    return origin.simulationSeconds + Math.max(0, performance.now() / 1000 - origin.wallSeconds);
  };

  const updateManualState = (snapshotValue: DualRodSnapshot, session: ManualDualRodSession) => {
    setManualSnapshot(snapshotValue);
    setManualHistory([...session.getHistory()]);
    setManualRevision((value) => value + 1);
  };

  const handleManualStart = (rod: 1 | 2, xM: number) => {
    if (!manualMode) return;
    const expected = params.mode === 'manual-rod2' ? 2 : 1;
    if (rod !== expected) return;
    if (!clock.playing) clock.play();
    if (!manualSessionRef.current) {
      manualSessionRef.current = new ManualDualRodSession(params);
      manualSessionRef.current.reset(clock.getTime(), params.x1M, params.x2M);
    }
    const session = manualSessionRef.current;
    manualXRef.current = xM;
    manualOriginRef.current = {
      wallSeconds: performance.now() / 1000,
      simulationSeconds: clock.getTime(),
    };
    updateManualState(session.beginDrag(sampleManualTime(), xM), session);
    setManualDragging(true);
    showNotice(`正在拖动杆 ${rod}；另一根杆由外部夹持固定；第二指可安全取消`);
  };

  const handleManualChange = (xM: number) => {
    if (!manualMode || !clock.playing) return;
    const session = manualSessionRef.current;
    if (!session) return;
    manualXRef.current = xM;
    updateManualState(session.record(sampleManualTime(), xM), session);
  };

  const handleManualEnd = () => {
    const session = manualSessionRef.current;
    if (!session) return;
    updateManualState(session.endDrag(Math.max(sampleManualTime(), session.getLastTime())), session);
    setManualDragging(false);
    manualOriginRef.current = null;
    showNotice('松手：手推速度归零，电流/焦耳功率归零；历史保留');
  };

  const handleManualCancel = () => {
    const session = manualSessionRef.current;
    if (!session) return;
    updateManualState(session.cancel(Math.max(sampleManualTime(), session.getLastTime())), session);
    setManualDragging(false);
    manualOriginRef.current = null;
    showNotice('手势已取消：未记录取消瞬间的伪速度或热量');
  };

  useEffect(() => {
    if (!manualMode || !manualDragging || !clock.playing) return;
    let frame = 0;
    let last = 0;
    const tick = (now: number) => {
      if (now - last >= 40) {
        last = now;
        const session = manualSessionRef.current;
        if (session) updateManualState(session.record(sampleManualTime(), manualXRef.current), session);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [clock.playing, manualDragging, manualMode]);

  useEffect(() => {
    if (!manualMode || manualDragging || !clock.playing) return;
    const timer = window.setInterval(() => {
      const session = manualSessionRef.current;
      if (session) updateManualState(session.idle(clock.getTime()), session);
    }, 120);
    return () => window.clearInterval(timer);
  }, [clock.getTime, clock.playing, manualDragging, manualMode]);

  useEffect(() => {
    if (!manualMode || !manualDragging || clock.playing) return;
    handleManualCancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clock.playing, manualDragging, manualMode]);

  const updateLayers = (patch: Partial<I06Layers>) => {
    commitScene({ ...sceneRef.current, layers: { ...layers, ...patch } });
  };

  const teacherControls = (
    <div className="teacher-layer-bar" role="group" aria-label="I06 教师图层">
      {LAYER_ITEMS.map((item) => (
        <button
          key={item.key}
          type="button"
          className="teacher-layer-chip"
          aria-pressed={layers[item.key]}
          onClick={() => updateLayers({ [item.key]: !layers[item.key] } as Partial<I06Layers>)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );

  const timeLabel = formatTime(clock.time);
  const modeLabel = MODE_ITEMS.find((item) => item.id === params.mode)?.title ?? params.mode;
  const questionCount = questionsForModel('i06').length;
  const draggedRod = params.mode === 'manual-rod2' ? 2 : 1;
  const clampedRod = draggedRod === 1 ? 2 : 1;

  return (
    <div className={`sim-page ${teacher ? 'sim-teacher' : ''}`} data-sim-playing={clock.playing} data-sim-time={clock.time} data-i06-mode={params.mode} data-manual-revision={manualRevision}>
      <header className="sim-header">
        <div className="sim-title-block">
          <p className="eyebrow">I06 · 模块 B · 电磁感应</p>
          <h1>双导体棒在平行导轨上的电磁耦合</h1>
          <p className="sim-subtitle">
            两根独立导体棒与平行导轨构成一个回路：相对速度产生一个共享电流，磁场力反对相对运动，质心速度守恒或按外力变化。
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
          <DualRodsStage
            params={params}
            snapshot={snapshot}
            history={history}
            layers={layers}
            stageMode={stageMode}
            onStageModeChange={setStageMode}
            initialDragEnabled={!clock.playing && !manualMode}
            manualEnabled={manualMode && clock.playing}
            manualDragging={manualDragging}
            onInitialChange={(rod, xM) => {
              const next = rod === 1
                ? { x1M: xM }
                : { x2M: xM };
              const x1 = rod === 1 ? xM : params.x1M;
              const x2 = rod === 2 ? xM : params.x2M;
              if (x2 <= x1) {
                showNotice('必须保持 x₂ > x₁；本次拖动未提交');
                return;
              }
              updateParams(next, '拖动初态：双棒初始位置改变，实验从 t=0 重建');
            }}
            onManualStart={handleManualStart}
            onManualChange={handleManualChange}
            onManualEnd={handleManualEnd}
            onManualCancel={handleManualCancel}
          />
          {notice ? <div className="stage-condition-notice" data-testid="i06-condition-notice" role="status">{notice}</div> : null}
          {teacher ? (
            <TeacherDock
              formula={'\\varepsilon=-B_zL(v_2-v_1),\\quad I=\\varepsilon/R,\\quad F_{B1}=-IB_zL,\\quad F_{B2}=+IB_zL'}
              stats={[
                { label: '模式', value: modeLabel },
                { label: 'x₁ / x₂', value: `${formatNumber(snapshot.rod1.x, 2)} / ${formatNumber(snapshot.rod2.x, 2)} m` },
                { label: 'v₁ / v₂', value: `${formatNumber(snapshot.rod1.v, 2)} / ${formatNumber(snapshot.rod2.v, 2)} m/s` },
                { label: 'Δv', value: `${formatNumber(snapshot.relativeVelocityMS, 3)} m/s` },
                { label: 'ε', value: formatSI(snapshot.emfTotalV, 'V') },
                { label: 'I', value: formatSI(snapshot.currentA, 'A') },
                { label: 'F_B1 / F_B2', value: `${formatNumber(snapshot.forceRod1N, 2)} / ${formatNumber(snapshot.forceRod2N, 2)} N` },
                { label: 'p', value: `${formatNumber(snapshot.totalMomentumKgMS, 3)} kg·m/s` },
                { label: '能量残差', value: snapshot.energyResidualJ === null ? '不适用' : formatSI(snapshot.energyResidualJ, 'J') },
              ]}
              footnote={`t = ${timeLabel} · ${snapshot.status}${manualMode ? ` · 杆 ${clampedRod} 被外部夹持` : ''}`}
              controls={teacherControls}
            />
          ) : null}
          <PlaybackBar
            clock={clock}
            duration={durationS}
            keyFrames={keyFrames}
            timeLabel={timeLabel}
            secondaryLabel={`${modeLabel} · d=${snapshot.status === 'contact-stop' ? '0' : formatNumber(snapshot.separationM, 2)} m · I=${formatSI(snapshot.currentA, 'A')}`}
            timelineLabel="I06 双棒同一仿真时间轴"
            note={manualMode ? '手动模式固定 1× 真实仿真时间；暂停不记录手势，历史不重置。' : 'D1/D2 使用解析解；时间轴在首次接触处停止，不模拟碰撞。'}
            speeds={manualMode ? [1] : undefined}
          />
        </div>

        {!teacher ? (
          <aside className="sim-panel" aria-label="I06 实验控制台">
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
                      <h2>一根回路 · 两根杆</h2>
                      <p>两杆共享同一电流，但各有独立质量、位置与速度；D4 中被夹持杆是外部固定，不按自由动力学处理。</p>
                    </div>
                  </div>
                  <div className="mode-card-grid" role="group" aria-label="I06 交互模式">
                    {MODE_ITEMS.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={`mode-card ${params.mode === item.id ? 'is-active' : ''}`}
                        aria-pressed={params.mode === item.id}
                        onClick={() => setMode(item.id)}
                        data-testid={`i06-mode-${item.id}`}
                      >
                        <strong>{item.title}</strong>
                        <span>{item.subtitle}</span>
                      </button>
                    ))}
                  </div>
                  <div className="preset-chips" aria-label="I06 预设">
                    {Object.keys(I06_PRESETS).map((id) => (
                      <button key={id} type="button" className="chip-button" onClick={() => applyPreset(id)} data-testid={`i06-preset-${id}`}>
                        {id.replace('i06-', '')}
                      </button>
                    ))}
                  </div>

                  <section className="panel-section">
                    <h3 className="section-title">磁场与回路</h3>
                    <ParamSlider label="磁感应强度 Bz" value={params.BzTesla} min={-2} max={2} step={0.05} unit="T" decimals={2} domain={PARAMETER_DOMAINS.magneticField} onChange={(value) => updateParams({ BzTesla: value })} description="+ 出纸面 ⊙，− 入纸面 ×；I06 只支持静态均匀场。" />
                    <ParamSlider label="导轨间距 L" value={params.lengthM} min={0.2} max={2} step={0.1} unit="m" decimals={2} domain={PARAMETER_DOMAINS.positiveLength} onChange={(value) => updateParams({ lengthM: value })} />
                    <ParamSlider label="回路总电阻 R" value={params.resistanceOhm} min={0.1} max={10} step={0.1} unit="Ω" decimals={2} domain={PARAMETER_DOMAINS.resistance} onChange={(value) => updateParams({ resistanceOhm: value })} />
                    <ToggleSwitch label="闭合回路（关闭为开路）" checked={params.circuitClosed} onChange={(checked) => updateParams({ circuitClosed: checked })} />
                    <p className="param-description">回路电阻按 R₁+R₂+R_rail+R_ext 的等效总值输入；本模型忽略自感、电容、轨道动生电动势与磁场反作用。</p>
                  </section>

                  <section className="panel-section">
                    <h3 className="section-title">两根导体棒</h3>
                    <ParamSlider label="杆 1 质量 m₁" value={params.mass1Kg} min={0.1} max={5} step={0.1} unit="kg" decimals={2} domain={PARAMETER_DOMAINS.positiveMass} onChange={(value) => updateParams({ mass1Kg: value })} />
                    <ParamSlider label="杆 2 质量 m₂" value={params.mass2Kg} min={0.1} max={5} step={0.1} unit="kg" decimals={2} domain={PARAMETER_DOMAINS.positiveMass} onChange={(value) => updateParams({ mass2Kg: value })} />
                    <ParamSlider label="杆 1 初始位置 x₁" value={params.x1M} min={-4} max={4} step={0.05} unit="m" decimals={2} validateValue={(value) => value < params.x2M ? null : '必须保持 x₂ > x₁。'} onChange={(value) => updateParams({ x1M: value })} />
                    <ParamSlider label="杆 2 初始位置 x₂" value={params.x2M} min={-4} max={4} step={0.05} unit="m" decimals={2} validateValue={(value) => value > params.x1M ? null : '必须保持 x₂ > x₁。'} onChange={(value) => updateParams({ x2M: value })} />
                    <ParamSlider label="杆 1 初速度 v₁" value={params.v1Mps} min={-4} max={4} step={0.1} unit="m/s" decimals={2} domain={PARAMETER_DOMAINS.signedSpeed} onChange={(value) => updateParams({ v1Mps: value })} />
                    <ParamSlider label="杆 2 初速度 v₂" value={params.v2Mps} min={-4} max={4} step={0.1} unit="m/s" decimals={2} domain={PARAMETER_DOMAINS.signedSpeed} onChange={(value) => updateParams({ v2Mps: value })} />
                    {params.mode === 'forces' ? (
                      <>
                        <ParamSlider label="杆 1 外力 F₁" value={params.force1N} min={-3} max={3} step={0.1} unit="N" decimals={2} domain={PARAMETER_DOMAINS.signedForce} onChange={(value) => updateParams({ force1N: value })} />
                        <ParamSlider label="杆 2 外力 F₂" value={params.force2N} min={-3} max={3} step={0.1} unit="N" decimals={2} domain={PARAMETER_DOMAINS.signedForce} onChange={(value) => updateParams({ force2N: value })} />
                      </>
                    ) : null}
                    {!manualMode ? (
                      <ParamSlider label="演示时长" value={params.durationS} min={0.5} max={12} step={0.5} unit="s" decimals={1} domain={PARAMETER_DOMAINS.i04Duration} onChange={(value) => updateParams({ durationS: value })} />
                    ) : (
                      <p className="param-description">手动模式固定 20 s 真实历史；杆 {clampedRod} 由外部夹持，实际作用力未知，因此不显示精确外功或能量残差。手动拖动保留 0.02 m 最小接触间隙。</p>
                    )}
                  </section>

                  <section className="panel-section">
                    <h3 className="section-title">显示图层</h3>
                    <div className="toggle-list">
                      {LAYER_ITEMS.map((item) => (
                        <ToggleSwitch key={item.key} label={item.label} checked={layers[item.key]} onChange={() => updateLayers({ [item.key]: !layers[item.key] } as Partial<I06Layers>)} />
                      ))}
                    </div>
                  </section>

                  <section className="panel-section">
                    <h3 className="section-title">场景数据</h3>
                    <div className="scene-io-row">
                      <button type="button" className="secondary-button" onClick={exportScene}><Icon name="download" size={16} />导出场景 JSON</button>
                      <button type="button" className="secondary-button" onClick={() => importRef.current?.click()}><Icon name="upload" size={16} />导入场景 JSON</button>
                      <input ref={importRef} type="file" accept="application/json,.json" hidden data-testid="i06-scene-import" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importScene(file); event.target.value = ''; }} />
                    </div>
                  </section>
                  <button type="button" className="secondary-button wide-button" onClick={() => applyPreset('i06-free-symmetric')}><Icon name="reset" size={17} />恢复默认 I06 场景</button>
                </div>
              ) : null}

              {tab === 'lesson' ? (
                <LessonRunner
                  steps={I06_LESSON}
                  storageKey="emplab.i06.lesson.v1"
                  overview={{
                    goals: [
                      '理解两杆相对速度决定回路总电动势，而单杆 ε=BvL 不能直接当作总电动势。',
                      '用同一电流判断两杆磁场力方向，解释相对速度衰减与速度趋同。',
                      '用质心动量、能量和接触事件分析双棒问题。',
                    ],
                    prerequisites: ['法拉第定律与动生电动势。', '闭合电路欧姆定律与安培力。', '动量守恒、完全非弹性接近与能量转化。'],
                    misconceptions: ['把两根杆各自产生的电动势直接相加而不看方向。', '认为两杆同速时仍有感应电流。', '把磁场力当作内力时忘记回路能量会变成焦耳热。'],
                  }}
                  onApplyPreset={applyPreset}
                  onGoPractice={() => setTab('practice')}
                />
              ) : null}

              {tab === 'practice' ? <PracticePanel modelId="i06" /> : null}

              {tab === 'data' ? (
                <div className="panel-section-stack">
                  <div className="panel-intro">
                    <div>
                      <h2>双棒耦合数据</h2>
                      <p>t = {timeLabel}；{modeLabel}；{snapshot.status === 'open-circuit' ? '开路' : snapshot.status === 'contact-stop' ? '接触停止' : '运行中'}。</p>
                    </div>
                  </div>
                  <ReadoutGrid
                    items={[
                      { label: '杆 1 位置 x₁', value: `${formatNumber(snapshot.rod1.x, 3)} m`, testId: 'i06-x1' },
                      { label: '杆 2 位置 x₂', value: `${formatNumber(snapshot.rod2.x, 3)} m`, testId: 'i06-x2' },
                      { label: '间距 d', value: `${snapshot.status === 'contact-stop' ? '0' : formatNumber(snapshot.separationM, 3)} m`, testId: 'i06-separation' },
                      { label: '速度 v₁', value: `${formatNumber(snapshot.rod1.v, 3)} m/s`, testId: 'i06-v1' },
                      { label: '速度 v₂', value: `${formatNumber(snapshot.rod2.v, 3)} m/s`, testId: 'i06-v2' },
                      { label: '相对速度 Δv', value: `${formatNumber(snapshot.relativeVelocityMS, 3)} m/s`, testId: 'i06-relative-v' },
                      { label: '质心速度 Vcm', value: `${formatNumber(snapshot.centerOfMassVelocityMS, 3)} m/s`, testId: 'i06-vcm' },
                      { label: '总动量 p', value: `${formatNumber(snapshot.totalMomentumKgMS, 3)} kg·m/s`, testId: 'i06-momentum' },
                      { label: '磁通 Φ', value: formatSI(snapshot.fluxWb, 'Wb'), testId: 'i06-flux' },
                      { label: '杆 1 EMF', value: formatSI(snapshot.emfRod1V, 'V'), testId: 'i06-emf1' },
                      { label: '杆 2 EMF', value: formatSI(snapshot.emfRod2V, 'V'), testId: 'i06-emf2' },
                      { label: '总 EMF', value: formatSI(snapshot.emfTotalV, 'V'), testId: 'i06-emf' },
                      { label: '电流 I', value: formatSI(snapshot.currentA, 'A'), testId: 'i06-current' },
                      { label: '杆 1 磁场力', value: formatSI(snapshot.forceRod1N, 'N'), testId: 'i06-force1' },
                      { label: '杆 2 磁场力', value: formatSI(snapshot.forceRod2N, 'N'), testId: 'i06-force2' },
                      { label: '焦耳功率 P_J', value: formatSI(snapshot.joulePowerW, 'W'), testId: 'i06-joule-power' },
                      { label: '动能 K', value: formatSI(snapshot.kineticEnergyJ, 'J'), testId: 'i06-kinetic' },
                      { label: '焦耳热 Q_J', value: formatSI(snapshot.jouleHeatJ, 'J'), testId: 'i06-heat' },
                      { label: '外力功 W_ext', value: formatSI(snapshot.externalWorkJ, 'J'), testId: 'i06-work-ext' },
                      { label: '能量残差', value: snapshot.energyResidualJ === null ? '不适用（手动模式）' : formatSI(snapshot.energyResidualJ, 'J'), testId: 'i06-energy-residual' },
                    ]}
                  />
                  <I06Charts samples={history} snapshot={snapshot} durationS={durationS} timeS={clock.time} />
                  <section className="panel-section">
                    <h3 className="section-title">事件时间轴</h3>
                    <div className="p04-event-list" data-testid="i06-event-list">
                      {solution.events.length === 0 ? <p className="muted-text">手动模式按真实手势记录；没有预计算事件。</p> : solution.events.map((event, index) => (
                        <div className="p04-event-row" key={`${event.kind}-${event.timeS}-${index}`} data-testid={`i06-event-${index}`}>
                          <strong>{event.label}</strong>
                          <span>{formatTime(event.timeS)}</span>
                          <span>d = {formatNumber(event.separationM, 3)} m</span>
                          <span>Δv = {formatNumber(event.relativeVelocityMS, 3)} m/s</span>
                        </div>
                      ))}
                    </div>
                  </section>
                  <section className="formula-card">
                    <p className="eyebrow">双棒公式与代值</p>
                    <MathTex block>{'\\varepsilon_1=+B_zLv_1,\\quad \\varepsilon_2=-B_zLv_2,\\quad \\varepsilon=-B_zL(v_2-v_1),\\quad I=\\varepsilon/R'}</MathTex>
                    <p>
                      Δv = {formatNumber(snapshot.relativeVelocityMS, 3)} m/s，ε = {formatSI(snapshot.emfTotalV, 'V')}，I = {formatSI(snapshot.currentA, 'A')}；
                      F_B1 = {formatSI(snapshot.forceRod1N, 'N')}，F_B2 = {formatSI(snapshot.forceRod2N, 'N')}。
                    </p>
                    <p className="formula-result">
                      (K−K₀)+Q_J−W_ext = {snapshot.energyResidualJ === null ? '手动模式不提供' : formatSI(snapshot.energyResidualJ, 'J')}；
                      p = {formatNumber(snapshot.totalMomentumKgMS, 3)} kg·m/s。
                    </p>
                  </section>
                  <div className="callout callout-note">
                    <Icon name="info" size={18} />
                    <div>
                      <strong>与 I02 的区别</strong>
                      <p>I02 是单棒与固定导轨的连接；I06 是两根可动杆组成的同一回路。这里只有一个电流，磁场力成对出现，静磁场下两杆机械功率之和等于 −I²R。</p>
                      <p>首次接触时解析解停止；不模拟弹性碰撞、碰撞耗能或将冲击能量计入焦耳热。</p>
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
