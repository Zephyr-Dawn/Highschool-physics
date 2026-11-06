import {
  Component,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MutableRefObject,
  type ReactNode,
  type RefObject,
} from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import * as THREE from 'three';
import {
  add3,
  dot3,
  lorentzForceSnapshot,
  magnitude3,
  scale3,
  type Vec3,
} from '../../physics/particles/lorentzForce';
import type {
  UniformB3DModel,
  UniformB3DState,
} from '../../physics/particles/uniformB3D';
import type {
  P01CameraPreset,
  P01EditPlane,
  P01ThreeDParticle,
  P01ThreeDScene,
} from './p01ThreeDScene';

export type { P01CameraPreset, P01EditPlane } from './p01ThreeDScene';
import { CameraPresets } from '../../components/three/CameraPresets';
import { AxisGizmo } from '../../components/three/AxisGizmo';
import { LabelSprite } from '../../components/three/LabelSprite';
import { AnalyticPath3D, DynamicLine3D, SimpleLine3D } from '../../components/three/SimpleLine3D';
import { VectorArrow3D } from '../../components/three/VectorArrow3D';
import { StageLegend } from '../../components/StageLegend';
import { formatForce, formatNumber, formatTime, formatVelocity } from '../../lib/format';

export interface P01ThreeDLayers {
  axes: boolean;
  grid: boolean;
  field: boolean;
  velocity: boolean;
  force: boolean;
  allVectors: boolean;
  predicted: boolean;
  traveled: boolean;
  decomposition: boolean;
  plane: boolean;
  labels: boolean;
  aux: boolean;
}

export const P01_THREE_DEFAULT_LAYERS: P01ThreeDLayers = {
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

export interface P01ThreeDViewParticle {
  particle: P01ThreeDParticle;
  model: UniformB3DModel;
  tauS: number | null;
  state: UniformB3DState | null;
  predictedPath: Vec3[];
  travelProgress: number;
  isDraft: boolean;
  waiting: boolean;
  helixCenter: Vec3 | null;
  launchTimeSec: number;
}

export interface P01CameraInfo {
  azimuthDeg: number;
  polarDeg: number;
  distance: number;
  right: Vec3;
  up: Vec3;
}

export type P01HandleKind = 'position' | 'velocity';

interface CameraApi {
  camera: THREE.PerspectiveCamera;
  gl: THREE.WebGLRenderer;
  raycaster: THREE.Raycaster;
}

interface P01ThreeDStageProps {
  mode: 'force3d' | 'motion3d';
  scene: P01ThreeDScene;
  viewParticles: P01ThreeDViewParticle[];
  selectedId: string;
  displayTime: number;
  playing: boolean;
  duration: number;
  cameraPreset: P01CameraPreset;
  editPlane: P01EditPlane;
  layers: P01ThreeDLayers;
  lowGraphics: boolean;
  editing: boolean;
  onCameraPresetChange: (preset: P01CameraPreset) => void;
  onCameraInteraction: () => void;
  onEditPlaneChange: (plane: P01EditPlane) => void;
  onSelectParticle: (id: string) => void;
  onHandleDragStart: (kind: P01HandleKind) => void;
  onHandleDrag: (patch: { position?: Vec3; velocity?: Vec3 }) => void;
  onHandleDragEnd: () => void;
  onHandleDragCancel: () => void;
  onUse2D: () => void;
  onContextLost: (reason: string) => void;
}

const V_SCALE = 0.6;
const B_SCALE = 0.65;
const VECTOR_COLOR = '#0f766e';
const FORCE_COLOR = '#c2410c';
const FIELD_COLOR = '#4f46e5';
const AXIS_COLORS = { x: '#dc2626', y: '#059669', z: '#2563eb' } as const;
const ORIGIN: Vec3 = { x: 0, y: 0, z: 0 };
const FIELD_ORIGIN: Vec3 = { x: -2.1, y: 1.35, z: -0.4 };

function vectorTuple(vector: Vec3): [number, number, number] {
  return [vector.x, vector.y, vector.z];
}

function clampComponent(value: number, limit = 5): number {
  return Math.max(-limit, Math.min(limit, Number.isFinite(value) ? value : 0));
}

function clampVector(vector: Vec3, limit = 5): Vec3 {
  return {
    x: clampComponent(vector.x, limit),
    y: clampComponent(vector.y, limit),
    z: clampComponent(vector.z, limit),
  };
}

function visualLengthFor(magnitude: number, scale: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, magnitude * scale));
}

