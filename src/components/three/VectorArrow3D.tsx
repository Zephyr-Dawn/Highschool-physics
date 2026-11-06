import { useMemo } from 'react';
import * as THREE from 'three';
import {
  add3,
  magnitude3,
  normalize3,
  scale3,
  type Vec3,
} from '../../physics/particles/lorentzForce';
import { LabelSprite } from './LabelSprite';
import { SimpleLine3D } from './SimpleLine3D';

export function VectorArrow3D({
  origin,
  vector,
  visualLength,
  color,
  label,
  thickness = 0.024,
  opacity = 1,
  dashed = false,
  labelVisible = true,
}: {
  origin: Vec3;
  vector: Vec3;
  visualLength: number;
  color: string;
  label?: string;
  thickness?: number;
  opacity?: number;
  dashed?: boolean;
  labelVisible?: boolean;
}) {
  const direction = useMemo(() => normalize3(vector), [vector.x, vector.y, vector.z]);
  const length = Math.max(0.001, visualLength);
  const headLength = Math.min(length * 0.28, Math.max(0.11, thickness * 7));
  const shaftLength = Math.max(0.001, length - headLength);
  const tip = useMemo(
    () => (direction ? add3(origin, scale3(direction, length)) : origin),
    [direction, origin.x, origin.y, origin.z, length],
  );
  const quaternion = useMemo(() => {
    if (!direction) return new THREE.Quaternion();
    return new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(direction.x, direction.y, direction.z),
    );
  }, [direction?.x, direction?.y, direction?.z]);

  if (!direction || magnitude3(vector) < 1e-12) return null;

  const shaftCenter = add3(origin, scale3(direction, shaftLength / 2));
  const headCenter = add3(origin, scale3(direction, shaftLength + headLength / 2));

  return (
    <group>
      {dashed ? (
        <SimpleLine3D start={origin} end={tip} color={color} dashed opacity={opacity} />
      ) : (
        <mesh position={[shaftCenter.x, shaftCenter.y, shaftCenter.z]} quaternion={quaternion}>
          <cylinderGeometry args={[thickness, thickness, shaftLength, 10]} />
          <meshStandardMaterial color={color} transparent={opacity < 1} opacity={opacity} roughness={0.62} />
        </mesh>
      )}
      <mesh position={[headCenter.x, headCenter.y, headCenter.z]} quaternion={quaternion} renderOrder={4}>
        <coneGeometry args={[thickness * 2.7, headLength, 14]} />
        <meshStandardMaterial color={color} transparent={opacity < 1} opacity={opacity} roughness={0.55} />
      </mesh>
      {label && labelVisible ? (
        <LabelSprite
          text={label}
          position={tip}
          color={color}
          scale={[0.7, 0.2, 1]}
          offset={[direction.x * 0.16, direction.y * 0.16, direction.z * 0.16]}
        />
      ) : null}
    </group>
  );
}
