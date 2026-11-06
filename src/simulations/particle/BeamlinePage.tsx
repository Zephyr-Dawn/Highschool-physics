import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { validateBeamlineApparatus } from '../../physics/particles/beamline';
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
import { usePersistentState } from '../../hooks/usePersistentState';
import { usePlaybackClock } from '../../hooks/usePlaybackClock';
import { formatLength, formatNumber, formatTime } from '../../lib/format';
import { P07_LESSON } from '../../content/lessons';
import {
  P07_DEFAULT,
  P07_PRESETS,
  P07_SCENE_STORAGE_KEY,
  decodeP07SceneJson,
  loadInitialP07Scene,
  p07AbsorptionGlobalTime,
  p07BuildParticle,
  p07DetectionGlobalTime,
  p07GlobalDuration,
  p07KeyFrames,
  p07OutcomeAt,
  p07ParticleDisplay,
  p07SeedFromDisplay,
  p07SolutionFor,
  p07StateFor,
  parseP07StoredScene,
  serializeP07Scene,
  toP07StoredScene,
  type P07Apparatus,
  type P07LiveOutcome,
  type P07ParticleDisplay,
  type P07Scene,
} from './p07Scene';
import {
  BeamlineStage,
  P07_DEFAULT_LAYERS as P07_LAYER_DEFAULTS,
  type P07DraftPreview,
  type P07EvaluatedParticle,
  type P07Layers,
} from './BeamlineStage';
import { ParticleRoster, type RosterParticle } from './ParticleRoster';
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
type ConditionNotice = { text: string; tone: 'preview' | 'recalculated' };

const LAYER_ITEMS: Array<{ key: keyof P07Layers; short: string; label: string }> = [
  { key: 'predicted', short: '预测', label: '完整预测轨迹' },
  { key: 'trail', short: '已走', label: '已走轨迹' },
  { key: 'regions', short: '场区', label: '场区背景与边界' },
  { key: 'fieldE', short: '电场', label: '电场箭头 E' },
  { key: 'fieldB', short: '磁场', label: '磁场符号 B' },
  { key: 'slits', short: '狭缝', label: '狭缝与吸收板' },
  { key: 'screen', short: '屏幕', label: '屏幕有效高度' },
  { key: 'velocity', short: '速度', label: '速度矢量' },
  { key: 'forceE', short: 'F_E', label: '电场力 F_E' },
  { key: 'forceB', short: 'F_B', label: '磁场力 F_B' },
  { key: 'resultant', short: '合力', label: '合力 F' },
  { key: 'allVectors', short: '全部矢量', label: '所有粒子的矢量' },
  { key: 'events', short: '事件', label: '真实事件标记' },
  { key: 'aux', short: '圆心', label: '磁分析区圆心与半径' },
  { key: 'detections', short: '实测光斑', label: '已发生的屏幕光斑/吸收点' },
  { key: 'predictedDetection', short: '预测光斑', label: '教师预测光斑（虚线）' },
];

const LIVE_OUTCOME_LABEL: Record<P07LiveOutcome, string> = {
  waiting: '待发射',
  flying: '飞行中',
  'screen-hit': '命中屏幕',
  'screen-outside': '屏幕越界',
  absorbed: '被吸收',
  'not-arrived': '未到达',
  'event-limited': '事件截断',
  invalid: '无效',
};

const FINAL_OUTCOME_LABEL: Record<P07LiveOutcome, string> = {
  waiting: '待发射',
  flying: '飞行中',
  'screen-hit': '命中',
  'screen-outside': '屏外',
  absorbed: '吸收',
  'not-arrived': '未到达',
  'event-limited': '截断',
  invalid: '无效',
};

const PRESET_BUTTONS: Array<{ id: string; label: string }> = [
  { id: 'p07-standard', label: '标准选速' },
  { id: 'p07-slow', label: '慢粒子撞板' },
  { id: 'p07-fast', label: '快粒子撞板' },
  { id: 'p07-offset-entry', label: '入口偏轴' },
  { id: 'p07-negative', label: '负电荷' },
  { id: 'p07-reverse-analyzer', label: '分析磁场反向' },
  { id: 'p07-deflector-off', label: '末段电场关闭' },
  { id: 'p07-deflector-reverse', label: '末段电场反向' },
  { id: 'p07-screen-miss', label: '屏幕高度失配' },
  { id: 'p07-accelerated', label: '加速段开启' },
  { id: 'p07-arrival', label: '不同 launchTime' },
  { id: 'p07-multi', label: '三粒子综合' },
  { id: 'p07-five', label: '五粒子' },
];

function terminalTime(item: P07EvaluatedParticle): number | null {
  if (item.solution.detection) return p07DetectionGlobalTime(item);
  if (item.solution.absorption) return p07AbsorptionGlobalTime(item);
  if (item.solution.screenCrossing) return item.runtime.launchTimeSec + item.solution.screenCrossing.localTimeS;
  return null;
}

function terminalLocalTime(item: P07EvaluatedParticle): number | null {
  if (item.solution.detection) return item.solution.detection.localTimeS;
  if (item.solution.absorption) return item.solution.absorption.timeS;
  if (item.solution.screenCrossing) return item.solution.screenCrossing.localTimeS;
  return null;
}

function terminalY(item: P07EvaluatedParticle): number | null {
  if (item.solution.detection) return item.solution.detection.yHit;
  if (item.solution.screenCrossing) return item.solution.screenCrossing.yHit;
  if (item.solution.absorption) return item.solution.absorption.position.y;
  return null;
}

