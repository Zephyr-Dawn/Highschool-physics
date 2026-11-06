import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { usePersistentState } from '../../hooks/usePersistentState';
import { usePlaybackClock } from '../../hooks/usePlaybackClock';
import { formatNumber, formatSI, formatTime } from '../../lib/format';
import { I08_LESSON } from '../../content/lessons';
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
  circuitClosedAt,
  generatorStateAt,
  solveGenerator,
  validateGeneratorParams,
  type CircuitSwitchEvent,
  type GeneratorParams,
  type GeneratorSnapshot,
  type GeneratorSolution,
} from '../../physics/induction/acGenerator';
import { ManualGeneratorSession } from '../../physics/induction/manualGeneratorMotion';
import { I08Charts } from './I08Charts';
import { I08Stage } from './I08Stage';
import {
  I08_PRESETS,
  I08_SCENE_STORAGE_KEY,
  decodeI08SceneJson,
  loadInitialI08Scene,
  parseI08StoredScene,
  serializeI08Scene,
  type I08Layers,
  type I08Mode,
  type I08Scene,
} from './i08Scene';

type PanelTabId = 'params' | 'lesson' | 'practice' | 'data';
type LearningMode = 'guided' | 'free';

const LAYER_ITEMS: Array<{ key: keyof I08Layers; label: string }> = [
  { key: 'field', label: '磁场 B' },
  { key: 'normal', label: '法线 n 与转向' },
  { key: 'coil', label: '线圈与角度历史' },
  { key: 'current', label: '感应电流方向' },
  { key: 'flux', label: 'Φ / Ψ 读数' },
  { key: 'emf', label: 'ε 读数' },
  { key: 'power', label: '功率与力矩' },
  { key: 'energy', label: '能量累计' },
  { key: 'load', label: '滑环 / 负载 / 开关' },
  { key: 'maskAnswers', label: '遮蔽数值（先预测）' },
];

function manualSolutionOf(params: GeneratorParams, history: GeneratorSnapshot[], fallback: GeneratorSnapshot): GeneratorSolution {
  const initial = history[0] ?? fallback;
  const final = history[history.length - 1] ?? fallback;
  return {
    params,
    timeline: [{ timeS: 0, closed: params.circuitClosed }],
    initial,
    final,
    samples: history.length > 0 ? history : [initial],
    keyTimesS: [0, params.durationS, ...history.map((item) => item.timeS)].sort((a, b) => a - b),
    durationS: params.durationS,
    status: 'ok',
    issue: null,
  };
}

