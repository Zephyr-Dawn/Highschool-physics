import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { usePersistentState } from '../../hooks/usePersistentState';
import { usePlaybackClock } from '../../hooks/usePlaybackClock';
import { formatNumber, formatSI, formatTime } from '../../lib/format';
import { I07_LESSON } from '../../content/lessons';
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
  solveI07,
  stateAtI07Time,
  validateI07Params,
  i07WallLimit,
  type I07Params,
  type I07Snapshot,
  type I07Solution,
} from '../../physics/induction/oppositeFieldsWallLoop';
import { ManualWallLoopSession } from '../../physics/induction/manualWallLoopMotion';
import { I07Charts } from './I07Charts';
import { I07Stage } from './I07Stage';
import {
  I07_DEFAULT_LAYERS,
  I07_PRESETS,
  I07_SCENE_STORAGE_KEY,
  decodeI07SceneJson,
  i07PlaybackDuration,
  loadInitialI07Scene,
  parseI07StoredScene,
  serializeI07Scene,
  type I07Layers,
  type I07Scene,
} from './i07Scene';

type PanelTabId = 'params' | 'lesson' | 'practice' | 'data';
type LearningMode = 'guided' | 'free';
type ConditionNotice = string | null;

const MODE_ITEMS: Array<{ id: I07Params['mode']; title: string; subtitle: string }> = [
  { id: 'prescribed', title: 'M1 匀速约束', subtitle: '外部强制匀速；到达挡板时停下，不假反弹' },
  { id: 'free', title: 'M2 自由滑行', subtitle: '无外力，磁场阻尼 + 真实挡板反弹' },
  { id: 'forces', title: 'M3 恒力驱动', subtitle: '恒定外力，可折返、终端速度与反复碰板' },
  { id: 'manual-x', title: 'M4 手指拖线框', subtitle: '真实时间戳估计速度；松手后外部保持静止' },
];

const LAYER_ITEMS: Array<{ key: keyof I07Layers; label: string }> = [
  { key: 'field', label: '双磁区符号与边界' },
  { key: 'overlap', label: '面积重叠与历史轨迹' },
  { key: 'current', label: '感应电流方向' },
  { key: 'velocity', label: '速度矢量' },
  { key: 'magneticForce', label: '安培力 F_B' },
  { key: 'externalForce', label: '外力 / 约束力' },
  { key: 'wall', label: '挡板与恢复系数' },
  { key: 'heat', label: '焦耳热 / 冲击损失' },
  { key: 'events', label: '场界与碰板事件' },
  { key: 'maskAnswers', label: '遮蔽方向/数值（先预测）' },
];

function eventKindLabel(kind: string): string {
  if (kind === 'geometry') return '场界';
  if (kind === 'turning') return '速度过零';
  if (kind === 'wall-bounce') return '挡板反弹';
  if (kind === 'wall-held') return '挡板静力约束';
  if (kind === 'wall-stop') return '约束运动停止';
  if (kind === 'start') return '起点';
  return '结束';
}

function manualSolutionOf(
  params: I07Params,
  history: I07Snapshot[],
  fallback: I07Snapshot,
): I07Solution {
  const initial = history[0] ?? fallback;
  const final = history[history.length - 1] ?? fallback;
  return {
    params,
    initial,
    final,
    samples: history.length > 0 ? history : [initial],
    events: [],
    segments: [],
    keyTimesS: [0, params.durationS, ...history.map((item) => item.timeS)].sort((a, b) => a - b),
    durationS: params.durationS,
    status: 'ok',
    issue: null,
    totalImpactLossJ: final.impactLossJ,
    bounceCount: 0,
  };
}

