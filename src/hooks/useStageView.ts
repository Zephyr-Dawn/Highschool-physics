import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { clamp, type Vec2 } from '../physics/core/vec2';

export interface StageView {
  centerX: number;
  centerY: number;
  scale: number;
}

export interface StageBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface PointerPoint {
  clientX: number;
  clientY: number;
  localX: number;
  localY: number;
}

type Gesture =
  | { kind: 'pan'; pointerId: number; startLocal: Vec2; startView: StageView }
  | {
      kind: 'pinch';
      ids: [number, number];
      startDistance: number;
      startView: StageView;
      anchorWorld: Vec2;
    };

const MIN_SCALE = 2;
const MAX_SCALE = 2_000_000;

export function useStageView(options: {
  width: number;
  height: number;
  panEnabled: boolean;
  initialScale?: number;
}) {
  const { width, height, panEnabled } = options;
  const [view, setViewState] = useState<StageView>({
    centerX: 0,
    centerY: 0,
    scale: options.initialScale ?? 400,
  });
  const viewRef = useRef(view);
  const pointers = useRef(new Map<number, PointerPoint>());
  const gesture = useRef<Gesture | null>(null);

  const setView = useCallback((next: StageView) => {
    viewRef.current = next;
    setViewState(next);
  }, []);

  const toScreen = useCallback(
    (point: Vec2) => ({
      x: width / 2 + (point.x - view.centerX) * view.scale,
      y: height / 2 - (point.y - view.centerY) * view.scale,
    }),
    [height, view, width],
  );

  const toWorld = useCallback(
    (screen: Vec2) => ({
      x: view.centerX + (screen.x - width / 2) / view.scale,
      y: view.centerY + (height / 2 - screen.y) / view.scale,
    }),
    [height, view, width],
  );

  const fitBounds = useCallback(
    (bounds: StageBounds, paddingPx = 30) => {
      if (width <= 0 || height <= 0) return;
      const spanX = Math.max(1e-6, bounds.maxX - bounds.minX);
      const spanY = Math.max(1e-6, bounds.maxY - bounds.minY);
      const availableW = Math.max(40, width - paddingPx * 2);
      const availableH = Math.max(40, height - paddingPx * 2);
      const scale = clamp(Math.min(availableW / spanX, availableH / spanY), MIN_SCALE, MAX_SCALE);
      setView({
        centerX: (bounds.minX + bounds.maxX) / 2,
        centerY: (bounds.minY + bounds.maxY) / 2,
        scale,
      });
    },
    [height, setView, width],
  );

  const zoomBy = useCallback(
    (factor: number, anchor?: Vec2) => {
      const current = viewRef.current;
      const localAnchor = anchor ?? { x: width / 2, y: height / 2 };
      const worldAnchor = {
        x: current.centerX + (localAnchor.x - width / 2) / current.scale,
        y: current.centerY + (height / 2 - localAnchor.y) / current.scale,
      };
      const nextScale = clamp(current.scale * factor, MIN_SCALE, MAX_SCALE);
      setView({
        centerX: worldAnchor.x - (localAnchor.x - width / 2) / nextScale,
        centerY: worldAnchor.y + (localAnchor.y - height / 2) / nextScale,
        scale: nextScale,
      });
    },
    [height, setView, width],
  );

  const localPoint = (event: ReactPointerEvent<SVGSVGElement>): Vec2 => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const onPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const local = localPoint(event);
    pointers.current.set(event.pointerId, {
      clientX: event.clientX,
      clientY: event.clientY,
      localX: local.x,
      localY: local.y,
    });
    event.currentTarget.setPointerCapture?.(event.pointerId);

    if (pointers.current.size === 1 && panEnabled) {
      gesture.current = {
        kind: 'pan',
        pointerId: event.pointerId,
        startLocal: local,
        startView: viewRef.current,
      };
    } else if (pointers.current.size === 2) {
      const entries = [...pointers.current.entries()];
      const [firstId, first] = entries[0];
      const [secondId, second] = entries[1];
      const mid = {
        x: (first.localX + second.localX) / 2,
        y: (first.localY + second.localY) / 2,
      };
      const currentView = viewRef.current;
      gesture.current = {
        kind: 'pinch',
        ids: [firstId, secondId],
        startDistance: Math.max(
          1,
          Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY),
        ),
        startView: currentView,
        anchorWorld: {
          x: currentView.centerX + (mid.x - width / 2) / currentView.scale,
          y: currentView.centerY + (height / 2 - mid.y) / currentView.scale,
        },
      };
    }
  };

  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const existing = pointers.current.get(event.pointerId);
    if (!existing) return;
    const local = localPoint(event);
    pointers.current.set(event.pointerId, {
      clientX: event.clientX,
      clientY: event.clientY,
      localX: local.x,
      localY: local.y,
    });
    const currentGesture = gesture.current;
    if (!currentGesture) return;

    if (currentGesture.kind === 'pinch') {
      const first = pointers.current.get(currentGesture.ids[0]);
      const second = pointers.current.get(currentGesture.ids[1]);
      if (!first || !second) return;
      const distance = Math.max(
        1,
        Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY),
      );
      const mid = {
        x: (first.localX + second.localX) / 2,
        y: (first.localY + second.localY) / 2,
      };
      const ratio = distance / currentGesture.startDistance;
      const nextScale = clamp(currentGesture.startView.scale * ratio, MIN_SCALE, MAX_SCALE);
      setView({
        centerX: currentGesture.anchorWorld.x - (mid.x - width / 2) / nextScale,
        centerY: currentGesture.anchorWorld.y + (mid.y - height / 2) / nextScale,
        scale: nextScale,
      });
      return;
    }

    if (currentGesture.kind === 'pan' && currentGesture.pointerId === event.pointerId) {
      const dx = local.x - currentGesture.startLocal.x;
      const dy = local.y - currentGesture.startLocal.y;
      setView({
        centerX: currentGesture.startView.centerX - dx / currentGesture.startView.scale,
        centerY: currentGesture.startView.centerY + dy / currentGesture.startView.scale,
        scale: currentGesture.startView.scale,
      });
    }
  };

  const endPointer = (event: ReactPointerEvent<SVGSVGElement>) => {
    pointers.current.delete(event.pointerId);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    if (pointers.current.size < 2) {
      gesture.current = null;
    }
  };

  return {
    view,
    setView,
    toScreen,
    toWorld,
    fitBounds,
    zoomBy,
    stageHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endPointer,
      onPointerCancel: endPointer,
      onPointerLeave: (event: ReactPointerEvent<SVGSVGElement>) => {
        if (pointers.current.has(event.pointerId) && event.buttons === 0) endPointer(event);
      },
    },
  };
}

export function boundsFromPoints(points: Vec2[], padding = 0): StageBounds {
  if (points.length === 0) return { minX: -0.5, minY: -0.5, maxX: 0.5, maxY: 0.5 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  return {
    minX: minX - padding,
    minY: minY - padding,
    maxX: maxX + padding,
    maxY: maxY + padding,
  };
}