function resizeSelector(current: P07Apparatus, width: number): P07Apparatus {
  const selectorX1 = current.selector.x0 + width;
  const gap = Math.max(0, current.analyzer.x0 - current.selector.x1);
  const analyzerWidth = current.analyzer.x1 - current.analyzer.x0;
  const deflectorWidth = current.deflector.x1 - current.deflector.x0;
  const screenOffset = Math.max(0, current.screen.x - current.deflector.x1);
  const analyzerX0 = selectorX1 + gap;
  const analyzerX1 = analyzerX0 + analyzerWidth;
  const deflectorX0 = analyzerX1;
  const deflectorX1 = deflectorX0 + deflectorWidth;
  return {
    ...current,
    selector: { ...current.selector, x1: selectorX1 },
    analyzer: { ...current.analyzer, x0: analyzerX0, x1: analyzerX1 },
    deflector: { ...current.deflector, x0: deflectorX0, x1: deflectorX1 },
    exitSlit: { ...current.exitSlit, x: selectorX1 },
    screen: { ...current.screen, x: deflectorX1 + screenOffset },
  };
}

function resizeAnalyzer(current: P07Apparatus, width: number): P07Apparatus {
  const analyzerX1 = current.analyzer.x0 + width;
  const deflectorWidth = current.deflector.x1 - current.deflector.x0;
  const screenOffset = Math.max(0, current.screen.x - current.deflector.x1);
  const deflectorX0 = analyzerX1;
  const deflectorX1 = deflectorX0 + deflectorWidth;
  return {
    ...current,
    analyzer: { ...current.analyzer, x1: analyzerX1 },
    deflector: { ...current.deflector, x0: deflectorX0, x1: deflectorX1 },
    screen: { ...current.screen, x: deflectorX1 + screenOffset },
  };
}

function resizeDeflector(current: P07Apparatus, width: number): P07Apparatus {
  const deflectorX1 = current.deflector.x0 + width;
  const screenOffset = Math.max(0, current.screen.x - current.deflector.x1);
  return {
    ...current,
    deflector: { ...current.deflector, x1: deflectorX1 },
    screen: { ...current.screen, x: deflectorX1 + screenOffset },
  };
}

