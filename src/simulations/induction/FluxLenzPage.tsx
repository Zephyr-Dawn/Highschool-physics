import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { useSearchParams } from 'react-router-dom';
import { usePersistentState } from '../../hooks/usePersistentState';
import { usePlaybackClock } from '../../hooks/usePlaybackClock';
import { formatArea, formatNumber, formatSI, formatTime } from '../../lib/format';
import { evaluateFluxLenz, type FluxLenzSnapshot } from '../../physics/induction/fluxLenz';
import { ManualScalarSession } from '../../physics/induction/manualFluxMotion';
import {
  DEFAULT_MANUAL_SETTINGS,
  applyManualTarget,
  createManualTimeline,
  evaluateManualField,
  type ManualFieldTimeline,
} from '../../physics/induction/timeVaryingField';
import { I01_LESSON } from '../../content/lessons';
import {
  I01_DEFAULT,
  I01_PRESETS,
  sanitizeI01Params,
  type I01Drive,
  type I01Mode,
  type I01Params,
} from './fluxLenzParams';
import { FluxLenzStage, I01_DEFAULT_LAYERS, type I01Layers } from './FluxLenzStage';
import { FluxLenzCharts } from './FluxLenzCharts';
import { PlaybackBar, type KeyFrame } from '../../components/PlaybackBar';
import { PanelTabs } from '../../components/PanelTabs';
import { MathTargetInput, ParamSlider } from '../../components/ParamSlider';
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

const CLOCK_DURATION_S = 30;
const MIN_WIDTH_M = 0.05;
const MAX_WIDTH_M = 1.2;
const MIN_PHYSICAL_WIDTH_M = 1e-6;
const MAX_PHYSICAL_WIDTH_M = 10;

const MODE_LABEL: Record<I01Mode, string> = {
  field: '改变磁场',
  area: '改变面积',
  angle: '转动线圈',
};

function clampWidth(value: number): number {
  return Math.max(
    MIN_PHYSICAL_WIDTH_M,
    Math.min(MAX_PHYSICAL_WIDTH_M, Number.isFinite(value) ? value : MIN_PHYSICAL_WIDTH_M),
  );
}

function buildFieldTimeline(params: I01Params): ManualFieldTimeline {
  if (params.mode === 'field' && params.fieldDrive === 'auto') {
    const start = params.Bz;
    const end = start + params.autoBRateTeslaPerS * params.autoBDurationS;
    return {
      settings: { ...DEFAULT_MANUAL_SETTINGS },
      keyframes: [
        { tS: 0, bzTesla: start },
        { tS: params.autoBDurationS, bzTesla: end },
        { tS: params.autoBDurationS + 0.001, bzTesla: end },
      ],
    };
  }
  return createManualTimeline(params.Bz);
}

function computeSnapshot(
  timeS: number,
  params: I01Params,
  timeline: ManualFieldTimeline,
  manualWidthM: number,
  manualAreaRate: number,
  manualTheta: number,
  manualAngleRate: number,
): FluxLenzSnapshot {
  if (params.mode === 'field') {
    const wave = evaluateManualField(timeline, timeS);
    const areaM2 = params.lengthM * clampWidth(params.widthM);
    return evaluateFluxLenz({
      mode: 'field',
      timeS,
      Bz: wave.bzTesla,
      areaM2,
      thetaRad: params.thetaRad,
      dBdt: wave.dbdt ?? 0,
      dAdt: 0,
      dThetaDt: 0,
      turns: params.turns,
      resistanceOhm: params.resistanceOhm,
      circuitClosed: params.circuitClosed,
      derivativeQuality: params.fieldDrive === 'auto' ? 'exact' : 'estimated',
    });
  }
  if (params.mode === 'area') {
    if (params.areaDrive === 'auto') {
      const rawWidth = params.widthM + params.autoWidthSpeedMps * timeS;
      const width = clampWidth(rawWidth);
      const moving = rawWidth > MIN_PHYSICAL_WIDTH_M && rawWidth < MAX_PHYSICAL_WIDTH_M;
      return evaluateFluxLenz({
        mode: 'area',
        timeS,
        Bz: params.Bz,
        areaM2: params.lengthM * width,
        thetaRad: params.thetaRad,
        dBdt: 0,
        dAdt: moving ? params.lengthM * params.autoWidthSpeedMps : 0,
        dThetaDt: 0,
        turns: params.turns,
        resistanceOhm: params.resistanceOhm,
        circuitClosed: params.circuitClosed,
        derivativeQuality: 'exact',
      });
    }
    return evaluateFluxLenz({
      mode: 'area',
      timeS,
      Bz: params.Bz,
      areaM2: params.lengthM * clampWidth(manualWidthM),
      thetaRad: params.thetaRad,
      dBdt: 0,
      dAdt: params.lengthM * manualAreaRate,
      dThetaDt: 0,
      turns: params.turns,
      resistanceOhm: params.resistanceOhm,
      circuitClosed: params.circuitClosed,
      derivativeQuality: 'estimated',
    });
  }
  const angleAuto = params.angleDrive === 'auto';
  const theta = angleAuto ? params.thetaRad + params.autoOmegaRadPerS * timeS : manualTheta;
  const dTheta = angleAuto ? params.autoOmegaRadPerS : manualAngleRate;
  return evaluateFluxLenz({
    mode: 'angle',
    timeS,
    Bz: params.Bz,
    areaM2: params.lengthM * clampWidth(params.widthM),
    thetaRad: theta,
    dBdt: 0,
    dAdt: 0,
    dThetaDt: dTheta,
    turns: params.turns,
    resistanceOhm: params.resistanceOhm,
    circuitClosed: params.circuitClosed,
    derivativeQuality: angleAuto ? 'exact' : 'estimated',
  });
}

