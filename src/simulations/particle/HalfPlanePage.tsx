import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  sampleHalfPlaneTrajectory,
} from '../../physics/particles/halfPlane';
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
import {
  formatForce,
  formatLength,
  formatNumber,
  formatTime,
} from '../../lib/format';
import { P03_LESSON } from '../../content/lessons';
import {
  P03_DEFAULT,
  P03_MULTI_PRESETS,
  P03_PRESETS,
  P03_SCENE_STORAGE_KEY,
  decodeP03SceneJson,
  loadInitialP03Scene,
  p03GlobalDuration,
  p03ParticleDisplay,
  p03SceneFromPreset,
  p03SeedFromDisplay,
  p03SolutionFor,
  parseP03StoredScene,
  serializeP03Scene,
  toP03StoredScene,
  type P03Field,
  type P03ParticleParams,
  type P03Scene,
} from './p03Scene';
import {
  HalfPlaneStage,
  P03_DEFAULT_LAYERS,
  P03_STATUS_LABEL,
  type P03ConditionNotice,
  type P03EvaluatedParticle,
  type P03Layers,
} from './HalfPlaneStage';
import { ParticleRoster, type RosterParticle } from './ParticleRoster';
import { PlaybackBar, type KeyFrame } from '../../components/PlaybackBar';
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
type ConditionNotice = P03ConditionNotice;

const LAYER_ITEMS: Array<{ key: keyof P03Layers; short: string; label: string }> = [
  { key: 'predicted', short: '预测', label: '完整预测轨迹' },
  { key: 'trail', short: '已走', label: '已走轨迹' },
  { key: 'center', short: '圆心', label: '圆心' },
  { key: 'radii', short: '半径', label: '两条半径' },
  { key: 'chord', short: '弦/垂线', label: '弦与边界垂线' },
  { key: 'angle', short: '圆心角', label: '圆心角' },
  { key: 'vectors', short: '速度', label: '速度切线' },
  { key: 'force', short: '力', label: '洛伦兹力' },
  { key: 'allAux', short: '全部圆心', label: '所有粒子的圆心' },
  { key: 'allVectors', short: '全部矢量', label: '所有粒子的速度与力' },
  { key: 'field', short: '场区', label: '磁场区域与符号' },
  { key: 'markers', short: '点标记', label: '入射 / 出射 / 相切点' },
];

function pointLabel(point: { x: number; y: number } | null): string {
  if (!point) return '—';
  const snap = (value: number) => (Math.abs(value) < 1e-9 ? 0 : value);
  return `(${formatLength(snap(point.x))}, ${formatLength(snap(point.y))})`;
}

function timeLabel(value: number | null): string {
  return value === null ? '—' : formatTime(value);
}

function phaseLabel(region: 'inside' | 'outside' | 'boundary'): string {
  if (region === 'inside') return '场内';
  if (region === 'boundary') return '边界上';
  return '场外';
}

function uniqueFrames(frames: KeyFrame[]): KeyFrame[] {
  const map = new Map<number, KeyFrame>();
  for (const frame of frames) {
    const key = Math.round(frame.time * 1e9) / 1e9;
    if (!map.has(key)) map.set(key, frame);
  }
  return [...map.values()].sort((a, b) => a.time - b.time);
}