export function BeamlinePage() {
  const initialScene = useMemo(() => loadInitialP07Scene(), []);
  const [storedScene, setStoredScene] = usePersistentState<unknown>(
    P07_SCENE_STORAGE_KEY,
    toP07StoredScene(initialScene),
  );
  const scene = useMemo(
    () => parseP07StoredScene(storedScene).scene ?? initialScene,
    [initialScene, storedScene],
  );
  const [storedLayers, setLayers] = usePersistentState<P07Layers>(
    'emplab.p07.layers.v1',
    P07_LAYER_DEFAULTS,
  );
  const layers = useMemo(() => ({ ...P07_LAYER_DEFAULTS, ...storedLayers }), [storedLayers]);
  const [mode, setMode] = usePersistentState<LearningMode>('emplab.p07.mode.v1', 'guided');
  const [teacher, setTeacher] = useState(false);
  const [formulaVisible, setFormulaVisible] = useState(true);
  const [stageMode, setStageMode] = useState<StageMode>('interact');
  const [tab, setTab] = useState<PanelTabId>(mode === 'guided' ? 'lesson' : 'params');
  const [draft, setDraft] = useState<ParticleDraft | null>(null);
  const [conditionNotice, setConditionNotice] = useState<ConditionNotice | null>(null);
  const [trailResetById, setTrailResetById] = useState<Record<string, number>>({});
  const [searchParams] = useSearchParams();
  const presetId = searchParams.get('preset');
  const normalizedOnMount = useRef(false);
  const appliedPresetRef = useRef<string | null>(null);
  const noticeTimer = useRef<number | null>(null);
  const importRef = useRef<HTMLInputElement | null>(null);
  const sceneRef = useRef(scene);
  const draftRef = useRef(draft);
  const globalTimeRef = useRef(0);
  sceneRef.current = scene;
  draftRef.current = draft;

  const commitScene = useCallback(
    (next: P07Scene) => setStoredScene(toP07StoredScene(next)),
    [setStoredScene],
  );

  const showConditionNotice = useCallback((text: string, tone: ConditionNotice['tone'], sticky = false) => {
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
    setConditionNotice({ text, tone });
    if (!sticky) {
      noticeTimer.current = window.setTimeout(() => {
        setConditionNotice(null);
        noticeTimer.current = null;
      }, 2800);
    }
  }, []);
  useEffect(() => () => {
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
  }, []);

  useEffect(() => {
    if (normalizedOnMount.current) return;
    normalizedOnMount.current = true;
    if (scene.particles.some((particle) => (scene.runtimeById[particle.id]?.launchTimeSec ?? 0) > 0)) {
      commitScene(relaunchAll(scene));
    }
  }, [commitScene, scene]);

  useEffect(() => {
    setTab(mode === 'guided' ? 'lesson' : 'params');
    setTeacher(false);
  }, [mode]);

  const apparatus = scene.field;
  const evaluationsBase = useMemo(
    () =>
      scene.particles.map((particle) =>
        p07BuildParticle(
          particle,
          scene.runtimeById[particle.id] ?? { launchTimeSec: 0 },
          apparatus,
        ),
      ),
    [apparatus, scene.particles, scene.runtimeById],
  );
  const duration = useMemo(
    () => p07GlobalDuration({ ...scene, field: apparatus }, evaluationsBase),
    [apparatus, evaluationsBase, scene],
  );
  const keyFrames: KeyFrame[] = useMemo(
    () => p07KeyFrames({ ...scene, field: apparatus }, evaluationsBase),
    [apparatus, evaluationsBase, scene],
  );
  const clock = usePlaybackClock(duration, keyFrames.map((frame) => frame.time));
  globalTimeRef.current = clock.time;

  useEffect(() => {
    if (!presetId) return;
    const preset = P07_PRESETS[presetId];
    if (!preset || appliedPresetRef.current === presetId) return;
    appliedPresetRef.current = presetId;
    commitScene(preset);
    setDraft(null);
    setTrailResetById({});
    clock.restart();
    showConditionNotice('已载入 P07 可复现预设 · 全局时钟归零', 'recalculated');
  }, [commitScene, clock.restart, presetId, showConditionNotice]);

  const evaluations = useMemo<P07EvaluatedParticle[]>(
    () =>
      evaluationsBase.map((item) => {
        const tau = particleTau(item.runtime, clock.time);
        return {
          ...item,
          state: tau === null ? null : p07StateFor(item, tau),
          liveOutcome: p07OutcomeAt(item, tau),
        };
      }),
    [clock.time, evaluationsBase],
  );
  const selectedCommitted = evaluations.find((item) => item.particle.id === scene.activeParticleId) ?? evaluations[0] ?? null;
  const selectedParticle = draft?.draftParticle ?? selectedCommitted?.particle ?? null;
  const selectedDisplay = selectedParticle ? p07ParticleDisplay(selectedParticle) : null;
  const draftSolution = useMemo(
    () => (draft ? p07SolutionFor(apparatus, draft.draftParticle) : null),
    [apparatus, draft],
  );
  const draftState = draftSolution ? p07StateFor({
    particle: draft!.draftParticle,
    runtime: selectedCommitted?.runtime ?? { launchTimeSec: 0 },
    solution: draftSolution,
  }, 0) : null;
  const selectedSolution = draftSolution ?? selectedCommitted?.solution ?? null;
  const selectedState = draftState ?? selectedCommitted?.state ?? null;
  const selectedTau = draft ? 0 : selectedCommitted?.state?.timeS ?? null;
  const selectedLaunch = selectedCommitted?.runtime.launchTimeSec ?? 0;
  const selectedLabel = selectedParticle?.label ?? 'A';
  const selectedDetection = selectedSolution?.detection ?? null;
  const selectedAbsorption = selectedSolution?.absorption ?? null;
  const selectedCrossing = selectedSolution?.screenCrossing ?? null;
  const selectedGlobalHit = selectedCommitted ? p07DetectionGlobalTime(selectedCommitted) : null;
  const selectedGlobalAbsorption = selectedCommitted ? p07AbsorptionGlobalTime(selectedCommitted) : null;
  const selectedGlobalCrossing = selectedCommitted && selectedCrossing
    ? selectedCommitted.runtime.launchTimeSec + selectedCrossing.localTimeS
    : null;
  const questionCount = questionsForModel('p07').length;
  const selectorMatches = selectedSolution?.selectorMatch?.matched ?? false;
  const selectedEvents = selectedSolution?.events ?? [];
  const draftPreview: P07DraftPreview | null = draft && draftSolution && draftState
    ? { particle: draft.draftParticle, solution: draftSolution, state: draftState }
    : null;

  const updateApparatus = (mutator: (current: P07Apparatus) => P07Apparatus) => {
    if (draftRef.current) setDraft(null);
    const next = mutator(sceneRef.current.field);
    const issue = validateBeamlineApparatus(next);
    if (issue) {
      showConditionNotice(`装置配置无效：${issue}`, 'recalculated');
      return;
    }
    commitScene(applySharedField(sceneRef.current, next));
    setTrailResetById({});
    clock.restart();
    showConditionNotice('公共场或器件改变，全部粒子同步重新演示 · tGlobal = 0', 'recalculated');
  };

  const patchSelectedParticle = (patch: Partial<P07ParticleDisplay>) => {
    const current = activeParticle(sceneRef.current);
    if (!current) return;
    const seed = p07SeedFromDisplay({ ...p07ParticleDisplay(current), ...patch });
    commitScene(updateParticleAndRelaunch(sceneRef.current, current.id, seed, globalTimeRef.current));
    setDraft(null);
    showConditionNotice(`${current.label} 已按新初态重新发射 · 其他粒子未重置`, 'recalculated');
  };

  const loadPreset = (id: string) => {
    const preset = P07_PRESETS[id];
    if (!preset) return;
    commitScene(preset);
    setDraft(null);
    setTrailResetById({});
    clock.restart();
    showConditionNotice('已载入 P07 可复现预设 · 全局时钟归零', 'recalculated');
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
      const display = { ...p07ParticleDisplay(previous.draftParticle), ...patch };
      return updateDraft(previous, p07SeedFromDisplay(display));
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
    if (draftRef.current) {
      setDraft(null);
      showConditionNotice('已取消未提交草稿 · 未改变任何粒子的发射时刻', 'recalculated');
    }
    commitScene(selectParticle(sceneRef.current, id));
  };
  const addNewParticle = () => {
    const base = selectedDisplay;
    if (!base) return;
    const seed = p07SeedFromDisplay({ ...base, startY: base.startY + 0.04 });
    const result = addParticle(sceneRef.current, seed, globalTimeRef.current);
    if (!result.particle) {
      showConditionNotice(`最多支持 ${MAX_PARTICLES} 个粒子`, 'recalculated');
      return;
    }
    commitScene(result.scene);
    setDraft(null);
    showConditionNotice(`已添加粒子 ${result.particle.label} · 从当前 tGlobal 发射`, 'recalculated');
  };
  const copySelectedParticle = () => {
    const current = activeParticle(sceneRef.current);
    if (!current) return;
    const result = duplicateParticle(sceneRef.current, current.id, globalTimeRef.current);
    if (!result.particle) return;
    commitScene(result.scene);
    setDraft(null);
    showConditionNotice(`已复制 ${current.label} → ${result.particle.label} · 物理初态相同`, 'recalculated');
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
    showConditionNotice(`${current.label} 已从当前 tGlobal 单独重新发射 · 其他粒子未重置`, 'recalculated');
  };
  const syncRelaunchAll = () => {
    commitScene(relaunchAll(sceneRef.current));
    setDraft(null);
    setTrailResetById({});
    clock.restart();
    showConditionNotice('全部粒子已从 tGlobal = 0 同步重新发射', 'recalculated');
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
    const blob = new Blob([serializeP07Scene(sceneRef.current)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'p07-scene.json';
    anchor.click();
    URL.revokeObjectURL(url);
    showConditionNotice('P07 场景已导出为 JSON', 'recalculated');
  };
  const importScene = async (file: File) => {
    const parsed = decodeP07SceneJson(await file.text());
    if (!parsed.scene) {
      showConditionNotice(`场景导入失败：${parsed.error ?? '格式无效'}`, 'recalculated');
      return;
    }
    commitScene(parsed.scene);
    setDraft(null);
    setTrailResetById({});
    clock.reset();
    showConditionNotice('场景已导入 · 全部粒子从 tGlobal = 0 重新呈现', 'recalculated');
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
    <div className="teacher-layer-bar" role="group" aria-label="教师视图显示图层">
      {LAYER_ITEMS.map((item) => (
        <button
          key={item.key}
          type="button"
          className="teacher-layer-chip"
          aria-pressed={layers[item.key]}
          onClick={() => setLayers((previous) => ({ ...previous, [item.key]: !layers[item.key] }))}
        >
          {item.short}
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

  const terminalRows = evaluations.map((item) => {
    const time = terminalTime(item);
    const local = terminalLocalTime(item);
    const y = terminalY(item);
    return { item, time, local, y };
  });
  const selectedTerminal = terminalRows.find((row) => row.item.particle.id === selectedCommitted?.particle.id) ?? null;
  const sameTimePositions = selectedState
    ? evaluations.map((item) => {
        const state = item.state;
        const distance = state ? Math.hypot(state.position.x - selectedState.position.x, state.position.y - selectedState.position.y) : null;
        return { item, state, distance };
      })
    : [];

  return (
    <div
      className={`sim-page ${teacher ? 'sim-teacher' : ''}`}
      data-sim-playing={clock.playing}
      data-sim-editing={draft !== null}
      data-sim-time={clock.time}
      data-particle-count={scene.particles.length}
      data-active-particle-id={scene.activeParticleId}
      data-p07-live-outcome={selectedCommitted?.liveOutcome ?? 'waiting'}
      data-p07-final-outcome={selectedSolution?.outcome ?? ''}
      data-p07-detection-y={selectedDetection?.yHit ?? ''}
      data-p07-global-hit-time={selectedGlobalHit ?? ''}
    >
      <header className="sim-header">
        <div className="sim-title-block">
          <p className="eyebrow">P07 · 模块 A · 粒子运动</p>
          <h1>多级带电粒子束线综合实验</h1>
          <p className="sim-subtitle">
            加速 → 狭缝筛选 → E+B 选速 → 磁分析 → 末段电偏转 → 屏幕探测；所有通过、吸收与命中都由真实边界事件决定。
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
          <BeamlineStage
            particles={evaluations}
            apparatus={apparatus}
            selectedId={scene.activeParticleId}
            draft={draftPreview}
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
              formula={'\\vec F=q(\\vec E+\\vec v\\times\\vec B),\\qquad R=\\frac{mv}{|qB|},\\qquad \\Delta K=q\\vec E\\cdot\\Delta\\vec r'}
              stats={[
                { label: '选中结果', value: selectedCommitted ? LIVE_OUTCOME_LABEL[selectedCommitted.liveOutcome] : '待发射' },
                { label: '最终判定', value: selectedSolution ? FINAL_OUTCOME_LABEL[selectedSolution.outcome] : '—' },
                { label: '屏幕 y', value: selectedDetection ? `${formatNumber(selectedDetection.yHit, 3)} m` : selectedCrossing ? `${formatNumber(selectedCrossing.yHit, 3)} m（越界）` : selectedAbsorption ? `吸收 ${selectedAbsorption.slitId === 'entrance' ? '入口' : '出口'}` : '—' },
                { label: '全局命中', value: selectedGlobalHit !== null ? formatTime(selectedGlobalHit) : selectedGlobalAbsorption !== null ? `吸收 ${formatTime(selectedGlobalAbsorption)}` : '—' },
              ]}
              footnote={`tGlobal = ${formatTime(clock.time)} · ${selectedLabel} τ = ${selectedTau === null ? '未发射' : formatTime(selectedTau)} · 选速 ${selectorMatches ? '匹配' : '不匹配'} · 屏幕 x=${formatLength(apparatus.screen.x)}`}
              controls={teacherControls}
              formulaVisible={formulaVisible}
            />
          ) : null}
          <PlaybackBar
            clock={clock}
            duration={duration}
            keyFrames={keyFrames}
            timeLabel={formatTime(clock.time)}
            secondaryLabel={`${selectedLabel} τ = ${selectedTau === null ? '未发射' : formatTime(selectedTau)} · ${selectedCommitted ? LIVE_OUTCOME_LABEL[selectedCommitted.liveOutcome] : '待发射'}`}
            timelineLabel="P07 全局时间轴"
            note="狭缝/吸收、屏幕命中与区段事件均为真实关键帧；单粒子编辑不暂停其他粒子。"
          />
        </div>

        {!teacher ? (
          <aside className="sim-panel" aria-label="P07 实验控制台">
            <PanelTabs<PanelTabId>
              label="P07 实验面板"
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
                      <h2>共享装置 · 独立粒子</h2>
                      <p>当前编辑 <strong>{selectedLabel}</strong>。单粒子初态改变只重发射该粒子；公共 E/B、狭缝或屏幕改变会整场重新演示。</p>
                    </div>
                  </div>

                  <div className="preset-chips" aria-label="P07 快速实验">
                    {PRESET_BUTTONS.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        className="chip-button"
                        onClick={() => loadPreset(preset.id)}
                        data-testid={`p07-preset-${preset.id}`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>

                  <section className="panel-section">
                    <h3 className="section-title">公共场强</h3>
                    <ToggleSwitch
                      label="开启入口前加速区"
                      checked={apparatus.acceleration.enabled}
                      onChange={(checked) => updateApparatus((current) => ({
                        ...current,
                        acceleration: { ...current.acceleration, enabled: checked },
                      }))}
                    />
                    {apparatus.acceleration.enabled ? (
                      <ParamSlider
                        label="加速区 E_x"
                        value={apparatus.acceleration.Ex}
                        min={-2}
                        max={2}
                        step={0.1}
                        unit="V/m"
                        decimals={1}
                        onChange={(value) => updateApparatus((current) => ({
                          ...current,
                          acceleration: { ...current.acceleration, Ex: value },
                        }))}
                        description="加速区固定在源点与入口之间；改变场强后所有粒子重算。"
                      />
                    ) : null}
                    <ParamSlider
                      label="选速器 E_y"
                      value={apparatus.selector.Ey}
                      min={-4}
                      max={4}
                      step={0.1}
                      unit="V/m"
                      decimals={1}
                      onChange={(value) => updateApparatus((current) => ({
                        ...current,
                        selector: { ...current.selector, Ey: value },
                      }))}
                    />
                    <ParamSlider
                      label="选速器 B_z"
                      value={apparatus.selector.Bz}
                      min={-3}
                      max={3}
                      step={0.1}
                      unit="T"
                      decimals={2}
                      onChange={(value) => updateApparatus((current) => ({
                        ...current,
                        selector: { ...current.selector, Bz: value },
                      }))}
                      description="正值出纸面 ⊙，负值入纸面 ×；|E_y|/|B_z| 是选速中心速度。"
                    />
                    <ParamSlider
                      label="磁分析区 B_z"
                      value={apparatus.analyzer.Bz}
                      min={-3}
                      max={3}
                      step={0.1}
                      unit="T"
                      decimals={2}
                      onChange={(value) => updateApparatus((current) => ({
                        ...current,
                        analyzer: { ...current.analyzer, Bz: value },
                      }))}
                    />
                    <ParamSlider
                      label="末段 E_y"
                      value={apparatus.deflector.Ey}
                      min={-2}
                      max={2}
                      step={0.1}
                      unit="V/m"
                      decimals={1}
                      onChange={(value) => updateApparatus((current) => ({
                        ...current,
                        deflector: { ...current.deflector, Ey: value },
                      }))}
                    />
                  </section>

                  <section className="panel-section">
                    <h3 className="section-title">真实器件</h3>
                    <div className="two-col-params">
                      <ParamSlider
                        label="入口半宽"
                        value={apparatus.entranceSlit.halfWidth}
                        min={0.02}
                        max={0.5}
                        step={0.01}
                        unit="m"
                        decimals={2}
                        domain={PARAMETER_DOMAINS.slitHalfWidth}
                        onChange={(value) => updateApparatus((current) => ({
                          ...current,
                          entranceSlit: { ...current.entranceSlit, halfWidth: value },
                        }))}
                      />
                      <ParamSlider
                        label="出口半宽"
                        value={apparatus.exitSlit.halfWidth}
                        min={0.02}
                        max={0.5}
                        step={0.01}
                        unit="m"
                        decimals={2}
                        domain={PARAMETER_DOMAINS.slitHalfWidth}
                        onChange={(value) => updateApparatus((current) => ({
                          ...current,
                          exitSlit: { ...current.exitSlit, halfWidth: value },
                        }))}
                      />
                    </div>
                    <ParamSlider
                      label="屏幕位置 x"
                      value={apparatus.screen.x}
                      min={apparatus.deflector.x1}
                      max={9}
                      step={0.1}
                      unit="m"
                      decimals={1}
                      domain={{ min: 0, max: 1e6 }}
                      validateValue={(value) => value >= apparatus.deflector.x1
                        ? null
                        : `屏幕 x 必须位于末段电场右边界（${formatNumber(apparatus.deflector.x1, 2)} m）或其下游。`}
                      onChange={(value) => updateApparatus((current) => ({
                        ...current,
                        screen: { ...current.screen, x: value },
                      }))}
                    />
                    <div className="two-col-params">
                      <ParamSlider
                        label="屏幕 y 下限"
                        value={apparatus.screen.yMin}
                        min={-3}
                        max={2.4}
                        step={0.1}
                        unit="m"
                        decimals={1}
                        validateValue={(value) => value < apparatus.screen.yMax
                          ? null
                          : `屏幕 y 下限必须小于上限（${formatNumber(apparatus.screen.yMax, 2)} m）。`}
                        onChange={(value) => updateApparatus((current) => ({
                          ...current,
                          screen: { ...current.screen, yMin: value },
                        }))}
                      />
                      <ParamSlider
                        label="屏幕 y 上限"
                        value={apparatus.screen.yMax}
                        min={-2.4}
                        max={3}
                        step={0.1}
                        unit="m"
                        decimals={1}
                        validateValue={(value) => value > apparatus.screen.yMin
                          ? null
                          : `屏幕 y 上限必须大于下限（${formatNumber(apparatus.screen.yMin, 2)} m）。`}
                        onChange={(value) => updateApparatus((current) => ({
                          ...current,
                          screen: { ...current.screen, yMax: value },
                        }))}
                      />
                    </div>
                  </section>

                  <section className="panel-section">
                    <h3 className="section-title">区段几何</h3>
                    <ParamSlider
                      label="选速器长度"
                      value={apparatus.selector.x1 - apparatus.selector.x0}
                      min={1}
                      max={3}
                      step={0.1}
                      unit="m"
                      decimals={1}
                      domain={PARAMETER_DOMAINS.regionLength}
                      onChange={(value) => updateApparatus((current) => resizeSelector(current, value))}
                      description="出口狭缝与下游分析/偏转/屏幕随长度同步平移。"
                    />
                    <ParamSlider
                      label="磁分析区长度"
                      value={apparatus.analyzer.x1 - apparatus.analyzer.x0}
                      min={0.5}
                      max={2}
                      step={0.1}
                      unit="m"
                      decimals={1}
                      domain={PARAMETER_DOMAINS.regionLength}
                      onChange={(value) => updateApparatus((current) => resizeAnalyzer(current, value))}
                    />
                    <ParamSlider
                      label="末段电场长度"
                      value={apparatus.deflector.x1 - apparatus.deflector.x0}
                      min={1}
                      max={3}
                      step={0.1}
                      unit="m"
                      decimals={1}
                      domain={PARAMETER_DOMAINS.regionLength}
                      onChange={(value) => updateApparatus((current) => resizeDeflector(current, value))}
                    />
                  </section>

                  <section className="panel-section">
                    <h3 className="section-title">粒子 {selectedLabel} 的初态</h3>
                    <ParamSlider label="电荷量 q" value={selectedDisplay?.chargeC ?? 1} min={-2} max={2} step={0.1} unit="C" decimals={1} onChange={(value) => patchSelectedParticle({ chargeC: value })} />
                    <ParamSlider label="质量 m" value={selectedDisplay?.massKg ?? 1} min={0.2} max={3} step={0.1} unit="kg" decimals={1} onChange={(value) => patchSelectedParticle({ massKg: value })} />
                    <ParamSlider label="初速度大小 v₀" value={selectedDisplay?.speedMps ?? 2} min={0} max={6} step={0.1} unit="m/s" decimals={1} onChange={(value) => patchSelectedParticle({ speedMps: value })} />
                    <ParamSlider label="初速度方向 θ" value={selectedDisplay?.directionDeg ?? 0} min={0} max={360} step={1} unit="°" decimals={0} onChange={(value) => patchSelectedParticle({ directionDeg: value })} />
                    <div className="two-col-params">
                      <ParamSlider label="源点 x" value={selectedDisplay?.startX ?? -2} min={-6} max={0.6} step={0.1} unit="m" decimals={1} onChange={(value) => patchSelectedParticle({ startX: value })} />
                      <ParamSlider label="源点 y" value={selectedDisplay?.startY ?? 0} min={-3} max={3} step={0.1} unit="m" decimals={1} onChange={(value) => patchSelectedParticle({ startY: value })} />
                    </div>
                  </section>

                  <section className="panel-section">
                    <h3 className="section-title">显示图层</h3>
                    <div className="toggle-list">
                      {LAYER_ITEMS.map((item) => (
                        <ToggleSwitch
                          key={item.key}
                          label={item.label}
                          checked={layers[item.key]}
                          onChange={() => setLayers((previous) => ({ ...previous, [item.key]: !layers[item.key] }))}
                        />
                      ))}
                    </div>
                  </section>

                  <section className="panel-section">
                    <h3 className="section-title">场景数据</h3>
                    <div className="scene-io-row">
                      <button type="button" className="secondary-button" onClick={exportScene}><Icon name="download" size={16} />导出场景 JSON</button>
                      <button type="button" className="secondary-button" onClick={() => importRef.current?.click()}><Icon name="upload" size={16} />导入场景 JSON</button>
                      <input ref={importRef} type="file" accept="application/json,.json" hidden data-testid="p07-scene-import" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importScene(file); event.target.value = ''; }} />
                    </div>
                  </section>

                  <button
                    type="button"
                    className="secondary-button wide-button"
                    onClick={() => {
                      commitScene(P07_DEFAULT);
                      setLayers({ ...P07_LAYER_DEFAULTS });
                      setDraft(null);
                      setTrailResetById({});
                      clock.reset();
                      showConditionNotice('已恢复 P07 默认单粒子标准束线', 'recalculated');
                    }}
                  >
                    <Icon name="reset" size={17} />
                    恢复默认标准束线
                  </button>
                </div>
              ) : null}

              {tab === 'lesson' ? (
                <LessonRunner
                  steps={P07_LESSON}
                  storageKey="emplab.p07.lesson.v1"
                  overview={{
                    goals: [
                      '把加速、选速、磁偏转、电偏转和屏幕探测串成一条真实束线。',
                      '用 E+v×B=0 判断选速条件，并区分速度匹配与狭缝几何通过。',
                      '掌握磁分析区 R/T、末段抛物线、屏幕交点与总时间。',
                      '比较 1–5 粒子的真实终点与全局到达时刻，区分预测与已探测。',
                    ],
                    prerequisites: ['洛伦兹力、匀强磁场圆周运动。', '匀变速运动、动能定理与抛物线运动。', '矢量叉乘、几何交点与狭缝开口判定。'],
                    misconceptions: ['以为速度匹配就一定能通过狭缝。', '把选速器中的匹配轨迹当成圆周。', '把预测光斑当成已经测到的光斑。', '把轨迹交叉当成同一时刻相遇。'],
                  }}
                  onApplyPreset={loadPreset}
                  onGoPractice={() => setTab('practice')}
                />
              ) : null}

              {tab === 'practice' ? <PracticePanel modelId="p07" /> : null}

              {tab === 'data' ? (
                <div className="panel-section-stack">
                  <div className="panel-intro">
                    <div>
                      <h2>真实终点与到达时刻</h2>
                      <p>全局 t = {formatTime(clock.time)}；选中 {selectedLabel} 的局部 τ = {selectedTau === null ? '尚未发射' : formatTime(selectedTau)}。</p>
                      <p className="muted-text">“最终”列是解析求解结果；在事件真正发生前，舞台不会把它画成已探测光斑。</p>
                    </div>
                  </div>

                  <div className="particle-compare-table p07-compare-table" data-testid="p07-detection-table">
                    <div className="particle-compare-head">
                      <span>粒子</span><span>实时</span><span>最终</span><span>区域</span><span>终点 y</span><span>全局时刻</span><span>局部时刻</span><span>|v|</span>
                    </div>
                    {terminalRows.map((row) => {
                      const item = row.item;
                      return (
                        <button
                          key={item.particle.id}
                          type="button"
                          className={`particle-compare-row ${item.particle.id === scene.activeParticleId ? 'is-selected' : ''}`}
                          onClick={() => selectParticleById(item.particle.id)}
                          data-testid={`p07-row-${item.particle.label}`}
                          data-live-outcome={item.liveOutcome}
                          data-final-outcome={item.solution.outcome}
                          data-global-time={row.time ?? ''}
                          data-local-time={row.local ?? ''}
                          data-spot-y={row.y ?? ''}
                          data-absorption-slit={item.solution.absorption?.slitId ?? ''}
                        >
                          <span className="particle-compare-label" style={{ color: item.particle.color }}><i style={{ background: item.particle.color }} />{item.particle.label}</span>
                          <span>{LIVE_OUTCOME_LABEL[item.liveOutcome]}</span>
                          <span>{FINAL_OUTCOME_LABEL[item.solution.outcome]}</span>
                          <span>{item.state?.regionLabel ?? '待发射'}</span>
                          <span>{row.y === null ? '—' : `${formatNumber(row.y, 3)} m`}</span>
                          <span>{row.time === null ? '—' : formatTime(row.time)}</span>
                          <span>{row.local === null ? '—' : formatTime(row.local)}</span>
                          <span>{item.state ? formatNumber(item.state.speed, 2) : '—'}</span>
                        </button>
                      );
                    })}
                  </div>

                  <section className="event-section">
                    <h3 className="section-title">到达时间比较</h3>
                    <div className="particle-compare-table p07-arrival-table" data-testid="p07-arrival-table">
                      <div className="particle-compare-head">
                        <span>粒子</span><span>终点</span><span>终点 y</span><span>全局</span><span>与选中差</span>
                      </div>
                      {terminalRows.map((row) => {
                        const delta = row.time !== null && selectedTerminal?.time != null
                          ? row.time - selectedTerminal.time
                          : null;
                        return (
                          <div key={row.item.particle.id} className="particle-compare-row" data-testid={`p07-arrival-${row.item.particle.label}`} data-time={row.time ?? ''} data-delta={delta ?? ''}>
                            <span className="particle-compare-label" style={{ color: row.item.particle.color }}><i style={{ background: row.item.particle.color }} />{row.item.particle.label}</span>
                            <span>{FINAL_OUTCOME_LABEL[row.item.solution.outcome]}</span>
                            <span>{row.y === null ? '—' : `${formatNumber(row.y, 3)} m`}</span>
                            <span>{row.time === null ? '—' : formatTime(row.time)}</span>
                            <span>{delta === null ? '—' : `${delta >= 0 ? '+' : ''}${formatTime(delta)}`}</span>
                          </div>
                        );
                      })}
                    </div>
                    <p className="muted-text">只比较同一条束线中的绝对到达时刻；被吸收或未到达的粒子没有屏幕命中时刻。轨迹相交不等于同时同地。</p>
                  </section>

                  {sameTimePositions.length > 1 ? (
                    <section className="event-section">
                      <h3 className="section-title">同一 tGlobal 的真实位置</h3>
                      <div className="particle-compare-table p07-same-time-table" data-testid="p07-same-time-table">
                        <div className="particle-compare-head">
                          <span>粒子</span><span>x</span><span>y</span><span>状态</span><span>与选中距离</span>
                        </div>
                        {sameTimePositions.map(({ item, state, distance }) => (
                          <div key={item.particle.id} className="particle-compare-row" data-testid={`p07-same-time-${item.particle.label}`} data-x={state?.position.x ?? ''} data-y={state?.position.y ?? ''} data-distance={distance ?? ''}>
                            <span className="particle-compare-label" style={{ color: item.particle.color }}><i style={{ background: item.particle.color }} />{item.particle.label}</span>
                            <span>{state ? formatNumber(state.position.x, 3) : '—'}</span>
                            <span>{state ? formatNumber(state.position.y, 3) : '—'}</span>
                            <span>{LIVE_OUTCOME_LABEL[item.liveOutcome]}</span>
                            <span>{distance === null ? '—' : `${formatNumber(distance, 3)} m`}</span>
                          </div>
                        ))}
                      </div>
                    </section>
                  ) : null}

                  <ReadoutGrid
                    items={[
                      { label: '所在区域', value: selectedState?.regionLabel ?? '尚待发射', testId: 'p07-region' },
                      { label: '位置 x', value: selectedState ? `${formatNumber(selectedState.position.x, 3)} m` : '—', testId: 'p07-x' },
                      { label: '位置 y', value: selectedState ? `${formatNumber(selectedState.position.y, 3)} m` : '—', testId: 'p07-y' },
                      { label: '速度大小', value: selectedState ? `${formatNumber(selectedState.speed, 3)} m/s` : '—', testId: 'p07-speed' },
                      { label: '动能 K', value: selectedState ? `${formatNumber(selectedState.kineticEnergyJ, 3)} J` : '—', testId: 'p07-kinetic' },
                      { label: '电场做功 W_E', value: selectedState ? `${formatNumber(selectedState.workJ, 3)} J` : '—', testId: 'p07-work' },
                      { label: '能量残差', value: selectedState ? `${formatNumber(selectedState.energyResidualJ, 3)} J` : '—', testId: 'p07-energy-residual' },
                      { label: '选速条件', value: selectorMatches ? '匹配（净力为零）' : '不匹配或未进入选速器', testId: 'p07-selector' },
                      { label: '局部时间 τ', value: selectedTau === null ? '尚未发射' : formatTime(selectedTau), hint: `launchTime = ${formatTime(selectedLaunch)}`, testId: 'p07-local-time' },
                      { label: '最终判定', value: selectedSolution ? FINAL_OUTCOME_LABEL[selectedSolution.outcome] : '—', testId: 'p07-final-outcome' },
                      { label: '屏幕命中 y', value: selectedDetection ? `${formatNumber(selectedDetection.yHit, 4)} m` : '—', testId: 'p07-detection-y' },
                      { label: '全局命中时刻', value: selectedGlobalHit !== null ? formatTime(selectedGlobalHit) : '—', testId: 'p07-global-hit' },
                      { label: '屏幕越界 y', value: selectedCrossing && !selectedDetection ? `${formatNumber(selectedCrossing.yHit, 3)} m` : '—', testId: 'p07-crossing-y' },
                      { label: '屏幕越界时刻', value: selectedGlobalCrossing !== null && !selectedDetection ? formatTime(selectedGlobalCrossing) : '—', testId: 'p07-crossing-time' },
                      { label: '吸收板', value: selectedAbsorption ? `${selectedAbsorption.slitId === 'entrance' ? '入口' : '出口'} @ ${formatTime(selectedAbsorption.timeS)}` : '—', testId: 'p07-absorption' },
                      { label: '真实事件数', value: `${selectedEvents.length}`, testId: 'p07-event-count' },
                    ]}
                  />

                  <section className="event-section">
                    <h3 className="section-title">完整事件时间轴</h3>
                    {selectedEvents.length > 0 ? (
                      <div className="event-list" data-testid="p07-event-list">
                        {selectedEvents.map((event, index) => (
                          <button
                            key={`${event.timeS}-${event.kind}-${index}`}
                            type="button"
                            className="event-item"
                            onClick={() => clock.setTime(selectedLaunch + event.timeS)}
                            data-testid={`p07-event-${index}`}
                          >
                            <span className="event-time">{formatTime(event.timeS)}</span>
                            <span className="event-label">{event.explanation}</span>
                            <span className="event-value">{event.regionBefore} → {event.regionAfter} · {event.objectIds.join(', ')}</span>
                          </button>
                        ))}
                      </div>
                    ) : <p className="muted-text">当前束线没有可记录的真实事件。</p>}
                  </section>

                  <section className="formula-card">
                    <p className="eyebrow">公式与代值</p>
                    <MathTex block>{'\\vec F=q(\\vec E+\\vec v\\times\\vec B),\\qquad \\vec v_d=\\left(\\frac{E_y}{B_z},0\\right)'}</MathTex>
                    <MathTex block>{'R=\\frac{mv}{|qB|},\\qquad y=y_0+v_{y0}t+\\frac{qE_y}{2m}t^2'}</MathTex>
                    <p>选速器要求净力为零；通过狭缝还要求位置落在开口内。磁分析区速率不变，末段电场按抛物线改变 y 分量与动能。</p>
                    <p className="formula-result">
                      当前 E_y={formatNumber(apparatus.selector.Ey, 2)} V/m，B_z={formatNumber(apparatus.selector.Bz, 2)} T，v_d={apparatus.selector.Bz === 0 ? '—' : `${formatNumber(apparatus.selector.Ey / apparatus.selector.Bz, 3)} m/s`}；屏幕 x={formatLength(apparatus.screen.x)}。
                    </p>
                  </section>

                  <div className="callout callout-note">
                    <Icon name="info" size={18} />
                    <div>
                      <strong>模型边界</strong>
                      <p>首版 P07 使用二维 x–y 运动、竖直分区和理想零厚度薄板；不模拟衍射、粒子碰撞、空间电荷、时变场、边缘场、探测器噪声或相对论修正。</p>
                      <p>“最终”列是解析预测；只有真实 screen-hit 事件才产生已探测光斑。屏幕范围外的真实交点显示 screen-outside，不冒充命中。</p>
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

