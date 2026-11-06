import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { particleStateAt } from '../../physics/particles/uniformB';
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
  formatForce,
  formatLength,
  formatNumber,
  formatTime,
  formatVelocity,
} from '../../lib/format';
import { usePersistentState } from '../../hooks/usePersistentState';
import { usePlaybackClock } from '../../hooks/usePlaybackClock';
import { P02_LESSON } from '../../content/lessons';
import {
  P02_DEFAULT,
  P02_MULTI_PRESETS,
  P02_PRESETS,
  P02_SCENE_STORAGE_KEY,
  decodeP02SceneJson,
  loadInitialP02Scene,
  p02GlobalDuration,
  p02ModelFor,
  p02ParticleDisplay,
  p02SceneFromPreset,
  p02SeedFromDisplay,
  p02SingleDuration,
  parseP02StoredScene,
  serializeP02Scene,
  toP02StoredScene,
  type P02Field,
  type P02ParticleParams,
  type P02Scene,
} from './p02Scene';
import {
  P02_DEFAULT_LAYERS,
  UniformBStage,
  type P02EvaluatedParticle,
  type P02Layers,
} from './UniformBStage';
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
type ConditionNotice = { text: string; tone: 'preview' | 'recalculated' };

const LAYER_ITEMS: Array<{ key: keyof P02Layers; label: string; short: string }> = [
  { key: 'predicted', label: '完整预测轨迹', short: '预测' },
  { key: 'trail', label: '已走轨迹', short: '已走' },
  { key: 'aux', label: '圆心与半径', short: '圆心' },
  { key: 'velocity', label: '速度矢量', short: '速度' },
  { key: 'force', label: '洛伦兹力', short: '力' },
  { key: 'allVectors', label: '所有粒子的矢量', short: '全部矢量' },
  { key: 'field', label: '磁场符号', short: '磁场' },
  { key: 'angle', label: '已转角度', short: '角度' },
];

function uniqueFrames(frames: KeyFrame[]): KeyFrame[] {
  const map = new Map<number, KeyFrame>();
  for (const frame of frames) {
    const key = Math.round(frame.time * 1e9) / 1e9;
    if (!map.has(key)) map.set(key, frame);
  }
  return [...map.values()].sort((a, b) => a.time - b.time);
}

