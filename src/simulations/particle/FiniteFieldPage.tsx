import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  MAX_PARTICLES,
  activeParticle,
  addParticle,
  applySharedField,
  commitDraft,
  createParticleDraft,
  duplicateParticle,
  particleTau,
  relaunchAll,
  relaunchParticle,
  removeParticle,
  selectParticle,
  updateDraft,
  updateParticleInitial,
  updateParticleAndRelaunch,
  type ParticleDraft,
} from '../../physics/particles/multiParticle';
import {
  finiteFieldStateAt,
  type FiniteFieldEvent,
} from '../../physics/particles/finiteMagneticRegion';
import { usePersistentState } from '../../hooks/usePersistentState';
import { usePlaybackClock } from '../../hooks/usePlaybackClock';
import {
  formatLength,
  formatNumber,
  formatTime,
} from '../../lib/format';
import { P04_LESSON } from '../../content/lessons';
import {
  P04_DEFAULT,
  P04_PRESETS,
  P04_SCENE_STORAGE_KEY,
  decodeP04SceneJson,
  loadInitialP04Scene,
  p04GlobalDuration,
  p04KeyFrames,
  p04SolutionFor,
  parseP04StoredScene,
  serializeP04Scene,
  toP04StoredScene,
  type P04Field,
  type P04Scene,
} from './p04Scene';
import {
  FiniteFieldStage,
  P04_DEFAULT_LAYERS,
  P04_STATUS_LABEL,
  type P04ConditionNotice,
  type P04EvaluatedParticle,
  type P04Layers,
} from './FiniteFieldStage';
import { ParticleRoster, type RosterParticle } from './ParticleRoster';
import { PlaybackBar } from '../../components/PlaybackBar';
import { PanelTabs } from '../../components/PanelTabs';
import { ParamSlider } from '../../components/ParamSlider';
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

const LAYER_ITEMS: Array<{ key: keyof P04Layers; short: string; label: string }> = [
  { key: 'predicted', short: '预测', label: '完整预测轨迹' },
  { key: 'trail', short: '已走', label: '已走轨迹' },
  { key: 'center', short: '圆心', label: '圆心' },
  { key: 'radii', short: '半径', label: '半径辅助' },
  { key: 'vectors', short: '速度', label: '速度切线' },
  { key: 'force', short: '力', label: '洛伦兹力' },
  { key: 'allAux', short: '全部圆心', label: '所有粒子的圆心' },
  { key: 'allVectors', short: '全部矢量', label: '所有粒子的速度与力' },
  { key: 'field', short: '场区', label: '有限磁场区域与符号' },
  { key: 'markers', short: '事件点', label: '入射 / 出射 / 相切 / 角点' },
];

let lastAppliedP04PresetId: string | null = null;

function pointLabel(point: { x: number; y: number } | null): string {
  if (!point) return '—';
  const snap = (value: number) => (Math.abs(value) < 1e-9 ? 0 : value);
  return `(${formatLength(snap(point.x))}, ${formatLength(snap(point.y))})`;
}

function timeLabel(value: number | null): string {
  return value === null ? '—' : formatTime(value);
}

function displayDirection(particle: { velocity: { x: number; y: number } }): number {
  const angle = (Math.atan2(particle.velocity.y, particle.velocity.x) * 180) / Math.PI;
  return angle < 0 ? angle + 360 : angle;
}

function displaySpeed(particle: { velocity: { x: number; y: number } }): number {
  return Math.hypot(particle.velocity.x, particle.velocity.y);
}

function eventLabel(event: FiniteFieldEvent): string {
  if (event.kind === 'entry') return '入场';
  if (event.kind === 'exit') return '出射';
  if (event.kind === 'corner-contact') return '角点接触';
  if (event.kind === 'tangent') return '相切';
  if (event.kind === 'window-end') return '窗口结束';
  if (event.kind === 'event-limit') return '事件上限';
  return event.kind;
}

function clonePreset(preset: P04Scene): P04Scene {
  return parseP04StoredScene(JSON.parse(serializeP04Scene(preset))).scene ?? preset;
}

