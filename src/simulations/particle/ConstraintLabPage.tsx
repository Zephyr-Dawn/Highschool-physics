import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { usePersistentState } from '../../hooks/usePersistentState';
import { usePlaybackClock } from '../../hooks/usePlaybackClock';
import { formatNumber, formatSI, formatTime } from '../../lib/format';
import { P08_LESSON } from '../../content/lessons';
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
  MAX_PARTICLES,
  addParticle,
  commitDraft,
  createParticleDraft,
  duplicateParticle,
  particleTau,
  relaunchAll,
  relaunchParticle,
  removeParticle,
  selectParticle,
  updateDraft,
  updateParticleAndRelaunch,
  updateParticleInitial,
  type MultiParticleScene,
  type ParticleDraft,
  type ParticleSeed,
} from '../../physics/particles/multiParticle';
import {
  constraintPointAt,
  validateFieldConstraintInput,
  type ConstraintEvent,
  type ConstraintStatus,
  type TargetSegment,
} from '../../physics/particles/fieldConstraintEvents';
import {
  solveFieldConstraintInverse,
  type InverseCandidate,
  type InverseParameter,
  type InverseSolution,
} from '../../physics/particles/fieldConstraintInverse';
import { P08Stage, type P08EvaluatedParticle, type P08TrajectoryPoint } from './P08Stage';
import { P08ConstraintChart } from './P08ConstraintChart';
import { ParticleRoster, type RosterParticle } from './ParticleRoster';
import {
  P08_PRESETS,
  P08_SCENE_STORAGE_KEY,
  decodeP08SceneJson,
  loadInitialP08Scene,
  p08ApplyField,
  p08ConstraintInput,
  p08GlobalDuration,
  p08SolutionFor,
  parseP08StoredScene,
  serializeP08Scene,
  type P08Field,
  type P08Layers,
  type P08Scene,
} from './p08Scene';

type PanelTabId = 'params' | 'lesson' | 'practice' | 'data';
type LearningMode = 'guided' | 'free';

const LAYER_ITEMS: Array<{ key: keyof P08Layers; label: string }> = [
  { key: 'predicted', label: '完整预测轨迹' },
  { key: 'trail', label: '已走轨迹' },
  { key: 'fieldE', label: '电场 E' },
  { key: 'fieldB', label: '磁场 B' },
  { key: 'velocity', label: '速度矢量' },
  { key: 'force', label: 'F_E / F_B / F' },
  { key: 'target', label: '目标线段与端点' },
  { key: 'events', label: '交点 / 相切事件' },
  { key: 'accepted', label: '接受/拒绝颜色' },
  { key: 'aux', label: '法向距离辅助线' },
  { key: 'allVectors', label: '全部粒子矢量' },
  { key: 'maskAnswers', label: '遮蔽数值（先预测）' },
];

const STATUS_LABEL: Record<ConstraintStatus, string> = {
  reachable: '满足约束',
  'tangent-only': '相切临界（非穿越）',
  'wrong-direction': '方向不符',
  'outside-segment': '目标线段外',
  'outside-time-window': '到达时间窗外',
  'no-reach': '不可达',
  'degenerate-on-line': '轨迹与目标线重合',
  'solver-limited': '求解预算受限',
  invalid: '输入无效',
};

const PARAMETER_LABEL: Record<InverseParameter, string> = {
  Ey: 'Ey',
  Bz: 'Bz',
  v0x: 'v₀ₓ',
  v0y: 'v₀ᵧ',
};

function uniqueFrames(frames: KeyFrame[]): KeyFrame[] {
  const map = new Map<number, KeyFrame>();
  for (const frame of frames) {
    const key = Math.round(frame.time * 1e9) / 1e9;
    if (!map.has(key)) map.set(key, frame);
  }
  return [...map.values()].sort((a, b) => a.time - b.time);
}

function eventSummary(event: ConstraintEvent): string {
  if (event.kind === 'tangent-touch') return '相切';
  if (event.kind === 'start-on-target') return '起点在线上';
  if (event.direction === 'positive') return '正向穿越';
  if (event.direction === 'negative') return '反向穿越';
  return '切向穿越';
}

function firstAccepted(evaluation: P08EvaluatedParticle): ConstraintEvent | null {
  return evaluation.solution.acceptedEvents[0] ?? null;
}

