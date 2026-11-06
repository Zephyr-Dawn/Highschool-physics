import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { P01_MOTION_LESSON } from '../../content/lessons';
import {
  P02_MULTI_PRESETS,
  parseP02StoredScene,
  p02GlobalDuration,
  p02ModelFor,
  p02ParticleDisplay,
  p02SeedFromDisplay,
  p02SingleDuration,
  toP02StoredScene,
  type P02Field,
  type P02ParticleParams,
  type P02Scene,
} from './p02Scene';
import {
  P01_PLANAR_PRESETS,
  P01_PLANAR_SCENE_KEY,
  decodeP01PlanarSceneJson,
  loadInitialP01PlanarScene,
  serializeP01PlanarScene,
} from './p01PlanarScene';
import {
  P02_DEFAULT_LAYERS,
  UniformBStage,
  type P02EvaluatedParticle,
  type P02Layers,
} from './UniformBStage';
import { ParticleRoster, type RosterParticle } from './ParticleRoster';
import { P01Header, type LearningMode, type P01ViewMode } from './P01Header';
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

let lastAppliedPlanarPresetId: string | null = null;

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
  return [...map.values()].sort((left, right) => left.time - right.time);
}

interface P01PlanarLabProps {
  learningMode: LearningMode;
  teacher: boolean;
  presetId: string | null;
  onModeChange: (mode: P01ViewMode) => void;
  onLearningModeChange: (mode: LearningMode) => void;
  onTeacherChange: (teacher: boolean) => void;
  onPresetConsumed?: () => void;
}