class CanvasErrorBoundary extends Component<
  { onError: (message: string) => void; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    this.props.onError(error.message);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function RenderStatsBridge({
  onStats,
}: {
  onStats: (stats: { calls: number; triangles: number; lines: number }) => void;
}) {
  const { gl } = useThree();
  const last = useRef(0);
  const publish = () => {
    onStats({
      calls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
      lines: gl.info.render.lines,
    });
  };
  useEffect(() => {
    const timer = window.setTimeout(publish, 120);
    return () => window.clearTimeout(timer);
    // The renderer info is only populated after the first WebGL frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl]);
  useFrame(() => {
    const now = performance.now();
    if (now - last.current < 800) return;
    last.current = now;
    publish();
  });
  return null;
}

function ContextLossGuard({ onLost }: { onLost: (reason: string) => void }) {
  const { gl } = useThree();
  useEffect(() => {
    const canvas = gl.domElement;
    const handler = (event: Event) => {
      event.preventDefault();
      onLost('WebGL 上下文已丢失。物理数据仍保留，可重试 3D 或切换二维视图。');
    };
    canvas.addEventListener('webglcontextlost', handler);
    return () => canvas.removeEventListener('webglcontextlost', handler);
  }, [gl, onLost]);
  return null;
}

function applyCameraPreset(
  preset: P01CameraPreset,
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
): void {
  if (preset === 'custom') return;
  const distance = 7.0;
  if (preset === 'front') {
    camera.position.set(0, 0, distance);
    camera.up.set(0, 1, 0);
  } else if (preset === 'side') {
    camera.position.set(distance, 0, 0);
    camera.up.set(0, 1, 0);
  } else if (preset === 'top') {
    camera.position.set(0.001, distance, 0.001);
    camera.up.set(0, 0, -1);
  } else {
    camera.position.set(distance * 0.62, distance * 0.46, distance * 0.68);
    camera.up.set(0, 1, 0);
  }
  controls.target.set(0, 0, 0);
  camera.lookAt(0, 0, 0);
  controls.update();
}

function cameraInfoFrom(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
): P01CameraInfo {
  camera.updateMatrixWorld();
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).normalize();
  const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1).normalize();
  const offset = camera.position.clone().sub(controls.target);
  const spherical = new THREE.Spherical().setFromVector3(offset);
  return {
    azimuthDeg: THREE.MathUtils.radToDeg(spherical.theta),
    polarDeg: THREE.MathUtils.radToDeg(spherical.phi),
    distance: spherical.radius,
    right: { x: right.x, y: right.y, z: right.z },
    up: { x: up.x, y: up.y, z: up.z },
  };
}

function CameraRig({
  preset,
  enabled,
  cameraInfoRef,
  onCameraInfo,
  onUserOrbit,
}: {
  preset: P01CameraPreset;
  enabled: boolean;
  cameraInfoRef: MutableRefObject<P01CameraInfo>;
  onCameraInfo: (info: P01CameraInfo) => void;
  onUserOrbit: () => void;
}) {
  const { camera, gl, invalidate } = useThree();
  const controlsRef = useRef<OrbitControls | null>(null);
  const lastEmitRef = useRef(0);
  const onUserOrbitRef = useRef(onUserOrbit);
  const onCameraInfoCallbackRef = useRef(onCameraInfo);
  onUserOrbitRef.current = onUserOrbit;
  onCameraInfoCallbackRef.current = onCameraInfo;

  const emit = (force = false) => {
    const controls = controlsRef.current;
    if (!controls) return;
    const now = performance.now();
    if (!force && now - lastEmitRef.current < 60) return;
    lastEmitRef.current = now;
    const info = cameraInfoFrom(camera as THREE.PerspectiveCamera, controls);
    cameraInfoRef.current = info;
    onCameraInfoCallbackRef.current(info);
  };

  useEffect(() => {
    const controls = new OrbitControls(camera, gl.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.09;
    controls.rotateSpeed = 0.72;
    controls.zoomSpeed = 0.8;
    controls.panSpeed = 0.65;
    controls.minDistance = 3.2;
    controls.maxDistance = 20;
    controls.maxPolarAngle = Math.PI - 0.08;
    controls.minPolarAngle = 0.08;
    controls.target.set(0, 0, 0);
    controlsRef.current = controls;

    const handleChange = () => {
      emit();
      invalidate();
    };
    const handleStart = () => {
      if (controls.enabled) onUserOrbitRef.current();
    };
    const handleEnd = () => emit(true);
    controls.addEventListener('change', handleChange);
    controls.addEventListener('start', handleStart);
    controls.addEventListener('end', handleEnd);
    applyCameraPreset(preset, camera as THREE.PerspectiveCamera, controls);
    emit(true);
    return () => {
      controls.removeEventListener('change', handleChange);
      controls.removeEventListener('start', handleStart);
      controls.removeEventListener('end', handleEnd);
      controls.dispose();
      controlsRef.current = null;
    };
    // OrbitControls owns the canvas pointer lifecycle for the lifetime of the canvas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera, gl, invalidate]);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    applyCameraPreset(preset, camera as THREE.PerspectiveCamera, controls);
    emit(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, camera]);

  useEffect(() => {
    if (controlsRef.current) controlsRef.current.enabled = enabled;
  }, [enabled]);

  useFrame(() => {
    const controls = controlsRef.current;
    if (controls?.enabled) controls.update();
  });

  return null;
}

function ProjectionBridge({
  points,
  refs,
  cameraApiRef,
}: {
  points: Partial<Record<P01HandleKind, Vec3 | null>>;
  refs: MutableRefObject<Record<P01HandleKind, HTMLButtonElement | null>>;
  cameraApiRef: MutableRefObject<CameraApi | null>;
}) {
  const { camera, gl, size } = useThree();
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const projected = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => {
    cameraApiRef.current = { camera: camera as THREE.PerspectiveCamera, gl, raycaster };
    return () => {
      cameraApiRef.current = null;
    };
  }, [camera, gl, raycaster, cameraApiRef]);

  useFrame(() => {
    for (const kind of ['position', 'velocity'] as const) {
      const element = refs.current[kind];
      if (!element) continue;
      const point = points[kind];
      if (!point) {
        element.style.display = 'none';
        continue;
      }
      projected.set(point.x, point.y, point.z).project(camera);
      if (projected.z > 1 || projected.z < -1) {
        element.style.display = 'none';
        continue;
      }
      const x = (projected.x * 0.5 + 0.5) * size.width;
      const y = (-projected.y * 0.5 + 0.5) * size.height;
      element.style.display = 'flex';
      element.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
    }
  });

  return null;
}

function AxisTriad({ labels }: { labels: boolean }) {
  return (
    <group>
      {(['x', 'y', 'z'] as const).map((axis) => {
        const vector = axis === 'x' ? { x: 1, y: 0, z: 0 } : axis === 'y' ? { x: 0, y: 1, z: 0 } : { x: 0, y: 0, z: 1 };
        return (
          <group key={axis}>
            <VectorArrow3D
              origin={ORIGIN}
              vector={vector}
              visualLength={2.35}
              color={AXIS_COLORS[axis]}
              label={labels ? `+${axis}` : undefined}
              thickness={0.011}
              labelVisible={labels}
            />
            <SimpleLine3D
              start={ORIGIN}
              end={scale3(vector, -1.25)}
              color={AXIS_COLORS[axis]}
              dashed
              opacity={0.34}
            />
          </group>
        );
      })}
      <mesh>
        <sphereGeometry args={[0.045, 14, 14]} />
        <meshStandardMaterial color="#475569" />
      </mesh>
    </group>
  );
}

function ReferencePlane({ center, model }: { center: Vec3; model: UniformB3DModel }) {
  const quaternion = useMemo(() => {
    if (!model.bHat) return null;
    return new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(model.bHat.x, model.bHat.y, model.bHat.z),
    );
  }, [model.bHat?.x, model.bHat?.y, model.bHat?.z]);
  if (!quaternion) return null;
  return (
    <group position={vectorTuple(center)} quaternion={quaternion}>
      <mesh renderOrder={1}>
        <circleGeometry args={[2.45, 64]} />
        <meshBasicMaterial color="#6366f1" transparent opacity={0.075} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh renderOrder={2}>
        <ringGeometry args={[2.42, 2.46, 64]} />
        <meshBasicMaterial color="#6366f1" transparent opacity={0.34} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
    </group>
  );
}

function HelixAssist({
  selected,
  currentPosition,
  lowGraphics,
}: {
  selected: P01ThreeDViewParticle;
  currentPosition: Vec3 | null;
  lowGraphics: boolean;
}) {
  const model = selected.model;
  const center = selected.helixCenter;
  if (!model.axis || !center || model.radiusM === null) return null;
  const axis = model.axis;
  let min = -1.2;
  let max = 1.2;
  if (!lowGraphics && selected.predictedPath.length > 1) {
    const projections = selected.predictedPath.map((point) =>
      dot3({ x: point.x - center.x, y: point.y - center.y, z: point.z - center.z }, axis),
    );
    min = Math.min(...projections);
    max = Math.max(...projections);
    if (max - min < 0.25) {
      min = -1.2;
      max = 1.2;
    }
  }
  const axisStart = add3(center, scale3(axis, min - 0.2));
  const axisEnd = add3(center, scale3(axis, max + 0.2));
  const current = currentPosition ?? selected.particle.position;
  const axisPoint = add3(center, scale3(axis, dot3({ x: current.x - center.x, y: current.y - center.y, z: current.z - center.z }, axis)));
  return (
    <group>
      <SimpleLine3D start={axisStart} end={axisEnd} color="#64748b" dashed opacity={0.42} />
      {model.kind !== 'straight' ? (
        <>
          <DynamicLine3D start={axisPoint} end={current} color={selected.particle.color} dashed opacity={0.55} />
          <mesh position={vectorTuple(axisPoint)}>
            <sphereGeometry args={[0.045, 12, 12]} />
            <meshBasicMaterial color="#64748b" transparent opacity={0.7} />
          </mesh>
        </>
      ) : null}
    </group>
  );
}

function ParticleSphere({
  particle,
  position,
  selected,
  waiting,
  onSelect,
  labels,
}: {
  particle: P01ThreeDParticle;
  position: Vec3;
  selected: boolean;
  waiting: boolean;
  onSelect: (id: string) => void;
  labels: boolean;
}) {
  return (
    <group position={vectorTuple(position)}>
      <mesh
        onPointerDown={(event) => {
          event.stopPropagation();
          onSelect(particle.id);
        }}
        renderOrder={5}
      >
        <sphereGeometry args={[selected ? 0.15 : 0.11, 18, 18]} />
        <meshStandardMaterial
          color={particle.color}
          emissive={particle.color}
          emissiveIntensity={selected ? 0.28 : 0.08}
          roughness={0.4}
          transparent
          opacity={waiting ? 0.62 : 1}
        />
      </mesh>
      {selected ? (
        <mesh>
          <sphereGeometry args={[0.22, 18, 18]} />
          <meshBasicMaterial color={particle.color} transparent opacity={0.14} depthWrite={false} />
        </mesh>
      ) : null}
      {labels ? (
        <LabelSprite
          text={waiting ? `${particle.label} 待发射` : particle.label}
          position={position}
          color={particle.color}
          scale={waiting ? [1.4, 0.4, 1] : [0.55, 0.16, 1]}
          offset={[0, 0.3, 0]}
        />
      ) : null}
    </group>
  );
}

function SceneObjects({
  mode,
  scene,
  viewParticles,
  selectedId,
  layers,
  lowGraphics,
  onSelectParticle,
}: {
  mode: 'force3d' | 'motion3d';
  scene: P01ThreeDScene;
  viewParticles: P01ThreeDViewParticle[];
  selectedId: string;
  layers: P01ThreeDLayers;
  lowGraphics: boolean;
  onSelectParticle: (id: string) => void;
}) {
  const selected = viewParticles.find((item) => item.particle.id === selectedId) ?? viewParticles[0];
  if (!selected) return null;

  const selectedPosition =
    mode === 'motion3d' && selected.state ? selected.state.position : selected.particle.position;
  const selectedVelocity =
    mode === 'motion3d' && selected.state ? selected.state.velocity : selected.particle.velocity;
  const selectedForce =
    mode === 'motion3d' && selected.state ? selected.state.force : selected.model.initialForce;
  const selectedSpeed = magnitude3(selectedVelocity);
  const selectedForceMagnitude = magnitude3(selectedForce);
  const bMagnitude = magnitude3(scene.field.B);
  const showForce = layers.force && selectedForceMagnitude > 1e-10;
  const showVelocity = layers.velocity && selectedSpeed > 1e-10;
  const model = selected.model;
  const currentPosition =
    mode === 'motion3d' && selected.state ? selected.state.position : null;
  const axis = model.axis;
  const planeCenter = selected.particle.position;

  const decomposition =
    mode === 'motion3d' && selected.state && (model.kind === 'helix' || model.kind === 'circle')
      ? {
          parallel: selected.state.vParallel,
          perpendicular: selected.state.vPerp,
        }
      : null;

  return (
    <group>
      <ambientLight intensity={1.25} />
      <directionalLight position={[6, 9, 7]} intensity={1.45} />
      <directionalLight position={[-5, -3, -6]} intensity={0.45} />

      {layers.grid ? (
        <gridHelper args={[10, 20, '#94a3b8', '#dbe4ee']} position={[0, -0.02, 0]} />
      ) : null}
      {layers.axes ? <AxisTriad labels={layers.labels} /> : null}
      {layers.plane && model.bHat ? <ReferencePlane center={planeCenter} model={model} /> : null}
      {layers.aux ? <HelixAssist selected={selected} currentPosition={currentPosition} lowGraphics={lowGraphics} /> : null}

      {layers.field && bMagnitude > 1e-12 ? (
        <VectorArrow3D
          origin={FIELD_ORIGIN}
          vector={scene.field.B}
          visualLength={visualLengthFor(bMagnitude, B_SCALE, 0.6, 3.0)}
          color={FIELD_COLOR}
          label={layers.labels ? 'B' : undefined}
          thickness={0.024}
          labelVisible={layers.labels}
        />
      ) : null}

      {mode === 'motion3d'
        ? viewParticles.map((item) => {
            if (item.particle.visible === false) return null;
            if (!layers.predicted || item.predictedPath.length < 2) return null;
            return (
              <AnalyticPath3D
                key={`predicted-${item.particle.id}`}
                points={item.predictedPath}
                color={item.particle.color}
                opacity={item.particle.id === selectedId ? 0.4 : 0.28}
                dashed={item.particle.id !== selectedId || lowGraphics}
              />
            );
          })
        : null}
      {mode === 'motion3d'
        ? viewParticles.map((item) => {
            if (item.particle.visible === false || !item.particle.showTrail) return null;
            if (!layers.traveled || !item.state || item.travelProgress <= 0.0001) return null;
            return (
              <AnalyticPath3D
                key={`traveled-${item.particle.id}`}
                points={item.predictedPath}
                color={item.particle.color}
                opacity={item.particle.id === selectedId ? 0.95 : 0.7}
                progress={item.travelProgress}
              />
            );
          })
        : null}

      {mode === 'motion3d'
        ? viewParticles.map((item) => {
            if (!item.state) return null;
            const position = item.particle.position;
            return (
              <mesh key={`initial-${item.particle.id}`} position={vectorTuple(position)}>
                <sphereGeometry args={[0.05, 12, 12]} />
                <meshBasicMaterial color={item.particle.color} transparent opacity={0.42} />
              </mesh>
            );
          })
        : null}

      {viewParticles.map((item) => {
        if (item.particle.visible === false) return null;
        const position =
          mode === 'motion3d' && item.state ? item.state.position : item.particle.position;
        const waiting = item.waiting;
        return (
          <ParticleSphere
            key={`particle-${item.particle.id}`}
            particle={item.particle}
            position={position}
            selected={item.particle.id === selectedId}
            waiting={waiting}
            onSelect={onSelectParticle}
            labels={layers.labels}
          />
        );
      })}

      {selected.particle.visible !== false ? (
        <group>
          {showVelocity ? (
            <VectorArrow3D
              origin={selectedPosition}
              vector={selectedVelocity}
              visualLength={visualLengthFor(selectedSpeed, V_SCALE, 0.6, 3.0)}
              color={VECTOR_COLOR}
              label={layers.labels ? 'v' : undefined}
              thickness={0.027}
              labelVisible={layers.labels}
            />
          ) : null}
          {showForce ? (
            <VectorArrow3D
              origin={selectedPosition}
              vector={selectedForce}
              visualLength={visualLengthFor(selectedForceMagnitude, 0.18, 0.7, 3.0)}
              color={FORCE_COLOR}
              label={layers.labels ? 'F' : undefined}
              thickness={0.027}
              labelVisible={layers.labels}
            />
          ) : null}
          {decomposition && magnitude3(decomposition.parallel) > 1e-9 ? (
            <VectorArrow3D
              origin={selectedPosition}
              vector={decomposition.parallel}
              visualLength={visualLengthFor(magnitude3(decomposition.parallel), V_SCALE, 0.4, 2.8)}
              color="#0d9488"
              label={layers.labels ? 'v∥' : undefined}
              thickness={0.018}
              opacity={0.78}
              labelVisible={layers.labels}
            />
          ) : null}
          {decomposition && magnitude3(decomposition.perpendicular) > 1e-9 ? (
            <VectorArrow3D
              origin={selectedPosition}
              vector={decomposition.perpendicular}
              visualLength={visualLengthFor(magnitude3(decomposition.perpendicular), V_SCALE, 0.4, 2.8)}
              color="#14b8a6"
              label={layers.labels ? 'v⊥' : undefined}
              thickness={0.018}
              opacity={0.78}
              labelVisible={layers.labels}
            />
          ) : null}
          {mode === 'motion3d' && layers.plane && axis && selected.state ? (
            <ProjectionAssist center={planeCenter} axis={axis} current={selected.state.position} color={selected.particle.color} />
          ) : null}
        </group>
      ) : null}

      {layers.allVectors
        ? viewParticles.map((item) => {
            if (item.particle.id === selectedId || item.particle.visible === false) return null;
            const origin =
              mode === 'motion3d' && item.state ? item.state.position : item.particle.position;
            const velocity =
              mode === 'motion3d' && item.state ? item.state.velocity : item.particle.velocity;
            const force =
              mode === 'motion3d' && item.state ? item.state.force : item.model.initialForce;
            return (
              <group key={`all-${item.particle.id}`}>
                {layers.velocity && magnitude3(velocity) > 1e-10 ? (
                  <VectorArrow3D
                    origin={origin}
                    vector={velocity}
                    visualLength={visualLengthFor(magnitude3(velocity), V_SCALE, 0.36, 2.5)}
                    color={VECTOR_COLOR}
                    thickness={0.014}
                    opacity={0.62}
                    labelVisible={false}
                  />
                ) : null}
                {layers.force && magnitude3(force) > 1e-10 ? (
                  <VectorArrow3D
                    origin={origin}
                    vector={force}
                    visualLength={visualLengthFor(magnitude3(force), 0.14, 0.42, 2.4)}
                    color={FORCE_COLOR}
                    thickness={0.014}
                    opacity={0.58}
                    labelVisible={false}
                  />
                ) : null}
              </group>
            );
          })
        : null}
    </group>
  );
}

function ProjectionAssist({
  center,
  axis,
  current,
  color,
}: {
  center: Vec3;
  axis: Vec3;
  current: Vec3;
  color: string;
}) {
  const relative = { x: current.x - center.x, y: current.y - center.y, z: current.z - center.z };
  const projection = add3(center, scale3(axis, dot3(relative, axis)));
  return (
    <group>
      <DynamicLine3D start={projection} end={current} color={color} dashed opacity={0.42} />
      <mesh position={vectorTuple(projection)}>
        <sphereGeometry args={[0.05, 12, 12]} />
        <meshBasicMaterial color={color} transparent opacity={0.78} />
      </mesh>
    </group>
  );
}

function StageHandles({
  selected,
  editPlane,
  handleRefs,
  cameraApiRef,
  wrapRef,
  onHandleDragStart,
  onHandleDrag,
  onHandleDragEnd,
  onHandleDragCancel,
  editing,
  setEditing,
}: {
  selected: P01ThreeDViewParticle | null;
  editPlane: P01EditPlane;
  handleRefs: MutableRefObject<Record<P01HandleKind, HTMLButtonElement | null>>;
  cameraApiRef: MutableRefObject<CameraApi | null>;
  wrapRef: RefObject<HTMLDivElement | null>;
  onHandleDragStart: (kind: P01HandleKind) => void;
  onHandleDrag: (patch: { position?: Vec3; velocity?: Vec3 }) => void;
  onHandleDragEnd: () => void;
  onHandleDragCancel: () => void;
  editing: boolean;
  setEditing: (editing: boolean) => void;
}) {
  const dragRef = useRef<{
    kind: P01HandleKind;
    pointerId: number;
    listener: (event: PointerEvent) => void;
  } | null>(null);

  const cleanup = () => {
    const current = dragRef.current;
    if (current) window.removeEventListener('pointerdown', current.listener, true);
    dragRef.current = null;
    setEditing(false);
  };

  const cancel = () => {
    if (!dragRef.current) return;
    cleanup();
    onHandleDragCancel();
  };

  useEffect(() => () => {
    const current = dragRef.current;
    if (current) window.removeEventListener('pointerdown', current.listener, true);
  }, []);

  const startDrag = (event: React.PointerEvent<HTMLButtonElement>, kind: P01HandleKind) => {
    if (!selected || !cameraApiRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    const currentTarget = event.currentTarget;
    try {
      currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Some test environments do not expose pointer capture; drag still works.
    }
    const listener = (secondEvent: PointerEvent) => {
      if (dragRef.current && secondEvent.pointerId !== dragRef.current.pointerId) {
        cancel();
      }
    };
    dragRef.current = { kind, pointerId: event.pointerId, listener };
    window.addEventListener('pointerdown', listener, true);
    setEditing(true);
    onHandleDragStart(kind);
  };

  const moveDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    const selectedNow = selected;
    const api = cameraApiRef.current;
    const wrap = wrapRef.current;
    if (!drag || !selectedNow || !api || !wrap) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = wrap.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const ndc = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    api.raycaster.setFromCamera(ndc, api.camera);
    const base = selectedNow.particle.position;
    const fixed = editPlane === 'XY' ? 'z' : editPlane === 'XZ' ? 'y' : 'x';
    const normal = new THREE.Vector3(
      fixed === 'x' ? 1 : 0,
      fixed === 'y' ? 1 : 0,
      fixed === 'z' ? 1 : 0,
    );
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, new THREE.Vector3(base.x, base.y, base.z));
    const intersection = new THREE.Vector3();
    if (!api.raycaster.ray.intersectPlane(plane, intersection)) return;
    if (drag.kind === 'position') {
      const next = { ...base };
      if (editPlane === 'XY') {
        next.x = clampComponent(intersection.x, 4);
        next.y = clampComponent(intersection.y, 4);
      } else if (editPlane === 'XZ') {
        next.x = clampComponent(intersection.x, 4);
        next.z = clampComponent(intersection.z, 4);
      } else {
        next.y = clampComponent(intersection.y, 4);
        next.z = clampComponent(intersection.z, 4);
      }
      onHandleDrag({ position: next });
    } else if (drag.kind === 'velocity') {
      const next = {
        x: clampComponent((intersection.x - base.x) / V_SCALE),
        y: clampComponent((intersection.y - base.y) / V_SCALE),
        z: clampComponent((intersection.z - base.z) / V_SCALE),
      };
      if (editPlane === 'XY') {
        next.z = selectedNow.particle.velocity.z;
      } else if (editPlane === 'XZ') {
        next.y = selectedNow.particle.velocity.y;
      } else {
        next.x = selectedNow.particle.velocity.x;
      }
      onHandleDrag({ velocity: clampVector(next) });
    }
  };

  const endDrag = (event: React.PointerEvent<HTMLButtonElement>, commit: boolean) => {
    if (!dragRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    cleanup();
    if (commit) onHandleDragEnd();
    else onHandleDragCancel();
  };

  if (!selected) return null;
  const velocity = selected.particle.velocity;
  const showVelocityHandle = magnitude3(velocity) > 0.08;
  const velocityTip = add3(selected.particle.position, scale3(velocity, V_SCALE));

  return (
    <div className="p01-3d-handle-layer">
      <button
        ref={(element) => {
          handleRefs.current.position = element;
        }}
        type="button"
        className="p01-3d-handle p01-3d-handle-position"
        style={{ '--handle-color': selected.particle.color } as CSSProperties}
        aria-label={`拖动粒子 ${selected.particle.label} 的初始位置；当前编辑平面 ${editPlane}`}
        title={`拖动初始位置 r₀（${editPlane} 平面）`}
        data-testid="p01-3d-handle-position"
        onPointerDown={(event) => startDrag(event, 'position')}
        onPointerMove={moveDrag}
        onPointerUp={(event) => endDrag(event, true)}
        onPointerCancel={(event) => endDrag(event, false)}
      >
        <span aria-hidden="true">r₀</span>
      </button>
      {showVelocityHandle ? (
        <button
          ref={(element) => {
            handleRefs.current.velocity = element;
          }}
          type="button"
          className="p01-3d-handle p01-3d-handle-velocity"
          aria-label={`拖动粒子 ${selected.particle.label} 的初始速度 v；当前编辑平面 ${editPlane}`}
          title={`拖动初始速度 v（${editPlane} 平面，大小与方向同时改变）`}
          data-testid="p01-3d-handle-velocity"
          data-tip-x={velocityTip.x}
          data-tip-y={velocityTip.y}
          data-tip-z={velocityTip.z}
          onPointerDown={(event) => startDrag(event, 'velocity')}
          onPointerMove={moveDrag}
          onPointerUp={(event) => endDrag(event, true)}
          onPointerCancel={(event) => endDrag(event, false)}
        >
          <span aria-hidden="true">v</span>
        </button>
      ) : null}
      {editing ? <span className="p01-3d-editing-chip">正在编辑初态 · 其他粒子继续运动</span> : null}
    </div>
  );
}

export function P01ThreeDStage({
  mode,
  scene,
  viewParticles,
  selectedId,
  displayTime,
  playing,
  duration,
  cameraPreset,
  editPlane,
  layers,
  lowGraphics,
  editing,
  onCameraPresetChange,
  onCameraInteraction,
  onEditPlaneChange,
  onSelectParticle,
  onHandleDragStart,
  onHandleDrag,
  onHandleDragEnd,
  onHandleDragCancel,
  onUse2D,
  onContextLost,
}: P01ThreeDStageProps) {
  const [cameraInfo, setCameraInfo] = useState<P01CameraInfo>({
    azimuthDeg: 35,
    polarDeg: 62,
    distance: 7.0,
    right: { x: 1, y: 0, z: 0 },
    up: { x: 0, y: 1, z: 0 },
  });
  const cameraInfoRef = useRef(cameraInfo);
  const [handleEditing, setHandleEditing] = useState(false);
  const [renderStats, setRenderStats] = useState({ calls: 0, triangles: 0, lines: 0 });
  const handleRefs = useRef<Record<P01HandleKind, HTMLButtonElement | null>>({
    position: null,
    velocity: null,
  });
  const cameraApiRef = useRef<CameraApi | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const selected = viewParticles.find((item) => item.particle.id === selectedId) ?? viewParticles[0] ?? null;
  const selectedVelocity =
    mode === 'motion3d' && selected?.state ? selected.state.velocity : selected?.particle.velocity ?? ORIGIN;
  const selectedForce =
    mode === 'motion3d' && selected?.state ? selected.state.force : selected?.model.initialForce ?? ORIGIN;
  const selectedSnapshot = useMemo(
    () =>
      lorentzForceSnapshot({
        chargeC: selected?.particle.chargeC ?? 0,
        massKg: selected?.particle.massKg ?? 1,
        velocity: selectedVelocity,
        B: scene.field.B,
      }),
    [selected?.particle.chargeC, selected?.particle.massKg, selectedVelocity, scene.field.B],
  );

  const handlePoints = useMemo<Partial<Record<P01HandleKind, Vec3 | null>>>(() => {
    if (!selected) return { position: null, velocity: null };
    const velocity = selected.particle.velocity;
    return {
      position: selected.particle.position,
      velocity: magnitude3(velocity) > 0.08 ? add3(selected.particle.position, scale3(velocity, V_SCALE)) : null,
    };
  }, [selected]);

  const selectedVisible = selected?.particle.visible !== false;
  const forceHidden = !layers.force || selectedSnapshot.zeroForceReason !== 'none';
  const cameraBackward = {
    x: cameraInfo.right.y * cameraInfo.up.z - cameraInfo.right.z * cameraInfo.up.y,
    y: cameraInfo.right.z * cameraInfo.up.x - cameraInfo.right.x * cameraInfo.up.z,
    z: cameraInfo.right.x * cameraInfo.up.y - cameraInfo.right.y * cameraInfo.up.x,
  };
  const bMagnitude = magnitude3(scene.field.B);
  const bView = bMagnitude > 1e-12
    ? (scene.field.B.x * cameraBackward.x + scene.field.B.y * cameraBackward.y + scene.field.B.z * cameraBackward.z) / bMagnitude
    : 0;
  const fieldGlyph = bView > 0.92
    ? { symbol: '⊙', label: 'B 出屏', orientation: 'out-of-screen' }
    : bView < -0.92
      ? { symbol: '⊗', label: 'B 入屏', orientation: 'into-screen' }
      : { symbol: '↗', label: 'B 斜指', orientation: 'oblique' };
  const canvasActive = mode === 'motion3d' && playing;
  const wrapClass = `stage-wrap p01-3d-canvas-wrap ${handleEditing ? 'is-editing' : ''}`;

  return (
    <div
      className="stage-card p01-3d-stage-card"
      data-testid="p01-3d-stage"
      data-mode={mode}
      data-webgl="true"
      data-camera-preset={cameraPreset}
      data-camera-azimuth={cameraInfo.azimuthDeg.toFixed(3)}
      data-camera-polar={cameraInfo.polarDeg.toFixed(3)}
      data-camera-distance={cameraInfo.distance.toFixed(3)}
      data-selected={selected?.particle.label ?? ''}
      data-particle-count={scene.particles.length}
      data-q={selected?.particle.chargeC ?? 0}
      data-mass={selected?.particle.massKg ?? 0}
      data-vx={selectedVelocity.x}
      data-vy={selectedVelocity.y}
      data-vz={selectedVelocity.z}
      data-bx={scene.field.B.x}
      data-by={scene.field.B.y}
      data-bz={scene.field.B.z}
      data-fx={selectedForce.x}
      data-fy={selectedForce.y}
      data-fz={selectedForce.z}
      data-force-mag={selectedSnapshot.magnitude}
      data-theta-deg={selectedSnapshot.thetaDeg}
      data-zero-reason={selectedSnapshot.zeroForceReason}
      data-force-hidden={forceHidden}
      data-time={displayTime}
      data-edit-plane={editPlane}
      data-editing={editing || handleEditing}
      data-low-graphics={lowGraphics}
      data-selected-waiting={selected?.waiting ?? false}
      data-render-calls={renderStats.calls}
      data-render-triangles={renderStats.triangles}
      data-render-lines={renderStats.lines}
    >
      <div className="p01-3d-toolbar">
        <CameraPresets active={cameraPreset} onChange={onCameraPresetChange} />
        <div className="p01-3d-toolbar-group" role="group" aria-label="约束拖拽平面">
          <span className="p01-3d-toolbar-label">拖拽平面</span>
          {(['XY', 'XZ', 'YZ'] as const).map((plane) => (
            <button
              key={plane}
              type="button"
              className={`chip-button ${editPlane === plane ? 'is-active' : ''}`}
              aria-pressed={editPlane === plane}
              onClick={() => onEditPlaneChange(plane)}
              data-testid={`p01-edit-plane-${plane}`}
            >
              {plane}
            </button>
          ))}
        </div>
        <div className="p01-3d-toolbar-note">
          <span>相机操作不改变物理量</span>
        </div>
      </div>
      <div className={wrapClass} ref={wrapRef}>
        <CanvasErrorBoundary onError={onContextLost}>
          <Canvas
            camera={{ position: [4.5, 3.4, 5.2], fov: 44, near: 0.1, far: 120 }}
            dpr={lowGraphics ? 1 : [1, 1.75]}
            frameloop={canvasActive ? 'always' : 'demand'}
            gl={{ antialias: !lowGraphics, alpha: false, powerPreference: 'high-performance' }}
            onCreated={({ gl }) => {
              const canvas = gl.domElement;
              canvas.setAttribute('data-testid', 'p01-3d-canvas');
              canvas.setAttribute('data-webgl-version', gl.capabilities.isWebGL2 ? '2' : '1');
              canvas.setAttribute('data-renderer', String(gl.getContext().getParameter(gl.getContext().RENDERER) ?? ''));
            }}
          >
            <color attach="background" args={['#f8fafc']} />
            <ContextLossGuard onLost={onContextLost} />
            <CameraRig
              preset={cameraPreset}
              enabled={!handleEditing}
              cameraInfoRef={cameraInfoRef}
              onCameraInfo={setCameraInfo}
              onUserOrbit={onCameraInteraction}
            />
            <ProjectionBridge points={handlePoints} refs={handleRefs} cameraApiRef={cameraApiRef} />
            <RenderStatsBridge onStats={setRenderStats} />
            <SceneObjects
              mode={mode}
              scene={scene}
              viewParticles={viewParticles}
              selectedId={selectedId}
              layers={layers}
              lowGraphics={lowGraphics}
              onSelectParticle={onSelectParticle}
            />
          </Canvas>
        </CanvasErrorBoundary>
        <div className="p01-3d-overlay">
          <div className="p01-3d-hud">
            <span className="hud-chip hud-field">B = ({formatNumber(scene.field.B.x, 2)}, {formatNumber(scene.field.B.y, 2)}, {formatNumber(scene.field.B.z, 2)}) T</span>
            <span className="hud-chip p01-3d-field-glyph" data-testid="p01-3d-field-glyph" data-orientation={fieldGlyph.orientation} data-b-view={bView.toFixed(4)}>
              {fieldGlyph.symbol} {fieldGlyph.label}
            </span>
            <span className="hud-chip">
              选中 {selected?.particle.label ?? '—'} · {scene.particles.length}/5
            </span>
            <span className="hud-chip">
              {mode === 'motion3d' ? `t = ${formatTime(displayTime)}` : '瞬时快照'}
            </span>
            <span className="hud-chip">
              {selected?.waiting ? '待发射' : `|v| = ${formatVelocity(magnitude3(selectedVelocity))}`}
            </span>
            <span className={`hud-chip ${forceHidden ? 'hud-chip-quiet' : ''}`}>
              {forceHidden ? 'F 已隐藏或为零' : `|F| = ${formatForce(selectedSnapshot.magnitude)}`}
            </span>
          </div>
          <AxisGizmo
            cameraRight={cameraInfo.right}
            cameraUp={cameraInfo.up}
            azimuthDeg={cameraInfo.azimuthDeg}
            polarDeg={cameraInfo.polarDeg}
          />
          <div className="p01-3d-stage-hint">
            单指空白：旋转相机 · 双指：缩放/平移 · 拖动 r₀/v 圆点：编辑初态
            <span className="p01-3d-plane-hint">当前约束平面：{editPlane}</span>
          </div>
          {selectedVisible ? (
            <StageHandles
              selected={selected}
              editPlane={editPlane}
              handleRefs={handleRefs}
              cameraApiRef={cameraApiRef}
              wrapRef={wrapRef}
              onHandleDragStart={onHandleDragStart}
              onHandleDrag={onHandleDrag}
              onHandleDragEnd={onHandleDragEnd}
              onHandleDragCancel={onHandleDragCancel}
              editing={editing || handleEditing}
              setEditing={setHandleEditing}
            />
          ) : null}
          {mode === 'motion3d' ? (
            <button
              type="button"
              className="p01-3d-2d-link"
              onClick={onUse2D}
              data-testid="p01-3d-use-2d"
            >
              切到二维运动
            </button>
          ) : null}
        </div>
      </div>
      <StageLegend
        items={[
          { label: 'B（共享）', color: FIELD_COLOR, variant: 'solid' },
          { label: 'v（速度）', color: VECTOR_COLOR, variant: 'solid' },
          { label: 'F_B（洛伦兹力）', color: FORCE_COLOR, variant: 'solid' },
          { label: '预测/已走轨迹', color: '#64748b', variant: 'dashed' },
        ]}
      />
      <p className="p01-3d-legend-note">
        箭头长度使用各自独立的视觉比例（v ×0.6、B ×0.65、F 归一化），不能横向比较长度；精确 SI 分量见数据面板。
        {mode === 'motion3d' ? ` 完整预测路径约 ${formatTime(duration)}，按解析解采样。` : ''}
      </p>
      <span hidden data-testid="p01-3d-force-magnitude">{selectedSnapshot.magnitude}</span>
      <span hidden data-testid="p01-3d-theta">{selectedSnapshot.thetaDeg}</span>
      <span hidden data-testid="p01-3d-zero-reason">{selectedSnapshot.zeroForceReason}</span>
      <span hidden data-testid="p01-3d-distance">{cameraInfo.distance.toFixed(4)}</span>
      {viewParticles.map((item) => (
        <span
          key={`state-${item.particle.id}`}
          hidden
          data-testid={`p01-3d-particle-${item.particle.label}`}
          data-id={item.particle.id}
          data-launch-time={item.launchTimeSec}
          data-tau={item.tauS ?? ''}
          data-waiting={item.waiting}
          data-x={item.state?.position.x ?? item.particle.position.x}
          data-y={item.state?.position.y ?? item.particle.position.y}
          data-z={item.state?.position.z ?? item.particle.position.z}
          data-vx={item.state?.velocity.x ?? item.particle.velocity.x}
          data-vy={item.state?.velocity.y ?? item.particle.velocity.y}
          data-vz={item.state?.velocity.z ?? item.particle.velocity.z}
          data-initial-x={item.particle.position.x}
          data-initial-y={item.particle.position.y}
          data-initial-z={item.particle.position.z}
          data-initial-vx={item.particle.velocity.x}
          data-initial-vy={item.particle.velocity.y}
          data-initial-vz={item.particle.velocity.z}
          data-charge-c={item.particle.chargeC}
          data-mass-kg={item.particle.massKg}
          data-kind={item.model.kind}
          data-radius={item.model.radiusM ?? ''}
          data-period={item.model.periodS ?? ''}
          data-pitch={item.model.pitchSignedM ?? ''}
        />
      ))}
    </div>
  );
}

