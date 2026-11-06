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
  alternatingStateAt,
  type AlternatingEvent,
} from '../../physics/particles/alternatingMagneticRegions';
import { usePersistentState } from '../../hooks/usePersistentState';
import { usePlaybackClock } from '../../hooks/usePlaybackClock';
import { formatLength, formatNumber, formatTime } from '../../lib/format';
import { P05_LESSON } from '../../content/lessons';
import {
  P05_DEFAULT,
  P05_PRESETS,
  P05_SCENE_STORAGE_KEY,
  decodeP05SceneJson,
  loadInitialP05Scene,
  p05GlobalDuration,
  p05KeyFrames,
  p05SolutionFor,
  parseP05StoredScene,
  serializeP05Scene,
  toP05StoredScene,
  type P05Field,
  type P05Scene,
} from './p05Scene';
import {
  AlternatingFieldsStage,
  P05_DEFAULT_LAYERS,
  P05_STATUS_LABEL,
  type P05ConditionNotice,
  type P05EvaluatedParticle,
  type P05Layers,
} from './AlternatingFieldsStage';
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

const LAYER_ITEMS: Array<{ key: keyof P05Layers; short: string; label: string }> = [
  { key: 'predicted', short: '预测', label: '完整预测轨迹' },
  { key: 'trail', short: '已走', label: '已走轨迹' },
  { key: 'center', short: '圆心', label: '当前区段圆心' },
  { key: 'vectors', short: '速度', label: '速度切线' },
  { key: 'force', short: '力', label: '洛伦兹力' },
  { key: 'allAux', short: '全部圆心', label: '所有粒子的圆心' },
  { key: 'allVectors', short: '全部矢量', label: '所有粒子的速度与力' },
  { key: 'field', short: '分区', label: '磁区填色与 Bz 符号' },
  { key: 'markers', short: '跨界点', label: '跨界 / 相切事件点' },
];

let lastAppliedP05PresetId: string | null = null;

function pointLabel(point: { x: number; y: number } | null): string {
  if (!point) return '—';
  const snap = (value: number) => (Math.abs(value) < 1e-9 ? 0 : value);
  return `(${formatLength(snap(point.x))}, ${formatLength(snap(point.y))})`;
}

function directionOf(particle: { velocity: { x: number; y: number } }): number {
  const angle = (Math.atan2(particle.velocity.y, particle.velocity.x) * 180) / Math.PI;
  return angle < 0 ? angle + 360 : angle;
}

function speedOf(particle: { velocity: { x: number; y: number } }): number {
  return Math.hypot(particle.velocity.x, particle.velocity.y);
}

function clonePreset(preset: P05Scene): P05Scene {
  return parseP05StoredScene(JSON.parse(serializeP05Scene(preset))).scene ?? preset;
}

function eventLabel(event: AlternatingEvent): string {
  if (event.kind === 'crossing') return `跨界 ${event.fromRegion + 1} → ${event.toRegion + 1}`;
  if (event.kind === 'tangent') return '相切';
  if (event.kind === 'event-limit') return '事件上限';
  if (event.kind === 'window-end') return '窗口结束';
  return '出发';
}