export function HalfPlanePage() {
  const initialScene = useMemo(() => loadInitialP03Scene(), []);
  const initialStored = useMemo(() => toP03StoredScene(initialScene), [initialScene]);
  const [storedScene, setStoredScene] = usePersistentState<unknown>(P03_SCENE_STORAGE_KEY, initialStored);
  const scene = useMemo(
    () => parseP03StoredScene(storedScene).scene ?? initialScene,
    [initialScene, storedScene],
  );
  const [storedLayers, setLayers] = usePersistentState<P03Layers>(
    'emplab.p03.layers.v1',
    P03_DEFAULT_LAYERS,
  );
  const layers = useMemo(() => ({ ...P03_DEFAULT_LAYERS, ...storedLayers }), [storedLayers]);
  const [mode, setMode] = usePersistentState<LearningMode>('emplab.p03.mode.v1', 'guided');
  const [teacher, setTeacher] = useState(false);
  const [formulaVisible, setFormulaVisible] = useState(true);
  const [stageMode, setStageMode] = useState<StageMode>('interact');
  const [tab, setTab] = useState<PanelTabId>(mode === 'guided' ? 'lesson' : 'params');
  const [draft, setDraft] = useState<ParticleDraft | null>(null);
  const [fieldDraft, setFieldDraft] = useState<P03Field | null>(null);
  const [conditionNotice, setConditionNotice] = useState<ConditionNotice | null>(null);
  const [trailResetById, setTrailResetById] = useState<Record<string, number>>({});
  const [searchParams] = useSearchParams();
  const presetId = searchParams.get('preset');
  const normalizedOnMount = useRef(false);
  const noticeTimer = useRef<number | null>(null);
  const importRef = useRef<HTMLInputElement | null>(null);
  const sceneRef = useRef(scene);
  const draftRef = useRef(draft);
  const fieldDraftRef = useRef(fieldDraft);
  const globalTimeRef = useRef(0);
  const wasPlayingBeforeFieldEdit = useRef(false);
  sceneRef.current = scene;
  draftRef.current = draft;
  fieldDraftRef.current = fieldDraft;

  const commitScene = useCallback(
    (next: P03Scene) => setStoredScene(toP03StoredScene(next)),
    [setStoredScene],
  );

  useEffect(() => {
    if (normalizedOnMount.current) return;
    normalizedOnMount.current = true;
    if (scene.particles.some((particle) => (scene.runtimeById[particle.id]?.launchTimeSec ?? 0) > 0)) {
      commitScene(relaunchAll(scene));
    }
  }, [commitScene, scene]);

  const effectiveField = fieldDraft ?? scene.field;
  const evaluationsBase = useMemo(
    () =>
      scene.particles.map((particle) => ({
        particle,
        solution: p03SolutionFor(effectiveField, particle),
        runtime: scene.runtimeById[particle.id] ?? { launchTimeSec: 0 },
      })),
    [effectiveField, scene.particles, scene.runtimeById],
  );
  const duration = useMemo(
    () => p03GlobalDuration({ ...scene, field: effectiveField }),
    [effectiveField, scene],
  );
  const keyFrames = useMemo(() => {
    const frames: KeyFrame[] = [{ time: 0, label: '全局起点' }];
    for (const item of evaluationsBase) {
      const launch = item.runtime.launchTimeSec;
      if (item.solution.entryTimeS !== null) frames.push({ time: launch + item.solution.entryTimeS, label: `${item.particle.label} 入场` });
      if (item.solution.exitTimeS !== null) frames.push({ time: launch + item.solution.exitTimeS, label: `${item.particle.label} 出场` });
      if (item.solution.tangent?.timeS !== null && item.solution.tangent?.timeS !== undefined) {
        frames.push({ time: launch + item.solution.tangent.timeS, label: `${item.particle.label} 相切` });
      }
      frames.push({ time: launch + item.solution.durationS, label: `${item.particle.label} 结束` });
    }
    frames.push({ time: duration, label: '全局结束' });
    return uniqueFrames(frames.filter((frame) => frame.time >= 0 && frame.time <= duration + 1e-12));
  }, [duration, evaluationsBase]);
  const clock = usePlaybackClock(duration, keyFrames.map((frame) => frame.time));
  globalTimeRef.current = clock.time;

  const evaluations = useMemo<P03EvaluatedParticle[]>(
    () =>
      evaluationsBase.map((item) => {
        const tau = particleTau(item.runtime, clock.time);
        return {
          ...item,
          state: tau === null ? null : sampleHalfPlaneTrajectory(item.solution, tau),
        };
      }),
    [clock.time, evaluationsBase],
  );
  const selectedCommitted = evaluations.find((item) => item.particle.id === scene.activeParticleId) ?? evaluations[0] ?? null;
  const selectedParticle = draft?.draftParticle ?? selectedCommitted?.particle ?? null;
  const selectedDisplay = selectedParticle ? p03ParticleDisplay(selectedParticle) : null;
  const draftSolution = useMemo(
    () => (draft ? p03SolutionFor(effectiveField, draft.draftParticle) : null),
    [draft, effectiveField],
  );
  const selectedSolution = draftSolution ?? selectedCommitted?.solution ?? null;
  const selectedState = draft && draftSolution
    ? sampleHalfPlaneTrajectory(draftSolution, 0)
    : selectedCommitted?.state ?? null;
  const selectedTau = draft ? 0 : selectedCommitted?.state?.timeS ?? null;
  const selectedLaunch = selectedCommitted?.runtime.launchTimeSec ?? 0;
  const selectedLabel = selectedParticle?.label ?? 'A';
  const questionCount = questionsForModel('p03').length;
  const fieldEditing = fieldDraft !== null;

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
  useEffect(
    () => () => {
      if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
    },
    [],
  );

  useEffect(() => {
    if (!presetId) return;
    const multi = P03_MULTI_PRESETS[presetId];
    const single = P03_PRESETS[presetId];
    const presetScene = multi ?? (single ? p03SceneFromPreset(single) : null);
    if (!presetScene) return;
    commitScene(presetScene);
    setDraft(null);
    setFieldDraft(null);
    setTrailResetById({});
    clock.restart();
    showConditionNotice(
      multi ? '已载入多粒子对比预设 · 全局时钟归零' : '已载入单粒子题目预设 · 场景替换为 A · 全局时钟归零',
      'recalculated',
    );
  }, [clock.restart, commitScene, presetId, showConditionNotice]);

  useEffect(() => {
    setTab(mode === 'guided' ? 'lesson' : 'params');
    setTeacher(false);
  }, [mode]);

  const patchSelectedParticle = (patch: Partial<P03ParticleParams>) => {
    const current = activeParticle(sceneRef.current);
    if (!current) return;
    const display = { ...p03ParticleDisplay(current), ...patch };
    const seed = p03SeedFromDisplay(display);
    commitScene(updateParticleAndRelaunch(sceneRef.current, current.id, seed, globalTimeRef.current));
    setDraft(null);
    showConditionNotice(`${current.label} 已按新初态重新发射 · 其他粒子未重置`, 'recalculated');
  };

  const patchField = (patch: Partial<P03Field>) => {
    commitScene(applySharedField(sceneRef.current, { ...sceneRef.current.field, ...patch }));
    setDraft(null);
    setFieldDraft(null);
    setTrailResetById({});
    clock.restart();
    showConditionNotice('场条件改变，全部粒子同步重新演示 · tGlobal = 0', 'recalculated');
  };

  const loadScenePreset = (preset: typeof P03_DEFAULT) => {
    commitScene(p03SceneFromPreset(preset));
    setDraft(null);
    setFieldDraft(null);
    setTrailResetById({});
    clock.restart();
    showConditionNotice('已载入单粒子题目预设 · 场景替换为 A · 全局时钟归零', 'recalculated');
  };

  const applyLessonPreset = (id: string) => {
    const preset = P03_PRESETS[id];
    if (!preset) return;
    loadScenePreset(preset);
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
      const display = { ...p03ParticleDisplay(previous.draftParticle), ...patch };
      return updateDraft(previous, p03SeedFromDisplay(display));
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

  const beginFieldEdit = () => {
    if (draftRef.current) setDraft(null);
    wasPlayingBeforeFieldEdit.current = clock.playing;
    setFieldDraft({ ...sceneRef.current.field });
    clock.pause();
    showConditionNotice('公共场预览中 · 全局时钟暂停 · 所有粒子按新边界重算', 'preview', true);
  };
  const changeFieldEdit = (boundaryX: number) => {
    setFieldDraft((previous) => (previous ? { ...previous, boundaryX } : previous));
  };
  const commitFieldEdit = () => {
    const current = fieldDraftRef.current;
    if (!current) return;
    commitScene(applySharedField(sceneRef.current, current));
    setFieldDraft(null);
    setTrailResetById({});
    clock.restart();
    if (wasPlayingBeforeFieldEdit.current) clock.play();
    showConditionNotice('场条件改变，全部粒子同步重新演示 · tGlobal = 0', 'recalculated');
  };
  const cancelFieldEdit = () => {
    if (!fieldDraftRef.current) return;
    setFieldDraft(null);
    if (wasPlayingBeforeFieldEdit.current) clock.play();
    showConditionNotice('已取消公共场预览 · 场与粒子保持原状', 'recalculated');
  };

  const addNewParticle = () => {
    const base = selectedDisplay;
    if (!base) return;
    const seed = p03SeedFromDisplay({ ...base, startY: Math.max(-0.5, Math.min(0.5, base.startY + 0.04)) });
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
    setFieldDraft(null);
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
    const blob = new Blob([serializeP03Scene(sceneRef.current)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'p03-scene.json';
    anchor.click();
    URL.revokeObjectURL(url);
    showConditionNotice('P03 场景已导出为 JSON', 'recalculated');
  };
  const importScene = async (file: File) => {
    const parsed = decodeP03SceneJson(await file.text());
    if (!parsed.scene) {
      showConditionNotice(`场景导入失败：${parsed.error ?? '格式无效'}`, 'recalculated');
      return;
    }
    commitScene(parsed.scene);
    setDraft(null);
    setFieldDraft(null);
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

  return (
    <div
      className={`sim-page ${teacher ? 'sim-teacher' : ''}`}
      data-sim-playing={clock.playing}
      data-sim-editing={draft !== null || fieldEditing}
      data-sim-time={clock.time}
      data-particle-count={scene.particles.length}
      data-active-particle-id={scene.activeParticleId}
    >
      <header className="sim-header">
        <div className="sim-title-block">
          <p className="eyebrow">P03 · 模块 A · 粒子运动</p>
          <h1>直线边界半平面有界磁场的多粒子运动</h1>
          <p className="sim-subtitle">
            同一共享半平面磁场中比较 1–5 个粒子；播放中只编辑选中粒子，其他粒子的入场、出场与运动继续。
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
          <button type="button" className={`tool-button ${teacher ? 'is-active' : ''}`} onClick={() => setTeacher((value) => !value)} aria-pressed={teacher}>
            <Icon name="target" size={17} />
            {teacher ? '退出教师视图' : '教师视图'}
          </button>
        </div>
      </header>

      <div className={`sim-layout ${teacher ? 'sim-layout-teacher' : ''}`}>
        <div className="sim-stage-column">
          <HalfPlaneStage
            particles={evaluations}
            field={effectiveField}
            selectedId={scene.activeParticleId}
            draft={draft && draftSolution ? { particle: draft.draftParticle, solution: draftSolution, state: sampleHalfPlaneTrajectory(draftSolution, 0) } : null}
            layers={layers}
            stageMode={stageMode}
            fieldEditing={fieldEditing}
            onStageModeChange={setStageMode}
            onSelectParticle={selectParticleById}
            onDraftStart={beginDraft}
            onDraftChange={changeDraft}
            onDraftEnd={endDraft}
            onDraftCancel={cancelDraft}
            onFieldEditStart={beginFieldEdit}
            onFieldEditChange={changeFieldEdit}
            onFieldEditEnd={commitFieldEdit}
            onFieldEditCancel={cancelFieldEdit}
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
              formula={'R=\\frac{mv}{|qB|},\\qquad T=\\frac{2\\pi m}{|qB|},\\qquad t_{\\text{field}}=\\frac{\\Delta\\varphi}{|\\omega|}'}
              stats={[
                { label: '粒子数', value: `${scene.particles.length}/5` },
                { label: `状态 ${selectedLabel}`, value: P03_STATUS_LABEL[selectedSolution?.status ?? 'invalid'] },
                { label: `R ${selectedLabel}`, value: selectedSolution?.magneticRadiusM ? formatLength(selectedSolution.magneticRadiusM) : '—' },
                { label: `τ ${selectedLabel}`, value: selectedTau === null ? '未发射' : formatTime(selectedTau) },
              ]}
              footnote={`tGlobal = ${formatTime(clock.time)} · ${selectedLabel} τ = ${selectedTau === null ? '未发射' : formatTime(selectedTau)} · ${P03_STATUS_LABEL[selectedSolution?.status ?? 'invalid']}`}
              controls={teacherControls}
              formulaVisible={formulaVisible}
            />
          ) : null}
          <PlaybackBar
            clock={clock}
            duration={duration}
            keyFrames={keyFrames}
            timeLabel={formatTime(clock.time)}
            secondaryLabel={`${selectedLabel} τ = ${selectedTau === null ? '未发射' : formatTime(selectedTau)} · ${P03_STATUS_LABEL[selectedSolution?.status ?? 'invalid']}`}
            timelineLabel="多粒子全局时间轴"
            note="1× 用约 8 秒演示全局时间轴；仅编辑当前粒子不暂停全局时钟。改变共享边界或 B 才同步重算全部粒子。"
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
                      <h2>共享场 · 独立初态</h2>
                      <p>当前编辑粒子 <strong>{selectedLabel}</strong>。单粒子参数只重发射它；B 或边界变化会让所有粒子同步重新演示。</p>
                    </div>
                  </div>

                  <div className="preset-chips" aria-label="快速实验">
                    <button type="button" className="chip-button" onClick={() => loadScenePreset(P03_DEFAULT)}>单粒子默认</button>
                    <button type="button" className="chip-button" onClick={() => patchSelectedParticle({ speedUnits: Math.min(5, (selectedDisplay?.speedUnits ?? 2) * 2) })}>{selectedLabel} 速度 ×2</button>
                    <button type="button" className="chip-button" onClick={() => patchSelectedParticle({ chargeSign: (selectedDisplay?.chargeSign ?? 1) === 1 ? -1 : 1 })}>{selectedLabel} 切换电荷</button>
                    <button type="button" className="chip-button" onClick={() => patchField({ fieldMag: Math.min(1.5, scene.field.fieldMag + 0.25) })}>B 增大（全场）</button>
                    <button type="button" className="chip-button" onClick={() => patchField({ fieldDir: scene.field.fieldDir === 1 ? -1 : 1 })}>B 反向（全场）</button>
                  </div>

                  <section className="panel-section">
                    <h3 className="section-title">共享磁场与边界</h3>
                    <div className="field-label-row">
                      <div>
                        <span className="field-label">磁场方向</span>
                        <p className="field-hint">修改会重算全部粒子</p>
                      </div>
                      <Segmented
                        ariaLabel="磁场方向"
                        size="sm"
                        value={scene.field.fieldDir}
                        onChange={(value) => patchField({ fieldDir: value === 1 ? 1 : -1 })}
                        options={[
                          { value: 1, label: '⊙ 出纸面' },
                          { value: -1, label: '× 入纸面' },
                        ]}
                      />
                    </div>
                    <ParamSlider label="磁感应强度 |B|" value={scene.field.fieldMag} min={0} max={1.5} step={0.05} unit="T" decimals={2} onChange={(value) => patchField({ fieldMag: value })} />
                    <ParamSlider label="共享磁场边界 x" value={scene.field.boundaryX * 100} min={-30} max={30} step={0.5} unit="cm" decimals={1} onChange={(value) => patchField({ boundaryX: value / 100 })} description="拖动舞台上的边界把手会先进入全场预览；此滑块直接提交并同步重放。" />
                  </section>

                  <section className="panel-section">
                    <h3 className="section-title">粒子 {selectedLabel} 的初态</h3>
                    <div className="field-label-row">
                      <div>
                        <span className="field-label">电荷符号</span>
                        <p className="field-hint">只影响 {selectedLabel}</p>
                      </div>
                      <Segmented
                        ariaLabel="选中粒子电荷符号"
                        size="sm"
                        value={selectedDisplay?.chargeSign ?? 1}
                        onChange={(value) => patchSelectedParticle({ chargeSign: value === 1 ? 1 : -1 })}
                        options={[
                          { value: 1, label: '+ 正电荷' },
                          { value: -1, label: '− 负电荷' },
                        ]}
                      />
                    </div>
                    <ParamSlider label="电荷量 |q|" value={selectedDisplay?.chargeMag ?? 1} min={0} max={3} step={0.1} unit="e" decimals={1} onChange={(value) => patchSelectedParticle({ chargeMag: value })} />
                    <ParamSlider label="质量 m" value={selectedDisplay?.massUnits ?? 1} min={0.1} max={5} step={0.01} unit="×10⁻²⁶ kg" decimals={2} onChange={(value) => patchSelectedParticle({ massUnits: value })} />
                    <ParamSlider label="速度大小 v" value={selectedDisplay?.speedUnits ?? 2} min={0} max={5} step={0.1} unit="×10⁶ m/s" decimals={1} onChange={(value) => patchSelectedParticle({ speedUnits: value })} />
                    <ParamSlider label="速度方向 θ" value={selectedDisplay?.directionDeg ?? 0} min={0} max={360} step={1} unit="°" decimals={0} onChange={(value) => patchSelectedParticle({ directionDeg: value })} />
                    <div className="two-col-params">
                      <ParamSlider label="发射点 x" value={(selectedDisplay?.startX ?? 0) * 100} min={-60} max={60} step={0.5} unit="cm" decimals={1} onChange={(value) => patchSelectedParticle({ startX: value / 100 })} />
                      <ParamSlider label="发射点 y" value={(selectedDisplay?.startY ?? 0) * 100} min={-50} max={50} step={0.5} unit="cm" decimals={1} onChange={(value) => patchSelectedParticle({ startY: value / 100 })} />
                    </div>
                  </section>

                  <section className="panel-section">
                    <h3 className="section-title">显示图层</h3>
                    <div className="toggle-list">
                      {LAYER_ITEMS.map((item) => (
                        <ToggleSwitch key={item.key} label={item.label} checked={layers[item.key]} onChange={() => setLayers((previous) => ({ ...previous, [item.key]: !layers[item.key] }))} />
                      ))}
                    </div>
                  </section>

                  <section className="panel-section">
                    <h3 className="section-title">场景数据</h3>
                    <div className="scene-io-row">
                      <button type="button" className="secondary-button" onClick={exportScene}>
                        <Icon name="download" size={16} />
                        导出场景 JSON
                      </button>
                      <button type="button" className="secondary-button" onClick={() => importRef.current?.click()}>
                        <Icon name="upload" size={16} />
                        导入场景 JSON
                      </button>
                      <input ref={importRef} type="file" accept="application/json,.json" hidden data-testid="p03-scene-import" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importScene(file); event.target.value = ''; }} />
                    </div>
                  </section>

                  <button
                    type="button"
                    className="secondary-button wide-button"
                    onClick={() => {
                      commitScene(p03SceneFromPreset(P03_DEFAULT));
                      setLayers({ ...P03_DEFAULT_LAYERS });
                      setDraft(null);
                      setFieldDraft(null);
                      setTrailResetById({});
                      clock.reset();
                      showConditionNotice('已恢复单粒子默认场景与图层', 'recalculated');
                    }}
                  >
                    <Icon name="reset" size={17} />
                    恢复默认单粒子场景
                  </button>
                </div>
              ) : null}

              {tab === 'lesson' ? (
                <LessonRunner
                  steps={P03_LESSON}
                  storageKey="emplab.p03.lesson.v1"
                  overview={{
                    goals: [
                      '判断场外射线是否真正与边界相交并入场。',
                      '从入射速度求圆心、半径、真实出射点、圆心角与场内时间。',
                      '在同一舞台比较正常出场、相切无出场和无入场粒子，并区分全局/局部时间。',
                    ],
                    prerequisites: ['洛伦兹力方向与匀速圆周运动。', '直线与圆的交点、速度分解与角速度。', '共享场与独立初态的区别。'],
                    misconceptions: ['只要速度不指向场心就认为不能入场。', '把所有边界交点都当成出射点。', '编辑一个粒子会让其他粒子重新发射。'],
                  }}
                  onApplyPreset={applyLessonPreset}
                  onGoPractice={() => setTab('practice')}
                />
              ) : null}

              {tab === 'practice' ? <PracticePanel modelId="p03" /> : null}

              {tab === 'data' ? (
                <div className="panel-section-stack">
                  <div className="panel-intro">
                    <div>
                      <h2>多粒子事件比较</h2>
                      <p>全局 t = {formatTime(clock.time)}；选中 {selectedLabel} 的局部 τ = {selectedTau === null ? '尚未发射' : formatTime(selectedTau)}。</p>
                    </div>
                  </div>

                  <div className="particle-compare-table p03-compare-table" data-testid="p03-compare">
                    <div className="particle-compare-head">
                      <span>粒子</span>
                      <span>状态</span>
                      <span>R</span>
                      <span>场内时间</span>
                      <span>出射 y</span>
                      <span>τ</span>
                    </div>
                    {evaluations.map((item) => (
                      <button key={item.particle.id} type="button" className={`particle-compare-row ${item.particle.id === scene.activeParticleId ? 'is-selected' : ''}`} onClick={() => selectParticleById(item.particle.id)} data-testid={`p03-compare-row-${item.particle.label}`}>
                        <span className="particle-compare-label" style={{ color: item.particle.color }}><i style={{ background: item.particle.color }} />{item.particle.label}</span>
                        <span>{P03_STATUS_LABEL[item.solution.status]}</span>
                        <span>{item.solution.magneticRadiusM ? formatLength(item.solution.magneticRadiusM) : '—'}</span>
                        <span>{timeLabel(item.solution.fieldTimeS)}</span>
                        <span>{item.solution.exit?.position ? formatLength(item.solution.exit.position.y) : '—'}</span>
                        <span>{item.state ? formatTime(item.state.timeS) : '待发射'}</span>
                      </button>
                    ))}
                  </div>

                  <ReadoutGrid
                    items={[
                      { label: '状态', value: P03_STATUS_LABEL[selectedSolution?.status ?? 'invalid'], hint: `${selectedLabel} 独立事件状态`, testId: 'p03-status' },
                      { label: '轨道半径 R', value: selectedSolution?.magneticRadiusM ? formatLength(selectedSolution.magneticRadiusM) : '—', hint: 'R = m|v| / (|qB|)', testId: 'p03-radius' },
                      { label: '周期 T', value: selectedSolution?.magneticPeriodS ? formatTime(selectedSolution.magneticPeriodS) : '—', hint: 'T = 2πm / (|qB|)', testId: 'p03-period' },
                      { label: '转向', value: selectedSolution?.turn === 'counterclockwise' ? '逆时针' : selectedSolution?.turn === 'clockwise' ? '顺时针' : '—', hint: 'ω = −qBz / m', testId: 'p03-turn' },
                      { label: '入场时间', value: timeLabel(selectedSolution?.entryTimeS ?? null), testId: 'p03-entry-time' },
                      { label: '出场时间', value: timeLabel(selectedSolution?.exitTimeS ?? null), testId: 'p03-exit-time' },
                      { label: '场内时间', value: timeLabel(selectedSolution?.fieldTimeS ?? null), testId: 'p03-field-time' },
                      { label: '偏转角', value: selectedSolution?.deflectionDegrees === null || selectedSolution?.deflectionDegrees === undefined ? '—' : `${formatNumber(selectedSolution.deflectionDegrees, 1)}°`, testId: 'p03-deflection' },
                      { label: '发射点', value: pointLabel(selectedSolution?.launchPoint ?? null), testId: 'p03-start-point' },
                      { label: '入射点', value: pointLabel(selectedSolution?.entry?.position ?? null), testId: 'p03-entry-point' },
                      { label: '出射点', value: pointLabel(selectedSolution?.exit?.position ?? null), testId: 'p03-exit-point' },
                      { label: '圆心', value: pointLabel(selectedSolution?.circle?.center ?? null), testId: 'p03-center' },
                      { label: '当前位置区域', value: selectedState ? phaseLabel(selectedState.region) : '未发射', hint: selectedState ? `当前洛伦兹力 ${formatForce(Math.hypot(selectedState.force.x, selectedState.force.y))}` : '等待 launchTime', testId: 'p03-region' },
                      { label: '当前速度', value: selectedState ? `${formatNumber(Math.hypot(selectedState.velocity.x, selectedState.velocity.y) / 1e6, 2)} × 10⁶ m/s` : '未发射', testId: 'p03-velocity' },
                      { label: '共享边界位置', value: formatLength(effectiveField.boundaryX), hint: '场区在边界右侧', testId: 'p03-boundary' },
                      { label: '局部时间 τ', value: selectedTau === null ? '尚未发射' : formatTime(selectedTau), hint: `launchTime = ${formatTime(selectedLaunch)}`, testId: 'p03-local-time' },
                    ]}
                  />

                  <div className="callout callout-note">
                    <Icon name="info" size={18} />
                    <div>
                      <strong>{P03_STATUS_LABEL[selectedSolution?.status ?? 'invalid']}</strong>
                      <p>{selectedSolution?.statusExplanation}</p>
                      {selectedSolution?.issue ? <p>{selectedSolution.issue}</p> : null}
                    </div>
                  </div>

                  <section className="formula-card">
                    <p className="eyebrow">公式与代值</p>
                    <MathTex block>{'R=\\frac{m|\\vec v|}{|qB_z|},\\qquad T=\\frac{2\\pi m}{|qB_z|},\\qquad t_{\\text{field}}=\\frac{\\Delta\\varphi}{|\\omega|}'}</MathTex>
                    <p>{selectedLabel}: m = {formatNumber(selectedDisplay?.massUnits ?? 0, 2)}×10⁻²⁶ kg，v = {formatNumber(selectedDisplay?.speedUnits ?? 0, 2)}×10⁶ m/s，|q| = {formatNumber(selectedDisplay?.chargeMag ?? 0, 2)}e，|B| = {formatNumber(effectiveField.fieldMag, 2)} T</p>
                    <p className="formula-result">R ≈ {selectedSolution?.magneticRadiusM ? formatLength(selectedSolution.magneticRadiusM) : '—'}，T ≈ {selectedSolution?.magneticPeriodS ? formatTime(selectedSolution.magneticPeriodS) : '—'}；边界 x = {formatLength(effectiveField.boundaryX)}</p>
                  </section>

                  <div className="callout callout-note">
                    <Icon name="info" size={18} />
                    <div>
                      <strong>多粒子与公共场语义</strong>
                      <p>每个粒子独立求解场外直线、入场、圆弧、出场或相切；共享同一磁场、边界与全局时钟，忽略粒子间相互作用与碰撞。</p>
                      <p>拖动某粒子的初态只重发射它；改变 B 或边界会让全部粒子同步重新演示。相切接触不是出射，不会为某个粒子伪造出射点。</p>
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
