import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  DEFAULT_MANUAL_SETTINGS,
  WAVEFORM_LABEL,
  applyManualTarget,
  createManualTimeline,
  evaluateInduction,
  evaluateManualField,
  evaluateWaveform,
  formatCurrentDirection,
  manualFieldEvents,
  sampleInductionSeries,
  sampleManualSeries,
  waveformEvents,
  type InductionSeries,
  type ManualFieldTimeline,
} from '../../physics/induction/timeVaryingField';
import { usePersistentState } from '../../hooks/usePersistentState';
import { usePlaybackClock } from '../../hooks/usePlaybackClock';
import { formatArea, formatNumber, formatSI, formatTime } from '../../lib/format';
import {
  I04_DEFAULT,
  I04_MANUAL_DURATION_S,
  I04_MANUAL_SETTINGS,
  I04_PRESETS,
  i04AreaM2,
  i04InductionParams,
  i04WaveformConfig,
  isWaveformAffectingChange,
  type I04Mode,
  type I04Params,
} from './timeVaryingParams';
import {
  I04_DEFAULT_LAYERS,
  TimeVaryingStage,
  type I04Layers,
} from './TimeVaryingStage';
import { PlaybackBar } from '../../components/PlaybackBar';
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
import { InductionChartStack } from '../../components/InductionChartStack';
import type { StageMode } from '../../components/StageToolbar';
import { questionsForModel } from '../../content/questions';
import { I04_LESSON } from '../../content/lessons';

type PanelTabId = 'params' | 'lesson' | 'practice' | 'data';
type LearningMode = 'guided' | 'free';

const LAYER_ITEMS: Array<{ key: keyof I04Layers; short: string }> = [
  { key: 'field', short: '外加场' },
  { key: 'normal', short: '法线 +z' },
  { key: 'flux', short: '磁通量' },
  { key: 'current', short: '电流' },
  { key: 'inducedField', short: '感应场' },
  { key: 'dbdt', short: 'dB/dt' },
];