export function AlternatingFieldsPage() {
  const initialScene = useMemo(() => loadInitialP05Scene(), []);
  const initialStored = useMemo(() => toP05StoredScene(initialScene), [initialScene]);
  const [storedScene, setStoredScene] = usePersistentState<unknown>(P05_SCENE_STORAGE_KEY, initialStored);
  const scene = useMemo(() => parseP05StoredScene(storedScene).scene ?? initialScene, [initialScene, storedScene]);
  const [storedLayers, setStoredLayers] = usePersistentState<P05Layers>('emplab.p05.layers.v1', P05_DEFAULT_LAYERS);
  const layers = useMemo(() => ({ ...P05_DEFAULT_LAYERS, ...storedLayers }), [storedLayers]);
  const [mode, setMode] = usePersistentState<LearningMode>('emplab.p05.mode.v1', 'guided');
  const [teacher, setTeacher] = useState(false);
  const [formulaVisible, setFormulaVisible] = useState(true);
  const [stageMode, setStageMode] = useState<StageMode>('interact');
  const [tab, setTab] = useState<PanelTabId>(mode === 'guided' ? 'lesson' : 'params');
  const [draft, setDraft] = useState<ParticleDraft | null>(null);
  const [conditionNotice, setConditionNotice] = useState<P05ConditionNotice | null>(null);
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

  const commitScene = useCallback((next: P05Scene) => setStoredScene(toP05StoredScene(next)), [setStoredScene]);

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
        solution: p05SolutionFor(scene.field, particle),
        runtime: scene.runtimeById[particle.id] ?? { launchTimeSec: 0 },
      })),
    [scene.field, scene.particles, scene.runtimeById],
  );
  const duration = useMemo(() => p05GlobalDuration(scene), [scene]);
  const keyFrames = useMemo(() => p05KeyFrames(scene), [scene]);
  const clock = usePlaybackClock(duration, keyFrames.map((frame) => frame.time));
  globalTimeRef.current = clock.time;

  const evaluations = useMemo<P05EvaluatedParticle[]>(
    () =>
      evaluationsBase.map((item) => {
        const tau = particleTau(item.runtime, clock.time);
        return {
          ...item,
          state: tau === null ? null : alternatingStateAt(item.solution, tau),
        };
      }),
    [clock.time, evaluationsBase],
  );
  const selectedCommitted = evaluations.find((item) => item.particle.id === scene.activeParticleId) ?? evaluations[0] ?? null;
  const selectedParticle = draft?.draftParticle ?? selectedCommitted?.particle ?? null;
  const draftSolution = useMemo(
    () => (draft ? p05SolutionFor(scene.field, draft.draftParticle) : null),
    [draft, scene.field],
  );
  const selectedSolution = draftSolution ?? selectedCommitted?.solution ?? null;
  const selectedState = draft && draftSolution
    ? alternatingStateAt(draftSolution, 0)
    : selectedCommitted?.state ?? null;
  const selectedTau = draft ? 0 : selectedCommitted?.state?.timeS ?? null;
  const selectedLaunch = selectedCommitted?.runtime.launchTimeSec ?? 0;
  const selectedLabel = selectedParticle?.label ?? 'A';
  const selectedDirection = selectedParticle ? directionOf(selectedParticle) : 0;
  const selectedSpeed = selectedParticle ? speedOf(selectedParticle) : 0;
  const questionCount = questionsForModel('p05').length;

  const showConditionNotice = useCallback((text: string, tone: P05ConditionNotice['tone'], sticky = false) => {
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
    (preset: P05Scene, message: string) => {
      commitScene(clonePreset(preset));
      setDraft(null);
      setTrailResetById({});
      clock.reset();
      showConditionNotice(message, 'recalculated');
    },
    [clock.reset, commitScene, showConditionNotice],
  );

  useEffect(() => {
    if (!presetId || lastAppliedP05PresetId === presetId) return;
    const preset = P05_PRESETS[presetId];
    if (!preset) return;
    lastAppliedP05PresetId = presetId;
    applyScenePreset(preset, '已载入 P05 预设/题目场景 · 全局时钟归零');
  }, [applyScenePreset, presetId]);

  useEffect(() => {
    setTab(mode === 'guided' ? 'lesson' : 'params');
    setTeacher(false);
  }, [mode]);

  const patchField = (patch: { fields?: number[]; boundaries?: number[] }) => {
    const current = sceneRef.current.field;
    const boundaries = patch.boundaries ? [...patch.boundaries] : [...current.boundaries];
    if (!boundaries.every((value, index) => Number.isFinite(value) && (index === 0 || value > boundaries[index - 1]))) {
      showConditionNotice('区域边界必须严格递增；本次修改未提交。', 'recalculated');
      return;
    }
    const fields = patch.fields ? [...patch.fields] : [...current.fields];
    while (fields.length < boundaries.length + 1) fields.push(0);
    fields.length = boundaries.length + 1;
    const next: P05Field = { boundaries, fields };
    commitScene(applySharedField(sceneRef.current, next));
    setDraft(null);
    setTrailResetById({});
    clock.restart();
    showConditionNotice('共享分区 Bz 或边界改变：全部粒子同步重算并从 tGlobal=0 重演', 'recalculated');
  };
  const setRegionCount = (count: 2 | 3) => {
    if (count === 2) patchField({ boundaries: [0], fields: [sceneRef.current.field.fields[0] ?? -1, sceneRef.current.field.fields[1] ?? 1] });
    else patchField({ boundaries: [-0.5, 0.5], fields: [sceneRef.current.field.fields[0] ?? -1, 0, sceneRef.current.field.fields[1] ?? 1] });
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
      const speed = speedOf(previous.draftParticle);
      const direction = patch.directionDeg ?? directionOf(previous.draftParticle);
      const angle = (direction * Math.PI) / 180;
      return updateDraft(previous, {
        position: { x: patch.startX ?? previous.draftParticle.position.x, y: patch.startY ?? previous.draftParticle.position.y },
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
    const result = addParticle(sceneRef.current, {
      position: { ...current.position, y: current.position.y + 0.1 },
      velocity: { ...current.velocity },
      chargeC: current.chargeC,
      massKg: current.massKg,
      visible: true,
      showTrail: true,
    }, globalTimeRef.current);
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
    const blob = new Blob([serializeP05Scene(sceneRef.current)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'p05-scene.json';
    anchor.click();
    URL.revokeObjectURL(url);
    showConditionNotice('P05 场景已导出为 JSON', 'recalculated');
  };
  const importScene = async (file: File) => {
    const parsed = decodeP05SceneJson(await file.text());
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
    <div className="teacher-layer-bar" role="group" aria-label="P05 教师图层">
      {LAYER_ITEMS.map((item) => (
        <button key={item.key} type="button" className="teacher-layer-chip" aria-pressed={layers[item.key]} onClick={() => setStoredLayers((previous) => ({ ...previous, [item.key]: !layers[item.key] }))}>
          {item.short}
        </button>
      ))}
      <button type="button" className="teacher-layer-chip teacher-formula-toggle" aria-pressed={formulaVisible} onClick={() => setFormulaVisible((value) => !value)}>公式</button>
    </div>
  );

  const sameTimeRows = evaluations.map((item) => ({
    label: item.particle.label,
    position: item.state?.position ?? null,
    tau: item.state?.timeS ?? null,
    waiting: item.state === null,
  }));
  const sameTimePairs = evaluations.slice(1).map((item) => {
    const base = evaluations[0];
    const a = base?.state?.position;
    const b = item.state?.position;
    return {
      labels: `${base?.particle.label ?? 'A'}–${item.particle.label}`,
      distance: a && b ? Math.hypot(a.x - b.x, a.y - b.y) : null,
    };
  });

  return (
    <div className={`sim-page ${teacher ? 'sim-teacher' : ''}`} data-testid="p05-page" data-sim-playing={clock.playing} data-sim-editing={draft !== null} data-sim-time={clock.time} data-particle-count={scene.particles.length} data-active-particle-id={scene.activeParticleId}>
      <header className="sim-header">
        <div className="sim-title-block">
          <p className="eyebrow">P05 · 模块 A · 粒子运动</p>
          <h1>相反磁场多区域与粒子时序</h1>
          <p className="sim-subtitle">在同一竖直分区磁场中跟踪多次跨界、区内停留时间与不同 launchTime；轨迹交叉不等于同一时刻相遇。</p>
        </div>
        <div className="sim-header-actions">
          {!teacher ? (
            <Segmented<LearningMode> ariaLabel="学习模式" value={mode} onChange={setMode} options={[{ value: 'guided', label: '引导学习', icon: <Icon name="book" size={17} /> }, { value: 'free', label: '自由实验', icon: <Icon name="sliders" size={17} /> }]} />
          ) : null}
          <button type="button" className={`tool-button ${teacher ? 'is-active' : ''}`} onClick={() => setTeacher((value) => !value)} aria-pressed={teacher}><Icon name="target" size={17} />{teacher ? '退出教师视图' : '教师视图'}</button>
        </div>
      </header>

      <div className={`sim-layout ${teacher ? 'sim-layout-teacher' : ''}`}>
        <div className="sim-stage-column">
          <AlternatingFieldsStage
            particles={evaluations}
            field={scene.field}
            selectedId={scene.activeParticleId}
            draft={draft && draftSolution ? { particle: draft.draftParticle, solution: draftSolution, state: alternatingStateAt(draftSolution, 0) } : null}
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
              formula={'\\omega_i=-\\frac{qB_i}{m},\\qquad R_i=\\frac{m|v|}{|qB_i|},\\qquad T_i=\\frac{2\\pi m}{|qB_i|}'}
              stats={[
                { label: '粒子数', value: `${scene.particles.length}/5` },
                { label: `状态 ${selectedLabel}`, value: P05_STATUS_LABEL[selectedSolution?.status ?? 'invalid'] },
                { label: '跨界次数', value: selectedSolution?.crossingCount ?? 0 },
                { label: `区域时间 ${selectedLabel}`, value: selectedSolution?.regionTimesS.map((time) => formatTime(time)).join(' / ') ?? '—' },
                { label: `τ ${selectedLabel}`, value: selectedTau === null ? '未发射' : formatTime(selectedTau) },
              ]}
              footnote={`tGlobal = ${formatTime(clock.time)} · ${selectedLabel} τ = ${selectedTau === null ? '未发射' : formatTime(selectedTau)}；跨区事件时间来自解析根。`}
              controls={teacherControls}
              formulaVisible={formulaVisible}
            />
          ) : null}
          <PlaybackBar clock={clock} duration={duration} keyFrames={keyFrames} timeLabel={formatTime(clock.time)} secondaryLabel={`${selectedLabel} τ = ${selectedTau === null ? '未发射' : formatTime(selectedTau)} · ${P05_STATUS_LABEL[selectedSolution?.status ?? 'invalid']}`} timelineLabel="P05 多粒子全局时间轴" note="单粒子编辑只重发射该粒子；共享分区或 Bz 变化会整场重算。" />
        </div>

        {!teacher ? (
          <aside className="sim-panel" aria-label="P05 实验控制台">
            <PanelTabs<PanelTabId> label="实验面板" active={tab} onChange={setTab} tabs={[{ id: 'params', label: '参数', icon: <Icon name="sliders" size={16} /> }, { id: 'lesson', label: '讲解', icon: <Icon name="book" size={16} /> }, { id: 'practice', label: '练习', count: questionCount, icon: <Icon name="check" size={16} /> }, { id: 'data', label: '数据', icon: <Icon name="ruler" size={16} /> }]} />
            <div className="sim-panel-body" role="tabpanel">
              {tab === 'params' ? (
                <div className="panel-section-stack">
                  <div className="panel-intro"><div><h2>分区 Bz · 独立初态</h2><p>当前选中 <strong>{selectedLabel}</strong>。分区和 Bz 是公共实验条件；单粒子编辑只重发射该粒子。</p></div></div>
                  <div className="preset-chips" aria-label="P05 预设">
                    <button type="button" className="chip-button" onClick={() => applyScenePreset(P05_PRESETS['p05-two-halves'], '已载入双半平面预设')}>双半平面</button>
                    <button type="button" className="chip-button" onClick={() => applyScenePreset(P05_PRESETS['p05-reversed'], '已载入磁场反转预设')}>B 反向</button>
                    <button type="button" className="chip-button" onClick={() => applyScenePreset(P05_PRESETS['p05-unequal'], '已载入不等强度预设')}>不等强度</button>
                    <button type="button" className="chip-button" onClick={() => applyScenePreset(P05_PRESETS['p05-three-zone'], '已载入 +B/0/−B 预设')}>+B/0/−B</button>
                    <button type="button" className="chip-button" onClick={() => applyScenePreset(P05_PRESETS['p05-sign'], '已载入正负电荷预设')}>正负电荷</button>
                    <button type="button" className="chip-button" onClick={() => applyScenePreset(P05_PRESETS['p05-launch-delay'], '已载入延迟发射预设')}>延迟发射</button>
                    <button type="button" className="chip-button" onClick={() => applyScenePreset(P05_PRESETS['p05-arrival-same'], '已载入同时同位置预设')}>同时到达</button>
                    <button type="button" className="chip-button" onClick={() => applyScenePreset(P05_PRESETS['p05-cross-not-simultaneous'], '已载入轨迹交叉不同时预设')}>交叉≠相遇</button>
                    <button type="button" className="chip-button" onClick={() => applyScenePreset(P05_PRESETS['p05-tangent'], '已载入相切预设')}>相切</button>
                  </div>

                  <section className="panel-section">
                    <h3 className="section-title">共享磁区</h3>
                    <Segmented ariaLabel="P05 区域数量" size="sm" value={scene.field.fields.length === 3 ? 3 : 2} onChange={(value) => setRegionCount(value === 3 ? 3 : 2)} options={[{ value: 2, label: '两区' }, { value: 3, label: '三区' }]} />
                    {scene.field.boundaries.map((boundary, index) => (
                      <ParamSlider
                        key={`boundary-${index}`}
                        label={`交界 ${index + 1} x`}
                        value={boundary}
                        min={-4}
                        max={4}
                        step={0.05}
                        unit="m"
                        decimals={2}
                        validateValue={(value) => {
                          const previous = index > 0 ? scene.field.boundaries[index - 1] : -Infinity;
                          const next = index < scene.field.boundaries.length - 1 ? scene.field.boundaries[index + 1] : Infinity;
                          return value > previous && value < next
                            ? null
                            : `交界必须严格递增：当前允许区间为 (${previous === -Infinity ? '−∞' : formatNumber(previous, 2)}, ${next === Infinity ? '+∞' : formatNumber(next, 2)}) m。`;
                        }}
                        onChange={(value) => { const next = [...scene.field.boundaries]; next[index] = value; patchField({ boundaries: next }); }}
                      />
                    ))}
                    {scene.field.fields.map((Bz, index) => (
                      <ParamSlider key={`field-${index}`} label={`区域 ${String.fromCharCode(65 + index)} Bz`} value={Bz} min={-5} max={5} step={0.1} unit="T" decimals={1} onChange={(value) => { const next = [...scene.field.fields]; next[index] = value; patchField({ fields: next }); }} />
                    ))}
                    <p className="field-hint">Bz=0 的区域为无场直线；每跨一次边界，速度和位置连续，圆心与 R/T 按新 Bz 重算。</p>
                  </section>

                  <section className="panel-section">
                    <h3 className="section-title">粒子 {selectedLabel} 的初态</h3>
                    <div className="field-label-row"><div><span className="field-label">电荷符号</span><p className="field-hint">只影响 {selectedLabel}</p></div><Segmented ariaLabel="P05 电荷符号" size="sm" value={(selectedParticle?.chargeC ?? 1) < 0 ? -1 : 1} onChange={(value) => patchSelectedParticle({ chargeC: value * Math.max(0.1, Math.abs(selectedParticle?.chargeC ?? 1)) })} options={[{ value: 1, label: '+ 正电荷' }, { value: -1, label: '− 负电荷' }]} /></div>
                    <ParamSlider label="电荷量 |q|" value={Math.abs(selectedParticle?.chargeC ?? 1)} min={0} max={3} step={0.1} unit="C" decimals={1} onChange={(value) => patchSelectedParticle({ chargeC: (selectedParticle && selectedParticle.chargeC < 0 ? -1 : 1) * value })} />
                    <ParamSlider label="质量 m" value={selectedParticle?.massKg ?? 1} min={0.1} max={5} step={0.1} unit="kg" decimals={1} onChange={(value) => patchSelectedParticle({ massKg: value })} />
                    <ParamSlider label="速度大小 v" value={selectedSpeed} min={0} max={5} step={0.1} unit="m/s" decimals={1} onChange={(value) => { const angle = (selectedDirection * Math.PI) / 180; patchSelectedParticle({ velocity: { x: value * Math.cos(angle), y: value * Math.sin(angle) } }); }} />
                    <ParamSlider label="速度方向 θ" value={selectedDirection} min={0} max={360} step={1} unit="°" decimals={0} onChange={(value) => { const angle = (value * Math.PI) / 180; patchSelectedParticle({ velocity: { x: selectedSpeed * Math.cos(angle), y: selectedSpeed * Math.sin(angle) } }); }} />
                    <div className="two-col-params">
                      <ParamSlider label="发射点 x" value={selectedParticle?.position.x ?? 0} min={-8} max={8} step={0.1} unit="m" decimals={2} onChange={(value) => patchSelectedParticle({ position: { x: value, y: selectedParticle?.position.y ?? 0 } })} />
                      <ParamSlider label="发射点 y" value={selectedParticle?.position.y ?? 0} min={-8} max={8} step={0.1} unit="m" decimals={2} onChange={(value) => patchSelectedParticle({ position: { x: selectedParticle?.position.x ?? 0, y: value } })} />
                    </div>
                  </section>

                  <section className="panel-section"><h3 className="section-title">显示图层</h3><div className="toggle-list">{LAYER_ITEMS.map((item) => <ToggleSwitch key={item.key} label={item.label} checked={layers[item.key]} onChange={() => setStoredLayers((previous) => ({ ...previous, [item.key]: !layers[item.key] }))} />)}</div></section>
                  <section className="panel-section"><h3 className="section-title">场景数据</h3><div className="scene-io-row"><button type="button" className="secondary-button" onClick={exportScene}><Icon name="download" size={16} />导出场景 JSON</button><button type="button" className="secondary-button" onClick={() => importRef.current?.click()}><Icon name="upload" size={16} />导入场景 JSON</button><input ref={importRef} type="file" accept="application/json,.json" hidden data-testid="p05-scene-import" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importScene(file); event.target.value = ''; }} /></div></section>
                  <button type="button" className="secondary-button wide-button" onClick={() => applyScenePreset(P05_DEFAULT, '已恢复 P05 默认场景')}><Icon name="reset" size={17} />恢复默认场景</button>
                </div>
              ) : null}
              {tab === 'lesson' ? <LessonRunner steps={P05_LESSON} storageKey="emplab.p05.lesson.v1" overview={{ goals: ['理解相反磁区的分段圆弧与多次跨界。', '用区内 R/T 与事件时间比较不同粒子。', '区分轨迹交叉和同一全局时刻相遇。'], prerequisites: ['洛伦兹力与圆周运动。', '分段函数、跨界位置/速度连续。', '全局时间与局部 launchTime。'], misconceptions: ['把两条轨迹的交点当成相遇。', '跨区后继续沿用旧圆心/半径。', '认为改变 A 必须重置 B/C。'] }} onApplyPreset={(id) => { const preset = P05_PRESETS[id]; if (preset) applyScenePreset(preset, '已载入讲解预设'); }} onGoPractice={() => setTab('practice')} /> : null}
              {tab === 'practice' ? <PracticePanel modelId="p05" /> : null}
              {tab === 'data' ? (
                <div className="panel-section-stack">
                  <div className="panel-intro"><div><h2>跨界时序与同时刻位置</h2><p>全局 t = {formatTime(clock.time)}；选中 {selectedLabel} 的局部 τ = {selectedTau === null ? '尚未发射' : formatTime(selectedTau)}。</p></div></div>
                  <div className="particle-compare-table" data-testid="p05-compare"><div className="particle-compare-head"><span>粒子</span><span>状态</span><span>跨界</span><span>相切</span><span>区域时间</span><span>τ</span></div>{evaluations.map((item) => <button key={item.particle.id} type="button" className={`particle-compare-row ${item.particle.id === scene.activeParticleId ? 'is-selected' : ''}`} onClick={() => selectParticleById(item.particle.id)} data-testid={`p05-compare-row-${item.particle.label}`}><span className="particle-compare-label" style={{ color: item.particle.color }}><i style={{ background: item.particle.color }} />{item.particle.label}</span><span>{P05_STATUS_LABEL[item.solution.status]}</span><span>{item.solution.crossingCount}</span><span>{item.solution.tangentCount}</span><span>{item.solution.regionTimesS.map((time) => formatTime(time)).join(' / ')}</span><span>{item.state ? formatTime(item.state.timeS) : '待发射'}</span></button>)}</div>
                  <ReadoutGrid items={[
                    { label: '状态', value: P05_STATUS_LABEL[selectedSolution?.status ?? 'invalid'], testId: 'p05-status' },
                    { label: '跨界次数', value: `${selectedSolution?.crossingCount ?? 0}`, testId: 'p05-crossings' },
                    { label: '相切次数', value: `${selectedSolution?.tangentCount ?? 0}`, testId: 'p05-tangents' },
                    { label: '当前区域', value: selectedState ? `区域 ${String.fromCharCode(65 + selectedState.regionIndex)}` : '未发射', testId: 'p05-region' },
                    { label: '区段 R', value: selectedSolution?.segments.find((segment) => segment.kind === 'arc')?.radiusM ? formatLength(selectedSolution.segments.find((segment) => segment.kind === 'arc')!.radiusM!) : '—', testId: 'p05-radius' },
                    { label: '区段 T', value: selectedSolution?.segments.find((segment) => segment.kind === 'arc')?.periodS ? formatTime(selectedSolution.segments.find((segment) => segment.kind === 'arc')!.periodS!) : '—', testId: 'p05-period' },
                    { label: '位置', value: selectedState ? pointLabel(selectedState.position) : '未发射', testId: 'p05-position' },
                    { label: '速度', value: selectedState ? `${formatNumber(selectedState.speed, 2)} m/s` : '未发射', testId: 'p05-velocity' },
                    { label: '当前 Bz', value: selectedState ? `${formatNumber(selectedState.Bz, 2)} T` : '—', testId: 'p05-current-bz' },
                    { label: '局部时间 τ', value: selectedTau === null ? '尚未发射' : formatTime(selectedTau), hint: `launchTime = ${formatTime(selectedLaunch)}`, testId: 'p05-local-time' },
                  ]} />
                  <section className="panel-section"><h3 className="section-title">解析事件时间表</h3><div className="p04-event-list" data-testid="p05-event-list">{selectedSolution?.events.filter((event) => event.kind !== 'start').length ? selectedSolution.events.filter((event) => event.kind !== 'start').map((event, index) => <div className="p04-event-row" key={`${event.kind}-${event.timeS}-${index}`} data-testid={`p05-event-${index}`}><strong>{eventLabel(event)}</strong><span>{formatTime(event.timeS)}</span><span>{pointLabel(event.position)}</span><span>{event.boundaryIndex !== null ? `交界 ${event.boundaryIndex + 1}` : '—'}</span></div>) : <p className="muted-text">当前预测没有跨界或相切事件。</p>}</div></section>
                  <section className="panel-section"><h3 className="section-title">同一全局时刻的位置对照</h3><div className="p05-same-time" data-testid="p05-same-time">{sameTimeRows.map((row) => <div className="p04-event-row" key={row.label} data-testid={`p05-same-${row.label}`} data-x={row.position?.x ?? ''} data-y={row.position?.y ?? ''} data-tau={row.tau ?? ''}><strong>{row.label}</strong><span>{row.waiting ? '待发射' : pointLabel(row.position)}</span><span>{row.tau === null ? '—' : formatTime(row.tau)}</span><span>{row.waiting ? '等待 launchTime' : '同一 tGlobal'}</span></div>)}{sameTimePairs.map((pair) => <div className="p04-event-row" key={pair.labels} data-testid={`p05-distance-${pair.labels}`} data-distance={pair.distance ?? ''}><strong>{pair.labels}</strong><span>{pair.distance === null ? '—' : formatLength(pair.distance)}</span><span>同时刻距离</span><span>不是碰撞判定</span></div>)}</div></section>
                  <section className="formula-card"><p className="eyebrow">分区解析解</p><MathTex block>{'\\omega_i=-\\frac{qB_i}{m},\\qquad R_i=\\frac{m|\\vec v|}{|qB_i|},\\qquad T_i=\\frac{2\\pi m}{|qB_i|}'}</MathTex><p>每次跨界都用该时刻的实际速度和位置作为下一段初值；速度不因跨界跳变，圆心与 R/T 按新区域重新计算。</p></section>
                  <div className="callout callout-note"><Icon name="info" size={18} /><div><strong>时序语义</strong><p>轨迹几何交叉不等于同一全局时刻相遇。上表只在同一个 tGlobal 比较位置；同位置仅作教学标记，不改变轨迹、不施加碰撞。</p></div></div>
                </div>
              ) : null}
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
