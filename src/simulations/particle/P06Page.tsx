import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { createCrossedFieldModel } from '../../physics/particles/crossedFields';
import { solveSegmentedTrajectory } from '../../physics/particles/segmentedFields';
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
import { formatForce, formatLength, formatNumber, formatTime } from '../../lib/format';
import { P06_LESSON } from '../../content/lessons';
import {
  P06_PRESETS,
  P06_SCENE_STORAGE_KEY,
  decodeP06SceneJson,
  loadInitialP06Scene,
  p06BuildParticle,
  p06GlobalDuration,
  p06ModeAInput,
  p06ModeBInput,
  p06ParticleDisplay,
  p06SeedFromDisplay,
  p06StateAt,
  parseP06StoredScene,
  serializeP06Scene,
  toP06StoredScene,
  type P06Field,
  type P06Mode,
  type P06ParticleDisplay,
  type P06Scene,
  type P06UnifiedState,
} from './p06Scene';
import {
  P06Stage,
  P06_DEFAULT_LAYERS as P06_LAYER_DEFAULTS,
  type P06DraftPreview,
  type P06EvaluatedParticle,
  type P06Layers,
} from './P06Stage';
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

const LAYER_ITEMS: Array<{ key: keyof P06Layers; label: string; short: string }> = [
  { key: 'predicted', label: '完整预测轨迹', short: '预测' },
  { key: 'trail', label: '已走轨迹', short: '已走' },
  { key: 'regions', label: '场区背景与边界', short: '场区' },
  { key: 'fieldE', label: '电场箭头 E', short: '电场' },
  { key: 'fieldB', label: '磁场符号 B', short: '磁场' },
  { key: 'velocity', label: '速度矢量', short: '速度' },
  { key: 'forceE', label: '电场力 F_E', short: 'F_E' },
  { key: 'forceB', label: '磁场力 F_B', short: 'F_B' },
  { key: 'resultant', label: '合力 F', short: '合力' },
  { key: 'allVectors', label: '所有粒子的矢量', short: '全部矢量' },
  { key: 'events', label: '入射/出磁/相切事件', short: '事件' },
  { key: 'aux', label: '选中粒子磁场圆心', short: '圆心' },
];

function uniqueFrames(frames: KeyFrame[]): KeyFrame[] {
  const map = new Map<number, KeyFrame>();
  for (const frame of frames) {
    const key = Math.round(frame.time * 1e9) / 1e9;
    if (!map.has(key)) map.set(key, frame);
  }
  return [...map.values()].sort((a, b) => a.time - b.time);
}

function regionLabel(region: P06UnifiedState['region']): string {
  if (region === 'free') return '自由区';
  if (region === 'electric') return '电场区';
  if (region === 'magnetic') return '磁场区';
  return '同区 E+B';
}