export function AcGeneratorPage() {
  const initialScene = useMemo(() => loadInitialI08Scene(), []);
  const [storedScene, setStoredScene] = usePersistentState<unknown>(I08_SCENE_STORAGE_KEY, initialScene);
  const scene = useMemo(() => parseI08StoredScene(storedScene).scene ?? initialScene, [initialScene, storedScene]);
  const params = scene.params;
  const layers = scene.layers;
  const [learningMode, setLearningMode] = usePersistentState<LearningMode>('emplab.i08.mode.v1', 'guided');
  const [teacher, setTeacher] = useState(false);
  const [stageMode, setStageMode] = useState<StageMode>('interact');
  const [tab, setTab] = useState<PanelTabId>(learningMode === 'guided' ? 'lesson' : 'params');
  const [notice, setNotice] = useState<string | null>(null);
  const [manualDragging, setManualDragging] = useState(false);
  const [manualHistory, setManualHistory] = useState<GeneratorSnapshot[]>([]);
  const [manualSnapshot, setManualSnapshot] = useState<GeneratorSnapshot | null>(null);
  const [, setManualRevision] = useState(0);
  const [searchParams] = useSearchParams();
  const presetId = searchParams.get('preset');
  const appliedPresetRef = useRef<string | null>(null);
  const importRef = useRef<HTMLInputElement | null>(null);
  const noticeTimer = useRef<number | null>(null);
  const sceneRef = useRef(scene);
  const sessionRef = useRef<ManualGeneratorSession | null>(null);
  const manualOriginRef = useRef<{ wallSeconds: number; simulationSeconds: number } | null>(null);
  sceneRef.current = scene;

  const manual = scene.mode === 'manual';
  const paramsSignature = JSON.stringify(params);
  const modeSignature = scene.mode;

  const showNotice = useCallback((text: string) => {
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
    setNotice(text);
    noticeTimer.current = window.setTimeout(() => {
      setNotice(null);
      noticeTimer.current = null;
    }, 3600);
  }, []);
  useEffect(() => () => {
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
  }, []);

  const commitScene = useCallback((next: I08Scene) => setStoredScene(next), [setStoredScene]);

  const solved = useMemo(
    () => (manual ? null : solveGenerator(params, scene.circuitTimeline)),
    [manual, params, scene.circuitTimeline],
  );
  const fallbackSnapshot = useMemo(
    () => generatorStateAt(params, 0, scene.circuitTimeline),
    [params, scene.circuitTimeline],
  );
  const manualSolution = useMemo(
    () => manualSolutionOf(params, manualHistory, fallbackSnapshot),
    [fallbackSnapshot, manualHistory, params],
  );
  const solution = manual ? manualSolution : solved ?? manualSolution;
  const duration = params.durationS;
  const clock = usePlaybackClock(duration, solution.keyTimesS, { realTime: manual });
  const liveSnapshot = useMemo(
    () => (manual
      ? manualSnapshot ?? manualSolution.final
      : generatorStateAt(params, clock.time, scene.circuitTimeline)),
    [clock.time, manual, manualSnapshot, manualSolution.final, params, scene.circuitTimeline],
  );
  const currentClosed = manual
    ? (manualSnapshot?.status !== 'open-circuit')
    : circuitClosedAt(scene.circuitTimeline, clock.time);
  const effectiveParams = useMemo(() => ({ ...params, circuitClosed: currentClosed }), [currentClosed, params]);

  useEffect(() => {
    if (manual) clock.setSpeed(1);
  }, [clock.setSpeed, manual]);

  useEffect(() => {
    setTab(learningMode === 'guided' ? 'lesson' : 'params');
    setTeacher(false);
  }, [learningMode]);

  const resetManual = useCallback((nextParams: GeneratorParams) => {
    manualOriginRef.current = null;
    setManualDragging(false);
    if (sceneRef.current.mode === 'manual') {
      const session = new ManualGeneratorSession(nextParams);
      const initial = session.reset(0, nextParams.theta0Rad);
      sessionRef.current = session;
      setManualSnapshot(initial);
      setManualHistory([initial]);
      setManualRevision((value) => value + 1);
    } else {
      sessionRef.current = null;
      setManualSnapshot(null);
      setManualHistory([]);
    }
  }, []);

  useEffect(() => {
    clock.reset();
    resetManual(params);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramsSignature, modeSignature]);

  useEffect(() => {
    const preset = presetId ? I08_PRESETS[presetId] : undefined;
    if (!preset || appliedPresetRef.current === presetId) return;
    appliedPresetRef.current = presetId;
    commitScene({ ...preset, params: { ...preset.params }, circuitTimeline: preset.circuitTimeline.map((event) => ({ ...event })), layers: { ...preset.layers } });
    sceneRef.current = { ...preset, params: { ...preset.params }, circuitTimeline: preset.circuitTimeline.map((event) => ({ ...event })), layers: { ...preset.layers } };
    resetManual(preset.params);
    clock.reset();
    showNotice('已载入 I08 可复现预设 · 实验定义重建，t=0');
  }, [clock.reset, commitScene, presetId, resetManual, showNotice]);

  const updateParams = (patch: Partial<GeneratorParams>, message = '实验参数改变：定义重建，t=0'): boolean => {
    const nextParams = { ...params, ...patch };
    const validation = validateGeneratorParams(nextParams);
    if (!validation.valid || !validation.params) {
      showNotice(validation.issues[0] ?? '参数无效，已保留上一有效实验。');
      return false;
    }
    const nextScene: I08Scene = {
      ...sceneRef.current,
      params: validation.params,
      circuitTimeline: [{ timeS: 0, closed: validation.params.circuitClosed }],
    };
    commitScene(nextScene);
    sceneRef.current = nextScene;
    showNotice(message);
    return true;
  };

  const updateLayers = (patch: Partial<I08Layers>) => {
    const nextScene = { ...sceneRef.current, layers: { ...layers, ...patch } };
    commitScene(nextScene);
    sceneRef.current = nextScene;
  };

  const setMode = (mode: I08Mode) => {
    if (mode === scene.mode) return;
    const nextParams = { ...params, omegaRadPerS: mode === 'manual' ? 0 : Math.abs(params.omegaRadPerS) > 0 ? params.omegaRadPerS : 2 * Math.PI };
    const nextScene: I08Scene = {
      ...sceneRef.current,
      mode,
      params: nextParams,
      circuitTimeline: [{ timeS: 0, closed: params.circuitClosed }],
    };
    commitScene(nextScene);
    sceneRef.current = nextScene;
    showNotice(mode === 'manual' ? '切换到手动转动：先播放，再拖动角度手柄' : '切换到自动匀速：θ=θ₀+ωt');
  };

  const applyPreset = (id: string) => {
    const preset = I08_PRESETS[id];
    if (!preset) return;
    const nextScene = { ...preset, params: { ...preset.params }, circuitTimeline: preset.circuitTimeline.map((event) => ({ ...event })), layers: { ...preset.layers } };
    commitScene(nextScene);
    sceneRef.current = nextScene;
    resetManual(preset.params);
    clock.reset();
    showNotice(`已载入 I08 预设 ${id.replace('i08-', '')} · t=0`);
  };

  const toggleCircuit = () => {
    if (manual) {
      const session = sessionRef.current;
      if (!session) return;
      const nextClosed = (manualSnapshot?.status ?? 'active') === 'open-circuit';
      const next = session.setCircuitClosed(sampleManualTime(), nextClosed);
      setManualSnapshot(next);
      setManualHistory([...session.getHistory()]);
      setManualRevision((value) => value + 1);
      showNotice(nextClosed ? '开关闭合：角位置与历史保留，无自感模型下 I/P 即时出现' : '开关断开：角位置与历史保留，I/P 归零');
      return;
    }
    const closed = circuitClosedAt(sceneRef.current.circuitTimeline, clock.time);
    const nextEvent: CircuitSwitchEvent = { timeS: clock.time, closed: !closed };
    const timeline = [...sceneRef.current.circuitTimeline, nextEvent].sort((a, b) => a.timeS - b.timeS);
    const nextScene: I08Scene = { ...sceneRef.current, circuitTimeline: timeline };
    commitScene(nextScene);
    sceneRef.current = nextScene;
    showNotice(!closed ? '开关闭合：角相位不重置，I/P 按纯电阻模型立即出现' : '开关断开：角相位不重置，I/P 立即归零');
  };

  const exportScene = () => {
    const blob = new Blob([serializeI08Scene(sceneRef.current)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'i08-scene.json';
    anchor.click();
    URL.revokeObjectURL(url);
    showNotice('I08 场景已导出为 JSON');
  };

  const importScene = async (file: File) => {
    const text = await file.text();
    const parsed = decodeI08SceneJson(text);
    if (!parsed.scene) {
      showNotice(`I08 场景导入失败：${parsed.error ?? '格式无效'}`);
      return;
    }
    commitScene(parsed.scene);
    sceneRef.current = parsed.scene;
    resetManual(parsed.scene.params);
    clock.reset();
    showNotice('I08 场景已导入 · 从 t=0 重建');
  };

  const manualEnabled = manual && clock.playing;
  const sampleManualTime = () => {
    const origin = manualOriginRef.current;
    if (!origin) return clock.getTime();
    return origin.simulationSeconds + Math.max(0, performance.now() / 1000 - origin.wallSeconds);
  };

  const pushManual = (next: GeneratorSnapshot, session: ManualGeneratorSession) => {
    setManualSnapshot(next);
    setManualHistory([...session.getHistory()]);
    setManualRevision((value) => value + 1);
  };

  const handleManualStart = (thetaRad: number) => {
    if (!manual) return;
    if (!clock.playing) {
      showNotice('暂停中不会记录手动转动；请先按播放。');
      return;
    }
    if (!sessionRef.current) {
      const session = new ManualGeneratorSession(params);
      session.reset(clock.getTime(), thetaRad);
      sessionRef.current = session;
    }
    const session = sessionRef.current;
    manualOriginRef.current = {
      wallSeconds: performance.now() / 1000,
      simulationSeconds: clock.getTime(),
    };
    pushManual(session.begin(sampleManualTime(), thetaRad), session);
    setManualDragging(true);
    showNotice('正在转动手柄：ω 由真实时间戳估计；第二指取消；松手后 ω→0');
  };

  const handleManualChange = (thetaRad: number) => {
    if (!manualEnabled) return;
    const session = sessionRef.current;
    if (!session) return;
    pushManual(session.record(sampleManualTime(), thetaRad), session);
  };

  const handleManualEnd = () => {
    const session = sessionRef.current;
    if (!session) return;
    pushManual(session.end(Math.max(sampleManualTime(), session.getLastTime())), session);
    setManualDragging(false);
    manualOriginRef.current = null;
    showNotice('松手：ω=0，ε/I 归零；历史与累计能量保留');
  };

  const handleManualCancel = () => {
    const session = sessionRef.current;
    if (!session) return;
    pushManual(session.cancel(Math.max(sampleManualTime(), session.getLastTime())), session);
    setManualDragging(false);
    manualOriginRef.current = null;
    showNotice('手势已取消：不记录取消瞬间的伪角速度');
  };

  useEffect(() => {
    if (!manual || !manualDragging || !clock.playing) return;
    let frame = 0;
    let last = 0;
    const tick = (now: number) => {
      if (now - last >= 40) {
        last = now;
        const session = sessionRef.current;
        if (session) pushManual(session.record(sampleManualTime(), session.getLastTheta()), session);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [clock.playing, manual, manualDragging]);

  useEffect(() => {
    if (!manual || manualDragging || !clock.playing) return;
    const timer = window.setInterval(() => {
      const session = sessionRef.current;
      if (!session) return;
      pushManual(session.idle(clock.getTime()), session);
    }, 120);
    return () => window.clearInterval(timer);
  }, [clock.getTime, clock.playing, manual, manualDragging]);

  useEffect(() => {
    if (!manual || !manualDragging || clock.playing) return;
    handleManualCancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clock.playing, manual, manualDragging]);

  const modeLabel = manual ? 'G2 手指转动' : 'G1 自动匀速';
  const timeLabel = formatTime(liveSnapshot.timeS);
  const questionCount = questionsForModel('i08').length;
  const theta0Deg = (params.theta0Rad * 180) / Math.PI;
  const historyForCharts = manual ? manualHistory : solution.samples;
  const clean = (value: number) => (Math.abs(value) < 1e-12 ? 0 : value);
  const keyFrames: KeyFrame[] = solution.keyTimesS.map((time, index) => ({
    time,
    label: index === 0 ? '起点' : `${formatNumber(time, 2)} s`,
  }));
  const teacherControls = (
    <div className="teacher-layer-bar" role="group" aria-label="I08 教师图层">
      {LAYER_ITEMS.map((item) => (
        <button
          key={item.key}
          type="button"
          className="teacher-layer-chip"
          aria-pressed={layers[item.key]}
          onClick={() => updateLayers({ [item.key]: !layers[item.key] } as Partial<I08Layers>)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );

  return (
    <div className={`sim-page i08-page learning-${learningMode} ${teacher ? 'teacher-on' : ''}`}>
      <header className="sim-header">
        <div>
          <p className="eyebrow">I08 · 电磁感应 · 交变电流</p>
          <h1>交流发电机与交变电流</h1>
          <p className="sim-lede">
            线圈在匀强磁场中转动：法线与 B 的夹角 θ 决定磁通量，−dΨ/dt 产生正弦电动势；滑环输出交流，负载与内阻共同分配焦耳热，机械输入功率与电功率逐时平衡。
          </p>
        </div>
        <div className="sim-header-actions">
          <Segmented<LearningMode> ariaLabel="学习模式" value={learningMode} onChange={setLearningMode} options={[{ value: 'guided', label: '引导' }, { value: 'free', label: '自由' }]} />
          <button type="button" className="secondary-button" onClick={() => setTeacher((value) => !value)} aria-pressed={teacher} data-testid="i08-teacher-toggle">
            <Icon name="presentation" size={17} />{teacher ? '退出教师视图' : '教师视图'}
          </button>
        </div>
      </header>

      <div className={`sim-layout ${teacher ? 'sim-layout-teacher' : ''}`}>
        <div className="sim-stage-column">
          <I08Stage
            params={effectiveParams}
            mode={scene.mode}
            snapshot={liveSnapshot}
            history={historyForCharts}
            layers={layers}
            stageMode={stageMode}
            onStageModeChange={setStageMode}
            manualEnabled={manualEnabled}
            manualDragging={manualDragging}
            onManualStart={handleManualStart}
            onManualChange={handleManualChange}
            onManualEnd={handleManualEnd}
            onManualCancel={handleManualCancel}
            conditionNotice={notice}
          />
          {teacher ? (
            <TeacherDock
              formula={'\\Phi=BA\\cos\\theta,\\quad \\Psi=N\\Phi,\\quad \\varepsilon=-\\frac{d\\Psi}{dt}=NBA\\omega\\sin\\theta'}
              stats={[
                { label: '模式', value: modeLabel },
                { label: 'θ', value: `${formatNumber((liveSnapshot.thetaWrappedRad * 180) / Math.PI, 1)}°` },
                { label: 'Φ', value: formatSI(liveSnapshot.fluxWb, 'Wb') },
                { label: 'Ψ', value: `${formatNumber(liveSnapshot.linkageWbTurn, 4)} Wb·turn` },
                { label: 'ε', value: formatSI(liveSnapshot.emfV, 'V') },
                { label: 'I', value: liveSnapshot.currentA === null ? '—' : formatSI(liveSnapshot.currentA, 'A') },
                { label: 'τ_em', value: formatSI(liveSnapshot.torqueEmNm, 'N·m') },
                { label: 'E_rms', value: liveSnapshot.emfRmsV === null ? 'N/A（手动）' : formatSI(liveSnapshot.emfRmsV, 'V') },
                { label: 'W_drive', value: formatSI(liveSnapshot.energy.driveJ, 'J') },
                { label: '残差', value: liveSnapshot.energy.residualJ === null ? '估计' : formatSI(liveSnapshot.energy.residualJ, 'J') },
              ]}
              footnote={`t = ${timeLabel} · ${liveSnapshot.status} · ${currentClosed ? '闭合' : '断开'} · ${manual ? '手动估计' : '解析匀速'}`}
              controls={teacherControls}
            />
          ) : null}
          <PlaybackBar
            clock={clock}
            duration={duration}
            keyFrames={keyFrames}
            timeLabel={timeLabel}
            secondaryLabel={`${modeLabel} · θ=${formatNumber((liveSnapshot.thetaWrappedRad * 180) / Math.PI, 1)}° · ε=${formatNumber(liveSnapshot.emfV, 3)} V`}
            timelineLabel="I08 同一物理时间轴"
            note={manual ? '手动模式固定 1× 真实仿真时间；暂停不记录转角；松手后 ω=0。' : '自动匀速 θ=θ₀+ωt；开关事件不重置角度与时间。'}
            speeds={manual ? [1] : undefined}
          />
        </div>

        {!teacher ? (
          <aside className="sim-panel" aria-label="I08 实验控制台">
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
                      <h2>转动线圈 · 滑环输出交流</h2>
                      <p>自动模式是规定匀速；手动模式由真实 pointer 时间戳估计 ω；两者共用同一电阻电路。</p>
                    </div>
                  </div>
                  <div className="mode-card-grid" role="group" aria-label="I08 模式">
                    {[
                      { id: 'auto' as const, title: 'G1 自动匀速', subtitle: 'θ=θ₀+ωt，解析正弦' },
                      { id: 'manual' as const, title: 'G2 手指转动', subtitle: '拖角度手柄，ω 由时间戳估计' },
                    ].map((item) => (
                      <button key={item.id} type="button" className={`mode-card ${scene.mode === item.id ? 'is-active' : ''}`} aria-pressed={scene.mode === item.id} onClick={() => setMode(item.id)} data-testid={`i08-mode-${item.id}`}>
                        <strong>{item.title}</strong><span>{item.subtitle}</span>
                      </button>
                    ))}
                  </div>
                  <div className="preset-chips" aria-label="I08 预设">
                    {Object.keys(I08_PRESETS).map((id) => (
                      <button key={id} type="button" className="chip-button" onClick={() => applyPreset(id)} data-testid={`i08-preset-${id}`}>
                        {id.replace('i08-', '')}
                      </button>
                    ))}
                  </div>
                  <section className="panel-section">
                    <h3 className="section-title">线圈与磁场</h3>
                    <ParamSlider label="匝数 N" value={params.turns} min={1} max={50} step={1} unit="turn" decimals={0} domain={PARAMETER_DOMAINS.turns} onChange={(value) => updateParams({ turns: value })} commitSemantics="shared-reset" />
                    <ParamSlider label="线圈面积 A" value={params.areaM2} min={0.001} max={1} step={0.001} unit="m²" decimals={4} domain={PARAMETER_DOMAINS.positiveLength} onChange={(value) => updateParams({ areaM2: value })} commitSemantics="shared-reset" />
                    <ParamSlider label="磁感应强度 B" value={params.bTesla} min={-2} max={2} step={0.05} unit="T" decimals={3} domain={PARAMETER_DOMAINS.magneticField} onChange={(value) => updateParams({ bTesla: value })} commitSemantics="shared-reset" />
                    <ParamSlider label="初始角 θ₀" value={theta0Deg} min={-180} max={360} step={5} unit="°" decimals={1} domain={PARAMETER_DOMAINS.angleDeg} onChange={(value) => updateParams({ theta0Rad: (value * Math.PI) / 180 })} description="θ 是法线与 B 的夹角；π/2 rad 请写 90°。" commitSemantics="shared-reset" />
                    <ParamSlider label="角速度 ω" value={params.omegaRadPerS} min={-20} max={20} step={0.1} unit="rad/s" decimals={3} domain={PARAMETER_DOMAINS.angularVelocity} onChange={(value) => updateParams({ omegaRadPerS: value })} description="ω 符号表示转向；自动模式使用 θ=θ₀+ωt。" commitSemantics="shared-reset" />
                  </section>
                  <section className="panel-section">
                    <h3 className="section-title">电路与演示</h3>
                    <ParamSlider label="负载电阻 R_L" value={params.loadResistanceOhm} min={0} max={20} step={0.1} unit="Ω" decimals={2} domain={PARAMETER_DOMAINS.resistance} onChange={(value) => updateParams({ loadResistanceOhm: value })} commitSemantics="shared-reset" />
                    <ParamSlider label="内阻 r" value={params.internalResistanceOhm} min={0} max={20} step={0.1} unit="Ω" decimals={2} domain={PARAMETER_DOMAINS.resistance} onChange={(value) => updateParams({ internalResistanceOhm: value })} commitSemantics="shared-reset" />
                    <p className="param-description" data-testid="i08-total-resistance">R_L + r = {formatNumber(params.loadResistanceOhm + params.internalResistanceOhm, 3)} Ω。R_L=0 且 r&gt;0 是合法短路。</p>
                    <ToggleSwitch label={currentClosed ? '闭合回路（点击断开）' : '断开回路（点击闭合）'} checked={currentClosed} onChange={toggleCircuit} description="开关是运行中事件：不重置角位置或时间；纯电阻模型下 I/P 即时变化。" />
                    <ParamSlider label="演示时长" value={params.durationS} min={0.5} max={20} step={0.5} unit="s" decimals={1} domain={PARAMETER_DOMAINS.i04Duration} onChange={(value) => updateParams({ durationS: value })} commitSemantics="shared-reset" />
                  </section>
                  <section className="panel-section">
                    <h3 className="section-title">显示图层</h3>
                    <div className="toggle-list">
                      {LAYER_ITEMS.map((item) => (
                        <ToggleSwitch key={item.key} label={item.label} checked={layers[item.key]} onChange={() => updateLayers({ [item.key]: !layers[item.key] } as Partial<I08Layers>)} />
                      ))}
                    </div>
                  </section>
                  <section className="panel-section">
                    <h3 className="section-title">场景数据</h3>
                    <div className="scene-io-row">
                      <button type="button" className="secondary-button" onClick={exportScene}><Icon name="download" size={16} />导出场景 JSON</button>
                      <button type="button" className="secondary-button" onClick={() => importRef.current?.click()}><Icon name="upload" size={16} />导入场景 JSON</button>
                      <input ref={importRef} type="file" accept="application/json,.json" hidden data-testid="i08-scene-import" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importScene(file); event.target.value = ''; }} />
                    </div>
                  </section>
                  <button type="button" className="secondary-button wide-button" onClick={() => applyPreset('i08-standard')}><Icon name="reset" size={17} />恢复默认 I08 场景</button>
                </div>
              ) : null}

              {tab === 'lesson' ? (
                <LessonRunner
                  steps={I08_LESSON}
                  storageKey="emplab.i08.lesson.v1"
                  overview={{
                    goals: [
                      '用法线与 B 的夹角 θ 写出 Φ、Ψ 和 ε 的正弦关系。',
                      '区分瞬时值、峰值、有效值与整周期平均值。',
                      '理解开/闭路、负载与内阻的能量分配，以及手动转动是估计而非解析正弦。',
                    ],
                    prerequisites: ['磁通量、法拉第定律与楞次定律。', '圆周运动角速度、频率与相位。', 'I01/I04 的磁通变化和 I05 的能量账本。'],
                    misconceptions: ['把线圈平面与 B 的夹角当作 θ。', '把峰值当有效值，或认为整周期平均电动势等于有效值。', '把滑环画成换向器，误认为输出直流。'],
                  }}
                  onApplyPreset={applyPreset}
                  onGoPractice={() => setTab('practice')}
                />
              ) : null}

              {tab === 'practice' ? <PracticePanel modelId="i08" /> : null}

              {tab === 'data' ? (
                <div className="panel-section-stack">
                  <div className="panel-intro">
                    <div>
                      <h2>同一时间基准 · 同一快照</h2>
                      <p>t = {timeLabel}；{modeLabel}；{liveSnapshot.status}；{currentClosed ? '闭合' : '断开'}。</p>
                    </div>
                  </div>
                  <ReadoutGrid
                    items={[
                      { label: 'θ（法线 vs B）', value: `${formatNumber((liveSnapshot.thetaWrappedRad * 180) / Math.PI, 3)}°`, testId: 'i08-theta' },
                      { label: 'Φ 单匝磁通', value: formatSI(clean(liveSnapshot.fluxWb), 'Wb'), testId: 'i08-flux' },
                      { label: 'Ψ 磁链', value: `${formatNumber(clean(liveSnapshot.linkageWbTurn), 5)} Wb·turn`, testId: 'i08-linkage' },
                      { label: 'ε 瞬时电动势', value: formatSI(clean(liveSnapshot.emfV), 'V'), testId: 'i08-emf' },
                      { label: 'I 瞬时电流', value: liveSnapshot.currentA === null ? '—' : formatSI(clean(liveSnapshot.currentA), 'A'), testId: 'i08-current' },
                      { label: 'E_peak / E_rms', value: `${formatSI(liveSnapshot.emfPeakV, 'V')} / ${liveSnapshot.emfRmsV === null ? 'N/A（手动）' : formatSI(liveSnapshot.emfRmsV, 'V')}`, testId: 'i08-rms' },
                      { label: 'I_peak / I_rms', value: liveSnapshot.currentPeakA === null ? '—' : `${formatSI(liveSnapshot.currentPeakA, 'A')} / ${liveSnapshot.currentRmsA === null ? 'N/A' : formatSI(liveSnapshot.currentRmsA, 'A')}`, testId: 'i08-current-rms' },
                      { label: '频率 / 周期', value: liveSnapshot.frequencyHz === null ? 'N/A（ω=0）' : `${formatNumber(liveSnapshot.frequencyHz, 4)} Hz / ${formatNumber(liveSnapshot.periodS ?? 0, 4)} s`, testId: 'i08-frequency' },
                      { label: 'P_drive / P_L / P_r', value: `${formatSI(clean(liveSnapshot.pDriveW), 'W')} / ${formatSI(clean(liveSnapshot.pLoadW), 'W')} / ${formatSI(clean(liveSnapshot.pInternalW), 'W')}`, testId: 'i08-power' },
                      { label: 'τ_em / τ_drive', value: `${formatSI(clean(liveSnapshot.torqueEmNm), 'N·m')} / ${formatSI(clean(liveSnapshot.torqueDriveNm), 'N·m')}`, testId: 'i08-torque' },
                      { label: 'W_drive 累计', value: formatSI(liveSnapshot.energy.driveJ, 'J'), testId: 'i08-drive-energy' },
                      { label: 'Q_L / Q_r 累计', value: `${formatSI(liveSnapshot.energy.loadJ, 'J')} / ${formatSI(liveSnapshot.energy.internalJ, 'J')}`, testId: 'i08-heat' },
                      { label: '能量残差', value: liveSnapshot.energy.residualJ === null ? '估计模式' : formatSI(liveSnapshot.energy.residualJ, 'J'), hint: liveSnapshot.approximation, testId: 'i08-energy-residual' },
                      { label: '状态', value: liveSnapshot.status, testId: 'i08-status' },
                    ]}
                  />
                  <section className="panel-section">
                    <h3 className="section-title">实时图像</h3>
                    <I08Charts history={historyForCharts} snapshot={liveSnapshot} duration={duration} />
                  </section>
                  <section className="panel-section">
                    <h3 className="section-title">开关事件</h3>
                    <div className="i08-event-table" data-testid="i08-event-list">
                      {(manual ? [] : solution.timeline).map((event, index) => (
                        <div key={`${event.timeS}-${index}`} className="i08-event-row">
                          <span>{formatNumber(event.timeS, 4)} s</span>
                          <span>{event.closed ? '闭合' : '断开'}</span>
                          <span>{event.closed ? 'I/P 出现，角度保留' : 'I/P 归零，角度保留'}</span>
                        </div>
                      ))}
                      {manual ? <p className="empty-note">手动模式的开关事件记录在真实历史中；图上可看到 I/P 的即时跳变。</p> : null}
                    </div>
                  </section>
                  <section className="panel-section">
                    <h3 className="section-title">公式与能量</h3>
                    <MathTex block>{'\\Phi=BA\\cos\\theta,\\quad \\Psi=N\\Phi'}</MathTex>
                    <MathTex block>{'\\varepsilon=-\\frac{d\\Psi}{dt}=NBA\\omega\\sin\\theta'}</MathTex>
                    <MathTex block>{'E_{\\rm peak}=N|B|A|\\omega|,\\quad E_{\\rm rms}=\\frac{E_{\\rm peak}}{\\sqrt2}'}</MathTex>
                    <MathTex block>{'P_{\\rm drive}=\\varepsilon I=P_L+P_r,\\quad W_{\\rm drive}=Q_L+Q_r'}</MathTex>
                    <p className="param-description">
                      采用滑环输出交流，不是换向器直流。忽略自感、互感、摩擦与边缘场；规定匀速不求解角加速度。手动模式的有效值与能量为时间戳估计。
                    </p>
                  </section>
                  <section className="panel-section model-boundary">
                    <h3 className="section-title">模型边界</h3>
                    <p>只支持刚性 N 匝线圈、静态均匀 B、纯电阻负载与内阻；不包含 RLC、自感/互感、变压器、整流器、机械角动力学或磁路非线性。所有触摸为模拟测试，真实 iPadOS/Android 仍未验收。</p>
                  </section>
                </div>
              ) : null}
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
