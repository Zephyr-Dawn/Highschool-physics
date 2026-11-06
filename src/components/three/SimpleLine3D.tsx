import { useEffect, useLayoutEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { Vec3 } from '../../physics/particles/lorentzForce';

function tuple(point: Vec3): [number, number, number] {
  return [point.x, point.y, point.z];
}

export function SimpleLine3D({
  start,
  end,
  color,
  dashed = false,
  opacity = 1,
}: {
  start: Vec3;
  end: Vec3;
  color: string;
  dashed?: boolean;
  opacity?: number;
}) {
  const object = useMemo(() => {
    const geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(...tuple(start)),
      new THREE.Vector3(...tuple(end)),
    ]);
    const material = dashed
      ? new THREE.LineDashedMaterial({ color, transparent: opacity < 1, opacity, dashSize: 0.12, gapSize: 0.08 })
      : new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity });
    const line = new THREE.Line(geometry, material);
    if (dashed) line.computeLineDistances();
    line.frustumCulled = false;
    return line;
  }, [start.x, start.y, start.z, end.x, end.y, end.z, color, dashed, opacity]);

  useEffect(() => () => {
    object.geometry.dispose();
    object.material.dispose();
  }, [object]);

  return <primitive object={object} />;
}

export function DynamicLine3D({
  start,
  end,
  color,
  dashed = false,
  opacity = 1,
}: {
  start: Vec3;
  end: Vec3;
  color: string;
  dashed?: boolean;
  opacity?: number;
}) {
  const geometry = useMemo(() => {
    const next = new THREE.BufferGeometry();
    next.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(6), 3));
    return next;
  }, []);
  const material = useMemo(
    () =>
      dashed
        ? new THREE.LineDashedMaterial({ color, transparent: opacity < 1, opacity, dashSize: 0.12, gapSize: 0.08 })
        : new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity }),
    [color, dashed, opacity],
  );
  const line = useMemo(() => {
    const next = new THREE.Line(geometry, material);
    next.frustumCulled = false;
    return next;
  }, [geometry, material]);

  useLayoutEffect(() => {
    const attribute = geometry.getAttribute('position') as THREE.BufferAttribute;
    attribute.setXYZ(0, start.x, start.y, start.z);
    attribute.setXYZ(1, end.x, end.y, end.z);
    attribute.needsUpdate = true;
    geometry.computeBoundingSphere();
    if (dashed) line.computeLineDistances();
  }, [start.x, start.y, start.z, end.x, end.y, end.z, dashed, geometry, line]);

  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
  }, [geometry, material]);

  return <primitive object={line} />;
}

export function AnalyticPath3D({
  points,
  color,
  opacity = 1,
  dashed = false,
  progress = 1,
}: {
  points: Vec3[];
  color: string;
  opacity?: number;
  dashed?: boolean;
  progress?: number;
}) {
  const object = useMemo(() => {
    const geometry = new THREE.BufferGeometry().setFromPoints(
      points.map((point) => new THREE.Vector3(point.x, point.y, point.z)),
    );
    const material = dashed
      ? new THREE.LineDashedMaterial({ color, transparent: true, opacity, dashSize: 0.16, gapSize: 0.11 })
      : new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity });
    const line = new THREE.Line(geometry, material);
    if (dashed) line.computeLineDistances();
    line.frustumCulled = false;
    return line;
  }, [points, color, opacity, dashed]);

  useLayoutEffect(() => {
    const total = points.length;
    const clamped = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
    const count = total <= 1 ? total : Math.max(1, Math.min(total, Math.ceil(clamped * total)));
    object.geometry.setDrawRange(0, count);
  }, [object, points.length, progress]);

  useEffect(() => () => {
    object.geometry.dispose();
    object.material.dispose();
  }, [object]);

  return <primitive object={object} />;
}