function senseLabel(snapshot: FluxLenzSnapshot): string {
  if (snapshot.currentSense === 'counterclockwise-relative-normal') return '从 +n 看逆时针';
  if (snapshot.currentSense === 'clockwise-relative-normal') return '从 +n 看顺时针';
  if (snapshot.currentSense === 'open-no-current') return '开路：无持续电流';
  return '无电流';
}

function inducedLabel(snapshot: FluxLenzSnapshot): string {
  if (snapshot.inducedFieldDirection === 'along-normal') return '沿 +n';
  if (snapshot.inducedFieldDirection === 'opposite-normal') return '沿 −n';
  if (snapshot.inducedFieldDirection === 'undefined') return '不可用';
  return '无';
}

function buildKeyFrames(params: I01Params): KeyFrame[] {
  const frames: KeyFrame[] = [{ time: 0, label: '实验起点' }];
  for (let time = 5; time < CLOCK_DURATION_S; time += 5) frames.push({ time, label: `${time}s` });
  if (params.mode === 'angle' && params.angleDrive === 'auto' && Math.abs(params.autoOmegaRadPerS) > 1e-9) {
    for (const turn of [Math.PI / 2, Math.PI, (3 * Math.PI) / 2, 2 * Math.PI]) {
      const time = (turn - params.thetaRad) / params.autoOmegaRadPerS;
      if (time > 0 && time < CLOCK_DURATION_S) frames.push({ time, label: `θ=${Math.round((turn * 180) / Math.PI)}°` });
    }
  }
  frames.push({ time: CLOCK_DURATION_S, label: '实验时限' });
  const seen = new Set<number>();
  return frames
    .filter((frame) => {
      const key = Math.round(frame.time * 1e6) / 1e6;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((left, right) => left.time - right.time);
}

export function FluxLenzPage() {
  const [storedParams, setStoredParams] = usePersistentState<I01Params>('emplab.i01.params.v1', I01_DEFAULT);
  const params = useMemo(() => sanitizeI01Params(storedParams), [storedParams]);
  const setParams = useCallback<Dispatch<SetStateAction<I01Params>>>(
    (value) => {
      setStoredParams((previous) => {
        const safe = sanitizeI01Params(previous);
        return sanitizeI01Params(typeof value === 'function' ? value(safe) : value);
      });
    },
    [setStoredParams],
  );
  const [storedLayers, setStoredLayers] = usePersistentState<I01Layers>('emplab.i01.layers.v1', I01_DEFAULT_LAYERS);
  const layers = useMemo(() => ({ ...I01_DEFAULT_LAYERS, ...storedLayers }), [storedLayers]);
  const [learningMode, setLearningMode] = usePersistentState<LearningMode>('emplab.i01.learning.v1', 'guided');
  const [teacher, setTeacher] = useState(false);
  const [stageMode, setStageMode] = useState<StageMode>('interact');
  const [tab, setTab] = useState<PanelTabId>(learningMode === 'guided' ? 'lesson' : 'params');
  const [answersHidden, setAnswersHidden] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [resetNonce, setResetNonce] = useState(0);
  const [fieldTargetBz, setFieldTargetBz] = useState(params.Bz);
  const [fieldDragging, setFieldDragging] = useState(false);
  const [fieldLimited, setFieldLimited] = useState(false);
  const [areaDragging, setAreaDragging] = useState(false);
  const [angleDragging, setAngleDragging] = useState(false);
  const [timelineVersion, setTimelineVersion] = useState(0);
  const [manualVersion, setManualVersion] = useState(0);
  const [historyVersion, setHistoryVersion] = useState(0);
  const [searchParams] = useSearchParams();
  const presetId = searchParams.get('preset');

  const clock = usePlaybackClock(CLOCK_DURATION_S, useMemo(() => buildKeyFrames(params).map((frame) => frame.time), [params]), { realTime: true });
  const timelineRef = useRef<ManualFieldTimeline>(buildFieldTimeline(params));
  const areaSessionRef = useRef(new ManualScalarSession());
  const angleSessionRef = useRef(new ManualScalarSession());
  const currentWidthRef = useRef(params.widthM);
  const currentThetaRef = useRef(params.thetaRad);
  const manualOriginRef = useRef<{ wallSeconds: number; simulationSeconds: number } | null>(null);
  const historyRef = useRef<FluxLenzSnapshot[]>([]);
  const snapshotRef = useRef<FluxLenzSnapshot | null>(null);
  const noticeTimer = useRef<number | null>(null);

  const setupKey = `${JSON.stringify(params)}|${resetNonce}`;

  const showNotice = useCallback((text: string) => {
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
    setNotice(text);
    noticeTimer.current = window.setTimeout(() => {
      setNotice(null);
      noticeTimer.current = null;
    }, 3200);
  }, []);

  useEffect(() => () => {
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
  }, []);

  useEffect(() => {
    setTab(learningMode === 'guided' ? 'lesson' : 'params');
    setTeacher(false);
  }, [learningMode]);

  useEffect(() => {
    if (!presetId) return;
    const preset = I01_PRESETS[presetId];
    if (!preset) return;
    setParams({ ...preset });
    setResetNonce((value) => value + 1);
    setAnswersHidden(false);
  }, [presetId, setParams]);

  useEffect(() => {
    clock.restart();
    timelineRef.current = buildFieldTimeline(params);
    areaSessionRef.current.reset(0, params.widthM);
    angleSessionRef.current.reset(0, params.thetaRad);
    currentWidthRef.current = params.widthM;
    currentThetaRef.current = params.thetaRad;
    manualOriginRef.current = null;
    setFieldDragging(false);
    setFieldTargetBz(params.Bz);
    setFieldLimited(false);
    setAreaDragging(false);
    setAngleDragging(false);
    const initial = computeSnapshot(0, params, timelineRef.current, params.widthM, 0, params.thetaRad, 0);
    historyRef.current = [initial];
    snapshotRef.current = initial;
    setHistoryVersion((value) => value + 1);
    setTimelineVersion((value) => value + 1);
    setManualVersion((value) => value + 1);
  }, [clock.restart, setupKey]);

  const snapshot = useMemo(
    () =>
      computeSnapshot(
        clock.time,
        params,
        timelineRef.current,
        currentWidthRef.current,
        areaSessionRef.current.getRate(),
        currentThetaRef.current,
        angleSessionRef.current.getRate(),
      ),
    [clock.time, params, setupKey, timelineVersion, manualVersion],
  );
  snapshotRef.current = snapshot;
  const fieldAuto = params.mode === 'field' && params.fieldDrive === 'auto';
  const areaAuto = params.mode === 'area' && params.areaDrive === 'auto';
  const angleAuto = params.mode === 'angle' && params.angleDrive === 'auto';
  const fieldEnabled = params.mode === 'field' && !fieldAuto && clock.playing;
  const areaEnabled = params.mode === 'area' && !areaAuto && clock.playing;
  const angleEnabled = params.mode === 'angle' && !angleAuto && clock.playing;
  const manualDragging = areaDragging || angleDragging;
  const modeEstimated =
    (params.mode === 'field' && params.fieldDrive === 'manual') ||
    (params.mode === 'area' && params.areaDrive === 'manual') ||
    (params.mode === 'angle' && params.angleDrive === 'manual');

  const history = useMemo(() => [...historyRef.current], [historyVersion]);
  const chartDuration = Math.max(8, Math.min(CLOCK_DURATION_S, Math.ceil(clock.time + 1)));
  const timeLabel = formatTime(clock.time);
  const dPhiDt = snapshot.dPsiDtWbTurnPerS === null ? null : snapshot.dPsiDtWbTurnPerS / snapshot.turns;
  const currentLabel = senseLabel(snapshot);
  const fluxTrendText =
    snapshot.fluxTrend === 'increasing'
      ? 'Φ（相对 +n）正在增加'
      : snapshot.fluxTrend === 'decreasing'
        ? 'Φ（相对 +n）正在减小'
        : snapshot.fluxTrend === 'zero'
          ? 'Φ 瞬时不变'
          : '磁通变化率不可用';
  const lenzText =
    snapshot.emfV === null
      ? '当前导数不可用，不能伪造感应方向。'
      : Math.abs(snapshot.emfV) < 1e-12
        ? '瞬时磁通量变化率为零，ε≈0；这不等同于磁通量本身为零。'
        : !snapshot.circuitClosed
          ? `${fluxTrendText}；ε=${formatSI(snapshot.emfV, 'V')} 仍然存在，但开路 I=0，不产生持续闭合电流。`
          : `${fluxTrendText}；感应电流产生的定性磁场 ${inducedLabel(snapshot)}，${currentLabel}。楞次定律阻碍的是这次变化，不是永远与原磁场反向。`;

  const sampleManualTime = () => {
    const origin = manualOriginRef.current;
    if (!origin) return clock.getTime();
    return origin.simulationSeconds + Math.max(0, performance.now() / 1000 - origin.wallSeconds);
  };

  const startManual = () => {
    manualOriginRef.current = { wallSeconds: performance.now() / 1000, simulationSeconds: clock.getTime() };
  };

  const handleAreaStart = () => {
    if (!areaEnabled) return;
    startManual();
    areaSessionRef.current.begin(sampleManualTime(), currentWidthRef.current);
    setAreaDragging(true);
    showNotice('正在改变面积 · 记录真实时间戳，不重置实验时钟');
  };
  const handleAreaChange = (widthM: number) => {
    const width = clampWidth(widthM);
    currentWidthRef.current = width;
    areaSessionRef.current.record(sampleManualTime(), width, false);
    setManualVersion((value) => value + 1);
  };
  const handleAreaEnd = () => {
    areaSessionRef.current.end(sampleManualTime());
    setAreaDragging(false);
    showNotice('滑动边松手：外部形变停止，dA/dt→0；不声称自感或反作用力');
  };
  const handleAreaCancel = () => {
    areaSessionRef.current.cancel(sampleManualTime());
    setAreaDragging(false);
    showNotice('已取消面积手势，不记录取消瞬间的伪速度');
  };

  const handleAngleStart = () => {
    if (!angleEnabled) return;
    startManual();
    angleSessionRef.current.begin(sampleManualTime(), currentThetaRef.current);
    setAngleDragging(true);
    showNotice('正在转动线圈 · 角度会 unwrap，不把 359°→1°当成巨大转动');
  };
  const handleAngleChange = (rawAngle: number) => {
    const result = angleSessionRef.current.record(sampleManualTime(), rawAngle, true);
    currentThetaRef.current = result.value;
    setManualVersion((value) => value + 1);
  };
  const handleAngleEnd = () => {
    angleSessionRef.current.end(sampleManualTime());
    setAngleDragging(false);
    showNotice('停止转动：dθ/dt→0，不保留旧的伪持续电流');
  };
  const handleAngleCancel = () => {
    angleSessionRef.current.cancel(sampleManualTime());
    setAngleDragging(false);
    showNotice('已取消转动，不记录伪角速度');
  };

  const handleFieldStart = () => {
    if (!fieldEnabled) return;
    const wave = evaluateManualField(timelineRef.current, clock.getTime());
    setFieldTargetBz(wave.bzTesla);
    setFieldDragging(true);
    showNotice('拖动 B 手柄：使用实际 0.4 s ramp 的斜率，不把目标跳变当成 dB/dt');
  };
  const handleFieldChange = (targetBz: number) => {
    const t = clock.getTime();
    const result = applyManualTarget(timelineRef.current, t, targetBz);
    timelineRef.current = result.timeline;
    setFieldTargetBz(result.appliedTargetBzTesla);
    setFieldLimited(result.limited);
    setTimelineVersion((value) => value + 1);
  };
  const handleFieldEnd = () => {
    setFieldDragging(false);
    const wave = evaluateManualField(timelineRef.current, clock.getTime());
    setFieldTargetBz(wave.bzTesla);
    showNotice('B 手柄松手：B 保持，ramp 结束后 ε→0；历史保留');
  };
  const commitFieldTarget = (target: number): string | null => {
    if (!fieldEnabled) {
      const message = '暂停中或非手动模式不会记录手动调磁；请先播放并使用手指调磁模式。';
      showNotice(message);
      return message;
    }
    handleFieldChange(target);
    return null;
  };

  useEffect(() => {
    if (!clock.playing || manualDragging) return;
    const timer = window.setInterval(() => {
      const next = computeSnapshot(
        clock.getTime(),
        params,
        timelineRef.current,
        currentWidthRef.current,
        areaSessionRef.current.getRate(),
        currentThetaRef.current,
        angleSessionRef.current.getRate(),
      );
      const last = historyRef.current[historyRef.current.length - 1];
      if (last && next.timeS <= last.timeS + 1e-6) return;
      historyRef.current.push(next);
      while (historyRef.current.length > 2 && next.timeS - historyRef.current[0].timeS > CLOCK_DURATION_S) {
        historyRef.current.shift();
      }
      if (historyRef.current.length > 700) historyRef.current.shift();
      setHistoryVersion((value) => value + 1);
    }, 60);
    return () => window.clearInterval(timer);
  }, [clock.playing, manualDragging, params, setupKey]);

  useEffect(() => {
    if (!clock.playing || !manualDragging) return;
    const timer = window.setInterval(() => {
      if (areaDragging) areaSessionRef.current.idle(sampleManualTime());
      if (angleDragging) angleSessionRef.current.idle(sampleManualTime());
      setManualVersion((value) => value + 1);
    }, 45);
    return () => window.clearInterval(timer);
  }, [angleDragging, areaDragging, clock.playing, manualDragging]);

  useEffect(() => {
    if (clock.playing) return;
    if (areaDragging) {
      areaSessionRef.current.cancel(clock.getTime());
      setAreaDragging(false);
    }
    if (angleDragging) {
      angleSessionRef.current.cancel(clock.getTime());
      setAngleDragging(false);
    }
    if (fieldDragging) setFieldDragging(false);
  }, [angleDragging, areaDragging, clock.playing, fieldDragging]);

  const applyPatch = (patch: Partial<I01Params>) => setParams((previous) => ({ ...previous, ...patch }));
  const applyPreset = (id: string) => {
    const preset = I01_PRESETS[id];
    if (!preset) return;
    setParams({ ...preset });
    setResetNonce((value) => value + 1);
    setAnswersHidden(false);
  };
  const resetExperiment = () => {
    setParams({ ...I01_DEFAULT });
    setStoredLayers({ ...I01_DEFAULT_LAYERS });
    setResetNonce((value) => value + 1);
    setAnswersHidden(false);
    showNotice('已恢复 I01 默认实验');
  };

  const teacherLayerItems: Array<{ key: keyof I01Layers; label: string }> = [
    { key: 'field', label: '外磁场' },
    { key: 'normal', label: '正法向' },
    { key: 'flux', label: '磁通面积' },
    { key: 'current', label: '电流' },
    { key: 'inducedField', label: '感应场' },
    { key: 'rates', label: '变化率' },
    { key: 'magnitude', label: '数值' },
    { key: 'geometry', label: '几何' },
  ];
  const teacherControls = (
    <div className="teacher-layer-bar" role="group" aria-label="I01 教师图层">
      {teacherLayerItems.map((item) => (
        <button
          key={item.key}
          type="button"
          className="teacher-layer-chip"
          aria-pressed={layers[item.key]}
          onClick={() => setStoredLayers((previous) => ({ ...previous, [item.key]: !layers[item.key] }))}
        >
          {item.label}
        </button>
      ))}
      <button
        type="button"
        className="teacher-layer-chip teacher-formula-toggle"
        aria-pressed={answersHidden}
        onClick={() => setAnswersHidden((value) => !value)}
        data-testid="i01-mask-toggle"
      >
        {answersHidden ? '揭示方向' : '遮蔽方向'}
      </button>
    </div>
  );

  const teacherStats = [
    { label: '模式', value: MODE_LABEL[params.mode] },
    { label: 'Φ', value: formatSI(snapshot.phiWb, 'Wb') },
    { label: 'ε', value: snapshot.emfV === null ? '不可用' : formatSI(snapshot.emfV, 'V') },
    { label: 'I', value: snapshot.currentA === null ? '不可用' : formatSI(snapshot.currentA, 'A') },
    { label: '方向', value: answersHidden ? '已遮蔽' : senseLabel(snapshot) },
  ];

  return (
    <div
      className={`sim-page ${teacher ? 'sim-teacher' : ''}`}
      data-testid="i01-page"
      data-sim-playing={clock.playing}
      data-sim-editing={manualDragging || fieldDragging}
      data-sim-time={clock.time}
      data-i01-mode={params.mode}
      data-derivative-quality={snapshot.derivativeQuality}
    >
      <header className="sim-header">
        <div className="sim-title-block">
          <p className="eyebrow">I01 · 模块 A · 电磁感应</p>
          <h1>磁通量与楞次定律</h1>
          <p className="sim-subtitle">
            用三种连续变化——改变 B、改变面积、转动线圈——观察有符号 Φ、N 匝磁链 Ψ、ε、I 和楞次方向。手动历史按真实时间戳记录。
          </p>
        </div>
        <div className="sim-header-actions">
          <Segmented<I01Mode>
            ariaLabel="I01 实验模式"
            value={params.mode}
            onChange={(mode) => applyPatch({ mode })}
            options={[
              { value: 'field', label: '改变磁场' },
              { value: 'area', label: '改变面积' },
              { value: 'angle', label: '转动线圈' },
            ]}
          />
          {!teacher ? (
            <Segmented<LearningMode>
              ariaLabel="学习模式"
              value={learningMode}
              onChange={setLearningMode}
              options={[
                { value: 'guided', label: '引导学习', icon: <Icon name="book" size={16} /> },
                { value: 'free', label: '自由实验', icon: <Icon name="sliders" size={16} /> },
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
          <FluxLenzStage
            mode={params.mode}
            snapshot={snapshot}
            params={params}
            layers={layers}
            stageMode={stageMode}
            onStageModeChange={setStageMode}
            answersHidden={answersHidden}
            historyCount={history.length}
            notice={notice ?? (fieldLimited ? 'B 目标变化超过 4 T/s 限速，已按可达斜率移动。' : null)}
            fieldTargetBz={fieldAuto ? snapshot.Bz : fieldTargetBz}
            fieldDragging={fieldDragging}
            fieldEnabled={fieldEnabled}
            onFieldStart={handleFieldStart}
            onFieldChange={handleFieldChange}
            onFieldEnd={handleFieldEnd}
            fieldAuto={fieldAuto}
            areaDragging={areaDragging}
            areaEnabled={areaEnabled}
            onAreaStart={handleAreaStart}
            onAreaChange={handleAreaChange}
            onAreaEnd={handleAreaEnd}
            onAreaCancel={handleAreaCancel}
            areaAuto={areaAuto}
            angleDragging={angleDragging}
            angleEnabled={angleEnabled}
            onAngleStart={handleAngleStart}
            onAngleChange={handleAngleChange}
            onAngleEnd={handleAngleEnd}
            onAngleCancel={handleAngleCancel}
            angleAuto={angleAuto}
          />
          {teacher ? (
            <TeacherDock
              formula={'\\varepsilon=-N\\left[A\\cos\\theta\\,\\dot B_z+B_z\\cos\\theta\\,\\dot A-B_zA\\sin\\theta\\,\\dot\\theta\\right]'}
              stats={teacherStats}
              footnote={`t=${timeLabel}；${MODE_LABEL[params.mode]}；${snapshot.circuitClosed ? '闭合' : '开路'}；导数：${snapshot.derivativeQuality === 'estimated' ? '手势估算' : snapshot.derivativeQuality === 'exact' ? '解析/记录' : '不可用'}`}
              controls={teacherControls}
            />
          ) : null}
          <PlaybackBar
            clock={clock}
            duration={CLOCK_DURATION_S}
            keyFrames={buildKeyFrames(params)}
            timeLabel={timeLabel}
            secondaryLabel={`${MODE_LABEL[params.mode]} · ${snapshot.circuitClosed ? '闭合' : '开路'} · 历史 ${history.length} 点`}
            timelineLabel="I01 真实时间轴"
            note="I01 固定 1× 实时：手动 B/面积/角度按真实时间戳记录；暂停时不记录假变化。"
            speeds={[1]}
          />
        </div>

        {!teacher ? (
          <aside className="sim-panel" aria-label="I01 实验控制台">
            <PanelTabs<PanelTabId>
              label="实验面板"
              active={tab}
              onChange={setTab}
              tabs={[
                { id: 'params', label: '参数', icon: <Icon name="sliders" size={16} /> },
                { id: 'lesson', label: '讲解', icon: <Icon name="book" size={16} /> },
                { id: 'practice', label: '练习', count: questionsForModel('i01').length, icon: <Icon name="check" size={16} /> },
                { id: 'data', label: '数据', icon: <Icon name="ruler" size={16} /> },
              ]}
            />
            <div className="sim-panel-body" role="tabpanel">
              {tab === 'params' ? (
                <div className="panel-section-stack">
                  <div className="panel-intro">
                    <div>
                      <h2>{MODE_LABEL[params.mode]} · 连续实验</h2>
                      <p>一次只让 B、A、θ 中一个是动态驱动量；N/R/开闭是结构参数。切换模式会清空当前历史并重建实验。</p>
                    </div>
                  </div>
                  <div className="preset-chips" aria-label="I01 快速预设">
                    <button type="button" className="chip-button" onClick={() => applyPreset('i01-field-increase')}>B 增大</button>
                    <button type="button" className="chip-button" onClick={() => applyPreset('i01-field-decrease')}>B 减小</button>
                    <button type="button" className="chip-button" onClick={() => applyPreset('i01-area-expand')}>面积增大</button>
                    <button type="button" className="chip-button" onClick={() => applyPreset('i01-area-contract')}>面积减小</button>
                    <button type="button" className="chip-button" onClick={() => applyPreset('i01-angle-auto')}>自动旋转</button>
                    <button type="button" className="chip-button" onClick={() => applyPreset('i01-open')}>开路</button>
                  </div>

                  <section className="panel-section">
                    <h3 className="section-title">实验模式与驱动</h3>
                    <Segmented<I01Mode>
                      ariaLabel="I01 实验模式面板"
                      size="sm"
                      value={params.mode}
                      onChange={(mode) => applyPatch({ mode })}
                      options={[{ value: 'field', label: '改变磁场' }, { value: 'area', label: '改变面积' }, { value: 'angle', label: '转动线圈' }]}
                    />
                    {params.mode === 'field' ? (
                      <>
                        <Segmented<I01Drive>
                          ariaLabel="改变磁场驱动方式"
                          size="sm"
                          value={params.fieldDrive}
                          onChange={(value) => applyPatch({ fieldDrive: value })}
                          options={[{ value: 'manual', label: '手指拖 B' }, { value: 'auto', label: '自动线性' }]}
                        />
                        <ParamSlider label="起点 Bz" value={params.Bz} min={-2} max={2} step={0.05} unit="T" decimals={2} domain={PARAMETER_DOMAINS.manualField} onChange={(value) => applyPatch({ Bz: value })} />
                        {params.fieldDrive === 'auto' ? (
                          <>
                            <ParamSlider label="自动变化率 dB/dt" value={params.autoBRateTeslaPerS} min={-2} max={2} step={0.05} unit="T/s" decimals={2} onChange={(value) => applyPatch({ autoBRateTeslaPerS: value })} />
                            <ParamSlider label="自动变化时长" value={params.autoBDurationS} min={0.2} max={20} step={0.2} unit="s" decimals={1} domain={PARAMETER_DOMAINS.i01AutoDuration} onChange={(value) => applyPatch({ autoBDurationS: value })} />
                          </>
                        ) : (
                          <>
                            <MathTargetInput
                              label="实时目标 Bz"
                              value={fieldTargetBz}
                              unit="T"
                              decimals={4}
                              domain={PARAMETER_DOMAINS.manualField}
                              testId="i01-manual-target"
                              onCommit={commitFieldTarget}
                              description="提交后仍由现有 0.4 s ramp 与最大 4 T/s 限速逼近目标；感应电动势使用实际 dB/dt。也可直接拖动舞台右侧 B 手柄。"
                            />
                          </>
                        )}
                      </>
                    ) : null}
                    {params.mode === 'area' ? (
                      <>
                        <Segmented<I01Drive>
                          ariaLabel="改变面积驱动方式"
                          size="sm"
                          value={params.areaDrive}
                          onChange={(value) => applyPatch({ areaDrive: value })}
                          options={[{ value: 'manual', label: '手指推边' }, { value: 'auto', label: '自动匀速' }]}
                        />
                        <ParamSlider label="初始宽度 x" value={params.widthM} min={MIN_WIDTH_M} max={MAX_WIDTH_M} step={0.05} unit="m" decimals={2} domain={PARAMETER_DOMAINS.i01Width} onChange={(value) => applyPatch({ widthM: value })} />
                        <ParamSlider label="固定长度 L" value={params.lengthM} min={0.1} max={1.5} step={0.1} unit="m" decimals={1} domain={PARAMETER_DOMAINS.i01Width} onChange={(value) => applyPatch({ lengthM: value })} />
                        {params.areaDrive === 'auto' ? (
                          <ParamSlider label="自动推边速度 dx/dt" value={params.autoWidthSpeedMps} min={-1} max={1} step={0.01} unit="m/s" decimals={2} domain={PARAMETER_DOMAINS.i01AutoSpeed} onChange={(value) => applyPatch({ autoWidthSpeedMps: value })} />
                        ) : (
                          <p className="param-description">播放后左右拖动滑动边；A=Lx，面积不会小于合法最小值。停住/松手后 dA/dt→0。</p>
                        )}
                      </>
                    ) : null}
                    {params.mode === 'angle' ? (
                      <>
                        <Segmented<I01Drive>
                          ariaLabel="转动线圈驱动方式"
                          size="sm"
                          value={params.angleDrive}
                          onChange={(value) => applyPatch({ angleDrive: value })}
                          options={[{ value: 'manual', label: '手指转动' }, { value: 'auto', label: '自动匀速' }]}
                        />
                        <ParamSlider label="初始角度 θ₀" value={(params.thetaRad * 180) / Math.PI} min={-180} max={180} step={1} unit="°" decimals={0} description="单位是度（°）。π/2 rad 需显式换算为 90°；表达式不会自动按弧度解释。" onChange={(value) => applyPatch({ thetaRad: (value * Math.PI) / 180 })} />
                        <ParamSlider label="线圈宽度" value={params.widthM} min={MIN_WIDTH_M} max={MAX_WIDTH_M} step={0.05} unit="m" decimals={2} domain={PARAMETER_DOMAINS.i01Width} onChange={(value) => applyPatch({ widthM: value })} />
                        <ParamSlider label="线圈长度 L" value={params.lengthM} min={0.1} max={1.5} step={0.1} unit="m" decimals={1} domain={PARAMETER_DOMAINS.i01Width} onChange={(value) => applyPatch({ lengthM: value })} />
                        {params.angleDrive === 'auto' ? (
                          <ParamSlider label="角速度 ω" value={params.autoOmegaRadPerS} min={-5} max={5} step={0.1} unit="rad/s" decimals={1} onChange={(value) => applyPatch({ autoOmegaRadPerS: value })} />
                        ) : (
                          <p className="param-description">播放后左右拖动线圈手柄；角度连续 unwrap，停手后 dθ/dt→0。</p>
                        )}
                      </>
                    ) : null}
                    {params.mode !== 'field' ? (
                      <ParamSlider label="磁感应强度 Bz" value={params.Bz} min={-2} max={2} step={0.05} unit="T" decimals={2} domain={PARAMETER_DOMAINS.manualField} onChange={(value) => applyPatch({ Bz: value })} />
                    ) : null}
                    {Math.abs(params.Bz) > 2 || Math.abs(fieldTargetBz) > 2 ? (
                      <p className="param-description">
                        舞台 B 手柄轨道视觉范围固定为 ±2 T；当前 B = {formatNumber(snapshot.Bz, 3)} T 仍按真实值参与计算，视觉轨道不会改写物理量。
                      </p>
                    ) : null}
                  </section>

                  <section className="panel-section">
                    <h3 className="section-title">线圈与电路结构</h3>
                    <ParamSlider label="匝数 N" value={params.turns} min={1} max={100} step={1} unit="turn" decimals={0} onChange={(value) => applyPatch({ turns: value })} />
                    <ParamSlider label="总电阻 R" value={params.resistanceOhm} min={0.1} max={20} step={0.1} unit="Ω" decimals={1} onChange={(value) => applyPatch({ resistanceOhm: value })} />
                    <ToggleSwitch label="闭合回路（关闭为开路）" checked={params.circuitClosed} onChange={(checked) => applyPatch({ circuitClosed: checked })} />
                  </section>

                  <section className="panel-section">
                    <h3 className="section-title">教学图层</h3>
                    <div className="toggle-list">
                      <ToggleSwitch label="外磁场与符号" checked={layers.field} onChange={(checked) => setStoredLayers({ ...layers, field: checked })} />
                      <ToggleSwitch label="正法向 +n" checked={layers.normal} onChange={(checked) => setStoredLayers({ ...layers, normal: checked })} />
                      <ToggleSwitch label="磁通面积" checked={layers.flux} onChange={(checked) => setStoredLayers({ ...layers, flux: checked })} />
                      <ToggleSwitch label="感应电流" checked={layers.current} onChange={(checked) => setStoredLayers({ ...layers, current: checked })} />
                      <ToggleSwitch label="定性感应场" checked={layers.inducedField} onChange={(checked) => setStoredLayers({ ...layers, inducedField: checked })} />
                      <ToggleSwitch label="方向答案遮蔽（先预测）" checked={answersHidden} onChange={setAnswersHidden} />
                    </div>
                  </section>

                  <button type="button" className="secondary-button wide-button" onClick={resetExperiment}>
                    <Icon name="reset" size={17} />恢复默认实验
                  </button>
                </div>
              ) : null}

              {tab === 'lesson' ? (
                <LessonRunner
                  steps={I01_LESSON}
                  storageKey="emplab.i01.lesson.v1"
                  overview={{
                    goals: ['区分 Φ、Ψ 与磁通变化率，正确使用正法向。', '用三种变化途径改变 Φ，并由 −dΨ/dt 判断 ε。', '用楞次定律判断电流/感应场方向，区分开路与闭合。'],
                    prerequisites: ['有符号磁通量与右手法向', '法拉第电磁感应定律', '欧姆定律与楞次定律'],
                    misconceptions: ['Φ 大就一定有 ε。', 'Φ=0 就一定有 ε=0。', '楞次定律意味着感应场永远与原磁场反向。', '开路时 ε 也消失。'],
                  }}
                  onApplyPreset={applyPreset}
                  onGoPractice={() => setTab('practice')}
                />
              ) : null}
              {tab === 'practice' ? <PracticePanel modelId="i01" /> : null}
              {tab === 'data' ? (
                <div className="panel-section-stack">
                  <div className="panel-intro">
                    <div>
                      <h2>磁通量与楞次快照</h2>
                      <p>当前 {timeLabel}；{fluxTrendText}。数值、曲线和方向都来自同一快照。</p>
                    </div>
                  </div>
                  <ReadoutGrid
                    items={[
                      { label: '模式', value: MODE_LABEL[params.mode], testId: 'i01-mode' },
                      { label: 'Bz', value: formatSI(snapshot.Bz, 'T'), testId: 'i01-bz' },
                      { label: '面积 A', value: formatArea(snapshot.areaM2), testId: 'i01-area' },
                      { label: '角度 θ', value: `${formatNumber((snapshot.thetaRad * 180) / Math.PI, 1)}°`, hint: '相对 +n 与 +z', testId: 'i01-theta' },
                      { label: 'Φ（单匝）', value: formatSI(snapshot.phiWb, 'Wb'), testId: 'i01-flux' },
                      { label: 'Ψ（N 匝）', value: `${formatNumber(snapshot.psiWbTurn, 4)} Wb·turn`, testId: 'i01-psi' },
                      { label: 'dΦ/dt', value: dPhiDt === null ? '不可用' : formatSI(dPhiDt, 'Wb/s'), testId: 'i01-dphi' },
                      { label: 'dB/dt', value: formatNumber(snapshot.dBdt, 3), hint: 'T/s', testId: 'i01-dbdt' },
                      { label: 'dA/dt', value: formatNumber(snapshot.dAdt, 4), hint: 'm²/s', testId: 'i01-dadt' },
                      { label: 'dθ/dt', value: formatNumber(snapshot.dThetaDt, 3), hint: 'rad/s', testId: 'i01-dthetadt' },
                      { label: 'ε', value: snapshot.emfV === null ? '不可用' : formatSI(snapshot.emfV, 'V'), hint: 'ε = −dΨ/dt', testId: 'i01-emf' },
                      { label: '电流 I', value: snapshot.currentA === null ? '不可用' : (modeEstimated ? `≈ ${formatSI(snapshot.currentA, 'A')}` : formatSI(snapshot.currentA, 'A')), hint: currentLabel, testId: 'i01-current' },
                      { label: 'P_J', value: snapshot.joulePowerW === null ? '不可用' : formatSI(snapshot.joulePowerW, 'W'), testId: 'i01-power' },
                      { label: '电流方向', value: answersHidden ? '已遮蔽' : currentLabel, testId: 'i01-current-direction' },
                      { label: '感应场', value: answersHidden ? '已遮蔽' : inducedLabel(snapshot), testId: 'i01-induced-field' },
                      { label: '导数质量', value: snapshot.derivativeQuality === 'estimated' ? '手势估算' : snapshot.derivativeQuality === 'exact' ? '解析/记录' : '不可用', testId: 'i01-derivative-quality' },
                      { label: '历史点', value: String(history.length), hint: '真实时间序列', testId: 'i01-history-count' },
                    ]}
                  />
                  <FluxLenzCharts samples={history} snapshot={snapshot} duration={chartDuration} time={clock.time} estimated={modeEstimated} />
                  <section className="formula-card">
                    <p className="eyebrow">统一乘积求导</p>
                    <MathTex block>{'\\Phi=B_zA\\cos\\theta,\\qquad \\Psi=N\\Phi,\\qquad \\varepsilon=-\\frac{d\\Psi}{dt}'}</MathTex>
                    <MathTex block>{'\\varepsilon=-N\\left[A\\cos\\theta\\,\\dot B_z+B_z\\cos\\theta\\,\\dot A-B_zA\\sin\\theta\\,\\dot\\theta\\right]'}</MathTex>
                    <p className="formula-result">{lenzText}</p>
                  </section>
                  {!snapshot.circuitClosed ? (
                    <div className="callout callout-warning">
                      <Icon name="info" size={18} />
                      <p>开路：ε 仍按磁通变化计算，但 I=0、P_J=0；没有持续闭合电流，也不绘制伪感应场方向。</p>
                    </div>
                  ) : null}
                  <div className="callout callout-note">
                    <Icon name="info" size={18} />
                    <div>
                      <strong>符号与边界</strong>
                      <p>θ 不是零时，电流方向相对于 +n 观察，不能只说“屏幕上逆时针”；感应场是定性示意，不是完整空间磁场数值。</p>
                      <p>N/R 或驱动模式修改会重建实验；单次拖 B/面积/角度不会把历史时钟归零。手动导数与热量是估算，解析预设是精确值。</p>
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