export function FiniteFieldPage() {
  const initialScene = useMemo(() => loadInitialP04Scene(), []);
  const initialStored = useMemo(() => toP04StoredScene(initialScene), [initialScene]);
  const [storedScene, setStoredScene] = usePersistentState<unknown>(P04_SCENE_STORAGE_KEY, initialStored);
  const scene = useMemo(() => parseP04StoredScene(storedScene).scene ?? initialScene, [initialScene, storedScene]);
  const [storedLayers, setStoredLayers] = usePersistentState<P04Layers>('emplab.p04.layers.v1', P04_DEFAULT_LAYERS);
  const layers = useMemo(() => ({ ...P04_DEFAULT_LAYERS, ...storedLayers }), [storedLayers]);
  const [mode, setMode] = usePersistentState<LearningMode>('emplab.p04.mode.v1', 'guided');
  const [teacher, setTeacher] = useState(false);
  const [formulaVisible, setFormulaVisible] = useState(true);
  const [stageMode, setStageMode] = useState<StageMode>('interact');
  const [tab, setTab] = useState<PanelTabId>(mode === 'guided' ? 'lesson' : 'params');
  const [draft, setDraft] = useState<ParticleDraft | null>(null);
  const [conditionNotice, setConditionNotice] = useState<P04ConditionNotice | null>(null);
  const [trailResetById, setTrailResetById] = useState<Record<string, number>>({});
  const [searchParams] = useSearchParams();
  const presetId = searchParams.get('preset');
  const normalizedOnMount = useRef(false);
  const noticeTimer = useRef<number | null>(null);
  const importRef = useRef<HTMLInputElement | null>(null);
  const sceneRef = useRef(scene);
  const draftRef = useRef(draft);
  const globalTimeRef = useRef(0);
  sceneRef.current = scene;
  draftRef.current = draft;

  const commitScene = useCallback((next: P04Scene) => setStoredScene(toP04StoredScene(next)), [setStoredScene]);

  useEffect(() => {
    if (normalizedOnMount.current) return;
    normalizedOnMount.current = true;
    if (scene.particles.some((particle) => (scene.runtimeById[particle.id]?.launchTimeSec ?? 0) > 0)) {
      commitScene(relaunchAll(scene));
    }
  }, [commitScene, scene]);

  const evaluationsBase = useMemo(
    () =>
      scene.particles.map((particle) => ({
        particle,
        solution: p04SolutionFor(scene.field, particle),
        runtime: scene.runtimeById[particle.id] ?? { launchTimeSec: 0 },
      })),
    [scene.field, scene.particles, scene.runtimeById],
  );
  const duration = useMemo(() => p04GlobalDuration(scene), [scene]);
  const keyFrames = useMemo(() => p04KeyFrames(scene), [scene]);
  const clock = usePlaybackClock(duration, keyFrames.map((frame) => frame.time));
  globalTimeRef.current = clock.time;

  const evaluations = useMemo<P04EvaluatedParticle[]>(
    () =>
      evaluationsBase.map((item) => {
        const tau = particleTau(item.runtime, clock.time);
        return {
          ...item,
          state: tau === null ? null : finiteFieldStateAt(item.solution, tau),
        };
      }),
    [clock.time, evaluationsBase],
  );
  const selectedCommitted = evaluations.find((item) => item.particle.id === scene.activeParticleId) ?? evaluations[0] ?? null;
  const selectedParticle = draft?.draftParticle ?? selectedCommitted?.particle ?? null;
  const draftSolution = useMemo(
    () => (draft ? p04SolutionFor(scene.field, draft.draftParticle) : null),
    [draft, scene.field],
  );
  const selectedSolution = draftSolution ?? selectedCommitted?.solution ?? null;
  const selectedState = draft && draftSolution
    ? finiteFieldStateAt(draftSolution, 0)
    : selectedCommitted?.state ?? null;
  const selectedTau = draft ? 0 : selectedCommitted?.state?.timeS ?? null;
  const selectedLabel = selectedParticle?.label ?? 'A';
  const selectedDirection = selectedParticle ? displayDirection(selectedParticle) : 0;
  const selectedSpeed = selectedParticle ? displaySpeed(selectedParticle) : 0;
  const questionCount = questionsForModel('p04').length;

  const showConditionNotice = useCallback((text: string, tone: P04ConditionNotice['tone'], sticky = false) => {
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
    setConditionNotice({ text, tone });
    if (!sticky) {
      noticeTimer.current = window.setTimeout(() => {
        setConditionNotice(null);
        noticeTimer.current = null;
      }, 3000);
    }
  }, []);
  useEffect(() => () => {
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
  }, []);

  const applyScenePreset = useCallback(
    (preset: P04Scene, message: string) => {
      commitScene(clonePreset(preset));
      setDraft(null);
      setTrailResetById({});
      clock.reset();
      showConditionNotice(message, 'recalculated');
    },
    [clock.reset, commitScene, showConditionNotice],
  );

  useEffect(() => {
    if (!presetId || lastAppliedP04PresetId === presetId) return;
    const preset = P04_PRESETS[presetId];
    if (!preset) return;
    lastAppliedP04PresetId = presetId;
    applyScenePreset(preset, '已载入 P04 题目/预设场景 · 全局时钟归零');
  }, [applyScenePreset, presetId]);

  useEffect(() => {
    setTab(mode === 'guided' ? 'lesson' : 'params');
    setTeacher(false);
  }, [mode]);

  const normalizeGeometry = (field: P04Field, patch: { xMin?: number; xMax?: number; yMin?: number; yMax?: number; Bz?: number }): P04Field => {
    const geometry = { ...field.geometry };
    const xMin = patch.xMin ?? geometry.xMin;
    const xMax = patch.xMax ?? geometry.xMax;
    if (geometry.kind === 'strip') {
      return { ...field, Bz: patch.Bz ?? field.Bz, geometry: { kind: 'strip', xMin, xMax } };
    }
    const yMin = patch.yMin ?? geometry.yMin;
    const yMax = patch.yMax ?? geometry.yMax;
    return { ...field, Bz: patch.Bz ?? field.Bz, geometry: { kind: 'rectangle', xMin, xMax, yMin, yMax } };
  };

  const patchField = (patch: { xMin?: number; xMax?: number; yMin?: number; yMax?: number; Bz?: number; kind?: 'strip' | 'rectangle' }) => {
    const current = sceneRef.current.field;
    let next: P04Field;
    if (patch.kind && patch.kind !== current.geometry.kind) {
      next = patch.kind === 'strip'
        ? { Bz: patch.Bz ?? current.Bz, geometry: { kind: 'strip', xMin: current.geometry.xMin, xMax: current.geometry.xMax } }
        : { Bz: patch.Bz ?? current.Bz, geometry: { kind: 'rectangle', xMin: current.geometry.xMin, xMax: current.geometry.xMax, yMin: -1, yMax: 1 } };
    } else {
      next = normalizeGeometry(current, patch);
    }
    if (!(next.geometry.xMax > next.geometry.xMin) || (next.geometry.kind === 'rectangle' && !(next.geometry.yMax > next.geometry.yMin))) {
      showConditionNotice('区域边界必须满足 xMax > xMin 且 yMax > yMin；本次修改未提交。', 'recalculated');
      return;
    }
    commitScene(applySharedField(sceneRef.current, next));
    setDraft(null);
    setTrailResetById({});
    clock.restart();
    showConditionNotice('磁场区域或 Bz 改变：全部粒子同步重算并从 tGlobal=0 重演', 'recalculated');
  };

  const patchSelectedParticle = (patch: Partial<{ chargeC: number; massKg: number; position: { x: number; y: number }; velocity: { x: number; y: number } }>) => {
    const current = activeParticle(sceneRef.current);
    if (!current) return;
    commitScene(updateParticleAndRelaunch(sceneRef.current, current.id, patch, globalTimeRef.current));
    setDraft(null);
    showConditionNotice(`${current.label} 已按新初态重新发射 · 其他粒子未重置`, 'recalculated');
  };

  const beginDraft = () => {
    const current = activeParticle(sceneRef.current);
    if (!current) return;
    setDraft(createParticleDraft(sceneRef.current, current.id, globalTimeRef.current));
    showConditionNotice(`正在编辑 ${current.label} 的初态 · 其他粒子继续运动`, 'preview', true);
  };
  const changeDraft = (patch: { startX?: number; startY?: number; directionDeg?: number }) => {
    setDraft((previous) => {
      if (!previous) return previous;
      const speed = displaySpeed(previous.draftParticle);
      const direction = patch.directionDeg ?? displayDirection(previous.draftParticle);
      const angle = (direction * Math.PI) / 180;
      return updateDraft(previous, {
        position: {
          x: patch.startX ?? previous.draftParticle.position.x,
          y: patch.startY ?? previous.draftParticle.position.y,
        },
        velocity: { x: speed * Math.cos(angle), y: speed * Math.sin(angle) },
      });
    });
  };
  const endDraft = () => {
    const current = draftRef.current;
    if (!current) return;
    commitScene(commitDraft(sceneRef.current, current, globalTimeRef.current));
    setDraft(null);
    showConditionNotice(`${current.draftParticle.label} 已按新初态重新发射 · 其他粒子未重置`, 'recalculated');
  };
  const cancelDraft = () => {
    if (!draftRef.current) return;
    setDraft(null);
    showConditionNotice('已取消本次初态草稿 · 未重发射 · 其他粒子未受影响', 'recalculated');
  };
  const selectParticleById = (id: string) => {
    if (draftRef.current) setDraft(null);
    commitScene(selectParticle(sceneRef.current, id));
  };

  const addNewParticle = () => {
    const current = activeParticle(sceneRef.current);
    if (!current) return;
    const result = addParticle(
      sceneRef.current,
      {
        position: { x: current.position.x, y: current.position.y + 0.08 },
        velocity: current.velocity,
        chargeC: current.chargeC,
        massKg: current.massKg,
        visible: true,
        showTrail: true,
      },
      globalTimeRef.current,
    );
    if (!result.particle) {
      showConditionNotice(`最多支持 ${MAX_PARTICLES} 个粒子`, 'recalculated');
      return;
    }
    commitScene(result.scene);
    setDraft(null);
    showConditionNotice(`已添加 ${result.particle.label} · 从当前 tGlobal 发射`, 'recalculated');
  };
  const copySelectedParticle = () => {
    const current = activeParticle(sceneRef.current);
    if (!current) return;
    const result = duplicateParticle(sceneRef.current, current.id, globalTimeRef.current);
    if (!result.particle) return;
    commitScene(result.scene);
    setDraft(null);
    showConditionNotice(`已复制 ${current.label} → ${result.particle.label}`, 'recalculated');
  };
  const deleteSelectedParticle = () => {
    const current = activeParticle(sceneRef.current);
    if (!current || sceneRef.current.particles.length <= 1) return;
    commitScene(removeParticle(sceneRef.current, current.id));
    setDraft(null);
    showConditionNotice(`已删除粒子 ${current.label}`, 'recalculated');
  };
  const relaunchSelected = () => {
    const current = activeParticle(sceneRef.current);
    if (!current) return;
    commitScene(relaunchParticle(sceneRef.current, current.id, globalTimeRef.current));
    setDraft(null);
    showConditionNotice(`${current.label} 已从当前 tGlobal 单独重新发射`, 'recalculated');
  };
  const syncRelaunchAll = () => {
    commitScene(relaunchAll(sceneRef.current));
    setDraft(null);
    setTrailResetById({});
    clock.restart();
    showConditionNotice('全部粒子已从 tGlobal=0 同步重新发射', 'recalculated');
  };
  const toggleSelectedTrail = () => {
    const current = activeParticle(sceneRef.current);
    if (!current) return;
    commitScene(updateParticleInitial(sceneRef.current, current.id, { showTrail: !current.showTrail }));
  };
  const toggleSelectedVisible = () => {
    const current = activeParticle(sceneRef.current);
    if (!current) return;
    commitScene(updateParticleInitial(sceneRef.current, current.id, { visible: !current.visible }));
  };
  const clearSelectedTrail = () => {
    const current = activeParticle(sceneRef.current);
    if (!current) return;
    setTrailResetById((previous) => ({ ...previous, [current.id]: globalTimeRef.current }));
  };

  const exportScene = () => {
    const blob = new Blob([serializeP04Scene(sceneRef.current)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'p04-scene.json';
    anchor.click();
    URL.revokeObjectURL(url);
    showConditionNotice('P04 场景已导出为 JSON', 'recalculated');
  };
  const importScene = async (file: File) => {
    const parsed = decodeP04SceneJson(await file.text());
    if (!parsed.scene) {
      showConditionNotice(`场景导入失败：${parsed.error ?? '格式无效'}`, 'recalculated');
      return;
    }
    commitScene(parsed.scene);
    setDraft(null);
    setTrailResetById({});
    clock.reset();
    showConditionNotice('场景已导入 · 全部粒子从 tGlobal=0 重新呈现', 'recalculated');
  };

  const rosterParticles: RosterParticle[] = evaluations.map((item) => ({
    id: item.particle.id,
    label: item.particle.label,
    color: item.particle.color,
    lineStyle: item.particle.lineStyle,
    visible: item.particle.visible,
    showTrail: item.particle.showTrail,
    selected: item.particle.id === scene.activeParticleId,
    launchTimeSec: item.runtime.launchTimeSec,
    tauS: draft?.particleId === item.particle.id ? 0 : item.state?.timeS ?? null,
  }));

  const teacherControls = (
    <div className="teacher-layer-bar" role="group" aria-label="P04 教师图层">
      {LAYER_ITEMS.map((item) => (
        <button key={item.key} type="button" className="teacher-layer-chip" aria-pressed={layers[item.key]} onClick={() => setStoredLayers((previous) => ({ ...previous, [item.key]: !layers[item.key] }))}>
          {item.short}
        </button>
      ))}
      <button type="button" className="teacher-layer-chip teacher-formula-toggle" aria-pressed={formulaVisible} onClick={() => setFormulaVisible((value) => !value)}>
        公式
      </button>
    </div>
  );

  const geometry = scene.field.geometry;
  const arcSegment = selectedSolution?.segments.find((segment) => segment.kind === 'arc') ?? null;

  return (
    <div
      className={`sim-page ${teacher ? 'sim-teacher' : ''}`}
      data-testid="p04-page"
      data-sim-playing={clock.playing}
      data-sim-editing={draft !== null}
      data-sim-time={clock.time}
      data-particle-count={scene.particles.length}
      data-active-particle-id={scene.activeParticleId}
    >
      <header className="sim-header">
        <div className="sim-title-block">
          <p className="eyebrow">P04 · 模块 A · 粒子运动</p>
          <h1>条形 / 矩形有界磁场与临界条件</h1>
          <p className="sim-subtitle">在同一有限磁场区域中比较 1–5 个粒子；精确记录真正入场、从哪条边出射、相切与角点接触，播放中只重发射被编辑的粒子。</p>
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
          <button type="button" className={`tool-button ${teacher ? 'is-active' : ''}`} onClick={() => setTeacher((value) => !value)} aria-pressed={teacher}>
            <Icon name="target" size={17} />
            {teacher ? '退出教师视图' : '教师视图'}
          </button>
        </div>
      </header>

      <div className={`sim-layout ${teacher ? 'sim-layout-teacher' : ''}`}>
        <div className="sim-stage-column">
          <FiniteFieldStage
            particles={evaluations}
            field={scene.field}
            selectedId={scene.activeParticleId}
            draft={draft && draftSolution ? { particle: draft.draftParticle, solution: draftSolution, state: finiteFieldStateAt(draftSolution, 0) } : null}
            layers={layers}
            stageMode={stageMode}
            onStageModeChange={setStageMode}
            onSelectParticle={selectParticleById}
            onDraftStart={beginDraft}
            onDraftChange={changeDraft}
            onDraftEnd={endDraft}
            onDraftCancel={cancelDraft}
            conditionNotice={conditionNotice}
            trailResetById={trailResetById}
          />
          <ParticleRoster
            particles={rosterParticles}
            onSelect={selectParticleById}
            onAdd={addNewParticle}
            onDuplicate={copySelectedParticle}
            onRemove={deleteSelectedParticle}
            onRelaunchSelected={relaunchSelected}
            onRelaunchAll={syncRelaunchAll}
            onToggleTrail={toggleSelectedTrail}
            onClearTrail={clearSelectedTrail}
            onToggleVisible={toggleSelectedVisible}
          />
          {teacher ? (
            <TeacherDock
              formula={'R=\\frac{m|v|}{|qB_z|},\\qquad T=\\frac{2\\pi m}{|qB_z|},\\qquad t_{\\text{inside}}=\\sum\\Delta t_{\\text{arc}}'}
              stats={[
                { label: '粒子数', value: `${scene.particles.length}/5` },
                { label: `状态 ${selectedLabel}`, value: P04_STATUS_LABEL[selectedSolution?.status ?? 'invalid'] },
                { label: `R ${selectedLabel}`, value: selectedSolution?.radiusM ? formatLength(selectedSolution.radiusM) : '—' },
                { label: `场内时间 ${selectedLabel}`, value: timeLabel(selectedSolution?.fieldTimeS ?? null) },
                { label: `τ ${selectedLabel}`, value: selectedTau === null ? '未发射' : formatTime(selectedTau) },
              ]}
              footnote={`tGlobal = ${formatTime(clock.time)} · ${selectedLabel} τ = ${selectedTau === null ? '未发射' : formatTime(selectedTau)} · ${P04_STATUS_LABEL[selectedSolution?.status ?? 'invalid']}`}
              controls={teacherControls}
              formulaVisible={formulaVisible}
            />
          ) : null}
          <PlaybackBar
            clock={clock}
            duration={duration}
            keyFrames={keyFrames}
            timeLabel={formatTime(clock.time)}
            secondaryLabel={`${selectedLabel} τ = ${selectedTau === null ? '未发射' : formatTime(selectedTau)} · ${P04_STATUS_LABEL[selectedSolution?.status ?? 'invalid']}`}
            timelineLabel="P04 多粒子全局时间轴"
            note="单粒子初态编辑只重发射该粒子；区域几何或 Bz 改变会整场重算并从 t=0 重演。"
          />
        </div>

        {!teacher ? (
          <aside className="sim-panel" aria-label="P04 实验控制台">
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
                      <h2>有限区域 · 共享场 · 独立初态</h2>
                      <p>当前选中 <strong>{selectedLabel}</strong>。区域几何和 Bz 是公共实验条件；改变后全部粒子从 t=0 重演。</p>
                    </div>
                  </div>
                  <div className="preset-chips" aria-label="P04 预设">
                    <button type="button" className="chip-button" onClick={() => applyScenePreset(P04_PRESETS['p04-strip-return'], '已载入条带同侧返回预设')}>条带返回</button>
                    <button type="button" className="chip-button" onClick={() => applyScenePreset(P04_PRESETS['p04-strip-cross'], '已载入条带穿越预设')}>条带穿越</button>
                    <button type="button" className="chip-button" onClick={() => applyScenePreset(P04_PRESETS['p04-strip-critical'], '已载入临界宽度预设')}>临界宽度</button>
                    <button type="button" className="chip-button" onClick={() => applyScenePreset(P04_PRESETS['p04-rect-top'], '已载入矩形上边界出射预设')}>矩形上出</button>
                    <button type="button" className="chip-button" onClick={() => applyScenePreset(P04_PRESETS['p04-rect-right'], '已载入矩形右边界出射预设')}>矩形右出</button>
                    <button type="button" className="chip-button" onClick={() => applyScenePreset(P04_PRESETS['p04-tangent'], '已载入相切预设')}>相切</button>
                    <button type="button" className="chip-button" onClick={() => applyScenePreset(P04_PRESETS['p04-corner'], '已载入角点预设')}>角点</button>
                    <button type="button" className="chip-button" onClick={() => applyScenePreset(P04_PRESETS['p04-three'], '已载入三粒子对比预设')}>三粒子</button>
                    <button type="button" className="chip-button" onClick={() => applyScenePreset(P04_PRESETS['p04-sign'], '已载入正负电荷对比预设')}>正负对比</button>
                  </div>

                  <section className="panel-section">
                    <h3 className="section-title">共享磁场区域</h3>
                    <Segmented
                      ariaLabel="P04 区域类型"
                      size="sm"
                      value={geometry.kind}
                      onChange={(value) => patchField({ kind: value === 'strip' ? 'strip' : 'rectangle' })}
                      options={[{ value: 'strip', label: '条形（无限 y）' }, { value: 'rectangle', label: '矩形' }]}
                    />
                    <ParamSlider label="Bz" value={scene.field.Bz} min={-5} max={5} step={0.1} unit="T" decimals={1} onChange={(value) => patchField({ Bz: value })} />
                    <div className="two-col-params">
                      <ParamSlider label="xMin" value={geometry.xMin} min={-6} max={6} step={0.1} unit="m" decimals={1} validateValue={(value) => value < geometry.xMax ? null : `xMin 必须小于 xMax（${formatNumber(geometry.xMax, 2)} m）。`} onChange={(value) => patchField({ xMin: value })} />
                      <ParamSlider label="xMax" value={geometry.xMax} min={-6} max={6} step={0.1} unit="m" decimals={1} validateValue={(value) => value > geometry.xMin ? null : `xMax 必须大于 xMin（${formatNumber(geometry.xMin, 2)} m）。`} onChange={(value) => patchField({ xMax: value })} />
                    </div>
                    {geometry.kind === 'rectangle' ? (
                      <div className="two-col-params">
                        <ParamSlider label="yMin" value={geometry.yMin} min={-4} max={4} step={0.1} unit="m" decimals={1} validateValue={(value) => value < geometry.yMax ? null : `yMin 必须小于 yMax（${formatNumber(geometry.yMax, 2)} m）。`} onChange={(value) => patchField({ yMin: value })} />
                        <ParamSlider label="yMax" value={geometry.yMax} min={-4} max={4} step={0.1} unit="m" decimals={1} validateValue={(value) => value > geometry.yMin ? null : `yMax 必须大于 yMin（${formatNumber(geometry.yMin, 2)} m）。`} onChange={(value) => patchField({ yMax: value })} />
                      </div>
                    ) : null}
                    <p className="field-hint">Bz 只作用于区域内部；外部为无场直线。相切和角点按解析几何判定，不靠像素接触。</p>
                  </section>

                  <section className="panel-section">
                    <h3 className="section-title">粒子 {selectedLabel} 的初态</h3>
                    <div className="field-label-row">
                      <div><span className="field-label">电荷符号</span><p className="field-hint">只影响 {selectedLabel}</p></div>
                      <Segmented
                        ariaLabel="P04 电荷符号"
                        size="sm"
                        value={(selectedParticle?.chargeC ?? 1) < 0 ? -1 : 1}
                        onChange={(value) => patchSelectedParticle({ chargeC: value * Math.max(0.1, Math.abs(selectedParticle?.chargeC ?? 1)) })}
                        options={[{ value: 1, label: '+ 正电荷' }, { value: -1, label: '− 负电荷' }]}
                      />
                    </div>
                    <ParamSlider label="电荷量 |q|" value={Math.abs(selectedParticle?.chargeC ?? 1)} min={0} max={3} step={0.1} unit="C" decimals={1} onChange={(value) => patchSelectedParticle({ chargeC: (selectedParticle && selectedParticle.chargeC < 0 ? -1 : 1) * value })} />
                    <ParamSlider label="质量 m" value={selectedParticle?.massKg ?? 1} min={0.1} max={5} step={0.1} unit="kg" decimals={1} onChange={(value) => patchSelectedParticle({ massKg: value })} />
                    <ParamSlider label="速度大小 v" value={selectedSpeed} min={0} max={5} step={0.1} unit="m/s" decimals={1} onChange={(value) => { const angle = (selectedDirection * Math.PI) / 180; patchSelectedParticle({ velocity: { x: value * Math.cos(angle), y: value * Math.sin(angle) } }); }} />
                    <ParamSlider label="速度方向 θ" value={selectedDirection} min={0} max={360} step={1} unit="°" decimals={0} onChange={(value) => { const angle = (value * Math.PI) / 180; patchSelectedParticle({ velocity: { x: selectedSpeed * Math.cos(angle), y: selectedSpeed * Math.sin(angle) } }); }} />
                    <div className="two-col-params">
                      <ParamSlider label="发射点 x" value={selectedParticle?.position.x ?? 0} min={-8} max={8} step={0.1} unit="m" decimals={2} onChange={(value) => patchSelectedParticle({ position: { x: value, y: selectedParticle?.position.y ?? 0 } })} />
                      <ParamSlider label="发射点 y" value={selectedParticle?.position.y ?? 0} min={-8} max={8} step={0.1} unit="m" decimals={2} onChange={(value) => patchSelectedParticle({ position: { x: selectedParticle?.position.x ?? 0, y: value } })} />
                    </div>
                  </section>

                  <section className="panel-section">
                    <h3 className="section-title">显示图层</h3>
                    <div className="toggle-list">
                      {LAYER_ITEMS.map((item) => (
                        <ToggleSwitch key={item.key} label={item.label} checked={layers[item.key]} onChange={() => setStoredLayers((previous) => ({ ...previous, [item.key]: !layers[item.key] }))} />
                      ))}
                    </div>
                  </section>

                  <section className="panel-section">
                    <h3 className="section-title">场景数据</h3>
                    <div className="scene-io-row">
                      <button type="button" className="secondary-button" onClick={exportScene}><Icon name="download" size={16} />导出场景 JSON</button>
                      <button type="button" className="secondary-button" onClick={() => importRef.current?.click()}><Icon name="upload" size={16} />导入场景 JSON</button>
                      <input ref={importRef} type="file" accept="application/json,.json" hidden data-testid="p04-scene-import" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importScene(file); event.target.value = ''; }} />
                    </div>
                  </section>
                  <button type="button" className="secondary-button wide-button" onClick={() => applyScenePreset(P04_DEFAULT, '已恢复 P04 默认条带场景')}><Icon name="reset" size={17} />恢复默认场景</button>
                </div>
              ) : null}

              {tab === 'lesson' ? (
                <LessonRunner
                  steps={P04_LESSON}
                  storageKey="emplab.p04.lesson.v1"
                  overview={{
                    goals: ['识别条形/矩形区域与入場/出場事件。', '用圆心、半径和边界交点求时间与出射边。', '区分相切、角点接触与真实跨界。'],
                    prerequisites: ['洛伦兹力与匀速圆周运动。', '直线/圆与线段交点。', '速度分解与角速度符号。'],
                    misconceptions: ['把相切当成出射。', '把场内圆弧时间混入场外飞行时间。', '只凭画面接触判断角点。'],
                  }}
                  onApplyPreset={(id) => { const preset = P04_PRESETS[id]; if (preset) applyScenePreset(preset, '已载入讲解预设'); }}
                  onGoPractice={() => setTab('practice')}
                />
              ) : null}
              {tab === 'practice' ? <PracticePanel modelId="p04" /> : null}
              {tab === 'data' ? (
                <div className="panel-section-stack">
                  <div className="panel-intro"><div><h2>有限区域事件</h2><p>全局 t = {formatTime(clock.time)}；选中 {selectedLabel} 的局部 τ = {selectedTau === null ? '尚未发射' : formatTime(selectedTau)}。</p></div></div>
                  <div className="particle-compare-table" data-testid="p04-compare">
                    <div className="particle-compare-head"><span>粒子</span><span>状态</span><span>R</span><span>场内时间</span><span>出场边</span><span>τ</span></div>
                    {evaluations.map((item) => (
                      <button key={item.particle.id} type="button" className={`particle-compare-row ${item.particle.id === scene.activeParticleId ? 'is-selected' : ''}`} onClick={() => selectParticleById(item.particle.id)} data-testid={`p04-compare-row-${item.particle.label}`}>
                        <span className="particle-compare-label" style={{ color: item.particle.color }}><i style={{ background: item.particle.color }} />{item.particle.label}</span>
                        <span>{P04_STATUS_LABEL[item.solution.status]}</span>
                        <span>{item.solution.radiusM ? formatLength(item.solution.radiusM) : '—'}</span>
                        <span>{timeLabel(item.solution.fieldTimeS)}</span>
                        <span>{item.solution.exit?.boundaryIds.join(' / ') ?? '—'}</span>
                        <span>{item.state ? formatTime(item.state.timeS) : '待发射'}</span>
                      </button>
                    ))}
                  </div>
                  <ReadoutGrid items={[
                    { label: '状态', value: P04_STATUS_LABEL[selectedSolution?.status ?? 'invalid'], testId: 'p04-status' },
                    { label: '轨道半径 R', value: selectedSolution?.radiusM ? formatLength(selectedSolution.radiusM) : '—', hint: 'R=m|v|/(|qBz|)', testId: 'p04-radius' },
                    { label: '周期 T', value: selectedSolution?.periodS ? formatTime(selectedSolution.periodS) : '—', testId: 'p04-period' },
                    { label: '转向', value: selectedSolution?.turn === 'counterclockwise' ? '逆时针' : selectedSolution?.turn === 'clockwise' ? '顺时针' : '—', testId: 'p04-turn' },
                    { label: '入场时间', value: timeLabel(selectedSolution?.entryTimeS ?? null), testId: 'p04-entry-time' },
                    { label: '出场时间', value: timeLabel(selectedSolution?.exitTimeS ?? null), testId: 'p04-exit-time' },
                    { label: '场内时间', value: timeLabel(selectedSolution?.fieldTimeS ?? null), testId: 'p04-field-time' },
                    { label: '偏转角', value: selectedSolution?.deflectionDegrees === null || selectedSolution?.deflectionDegrees === undefined ? '—' : `${formatNumber(selectedSolution.deflectionDegrees, 1)}°`, testId: 'p04-deflection' },
                    { label: '发射点', value: pointLabel(selectedSolution?.launchPoint ?? null), testId: 'p04-start-point' },
                    { label: '入射点', value: pointLabel(selectedSolution?.entry?.position ?? null), testId: 'p04-entry-point' },
                    { label: '出场点', value: pointLabel(selectedSolution?.exit?.position ?? null), testId: 'p04-exit-point' },
                    { label: '出场边', value: selectedSolution?.exit?.boundaryIds.join(' / ') ?? '—', testId: 'p04-exit-boundary' },
                    { label: '圆心', value: pointLabel(arcSegment?.center ?? null), testId: 'p04-center' },
                    { label: '当前区域', value: selectedState ? (selectedState.inField ? '场内' : '场外') : '未发射', testId: 'p04-region' },
                    { label: '当前速度', value: selectedState ? `${formatNumber(Math.hypot(selectedState.velocity.x, selectedState.velocity.y), 2)} m/s` : '未发射', testId: 'p04-velocity' },
                    { label: '局部时间 τ', value: selectedTau === null ? '尚未发射' : formatTime(selectedTau), testId: 'p04-local-time' },
                  ]} />
                  <div className="callout callout-note"><Icon name="info" size={18} /><div><strong>{P04_STATUS_LABEL[selectedSolution?.status ?? 'invalid']}</strong><p>{selectedSolution?.statusExplanation}</p>{selectedSolution?.issue ? <p>{selectedSolution.issue}</p> : null}</div></div>
                  <section className="panel-section">
                    <h3 className="section-title">解析事件表</h3>
                    <div className="p04-event-list" data-testid="p04-event-list">
                      {selectedSolution?.events.length ? selectedSolution.events.map((event, index) => (
                        <div className="p04-event-row" key={`${event.kind}-${event.timeS}-${index}`} data-testid={`p04-event-${index}`}>
                          <strong>{eventLabel(event)}</strong>
                          <span>{formatTime(event.timeS)}</span>
                          <span>{pointLabel(event.position)}</span>
                          <span>{event.boundaryIds.join(' / ') || '—'}</span>
                        </div>
                      )) : <p className="muted-text">当前预测没有边界事件。</p>}
                    </div>
                  </section>
                  <section className="formula-card">
                    <p className="eyebrow">公式与代值</p>
                    <MathTex block>{'R=\\frac{m|\\vec v|}{|qB_z|},\\qquad T=\\frac{2\\pi m}{|qB_z|},\\qquad t_{\\text{inside}}=\\frac{\\Delta\\varphi}{|\\omega|}'}</MathTex>
                    <p>{selectedLabel}: v = {formatNumber(selectedSpeed, 2)} m/s，|q| = {formatNumber(Math.abs(selectedParticle?.chargeC ?? 0), 2)} C，m = {formatNumber(selectedParticle?.massKg ?? 0, 2)} kg，Bz = {formatNumber(scene.field.Bz, 2)} T</p>
                    <p className="formula-result">R ≈ {selectedSolution?.radiusM ? formatLength(selectedSolution.radiusM) : '—'}，T ≈ {selectedSolution?.periodS ? formatTime(selectedSolution.periodS) : '—'}；区域几何：{geometry.kind === 'strip' ? `条带 x∈[${formatNumber(geometry.xMin, 2)}, ${formatNumber(geometry.xMax, 2)}]` : `矩形 x∈[${formatNumber(geometry.xMin, 2)}, ${formatNumber(geometry.xMax, 2)}], y∈[${formatNumber(geometry.yMin, 2)}, ${formatNumber(geometry.yMax, 2)}]`}</p>
                  </section>
                  <div className="callout callout-note"><Icon name="info" size={18} /><div><strong>边界语义</strong><p>入场/出场位置和速度连续；相切只接触不切换区域；角点同时命中合并为一个事件并记录两条边。缩短采样只影响绘图，不改变解析事件时间。</p></div></div>
                </div>
              ) : null}
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