export function ConstraintLabPage() {
  const initialScene = useMemo(() => loadInitialP08Scene(), []);
  const [storedScene, setStoredScene] = usePersistentState<unknown>(P08_SCENE_STORAGE_KEY, initialScene);
  const scene = useMemo(
    () => parseP08StoredScene(storedScene).scene ?? initialScene,
    [initialScene, storedScene],
  );
  const layers = scene.layers;
  const [learningMode, setLearningMode] = usePersistentState<LearningMode>('emplab.p08.mode.v1', 'guided');
  const [teacher, setTeacher] = useState(false);
  const [stageMode, setStageMode] = useState<StageMode>('interact');
  const [tab, setTab] = useState<PanelTabId>(learningMode === 'guided' ? 'lesson' : 'params');
  const [notice, setNotice] = useState<string | null>(null);
  const [draft, setDraft] = useState<ParticleDraft | null>(null);
  const [inverseResult, setInverseResult] = useState<InverseSolution | null>(null);
  const [searchParams] = useSearchParams();
  const presetId = searchParams.get('preset');
  const appliedPresetRef = useRef<string | null>(null);
  const importRef = useRef<HTMLInputElement | null>(null);
  const noticeTimer = useRef<number | null>(null);
  const sceneRef = useRef(scene);
  const draftRef = useRef(draft);
  const inverseRunSignature = useRef<string | null>(null);
  sceneRef.current = scene;
  draftRef.current = draft;

  const commitScene = useCallback(
    (next: P08Scene) => setStoredScene(next),
    [setStoredScene],
  );

  const commitMulti = useCallback(
    (next: MultiParticleScene<P08Field>) => {
      const base = sceneRef.current;
      commitScene({ ...base, ...next });
    },
    [commitScene],
  );

  const showNotice = (text: string) => {
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
    setNotice(text);
    noticeTimer.current = window.setTimeout(() => {
      setNotice(null);
      noticeTimer.current = null;
    }, 3400);
  };
  useEffect(() => () => {
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
  }, []);

  useEffect(() => {
    setTab(learningMode === 'guided' ? 'lesson' : 'params');
    setTeacher(false);
  }, [learningMode]);

  const selectedCommitted = scene.particles.find((item) => item.id === scene.activeParticleId) ?? scene.particles[0] ?? null;
  const selectedParticle = draft?.draftParticle ?? selectedCommitted;
  const selectedInput = selectedParticle
    ? p08ConstraintInput(selectedParticle, scene.field, scene.constraint)
    : null;
  const solutions = useMemo(
    () =>
      scene.particles.map((particle) => ({
        particle,
        solution: p08SolutionFor(particle, scene.field, scene.constraint),
      })),
    [scene.constraint, scene.field, scene.particles],
  );

  const trajectories = useMemo(() => {
    const map: Record<string, P08TrajectoryPoint[]> = {};
    for (const item of solutions) {
      const input = p08ConstraintInput(item.particle, scene.field, scene.constraint);
      const points: P08TrajectoryPoint[] = [];
      const count = 110;
      for (let index = 0; index <= count; index++) {
        const time = (scene.constraint.window.maxTimeS * index) / count;
        points.push({ timeS: time, position: constraintPointAt(input, time).position });
      }
      map[item.particle.id] = points;
    }
    return map;
  }, [scene.constraint, scene.field, solutions]);

  const duration = useMemo(() => p08GlobalDuration(scene), [scene]);
  const keyFrames = useMemo(() => {
    const frames: KeyFrame[] = [{ time: 0, label: '全局起点' }];
    for (const item of solutions) {
      const launch = scene.runtimeById[item.particle.id]?.launchTimeSec ?? 0;
      if (launch > 1e-9) frames.push({ time: launch, label: `${item.particle.label} 发射` });
      for (const event of item.solution.events) {
        frames.push({
          time: launch + event.timeS,
          label: `${item.particle.label} ${event.kind === 'tangent-touch' ? '相切' : '穿越'}`,
        });
      }
    }
    frames.push({ time: duration, label: '全局结束' });
    return uniqueFrames(frames.filter((frame) => frame.time >= 0 && frame.time <= duration + 1e-9));
  }, [duration, scene.runtimeById, solutions]);

  const clock = usePlaybackClock(duration, keyFrames.map((frame) => frame.time));

  const evaluated = useMemo<P08EvaluatedParticle[]>(
    () =>
      solutions.map(({ particle, solution }) => {
        const runtime = scene.runtimeById[particle.id] ?? { launchTimeSec: 0 };
        const tau = particleTau(runtime, clock.time);
        const input = p08ConstraintInput(particle, scene.field, scene.constraint);
        const state = tau === null
          ? null
          : constraintPointAt(input, Math.min(tau, scene.constraint.window.maxTimeS));
        return {
          particle,
          tau,
          state,
          solution,
          trajectory: trajectories[particle.id] ?? [],
        };
      }),
    [clock.time, scene.constraint, scene.field, scene.runtimeById, solutions, trajectories],
  );

  const selectedEvaluation = evaluated.find((item) => item.particle.id === scene.activeParticleId) ?? evaluated[0] ?? null;
  const selectedState = selectedEvaluation?.state ?? null;
  const selectedTau = selectedEvaluation?.tau ?? null;

  useEffect(() => {
    const signature = JSON.stringify({
      selectedInput,
      inverse: scene.inverse,
    });
    if (inverseRunSignature.current !== signature) {
      inverseRunSignature.current = signature;
      setInverseResult(null);
    }
  }, [scene.inverse, selectedInput]);

  useEffect(() => {
    const preset = presetId ? P08_PRESETS[presetId] : undefined;
    if (!preset || appliedPresetRef.current === presetId) return;
    appliedPresetRef.current = presetId;
    commitScene({ ...preset, layers: { ...preset.layers } });
    setInverseResult(null);
    setDraft(null);
    clock.reset();
    showNotice('已载入 P08 可复现预设 · 从全局 t=0 重建');
  }, [clock.reset, commitScene, presetId]);

  const updateLayers = (patch: Partial<P08Layers>) => {
    commitScene({ ...sceneRef.current, layers: { ...layers, ...patch } });
  };

  const updateField = (patch: Partial<P08Field>, message = '公共 E/B 改变：所有粒子从 t=0 重演') => {
    const nextField = { ...scene.field, ...patch };
    if (![nextField.Ex, nextField.Ey, nextField.Bz].every((value) => Number.isFinite(value))) {
      showNotice('场参数必须是有限数值。');
      return;
    }
    const validation = validateFieldConstraintInput({
      ...p08ConstraintInput(scene.particles[0], nextField, scene.constraint),
    });
    if (!validation.valid) {
      showNotice(validation.issues[0] ?? '场参数无效，已保留上一有效状态。');
      return;
    }
    commitScene(p08ApplyField(scene, nextField));
    clock.reset();
    setInverseResult(null);
    showNotice(message);
  };

  const commitConstraint = (patch: Partial<P08Scene['constraint']>) => {
    const nextConstraint = {
      target: patch.target ? { ...patch.target } : { ...scene.constraint.target },
      window: patch.window ? { ...patch.window } : { ...scene.constraint.window },
    };
    if (nextConstraint.target.min >= nextConstraint.target.max) {
      showNotice('目标线段需要 max > min。');
      return;
    }
    if (nextConstraint.window.arrivalMaxS < nextConstraint.window.arrivalMinS) {
      showNotice('到达时间上限必须不小于下限。');
      return;
    }
    if (nextConstraint.window.arrivalMaxS > nextConstraint.window.maxTimeS + 1e-9) {
      showNotice('到达时间窗不能超过全局时间窗。');
      return;
    }
    const validation = validateFieldConstraintInput(
      p08ConstraintInput(scene.particles[0], scene.field, nextConstraint),
    );
    if (!validation.valid) {
      showNotice(validation.issues[0] ?? '目标约束无效，已保留上一有效状态。');
      return;
    }
    commitScene({ ...sceneRef.current, constraint: nextConstraint });
    showNotice('目标约束修改：只重新评估命中与事件，粒子物理轨迹不变。');
  };

  const changeTarget = (patch: Partial<TargetSegment>) => {
    commitConstraint({ target: { ...scene.constraint.target, ...patch } });
  };

  const updateSelectedParticle = (patch: Partial<ParticleSeed>, message = '单粒子初态改变：只重发射当前粒子') => {
    if (!selectedParticle) return;
    commitMulti(updateParticleAndRelaunch(scene, selectedParticle.id, patch, clock.time));
    setDraft(null);
    showNotice(message);
  };

  const setParticleParam = (key: 'startX' | 'startY' | 'speed' | 'angle' | 'charge' | 'mass', value: number) => {
    if (!selectedParticle) return;
    const current = draftRef.current?.draftParticle ?? selectedParticle;
    if (key === 'startX' || key === 'startY') {
      const nextPosition = { ...current.position, [key === 'startX' ? 'x' : 'y']: value };
      if (draftRef.current) {
        setDraft(updateDraft(draftRef.current, { position: nextPosition }));
        return;
      }
      updateSelectedParticle({ position: nextPosition });
      return;
    }
    if (key === 'speed' || key === 'angle') {
      const speed = key === 'speed' ? value : Math.hypot(current.velocity.x, current.velocity.y);
      const angle = key === 'angle'
        ? (value * Math.PI) / 180
        : Math.atan2(current.velocity.y, current.velocity.x);
      const nextVelocity = { x: speed * Math.cos(angle), y: speed * Math.sin(angle) };
      if (draftRef.current) {
        setDraft(updateDraft(draftRef.current, { velocity: nextVelocity }));
        return;
      }
      updateSelectedParticle({ velocity: nextVelocity });
      return;
    }
    if (key === 'charge') {
      if (draftRef.current) setDraft(updateDraft(draftRef.current, { chargeC: value }));
      else updateSelectedParticle({ chargeC: value });
      return;
    }
    if (draftRef.current) setDraft(updateDraft(draftRef.current, { massKg: value }));
    else updateSelectedParticle({ massKg: value });
  };

  const setLaunchTime = (id: string, value: number) => {
    if (!Number.isFinite(value) || value < 0) return;
    commitScene({
      ...scene,
      runtimeById: { ...scene.runtimeById, [id]: { launchTimeSec: Math.min(value, duration) } },
    });
    showNotice('单粒子发射时刻修改：不改变其他粒子的运行历史。');
  };

  const rosterParticles: RosterParticle[] = scene.particles.map((particle) => ({
    id: particle.id,
    label: particle.label,
    color: particle.color,
    lineStyle: particle.lineStyle,
    visible: particle.visible,
    showTrail: particle.showTrail,
    selected: particle.id === scene.activeParticleId,
    launchTimeSec: scene.runtimeById[particle.id]?.launchTimeSec ?? 0,
    tauS: particleTau(scene.runtimeById[particle.id], clock.time),
  }));

  const addParticleNow = () => {
    const seed: ParticleSeed = selectedParticle
      ? {
          position: selectedParticle.position,
          velocity: selectedParticle.velocity,
          chargeC: selectedParticle.chargeC,
          massKg: selectedParticle.massKg,
          visible: true,
          showTrail: true,
        }
      : {
          position: { x: 0, y: 0 },
          velocity: { x: 1, y: 0 },
          chargeC: 1,
          massKg: 1,
          visible: true,
          showTrail: true,
        };
    const added = addParticle(scene, seed, clock.time);
    if (!added.particle) {
      showNotice(`最多 ${MAX_PARTICLES} 个粒子。`);
      return;
    }
    commitMulti(added.scene);
    showNotice('已添加粒子并从当前全局时刻发射');
  };

  const duplicateNow = () => {
    if (!selectedParticle) return;
    const duplicated = duplicateParticle(scene, selectedParticle.id, clock.time);
    if (!duplicated.particle) {
      showNotice(`最多 ${MAX_PARTICLES} 个粒子。`);
      return;
    }
    commitMulti(duplicated.scene);
    showNotice('已复制当前粒子并从当前全局时刻发射');
  };

  const removeNow = () => {
    if (!selectedParticle) return;
    commitMulti(removeParticle(scene, selectedParticle.id));
    showNotice('已删除当前粒子');
  };

  const selectParticleNow = (id: string) => {
    commitMulti(selectParticle(scene, id));
    setDraft(null);
  };

  const beginEditing = () => {
    if (!selectedParticle) return;
    setDraft(createParticleDraft(scene, selectedParticle.id, clock.time));
  };

  const commitEditing = () => {
    if (!draft) return;
    commitMulti(commitDraft(scene, draft, clock.time));
    setDraft(null);
    showNotice('已提交当前粒子初态：只重发射该粒子');
  };

  const applyPreset = (id: string) => {
    const preset = P08_PRESETS[id];
    if (!preset) return;
    commitScene({ ...preset, layers: { ...preset.layers } });
    setDraft(null);
    setInverseResult(null);
    clock.reset();
    showNotice(`已载入 P08 预设 ${id.replace('p08-', '')} · t=0`);
  };

  const exportScene = () => {
    const blob = new Blob([serializeP08Scene(sceneRef.current)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'p08-scene.json';
    anchor.click();
    URL.revokeObjectURL(url);
    showNotice('P08 场景已导出为 JSON');
  };

  const importScene = async (file: File) => {
    const text = await file.text();
    const parsed = decodeP08SceneJson(text);
    if (!parsed.scene) {
      showNotice(`P08 场景导入失败：${parsed.error ?? '格式无效'}`);
      return;
    }
    commitScene(parsed.scene);
    setDraft(null);
    setInverseResult(null);
    clock.reset();
    showNotice('P08 场景已导入 · 从 t=0 重建');
  };

  const runInverse = () => {
    if (!selectedInput) return;
    const result = solveFieldConstraintInverse({
      base: selectedInput,
      parameter: scene.inverse.parameter,
      min: scene.inverse.min,
      max: scene.inverse.max,
      targetNormalCoordinate: scene.inverse.targetNormalCoordinate,
      scanPoints: 241,
    });
    setInverseResult(result);
    inverseRunSignature.current = JSON.stringify({ selectedInput, inverse: scene.inverse });
    showNotice(result.status === 'solved'
      ? `反求完成：${result.confirmedCount} 个确认候选`
      : result.status === 'boundary-only'
        ? '反求只找到相切临界参数'
        : '给定范围内没有确认根；这不等于数学上无解');
  };

  const applyCandidate = (candidate: InverseCandidate) => {
    if (!selectedParticle) return;
    if (draft) {
      showNotice('请先提交或取消当前粒子草稿，再应用反求候选。');
      return;
    }
    if (scene.inverse.parameter === 'Ey' || scene.inverse.parameter === 'Bz') {
      const nextField = {
        ...scene.field,
        [scene.inverse.parameter]: candidate.parameterValue,
      };
      commitScene(p08ApplyField(scene, nextField));
      clock.reset();
      showNotice(`已应用 ${PARAMETER_LABEL[scene.inverse.parameter]} = ${formatNumber(candidate.parameterValue, 6)}，共享场重演`);
      return;
    }
    const key = scene.inverse.parameter === 'v0x' ? 'x' : 'y';
    const nextVelocity = { ...selectedParticle.velocity, [key]: candidate.parameterValue };
    commitMulti(updateParticleAndRelaunch(scene, selectedParticle.id, { velocity: nextVelocity }, clock.time));
    showNotice(`已应用 ${PARAMETER_LABEL[scene.inverse.parameter]} = ${formatNumber(candidate.parameterValue, 6)}，只重发射当前粒子`);
  };

  const updateInverseSettings = (patch: Partial<P08Scene['inverse']>) => {
    commitScene({ ...scene, inverse: { ...scene.inverse, ...patch } });
  };

  const modeLabel = STATUS_LABEL[selectedEvaluation?.solution.status ?? 'invalid'];
  const timeLabel = formatTime(clock.time);
  const questionCount = questionsForModel('p08').length;
  const teacherControls = (
    <div className="teacher-layer-bar" role="group" aria-label="P08 教师图层">
      {LAYER_ITEMS.map((item) => (
        <button
          key={item.key}
          type="button"
          className="teacher-layer-chip"
          aria-pressed={layers[item.key]}
          onClick={() => updateLayers({ [item.key]: !layers[item.key] } as Partial<P08Layers>)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
  const acceptedCount = selectedEvaluation?.solution.acceptedEvents.length ?? 0;
  const crossingCount = selectedEvaluation?.solution.events.filter((event) => event.kind === 'crossing').length ?? 0;
  const selectedFirstEvent = selectedEvaluation?.solution.acceptedEvents[0] ?? null;

  return (
    <div className={`sim-page p08-page learning-${learningMode} ${teacher ? 'teacher-on' : ''}`}>
      <header className="sim-header">
        <div>
          <p className="eyebrow">P08 · 粒子运动 · 约束与反问题</p>
          <h1>复合电磁场约束 · 临界条件 · 单参数反求</h1>
          <p className="sim-lede">
            给定 E、B 与初态，编辑目标线段、时间窗和方向条件；区分穿越、相切与不可达，并对一个物理参数做带正向复核的反向求解。
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
          <button type="button" className="secondary-button" onClick={() => setTeacher((value) => !value)} aria-pressed={teacher} data-testid="p08-teacher-toggle">
            <Icon name="presentation" size={17} />{teacher ? '退出教师视图' : '教师视图'}
          </button>
        </div>
      </header>

      <div className={`sim-layout ${teacher ? 'sim-layout-teacher' : ''}`}>
        <div className="sim-stage-column">
          <P08Stage
            field={scene.field}
            target={scene.constraint.target}
            evaluated={evaluated}
            selectedId={scene.activeParticleId}
            layers={layers}
            stageMode={stageMode}
            onStageModeChange={setStageMode}
            onSelectParticle={selectParticleNow}
            onTargetChange={changeTarget}
            onTargetDragCancel={() => showNotice('目标拖动被第二指取消；未修改约束。')}
            conditionNotice={notice}
          />
          {teacher ? (
            <TeacherDock
              formula={'\\vec F=q(\\vec E+\\vec v\\times\\vec B),\\quad \\omega=-qB_z/m,\\quad \\vec v=\\vec v_d+\\mathrm{Rot}(\\omega t)(\\vec v_0-\\vec v_d)'}
              stats={[
                { label: '选中', value: selectedParticle?.label ?? '—' },
                { label: '状态', value: modeLabel },
                { label: '接受事件', value: `${acceptedCount} / 交点 ${crossingCount}` },
                { label: '首达时间', value: selectedFirstEvent ? selectedFirstEvent.timeS.toFixed(4) : '—' },
                { label: '反求状态', value: inverseResult ? inverseResult.status : '未运行' },
                { label: '反求候选', value: inverseResult ? `${inverseResult.confirmedCount} 确认 / ${inverseResult.candidates.length} 列表` : '—' },
                { label: '能量残差', value: selectedState ? formatSI(selectedState.energyResidualJ, 'J') : '—' },
              ]}
              footnote={`全局 t = ${timeLabel} · 目标 ${scene.constraint.target.orientation === 'vertical' ? '竖直线' : '水平线'} · 方向 ${scene.constraint.window.direction}`}
              controls={teacherControls}
            />
          ) : null}
          <PlaybackBar
            clock={clock}
            duration={duration}
            keyFrames={keyFrames}
            timeLabel={timeLabel}
            secondaryLabel={`${modeLabel} · ${selectedParticle?.label ?? '—'} · τ=${selectedTau === null ? '待发射' : formatNumber(selectedTau, 2)} s`}
            timelineLabel="P08 全局时间轴（每粒子独立 launchTime）"
            note="修改目标线段/时间窗只重新评估约束事件；修改 E/B 才整场重演。"
          />
        </div>

        {!teacher ? (
          <aside className="sim-panel" aria-label="P08 约束实验控制台">
            <PanelTabs<PanelTabId>
              label="实验面板"
              active={tab}
              onChange={setTab}
              tabs={[
                { id: 'params', label: '参数', icon: <Icon name="sliders" size={16} /> },
                { id: 'lesson', label: '讲解', icon: <Icon name="book" size={16} /> },
                { id: 'practice', label: '练习', count: questionCount, icon: <Icon name="check" size={16} /> },
                { id: 'data', label: '数据与反求', icon: <Icon name="ruler" size={16} /> },
              ]}
            />
            <div className="sim-panel-body" role="tabpanel">
              {tab === 'params' ? (
                <div className="panel-section-stack">
                  <div className="panel-intro">
                    <div>
                      <h2>给目标，反推物理条件</h2>
                      <p>公共场改变整场重演；目标线段、方向与时间窗只重评约束。</p>
                    </div>
                  </div>
                  <div className="preset-chips" aria-label="P08 预设">
                    {Object.keys(P08_PRESETS).map((id) => (
                      <button key={id} type="button" className="chip-button" onClick={() => applyPreset(id)} data-testid={`p08-preset-${id}`}>
                        {id.replace('p08-', '')}
                      </button>
                    ))}
                  </div>

                  <section className="panel-section">
                    <h3 className="section-title">公共静态场</h3>
                    <ParamSlider label="Ex" value={scene.field.Ex} min={-5} max={5} step={0.1} unit="V/m" decimals={2} domain={PARAMETER_DOMAINS.electricField} onChange={(value) => updateField({ Ex: value })} commitSemantics="shared-reset" />
                    <ParamSlider label="Ey" value={scene.field.Ey} min={-5} max={5} step={0.1} unit="V/m" decimals={2} domain={PARAMETER_DOMAINS.electricField} onChange={(value) => updateField({ Ey: value })} commitSemantics="shared-reset" />
                    <ParamSlider label="Bz" value={scene.field.Bz} min={-3} max={3} step={0.1} unit="T" decimals={2} domain={PARAMETER_DOMAINS.magneticField} onChange={(value) => updateField({ Bz: value })} commitSemantics="shared-reset" />
                    <p className="param-description">同区静态均匀 E=(Ex,Ey) 与 B=(0,0,Bz)；Bz=0 与 q=0 自动退化，不使用动画采样决定事件。</p>
                  </section>

                  <section className="panel-section">
                    <h3 className="section-title">目标线段与约束</h3>
                    <Segmented
                      ariaLabel="目标线段方向"
                      size="sm"
                      value={scene.constraint.target.orientation}
                      onChange={(orientation) => commitConstraint({ target: { ...scene.constraint.target, orientation } })}
                      options={[
                        { value: 'vertical', label: '竖直线 x=X' },
                        { value: 'horizontal', label: '水平线 y=Y' },
                      ]}
                    />
                    <ParamSlider label="目标线坐标" value={scene.constraint.target.coordinate} min={-4} max={4} step={0.05} unit="m" decimals={2} onChange={(value) => changeTarget({ coordinate: value })} commitSemantics="config" />
                    <ParamSlider label="目标线段下限" value={scene.constraint.target.min} min={-5} max={5} step={0.05} unit="m" decimals={2} validateValue={(value) => value < scene.constraint.target.max ? null : '下限必须小于上限。'} onChange={(value) => changeTarget({ min: value })} commitSemantics="config" />
                    <ParamSlider label="目标线段上限" value={scene.constraint.target.max} min={-5} max={5} step={0.05} unit="m" decimals={2} validateValue={(value) => value > scene.constraint.target.min ? null : '上限必须大于下限。'} onChange={(value) => changeTarget({ max: value })} commitSemantics="config" />
                    <Segmented
                      ariaLabel="法向方向要求"
                      size="sm"
                      value={scene.constraint.window.direction}
                      onChange={(direction) => commitConstraint({ window: { ...scene.constraint.window, direction } })}
                      options={[
                        { value: 'any', label: '任意方向' },
                        { value: 'positive', label: '正向' },
                        { value: 'negative', label: '反向' },
                      ]}
                    />
                    <ToggleSwitch label="允许相切接触" checked={scene.constraint.window.allowTangent} onChange={(checked) => commitConstraint({ window: { ...scene.constraint.window, allowTangent: checked } })} description="相切仍单独标记，不当作有向穿越。" />
                    <ParamSlider label="全局时间窗" value={scene.constraint.window.maxTimeS} min={0.5} max={20} step={0.5} unit="s" decimals={1} domain={PARAMETER_DOMAINS.i04Duration} onChange={(value) => commitConstraint({ window: { ...scene.constraint.window, maxTimeS: value, arrivalMaxS: Math.min(scene.constraint.window.arrivalMaxS, value) } })} commitSemantics="config" />
                    <ParamSlider label="允许到达起始" value={scene.constraint.window.arrivalMinS} min={0} max={20} step={0.1} unit="s" decimals={1} onChange={(value) => commitConstraint({ window: { ...scene.constraint.window, arrivalMinS: value } })} commitSemantics="config" />
                    <ParamSlider label="允许到达结束" value={scene.constraint.window.arrivalMaxS} min={0} max={20} step={0.1} unit="s" decimals={1} onChange={(value) => commitConstraint({ window: { ...scene.constraint.window, arrivalMaxS: value } })} commitSemantics="config" />
                  </section>

                  <section className="panel-section">
                    <h3 className="section-title">粒子（1–{MAX_PARTICLES}）</h3>
                    <ParticleRoster
                      particles={rosterParticles}
                      onSelect={selectParticleNow}
                      onAdd={addParticleNow}
                      onDuplicate={duplicateNow}
                      onRemove={removeNow}
                      onRelaunchSelected={() => selectedParticle && (commitMulti(relaunchParticle(scene, selectedParticle.id, clock.time)), showNotice('只重发射当前粒子'))}
                      onRelaunchAll={() => { commitMulti(relaunchAll(scene)); clock.reset(); showNotice('全部粒子同步发射'); }}
                      onToggleTrail={() => selectedParticle && commitMulti(updateParticleInitial(scene, selectedParticle.id, { showTrail: !selectedParticle.showTrail }))}
                      onClearTrail={() => showNotice('P08 的轨迹由解析解实时生成；复位或重新发射即可清空显示。')}
                      onToggleVisible={() => selectedParticle && commitMulti(updateParticleInitial(scene, selectedParticle.id, { visible: !selectedParticle.visible }))}
                    />
                    {selectedParticle ? (() => {
                      const particle = draft?.draftParticle ?? selectedParticle;
                      const speed = Math.hypot(particle.velocity.x, particle.velocity.y);
                      const angle = (Math.atan2(particle.velocity.y, particle.velocity.x) * 180) / Math.PI;
                      return (
                        <>
                          <ParamSlider label={`${particle.label} 起始 x`} value={particle.position.x} min={-3} max={3} step={0.05} unit="m" decimals={2} onChange={(value) => setParticleParam('startX', value)} commitSemantics="single-particle" />
                          <ParamSlider label={`${particle.label} 起始 y`} value={particle.position.y} min={-3} max={3} step={0.05} unit="m" decimals={2} onChange={(value) => setParticleParam('startY', value)} commitSemantics="single-particle" />
                          <ParamSlider label={`${particle.label} 速率`} value={speed} min={0} max={5} step={0.1} unit="m/s" decimals={2} domain={PARAMETER_DOMAINS.speed} onChange={(value) => setParticleParam('speed', value)} commitSemantics="single-particle" />
                          <ParamSlider label={`${particle.label} 方向角`} value={angle} min={-180} max={180} step={1} unit="°" decimals={0} domain={PARAMETER_DOMAINS.angleDeg} onChange={(value) => setParticleParam('angle', value)} commitSemantics="single-particle" />
                          <ParamSlider label={`${particle.label} 电荷 q`} value={particle.chargeC} min={-3} max={3} step={0.1} unit="C" decimals={2} domain={PARAMETER_DOMAINS.signedCharge} onChange={(value) => setParticleParam('charge', value)} commitSemantics="single-particle" />
                          <ParamSlider label={`${particle.label} 质量 m`} value={particle.massKg} min={0.1} max={5} step={0.1} unit="kg" decimals={2} domain={PARAMETER_DOMAINS.positiveMass} onChange={(value) => setParticleParam('mass', value)} commitSemantics="single-particle" />
                          <ParamSlider label={`${particle.label} 发射时刻`} value={scene.runtimeById[particle.id]?.launchTimeSec ?? 0} min={0} max={duration} step={0.1} unit="s" decimals={1} onChange={(value) => setLaunchTime(particle.id, value)} commitSemantics="single-particle" />
                          <div className="scene-io-row">
                            <button type="button" className="secondary-button" onClick={beginEditing} disabled={Boolean(draft)}>开始草稿</button>
                            <button type="button" className="secondary-button" onClick={commitEditing} disabled={!draft}>提交并只重发射</button>
                            <button type="button" className="secondary-button" onClick={() => setDraft(null)} disabled={!draft}>取消草稿</button>
                          </div>
                        </>
                      );
                    })() : null}
                  </section>

                  <section className="panel-section">
                    <h3 className="section-title">显示图层</h3>
                    <div className="toggle-list">
                      {LAYER_ITEMS.map((item) => (
                        <ToggleSwitch key={item.key} label={item.label} checked={layers[item.key]} onChange={() => updateLayers({ [item.key]: !layers[item.key] } as Partial<P08Layers>)} />
                      ))}
                    </div>
                  </section>

                  <section className="panel-section">
                    <h3 className="section-title">场景数据</h3>
                    <div className="scene-io-row">
                      <button type="button" className="secondary-button" onClick={exportScene}><Icon name="download" size={16} />导出场景 JSON</button>
                      <button type="button" className="secondary-button" onClick={() => importRef.current?.click()}><Icon name="upload" size={16} />导入场景 JSON</button>
                      <input ref={importRef} type="file" accept="application/json,.json" hidden data-testid="p08-scene-import" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importScene(file); event.target.value = ''; }} />
                    </div>
                  </section>
                  <button type="button" className="secondary-button wide-button" onClick={() => applyPreset('p08-tangent')}><Icon name="reset" size={17} />恢复默认 P08 场景</button>
                </div>
              ) : null}

              {tab === 'lesson' ? (
                <LessonRunner
                  steps={P08_LESSON}
                  storageKey="emplab.p08.lesson.v1"
                  overview={{
                    goals: [
                      '用正向解析轨迹判断目标线段的穿越、相切、不可达与方向过滤。',
                      '理解可达性和临界 B 是物理事件根，不是屏幕像素接近。',
                      '对单参数做反求，并用同一正向引擎复核每个候选。',
                    ],
                    prerequisites: ['洛伦兹力、E+B 漂移与圆周运动。', '一元二次方程、三角函数与单调区间求根。', 'P06 的复合场与 P07 的选速概念。'],
                    misconceptions: ['把轨迹接近目标当成命中。', '把相切接触当成有向穿越。', '搜索没找到根就宣称数学上严格无解。'],
                  }}
                  onApplyPreset={applyPreset}
                  onGoPractice={() => setTab('practice')}
                />
              ) : null}

              {tab === 'practice' ? <PracticePanel modelId="p08" /> : null}

              {tab === 'data' ? (
                <div className="panel-section-stack">
                  <div className="panel-intro">
                    <div>
                      <h2>约束事件与反求结果</h2>
                      <p>全局 t = {timeLabel}；选中 {selectedParticle?.label ?? '—'}；{modeLabel}。</p>
                    </div>
                  </div>

                  <section className="panel-section">
                    <h3 className="section-title">全部粒子可达性</h3>
                    <div className="p08-compare-table" role="table" aria-label="P08 多粒子可达性" data-testid="p08-outcome-table">
                      <div className="p08-compare-row p08-compare-head" role="row">
                        <span>粒子</span><span>τ / s</span><span>状态</span><span>接受</span><span>首达 / s</span><span>命中位置</span><span>交点</span><span>说明</span>
                      </div>
                      {evaluated.map((item) => {
                        const first = firstAccepted(item);
                        return (
                          <div className="p08-compare-row" role="row" key={item.particle.id} data-status={item.solution.status}>
                            <span><strong style={{ color: item.particle.color }}>{item.particle.label}</strong></span>
                            <span>{item.tau === null ? '待发射' : formatNumber(item.tau, 2)}</span>
                            <span>{STATUS_LABEL[item.solution.status]}</span>
                            <span>{item.solution.acceptedEvents.length}</span>
                            <span>{first ? formatNumber(first.timeS, 4) : '—'}</span>
                            <span>{first ? `(${formatNumber(first.position.x, 2)}, ${formatNumber(first.position.y, 2)})` : '—'}</span>
                            <span>{item.solution.events.filter((event) => event.kind === 'crossing').length}</span>
                            <span>{item.solution.issue ?? '—'}</span>
                          </div>
                        );
                      })}
                    </div>
                  </section>

                  <ReadoutGrid
                    items={[
                      { label: '位置', value: selectedState ? `(${formatNumber(selectedState.position.x, 3)}, ${formatNumber(selectedState.position.y, 3)}) m` : '待发射', testId: 'p08-position' },
                      { label: '速度', value: selectedState ? `(${formatNumber(selectedState.velocity.x, 3)}, ${formatNumber(selectedState.velocity.y, 3)}) m/s` : '—', testId: 'p08-velocity' },
                      { label: '速率', value: selectedState ? `${formatNumber(selectedState.speed, 3)} m/s` : '—', testId: 'p08-speed' },
                      { label: '动能', value: selectedState ? formatSI(selectedState.kineticEnergyJ, 'J') : '—', testId: 'p08-ke' },
                      { label: '电场功', value: selectedState ? formatSI(selectedState.electricWorkJ, 'J') : '—', testId: 'p08-work' },
                      { label: '能量残差', value: selectedState ? formatSI(selectedState.energyResidualJ, 'J') : '—', testId: 'p08-residual' },
                      { label: '合力', value: selectedState ? formatSI(selectedState.netForceMagnitude, 'N') : '—', testId: 'p08-force' },
                      { label: 'ω = −qBz/m', value: formatNumber(selectedState?.omega ?? 0, 4), testId: 'p08-omega' },
                      { label: 'v_drift', value: selectedState?.driftVelocity ? `(${formatNumber(selectedState.driftVelocity.x, 3)}, ${formatNumber(selectedState.driftVelocity.y, 3)})` : '无（B=0）', testId: 'p08-drift' },
                      { label: '状态', value: modeLabel, hint: selectedEvaluation?.solution.issue ?? undefined, testId: 'p08-status' },
                    ]}
                  />

                  <section className="panel-section">
                    <h3 className="section-title">选中粒子的全部交点</h3>
                    <div className="p08-event-table" role="table" aria-label="P08 目标事件" data-testid="p08-event-list">
                      <div className="p08-event-row p08-event-head" role="row">
                        <span>#</span><span>t / s</span><span>类型</span><span>位置</span><span>v 法向</span><span>线段</span><span>时间窗</span><span>接受</span>
                      </div>
                      {(selectedEvaluation?.solution.events ?? []).map((event, index) => (
                        <div className="p08-event-row" role="row" key={`${event.kind}-${event.timeS}-${index}`} data-accepted={event.accepted}>
                          <span>{index + 1}</span>
                          <span>{formatNumber(event.timeS, 5)}</span>
                          <span>{eventSummary(event)}</span>
                          <span>({formatNumber(event.position.x, 3)}, {formatNumber(event.position.y, 3)})</span>
                          <span>{formatNumber(event.normalVelocity, 4)}</span>
                          <span>{event.withinSegment ? '是' : '否'}</span>
                          <span>{event.withinWindow ? '是' : '否'}</span>
                          <span>{event.accepted ? '✔' : '—'}</span>
                        </div>
                      ))}
                      {(selectedEvaluation?.solution.events.length ?? 0) === 0 ? <p className="empty-note">时间窗内没有数学交点。</p> : null}
                    </div>
                  </section>

                  <section className="panel-section">
                    <h3 className="section-title">单参数反求</h3>
                    <Segmented<InverseParameter>
                      ariaLabel="反求参数"
                      size="sm"
                      value={scene.inverse.parameter}
                      onChange={(parameter) => updateInverseSettings({ parameter })}
                      options={[
                        { value: 'Ey', label: 'Ey' },
                        { value: 'Bz', label: 'Bz' },
                        { value: 'v0x', label: 'v₀ₓ' },
                        { value: 'v0y', label: 'v₀ᵧ' },
                      ]}
                    />
                    <ParamSlider label="反求区间下限" value={scene.inverse.min} min={-10} max={10} step={0.1} unit="" decimals={2} onChange={(value) => updateInverseSettings({ min: value })} commitSemantics="config" />
                    <ParamSlider label="反求区间上限" value={scene.inverse.max} min={-10} max={10} step={0.1} unit="" decimals={2} validateValue={(value) => value > scene.inverse.min ? null : '上限必须大于下限。'} onChange={(value) => updateInverseSettings({ max: value })} commitSemantics="config" />
                    <ParamSlider
                      label={scene.constraint.target.orientation === 'vertical' ? '目标 y（线上）' : '目标 x（线上）'}
                      value={scene.inverse.targetNormalCoordinate}
                      min={-5}
                      max={5}
                      step={0.05}
                      unit="m"
                      decimals={2}
                      onChange={(value) => updateInverseSettings({ targetNormalCoordinate: value })}
                      commitSemantics="config"
                    />
                    <button type="button" className="primary-button wide-button" onClick={runInverse} data-testid="p08-run-inverse">
                      <Icon name="search" size={17} />开始反求（241 点扫描 + 正向复核）
                    </button>
                    {inverseResult ? (
                      <>
                        <p className={`p08-inverse-status status-${inverseResult.status}`} data-testid="p08-inverse-status">
                          {inverseResult.status === 'solved'
                            ? `找到 ${inverseResult.confirmedCount} 个确认候选；共评估 ${inverseResult.evaluations} 次。`
                            : inverseResult.status === 'boundary-only'
                              ? '只找到相切临界参数（不是常规穿越根）。'
                              : inverseResult.status === 'not-found-within-search'
                                ? '给定区间与精度内未找到确认根；这不是数学上无解的证明。'
                                : inverseResult.status === 'solver-limited'
                                  ? '求解预算受限，结果可能不完整。'
                                  : inverseResult.issue ?? '输入无效。'}
                        </p>
                        <div className="p08-candidate-list" data-testid="p08-candidate-list">
                          {inverseResult.candidates.map((candidate, index) => (
                            <div className={`p08-candidate status-${candidate.status}`} key={`${candidate.status}-${candidate.parameterValue}-${index}`}>
                              <div>
                                <strong>{PARAMETER_LABEL[inverseResult.request.parameter]} = {formatNumber(candidate.parameterValue, 6)}</strong>
                                <span>{candidate.status === 'confirmed' ? '正向复核通过' : candidate.status === 'tangent-critical' ? '相切临界' : candidate.status === 'uncertain' ? '不确定' : '复核未达精度'}</span>
                              </div>
                              <div>
                                <span>残差 {Number.isFinite(candidate.residualM) ? `${candidate.residualM.toExponential(2)} m` : '—'}</span>
                                <span>t = {formatNumber(candidate.eventTimeS, 4)} s</span>
                                <span>位置 ({formatNumber(candidate.eventPosition.x, 3)}, {formatNumber(candidate.eventPosition.y, 3)})</span>
                              </div>
                              <p>{candidate.note}</p>
                              {candidate.status === 'confirmed' || candidate.status === 'tangent-critical' ? (
                                <button type="button" className="secondary-button" onClick={() => applyCandidate(candidate)} data-testid={`p08-apply-candidate-${index}`}>
                                  应用此候选
                                </button>
                              ) : null}
                            </div>
                          ))}
                          {inverseResult.candidates.length === 0 ? <p className="empty-note">没有候选。</p> : null}
                        </div>
                      </>
                    ) : (
                      <p className="param-description">修改场、目标或粒子后结果会失效；点击按钮重新求解。</p>
                    )}
                    <P08ConstraintChart inverse={inverseResult} />
                  </section>

                  <section className="panel-section">
                    <h3 className="section-title">公式与判定</h3>
                    <MathTex block>{'m\\dot{\\vec v}=q(\\vec E+\\vec v\\times\\vec B)'}</MathTex>
                    <MathTex block>{'\\omega=-qB_z/m,\\quad \\vec v_d=(E_y/B_z,-E_x/B_z)'}</MathTex>
                    <MathTex block>{'f(t)=x(t)-X\\ \\text{或}\\ y(t)-Y'}</MathTex>
                    <p className="param-description">
                      {`目标为 ${scene.constraint.target.orientation === 'vertical' ? '竖直线' : '水平线'}；法向要求 ${scene.constraint.window.direction}；时间窗 [${formatNumber(scene.constraint.window.arrivalMinS, 2)}, ${formatNumber(scene.constraint.window.arrivalMaxS, 2)}] s；扫描上限 241 点，候选最多 8 个。`}
                    </p>
                  </section>
                  <section className="panel-section model-boundary">
                    <h3 className="section-title">模型边界</h3>
                    <p>只支持静态均匀 E/B、二维目标线段与单参数反求；不包含真实狭缝/吸收板/屏幕、时变场、非均匀场、边缘场、相对论、点电荷中心力或粒子碰撞。无根区间不会填 0；搜索不到不等于严格无解。</p>
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
