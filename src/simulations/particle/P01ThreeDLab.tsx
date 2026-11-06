import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { usePersistentState } from '../../hooks/usePersistentState';
import { usePlaybackClock } from '../../hooks/usePlaybackClock';
import {
  formatForce,
  formatLength,
  formatNumber,
  formatSI,
  formatTime,
} from '../../lib/format';
import {
  isFiniteVec3,
  lorentzForceSnapshot,
  type Vec3,
} from '../../physics/particles/lorentzForce';
import { particleTau } from '../../physics/particles/multiParticle';
import {
  sampleUniformB3DPath,
  uniformB3DStateAt,
} from '../../physics/particles/uniformB3D';
import {
  P01_THREE_PRESET_CAMERAS,
  P01_THREE_PRESETS,
  P01_THREE_SCENE_KEY,
  activeThreeDParticle,
  addThreeDParticle,
  applySharedB,
  decodeP01ThreeDSceneJson,
  duplicateThreeDParticle,
  loadInitialP01ThreeDScene,
  migrateForceSceneToThreeD,
  p01ThreeDCircleCenter,
  p01ThreeDDuration,
  p01ThreeDKeyFrames,
  p01ThreeDModelFor,
  parseP01ThreeDScene,
  relaunchAllThreeD,
  relaunchThreeDParticle,
  removeThreeDParticle,
  selectThreeDParticle,
  serializeP01ThreeDScene,
  toLegacyForceScene,
  updateThreeDParticle,
  updateThreeDParticleAndRelaunch,
  type P01CameraPreset,
  type P01EditPlane,
  type P01ThreeDParticle,
  type P01ThreeDScene,
  type P01ThreeDSeed,
} from './p01ThreeDScene';
import {
  P01_FORCE_PRESETS,
  type P01ForceParticle,
  type P01ForceScene,
} from './p01ForceScene';
import { P01_FORCE_DEFAULT_LAYERS, P01ForceStage, type P01ForceLayers } from './P01ForceStage';
import { P01Header, type LearningMode, type P01ViewMode } from './P01Header';
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
import { P01_FORCE_LESSON, P01_MOTION3D_LESSON } from '../../content/lessons';
import { WebGLFallback } from '../../components/three/WebGLFallback';
import { detectWebGL } from '../../components/three/webgl';
import type {
  P01HandleKind,
  P01ThreeDLayers,
  P01ThreeDViewParticle,
} from './P01ThreeDStage';

const P01ThreeDStage = lazy(() =>
  import('./P01ThreeDStage').then((module) => ({ default: module.P01ThreeDStage })),
);

type PanelTabId = 'params' | 'lesson' | 'practice' | 'data';

interface P01ThreeDViewPrefs {
  cameraPreset: P01CameraPreset;
  editPlane: P01EditPlane;
  lowGraphics: boolean;
  layers: P01ThreeDLayers;
}

const P01_THREE_VIEW_KEY = 'emplab.p01.three.view.v1';
let lastAppliedThreePresetId: string | null = null;
const DEFAULT_LAYERS: P01ThreeDLayers = {
  axes: true,
  grid: true,
  field: true,
  velocity: true,
  force: true,
  allVectors: false,
  predicted: true,
  traveled: true,
  decomposition: true,
  plane: false,
  labels: true,
  aux: true,
};
const DEFAULT_VIEW: P01ThreeDViewPrefs = {
  cameraPreset: 'oblique',
  editPlane: 'XY',
  lowGraphics: false,
  layers: DEFAULT_LAYERS,
};

interface Draft {
  particleId: string;
  draftParticle: P01ThreeDParticle;
  startedAtGlobalTime: number;
}

interface P01ThreeDLabProps {
  mode: 'force3d' | 'motion3d';
  learningMode: LearningMode;
  teacher: boolean;
  presetId: string | null;
  onModeChange: (mode: P01ViewMode) => void;
  onLearningModeChange: (mode: LearningMode) => void;
  onTeacherChange: (teacher: boolean) => void;
  onPresetConsumed?: () => void;
}

const ZERO_REASON_LABEL: Record<string, string> = {
  none: '非零力',
  invalid: '输入无效',
  'zero-charge': 'q = 0',
  'zero-field': 'B = 0',
  'zero-velocity': 'v = 0',
  parallel: 'v ∥ B',
  'anti-parallel': 'v 反平行 B',
};

function vectorText(vector: Vec3): string {
  return `(${formatNumber(vector.x, 2)}, ${formatNumber(vector.y, 2)}, ${formatNumber(vector.z, 2)})`;
}

function uniqueFrames(frames: KeyFrame[]): KeyFrame[] {
  const map = new Map<number, KeyFrame>();
  for (const frame of frames) {
    const key = Math.round(frame.time * 1e9) / 1e9;
    if (!map.has(key)) map.set(key, frame);
  }
  return [...map.values()].sort((left, right) => left.time - right.time);
}

function legacyParticle(scene: P01ForceScene, id: string): P01ForceParticle {
  return scene.particles.find((particle) => particle.id === id) ?? scene.particles[0];
}

function validDraftParticle(particle: P01ThreeDParticle): boolean {
  return (
    isFiniteVec3(particle.position) &&
    isFiniteVec3(particle.velocity) &&
    Number.isFinite(particle.chargeC) &&
    Number.isFinite(particle.massKg) &&
    particle.massKg > 0
  );
}

