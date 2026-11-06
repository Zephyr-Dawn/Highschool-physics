import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePlaybackClock } from '../../src/hooks/usePlaybackClock';

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('playback clock restart semantics', () => {
  it('restarts at t=0 without changing the playing state', () => {
    const { result } = renderHook(() => usePlaybackClock(2, [0, 1, 2]));

    act(() => result.current.setTime(1.4));
    expect(result.current.time).toBeCloseTo(1.4, 6);

    act(() => result.current.restart());
    expect(result.current.time).toBe(0);
    expect(result.current.playing).toBe(false);

    act(() => result.current.play());
    expect(result.current.playing).toBe(true);
    act(() => result.current.setTime(1.2));
    act(() => result.current.restart());

    expect(result.current.time).toBe(0);
    expect(result.current.playing).toBe(true);
  });

  it('keeps the transport reset explicit and stops playback', () => {
    const { result } = renderHook(() => usePlaybackClock(2, [0, 1, 2]));
    act(() => result.current.play());
    act(() => result.current.setTime(0.8));
    act(() => result.current.reset());
    expect(result.current.time).toBe(0);
    expect(result.current.playing).toBe(false);
  });

  it('can advance in real simulation seconds for continuous manual experiments', () => {
    let now = 0;
    let frameCallback: FrameRequestCallback | null = null;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frameCallback = callback;
      return 1;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);

    const { result } = renderHook(() => usePlaybackClock(20, [0, 20], { realTime: true }));
    act(() => result.current.play());
    act(() => {
      for (let frame = 0; frame < 20; frame++) {
        now += 50;
        frameCallback?.(now);
      }
    });

    expect(result.current.time).toBeCloseTo(1, 3);
    expect(result.current.playing).toBe(true);
  });
});