export function OppositeFieldsLoopPage() {
  const initialScene = useMemo(() => loadInitialI07Scene(), []);
  const [storedScene, setStoredScene] = usePersistentState<unknown>(
    I07_SCENE_STORAGE_KEY,
    initialScene,
  );
  const scene = useMemo(
    () => parseI07StoredScene(storedScene).scene ?? initialScene,
    [initialScene, storedScene],
  );
  const params = scene.params;
  const layers = scene.layers;
  const [learningMode, setLearningMode] = usePersistentState<LearningMode>('emplab.i07.mode.v1', 'guided');
  const [teacher, setTeacher] = useState(false);
  const [stageMode, setStageMode] = useState<StageMode>('interact');
  const [tab, setTab] = useState<PanelTabId>(learningMode === 'guided' ? 'lesson' : 'params');
  const [notice, setNotice] = useState<ConditionNotice>(null);
  const [manualDragging, setManualDragging] = useState(false);
  const [manualHistory, setManualHistory] = useState<I07Snapshot[]>([]);
  const [manualSnapshot, setManualSnapshot] = useState<I07Snapshot | null>(null);
  const [, setManualRevision] = useState(0);
  const [searchParams] = useSearchParams();
  const presetId = searchParams.get('preset');
  const appliedPresetRef = useRef<string | null>(null);
  const importRef = useRef<HTMLInputElement | null>(null);
  const noticeTimer = useRef<number | null>(null);
  const sceneRef = useRef(scene);
  const manualSessionRef = useRef<ManualWallLoopSession | null>(null);
  const manualXRef = useRef(params.startXM);
  const manualOriginRef = useRef<{ wallSeconds: number; simulationSeconds: number } | null>(null);
  sceneRef.current = scene;

  const manualX = params.mode === 'manual-x';
  const paramsSignature = JSON.stringify(params);

  const showNotice = useCallback((text: string) => {
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
    setNotice(text);
    noticeTimer.current = window.setTimeout(() => {
      setNotice(null);
      noticeTimer.current = null;
    }, 3400);
  }, []);
  useEffect(() => () => {
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
  }, []);

  const commitScene = useCallback(
    (next: I07Scene) => setStoredScene(next),
    [setStoredScene],
  );

  const solvedSolution = useMemo(() => solveI07(params), [params]);
  const fallbackSnapshot = solvedSolution.initial;

  const manualSolution = useMemo(
    () => manualSolutionOf(params, manualHistory, fallbackSnapshot),
    [fallbackSnapshot, manualHistory, params],
  );
  const solution = manualX ? manualSolution : solvedSolution;
  const historySamples = manualX ? manualHistory : solvedSolution.samples;

  const duration = manualX ? params.durationS : i07PlaybackDuration(params, solvedSolution);
  const keyFrames = useMemo<KeyFrame[]>(() => {
    const frames: KeyFrame[] = [{ time: 0, label: '起点' }];
    if (!manualX) {
      for (const event of solvedSolution.events) {
        if (event.timeS > 0 && event.timeS < duration - 1e-9) {
          frames.push({ time: event.timeS, label: eventKindLabel(event.kind) });
        }
      }
    }
    frames.push({ time: duration, label: manualX ? '手动历史结束' : '结束' });
    const seen = new Set<string>();
    return frames.filter((frame) => {
      const key = frame.time.toFixed(7);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [duration, manualX, solvedSolution.events]);

  const clock = usePlaybackClock(duration, keyFrames.map((frame) => frame.time), { realTime: manualX });
  const snapshot = manualX
    ? manualSnapshot ?? manualSolution.final
    : stateAtI07Time(solvedSolution, clock.time);

  useEffect(() => {
    if (manualX) clock.setSpeed(1);
  }, [clock.setSpeed, manualX]);

  useEffect(() => {
    setTab(learningMode === 'guided' ? 'lesson' : 'params');
    setTeacher(false);
  }, [learningMode]);

  const resetManual = useCallback((nextParams: I07Params) => {
    manualOriginRef.current = null;
    manualXRef.current = nextParams.startXM;
    setManualDragging(false);
    if (nextParams.mode === 'manual-x') {
      const session = new ManualWallLoopSession(nextParams);
      const initial = session.reset(0, nextParams.startXM);
      manualSessionRef.current = session;
      setManualSnapshot(initial);
      setManualHistory([initial]);
      setManualRevision((value) => value + 1);
    } else {
      manualSessionRef.current = null;
      setManualSnapshot(null);
      setManualHistory([]);
    }
  }, []);

  useEffect(() => {
    clock.reset();
    resetManual(params);
    // paramsSignature owns this reset; handlers are read from refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramsSignature]);

  useEffect(() => {
    const preset = presetId ? I07_PRESETS[presetId] : undefined;
    if (!preset || appliedPresetRef.current === presetId) return;
    appliedPresetRef.current = presetId;
    commitScene({
      schemaVersion: 2,
      model: 'i07',
      params: { ...preset },
      layers: { ...I07_DEFAULT_LAYERS },
    });
    resetManual(preset);
    clock.reset();
    showNotice('已载入 I07 可复现预设 · 实验定义重建，t=0');
  }, [clock.reset, commitScene, presetId, resetManual, showNotice]);

  const updateParams = (patch: Partial<I07Params>, message = '实验参数改变：定义重建，t=0'): boolean => {
    const nextParams = { ...params, ...patch };
    const validation = validateI07Params(nextParams);
    if (!validation.valid || !validation.params) {
      showNotice(validation.issues[0] ?? '参数无效，已保留上一有效实验。');
      return false;
    }
    commitScene({ ...sceneRef.current, params: validation.params });
    showNotice(message);
    return true;
  };

  const updateLayers = (patch: Partial<I07Layers>) => {
    commitScene({ ...sceneRef.current, layers: { ...layers, ...patch } });
  };

  const applyPreset = (id: string) => {
    const preset = I07_PRESETS[id];
    if (!preset) return;
    commitScene({
      schemaVersion: 2,
      model: 'i07',
      params: { ...preset },
      layers: { ...I07_DEFAULT_LAYERS },
    });
    resetManual(preset);
    clock.reset();
    showNotice(`已载入 I07 预设 ${id.replace('i07-', '')} · t=0`);
  };

  const setMode = (mode: I07Params['mode']) => {
    if (mode === params.mode) return;
    updateParams({ mode }, `切换 ${MODE_ITEMS.find((item) => item.id === mode)?.title ?? mode}：实验定义重建，t=0`);
  };

  const exportScene = () => {
    const blob = new Blob([serializeI07Scene(sceneRef.current)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'i07-scene.json';
    anchor.click();
    URL.revokeObjectURL(url);
    showNotice('I07 场景已导出为 JSON');
  };

  const importScene = async (file: File) => {
    const text = await file.text();
    const parsed = decodeI07SceneJson(text);
    if (!parsed.scene) {
      showNotice(`I07 场景导入失败：${parsed.error ?? '格式无效'}`);
      return;
    }
    commitScene(parsed.scene);
    resetManual(parsed.scene.params);
    clock.reset();
    showNotice('I07 场景已导入 · 从 t=0 重建');
  };

  const manualEnabled = manualX && clock.playing;
  const sampleManualTime = () => {
    const origin = manualOriginRef.current;
    if (!origin) return clock.getTime();
    return origin.simulationSeconds + Math.max(0, performance.now() / 1000 - origin.wallSeconds);
  };

  const pushManual = (next: I07Snapshot, session: ManualWallLoopSession) => {
    setManualSnapshot(next);
    setManualHistory([...session.getHistory()]);
    setManualRevision((value) => value + 1);
  };

  const handleManualStart = (xM: number) => {
    if (!manualX) return;
    if (!clock.playing) {
      showNotice('暂停中不会记录手动拖动；请先按播放。');
      return;
    }
    if (!manualSessionRef.current) {
      const session = new ManualWallLoopSession(params);
      session.reset(clock.getTime(), xM);
      manualSessionRef.current = session;
    }
    const session = manualSessionRef.current;
    manualXRef.current = xM;
    manualOriginRef.current = {
      wallSeconds: performance.now() / 1000,
      simulationSeconds: clock.getTime(),
    };
    pushManual(session.beginDrag(sampleManualTime(), xM), session);
    setManualDragging(true);
    showNotice('正在拖动线框：速度由真实时间戳估计；第二指可取消；挡板处位置被夹持');
  };

  const handleManualChange = (xM: number) => {
    if (!manualEnabled) return;
    const session = manualSessionRef.current;
    if (!session) return;
    manualXRef.current = xM;
    pushManual(session.record(sampleManualTime(), xM), session);
  };

  const handleManualEnd = () => {
    const session = manualSessionRef.current;
    if (!session) return;
    pushManual(session.endDrag(Math.max(sampleManualTime(), session.getLastTime())), session);
    setManualDragging(false);
    manualOriginRef.current = null;
    showNotice('松手：线框由外部保持静止（v=0），不是自由弹性反弹');
  };

  const handleManualCancel = () => {
    const session = manualSessionRef.current;
    if (!session) return;
    pushManual(session.cancel(Math.max(sampleManualTime(), session.getLastTime())), session);
    setManualDragging(false);
    manualOriginRef.current = null;
    showNotice('手势已取消：不记录取消瞬间的伪速度尖峰');
  };

  useEffect(() => {
    if (!manualX || !manualDragging || !clock.playing) return;
    let frame = 0;
    let last = 0;
    const tick = (now: number) => {
      if (now - last >= 40) {
        last = now;
        const session = manualSessionRef.current;
        if (session) pushManual(session.record(sampleManualTime(), manualXRef.current), session);
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
      pushManual(session.idle(clock.getTime()), session);
    }, 120);
    return () => window.clearInterval(timer);
  }, [clock.getTime, clock.playing, manualDragging, manualX]);

  useEffect(() => {
    if (!manualX || !manualDragging || clock.playing) return;
    handleManualCancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clock.playing, manualDragging, manualX]);

  const modeLabel = MODE_ITEMS.find((item) => item.id === params.mode)?.title ?? params.mode;
  const timeLabel = formatTime(snapshot.timeS);
  const questionCount = questionsForModel('i07').length;
  const wallLimit = i07WallLimit(params);
  const teacherControls = (
    <div className="teacher-layer-bar" role="group" aria-label="I07 教师图层">
      {LAYER_ITEMS.map((item) => (
        <button
          key={item.key}
          type="button"
          className="teacher-layer-chip"
          aria-pressed={layers[item.key]}
          onClick={() => updateLayers({ [item.key]: !layers[item.key] } as Partial<I07Layers>)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );

  const ledgerResidual = snapshot.energyResidualJ;
  const energyBalance = snapshot.kineticEnergyJ + snapshot.jouleHeatJ + snapshot.impactLossJ - snapshot.externalWorkJ;

  return (
    <div className={`sim-page i07-page learning-${learningMode} ${teacher ? 'teacher-on' : ''}`}>
      <header className="sim-header">
        <div>
          <p className="eyebrow">I07 · 电磁感应 · 三期为</p>
          <h1>相反磁场双区域 · 运动线框 · 弹性挡板</h1>
          <p className="sim-lede">
            带符号磁通量在相反磁区之间代数叠加；线框可以出现零磁通但非零电动势。磁场阻尼、真实挡板冲量、焦耳热与冲击损失分别记账。
          </p>
        </div>
        <div className="sim-header-actions">
          <Segmented<LearningMode>
            ariaLabel="学习模式"
            value={learningMode}
            onChange={setLearningMode}
            options={[
              { value: 'guided', label: '引导' },
              { value: 'free', label: '自由' },
            ]}
          />
          <button type="button" className="secondary-button" onClick={() => setTeacher((value) => !value)} aria-pressed={teacher} data-testid="i07-teacher-toggle">
            <Icon name="presentation" size={17} />{teacher ? '退出教师视图' : '教师视图'}
          </button>
        </div>
      </header>

      <div className={`sim-layout ${teacher ? 'sim-layout-teacher' : ''}`}>
        <div className="sim-stage-column">
          <I07Stage
            params={params}
            solution={solution}
            snapshot={snapshot}
            history={historySamples}
            layers={layers}
            stageMode={stageMode}
            onStageModeChange={setStageMode}
            manualMode={manualX}
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
              formula={'\\Phi=h(B_1\\ell_1+B_2\\ell_2),\\quad \\varepsilon=-NhSv_x,\\quad F_{Bx}=NIhS,\\quad S=B_1g_1+B_2g_2'}
              stats={[
                { label: '模式', value: modeLabel },
                { label: 'x', value: `${formatNumber(snapshot.xM, 3)} m` },
                { label: 'vx', value: `${formatNumber(snapshot.velocityMps, 3)} m/s` },
                { label: 'S', value: formatNumber(snapshot.S, 3) },
                { label: 'Φ', value: formatSI(snapshot.fluxWb, 'Wb') },
                { label: 'ε', value: formatSI(snapshot.emfV, 'V') },
                { label: 'I', value: formatSI(snapshot.currentA ?? 0, 'A') },
                { label: 'F_B', value: formatSI(snapshot.magneticForceN ?? 0, 'N') },
                { label: 'Q_J', value: formatSI(snapshot.jouleHeatJ, 'J') },
                { label: 'Q_impact', value: formatSI(snapshot.impactLossJ, 'J') },
                { label: '能量残差', value: ledgerResidual === null ? '不适用' : formatSI(ledgerResidual, 'J') },
              ]}
              footnote={`t = ${timeLabel} · ${snapshot.status} · 挡板 ${params.wallEnabled ? `x=${formatNumber(params.wallXM, 2)} m / e=${params.restitution}` : '关闭'}`}
              controls={teacherControls}
            />
          ) : null}
          <PlaybackBar
            clock={clock}
            duration={duration}
            keyFrames={keyFrames}
            timeLabel={timeLabel}
            secondaryLabel={`${modeLabel} · x=${formatNumber(snapshot.xM, 2)} m · Φ=${formatNumber(snapshot.fluxWb, 2)} Wb`}
            timelineLabel="I07 同一全局仿真时间轴"
            note={manualX
              ? '手动模式固定 1× 真实仿真时间；暂停时不记录拖动；松手后 v=0 是外部夹持。'
              : '解析分段 + 真实事件时刻；拖动时间轴只查看同一确定性解。'}
            speeds={manualX ? [1] : undefined}
          />
        </div>

        {!teacher ? (
          <aside className="sim-panel" aria-label="I07 实验控制台">
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
                      <h2>双区带符号叠加 · 真实碰板</h2>
                      <p>改变场/几何/挡板属于实验定义重建；M4 的拖动只追加真实时间历史。</p>
                    </div>
                  </div>
                  <div className="mode-card-grid" role="group" aria-label="I07 交互模式">
                    {MODE_ITEMS.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={`mode-card ${params.mode === item.id ? 'is-active' : ''}`}
                        aria-pressed={params.mode === item.id}
                        onClick={() => setMode(item.id)}
                        data-testid={`i07-mode-${item.id}`}
                      >
                        <strong>{item.title}</strong>
                        <span>{item.subtitle}</span>
                      </button>
                    ))}
                  </div>
                  <div className="preset-chips" aria-label="I07 预设">
                    {Object.keys(I07_PRESETS).map((id) => (
                      <button key={id} type="button" className="chip-button" onClick={() => applyPreset(id)} data-testid={`i07-preset-${id}`}>
                        {id.replace('i07-', '')}
                      </button>
                    ))}
                  </div>

                  <section className="panel-section">
                    <h3 className="section-title">双磁区（有符号 Bz）</h3>
                    <ParamSlider label="B₁ 场强" value={params.field1Bz} min={-2} max={2} step={0.1} unit="T" decimals={2} domain={PARAMETER_DOMAINS.magneticField} onChange={(value) => updateParams({ field1Bz: value })} />
                    <ParamSlider label="B₁ 左边界 a₁" value={params.field1LeftM} min={-2} max={3} step={0.1} unit="m" decimals={2} onChange={(value) => updateParams({ field1LeftM: value })} />
                    <ParamSlider label="B₁ 右边界 b₁" value={params.field1RightM} min={-1} max={4} step={0.1} unit="m" decimals={2} validateValue={(value) => value > params.field1LeftM ? null : 'b₁ 必须大于 a₁。'} onChange={(value) => updateParams({ field1RightM: value })} />
                    <ParamSlider label="B₂ 场强" value={params.field2Bz} min={-2} max={2} step={0.1} unit="T" decimals={2} domain={PARAMETER_DOMAINS.magneticField} onChange={(value) => updateParams({ field2Bz: value })} />
                    <ParamSlider label="B₂ 左边界 a₂" value={params.field2LeftM} min={-1} max={4} step={0.1} unit="m" decimals={2} validateValue={(value) => value >= params.field1RightM ? null : 'a₂ 不能小于 b₁（两区不重叠）。'} onChange={(value) => updateParams({ field2LeftM: value })} />
                    <ParamSlider label="B₂ 右边界 b₂" value={params.field2RightM} min={0} max={5} step={0.1} unit="m" decimals={2} validateValue={(value) => value > params.field2LeftM ? null : 'b₂ 必须大于 a₂。'} onChange={(value) => updateParams({ field2RightM: value })} />
                  </section>

                  <section className="panel-section">
                    <h3 className="section-title">线框与回路</h3>
                    <ParamSlider label="线框宽度 w" value={params.widthM} min={0.2} max={3} step={0.1} unit="m" decimals={2} domain={PARAMETER_DOMAINS.positiveLength} onChange={(value) => updateParams({ widthM: value })} />
                    <ParamSlider label="线框高度 h" value={params.heightM} min={0.1} max={2} step={0.1} unit="m" decimals={2} domain={PARAMETER_DOMAINS.positiveLength} onChange={(value) => updateParams({ heightM: value })} />
                    <ParamSlider label="匝数 N" value={params.turns} min={1} max={20} step={1} unit="turn" decimals={0} domain={PARAMETER_DOMAINS.turns} onChange={(value) => updateParams({ turns: value })} />
                    <ParamSlider label="总电阻 R" value={params.resistanceOhm} min={0.1} max={20} step={0.1} unit="Ω" decimals={2} domain={PARAMETER_DOMAINS.resistance} onChange={(value) => updateParams({ resistanceOhm: value })} />
                    <ParamSlider label="线框质量 m" value={params.massKg} min={0.1} max={5} step={0.1} unit="kg" decimals={2} domain={PARAMETER_DOMAINS.positiveMass} onChange={(value) => updateParams({ massKg: value })} />
                    <ToggleSwitch label="闭合回路（关闭为开路）" checked={params.circuitClosed} onChange={(checked) => updateParams({ circuitClosed: checked })} />
                  </section>

                  <section className="panel-section">
                    <h3 className="section-title">运动与挡板</h3>
                    <ParamSlider label="初始位置 x₀" value={params.startXM} min={-3} max={3} step={0.05} unit="m" decimals={2} onChange={(value) => updateParams({ startXM: value })} />
                    <ParamSlider label="初速度 vx₀" value={params.initialSpeedMps} min={-5} max={5} step={0.1} unit="m/s" decimals={2} domain={PARAMETER_DOMAINS.signedSpeed} onChange={(value) => updateParams({ initialSpeedMps: value })} />
                    {params.mode === 'forces' ? (
                      <ParamSlider label="恒定外力 F_ext" value={params.externalForceN} min={-3} max={3} step={0.1} unit="N" decimals={2} domain={PARAMETER_DOMAINS.signedForce} onChange={(value) => updateParams({ externalForceN: value })} description="m dv/dt = F_ext − k(x) v；M2 固定为 0。" />
                    ) : null}
                    <ParamSlider label="演示时长" value={params.durationS} min={0.5} max={20} step={0.5} unit="s" decimals={1} domain={PARAMETER_DOMAINS.i04Duration} onChange={(value) => updateParams({ durationS: value })} />
                    <ToggleSwitch label="启用右侧挡板" checked={params.wallEnabled} onChange={(checked) => updateParams({ wallEnabled: checked }, '挡板开关改变实验定义：t=0 重建')} description="挡板位置是线框右边缘的接触面 x+w=x_wall。" />
                    {params.wallEnabled ? (
                      <>
                        <ParamSlider label="挡板位置 x_wall" value={params.wallXM} min={-2} max={6} step={0.1} unit="m" decimals={2} validateValue={(value) => value >= params.startXM + params.widthM - 1e-9 ? null : '挡板不能位于线框起点左侧。'} onChange={(value) => updateParams({ wallXM: value })} />
                        <ParamSlider label="恢复系数 e" value={params.restitution} min={0} max={1} step={0.05} unit="" decimals={2} onChange={(value) => updateParams({ restitution: value })} description="e=1 完全弹性；e<1 的机械能损失单独记为 Q_impact，不计入焦耳热。" />
                      </>
                    ) : null}
                  </section>

                  <section className="panel-section">
                    <h3 className="section-title">显示图层</h3>
                    <div className="toggle-list">
                      {LAYER_ITEMS.map((item) => (
                        <ToggleSwitch key={item.key} label={item.label} checked={layers[item.key]} onChange={() => updateLayers({ [item.key]: !layers[item.key] } as Partial<I07Layers>)} />
                      ))}
                    </div>
                  </section>

                  <section className="panel-section">
                    <h3 className="section-title">场景数据</h3>
                    <div className="scene-io-row">
                      <button type="button" className="secondary-button" onClick={exportScene}><Icon name="download" size={16} />导出场景 JSON</button>
                      <button type="button" className="secondary-button" onClick={() => importRef.current?.click()}><Icon name="upload" size={16} />导入场景 JSON</button>
                      <input ref={importRef} type="file" accept="application/json,.json" hidden data-testid="i07-scene-import" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importScene(file); event.target.value = ''; }} />
                    </div>
                  </section>
                  <button type="button" className="secondary-button wide-button" onClick={() => applyPreset('i07-enter')}><Icon name="reset" size={17} />恢复默认 I07 场景</button>
                </div>
              ) : null}

              {tab === 'lesson' ? (
                <LessonRunner
                  steps={I07_LESSON}
                  storageKey="emplab.i07.lesson.v1"
                  overview={{
                    goals: [
                      '用带符号的 B₁ℓ₁+B₂ℓ₂ 计算双区磁通量，而不是取绝对值相加。',
                      '理解 S=B₁g₁+B₂g₂ 同时决定动生电动势与合力；零磁通仍可能有非零电动势。',
                      '区分焦耳热、弹性/非弹性碰撞损失与外部约束力做功。',
                    ],
                    prerequisites: ['磁通量、法拉第定律与楞次定律。', 'I03 单区线框与 I05 运动线框。', '指数衰减、分段动力学与冲量概念。'],
                    misconceptions: ['把相反磁场的磁通量按绝对值相加。', '认为线框磁通为零时感应电动势一定为零。', '把弹性碰撞当作焦耳热，或让线框穿过挡板。'],
                  }}
                  onApplyPreset={applyPreset}
                  onGoPractice={() => setTab('practice')}
                />
              ) : null}

              {tab === 'practice' ? <PracticePanel modelId="i07" /> : null}

              {tab === 'data' ? (
                <div className="panel-section-stack">
                  <div className="panel-intro">
                    <div>
                      <h2>同一快照 · 三本独立账</h2>
                      <p>t = {timeLabel}；{modeLabel}；{snapshot.status === 'open-circuit' ? '理想开路' : snapshot.status === 'wall-held' ? '挡板静力约束' : '闭合演化'}。</p>
                    </div>
                  </div>
                  <ReadoutGrid
                    items={[
                      { label: '位置 x', value: `${formatNumber(snapshot.xM, 4)} m`, testId: 'i07-x' },
                      { label: '速度 vx', value: `${formatNumber(snapshot.velocityMps, 4)} m/s`, testId: 'i07-v' },
                      { label: '重叠 ℓ₁ / ℓ₂', value: `${formatNumber(snapshot.overlap1M, 3)} / ${formatNumber(snapshot.overlap2M, 3)} m`, testId: 'i07-overlap' },
                      { label: '带符号斜率 S', value: formatNumber(snapshot.S, 4), hint: `g₁=${snapshot.g1}, g₂=${snapshot.g2}${snapshot.slopeOneSided ? '（单侧）' : ''}`, testId: 'i07-s' },
                      { label: '磁通 Φ', value: formatSI(snapshot.fluxWb, 'Wb'), testId: 'i07-flux' },
                      { label: '磁链 Ψ', value: `${formatNumber(snapshot.linkageWbTurn, 4)} Wb·turn`, testId: 'i07-linkage' },
                      { label: '电动势 ε', value: formatSI(snapshot.emfV, 'V'), testId: 'i07-emf' },
                      { label: '电流 I', value: snapshot.currentA === null ? '—' : formatSI(snapshot.currentA, 'A'), testId: 'i07-current' },
                      { label: '安培力 F_Bx', value: snapshot.magneticForceN === null ? '—' : formatSI(snapshot.magneticForceN, 'N'), testId: 'i07-force' },
                      { label: '焦耳功率 P_J', value: snapshot.joulePowerW === null ? '—' : formatSI(snapshot.joulePowerW, 'W'), testId: 'i07-joule-power' },
                      { label: '动能 K', value: formatSI(snapshot.kineticEnergyJ, 'J'), testId: 'i07-kinetic' },
                      { label: '焦耳热 Q_J', value: formatSI(snapshot.jouleHeatJ, 'J'), testId: 'i07-heat' },
                      { label: '冲击损失 Q_impact', value: formatSI(snapshot.impactLossJ, 'J'), testId: 'i07-impact' },
                      { label: '外力功 W_ext', value: snapshot.approximation ? '手势未知' : formatSI(snapshot.externalWorkJ, 'J'), testId: 'i07-work' },
                      { label: '能量残差', value: ledgerResidual === null ? '不报告（手动）' : formatSI(ledgerResidual, 'J'), hint: `K+Q_J+Q_impact−W_ext = ${formatSI(energyBalance, 'J')}`, testId: 'i07-residual' },
                      { label: '挡板间隙', value: snapshot.wallGapM === null ? '未启用' : `${formatNumber(snapshot.wallGapM, 4)} m`, testId: 'i07-wall-gap' },
                      { label: '状态', value: snapshot.status, hint: snapshot.approximation ?? undefined, testId: 'i07-status' },
                    ]}
                  />

                  <section className="panel-section">
                    <h3 className="section-title">事件时间轴</h3>
                    <div className="i07-event-table" role="table" aria-label="I07 事件时间轴" data-testid="i07-event-list">
                      <div className="i07-event-row i07-event-head" role="row">
                        <span>t / s</span><span>事件</span><span>x / m</span><span>v 前 → 后</span><span>冲击 / J</span>
                      </div>
                      {(manualX ? [] : solvedSolution.events).map((event, index) => (
                        <div className="i07-event-row" role="row" key={`${event.kind}-${event.timeS}-${index}`} data-kind={event.kind}>
                          <span>{formatNumber(event.timeS, 4)}</span>
                          <span>{eventKindLabel(event.kind)}</span>
                          <span>{formatNumber(event.xM, 3)}</span>
                          <span>{formatNumber(event.velocityBeforeMps, 3)} → {formatNumber(event.velocityAfterMps, 3)}</span>
                          <span>{formatNumber(event.impactLossJ, 4)}</span>
                        </div>
                      ))}
                      {manualX ? <p className="empty-note">手动模式的事件由手势历史生成；请查看实时读数与曲线。</p> : null}
                    </div>
                  </section>

                  <section className="panel-section">
                    <h3 className="section-title">实时图像</h3>
                    <I07Charts solution={solution} history={historySamples} snapshot={snapshot} />
                  </section>

                  <section className="panel-section">
                    <h3 className="section-title">公式与能量账本</h3>
                    <MathTex block>{'\\ell_j=\\max(0,\\min(x+w,b_j)-\\max(x,a_j))'}</MathTex>
                    <MathTex block>{'\\Phi=h(B_1\\ell_1+B_2\\ell_2),\\quad S=B_1g_1+B_2g_2'}</MathTex>
                    <MathTex block>{'\\varepsilon=-NhSv_x,\\quad I=\\varepsilon/R,\\quad F_{Bx}=NIhS'}</MathTex>
                    <MathTex block>{'K-K_0+Q_J+Q_{\\rm impact}=W_{\\rm ext}'}</MathTex>
                    <p className="param-description">
                      挡板在 x_wall = {params.wallEnabled ? `${formatNumber(params.wallXM, 2)} m` : '未启用'}，
                      接触位置 x+w = {wallLimit === null ? '—' : `${formatNumber(wallLimit, 2)} m`}；
                      e=1 时 Q_impact=0，e&lt;1 的损失单独记账，绝不并入焦耳热。
                    </p>
                  </section>
                  <section className="panel-section model-boundary">
                    <h3 className="section-title">模型边界</h3>
                    <p>只支持二维 x–y、静态均匀条带、刚性矩形线框和理想集中电阻；忽略自感/互感、边缘场、导线厚度、挡板形变与线框转动。挡板是瞬时冲量约束，不是弹簧。</p>
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