export function P01ThreeDLab({
  mode,
  learningMode,
  teacher,
  presetId,
  onModeChange,
  onLearningModeChange,
  onTeacherChange,
  onPresetConsumed,
}: P01ThreeDLabProps) {
  const initialScene = useMemo(() => loadInitialP01ThreeDScene(), []);
  const initialStored = useMemo(() => JSON.parse(serializeP01ThreeDScene(initialScene)) as unknown, [initialScene]);
  const [storedScene, setStoredScene] = usePersistentState<unknown>(P01_THREE_SCENE_KEY, initialStored);
  const scene = useMemo(() => parseP01ThreeDScene(storedScene).scene ?? initialScene, [initialScene, storedScene]);
  useEffect(() => {
    // Mode switches unmount this view. Write synchronously so the selected
    // particle and 3D scene are already available when it mounts again.
    try {
      window.localStorage.setItem(P01_THREE_SCENE_KEY, JSON.stringify(storedScene));
    } catch {
      // Persistence failure must not block the experiment.
    }
  }, [storedScene]);
  const [storedView, setStoredView] = usePersistentState<Partial<P01ThreeDViewPrefs>>(
    P01_THREE_VIEW_KEY,
    DEFAULT_VIEW,
  );
  const viewPrefs = useMemo<P01ThreeDViewPrefs>(() => {
    const candidate = storedView ?? {};
    const cameraPreset: P01CameraPreset =
      candidate.cameraPreset && ['front', 'side', 'top', 'oblique', 'reset', 'custom'].includes(candidate.cameraPreset)
        ? candidate.cameraPreset
        : DEFAULT_VIEW.cameraPreset;
    const editPlane: P01EditPlane =
      candidate.editPlane === 'XZ' || candidate.editPlane === 'YZ' ? candidate.editPlane : 'XY';
    return {
      cameraPreset,
      editPlane,
      lowGraphics: candidate.lowGraphics === true,
      layers: { ...DEFAULT_LAYERS, ...(candidate.layers ?? {}) },
    };
  }, [storedView]);
  const layers = viewPrefs.layers;
  const [tab, setTab] = useState<PanelTabId>(learningMode === 'guided' ? 'lesson' : 'params');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [trailResetById, setTrailResetById] = useState<Record<string, number>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [stageMode, setStageMode] = useState<StageMode>('interact');
  const [webgl, setWebgl] = useState(() => detectWebGL());
  const [contextLostReason, setContextLostReason] = useState<string | null>(null);
  const importRef = useRef<HTMLInputElement | null>(null);
  const noticeTimer = useRef<number | null>(null);
  const sceneRef = useRef(scene);
  const draftRef = useRef<Draft | null>(draft);
  const globalTimeRef = useRef(0);
  const applyPresetRef = useRef<(id: string) => void>(() => undefined);
  const onPresetConsumedRef = useRef(onPresetConsumed);
  onPresetConsumedRef.current = onPresetConsumed;
  sceneRef.current = scene;
  draftRef.current = draft;

  const duration = useMemo(() => p01ThreeDDuration(scene), [scene]);
  const keyFrames = useMemo(() => uniqueFrames(p01ThreeDKeyFrames(scene) as KeyFrame[]), [scene]);
  const keyTimes = useMemo(() => keyFrames.map((frame) => frame.time), [keyFrames]);
  const clock = usePlaybackClock(duration, keyTimes);
  globalTimeRef.current = clock.time;
  const displayTime = mode === 'motion3d' ? clock.time : 0;

  useEffect(() => {
    setTab(learningMode === 'guided' ? 'lesson' : 'params');
  }, [learningMode]);

  useEffect(() => {
    if (mode === 'force3d') clock.pause();
  }, [clock.pause, mode]);

  useEffect(() => () => {
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
  }, []);

  const showNotice = (text: string) => {
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
    setNotice(text);
    noticeTimer.current = window.setTimeout(() => {
      setNotice(null);
      noticeTimer.current = null;
    }, 3200);
  };

  const commitScene = (next: P01ThreeDScene) => {
    setStoredScene(JSON.parse(serializeP01ThreeDScene(next)) as unknown);
  };

  const patchView = (patch: Partial<P01ThreeDViewPrefs>) => {
    setStoredView((previous) => ({ ...DEFAULT_VIEW, ...(previous ?? {}), ...patch, layers: patch.layers ?? previous?.layers ?? DEFAULT_LAYERS }));
  };

  const resetTrail = () => setTrailResetById({});

  const applyPreset = (id: string) => {
    const direct = P01_THREE_PRESETS[id];
    const legacy = P01_FORCE_PRESETS[id];
    const next = direct ?? (legacy ? migrateForceSceneToThreeD(legacy) : null);
    if (!next) return;
    const cloned = parseP01ThreeDScene(JSON.parse(serializeP01ThreeDScene(next))).scene ?? next;
    commitScene(cloned);
    setDraft(null);
    resetTrail();
    clock.reset();
    const camera = P01_THREE_PRESET_CAMERAS[id];
    if (camera && camera !== 'custom') patchView({ cameraPreset: camera });
    if (id.startsWith('p01-motion3d-') && mode !== 'motion3d') onModeChange('motion3d');
    else if ((id.startsWith('p01-3d-') || id.startsWith('p01-force-')) && mode !== 'force3d') onModeChange('force3d');
    showNotice(`已载入三维预设 · 全局时钟归零 · 相机保持独立`);
  };
  applyPresetRef.current = applyPreset;

  useEffect(() => {
    if (!presetId) return;
    if (lastAppliedThreePresetId === presetId) {
      onPresetConsumedRef.current?.();
      return;
    }
    lastAppliedThreePresetId = presetId;
    applyPresetRef.current(presetId);
    onPresetConsumedRef.current?.();
  }, [presetId]);

  const displayScene = useMemo(() => displaySceneFor(scene, draft), [scene, draft]);
  const sampleCount = viewPrefs.lowGraphics ? 72 : 180;
  const pathData = useMemo(
    () =>
      displayScene.particles.map((particle) => {
        const model = p01ThreeDModelFor(displayScene, particle);
        const launchTimeSec = displayScene.runtimeById[particle.id]?.launchTimeSec ?? 0;
        const pathLimit = Math.max(
          0.6,
          Math.min(
            Math.max(0.6, duration - launchTimeSec),
            model.periodS ? 2 * model.periodS : 6,
          ),
        );
        return {
          particle,
          model,
          launchTimeSec,
          pathLimit,
          predictedPath: sampleUniformB3DPath(model, 0, pathLimit, sampleCount),
          helixCenter: p01ThreeDCircleCenter(model, particle),
        };
      }),
    [displayScene, duration, sampleCount],
  );

  const viewParticles = useMemo<P01ThreeDViewParticle[]>(() => {
    return pathData.map(({ particle, model, launchTimeSec, pathLimit, predictedPath, helixCenter }) => {
      const isDraft = draft?.particleId === particle.id;
      const runtime = displayScene.runtimeById[particle.id];
      const tauS =
        mode === 'force3d'
          ? 0
          : isDraft
            ? 0
            : particleTau(runtime, clock.time);
      const state = tauS === null ? null : uniformB3DStateAt(model, tauS);
      const resetAt = trailResetById[particle.id] ?? 0;
      const effectiveTau = tauS === null ? null : Math.max(0, tauS - resetAt);
      const travelProgress = effectiveTau === null ? 0 : Math.max(0, Math.min(1, effectiveTau / pathLimit));
      return {
        particle,
        model,
        tauS,
        state,
        predictedPath,
        travelProgress,
        isDraft,
        waiting: tauS === null && mode === 'motion3d',
        helixCenter,
        launchTimeSec,
      };
    });
  }, [clock.time, displayScene.runtimeById, draft?.particleId, mode, pathData, trailResetById]);

  const selectedView = viewParticles.find((item) => item.particle.id === scene.activeParticleId) ?? viewParticles[0] ?? null;
  const selectedSnapshot = selectedView
    ? lorentzForceSnapshot({
        chargeC: selectedView.particle.chargeC,
        massKg: selectedView.particle.massKg,
        velocity:
          mode === 'motion3d' && selectedView.state
            ? selectedView.state.velocity
            : selectedView.particle.velocity,
        B: scene.field.B,
      })
    : null;

  const patchSelected = (patch: Partial<P01ThreeDSeed>) => {
    const current = activeThreeDParticle(sceneRef.current);
    if (!current) return;
    commitScene(updateThreeDParticleAndRelaunch(sceneRef.current, current.id, patch, globalTimeRef.current));
    setDraft(null);
    showNotice(`${current.label} 已按新初态重新发射 · 其他粒子继续运动`);
  };
  const patchField = (patch: Partial<Vec3>) => {
    commitScene(applySharedB(sceneRef.current, { ...sceneRef.current.field.B, ...patch }));
    setDraft(null);
    resetTrail();
    clock.restart();
    if (mode === 'force3d') clock.pause();
    showNotice('共享 B 改变：全部粒子同步重算并从 tGlobal=0 重演；相机方向不变');
  };
  const beginDraft = (_kind: P01HandleKind) => {
    const current = activeThreeDParticle(sceneRef.current);
    if (!current || draftRef.current) return;
    setDraft({
      particleId: current.id,
      draftParticle: { ...current, position: { ...current.position }, velocity: { ...current.velocity } },
      startedAtGlobalTime: globalTimeRef.current,
    });
    showNotice(`正在编辑 ${current.label} 的初态 · 全局时钟继续，其他粒子不受影响`);
  };
  const changeDraft = (patch: { position?: Vec3; velocity?: Vec3 }) => {
    setDraft((previous) => {
      if (!previous) return previous;
      const next: P01ThreeDParticle = {
        ...previous.draftParticle,
        position: patch.position ? { ...patch.position } : previous.draftParticle.position,
        velocity: patch.velocity ? { ...patch.velocity } : previous.draftParticle.velocity,
      };
      if (!validDraftParticle(next)) return previous;
      return { ...previous, draftParticle: next };
    });
  };
  const endDraft = () => {
    const current = draftRef.current;
    if (!current) return;
    const { position, velocity, chargeC, massKg, visible, showTrail } = current.draftParticle;
    commitScene(
      updateThreeDParticleAndRelaunch(
        sceneRef.current,
        current.particleId,
        { position, velocity, chargeC, massKg, visible, showTrail },
        globalTimeRef.current,
      ),
    );
    setDraft(null);
    showNotice(`${current.draftParticle.label} 已从当前 tGlobal 单独重新发射 · 其他粒子未重置`);
  };
  const cancelDraft = () => {
    if (!draftRef.current) return;
    setDraft(null);
    showNotice('已取消草稿 · 未修改初态 · 其他粒子未受影响');
  };
  const selectParticleById = (id: string) => {
    if (draftRef.current) setDraft(null);
    commitScene(selectThreeDParticle(sceneRef.current, id));
  };
  const addNewParticle = () => {
    const current = activeThreeDParticle(sceneRef.current);
    if (!current) return;
    const result = addThreeDParticle(
      sceneRef.current,
      {
        position: { ...current.position, y: current.position.y + 0.45 },
        velocity: { ...current.velocity },
        chargeC: current.chargeC,
        massKg: current.massKg,
        visible: true,
        showTrail: true,
      },
      globalTimeRef.current,
    );
    if (!result.particle) {
      showNotice('最多支持 5 个粒子');
      return;
    }
    commitScene(result.scene);
    setDraft(null);
    showNotice(`已添加 ${result.particle.label} · 从当前 tGlobal 发射`);
  };
  const copySelected = () => {
    const current = activeThreeDParticle(sceneRef.current);
    if (!current) return;
    const result = duplicateThreeDParticle(sceneRef.current, current.id, globalTimeRef.current);
    if (!result.particle) return;
    commitScene(result.scene);
    setDraft(null);
    showNotice(`已复制 ${current.label} → ${result.particle.label}`);
  };
  const deleteSelected = () => {
    const current = activeThreeDParticle(sceneRef.current);
    if (!current || sceneRef.current.particles.length <= 1) return;
    commitScene(removeThreeDParticle(sceneRef.current, current.id));
    setDraft(null);
  };
  const relaunchSelected = () => {
    const current = activeThreeDParticle(sceneRef.current);
    if (!current) return;
    commitScene(relaunchThreeDParticle(sceneRef.current, current.id, globalTimeRef.current));
    setTrailResetById((previous) => ({ ...previous, [current.id]: globalTimeRef.current }));
    setDraft(null);
    showNotice(`${current.label} 已从当前 tGlobal 单独重新发射`);
  };
  const relaunchAll = () => {
    commitScene(relaunchAllThreeD(sceneRef.current));
    resetTrail();
    clock.restart();
    setDraft(null);
    showNotice('全部粒子已从 tGlobal=0 同步重新发射');
  };
  const toggleSelectedTrail = () => {
    const current = activeThreeDParticle(sceneRef.current);
    if (!current) return;
    commitScene(updateThreeDParticle(sceneRef.current, current.id, { showTrail: !current.showTrail }));
  };
  const toggleSelectedVisible = () => {
    const current = activeThreeDParticle(sceneRef.current);
    if (!current) return;
    commitScene(updateThreeDParticle(sceneRef.current, current.id, { visible: !current.visible }));
  };
  const clearSelectedTrail = () => {
    const current = activeThreeDParticle(sceneRef.current);
    if (!current) return;
    setTrailResetById((previous) => ({ ...previous, [current.id]: globalTimeRef.current }));
  };
  const exportScene = () => {
    const blob = new Blob([serializeP01ThreeDScene(sceneRef.current)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'p01-3d-scene.json';
    anchor.click();
    URL.revokeObjectURL(url);
    showNotice('P01 三维场景已导出');
  };
  const importScene = async (file: File) => {
    const parsed = decodeP01ThreeDSceneJson(await file.text());
    if (!parsed.scene) {
      showNotice(`导入失败：${parsed.error ?? '格式无效'}`);
      return;
    }
    commitScene(relaunchAllThreeD(parsed.scene));
    setDraft(null);
    resetTrail();
    clock.reset();
    showNotice('三维场景已导入 · 全部粒子从 tGlobal=0 重新呈现');
  };
  const retryWebGL = () => {
    setContextLostReason(null);
    setWebgl(detectWebGL());
  };

  const rosterParticles: RosterParticle[] = viewParticles.map((item) => ({
    id: item.particle.id,
    label: item.particle.label,
    color: item.particle.color,
    lineStyle: item.particle.lineStyle,
    visible: item.particle.visible,
    showTrail: item.particle.showTrail,
    selected: item.particle.id === scene.activeParticleId,
    launchTimeSec: scene.runtimeById[item.particle.id]?.launchTimeSec ?? 0,
    tauS: mode === 'motion3d' ? item.tauS : 0,
  }));

  const selectedLabel = selectedView?.particle.label ?? 'A';
  const selectedModel = selectedView?.model ?? null;
  const selectedTau = mode === 'motion3d' ? selectedView?.tauS ?? null : 0;

  const teacherLayerItems: Array<{ key: keyof P01ThreeDLayers; label: string; short: string }> = [
    { key: 'field', label: '共享磁场 B', short: 'B' },
    { key: 'velocity', label: '速度矢量', short: 'v' },
    { key: 'force', label: '洛伦兹力 F', short: 'F' },
    { key: 'allVectors', label: '所有粒子的矢量', short: '全部矢量' },
    { key: 'predicted', label: '完整预测路径', short: '预测' },
    { key: 'traveled', label: '已走路径', short: '已走' },
    { key: 'decomposition', label: 'v∥ / v⊥ 分解', short: '分解' },
    { key: 'plane', label: '垂直于 B 的参考面', short: '参考面' },
    { key: 'aux', label: '螺旋轴/半径辅助', short: '螺旋轴' },
    { key: 'axes', label: '世界坐标轴', short: '坐标轴' },
    { key: 'labels', label: '标签', short: '标签' },
  ];
  const teacherControls = (
    <div className="teacher-layer-bar" role="group" aria-label="P01 三维教师图层">
      {teacherLayerItems.map((item) => (
        <button
          key={item.key}
          type="button"
          className="teacher-layer-chip"
          aria-pressed={layers[item.key]}
          onClick={() => patchView({ layers: { ...layers, [item.key]: !layers[item.key] } })}
        >
          {item.short}
        </button>
      ))}
      <button
        type="button"
        className="teacher-layer-chip teacher-formula-toggle"
        aria-pressed={!layers.force}
        onClick={() => patchView({ layers: { ...layers, force: !layers.force } })}
      >
        {layers.force ? '隐藏答案 F' : '揭示答案 F'}
      </button>
      <button type="button" className="teacher-layer-chip" onClick={() => patchView({ layers: { ...layers, velocity: true, force: false, field: false, allVectors: false } })}>
        仅 v
      </button>
      <button type="button" className="teacher-layer-chip" onClick={() => patchView({ layers: { ...layers, velocity: false, force: false, field: true, allVectors: false } })}>
        仅 B
      </button>
      <button type="button" className="teacher-layer-chip" onClick={() => patchView({ layers: { ...layers, velocity: true, force: true, field: true, allVectors: true } })}>
        全部
      </button>
    </div>
  );

  const fallbackReason = contextLostReason ?? (!webgl.available ? webgl.reason : null);
  const fallback = fallbackReason !== null;
  const legacyScene = useMemo(() => toLegacyForceScene(displayScene), [displayScene]);
  const legacySelected = legacyParticle(legacyScene, scene.activeParticleId);
  const legacySnapshot = lorentzForceSnapshot({
    chargeC: legacySelected.chargeC,
    massKg: legacySelected.massKg,
    velocity: legacySelected.velocity,
    B: legacyScene.field.B,
  });
  const legacyLayers: P01ForceLayers = {
    ...P01_FORCE_DEFAULT_LAYERS,
    field: layers.field,
    velocity: layers.velocity,
    force: layers.force,
    magnitude: layers.labels,
    axes: layers.axes,
    projection: false,
  };

  const lesson = mode === 'motion3d' ? P01_MOTION3D_LESSON : P01_FORCE_LESSON;
  const lessonStorageKey = mode === 'motion3d' ? 'emplab.p01.three.motion.lesson.v1' : 'emplab.p01.three.force.lesson.v1';

  const stage = fallback ? (
    <div className="p01-3d-fallback-stack">
      <WebGLFallback reason={fallbackReason} onRetry={retryWebGL} onUse2D={() => onModeChange('planar')} />
      <P01ForceStage
        scene={legacyScene}
        particle={legacySelected}
        snapshot={legacySnapshot}
        layers={legacyLayers}
        stageMode={stageMode}
        onStageModeChange={setStageMode}
      />
    </div>
  ) : (
    <Suspense fallback={<div className="p01-3d-loading" role="status">正在加载 WebGL 三维场景…</div>}>
      <P01ThreeDStage
        mode={mode}
        scene={displayScene}
        viewParticles={viewParticles}
        selectedId={scene.activeParticleId}
        displayTime={displayTime}
        playing={clock.playing}
        duration={duration}
        cameraPreset={viewPrefs.cameraPreset}
        editPlane={viewPrefs.editPlane}
        layers={layers}
        lowGraphics={viewPrefs.lowGraphics}
        editing={draft !== null}
        onCameraPresetChange={(preset) => patchView({ cameraPreset: preset })}
        onCameraInteraction={() => patchView({ cameraPreset: 'custom' })}
        onEditPlaneChange={(plane) => patchView({ editPlane: plane })}
        onSelectParticle={selectParticleById}
        onHandleDragStart={beginDraft}
        onHandleDrag={changeDraft}
        onHandleDragEnd={endDraft}
        onHandleDragCancel={cancelDraft}
        onUse2D={() => onModeChange('planar')}
        onContextLost={(reason) => setContextLostReason(reason)}
      />
    </Suspense>
  );

  return (
    <div
      className={`sim-page p01-three-page ${teacher ? 'sim-teacher' : ''}`}
      data-testid="p01-three-page"
      data-sim-playing={mode === 'motion3d' ? clock.playing : false}
      data-sim-editing={draft !== null}
      data-sim-time={mode === 'motion3d' ? clock.time : 0}
      data-p01-mode={mode}
      data-particle-count={scene.particles.length}
      data-active-particle-id={scene.activeParticleId}
      data-webgl-available={!fallback}
    >
      <P01Header
        mode={mode}
        learningMode={learningMode}
        teacher={teacher}
        onModeChange={onModeChange}
        onLearningModeChange={onLearningModeChange}
        onTeacherChange={onTeacherChange}
      />
      <div className={`sim-layout ${teacher ? 'sim-layout-teacher' : ''}`}>
        <div className="sim-stage-column">
          {stage}
          <ParticleRoster
            particles={rosterParticles}
            onSelect={selectParticleById}
            onAdd={addNewParticle}
            onDuplicate={copySelected}
            onRemove={deleteSelected}
            onRelaunchSelected={relaunchSelected}
            onRelaunchAll={relaunchAll}
            onToggleTrail={toggleSelectedTrail}
            onClearTrail={clearSelectedTrail}
            onToggleVisible={toggleSelectedVisible}
            showTime={mode === 'motion3d'}
            showLaunchActions={mode === 'motion3d'}
            showTrailActions={mode === 'motion3d'}
            showVisibilityAction
          />
          {teacher ? (
            <TeacherDock
              formula={'\\vec F_B=q(\\vec v\\times\\vec B),\\qquad R=\\frac{mv_\\perp}{|q||B|},\\qquad T=\\frac{2\\pi m}{|q||B|},\\qquad p=v_\\parallel T'}
              stats={[
                { label: '粒子数', value: `${scene.particles.length}/5` },
                { label: `R ${selectedLabel}`, value: selectedModel?.radiusM !== null && selectedModel?.radiusM !== undefined ? formatLength(selectedModel.radiusM) : '不适用' },
                { label: `T ${selectedLabel}`, value: selectedModel?.periodS !== null && selectedModel?.periodS !== undefined ? formatTime(selectedModel.periodS) : '不适用' },
                { label: `p ${selectedLabel}`, value: selectedModel?.pitchSignedM !== null && selectedModel?.pitchSignedM !== undefined ? formatLength(Math.abs(selectedModel.pitchSignedM)) : '不适用' },
                { label: `|F| ${selectedLabel}`, value: formatForce(selectedSnapshot?.magnitude ?? 0) },
              ]}
              footnote={`tGlobal = ${formatTime(mode === 'motion3d' ? clock.time : 0)} · 选中 ${selectedLabel}；相机方向属于观察状态，不进入物理计算。`}
              controls={teacherControls}
            />
          ) : null}
          {mode === 'motion3d' && !fallback ? (
            <PlaybackBar
              clock={clock}
              duration={duration}
              keyFrames={keyFrames}
              timeLabel={formatTime(clock.time)}
              secondaryLabel={`${selectedLabel} τ = ${selectedTau === null ? '待发射' : formatTime(selectedTau)}`}
              timelineLabel="P01 三维运动全局时间轴"
              note="播放中拖动 v/r₀ 只重发射选中粒子；共享 B 改变会整场重算并从 t=0 重演；相机操作不改变物理量。"
            />
          ) : null}
          <p className="muted-text small-note">
            无粒子间库仑力、相互磁场或碰撞；1–5 个粒子共享同一静态 B 与全局时钟。三维轨迹由解析解采样，不是屏幕空间动画。
          </p>
        </div>

        {!teacher ? (
          <aside className="sim-panel" aria-label="P01 三维实验控制台">
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
                      <h2>{mode === 'motion3d' ? '真实三维解析运动' : '真实三维受力检查'}</h2>
                      <p>
                        {mode === 'motion3d'
                          ? '轨迹严格来自 F=qv×B 的解析解；单指旋转相机、双指缩放，拖动手柄在指定平面内修改初态。'
                          : '围绕真实深度场景观察 v、B、F；相机姿态不改变世界分量。切换到 3D 运动查看圆周或螺旋轨迹。'}
                      </p>
                    </div>
                  </div>
                  <div className="preset-chips" aria-label="P01 三维预设">
                    {mode === 'motion3d' ? (
                      <>
                        <button type="button" className="chip-button" onClick={() => applyPreset('p01-motion3d-circle')}>圆轨迹</button>
                        <button type="button" className="chip-button" onClick={() => applyPreset('p01-motion3d-helix')}>螺旋线</button>
                        <button type="button" className="chip-button" onClick={() => applyPreset('p01-motion3d-reverse')}>B 反向</button>
                        <button type="button" className="chip-button" onClick={() => applyPreset('p01-motion3d-three')}>三粒子</button>
                        <button type="button" className="chip-button" onClick={() => applyPreset('p01-motion3d-five')}>五粒子</button>
                        <button type="button" className="chip-button" onClick={() => applyPreset('p01-motion3d-waiting')}>等待发射</button>
                      </>
                    ) : (
                      <>
                        <button type="button" className="chip-button" onClick={() => applyPreset('p01-3d-force-front')}>正电荷</button>
                        <button type="button" className="chip-button" onClick={() => applyPreset('p01-3d-force-negative')}>负电荷</button>
                        <button type="button" className="chip-button" onClick={() => applyPreset('p01-3d-force-parallel')}>v ∥ B</button>
                        <button type="button" className="chip-button" onClick={() => applyPreset('p01-3d-force-oblique')}>斜向</button>
                        <button type="button" className="chip-button" onClick={() => applyPreset('p01-3d-force-five')}>五粒子</button>
                      </>
                    )}
                  </div>

                  <section className="panel-section">
                    <h3 className="section-title">共享磁场 B（全实验）</h3>
                    {(['x', 'y', 'z'] as const).map((axis) => (
                      <ParamSlider
                        key={axis}
                        label={`B${axis}`}
                        value={scene.field.B[axis]}
                        min={-4}
                        max={4}
                        step={0.1}
                        unit="T"
                        decimals={1}
                        onChange={(value) => patchField({ [axis]: value } as Partial<Vec3>)}
                      />
                    ))}
                    <div className="preset-chips" aria-label="共享磁场方向快捷">
                      <button type="button" className="chip-button" onClick={() => patchField({ x: 1, y: 0, z: 0 })}>B +x</button>
                      <button type="button" className="chip-button" onClick={() => patchField({ x: 0, y: 1, z: 0 })}>B +y</button>
                      <button type="button" className="chip-button" onClick={() => patchField({ x: 0, y: 0, z: 1 })}>B +z</button>
                      <button type="button" className="chip-button" onClick={() => patchField({ x: 0, y: 0, z: -1 })}>B −z</button>
                    </div>
                    <p className="field-hint">修改 B 会重算全部粒子并从 t=0 重演；只旋转相机不会触发重算。</p>
                  </section>

                  <section className="panel-section">
                    <h3 className="section-title">粒子 {selectedLabel}</h3>
                    <div className="field-label-row">
                      <div>
                        <span className="field-label">电荷符号</span>
                        <p className="field-hint">负电荷的受力与旋转方向相对正电荷反向</p>
                      </div>
                      <Segmented
                        ariaLabel="P01 三维电荷符号"
                        size="sm"
                        value={(selectedView?.particle.chargeC ?? 1) < 0 ? -1 : 1}
                        onChange={(value) =>
                          patchSelected({
                            chargeC: value * Math.max(0.1, Math.abs(selectedView?.particle.chargeC ?? 1)),
                          })
                        }
                        options={[
                          { value: 1, label: '+ 正电荷' },
                          { value: -1, label: '− 负电荷' },
                        ]}
                      />
                    </div>
                    <ParamSlider
                      label="电荷量 |q|"
                      value={Math.abs(selectedView?.particle.chargeC ?? 0)}
                      min={0}
                      max={3}
                      step={0.1}
                      unit="C"
                      decimals={1}
                      onChange={(value) =>
                        patchSelected({
                          chargeC: ((selectedView?.particle.chargeC ?? 1) < 0 ? -1 : 1) * value,
                        })
                      }
                    />
                    <ParamSlider
                      label="质量 m"
                      value={selectedView?.particle.massKg ?? 1}
                      min={0.1}
                      max={5}
                      step={0.1}
                      unit="kg"
                      decimals={1}
                      onChange={(value) => patchSelected({ massKg: value })}
                    />
                    <div className="two-col-params">
                      {(['x', 'y', 'z'] as const).map((axis) => (
                        <ParamSlider
                          key={`r-${axis}`}
                          label={`初位置 r${axis}`}
                          value={selectedView?.particle.position[axis] ?? 0}
                          min={-4}
                          max={4}
                          step={0.1}
                          unit="m"
                          decimals={1}
                          onChange={(value) =>
                            patchSelected({
                              position: {
                                ...(selectedView?.particle.position ?? { x: 0, y: 0, z: 0 }),
                                [axis]: value,
                              } as Vec3,
                            })
                          }
                        />
                      ))}
                    </div>
                    {(['x', 'y', 'z'] as const).map((axis) => (
                      <ParamSlider
                        key={`v-${axis}`}
                        label={`初速度 v${axis}`}
                        value={selectedView?.particle.velocity[axis] ?? 0}
                        min={-5}
                        max={5}
                        step={0.1}
                        unit="m/s"
                        decimals={1}
                        onChange={(value) =>
                          patchSelected({
                            velocity: {
                              ...(selectedView?.particle.velocity ?? { x: 0, y: 0, z: 0 }),
                              [axis]: value,
                            } as Vec3,
                          })
                        }
                      />
                    ))}
                    <div className="preset-chips" aria-label="速度方向快捷">
                      <button type="button" className="chip-button" onClick={() => patchSelected({ velocity: { x: 1, y: 0, z: 0 } })}>v +x</button>
                      <button type="button" className="chip-button" onClick={() => patchSelected({ velocity: { x: 0, y: 1, z: 0 } })}>v +y</button>
                      <button type="button" className="chip-button" onClick={() => patchSelected({ velocity: { x: 0, y: 0, z: 1 } })}>v +z</button>
                      <button type="button" className="chip-button" onClick={() => patchSelected({ position: { x: 0, y: 0, z: 0 } })}>r₀ = 0</button>
                    </div>
                  </section>

                  <section className="panel-section">
                    <h3 className="section-title">空间编辑与显示</h3>
                    <div className="field-label-row">
                      <div>
                        <span className="field-label">手柄约束平面</span>
                        <p className="field-hint">二维手指位置不能唯一确定三维矢量；只改该平面的两个分量，固定分量保持不变。</p>
                      </div>
                      <Segmented<P01EditPlane>
                        ariaLabel="P01 三维拖拽平面"
                        size="sm"
                        value={viewPrefs.editPlane}
                        onChange={(plane) => patchView({ editPlane: plane })}
                        options={[
                          { value: 'XY', label: 'XY' },
                          { value: 'XZ', label: 'XZ' },
                          { value: 'YZ', label: 'YZ' },
                        ]}
                      />
                    </div>
                    <ToggleSwitch
                      label="低画质（降低采样与网格）"
                      checked={viewPrefs.lowGraphics}
                      onChange={(checked) => patchView({ lowGraphics: checked })}
                    />
                    <div className="toggle-list">
                      {teacherLayerItems.map((item) => (
                        <ToggleSwitch
                          key={item.key}
                          label={item.label}
                          checked={layers[item.key]}
                          onChange={() => patchView({ layers: { ...layers, [item.key]: !layers[item.key] } })}
                        />
                      ))}
                    </div>
                  </section>

                  <section className="panel-section">
                    <h3 className="section-title">场景数据</h3>
                    <div className="scene-io-row">
                      <button type="button" className="secondary-button" onClick={exportScene}>
                        <Icon name="download" size={16} />导出场景 JSON
                      </button>
                      <button type="button" className="secondary-button" onClick={() => importRef.current?.click()}>
                        <Icon name="upload" size={16} />导入场景 JSON
                      </button>
                      <input
                        ref={importRef}
                        type="file"
                        accept="application/json,.json"
                        hidden
                        data-testid="p01-3d-scene-import"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) void importScene(file);
                          event.target.value = '';
                        }}
                      />
                    </div>
                  </section>
                  <button type="button" className="secondary-button wide-button" onClick={() => applyPreset(mode === 'motion3d' ? 'p01-motion3d-helix' : 'p01-3d-force-front')}>
                    <Icon name="reset" size={17} />恢复本模式默认预设
                  </button>
                </div>
              ) : null}

              {tab === 'lesson' ? (
                <LessonRunner
                  steps={lesson}
                  storageKey={lessonStorageKey}
                  overview={{
                    goals: [
                      '在真实三维场景中旋转观察 v、B、F，理解叉乘顺序与电荷符号。',
                      '用速度分解解释直线、圆周和螺旋轨迹，并计算 R、T、螺距。',
                      '在 1–5 粒子场景中独立编辑一个粒子，同时保持其他粒子继续运动。',
                    ],
                    prerequisites: ['右手坐标与叉乘', '洛伦兹力公式', '圆周运动与速度分解'],
                    misconceptions: [
                      '认为旋转相机改变了 B 或 v。',
                      '把屏幕上的投影长度当成真实矢量大小。',
                      '认为质量改变会改变瞬时洛伦兹力。',
                      '编辑一个粒子时误以为所有粒子都会重新发射。',
                    ],
                  }}
                  onApplyPreset={applyPreset}
                  onGoPractice={() => setTab('practice')}
                />
              ) : null}
              {tab === 'practice' ? <PracticePanel modelId="p01" /> : null}
              {tab === 'data' ? (
                <div className="panel-section-stack">
                  <div className="panel-intro">
                    <div>
                      <h2>{mode === 'motion3d' ? '三维运动快照' : '三维瞬时受力'}</h2>
                      <p>
                        选中 {selectedLabel}。世界坐标分量与相机方向无关；
                        {mode === 'motion3d' ? ` tGlobal = ${formatTime(clock.time)}，局部 τ = ${selectedTau === null ? '待发射' : formatTime(selectedTau)}。` : ' 当前为初始瞬时快照。'}
                      </p>
                    </div>
                  </div>
                  <ReadoutGrid
                    items={[
                      { label: 'q', value: `${formatNumber(selectedView?.particle.chargeC ?? 0, 2)} C`, testId: 'p01-q' },
                      { label: 'm', value: `${formatNumber(selectedView?.particle.massKg ?? 0, 2)} kg`, hint: '不改变此刻 F_B', testId: 'p01-mass' },
                      { label: 'v 矢量', value: vectorText(selectedView?.state?.velocity ?? selectedView?.particle.velocity ?? { x: 0, y: 0, z: 0 }), hint: 'm/s', testId: 'p01-v-vector' },
                      { label: 'B 矢量', value: vectorText(scene.field.B), hint: 'T', testId: 'p01-b-vector' },
                      { label: 'F_B 矢量', value: vectorText(selectedSnapshot?.force ?? { x: 0, y: 0, z: 0 }), hint: 'N', testId: 'p01-force-vector' },
                      { label: '|F_B|', value: formatForce(selectedSnapshot?.magnitude ?? 0), hint: '|q||v||B|sinθ', testId: 'p01-force-magnitude' },
                      { label: 'θ(v,B)', value: `${formatNumber(selectedSnapshot?.thetaDeg ?? 0, 1)}°`, testId: 'p01-theta' },
                      { label: 'F_B·v', value: formatSI(selectedSnapshot?.forceDotVelocity ?? 0, 'W'), hint: '磁力不做功', testId: 'p01-force-dot-v' },
                      { label: 'F_B·B', value: formatNumber(selectedSnapshot?.forceDotField ?? 0, 3), hint: '恒为 0', testId: 'p01-force-dot-b' },
                      { label: '零力原因', value: ZERO_REASON_LABEL[selectedSnapshot?.zeroForceReason ?? 'invalid'], testId: 'p01-zero-reason' },
                      { label: '位置 r', value: vectorText(selectedView?.state?.position ?? selectedView?.particle.position ?? { x: 0, y: 0, z: 0 }), hint: 'm', testId: 'p01-3d-position' },
                      { label: '轨迹类型', value: `${selectedModel?.kind ?? 'invalid'}${selectedView?.waiting ? ' · 待发射' : ''}`, testId: 'p01-3d-kind' },
                      { label: '半径 R', value: selectedModel?.radiusM !== null && selectedModel?.radiusM !== undefined ? formatLength(selectedModel.radiusM) : '不适用', testId: 'p01-3d-radius' },
                      { label: '周期 T', value: selectedModel?.periodS !== null && selectedModel?.periodS !== undefined ? formatTime(selectedModel.periodS) : '不适用', testId: 'p01-3d-period' },
                      { label: '螺距 p', value: selectedModel?.pitchSignedM !== null && selectedModel?.pitchSignedM !== undefined ? `${formatLength(Math.abs(selectedModel.pitchSignedM))}${selectedModel.pitchSignedM < 0 ? '（沿 −B）' : ''}` : '不适用', testId: 'p01-3d-pitch' },
                      { label: '局部时间 τ', value: selectedTau === null ? '待发射' : formatTime(selectedTau), testId: 'p01-3d-local-time' },
                    ]}
                  />
                  <div className="particle-compare-table" data-testid="p01-3d-compare">
                    <div className="particle-compare-head"><span>粒子</span><span>q/C</span><span>m/kg</span><span>τ</span><span>类型</span><span>R</span><span>T</span><span>p</span></div>
                    {viewParticles.map((item) => (
                      <button
                        key={item.particle.id}
                        type="button"
                        className={`particle-compare-row ${item.particle.id === scene.activeParticleId ? 'is-selected' : ''}`}
                        onClick={() => selectParticleById(item.particle.id)}
                        data-testid={`p01-3d-row-${item.particle.label}`}
                      >
                        <span className="particle-compare-label" style={{ color: item.particle.color }}><i style={{ background: item.particle.color }} />{item.particle.label}</span>
                        <span>{formatNumber(item.particle.chargeC, 2)}</span>
                        <span>{formatNumber(item.particle.massKg, 2)}</span>
                        <span>{item.waiting ? '待发射' : mode === 'motion3d' ? formatTime(item.tauS ?? 0) : '瞬时'}</span>
                        <span>{item.model.kind}</span>
                        <span>{item.model.radiusM !== null ? formatNumber(item.model.radiusM, 2) : '—'}</span>
                        <span>{item.model.periodS !== null ? formatNumber(item.model.periodS, 2) : '—'}</span>
                        <span>{item.model.pitchSignedM !== null ? formatNumber(item.model.pitchSignedM, 2) : '—'}</span>
                      </button>
                    ))}
                  </div>
                  <section className="formula-card">
                    <p className="eyebrow">三维解析解</p>
                    <MathTex block>{'\\vec F_B=q(\\vec v\\times\\vec B),\\qquad \\vec v_\\parallel=(\\vec v\\cdot\\hat b)\\hat b,\\qquad \\vec v_\\perp=\\vec v-\\vec v_\\parallel'}</MathTex>
                    <MathTex block>{'R=\\frac{mv_\\perp}{|q||B|},\\qquad T=\\frac{2\\pi m}{|q||B|},\\qquad p=v_\\parallel T'}</MathTex>
                    <p>直线、圆和螺旋线都由同一个解析求解器区分；v⊥=0 时不虚构半径，v=0 时保持静止。</p>
                  </section>
                  <div className="callout callout-note">
                    <Icon name="info" size={18} />
                    <p>相机旋转/缩放只改变屏幕投影；数据面板、仿真时间和初态不受影响。世界坐标中的 B、v、F 分量才是物理量。</p>
                  </div>
                </div>
              ) : null}
            </div>
          </aside>
        ) : null}
      </div>
      {notice ? <div className="sim-toast" role="status">{notice}</div> : null}
    </div>
  );
}

function displaySceneFor(scene: P01ThreeDScene, draft: Draft | null): P01ThreeDScene {
  if (!draft) return scene;
  return updateThreeDParticle(scene, draft.particleId, {
    position: draft.draftParticle.position,
    velocity: draft.draftParticle.velocity,
    chargeC: draft.draftParticle.chargeC,
    massKg: draft.draftParticle.massKg,
    visible: draft.draftParticle.visible,
    showTrail: draft.draftParticle.showTrail,
  });
}