export function P06Page() {
  const initialScene = useMemo(() => loadInitialP06Scene(), []);
  const [storedScene, setStoredScene] = usePersistentState<unknown>(
    P06_SCENE_STORAGE_KEY,
    toP06StoredScene(initialScene),
  );
  const scene = useMemo(
    () => parseP06StoredScene(storedScene).scene ?? initialScene,
    [initialScene, storedScene],
  );
  const [storedLayers, setLayers] = usePersistentState<P06Layers>(
    'emplab.p06.layers.v1',
    P06_LAYER_DEFAULTS,
  );
  const layers = useMemo(() => ({ ...P06_LAYER_DEFAULTS, ...storedLayers }), [storedLayers]);
  const [mode, setMode] = usePersistentState<LearningMode>('emplab.p06.mode.v1', 'guided');
  const [teacher, setTeacher] = useState(false);
  const [formulaVisible, setFormulaVisible] = useState(true);
  const [stageMode, setStageMode] = useState<StageMode>('interact');
  const [tab, setTab] = useState<PanelTabId>(mode === 'guided' ? 'lesson' : 'params');
  const [draft, setDraft] = useState<ParticleDraft | null>(null);
  const [fieldDraft, setFieldDraft] = useState<P06Field | null>(null);
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
    (next: P06Scene) => setStoredScene(toP06StoredScene(next)),
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
      scene.particles.map((particle) =>
        p06BuildParticle(
          particle,
          scene.runtimeById[particle.id] ?? { launchTimeSec: 0 },
          effectiveField,
        ),
      ),
    [effectiveField, scene.particles, scene.runtimeById],
  );
  const duration = useMemo(
    () => p06GlobalDuration({ ...scene, field: effectiveField }, evaluationsBase),
    [effectiveField, evaluationsBase, scene],
  );
  const keyFrames = useMemo(() => {
    const frames: KeyFrame[] = [{ time: 0, label: '全局起点' }];
    if (effectiveField.mode === 'crossed') {
      for (let i = 1; i <= 4; i++) frames.push({ time: (duration * i) / 4, label: `${i * 25}%` });
    } else {
      for (const item of evaluationsBase) {
        const launch = item.runtime.launchTimeSec;
        for (const event of item.solutionB?.events ?? []) {
          if (event.kind === 'start' || event.timeS <= 1e-10) continue;
          frames.push({
            time: launch + event.timeS,
            label: `${item.particle.label} ${event.kind === 'crossing' ? event.toRegion === 'magnetic' ? '入磁' : event.fromRegion === 'magnetic' ? '出磁' : '跨界' : event.kind === 'turn-around' ? '折返' : event.kind === 'tangent' ? '相切' : '事件'}`,
          });
        }
      }
    }
    frames.push({ time: duration, label: '全局结束' });
    return uniqueFrames(frames.filter((frame) => frame.time >= 0 && frame.time <= duration + 1e-12));
  }, [duration, effectiveField.mode, evaluationsBase]);
  const clock = usePlaybackClock(duration, keyFrames.map((frame) => frame.time));
  globalTimeRef.current = clock.time;

  const evaluations = useMemo<P06EvaluatedParticle[]>(
    () =>
      evaluationsBase.map((item) => {
        const tau = particleTau(item.runtime, clock.time);
        return {
          ...item,
          state: tau === null ? null : p06StateAt(item, tau),
        };
      }),
    [clock.time, evaluationsBase],
  );
  const selectedCommitted = evaluations.find((item) => item.particle.id === scene.activeParticleId) ?? evaluations[0] ?? null;
  const selectedParticle = draft?.draftParticle ?? selectedCommitted?.particle ?? null;
  const selectedDisplay = selectedParticle ? p06ParticleDisplay(selectedParticle) : null;
  const draftModelA = useMemo(
    () => (draft && effectiveField.mode === 'crossed' ? createCrossedFieldModel(p06ModeAInput(effectiveField, draft.draftParticle)) : null),
    [draft, effectiveField],
  );
  const draftSolutionB = useMemo(
    () => (draft && effectiveField.mode === 'segmented' ? solveSegmentedTrajectory(p06ModeBInput(effectiveField, draft.draftParticle)) : null),
    [draft, effectiveField],
  );
  const draftState = draft
    ? p06StateAt(
        {
          particle: draft.draftParticle,
          runtime: selectedCommitted?.runtime ?? { launchTimeSec: 0 },
          modelA: draftModelA,
          solutionB: draftSolutionB,
        },
        0,
      )
    : null;
  const selectedSolutionB = draftSolutionB ?? selectedCommitted?.solutionB ?? null;
  const selectedState = draftState ?? selectedCommitted?.state ?? null;
  const selectedTau = draft ? 0 : selectedCommitted?.state?.timeS ?? null;
  const selectedLaunch = selectedCommitted?.runtime.launchTimeSec ?? 0;
  const questionCount = questionsForModel('p06').length;
  const selectedLabel = selectedParticle?.label ?? 'A';
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
  useEffect(() => () => {
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
  }, []);

  useEffect(() => {
    if (!presetId) return;
    const preset = P06_PRESETS[presetId];
    if (!preset) return;
    commitScene(preset);
    setDraft(null);
    setFieldDraft(null);
    setTrailResetById({});
    clock.restart();
    showConditionNotice('已载入 P06 可复现预设 · 全局时钟归零', 'recalculated');
  }, [clock.restart, commitScene, presetId, showConditionNotice]);

  useEffect(() => {
    setTab(mode === 'guided' ? 'lesson' : 'params');
    setTeacher(false);
  }, [mode]);

  const patchSelectedParticle = (patch: Partial<P06ParticleDisplay>) => {
    const current = activeParticle(sceneRef.current);
    if (!current) return;
    const seed = p06SeedFromDisplay({ ...p06ParticleDisplay(current), ...patch });
    commitScene(updateParticleAndRelaunch(sceneRef.current, current.id, seed, globalTimeRef.current));
    setDraft(null);
    showConditionNotice(`${current.label} 已按新初态重新发射 · 其他粒子未重置`, 'recalculated');
  };
  const patchField = (patch: Partial<P06Field>) => {
    commitScene(applySharedField(sceneRef.current, { ...sceneRef.current.field, ...patch }));
    setDraft(null);
    setFieldDraft(null);
    setTrailResetById({});
    clock.restart();
    showConditionNotice('场条件改变，所有粒子同步重新演示 · tGlobal = 0', 'recalculated');
  };
  const switchFieldMode = (nextMode: P06Mode) => {
    if (nextMode === effectiveField.mode) return;
    // The two modes use different geometries; loading the matching single-particle
    // template keeps the mode switch physically interpretable and resets the experiment.
    commitScene(P06_PRESETS[nextMode === 'crossed' ? 'p06-default' : 'p06-accelerate']);
    setDraft(null);
    setFieldDraft(null);
    setTrailResetById({});
    clock.restart();
    showConditionNotice(
      nextMode === 'crossed' ? '已切换同区 E+B：载入示例场，全部同步重演示' : '已切换 E→B 分区：载入两区示例，全部同步重演示',
      'recalculated',
    );
  };
  const loadPreset = (id: string) => {
    const preset = P06_PRESETS[id];
    if (!preset) return;
    commitScene(preset);
    setDraft(null);
    setFieldDraft(null);
    setTrailResetById({});
    clock.restart();
    showConditionNotice('已载入 P06 可复现预设 · 全局时钟归零', 'recalculated');
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
      return updateDraft(previous, p06SeedFromDisplay({ ...p06ParticleDisplay(previous.draftParticle), ...patch }));
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
  const changeFieldEdit = (dM: number) => setFieldDraft((previous) => previous ? { ...previous, dM } : previous);
  const commitFieldEdit = () => {
    const current = fieldDraftRef.current;
    if (!current) return;
    commitScene(applySharedField(sceneRef.current, current));
    setFieldDraft(null);
    setTrailResetById({});
    clock.restart();
    if (wasPlayingBeforeFieldEdit.current) clock.play();
    showConditionNotice('场条件改变，所有粒子同步重新演示 · tGlobal = 0', 'recalculated');
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
    const result = addParticle(sceneRef.current, p06SeedFromDisplay({ ...base, startY: base.startY + 0.4 }), globalTimeRef.current);
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
    const blob = new Blob([serializeP06Scene(sceneRef.current)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'p06-scene.json';
    anchor.click();
    URL.revokeObjectURL(url);
    showConditionNotice('P06 场景已导出为 JSON', 'recalculated');
  };
  const importScene = async (file: File) => {
    const parsed = decodeP06SceneJson(await file.text());
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

  const draftPreview: P06DraftPreview | null = draft && draftState
    ? { particle: draft.draftParticle, modelA: draftModelA, solutionB: draftSolutionB, state: draftState }
    : null;
  const teacherControls = (
    <div className="teacher-layer-bar" role="group" aria-label="教师视图显示图层">
      {LAYER_ITEMS.map((item) => (
        <button key={item.key} type="button" className="teacher-layer-chip" aria-pressed={layers[item.key]} onClick={() => setLayers((previous) => ({ ...previous, [item.key]: !layers[item.key] }))}>
          {item.short}
        </button>
      ))}
      <button type="button" className="teacher-layer-chip teacher-formula-toggle" aria-pressed={formulaVisible} onClick={() => setFormulaVisible((value) => !value)}>公式</button>
    </div>
  );
  const selectedEvents = selectedSolutionB?.events.filter((event) => event.kind !== 'start' && event.kind !== 'window-end') ?? [];
  const selectorMatches = selectedState?.selectorMatched ?? false;

  return (
    <div
      className={`sim-page ${teacher ? 'sim-teacher' : ''}`}
      data-sim-playing={clock.playing}
      data-sim-editing={draft !== null || fieldEditing}
      data-sim-time={clock.time}
      data-p06-mode={effectiveField.mode}
      data-particle-count={scene.particles.length}
      data-draft={draft !== null}
      data-draft-ready={draftState !== null}
    >
      <header className="sim-header">
        <div className="sim-title-block">
          <p className="eyebrow">P06 · 模块 A · 电磁复合场</p>
          <h1>{effectiveField.mode === 'crossed' ? '同区电磁叠加场' : '电场加速 → 磁场偏转'}</h1>
          <p className="sim-subtitle">
            {effectiveField.mode === 'crossed'
              ? '在同一区域叠加均匀电场与磁场，比较多粒子的偏转、能量与 E×B 速度选择条件。'
              : '自由区 → 电场区 → 磁场半平面，按解析分段与真实边界事件连续运动。'}
          </p>
        </div>
        <div className="sim-header-actions">
          <Segmented<P06Mode>
            ariaLabel="P06 实验模式"
            value={effectiveField.mode}
            onChange={switchFieldMode}
            options={[
              { value: 'crossed', label: '同区 E+B', icon: <Icon name="layers" size={17} /> },
              { value: 'segmented', label: '电场→磁场', icon: <Icon name="arrowRight" size={17} /> },
            ]}
          />
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
          <P06Stage
            particles={evaluations}
            field={effectiveField}
            selectedId={scene.activeParticleId}
            draft={draftPreview}
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
              formula={effectiveField.mode === 'crossed'
                ? 'm\\frac{d\\vec v}{dt}=q(\\vec E+\\vec v\\times\\vec B),\\qquad \\vec v_d=\\left(\\frac{E_y}{B_z},-\\frac{E_x}{B_z}\\right)'
                : '\\Delta K_{E}=q\\vec E\\cdot\\Delta\\vec r,\\qquad R=\\frac{mv}{|qB|}'}
              stats={[
                { label: '模式', value: effectiveField.mode === 'crossed' ? '同区 E+B' : 'E→B 分区' },
                { label: `区域 ${selectedLabel}`, value: selectedState ? regionLabel(selectedState.region) : '待发射' },
                { label: `|v| ${selectedLabel}`, value: selectedState ? `${formatNumber(selectedState.speed, 3)} m/s` : '—' },
                { label: `K ${selectedLabel}`, value: selectedState ? `${formatNumber(selectedState.kineticEnergyJ, 3)} J` : '—' },
              ]}
              footnote={`tGlobal = ${formatTime(clock.time)} · ${selectedLabel} τ = ${selectedTau === null ? '未发射' : formatTime(selectedTau)} · ${effectiveField.mode === 'crossed' ? `E=(${formatNumber(effectiveField.Ex, 2)}, ${formatNumber(effectiveField.Ey, 2)}) V/m` : `d = ${formatLength(effectiveField.dM)}`}`}
              controls={teacherControls}
              formulaVisible={formulaVisible}
            />
          ) : null}
          <PlaybackBar
            clock={clock}
            duration={duration}
            keyFrames={keyFrames}
            timeLabel={formatTime(clock.time)}
            secondaryLabel={`${selectedLabel} τ = ${selectedTau === null ? '未发射' : formatTime(selectedTau)} · ${selectedState ? regionLabel(selectedState.region) : '待发射'}`}
            timelineLabel="P06 全局时间轴"
            note={effectiveField.mode === 'crossed'
              ? '1× 用约 8 秒演示同区 E+B 时间窗；单粒子编辑不暂停其他粒子。'
              : '1× 演示分段解析结果；入磁、出磁、折返、相切均为真实事件关键帧。'}
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
                      <h2>共享场 · 独立粒子</h2>
                      <p>当前编辑 <strong>{selectedLabel}</strong>。单粒子初态改变只重发射该粒子；E、B 或分区边界改变会整场重新演示。</p>
                    </div>
                  </div>

                  <div className="preset-chips" aria-label="P06 快速实验">
                    {effectiveField.mode === 'crossed' ? (
                      <>
                        <button type="button" className="chip-button" onClick={() => loadPreset('p06-selector')}>速度选择</button>
                        <button type="button" className="chip-button" onClick={() => loadPreset('p06-pure-e')}>纯电场</button>
                        <button type="button" className="chip-button" onClick={() => loadPreset('p06-pure-b')}>纯磁场</button>
                        <button type="button" className="chip-button" onClick={() => loadPreset('p06-sign')}>正负电荷</button>
                        <button type="button" className="chip-button" onClick={() => loadPreset('p06-general')}>一般曲线</button>
                      </>
                    ) : (
                      <>
                        <button type="button" className="chip-button" onClick={() => loadPreset('p06-accelerate')}>加速→偏转</button>
                        <button type="button" className="chip-button" onClick={() => loadPreset('p06-turnback')}>减速折返</button>
                        <button type="button" className="chip-button" onClick={() => loadPreset('p06-exit-electric')}>出磁回电场</button>
                        <button type="button" className="chip-button" onClick={() => loadPreset('p06-reverse')}>反向 B</button>
                      </>
                    )}
                  </div>

                  <section className="panel-section">
                    <h3 className="section-title">共享场条件</h3>
                    <ParamSlider label="E_x" value={effectiveField.Ex} min={-5} max={5} step={0.1} unit="V/m" decimals={1} onChange={(value) => patchField({ Ex: value })} />
                    <ParamSlider label="E_y" value={effectiveField.Ey} min={-5} max={5} step={0.1} unit="V/m" decimals={1} onChange={(value) => patchField({ Ey: value })} />
                    <ParamSlider label="B_z" value={effectiveField.Bz} min={-3} max={3} step={0.1} unit="T" decimals={2} onChange={(value) => patchField({ Bz: value })} description="正值出纸面 ⊙，负值入纸面 ×。" />
                    {effectiveField.mode === 'segmented' ? (
                      <ParamSlider label="电场区宽度 d" value={effectiveField.dM} min={0.3} max={6} step={0.1} unit="m" decimals={1} domain={PARAMETER_DOMAINS.i06FieldWidth} onChange={(value) => patchField({ dM: value })} description="拖动舞台 x=−d 边界把手会先进入全场预览。" />
                    ) : null}
                  </section>

                  <section className="panel-section">
                    <h3 className="section-title">粒子 {selectedLabel} 的初态</h3>
                    <ParamSlider label="电荷量 q" value={selectedDisplay?.chargeC ?? 1} min={-2} max={2} step={0.1} unit="C" decimals={1} onChange={(value) => patchSelectedParticle({ chargeC: value })} description="q=0 为中性粒子，不受电磁力。" />
                    <ParamSlider label="质量 m" value={selectedDisplay?.massKg ?? 1} min={0.2} max={3} step={0.1} unit="kg" decimals={1} onChange={(value) => patchSelectedParticle({ massKg: value })} />
                    <ParamSlider label="初速度大小 v₀" value={selectedDisplay?.speedMps ?? 2} min={0} max={6} step={0.1} unit="m/s" decimals={1} onChange={(value) => patchSelectedParticle({ speedMps: value })} />
                    <ParamSlider label="初速度方向 θ" value={selectedDisplay?.directionDeg ?? 0} min={0} max={360} step={1} unit="°" decimals={0} onChange={(value) => patchSelectedParticle({ directionDeg: value })} />
                    <div className="two-col-params">
                      <ParamSlider label="初始 x" value={selectedDisplay?.startX ?? 0} min={-6} max={6} step={0.1} unit="m" decimals={1} onChange={(value) => patchSelectedParticle({ startX: value })} />
                      <ParamSlider label="初始 y" value={selectedDisplay?.startY ?? 0} min={-5} max={5} step={0.1} unit="m" decimals={1} onChange={(value) => patchSelectedParticle({ startY: value })} />
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
                      <button type="button" className="secondary-button" onClick={exportScene}><Icon name="download" size={16} />导出场景 JSON</button>
                      <button type="button" className="secondary-button" onClick={() => importRef.current?.click()}><Icon name="upload" size={16} />导入场景 JSON</button>
                      <input ref={importRef} type="file" accept="application/json,.json" hidden data-testid="p06-scene-import" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importScene(file); event.target.value = ''; }} />
                    </div>
                  </section>

                  <button type="button" className="secondary-button wide-button" onClick={() => { commitScene(P06_PRESETS['p06-default']); setLayers({ ...P06_LAYER_DEFAULTS }); setDraft(null); setFieldDraft(null); setTrailResetById({}); clock.reset(); showConditionNotice('已恢复 P06 默认单粒子场景与图层', 'recalculated'); }}>
                    <Icon name="reset" size={17} />
                    恢复默认单粒子场景
                  </button>
                </div>
              ) : null}

              {tab === 'lesson' ? (
                <LessonRunner
                  steps={P06_LESSON}
                  storageKey="emplab.p06.lesson.v1"
                  overview={{
                    goals: [
                      '区分电场力与磁场力的方向、做功与能量变化。',
                      '理解速度选择条件 E+v×B=0 与一般叠加场曲线。',
                      '掌握电场加速、磁场圆周和跨区边界事件的解析分段。',
                      '比较同场多粒子的轨迹、动能和区域状态。',
                    ],
                    prerequisites: ['洛伦兹力与匀强磁场圆周运动。', '匀变速直线运动、动能定理和矢量分解。', '圆与直线交点与边界事件。'],
                    misconceptions: ['认为叠加场中一定做圆周运动。', '认为 E 和 B 同时存在时一定互相抵消。', '跨入磁场时把速度大小重置。'],
                  }}
                  onApplyPreset={loadPreset}
                  onGoPractice={() => setTab('practice')}
                />
              ) : null}

              {tab === 'practice' ? <PracticePanel modelId="p06" /> : null}

              {tab === 'data' ? (
                <div className="panel-section-stack">
                  <div className="panel-intro">
                    <div>
                      <h2>多粒子实时比较</h2>
                      <p>全局 t = {formatTime(clock.time)}；选中 {selectedLabel} 的局部 τ = {selectedTau === null ? '尚未发射' : formatTime(selectedTau)}。</p>
                    </div>
                  </div>

                  <div className="particle-compare-table p06-compare-table" data-testid="p06-compare">
                    <div className="particle-compare-head">
                      <span>粒子</span><span>区域</span><span>|v|</span><span>K</span><span>F_E</span><span>F_B</span><span>F</span>
                    </div>
                    {evaluations.map((item) => (
                      <button key={item.particle.id} type="button" className={`particle-compare-row ${item.particle.id === scene.activeParticleId ? 'is-selected' : ''}`} onClick={() => selectParticleById(item.particle.id)} data-testid={`p06-compare-row-${item.particle.label}`}>
                        <span className="particle-compare-label" style={{ color: item.particle.color }}><i style={{ background: item.particle.color }} />{item.particle.label}</span>
                        <span>{item.state ? regionLabel(item.state.region) : '待发射'}</span>
                        <span>{item.state ? formatNumber(item.state.speed, 2) : '—'}</span>
                        <span>{item.state ? formatNumber(item.state.kineticEnergyJ, 2) : '—'}</span>
                        <span>{item.state ? formatNumber(lengthVec(item.state.forceE), 2) : '—'}</span>
                        <span>{item.state ? formatNumber(lengthVec(item.state.forceB), 2) : '—'}</span>
                        <span>{item.state ? formatNumber(lengthVec(item.state.force), 2) : '—'}</span>
                      </button>
                    ))}
                  </div>

                  <ReadoutGrid
                    items={[
                      { label: '所在区域', value: selectedState ? regionLabel(selectedState.region) : '尚待发射', testId: 'p06-region' },
                      { label: '位置 x', value: selectedState ? `${formatNumber(selectedState.position.x, 3)} m` : '—', testId: 'p06-x' },
                      { label: '位置 y', value: selectedState ? `${formatNumber(selectedState.position.y, 3)} m` : '—', testId: 'p06-y' },
                      { label: '速度大小', value: selectedState ? `${formatNumber(selectedState.speed, 3)} m/s` : '—', testId: 'p06-speed' },
                      { label: '动能 K', value: selectedState ? `${formatNumber(selectedState.kineticEnergyJ, 3)} J` : '—', testId: 'p06-kinetic' },
                      { label: '电场力 F_E', value: selectedState ? formatForce(lengthVec(selectedState.forceE)) : '—', testId: 'p06-force-e' },
                      { label: '磁场力 F_B', value: selectedState ? formatForce(lengthVec(selectedState.forceB)) : '—', testId: 'p06-force-b' },
                      { label: '合力 F', value: selectedState ? formatForce(lengthVec(selectedState.force)) : '—', testId: 'p06-force' },
                      { label: '电场做功 W_E', value: selectedState ? `${formatNumber(selectedState.workJ, 3)} J` : '—', testId: 'p06-work' },
                      { label: '能量残差', value: selectedState ? `${formatNumber(selectedState.energyResidualJ, 3)} J` : '—', testId: 'p06-energy-residual' },
                      { label: '局部时间 τ', value: selectedTau === null ? '尚未发射' : formatTime(selectedTau), hint: `launchTime = ${formatTime(selectedLaunch)}`, testId: 'p06-local-time' },
                      ...(effectiveField.mode === 'crossed'
                        ? [{ label: '速度选择条件', value: selectorMatches ? '满足（初始净力为零）' : '不满足（会偏转）', hint: `v_d = (${formatNumber(effectiveField.Ey / (effectiveField.Bz || 1), 2)}, ${formatNumber(-effectiveField.Ex / (effectiveField.Bz || 1), 2)}) m/s`, testId: 'p06-selector' }]
                        : []),
                      ...(effectiveField.dM && effectiveField.mode === 'segmented'
                        ? [{ label: '场内/事件', value: selectedSolutionB?.eventLimited ? '达到事件上限' : `${selectedEvents.filter((event) => event.kind === 'crossing').length} 次真实跨界`, testId: 'p06-events' }]
                        : []),
                    ]}
                  />

                  {effectiveField.mode === 'segmented' ? (
                    <section className="event-section">
                      <h3 className="section-title">分段边界事件</h3>
                      {selectedEvents.length > 0 ? (
                        <div className="event-list">
                          {selectedEvents.map((event, index) => (
                            <button key={`${event.timeS}-${event.kind}-${index}`} type="button" className="event-item" onClick={() => clock.setTime(selectedLaunch + event.timeS)}>
                              <span className="event-time">{formatTime(event.timeS)}</span>
                              <span className="event-label">{event.explanation}</span>
                              <span className="event-value">{regionLabel(event.fromRegion)} → {regionLabel(event.toRegion)}</span>
                            </button>
                          ))}
                        </div>
                      ) : <p className="muted-text">当前时间窗没有边界事件。</p>}
                    </section>
                  ) : null}

                  <section className="formula-card">
                    <p className="eyebrow">公式与代值</p>
                    {effectiveField.mode === 'crossed' ? (
                      <>
                        <MathTex block>{'m\\frac{d\\vec v}{dt}=q(\\vec E+\\vec v\\times\\vec B)'}</MathTex>
                        <MathTex block>{'\\vec v_d=\\left(\\frac{E_y}{B_z},-\\frac{E_x}{B_z}\\right),\\qquad \\Delta K=q\\vec E\\cdot\\Delta\\vec r'}</MathTex>
                        <p>只有磁力不做功；电场力可改变动能。匹配漂移速度时净力为零，粒子可沿直线匀速运动。</p>
                        <p className="formula-result">当前 E=({formatNumber(effectiveField.Ex, 2)}, {formatNumber(effectiveField.Ey, 2)}) V/m，Bz={formatNumber(effectiveField.Bz, 2)} T，K={selectedState ? formatNumber(selectedState.kineticEnergyJ, 3) : '—'} J</p>
                      </>
                    ) : (
                      <>
                        <MathTex block>{'\\Delta K_{E}=q\\vec E\\cdot\\Delta\\vec r,\\qquad R=\\frac{mv}{|qB|},\\qquad T=\\frac{2\\pi m}{|qB|}'}</MathTex>
                        <p>电场区为匀加速运动，磁场区为精确圆弧；跨边界时位置与速度连续，力可以突变。</p>
                        <p className="formula-result">d = {formatLength(effectiveField.dM)}；选中粒子当前区域：{selectedState ? regionLabel(selectedState.region) : '待发射'}。</p>
                      </>
                    )}
                  </section>

                  <div className="callout callout-note">
                    <Icon name="info" size={18} />
                    <div>
                      <strong>模型边界</strong>
                      <p>同区模式为均匀静态 E+B；分段模式只有自由区、单一电场区与磁场半平面，忽略粒子间相互作用、碰撞、辐射与非均匀边缘场。</p>
                      <p>“速度选择条件”只是轨迹对比；没有实际狭缝/吸收板，不能声称粒子被物理筛选或给出通过率。</p>
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

function lengthVec(vector: { x: number; y: number }): number {
  return Math.hypot(vector.x, vector.y);
}