export function UniformBPage() {
  const initialScene = useMemo(() => loadInitialP02Scene(), []);
  const initialStored = useMemo(() => toP02StoredScene(initialScene), [initialScene]);
  const [storedScene, setStoredScene] = usePersistentState<unknown>(P02_SCENE_STORAGE_KEY, initialStored);
  const scene = useMemo(
    () => parseP02StoredScene(storedScene).scene ?? initialScene,
    [initialScene, storedScene],
  );
  const [storedLayers, setLayers] = usePersistentState<P02Layers>(
    'emplab.p02.layers.v1',
    P02_DEFAULT_LAYERS,
  );
  const layers = useMemo(() => ({ ...P02_DEFAULT_LAYERS, ...storedLayers }), [storedLayers]);
  const [mode, setMode] = usePersistentState<LearningMode>('emplab.p02.mode.v1', 'guided');
  const [teacher, setTeacher] = useState(false);
  const [stageMode, setStageMode] = useState<StageMode>('interact');
  const [tab, setTab] = useState<PanelTabId>(mode === 'guided' ? 'lesson' : 'params');
  const [draft, setDraft] = useState<ParticleDraft | null>(null);
  const [conditionNotice, setConditionNotice] = useState<ConditionNotice | null>(null);
  const [trailResetById, setTrailResetById] = useState<Record<string, number>>({});
  const [searchParams] = useSearchParams();
  const presetId = searchParams.get('preset');
  const normalizedOnMount = useRef(false);
  const importRef = useRef<HTMLInputElement | null>(null);
  const noticeTimer = useRef<number | null>(null);
  const sceneRef = useRef(scene);
  const draftRef = useRef(draft);
  const globalTimeRef = useRef(0);
  sceneRef.current = scene;
  draftRef.current = draft;

  const commitScene = useCallback(
    (next: P02Scene) => setStoredScene(toP02StoredScene(next)),
    [setStoredScene],
  );

  useEffect(() => {
    if (normalizedOnMount.current) return;
    normalizedOnMount.current = true;
    if (scene.particles.some((particle) => (scene.runtimeById[particle.id]?.launchTimeSec ?? 0) > 0)) {
      commitScene(relaunchAll(scene));
    }
  }, [commitScene, scene]);

  const models = useMemo(
    () =>
      scene.particles.map((particle) => ({
        particle,
        model: p02ModelFor(scene.field, particle),
        runtime: scene.runtimeById[particle.id] ?? { launchTimeSec: 0 },
      })),
    [scene.field, scene.particles, scene.runtimeById],
  );
  const duration = useMemo(() => p02GlobalDuration(scene), [scene]);
  const keyFrames = useMemo(() => {
    const frames: KeyFrame[] = [{ time: 0, label: '全局起点' }];
    for (const item of models) {
      const launch = item.runtime.launchTimeSec;
      if (item.model.circular) {
        for (let index = 0; index <= 8; index++) {
          frames.push({
            time: launch + index * 0.25 * item.model.periodS,
            label: `${item.particle.label} ${index === 0 ? '发射' : `${index}T/4`}`,
          });
        }
      } else {
        const single = p02SingleDuration(item.model);
        for (const fraction of [0, 0.25, 0.5, 0.75, 1]) {
          frames.push({ time: launch + fraction * single, label: `${item.particle.label} ${Math.round(fraction * 100)}%` });
        }
      }
    }
    frames.push({ time: duration, label: '全局结束' });
    return uniqueFrames(frames.filter((frame) => frame.time <= duration + 1e-12));
  }, [duration, models]);
  const clock = usePlaybackClock(duration, keyFrames.map((frame) => frame.time));
  globalTimeRef.current = clock.time;

  const evaluations = useMemo<P02EvaluatedParticle[]>(
    () =>
      models.map((item) => {
        const tau = particleTau(item.runtime, clock.time);
        return {
          ...item,
          state: tau === null ? null : particleStateAt(item.model, tau),
        };
      }),
    [clock.time, models],
  );
  const selectedCommitted = evaluations.find((item) => item.particle.id === scene.activeParticleId) ?? evaluations[0] ?? null;
  const selectedParticle = draft?.draftParticle ?? selectedCommitted?.particle ?? null;
  const selectedDisplay = selectedParticle ? p02ParticleDisplay(selectedParticle) : null;
  const draftModel = useMemo(
    () => (draft ? p02ModelFor(scene.field, draft.draftParticle) : null),
    [draft, scene.field],
  );
  const selectedModel = draftModel ?? selectedCommitted?.model ?? null;
  const selectedState = draft
    ? draftModel
      ? particleStateAt(draftModel, 0)
      : null
    : selectedCommitted?.state ?? null;
  const selectedTau = draft ? 0 : selectedCommitted?.state?.timeS ?? null;
  const selectedLaunch = selectedCommitted?.runtime.launchTimeSec ?? 0;
  const questionCount = questionsForModel('p02').length;
  const selectedLabel = selectedParticle?.label ?? 'A';

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
    const multi = P02_MULTI_PRESETS[presetId];
    const single = P02_PRESETS[presetId];
    const presetScene = multi ?? (single ? p02SceneFromPreset(single) : null);
    if (!presetScene) return;
    commitScene(presetScene);
    setDraft(null);
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

  const patchSelectedParticle = (patch: Partial<P02ParticleParams>) => {
    const current = activeParticle(sceneRef.current);
    if (!current) return;
    const display = { ...p02ParticleDisplay(current), ...patch };
    const seed = p02SeedFromDisplay(display);
    const next = updateParticleAndRelaunch(sceneRef.current, current.id, seed, globalTimeRef.current);
    commitScene(next);
    setDraft(null);
    showConditionNotice(`${current.label} 已按新初态重新发射 · 其他粒子未重置`, 'recalculated');
  };

  const patchField = (patch: Partial<P02Field>) => {
    const next = applySharedField(sceneRef.current, { ...sceneRef.current.field, ...patch });
    commitScene(next);
    setDraft(null);
    setTrailResetById({});
    clock.restart();
    showConditionNotice('场条件改变，全部粒子同步重新演示 · tGlobal = 0', 'recalculated');
  };

  const loadScenePreset = (preset: typeof P02_DEFAULT) => {
    commitScene(p02SceneFromPreset(preset));
    setDraft(null);
    setTrailResetById({});
    clock.restart();
    showConditionNotice('已载入单粒子题目预设 · 场景替换为 A · 全局时钟归零', 'recalculated');
  };

  const applyLessonPreset = (id: string) => {
    const preset = P02_PRESETS[id];
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
      const display = { ...p02ParticleDisplay(previous.draftParticle), ...patch };
      const seed = p02SeedFromDisplay(display);
      return updateDraft(previous, seed);
    });
  };

  const endDraft = () => {
    const current = draftRef.current;
    if (!current) return;
    const next = commitDraft(sceneRef.current, current, globalTimeRef.current);
    commitScene(next);
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
    const current = activeParticle(sceneRef.current);
    const baseDisplay = selectedDisplay ?? (current ? p02ParticleDisplay(current) : null);
    if (!baseDisplay) return;
    const seed = p02SeedFromDisplay({
      ...baseDisplay,
      startY: Math.max(-0.5, Math.min(0.5, baseDisplay.startY + 0.04)),
    });
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
    const blob = new Blob([serializeP02Scene(sceneRef.current)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'p02-scene.json';
    anchor.click();
    URL.revokeObjectURL(url);
    showConditionNotice('P02 场景已导出为 JSON', 'recalculated');
  };

  const importScene = async (file: File) => {
    const text = await file.text();
    const parsed = decodeP02SceneJson(text);
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
    </div>
  );

  return (
    <div
      className={`sim-page ${teacher ? 'sim-teacher' : ''}`}
      data-sim-playing={clock.playing}
      data-sim-editing={draft !== null}
      data-sim-time={clock.time}
      data-particle-count={scene.particles.length}
      data-active-particle-id={scene.activeParticleId}
    >
      <header className="sim-header">
        <div className="sim-title-block">
          <p className="eyebrow">P02 · 模块 A · 粒子运动</p>
          <h1>匀强磁场内的多粒子圆周运动</h1>
          <p className="sim-subtitle">
            同一磁场、同一坐标、同一全局时钟下比较 1–5 个粒子。播放中只编辑选中的粒子，其他粒子继续运动。
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
          <UniformBStage
            particles={evaluations}
            field={scene.field}
            selectedId={scene.activeParticleId}
            draft={
              draft && draftModel
                ? {
                    particle: draft.draftParticle,
                    model: draftModel,
                    state: particleStateAt(draftModel, 0),
                  }
                : null
            }
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
              formula={'r=\\frac{mv}{|q|B},\\qquad T=\\frac{2\\pi m}{|q|B}'}
              stats={[
                { label: '粒子数', value: `${scene.particles.length}/5` },
                { label: `半径 ${selectedLabel}`, value: selectedModel?.circular ? formatLength(selectedModel.radiusM) : '∞' },
                { label: `周期 ${selectedLabel}`, value: selectedModel?.circular ? formatTime(selectedModel.periodS) : '—' },
                { label: `τ ${selectedLabel}`, value: selectedTau === null ? '未发射' : formatTime(selectedTau) },
              ]}
              footnote={`tGlobal = ${formatTime(clock.time)} · ${selectedLabel} 局部时间 τ = ${selectedTau === null ? '未发射' : formatTime(selectedTau)}`}
              controls={teacherControls}
            />
          ) : null}
          <PlaybackBar
            clock={clock}
            duration={duration}
            keyFrames={keyFrames}
            timeLabel={formatTime(clock.time)}
            secondaryLabel={`${selectedLabel} τ = ${selectedTau === null ? '未发射' : formatTime(selectedTau)}`}
            timelineLabel="多粒子全局时间轴"
            note="1× 用约 8 秒演示全局时间轴；单个粒子编辑不暂停全局时钟，其他粒子继续运动。"
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
                      <p>
                        当前编辑粒子 <strong>{selectedLabel}</strong>。粒子参数只重发射该粒子；磁场改变会让全部粒子同步重新演示。
                      </p>
                    </div>
                  </div>

                  <div className="preset-chips" aria-label="快速实验">
                    <button type="button" className="chip-button" onClick={() => loadScenePreset(P02_DEFAULT)}>
                      单粒子默认
                    </button>
                    <button type="button" className="chip-button" onClick={() => patchSelectedParticle({ speedUnits: Math.min(5, (selectedDisplay?.speedUnits ?? 2) * 2) })}>
                      {selectedLabel} 速度 ×2
                    </button>
                    <button type="button" className="chip-button" onClick={() => patchSelectedParticle({ chargeSign: (selectedDisplay?.chargeSign ?? 1) === 1 ? -1 : 1 })}>
                      {selectedLabel} 切换电荷
                    </button>
                    <button type="button" className="chip-button" onClick={() => patchField({ fieldMag: Math.min(1.5, scene.field.fieldMag + 0.25) })}>
                      B 增大（全场）
                    </button>
                    <button type="button" className="chip-button" onClick={() => patchField({ fieldMag: 0 })}>
                      B = 0（全场）
                    </button>
                  </div>

                  <section className="panel-section">
                    <h3 className="section-title">共享磁场</h3>
                    <div className="field-label-row">
                      <div>
                        <span className="field-label">磁场方向</span>
                        <p className="field-hint">改变场会重算全部粒子，并同步从 t=0 重新演示</p>
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
                    <ParamSlider
                      label="磁感应强度 |B|"
                      value={scene.field.fieldMag}
                      min={0}
                      max={1.5}
                      step={0.05}
                      unit="T"
                      decimals={2}
                      onChange={(value) => patchField({ fieldMag: value })}
                    />
                  </section>

                  <section className="panel-section">
                    <h3 className="section-title">粒子 {selectedLabel} 的初态</h3>
                    <div className="field-label-row">
                      <div>
                        <span className="field-label">电荷符号</span>
                        <p className="field-hint">只影响 {selectedLabel}；其他粒子保持原状态</p>
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
                    <ParamSlider
                      label="电荷量 |q|"
                      value={selectedDisplay?.chargeMag ?? 1}
                      min={0}
                      max={3}
                      step={0.1}
                      unit="e"
                      decimals={1}
                      onChange={(value) => patchSelectedParticle({ chargeMag: value })}
                    />
                    <ParamSlider
                      label="质量 m"
                      value={selectedDisplay?.massUnits ?? 1}
                      min={0.1}
                      max={5}
                      step={0.01}
                      unit="×10⁻²⁶ kg"
                      decimals={2}
                      onChange={(value) => patchSelectedParticle({ massUnits: value })}
                    />
                    <ParamSlider
                      label="速度大小 v"
                      value={selectedDisplay?.speedUnits ?? 2}
                      min={0}
                      max={5}
                      step={0.1}
                      unit="×10⁶ m/s"
                      decimals={1}
                      onChange={(value) => patchSelectedParticle({ speedUnits: value })}
                    />
                    <ParamSlider
                      label="速度方向 θ"
                      value={selectedDisplay?.directionDeg ?? 0}
                      min={0}
                      max={360}
                      step={1}
                      unit="°"
                      decimals={0}
                      onChange={(value) => patchSelectedParticle({ directionDeg: value })}
                    />
                    <div className="two-col-params">
                      <ParamSlider
                        label="入射点 x"
                        value={(selectedDisplay?.startX ?? -0.15) * 100}
                        min={-50}
                        max={50}
                        step={0.5}
                        unit="cm"
                        decimals={1}
                        onChange={(value) => patchSelectedParticle({ startX: value / 100 })}
                      />
                      <ParamSlider
                        label="入射点 y"
                        value={(selectedDisplay?.startY ?? 0) * 100}
                        min={-50}
                        max={50}
                        step={0.5}
                        unit="cm"
                        decimals={1}
                        onChange={(value) => patchSelectedParticle({ startY: value / 100 })}
                      />
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
                      <button type="button" className="secondary-button" onClick={exportScene}>
                        <Icon name="download" size={16} />
                        导出场景 JSON
                      </button>
                      <button type="button" className="secondary-button" onClick={() => importRef.current?.click()}>
                        <Icon name="upload" size={16} />
                        导入场景 JSON
                      </button>
                      <input
                        ref={importRef}
                        type="file"
                        accept="application/json,.json"
                        hidden
                        data-testid="p02-scene-import"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) void importScene(file);
                          event.target.value = '';
                        }}
                      />
                    </div>
                  </section>

                  <button
                    type="button"
                    className="secondary-button wide-button"
                    onClick={() => {
                      commitScene(p02SceneFromPreset(P02_DEFAULT));
                      setLayers({ ...P02_DEFAULT_LAYERS });
                      setDraft(null);
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
                  steps={P02_LESSON}
                  storageKey="emplab.p02.lesson.v1"
                  overview={{
                    goals: [
                      '判断正负电荷在不同 B 方向下的洛伦兹力方向与转向。',
                      '由 m、q、B、v 求出半径 r、周期 T 与圆心位置。',
                      '在同一舞台比较不同初态的粒子，并区分全局时间与局部时间。',
                    ],
                    prerequisites: [
                      '速度、加速度与匀速圆周运动；向心力。',
                      '磁感应强度方向约定与 v × B（或左手定则）。',
                      '科学计数法与 SI 单位换算。',
                    ],
                    misconceptions: [
                      '误认为洛伦兹力做功、会改变粒子动能。',
                      '误认为编辑一个粒子会让所有粒子重新发射。',
                      '同时改变 q 与 B 的符号时只考虑其中一个反向。',
                    ],
                  }}
                  onApplyPreset={applyLessonPreset}
                  onGoPractice={() => setTab('practice')}
                />
              ) : null}

              {tab === 'practice' ? <PracticePanel modelId="p02" /> : null}

              {tab === 'data' ? (
                <div className="panel-section-stack">
                  <div className="panel-intro">
                    <div>
                      <h2>多粒子比较</h2>
                      <p>
                        全局 t = {formatTime(clock.time)}；选中 {selectedLabel} 的局部 τ ={' '}
                        {selectedTau === null ? '尚未发射' : formatTime(selectedTau)}。
                      </p>
                    </div>
                  </div>

                  <div className="particle-compare-table" data-testid="p02-compare">
                    <div className="particle-compare-head">
                      <span>粒子</span>
                      <span>q/e</span>
                      <span>m</span>
                      <span>|v|</span>
                      <span>R</span>
                      <span>T</span>
                      <span>τ</span>
                    </div>
                    {evaluations.map((item) => {
                      const display = p02ParticleDisplay(item.particle);
                      return (
                        <button
                          key={item.particle.id}
                          type="button"
                          className={`particle-compare-row ${item.particle.id === scene.activeParticleId ? 'is-selected' : ''}`}
                          onClick={() => selectParticleById(item.particle.id)}
                          data-testid={`p02-compare-row-${item.particle.label}`}
                        >
                          <span className="particle-compare-label" style={{ color: item.particle.color }}>
                            <i style={{ background: item.particle.color }} />
                            {item.particle.label}
                          </span>
                          <span>{item.particle.chargeC < 0 ? '−' : '+'}{formatNumber(Math.abs(item.particle.chargeC) / 1.602176634e-19, 2)}</span>
                          <span>{formatNumber(display.massUnits, 2)}</span>
                          <span>{formatNumber(display.speedUnits, 2)}</span>
                          <span>{item.model.circular ? formatLength(item.model.radiusM) : '∞'}</span>
                          <span>{item.model.circular ? formatTime(item.model.periodS) : '—'}</span>
                          <span>{item.state ? formatTime(item.state.timeS) : '待发射'}</span>
                        </button>
                      );
                    })}
                  </div>

                  <ReadoutGrid
                    items={[
                      {
                        label: `轨道半径 r（${selectedLabel}）`,
                        value: selectedModel?.circular ? formatLength(selectedModel.radiusM) : '∞ / 直线',
                        hint: 'r = mv / (|q|B)',
                        testId: 'p02-radius',
                      },
                      {
                        label: '周期 T',
                        value: selectedModel?.circular ? formatTime(selectedModel.periodS) : '—',
                        hint: 'T = 2πm / (|q|B)',
                        testId: 'p02-period',
                      },
                      {
                        label: '当前速度',
                        value: selectedState ? formatVelocity(selectedState.speed) : '尚未发射',
                        hint: '纯磁场中速率守恒',
                        testId: 'p02-speed',
                      },
                      {
                        label: '洛伦兹力 |F|',
                        value: selectedState && selectedModel?.circular ? formatForce(Math.hypot(selectedState.force.x, selectedState.force.y)) : '0 N',
                        hint: 'F = |q|vB',
                        testId: 'p02-force',
                      },
                      {
                        label: '转向',
                        value:
                          selectedModel?.direction === 'clockwise'
                            ? '顺时针'
                            : selectedModel?.direction === 'counterclockwise'
                              ? '逆时针'
                              : '无',
                        hint: '由 qB 的符号决定',
                        testId: 'p02-direction',
                      },
                      {
                        label: '圆心坐标',
                        value: selectedModel?.center
                          ? `(${formatLength(selectedModel.center.x)}, ${formatLength(selectedModel.center.y)})`
                          : '—',
                        hint: '圆心在入射点受力方向一侧',
                        testId: 'p02-center',
                      },
                      {
                        label: '局部时间 τ',
                        value: selectedTau === null ? '尚未发射' : formatTime(selectedTau),
                        hint: `launchTime = ${formatTime(selectedLaunch)}`,
                        testId: 'p02-local-time',
                      },
                    ]}
                  />

                  <section className="formula-card">
                    <p className="eyebrow">公式与代值</p>
                    <MathTex block>{'r=\\frac{mv}{|q|B},\\qquad T=\\frac{2\\pi m}{|q|B}'}</MathTex>
                    <p>
                      {selectedLabel}: m = {formatNumber(selectedDisplay?.massUnits ?? 0, 2)}×10⁻²⁶ kg，
                      v = {formatNumber(selectedDisplay?.speedUnits ?? 0, 2)}×10⁶ m/s，
                      |q| = {formatNumber(selectedDisplay?.chargeMag ?? 0, 2)}e，|B| = {formatNumber(scene.field.fieldMag, 2)} T
                    </p>
                    <p className="formula-result">
                      r ≈ {selectedModel?.circular ? formatLength(selectedModel.radiusM) : '∞（B 或 q 为 0）'}，
                      T ≈ {selectedModel?.circular ? formatTime(selectedModel.periodS) : '—'}
                    </p>
                  </section>

                  <div className="callout callout-note">
                    <Icon name="info" size={18} />
                    <div>
                      <strong>多粒子语义</strong>
                      <p>
                        所有粒子共享同一外加磁场和全局时钟，但各自有独立的初态与 launchTime；忽略粒子间库仑力、相互作用磁场与碰撞。
                        相同初态的粒子会真实重合，不用偏移轨道来“避免重叠”。
                      </p>
                      <p>
                        编辑选中粒子只让它从当前 tGlobal 重新发射；其他粒子的初态、launchTime 与轨迹缓存不变。改变 B 则全部粒子同步重新演示。
                      </p>
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
