import { describe, expect, it } from 'vitest';
import {
  GLOBAL_STABILITY_LIMIT,
  PARAMETER_DOMAINS,
  resolveParameterDomain,
  validateParameterValue,
} from '../../src/math/parameterValidation';

describe('parameterValidation: physical domains', () => {
  it('accepts values beyond the slider range but inside the physical domain', () => {
    const result = validateParameterValue(5, PARAMETER_DOMAINS.magneticField, '磁感应强度 B', 'T');
    expect(result).toEqual({ ok: true, value: 5 });
    expect(validateParameterValue(-10, PARAMETER_DOMAINS.magneticField, 'B', 'T').ok).toBe(true);
    expect(validateParameterValue(Math.sqrt(3) / 2, PARAMETER_DOMAINS.magneticField, 'B', 'T').ok).toBe(true);
  });

  it('rejects a non-positive mass with a physical reason', () => {
    for (const value of [0, -1, -1e-9]) {
      const result = validateParameterValue(value, PARAMETER_DOMAINS.positiveMass, '质量 m', 'kg');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('out-of-domain');
        expect(result.message).toContain('质量 m');
        expect(result.message).toContain('物理有效域');
      }
    }
  });

  it('rejects a non-positive resistance and length', () => {
    expect(validateParameterValue(0, PARAMETER_DOMAINS.resistance, '电阻 R', 'Ω').ok).toBe(false);
    expect(validateParameterValue(0, PARAMETER_DOMAINS.positiveLength, '宽度', 'm').ok).toBe(false);
    expect(validateParameterValue(1 / 3, PARAMETER_DOMAINS.resistance, '电阻 R', 'Ω').ok).toBe(true);
  });

  it('requires N to be an integer and never rounds 3/2', () => {
    const notInteger = validateParameterValue(1.5, PARAMETER_DOMAINS.turns, '匝数 N', '匝');
    expect(notInteger.ok).toBe(false);
    if (!notInteger.ok) {
      expect(notInteger.reason).toBe('not-integer');
      expect(notInteger.message).toContain('不会被四舍五入');
    }
    expect(validateParameterValue(8, PARAMETER_DOMAINS.turns, '匝数 N', '匝').ok).toBe(true);
    expect(validateParameterValue(1001, PARAMETER_DOMAINS.turns, '匝数 N', '匝').ok).toBe(false);
  });

  it('separates model stability limits from physical constraints', () => {
    const result = validateParameterValue(12, PARAMETER_DOMAINS.i04Field, '偏置 B₀', 'T');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('unstable');
      expect(result.message).toContain('稳定计算范围');
    }
    expect(validateParameterValue(10, PARAMETER_DOMAINS.i04Field, '偏置 B₀', 'T').ok).toBe(true);
    expect(validateParameterValue(0.005, PARAMETER_DOMAINS.i04Frequency, '频率 f', 'Hz').ok).toBe(false);
    expect(validateParameterValue(0.01, PARAMETER_DOMAINS.i04Frequency, '频率 f', 'Hz').ok).toBe(true);
  });

  it('reports tiny finite values that fall below solver stability as unstable', () => {
    const tinyMass = validateParameterValue(1e-13, PARAMETER_DOMAINS.positiveMass, '质量 m', 'kg');
    expect(tinyMass.ok).toBe(false);
    if (!tinyMass.ok) {
      expect(tinyMass.reason).toBe('unstable');
      expect(tinyMass.message).toContain('稳定计算下限');
    }
    const tinyResistance = validateParameterValue(1e-10, PARAMETER_DOMAINS.resistance, '电阻 R', 'Ω');
    expect(tinyResistance.ok).toBe(false);
    if (!tinyResistance.ok) expect(tinyResistance.reason).toBe('unstable');
  });

  it('rejects non-finite values and global numerical extremes', () => {
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const result = validateParameterValue(value, PARAMETER_DOMAINS.signedSpeed, '速度', 'm/s');
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('not-finite');
    }
    const extreme = validateParameterValue(GLOBAL_STABILITY_LIMIT * 2, PARAMETER_DOMAINS.signedDimensionless, '数值');
    expect(extreme.ok).toBe(false);
    if (!extreme.ok) expect(extreme.reason).toBe('unstable');
  });

  it('allows signed fields, velocities and angles', () => {
    expect(validateParameterValue(-2, PARAMETER_DOMAINS.signedCharge, '电荷量 q', 'C').ok).toBe(true);
    expect(validateParameterValue(-3, PARAMETER_DOMAINS.signedSpeed, '初速度 v', 'm/s').ok).toBe(true);
    expect(validateParameterValue(-720, PARAMETER_DOMAINS.angleDeg, '角度 θ', '°').ok).toBe(true);
  });
});

describe('parameterValidation: domain resolution from units', () => {
  it('maps turns, mass, resistance, field and angle units', () => {
    expect(resolveParameterDomain('匝数 N', 'turn')).toMatchObject({ integer: true, min: 1 });
    expect(resolveParameterDomain('质量 m', '×10⁻²⁶ kg')).toMatchObject({ minOpen: true });
    expect(resolveParameterDomain('总电阻 R', 'Ω')).toMatchObject({ min: 0, minOpen: true });
    expect(resolveParameterDomain('B_z', 'T')).toMatchObject({ min: -100, max: 100 });
    expect(resolveParameterDomain('磁感应强度 |B|', 'T')).toMatchObject({ min: 0, max: 100 });
    expect(resolveParameterDomain('初相 φ', '°')).toMatchObject({ min: -1e7 });
  });

  it('distinguishes charge magnitude from signed charge', () => {
    expect(resolveParameterDomain('电荷量 |q|', 'e')).toMatchObject({ min: 0 });
    expect(resolveParameterDomain('电荷量 q', 'C')).toMatchObject({ min: -1e6 });
  });

  it('distinguishes speed magnitude from signed velocity', () => {
    expect(resolveParameterDomain('速度大小 v', 'm/s')).toMatchObject({ min: 0 });
    expect(resolveParameterDomain('设定速度 v_set', 'm/s')).toMatchObject({ min: -1e7 });
    expect(resolveParameterDomain('速度大小 v', '×10⁶ m/s')).toMatchObject({ min: 0 });
  });

  it('treats geometry names as positive lengths but raw positions as signed', () => {
    expect(resolveParameterDomain('线框宽度', 'm')).toMatchObject({ minOpen: true });
    expect(resolveParameterDomain('入射点 x', 'cm')).toMatchObject({ min: -1e8 });
    expect(resolveParameterDomain('屏幕 y 下限', 'm')).toMatchObject({ min: -1e6 });
  });
});
