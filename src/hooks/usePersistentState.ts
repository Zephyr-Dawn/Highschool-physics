import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';

export function readStored<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function usePersistentState<T>(
  key: string,
  initialValue: T,
): [T, Dispatch<SetStateAction<T>>] {
  const [state, setState] = useState<T>(() => readStored(key, initialValue));
  const stateRef = useRef(state);
  const pendingWrite = useRef<number | null>(null);
  stateRef.current = state;

  useEffect(() => {
    if (pendingWrite.current !== null) {
      window.clearTimeout(pendingWrite.current);
    }
    pendingWrite.current = window.setTimeout(() => {
      try {
        window.localStorage.setItem(key, JSON.stringify(stateRef.current));
      } catch {
        // Private browsing or a full quota must not break the lesson.
      }
      pendingWrite.current = null;
    }, 180);

    return () => {
      if (pendingWrite.current !== null) {
        window.clearTimeout(pendingWrite.current);
        pendingWrite.current = null;
      }
    };
  }, [key, state]);

  useEffect(
    () => () => {
      try {
        window.localStorage.setItem(key, JSON.stringify(stateRef.current));
      } catch {
        // Best-effort flush on unmount.
      }
    },
    [key],
  );

  const update = useCallback<Dispatch<SetStateAction<T>>>((value) => {
    setState((prev) => (typeof value === 'function' ? (value as (p: T) => T)(prev) : value));
  }, []);

  return [state, update];
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
