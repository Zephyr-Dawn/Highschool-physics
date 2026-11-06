import type { CSSProperties } from 'react';
import { Icon } from './Icon';
import { PLAYBACK_SPEEDS, type PlaybackClock } from '../hooks/usePlaybackClock';
import { clamp } from '../physics/core/vec2';

export interface KeyFrame {
  time: number;
  label?: string;
}

interface PlaybackBarProps {
  clock: PlaybackClock;
  duration: number;
  keyFrames: KeyFrame[];
  timeLabel: string;
  secondaryLabel?: string;
  timelineLabel?: string;
  note?: string;
  speeds?: readonly (typeof PLAYBACK_SPEEDS)[number][];
}

export function PlaybackBar({
  clock,
  duration,
  keyFrames,
  timeLabel,
  secondaryLabel,
  timelineLabel = '时间轴',
  note = '1× 为示教慢放；倍速只改变播放进度。',
  speeds = PLAYBACK_SPEEDS,
}: PlaybackBarProps) {
  const safeDuration = Math.max(duration, 1e-12);
  const progress = clamp(clock.time / safeDuration, 0, 1);
  const atStart = clock.time <= safeDuration * 1e-5;
  const atEnd = clock.time >= safeDuration * (1 - 1e-5);
  const sliderStyle = { '--progress': `${progress * 100}%` } as CSSProperties;

  return (
    <section className="playback-bar" aria-label="播放控制">
      <div className="playback-row">
        <div className="playback-transport">
          <button
            type="button"
            className="icon-button"
            aria-label="上一关键帧"
            title="上一关键帧"
            onClick={() => clock.jumpKey(-1)}
            disabled={atStart}
            data-testid="prev-keyframe"
          >
            <Icon name="stepBack" size={21} />
          </button>
          <button
            type="button"
            className="play-button"
            aria-label={clock.playing ? '暂停' : '播放'}
            onClick={clock.toggle}
            data-testid="play-toggle"
          >
            <Icon name={clock.playing ? 'pause' : 'play'} size={22} />
            <span>{clock.playing ? '暂停' : '播放'}</span>
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="下一关键帧"
            title="下一关键帧"
            onClick={() => clock.jumpKey(1)}
            disabled={atEnd}
            data-testid="next-keyframe"
          >
            <Icon name="stepForward" size={21} />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="回到起点"
            title="回到起点"
            onClick={clock.reset}
            disabled={atStart && !clock.playing}
            data-testid="reset-playback"
          >
            <Icon name="reset" size={20} />
          </button>
        </div>

        <div className="playback-time">
          <strong>{timeLabel}</strong>
          {secondaryLabel ? <span>{secondaryLabel}</span> : null}
        </div>

        <div className="speed-group" role="group" aria-label="播放速度">
          {speeds.map((speed) => (
            <button
              key={speed}
              type="button"
              className="speed-button"
              aria-pressed={clock.speed === speed}
              onClick={() => clock.setSpeed(speed)}
            >
              {speed}×
            </button>
          ))}
        </div>
      </div>

      <div className="playback-slider-row">
        <span className="playback-edge-label" aria-hidden="true">
          起点
        </span>
        <div className="timeline-wrap">
          <input
            className="timeline-range"
            style={sliderStyle}
            type="range"
            min={0}
            max={safeDuration}
            step="any"
            value={clamp(clock.time, 0, safeDuration)}
            aria-label={timelineLabel}
            aria-valuetext={`${timeLabel}${secondaryLabel ? `，${secondaryLabel}` : ''}`}
            onChange={(event) => clock.setTime(Number(event.target.value))}
            data-testid="timeline"
          />
          <div className="timeline-ticks" aria-hidden="true">
            {keyFrames.map((frame, index) => (
              <span
                key={`${frame.time}-${index}`}
                className="timeline-tick"
                style={{ left: `${clamp(frame.time / safeDuration, 0, 1) * 100}%` }}
                title={frame.label}
              />
            ))}
          </div>
        </div>
        <span className="playback-edge-label" aria-hidden="true">
          终点
        </span>
      </div>
      <p className="playback-note">{note}</p>
    </section>
  );
}