function uniqueFrames(frames: Array<{ time: number; label: string }>): Array<{ time: number; label: string }> {
  const seen = new Set<string>();
  return frames
    .filter((frame) => {
      const key = frame.time.toFixed(7);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.time - b.time);
}

const formatWb = (value: number) => formatSI(value, 'Wb');
const formatV = (value: number) => formatSI(value, 'V');
const formatA = (value: number) => formatSI(value, 'A');

export function TimeVaryingPage() {
  const [params, setParams] = usePersistentState<I04Params>('emplab.i04.params.v1', I04_DEFAULT);
  const [layers, setLayers] = usePersistentState<I04Layers>('emplab.i04.layers.v1', I04_DEFAULT_LAYERS);
  const [learningMode, setLearningMode] = usePersistentState<LearningMode>('emplab.i04.mode.v1', 'guided');
  const [teacher, setTeacher] = useState(false);
  const [stageMode, setStageMode] = useState<StageMode>('interact');
  const [tab, setTab] = useState<PanelTabId>(learningMode === 'guided' ? 'lesson' : 'params');
  const [formulaVisible, setFormulaVisible] = useState(true);
  const [manualTimeline, setManualTimeline] = useState<ManualFieldTimeline>(() =>
    createManualTimeline(params.manualStartBzTesla, I04_MANUAL_SETTINGS),
  );
  const [manualTarget, setManualTarget] = useState(params.manualStartBzTesla);
  const [manualLimited, setManualLimited] = useState(false);
  const [manualNotice, setManualNotice] = useState<string | null>(null);
  const [searchParams] = useSearchParams();
  const presetId = searchParams.get('preset');

  const manualMode = params.mode === 'manual';
  const waveformConfig = useMemo(() => i04WaveformConfig(params), [params]);
  const inductionParams = useMemo(() => i04InductionParams(params), [params]);
  const waveformSeries = useMemo(
    () => sampleInductionSeries(inductionParams, waveformConfig, params.circuitClosed),
    [inductionParams, params.circuitClosed, waveformConfig],
  );
  const manualEvents = useMemo(() => manualFieldEvents(manualTimeline), [manualTimeline]);
  const activeDuration = manualMode ? I04_MANUAL_DURATION_S : waveformConfig.durationS;
  const playbackKeyTimes = useMemo(() => {
    if (manualMode) {
      return [0, ...manualEvents.map((event) => event.timeS), I04_MANUAL_DURATION_S];
    }
    return waveformSeries.keyTimesS;
  }, [manualEvents, manualMode, waveformSeries.keyTimesS]);
  const clock = usePlaybackClock(activeDuration, playbackKeyTimes, { realTime: manualMode });

  const wavePoint = useMemo(
    () =>
      manualMode
        ? evaluateManualField(manualTimeline, clock.time)
        : evaluateWaveform(waveformConfig, clock.time),
    [clock.time, manualMode, manualTimeline, waveformConfig],
  );
  const snapshot = useMemo(
    () => evaluateInduction(inductionParams, wavePoint, params.circuitClosed),
    [inductionParams, params.circuitClosed, wavePoint],
  );
  const chartSeries: InductionSeries = useMemo(
    () =>
      manualMode
        ? sampleManualSeries(
            manualTimeline,
            inductionParams,
            params.circuitClosed,
            clock.time,
            260,
          )
        : waveformSeries,
    [clock.time, inductionParams, manualMode, manualTimeline, params.circuitClosed, waveformSeries],
  );
  const events = useMemo(
    () => (manualMode ? chartSeries.events : waveformEvents(waveformConfig)),
    [chartSeries.events, manualMode, waveformConfig],
  );

  const keyFrames = useMemo(() => {
    if (manualMode) {
      return uniqueFrames([
        { time: 0, label: '手动起点' },
        ...manualEvents.slice(-8).map((event) => ({ time: event.timeS, label: event.label })),
        { time: I04_MANUAL_DURATION_S, label: '手动区间终点' },
      ]);
    }
    return uniqueFrames([
      { time: 0, label: '起点' },
      ...events.map((event) => ({ time: event.timeS, label: event.label })),
      { time: waveformConfig.durationS, label: '波形结束' },
    ]);
  }, [events, manualEvents, manualMode, waveformConfig.durationS]);

  useEffect(() => {
    const preset = presetId ? I04_PRESETS[presetId] : undefined;
    if (!preset) return;
    setParams({ ...preset });
    setManualTimeline(createManualTimeline(preset.manualStartBzTesla, I04_MANUAL_SETTINGS));
    setManualTarget(preset.manualStartBzTesla);
    setManualLimited(false);
    setManualNotice(null);
    clock.restart();
  }, [presetId, setParams, clock.restart]);

  useEffect(() => {
    setTab(learningMode === 'guided' ? 'lesson' : 'params');
    setTeacher(false);
  }, [learningMode]);

  useEffect(() => {
    if (!manualMode) return;
    clock.setSpeed(1);
  }, [clock.setSpeed, manualMode]);

  useEffect(() => {
    if (manualMode && clock.playing) setManualNotice(null);
  }, [clock.playing, manualMode]);

  const showManualBlocked = () => {
    setManualNotice('暂停中不会记录手动调磁；请先按播放，再上下拖动右侧 B 手柄。');
  };

  const handleManualTarget = (target: number) => {
    if (!manualMode) return;
    if (!clock.playing) {
      showManualBlocked();
      return;
    }
    const result = applyManualTarget(manualTimeline, clock.time, target);
    setManualTimeline(result.timeline);
    setManualTarget(result.appliedTargetBzTesla);
    setManualLimited(result.limited);
    setManualNotice(null);
  };

  const commitManualTargetExpression = (target: number): string | null => {
    if (!clock.playing) {
      showManualBlocked();
      return '暂停中不会记录手动调磁；请先按播放再提交目标。';
    }
    handleManualTarget(target);
    return null;
  };

  const switchRunMode = (mode: I04Mode) => {
    if (mode === params.mode) return;
    setParams({ ...params, mode });
    setManualTimeline(createManualTimeline(params.manualStartBzTesla, I04_MANUAL_SETTINGS));
    setManualTarget(params.manualStartBzTesla);
    setManualLimited(false);
    setManualNotice(mode === 'manual' ? '手动模式：按播放后上下拖动右侧 B 手柄。' : null);
    clock.restart();
  };

  const applyPatch = (patch: Partial<I04Params>) => {
    const next = { ...params, ...patch };
    setParams(next);
    if (params.mode === 'waveform' && isWaveformAffectingChange(params, next)) {
      clock.restart();
    }
    if (patch.manualStartBzTesla !== undefined && params.mode === 'manual') {
      setManualTimeline(createManualTimeline(patch.manualStartBzTesla, I04_MANUAL_SETTINGS));
      setManualTarget(patch.manualStartBzTesla);
      setManualLimited(false);
      clock.restart();
    }
  };

  const applyPreset = (id: string) => {
    const preset = I04_PRESETS[id];
    if (!preset) return;
    setParams({ ...preset });
    setManualTimeline(createManualTimeline(preset.manualStartBzTesla, I04_MANUAL_SETTINGS));
    setManualTarget(preset.manualStartBzTesla);
    setManualLimited(false);
    setManualNotice(null);
    clock.restart();
  };

  const resetManual = () => {
    setManualTimeline(createManualTimeline(params.manualStartBzTesla, I04_MANUAL_SETTINGS));
    setManualTarget(params.manualStartBzTesla);
    setManualLimited(false);
    setManualNotice('手动实验已复位；按播放重新开始。');
    clock.reset();
  };

  const toggleLayer = (key: keyof I04Layers) => {
    setLayers((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const teacherControls = (
    <div className="teacher-layer-bar" role="group" aria-label="教师视图显示图层">
      {LAYER_ITEMS.map((item) => (
        <button
          key={item.key}
          type="button"
          className="teacher-layer-chip"
          aria-pressed={layers[item.key]}
          onClick={() => toggleLayer(item.key)}
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

  const currentDirectionLabel = formatCurrentDirection(snapshot.currentDirection);
  const kink = snapshot.emfV === null;
  const emfText =
    snapshot.emfV === null
      ? `折点：左 ${formatSI(snapshot.emfLeftV ?? 0, 'V')} / 右 ${formatSI(snapshot.emfRightV ?? 0, 'V')}`
      : formatV(snapshot.emfV);
  const currentText =
    snapshot.currentA === null
      ? `折点：左 ${formatSI(snapshot.currentLeftA ?? 0, 'A')} / 右 ${formatSI(snapshot.currentRightA ?? 0, 'A')}`
      : formatA(snapshot.currentA);
  const timeLabel = formatTime(clock.time);
  const waveformLabel = manualMode ? '手动调磁' : WAVEFORM_LABEL[params.waveform];
  const questionCount = questionsForModel('i04').length;

  const chartProps = {
    points: chartSeries.points,
    events,
    duration: activeDuration,
    time: clock.time,
    snapshot,
  };

  return (
    <div
      className={`sim-page ${teacher ? 'sim-teacher' : ''}`}
      data-sim-playing={clock.playing}
      data-sim-time={clock.time}
      data-run-mode={manualMode ? 'manual' : 'waveform'}
    >
      <header className="sim-header">
        <div className="sim-title-block">
          <p className="eyebrow">I04 · 模块 B · 电磁感应</p>
          <h1>时变磁场中的静止线圈</h1>
          <p className="sim-subtitle">
            线圈与磁场区域固定不动，只改变 B(t)。拖动 B 手柄时，观察 Φ、ε、I 与楞次方向如何由同一条 B(t) 计算出来。
          </p>
        </div>
        <div className="sim-header-actions i04-header-actions">
          <Segmented<I04Mode>
            ariaLabel="实验方式"
            value={params.mode}
            onChange={switchRunMode}
            options={[
              { value: 'waveform', label: '预设波形', icon: <Icon name="chart" size={17} /> },
              { value: 'manual', label: '手动调磁', icon: <Icon name="pointer" size={17} /> },
            ]}
          />
          {!teacher ? (
            <Segmented<LearningMode>
              ariaLabel="学习模式"
              value={learningMode}
              onChange={setLearningMode}
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
          <TimeVaryingStage
            params={params}
            snapshot={snapshot}
            timeS={clock.time}
            playing={clock.playing}
            manualMode={manualMode}
            manualEnabled={manualMode && clock.playing}
            manualTargetBzTesla={manualTarget}
            manualLimited={manualLimited}
            layers={layers}
            stageMode={stageMode}
            onStageModeChange={setStageMode}
            onManualTarget={handleManualTarget}
            onManualBlocked={showManualBlocked}
          />
          {manualNotice ? (
            <div className="condition-notice" role="status" data-testid="i04-manual-notice">
              {manualNotice}
            </div>
          ) : null}
          {teacher ? (
            <TeacherDock
              formula={'\\varepsilon=-N A\\frac{dB_z}{dt}=-N\\frac{d\\Phi}{dt}'}
              stats={[
                { label: 'Bz', value: `${formatNumber(snapshot.bzTesla, 3)} T` },
                { label: 'dB/dt', value: snapshot.dbdt === null ? '折点' : `${formatNumber(snapshot.dbdt, 3)} T/s` },
                { label: 'ε', value: snapshot.emfV === null ? '折点' : formatV(snapshot.emfV) },
                { label: 'I', value: snapshot.currentA === null ? '折点' : formatA(snapshot.currentA) },
                { label: '方向', value: currentDirectionLabel },
              ]}
              footnote={`t = ${timeLabel} · ${params.circuitClosed ? '回路闭合' : '回路断开'} · ${snapshot.lenzSummary}`}
              controls={teacherControls}
              formulaVisible={formulaVisible}
            />
          ) : null}
          <PlaybackBar
            clock={clock}
            duration={activeDuration}
            keyFrames={keyFrames}
            timeLabel={timeLabel}
            secondaryLabel={waveformLabel}
            timelineLabel={manualMode ? '手动调磁时间轴' : 'B(t) 共用时间轴'}
            note={
              manualMode
                ? `手动模式固定 1× 实时；拖动按 ${I04_MANUAL_SETTINGS.rampSeconds.toFixed(2)} s 仿真时间的线性 ramp 更新，斜率上限 ${I04_MANUAL_SETTINGS.maxAbsRateTeslaPerS} T/s；暂停时不记录变化。`
                : `1× 时用约 8 秒演示 ${waveformConfig.durationS.toFixed(1)} s 物理过程；正弦与线性电动势来自解析导数，三角波折点会明确标注。`
            }
            speeds={manualMode ? [1] : undefined}
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
                      <h2>固定线圈，改变磁场</h2>
                      <p>
                        线圈、面积与空间位置固定。预设波形由解析 B(t) 驱动；手动模式在真实仿真时间中连续改变 B，不是重置动画。
                      </p>
                    </div>
                  </div>

                  <div className="preset-chips" aria-label="快速实验">
                    <button type="button" className="chip-button" onClick={() => applyPreset('i04-default')}>
                      线性增强
                    </button>
                    <button type="button" className="chip-button" onClick={() => applyPreset('i04-constant')}>
                      恒定 B
                    </button>
                    <button type="button" className="chip-button" onClick={() => applyPreset('i04-sine')}>
                      正弦
                    </button>
                    <button type="button" className="chip-button" onClick={() => applyPreset('i04-triangle')}>
                      三角波
                    </button>
                    <button type="button" className="chip-button" onClick={() => applyPreset('i04-falling')}>
                      B 减小
                    </button>
                    <button type="button" className="chip-button" onClick={() => applyPreset('i04-manual')}>
                      手动调磁
                    </button>
                  </div>

                  <section className="panel-section">
                    <h3 className="section-title">实验方式</h3>
                    <Segmented<I04Mode>
                      ariaLabel="实验方式"
                      size="sm"
                      value={params.mode}
                      onChange={switchRunMode}
                      options={[
                        { value: 'waveform', label: '预设波形' },
                        { value: 'manual', label: '手动调磁' },
                      ]}
                    />
                    <div className="toggle-list">
                      <ToggleSwitch
                        label={params.circuitClosed ? '回路闭合（有感应电流）' : '回路断开（I = 0，ε 仍可非零）'}
                        checked={params.circuitClosed}
                        onChange={(checked) => applyPatch({ circuitClosed: checked })}
                      />
                    </div>
                    {manualMode ? (
                      <div className="callout callout-note">
                        <Icon name="info" size={18} />
                        <div>
                          <strong>手动模式是连续实验</strong>
                          <p>
                            播放后上下拖动舞台右侧的 B 手柄。B(t) 在仿真时间中以 0.18 s 线性 ramp
                            跟随目标值，ε 使用该实际斜率计算；停止后 B 保持不变，ε、I 回到 0。
                          </p>
                        </div>
                      </div>
                    ) : null}
                  </section>

                  {!manualMode ? (
                    <section className="panel-section">
                      <h3 className="section-title">预设波形 B(t)</h3>
                      <Segmented
                        ariaLabel="波形类型"
                        size="sm"
                        value={params.waveform}
                        onChange={(value) => applyPatch({ waveform: value })}
                        options={[
                          { value: 'constant', label: '恒定' },
                          { value: 'linear', label: '线性' },
                          { value: 'sine', label: '正弦' },
                          { value: 'triangle', label: '三角波' },
                        ]}
                      />
                      <ParamSlider
                        label="波形时长"
                        value={params.durationS}
                        min={0.5}
                        max={12}
                        step={0.5}
                        unit="s"
                        decimals={1}
                        domain={PARAMETER_DOMAINS.i04Duration}
                        onChange={(value) => applyPatch({ durationS: value })}
                        description="播放时间轴的长度；1× 演示约 8 秒，与物理时长不同。"
                      />
                      <ParamSlider
                        label="偏置 B₀"
                        value={params.b0Tesla}
                        min={-2}
                        max={2}
                        step={0.05}
                        unit="T"
                        decimals={2}
                        domain={PARAMETER_DOMAINS.i04Field}
                        onChange={(value) => applyPatch({ b0Tesla: value })}
                        description="+ 表示出纸面，− 表示入纸面。"
                      />
                      {params.waveform === 'linear' ? (
                        <ParamSlider
                          label="变化率 k = dB/dt"
                          value={params.slopeTeslaPerS}
                          min={-2}
                          max={2}
                          step={0.05}
                          unit="T/s"
                          decimals={2}
                          domain={PARAMETER_DOMAINS.i04Slope}
                          onChange={(value) => applyPatch({ slopeTeslaPerS: value })}
                          description="线性波形的解析斜率，也是恒定感应电动势的来源。"
                        />
                      ) : null}
                      {params.waveform === 'sine' ? (
                        <>
                          <ParamSlider
                            label="振幅 A_B"
                            value={params.amplitudeTesla}
                            min={0}
                            max={2}
                            step={0.05}
                            unit="T"
                            decimals={2}
                            domain={PARAMETER_DOMAINS.i04Amplitude}
                            onChange={(value) => applyPatch({ amplitudeTesla: value })}
                          />
                          <ParamSlider
                            label="频率 f"
                            value={params.frequencyHz}
                            min={0.1}
                            max={3}
                            step={0.1}
                            unit="Hz"
                            decimals={1}
                            domain={PARAMETER_DOMAINS.i04Frequency}
                            onChange={(value) => applyPatch({ frequencyHz: value })}
                          />
                          <ParamSlider
                            label="初相 φ"
                            value={params.phaseDeg}
                            min={0}
                            max={360}
                            step={15}
                            unit="°"
                            decimals={0}
                            onChange={(value) => applyPatch({ phaseDeg: value })}
                          />
                        </>
                      ) : null}
                      {params.waveform === 'triangle' ? (
                        <>
                          <ParamSlider
                            label="三角波振幅"
                            value={params.amplitudeTesla}
                            min={0}
                            max={2}
                            step={0.05}
                            unit="T"
                            decimals={2}
                            domain={PARAMETER_DOMAINS.i04Amplitude}
                            onChange={(value) => applyPatch({ amplitudeTesla: value })}
                          />
                          <ParamSlider
                            label="上升时间"
                            value={params.riseS}
                            min={0.1}
                            max={2}
                            step={0.1}
                            unit="s"
                            decimals={1}
                            domain={PARAMETER_DOMAINS.i04EdgeTime}
                            onChange={(value) => applyPatch({ riseS: value })}
                          />
                          <ParamSlider
                            label="平台时间"
                            value={params.topS}
                            min={0}
                            max={2}
                            step={0.1}
                            unit="s"
                            decimals={1}
                            domain={PARAMETER_DOMAINS.i04HoldTime}
                            onChange={(value) => applyPatch({ topS: value })}
                          />
                          <ParamSlider
                            label="下降时间"
                            value={params.fallS}
                            min={0.1}
                            max={2}
                            step={0.1}
                            unit="s"
                            decimals={1}
                            domain={PARAMETER_DOMAINS.i04EdgeTime}
                            onChange={(value) => applyPatch({ fallS: value })}
                          />
                          <ParamSlider
                            label="底部平台"
                            value={params.bottomS}
                            min={0}
                            max={2}
                            step={0.1}
                            unit="s"
                            decimals={1}
                            domain={PARAMETER_DOMAINS.i04HoldTime}
                            onChange={(value) => applyPatch({ bottomS: value })}
                          />
                        </>
                      ) : null}
                    </section>
                  ) : (
                    <section className="panel-section">
                      <h3 className="section-title">手动调磁</h3>
                      <ParamSlider
                        label="手动实验起始 B"
                        value={params.manualStartBzTesla}
                        min={-2}
                        max={2}
                        step={0.05}
                        unit="T"
                        decimals={2}
                        domain={PARAMETER_DOMAINS.i04Field}
                        onChange={(value) => applyPatch({ manualStartBzTesla: value })}
                        description="复位或切换模式时，手动实验从该 B 值开始；运行中的调磁不经过此滑块。"
                      />
                      <MathTargetInput
                        label="实时目标 B"
                        value={manualTarget}
                        unit="T"
                        decimals={4}
                        domain={PARAMETER_DOMAINS.i04Field}
                        testId="i04-manual-target"
                        onCommit={commitManualTargetExpression}
                        description="提交后由现有 0.4 s ramp 与最大 4 T/s 的真实斜率逼近；不会把瞬时跳变当作 dB/dt。也可上下拖动舞台右侧 B 手柄。"
                      />
                      {Math.abs(manualTarget) > 2 || Math.abs(snapshot.bzTesla) > 2 ? (
                        <p className="param-description">
                          舞台手动 B 杆的视觉行程固定为 ±2 T；当前/目标超出时仍按真实值计算，视觉位置不会反向改写物理量。
                        </p>
                      ) : null}
                      <button
                        type="button"
                        className="secondary-button wide-button"
                        onClick={resetManual}
                      >
                        <Icon name="reset" size={17} />
                        复位手动实验
                      </button>
                      <p className="param-description" data-testid="i04-manual-ramp-note">
                        当前 B = {formatNumber(snapshot.bzTesla, 3)} T，目标 = {formatNumber(manualTarget, 3)} T；
                        导数由分段线性 B(t) 的实际斜率给出，不使用逐帧差分。
                      </p>
                    </section>
                  )}

                  <section className="panel-section">
                    <h3 className="section-title">线圈与回路</h3>
                    <ParamSlider
                      label="匝数 N"
                      value={params.turns}
                      min={1}
                      max={50}
                      step={1}
                      unit="匝"
                      decimals={0}
                      onChange={(value) => applyPatch({ turns: value })}
                      description="视觉上只画一圈，但按 N 匝等效线圈计算磁链。"
                    />
                    <ParamSlider
                      label="线圈宽度"
                      value={params.loopWidthM}
                      min={0.05}
                      max={0.5}
                      step={0.01}
                      unit="m"
                      decimals={2}
                      domain={PARAMETER_DOMAINS.i03LoopLength}
                      onChange={(value) => applyPatch({ loopWidthM: value })}
                    />
                    <ParamSlider
                      label="线圈高度"
                      value={params.loopHeightM}
                      min={0.05}
                      max={0.35}
                      step={0.01}
                      unit="m"
                      decimals={2}
                      domain={PARAMETER_DOMAINS.i03LoopLength}
                      onChange={(value) => applyPatch({ loopHeightM: value })}
                    />
                    <ParamSlider
                      label="总电阻 R"
                      value={params.resistanceOhm}
                      min={0.1}
                      max={20}
                      step={0.1}
                      unit="Ω"
                      decimals={1}
                      onChange={(value) => applyPatch({ resistanceOhm: value })}
                    />
                    <p className="param-description">
                      面积 A = {formatArea(i04AreaM2(params))}；线圈位置固定，不把尺寸拖动当作运行时切割磁感线。
                    </p>
                  </section>

                  <section className="panel-section">
                    <h3 className="section-title">显示图层</h3>
                    <div className="toggle-list">
                      <ToggleSwitch label="外加磁场符号" checked={layers.field} onChange={(checked) => setLayers({ ...layers, field: checked })} />
                      <ToggleSwitch label="回路法线 +z" checked={layers.normal} onChange={(checked) => setLayers({ ...layers, normal: checked })} />
                      <ToggleSwitch label="单匝磁通量 Φ" checked={layers.flux} onChange={(checked) => setLayers({ ...layers, flux: checked })} />
                      <ToggleSwitch label="感应电流箭头" checked={layers.current} onChange={(checked) => setLayers({ ...layers, current: checked })} />
                      <ToggleSwitch label="感应磁场（定性）" checked={layers.inducedField} onChange={(checked) => setLayers({ ...layers, inducedField: checked })} />
                      <ToggleSwitch label="dB/dt 标记" checked={layers.dbdt} onChange={(checked) => setLayers({ ...layers, dbdt: checked })} />
                    </div>
                  </section>

                  <button
                    type="button"
                    className="secondary-button wide-button"
                    onClick={() => {
                      setParams({ ...I04_DEFAULT });
                      setLayers({ ...I04_DEFAULT_LAYERS });
                      setManualTimeline(createManualTimeline(I04_DEFAULT.manualStartBzTesla, I04_MANUAL_SETTINGS));
                      setManualTarget(I04_DEFAULT.manualStartBzTesla);
                      setManualLimited(false);
                      setManualNotice(null);
                      clock.reset();
                    }}
                  >
                    <Icon name="reset" size={17} />
                    恢复默认参数与图层
                  </button>
                </div>
              ) : null}

              {tab === 'lesson' ? (
                <LessonRunner
                  steps={I04_LESSON}
                  storageKey="emplab.i04.lesson.v1"
                  overview={{
                    goals: [
                      '区分磁通量 Φ 与磁链 Ψ = NΦ，并用 ε = −dΨ/dt 解释静止线圈中的感生电动势。',
                      '从 B(t) 的斜率判断 ε 的符号，再沿楞次定律判断感应电流方向。',
                      '理解 N、A、R 与回路开闭分别影响 ε、I 的哪些部分。',
                      '把 I04 的“磁场随时间变化”与 I03 的“有效面积变化”统一到法拉第定律。',
                    ],
                    prerequisites: [
                      '磁通量 Φ = B·A 与单位 Wb。',
                      '法拉第电磁感应定律、楞次定律与右手螺旋定则。',
                      '闭合电路欧姆定律 I = ε/R。',
                    ],
                    misconceptions: [
                      'B 不为零就一定有感应电流。',
                      'B = 0 时感应电动势也必须为零。',
                      '把 N 匝的磁链 Ψ 与单匝磁通量 Φ 当成同一个量。',
                      '回路断开后认为感应电动势也消失。',
                    ],
                  }}
                  onApplyPreset={applyPreset}
                  onGoPractice={() => setTab('practice')}
                />
              ) : null}

              {tab === 'practice' ? <PracticePanel modelId="i04" /> : null}

              {tab === 'data' ? (
                <div className="panel-section-stack">
                  <div className="panel-intro">
                    <div>
                      <h2>实时数据与联动图像</h2>
                      <p>
                        当前时刻 {timeLabel}。所有数值、方向箭头与四条曲线都来自同一条 {manualMode ? '手动 B(t)' : '解析 B(t)'}；
                        {manualMode ? '手动导数来自连续 ramp 的实际斜率。' : '预设波形使用解析导数。'}
                      </p>
                    </div>
                  </div>

                  <ReadoutGrid
                    items={[
                      { label: '外加磁场 Bz', value: `${formatNumber(snapshot.bzTesla, 3)} T`, hint: '正值出纸面，负值入纸面', testId: 'i04-bz' },
                      {
                        label: '变化率 dBz/dt',
                        value: kink ? '折点（左右不唯一）' : `${formatNumber(snapshot.dbdt ?? 0, 3)} T/s`,
                        hint: kink ? `左 ${formatNumber(wavePoint.dbdtLeft ?? 0, 3)} / 右 ${formatNumber(wavePoint.dbdtRight ?? 0, 3)} T/s` : '解析斜率或手动 ramp 实际斜率',
                        testId: 'i04-dbdt',
                      },
                      { label: '单匝磁通量 Φ', value: formatWb(snapshot.fluxPerTurnWb), hint: 'Φ = Bz A，取 +z 为回路正法向', testId: 'i04-flux' },
                      { label: '磁链 Ψ', value: formatSI(snapshot.fluxLinkageWbTurn, 'Wb·turn'), hint: 'Ψ = NΦ，不是 Φ', testId: 'i04-flux-linkage' },
                      { label: '感应电动势 ε', value: emfText, hint: 'ε = −N A dBz/dt', testId: 'i04-emf' },
                      { label: '感应电流 I', value: currentText, hint: params.circuitClosed ? currentDirectionLabel : '回路断开：I = 0，ε 仍可非零', testId: 'i04-current' },
                      { label: '电阻功率 P', value: snapshot.resistivePowerW === null ? '折点' : formatSI(snapshot.resistivePowerW, 'W'), hint: 'P = I²R；断开时为 0', testId: 'i04-power' },
                      { label: '感应电流方向', value: currentDirectionLabel, hint: '正电流为从纸外看逆时针', testId: 'i04-direction' },
                      { label: '有效面积 A', value: formatArea(i04AreaM2(params)), hint: `${formatNumber(params.loopWidthM, 2)} m × ${formatNumber(params.loopHeightM, 2)} m`, testId: 'i04-area' },
                      { label: '回路状态', value: params.circuitClosed ? '闭合' : '断开', hint: params.circuitClosed ? 'I = ε/R' : 'I = 0', testId: 'i04-circuit' },
                    ]}
                  />

                  {kink ? (
                    <div className="callout callout-warning" data-testid="i04-kink-note">
                      <Icon name="info" size={18} />
                      <div>
                        <strong>当前是波形折点</strong>
                        <p>
                          dBz/dt 在该点不存在唯一值，因此我们不伪造一个方向或把电流画成零。
                          左侧 ε = {formatV(snapshot.emfLeftV ?? 0)}，右侧 ε = {formatV(snapshot.emfRightV ?? 0)}；
                          曲线显示有限跳变，电流箭头在折点处隐藏。
                        </p>
                      </div>
                    </div>
                  ) : null}

                  {manualMode ? (
                    <div className="callout callout-note" data-testid="i04-manual-data-note">
                      <Icon name="info" size={18} />
                      <div>
                        <strong>手动导数估算说明</strong>
                        <p>
                          B(t) 由相对拖动更新的目标值和 {DEFAULT_MANUAL_SETTINGS.rampSeconds.toFixed(2)} s
                          仿真时间的线性 ramp 组成；斜率上限 {DEFAULT_MANUAL_SETTINGS.maxAbsRateTeslaPerS} T/s，
                          因此极快拖动可能限速。ε 来自该实际斜率，并用短程平滑避免触摸噪声尖峰；它是有延迟的估计值。
                          预设波形仍使用解析导数。
                        </p>
                      </div>
                    </div>
                  ) : null}

                  <section className="charts-section">
                    <h3 className="section-title">B / Φ / ε / I 共用时间轴</h3>
                    <InductionChartStack {...chartProps} testId="i04-chart-panel" />
                  </section>

                  <section className="event-section">
                    <h3 className="section-title">波形与方向事件</h3>
                    {events.length > 0 ? (
                      <div className="event-list">
                        {events.map((event, index) => (
                          <button
                            key={`${event.timeS}-${event.kind}-${index}`}
                            type="button"
                            className="event-item"
                            onClick={() => clock.setTime(event.timeS)}
                          >
                            <span className="event-time">{formatTime(event.timeS)}</span>
                            <span className="event-label">{event.label}</span>
                            <span className="event-value">
                              {event.kind === 'kink'
                                ? `左 ${formatNumber(event.dbdtLeft ?? 0, 3)} / 右 ${formatNumber(event.dbdtRight ?? 0, 3)} T/s`
                                : '点击定位到该时刻'}
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="muted-text">当前没有折点或过零事件；恒定 B 仍可能有一个非零的 Φ。</p>
                    )}
                  </section>

                  <section className="formula-card">
                    <p className="eyebrow">符号约定与公式</p>
                    <MathTex block>{'\\Phi=B_z A,\\qquad \\Psi=N\\Phi,\\qquad \\varepsilon=-\\frac{d\\Psi}{dt}=-NA\\frac{dB_z}{dt}'}</MathTex>
                    <MathTex block>{'I=\\frac{\\varepsilon}{R}\\ (\\text{闭合}),\\qquad P=I^2R,\\qquad \\text{断开时 } I=0'}</MathTex>
                    <p>
                      从 +z（纸外）看，逆时针电流为正，产生的磁场指向 +z。dBz/dt &gt; 0 时 ε &lt; 0，
                      电流顺时针；dBz/dt &lt; 0 时相反。B = 0 时只要斜率不为零，ε 仍可非零。
                    </p>
                    <p className="formula-result">
                      当前 Φ ≈ {formatWb(snapshot.fluxPerTurnWb)}，Ψ ≈ {formatSI(snapshot.fluxLinkageWbTurn, 'Wb·turn')}，
                      ε ≈ {emfText}，I ≈ {currentText}
                    </p>
                  </section>

                  <div className="callout callout-note">
                    <Icon name="info" size={18} />
                    <div>
                      <strong>模型边界</strong>
                      <p>
                        平面矩形线圈固定不移动、不旋转，匀强磁场垂直穿过整个线圈，只随时间变化；线圈等效为集中电阻 R，
                        忽略自感、互感、电容、辐射、线圈磁场对外场的反馈与非理想测量。视觉上的一圈代表 N 匝等效线圈。
                      </p>
                      <p>
                        I03 改变的是线圈与静态磁场的重叠面积；I04 改变的是固定线圈中的磁场强度。两者都使用
                        ε = −dΨ/dt，但“运动”与“时变场”是不同实验语义。
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
