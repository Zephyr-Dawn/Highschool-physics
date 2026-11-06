import { useEffect, useLayoutEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { Vec3 } from '../../physics/particles/lorentzForce';

function makeTexture(text: string, color: string): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 72;
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.font = '700 40px "Segoe UI", system-ui, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.lineWidth = 7;
  context.strokeStyle = 'rgba(248, 250, 252, 0.96)';
  context.strokeText(text, canvas.width / 2, canvas.height / 2);
  context.fillStyle = color;
  context.fillText(text, canvas.width / 2, canvas.height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}

export function LabelSprite({
  text,
  position,
  color = '#334155',
  scale = [1.05, 0.3, 1],
  offset = [0, 0, 0],
}: {
  text: string;
  position: Vec3;
  color?: string;
  scale?: [number, number, number];
  offset?: [number, number, number];
}) {
  const sprite = useMemo(() => {
    const texture = makeTexture(text, color);
    if (!texture) return null;
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    const next = new THREE.Sprite(material);
    next.position.set(0, 0, 0);
    next.scale.set(scale[0], scale[1], 1);
    next.renderOrder = 30;
    return next;
  }, [text, color, scale[0], scale[1], scale[2]]);

  useLayoutEffect(() => {
    if (!sprite) return;
    sprite.position.set(position.x + offset[0], position.y + offset[1], position.z + offset[2]);
  }, [sprite, position.x, position.y, position.z, offset[0], offset[1], offset[2]]);

  useEffect(() => () => {
    if (!sprite) return;
    const material = sprite.material as THREE.SpriteMaterial;
    material.map?.dispose();
    material.dispose();
  }, [sprite]);

  if (!sprite) return null;
  return <primitive object={sprite} />;
}
