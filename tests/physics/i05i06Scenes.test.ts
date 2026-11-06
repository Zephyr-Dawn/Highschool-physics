import { describe, expect, it } from 'vitest';
import {
  I05_DEFAULT_LAYERS,
  I05_PRESETS,
  I05_SCENE_STORAGE_KEY,
  decodeI05SceneJson,
  i05SceneFromPreset,
  parseI05StoredScene,
  serializeI05Scene,
} from '../../src/simulations/induction/i05Scene';
import {
  I06_DEFAULT_LAYERS,
  I06_PRESETS,
  I06_SCENE_STORAGE_KEY,
  decodeI06SceneJson,
  i06SceneFromPreset,
  parseI06StoredScene,
  serializeI06Scene,
} from '../../src/simulations/induction/i06Scene';

describe('I05 scene v2', () => {
  it('round-trips every preset and keeps layers separate from physical parameters', () => {
    expect(Object.keys(I05_PRESETS).length).toBeGreaterThanOrEqual(10);
    for (const preset of Object.values(I05_PRESETS)) {
      const scene = i05SceneFromPreset(preset);
      const parsed = parseI05StoredScene(JSON.parse(serializeI05Scene(scene)));
      expect(parsed.error).toBeNull();
      expect(parsed.scene?.params).toEqual(preset);
      expect(parsed.scene?.layers).toEqual(I05_DEFAULT_LAYERS);
    }
    expect(I05_SCENE_STORAGE_KEY).toBe('emplab.i05.scene.v2');
  });

  it('rejects malformed, wrong-model, invalid-domain and oversized JSON without crashing', () => {
    expect(parseI05StoredScene(null).scene).toBeNull();
    expect(parseI05StoredScene({ schemaVersion: 2, model: 'i06' }).scene).toBeNull();
    const bad = { ...i05SceneFromPreset(Object.values(I05_PRESETS)[0]), params: { ...Object.values(I05_PRESETS)[0], massKg: 0 } };
    expect(parseI05StoredScene(bad).scene).toBeNull();
    expect(decodeI05SceneJson('{bad json').scene).toBeNull();
    expect(decodeI05SceneJson('x'.repeat(1_000_001)).scene).toBeNull();
  });
});

describe('I06 scene v2', () => {
  it('round-trips every preset and keeps layers separate from physical parameters', () => {
    expect(Object.keys(I06_PRESETS).length).toBeGreaterThanOrEqual(10);
    for (const preset of Object.values(I06_PRESETS)) {
      const scene = i06SceneFromPreset(preset);
      const parsed = parseI06StoredScene(JSON.parse(serializeI06Scene(scene)));
      expect(parsed.error).toBeNull();
      expect(parsed.scene?.params).toEqual(preset);
      expect(parsed.scene?.layers).toEqual(I06_DEFAULT_LAYERS);
    }
    expect(I06_SCENE_STORAGE_KEY).toBe('emplab.i06.scene.v2');
  });

  it('rejects malformed, wrong-model, crossing rods and oversized JSON without crashing', () => {
    expect(parseI06StoredScene(null).scene).toBeNull();
    expect(parseI06StoredScene({ schemaVersion: 2, model: 'i05' }).scene).toBeNull();
    const base = Object.values(I06_PRESETS)[0];
    const crossing = { ...i06SceneFromPreset(base), params: { ...base, x1M: 3, x2M: 2 } };
    expect(parseI06StoredScene(crossing).scene).toBeNull();
    expect(decodeI06SceneJson('{bad json').scene).toBeNull();
    expect(decodeI06SceneJson('x'.repeat(1_000_001)).scene).toBeNull();
  });
});