export function P01PlanarLab({
  learningMode,
  teacher,
  presetId,
  onModeChange,
  onLearningModeChange,
  onTeacherChange,
  onPresetConsumed,
}: P01PlanarLabProps) {
  const initialScene = useMemo(() => loadInitialP01PlanarScene(), []);
  const initialStored = useMemo(() => toP02StoredScene(initialScene), [initialScene]);
  const [storedScene, setStoredScene] = usePersistentState<unknown>(P01_PLANAR_SCENE_KEY, initialStored);
  const scene = useMemo(() => parseP02StoredScene(storedScene).scene ?? initialScene, [initialScene, storedScene]);
  const [storedLayers, setStoredLayers] = usePersistentState<P02Layers>(
    'emplab.p01.planar.layers.v1',
    P02_DEFAULT_LAYERS,
  );
  const layers = useMemo(() => ({ ...P02_DEFAULT_LAYERS, ...storedLayers }), [storedLayers]);
  const [tab, setTab] = useState<PanelTabId>(learningMode === 'guided' ? 'lesson' : 'params');
  const [stageMode, setStageMode] = useState<StageMode>('interact');
  const [draft, setDraft] = useState<ParticleDraft | null>(null);
  const [trailResetById, setTrailResetById] = useState<Record<string, number>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const importRef = useRef<HTMLInputElement | null>(null);
  const noticeTimer = useRef<number | null>(null);
  const normalizedOnMount = useRef(false);
  const sceneRef = useRef(scene);
  const draftRef = useRef(draft);
  const globalTimeRef = useRef(0);
  const onPresetConsumedRef = useRef(onPresetConsumed);
  onPresetConsumedRef.current = onPresetConsumed;
  sceneRef.current = scene;
  draftRef.current = draft;

  const commitScene = useCallback(
    (next: P02Scene) => setStoredScene(toP02StoredScene(next)),
    [setStoredScene],
  );

  useEffect(() => {
    setTab(learningMode === 'guided' ? 'lesson' : 'params');
  }, [learningMode]);

  const showNotice = useCallback((text: string) => {
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
    setNotice(text);
    noticeTimer.current = window.setTimeout(() => {
      setNotice(null);
      noticeTimer.current = null;
    }, 2800);
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
    if (!presetId) return;
    if (lastAppliedPlanarPresetId === presetId) {
      onPresetConsumedRef.current?.();
      return;
    }
    lastAppliedPlanarPresetId = presetId;
    const preset = P01_PLANAR_PRESETS[presetId] ?? P02_MULTI_PRESETS[presetId];
    if (!preset) return;
    commitScene(preset);
    setDraft(null);
    setTrailResetById({});
    showNotice('已载入 P01 平面运动预设 · 全局时钟归零');
    onPresetConsumedRef.current?.();
  }, [commitScene, presetId, showNotice]);

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
          frames.push({ time: launch + index * 0.25 * item.model.periodS, label: `${item.particle.label} ${index === 0 ? '发射' : `${index}T/4`}` });
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
        return { ...item, state: tau === null ? null : particleStateAt(item.model, tau) };
      }),
    [clock.time, models],
  );
  const selectedCommitted = evaluations.find((item) => item.particle.id === scene.activeParticleId) ?? evaluations[0] ?? null;
  const selectedParticle = draft?.draftParticle ?? selectedCommitted?.particle ?? null;
  const selectedDisplay = selectedParticle ? p02ParticleDisplay(selectedParticle) : null;
  const draftModel = useMemo(() => (draft ? p02ModelFor(scene.field, draft.draftParticle) : null), [draft, scene.field]);
  const selectedModel = draftModel ?? selectedCommitted?.model ?? null;
  const selectedState = draft ? (draftModel ? particleStateAt(draftModel, 0) : null) : selectedCommitted?.state ?? null;
  const selectedTau = draft ? 0 : selectedCommitted?.state?.timeS ?? null;
  const selectedLabel = selectedParticle?.label ?? 'A';

  const patchSelectedParticle = (patch: Partial<P02ParticleParams>) => {
    const current = activeParticle(sceneRef.current);
    if (!current) return;
    const display = { ...p02ParticleDisplay(current), ...patch };
    commitScene(updateParticleAndRelaunch(sceneRef.current, current.id, p02SeedFromDisplay(display), globalTimeRef.current));
    setDraft(null);
    showNotice(`${current.label} 已按新初态重新发射 · 其他粒子未重置`);
  };
  const patchField = (patch: Partial<P02Field>) => {
    commitScene(applySharedField(sceneRef.current, { ...sceneRef.current.field, ...patch }));
    setDraft(null);
    setTrailResetById({});
    clock.restart();
    showNotice('公共 Bz 改变：全部粒子同步重算并从 tGlobal=0 重演');
  };
  const loadPreset = (preset: P02Scene) => {
    commitScene(preset);
    setDraft(null);
    setTrailResetById({});
    clock.restart();
    showNotice('已载入平面运动预设 · 全局时钟归零');
  };
  const applyLessonPreset = (id: string) => {
    const preset = P01_PLANAR_PRESETS[id] ?? P02_MULTI_PRESETS[id];
    if (preset) loadPreset(preset);
  };
  const beginDraft = () => {
    const current = activeParticle(sceneRef.current);
    if (!current) return;
    setDraft(createParticleDraft(sceneRef.current, current.id, globalTimeRef.current));
    showNotice(`正在编辑 ${current.label} 的初态 · 其他粒子继续运动`);
  };
  const changeDraft = (patch: { startX?: number; startY?: number; directionDeg?: number }) => {
    setDraft((previous) => {
      if (!previous) return previous;
      const display = { ...p02ParticleDisplay(previous.draftParticle), ...patch };
      return updateDraft(previous, p02SeedFromDisplay(display));
    });
  };
  const endDraft = () => {
    const current = draftRef.current;
    if (!current) return;
    commitScene(commitDraft(sceneRef.current, current, globalTimeRef.current));
    setDraft(null);
    showNotice(`${current.draftParticle.label} 已按新初态重新发射 · 其他粒子未重置`);
  };
  const cancelDraft = () => {
    if (!draftRef.current) return;
    setDraft(null);
    showNotice('已取消草稿 · 未重发射 · 其他粒子未受影响');
  };
  const selectParticleById = (id: string) => {
    if (draftRef.current) setDraft(null);
    commitScene(selectParticle(sceneRef.current, id));
  };
  const addNewParticle = () => {
    const current = activeParticle(sceneRef.current);
    if (!current) return;
    const display = p02ParticleDisplay(current);
    const result = addParticle(
      sceneRef.current,
      p02SeedFromDisplay({ ...display, startY: Math.max(-0.5, Math.min(0.5, display.startY + 0.04)) }),
      globalTimeRef.current,
    );
    if (!result.particle) {
      showNotice(`最多支持 ${MAX_PARTICLES} 个粒子`);
      return;
    }
    commitScene(result.scene);
    setDraft(null);
    showNotice(`已添加 ${result.particle.label} · 从当前 tGlobal 发射`);
  };
  const copySelected = () => {
    const current = activeParticle(sceneRef.current);
    if (!current) return;
    const result = duplicateParticle(sceneRef.current, current.id, globalTimeRef.current);
    if (!result.particle) return;
    commitScene(result.scene);
    setDraft(null);
    showNotice(`已复制 ${current.label} → ${result.particle.label}`);
  };
  const deleteSelected = () => {
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
    showNotice(`${current.label} 已从当前 tGlobal 单独重新发射`);
  };
  const relaunchAllParticles = () => {
    commitScene(relaunchAll(sceneRef.current));
    setDraft(null);
    setTrailResetById({});
    clock.restart();
    showNotice('全部粒子已从 tGlobal=0 同步重新发射');
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
    const blob = new Blob([serializeP01PlanarScene(sceneRef.current)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'p01-planar-scene.json';
    anchor.click();
    URL.revokeObjectURL(url);
    showNotice('P01 平面场景已导出');
  };
  const importScene = async (file: File) => {
    const parsed = decodeP01PlanarSceneJson(await file.text());
    if (!parsed.scene) {
      showNotice(`导入失败：${parsed.error ?? '格式无效'}`);
      return;
    }
    commitScene(relaunchAll(parsed.scene));
    setDraft(null);
    setTrailResetById({});
    clock.reset();
    showNotice('场景已导入 · 全部粒子从 tGlobal=0 重新呈现');
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
    <div className="teacher-layer-bar" role="group" aria-label="P01 平面运动教师图层">
      {LAYER_ITEMS.map((item) => (
        <button
          key={item.key}
          type="button"
          className="teacher-layer-chip"
          aria-pressed={layers[item.key]}
          onClick={() => setStoredLayers((previous) => ({ ...previous, [item.key]: !layers[item.key] }))}
        >
          {item.short}
        </button>
      ))}
    </div>
  );

  return (
    <div
      className={`sim-page p01-planar-page ${teacher ? 'sim-teacher' : ''}`}
      data-testid="p01-planar-page"
      data-sim-playing={clock.playing}
      data-sim-editing={draft !== null}
      data-sim-time={clock.time}
      data-p01-mode="planar"
      data-particle-count={scene.particles.length}
      data-active-particle-id={scene.activeParticleId}
    >
      <P01Header
        mode="planar"
        learningMode={learningMode}
        teacher={teacher}
        onModeChange={onModeChange}
        onLearningModeChange={onLearningModeChange}
        onTeacherChange={onTeacherChange}
      />
      <div className={`sim-layout ${teacher ? 'sim-layout-teacher' : ''}`}>
        <div className="sim-stage-column">
          <UniformBStage
            particles={evaluations}
            field={scene.field}
            selectedId={scene.activeParticleId}
            draft={draft && draftModel ? { particle: draft.draftParticle, model: draftModel, state: particleStateAt(draftModel, 0) } : null}
            layers={layers}
            stageMode={stageMode}
            onStageModeChange={setStageMode}
            onSelectParticle={selectParticleById}
            onDraftStart={beginDraft}
            onDraftChange={changeDraft}
            onDraftEnd={endDraft}
            onDraftCancel={cancelDraft}
            conditionNotice={notice ? { text: notice, tone: 'recalculated' } : null}
            trailResetById={trailResetById}
          />
          <ParticleRoster
            particles={rosterParticles}
            onSelect={selectParticleById}
            onAdd={addNewParticle}
            onDuplicate={copySelected}
            onRemove={deleteSelected}
            onRelaunchSelected={relaunchSelected}
            onRelaunchAll={relaunchAllParticles}
            onToggleTrail={toggleSelectedTrail}
            onClearTrail={clearSelectedTrail}
            onToggleVisible={toggleSelectedVisible}
          />
          {teacher ? (
            <TeacherDock
              formula={'\\vec F_B=q\\vec v\\times\\vec B,\\qquad r=\\frac{mv}{|q|B},\\qquad T=\\frac{2\\pi m}{|q|B}'}
              stats={[
                { label: '粒子数', value: `${scene.particles.length}/5` },
                { label: `半径 ${selectedLabel}`, value: selectedModel?.circular ? formatLength(selectedModel.radiusM) : '∞' },
                { label: `周期 ${selectedLabel}`, value: selectedModel?.circular ? formatTime(selectedModel.periodS) : '—' },
                { label: `|F| ${selectedLabel}`, value: selectedState && selectedModel?.circular ? formatForce(Math.hypot(selectedState.force.x, selectedState.force.y)) : '0 N' },
              ]}
              footnote={`tGlobal = ${formatTime(clock.time)} · 选中 ${selectedLabel}；公共 Bz 变化会重算全部粒子。`}
              controls={teacherControls}
            />
          ) : null}
          <PlaybackBar
            clock={clock}
            duration={duration}
            keyFrames={keyFrames}
            timeLabel={formatTime(clock.time)}
            secondaryLabel={`${selectedLabel} τ = ${selectedTau === null ? '未发射' : formatTime(selectedTau)}`}
            timelineLabel="P01 多粒子全局时间轴"
            note="播放中拖动当前粒子只重发射它；修改公共 Bz 会整场重算并从 t=0 重演。"
          />
        </div>

        {!teacher ? (
          <aside className="sim-panel" aria-label="P01 平面运动控制台">
            <PanelTabs<PanelTabId>
              label="实验面板"
              active={tab}
              onChange={setTab}
              tabs={[
                { id: 'params', label: '参数', icon: <Icon name="sliders" size={16} /> },
                { id: 'lesson', label: '讲解', icon: <Icon name="book" size={16} /> },
                { id: 'practice', label: '练习', count: questionsForModel('p01').length, icon: <Icon name="check" size={16} /> },
                { id: 'data', label: '数据', icon: <Icon name="ruler" size={16} /> },
              ]}
            />
            <div className="sim-panel-body" role="tabpanel">
              {tab === 'params' ? (
                <div className="panel-section-stack">
                  <div className="panel-intro">
                    <div>
                      <h2>共享 Bz · 独立初态</h2>
                      <p>当前选中 {selectedLabel}。单粒子修改只重发射它；公共 Bz 修改整场重演。</p>
                    </div>
                  </div>
                  <div className="preset-chips" aria-label="P01 平面预设">
                    <button type="button" className="chip-button" onClick={() => loadPreset(P01_PLANAR_PRESETS['p01-motion-default'])}>三粒子默认</button>
                    <button type="button" className="chip-button" onClick={() => loadPreset(P01_PLANAR_PRESETS['p01-motion-sign'])}>正负对比</button>
                    <button type="button" className="chip-button" onClick={() => loadPreset(P01_PLANAR_PRESETS['p01-motion-radius'])}>质量对比</button>
                    <button type="button" className="chip-button" onClick={() => loadPreset(P01_PLANAR_PRESETS['p01-motion-five'])}>五粒子</button>
                    <button type="button" className="chip-button" onClick={() => patchField({ fieldMag: 0 })}>B = 0</button>
                  </div>
                  <section className="panel-section">
                    <h3 className="section-title">共享磁场 Bz</h3>
                    <div className="field-label-row">
                      <div>
                        <span className="field-label">磁场方向</span>
                        <p className="field-hint">公共场变化让全部粒子同步从 t=0 重新演示</p>
                      </div>
                      <Segmented
                        ariaLabel="P01 Bz 方向"
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
                  </section>
                  <section className="panel-section">
                    <h3 className="section-title">粒子 {selectedLabel}</h3>
                    <Segmented
                      ariaLabel="P01 粒子电荷"
                      size="sm"
                      value={selectedDisplay?.chargeSign ?? 1}
                      onChange={(value) => patchSelectedParticle({ chargeSign: value === 1 ? 1 : -1 })}
                      options={[{ value: 1, label: '+ 正电荷' }, { value: -1, label: '− 负电荷' }]}
                    />
                    <ParamSlider label="电荷量 |q|" value={selectedDisplay?.chargeMag ?? 1} min={0} max={3} step={0.1} unit="e" decimals={1} onChange={(value) => patchSelectedParticle({ chargeMag: value })} />
                    <ParamSlider label="质量 m" value={selectedDisplay?.massUnits ?? 1} min={0.1} max={5} step={0.01} unit="×10⁻²⁶ kg" decimals={2} onChange={(value) => patchSelectedParticle({ massUnits: value })} />
                    <ParamSlider label="速度大小 v" value={selectedDisplay?.speedUnits ?? 2} min={0} max={5} step={0.1} unit="×10⁶ m/s" decimals={1} onChange={(value) => patchSelectedParticle({ speedUnits: value })} />
                    <ParamSlider label="速度方向 θ" value={selectedDisplay?.directionDeg ?? 0} min={0} max={360} step={1} unit="°" decimals={0} onChange={(value) => patchSelectedParticle({ directionDeg: value })} />
                    <div className="two-col-params">
                      <ParamSlider label="入射点 x" value={(selectedDisplay?.startX ?? -0.15) * 100} min={-50} max={50} step={0.5} unit="cm" decimals={1} onChange={(value) => patchSelectedParticle({ startX: value / 100 })} />
                      <ParamSlider label="入射点 y" value={(selectedDisplay?.startY ?? 0) * 100} min={-50} max={50} step={0.5} unit="cm" decimals={1} onChange={(value) => patchSelectedParticle({ startY: value / 100 })} />
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
                      <input ref={importRef} type="file" accept="application/json,.json" hidden data-testid="p01-planar-scene-import" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importScene(file); event.target.value = ''; }} />
                    </div>
                  </section>
                  <button type="button" className="secondary-button wide-button" onClick={() => loadPreset(P01_PLANAR_PRESETS['p01-motion-default'])}>
                    <Icon name="reset" size={17} />恢复默认平面场景
                  </button>
                </div>
              ) : null}
              {tab === 'lesson' ? (
                <LessonRunner
                  steps={P01_MOTION_LESSON}
                  storageKey="emplab.p01.motion.lesson.v1"
                  overview={{
                    goals: ['在同一平面磁场中比较正负电荷、不同速度/质量的轨迹与转向。', '用 F=qv×B 与圆周运动求半径/周期。', '掌握播放中单粒子编辑与共享 B 重算的边界。'],
                    prerequisites: ['洛伦兹力方向', '匀速圆周运动与向心力', '全局时间与局部时间'],
                    misconceptions: ['认为质量越大洛伦兹力越大。', '认为编辑一个粒子会让所有粒子重新发射。', '把正负电荷的弯曲方向混为一谈。'],
                  }}
                  onApplyPreset={applyLessonPreset}
                  onGoPractice={() => setTab('practice')}
                />
              ) : null}
              {tab === 'practice' ? <PracticePanel modelId="p01" /> : null}
              {tab === 'data' ? (
                <div className="panel-section-stack">
                  <div className="panel-intro">
                    <div><h2>多粒子平面运动</h2><p>全局 t = {formatTime(clock.time)}；选中 {selectedLabel} 的局部 τ = {selectedTau === null ? '尚未发射' : formatTime(selectedTau)}。</p></div>
                  </div>
                  <div className="particle-compare-table" data-testid="p01-planar-compare">
                    <div className="particle-compare-head"><span>粒子</span><span>q/e</span><span>m</span><span>|v|</span><span>R</span><span>T</span><span>τ</span></div>
                    {evaluations.map((item) => {
                      const display = p02ParticleDisplay(item.particle);
                      return (
                        <button key={item.particle.id} type="button" className={`particle-compare-row ${item.particle.id === scene.activeParticleId ? 'is-selected' : ''}`} onClick={() => selectParticleById(item.particle.id)} data-testid={`p01-planar-row-${item.particle.label}`}>
                          <span className="particle-compare-label" style={{ color: item.particle.color }}><i style={{ background: item.particle.color }} />{item.particle.label}</span>
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
                  <ReadoutGrid items={[
                    { label: `轨道半径 r（${selectedLabel}）`, value: selectedModel?.circular ? formatLength(selectedModel.radiusM) : '∞ / 直线', testId: 'p01-planar-radius' },
                    { label: '周期 T', value: selectedModel?.circular ? formatTime(selectedModel.periodS) : '—', testId: 'p01-planar-period' },
                    { label: '当前速度', value: selectedState ? formatVelocity(selectedState.speed) : '尚未发射', testId: 'p01-planar-speed' },
                    { label: '洛伦兹力 |F|', value: selectedState && selectedModel?.circular ? formatForce(Math.hypot(selectedState.force.x, selectedState.force.y)) : '0 N', testId: 'p01-planar-force' },
                    { label: '转向', value: selectedModel?.direction === 'clockwise' ? '顺时针' : selectedModel?.direction === 'counterclockwise' ? '逆时针' : '无', testId: 'p01-planar-direction' },
                    { label: '局部时间 τ', value: selectedTau === null ? '尚未发射' : formatTime(selectedTau), testId: 'p01-planar-local-time' },
                  ]} />
                  <section className="formula-card">
                    <p className="eyebrow">平面运动的尺度</p>
                    <MathTex block>{'\\vec F_B=q\\vec v\\times\\vec B,\\qquad r=\\frac{mv}{|q|B},\\qquad T=\\frac{2\\pi m}{|q|B}'}</MathTex>
                    <p>|F_B| 在同一时刻由 q、v、B 决定；质量改变 r 与 T，但不改变该时刻的力（若 v 相同）。</p>
                  </section>
                  <div className="callout callout-note">
                    <Icon name="info" size={18} />
                    <p>P01 平面模式复用了 P02 的解析圆周运动和第五轮多粒子控制器；公共 Bz 变化整场重演，单粒子初态修改只重发射该粒子。</p>
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
