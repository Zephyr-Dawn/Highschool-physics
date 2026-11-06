import { useCallback, useEffect, useRef, useState } from 'react';
import { clamp } from '../physics/core/vec2';

export const PLAYBACK_FULL_TRAVERSE_SECONDS = 8;
export const PLAYBACK_SPEEDS = [0.25, 0.5, 1, 2] as const;
export type PlaybackSpeed = (typeof PLAYBACK_SPEEDS)[number];

export interface PlaybackClock {
  time: number;
  playing: boolean;
  speed: PlaybackSpeed;
  setSpeed: (speed: PlaybackSpeed) => void;
  setTime: (time: number) => void;
  getTime: () => number;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  /** Sets time back to zero but deliberately preserves the playing/paused state. */
  restart: () => void;
  reset: () => void;
  jumpKey: (direction: -1 | 1) => void;
}

export function usePlaybackClock(
  duration: number,
  keyTimes: number[],
  options: { realTime?: boolean } = {},
): PlaybackClock {
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 1;
  const realTime = options.realTime === true;
  const [time, setTimeState] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<PlaybackSpeed>(1);
  const timeRef = useRef(0);

  const setTime = useCallback(
    (value: number) => {
      const next = clamp(value, 0, safeDuration);
      timeRef.current = next;
      setTimeState(next);
    },
    [safeDuration],
  );

  useEffect(() => {
    if (timeRef.current > safeDuration) setTime(safeDuration);
  }, [safeDuration, setTime]);

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const realDelta = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      const advance = realTime
        ? realDelta * speed
        : (realDelta * speed * safeDuration) / PLAYBACK_FULL_TRAVERSE_SECONDS;
      const next = timeRef.current + advance;
      if (next >= safeDuration) {
        timeRef.current = safeDuration;
        setTimeState(safeDuration);
        setPlaying(false);
        return;
      }
      timeRef.current = next;
      setTimeState(next);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, realTime, speed, safeDuration]);

  const play = useCallback(() => {
    if (timeRef.current >= safeDuration - 1e-12) {
      timeRef.current = 0;
      setTimeState(0);
    }
    setPlaying(true);
  }, [safeDuration]);

  const pause = useCallback(() => setPlaying(false), []);
  const getTime = useCallback(() => timeRef.current, []);
  const toggle = useCallback(() => {
    if (playing) setPlaying(false);
    else play();
  }, [playing, play]);

  const restart = useCallback(() => {
    timeRef.current = 0;
    setTimeState(0);
  }, []);

  const reset = useCallback(() => {
    setPlaying(false);
    timeRef.current = 0;
    setTimeState(0);
  }, []);

  const jumpKey = useCallback(
    (direction: -1 | 1) => {
      setPlaying(false);
      const sorted = [...new Set(keyTimes.filter((t) => Number.isFinite(t)))].sort((a, b) => a - b);
      if (direction < 0) {
        const candidates = sorted.filter((t) => t < timeRef.current - safeDuration * 1e-5);
        setTime(candidates.length > 0 ? candidates[candidates.length - 1] : 0);
      } else {
        const candidates = sorted.filter((t) => t > timeRef.current + safeDuration * 1e-5);
        setTime(candidates.length > 0 ? candidates[0] : safeDuration);
      }
    },
    [keyTimes, safeDuration, setTime],
  );

  return {
    time,
    playing,
    speed,
    setSpeed,
    setTime,
    getTime,
    play,
    pause,
    toggle,
    restart,
    reset,
    jumpKey,
  };
}
