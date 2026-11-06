import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  MAX_EXPRESSION_DEPTH,
  MAX_EXPRESSION_LENGTH,
  parseParameterExpression,
} from '../../src/math/parameterExpression';

function valueOf(text: string): number {
  const result = parseParameterExpression(text);
  if (!result.ok) throw new Error(`expected valid expression: ${text} -> ${result.message}`);
  return result.value;
}

describe('parameterExpression: arithmetic and precedence', () => {
  it.each([
    ['1/2', 0.5],
    ['-3/4', -0.75],
    ['(1+2)/3', 1],
    ['2*(3+4)', 14],
    ['2(3+4)', 14],
    ['10-4-3', 3],
    ['10/(2*5)', 1],
    ['-2^2', -4],
    ['(-2)^2', 4],
    ['2^3^2', 512],
    ['2^(-3)', 0.125],
  ])('evaluates %s = %s', (text, expected) => {
    expect(valueOf(text)).toBeCloseTo(expected, 12);
  });

  it('supports fractions, roots, π and mixed parentheses', () => {
    expect(valueOf('1/3')).toBeCloseTo(1 / 3, 15);
    expect(valueOf('-3/4')).toBeCloseTo(-0.75, 15);
    expect(valueOf('√2')).toBeCloseTo(Math.SQRT2, 15);
    expect(valueOf('sqrt(2)')).toBeCloseTo(Math.SQRT2, 15);
    expect(valueOf('√3/2')).toBeCloseTo(Math.sqrt(3) / 2, 15);
    expect(valueOf('(√3)/2')).toBeCloseTo(Math.sqrt(3) / 2, 15);
    expect(valueOf('√(3/2)')).toBeCloseTo(Math.sqrt(1.5), 15);
    expect(valueOf('(1+√5)/2')).toBeCloseTo((1 + Math.sqrt(5)) / 2, 15);
    expect(valueOf('2(1+√3)')).toBeCloseTo(2 * (1 + Math.sqrt(3)), 15);
    expect(valueOf('2*(1+√3)')).toBeCloseTo(2 * (1 + Math.sqrt(3)), 15);
    expect(valueOf('π')).toBeCloseTo(Math.PI, 15);
    expect(valueOf('pi')).toBeCloseTo(Math.PI, 15);
    expect(valueOf('PI')).toBeCloseTo(Math.PI, 15);
    expect(valueOf('2π')).toBeCloseTo(2 * Math.PI, 15);
    expect(valueOf('2*pi')).toBeCloseTo(2 * Math.PI, 15);
    expect(valueOf('π/2')).toBeCloseTo(Math.PI / 2, 15);
    expect(valueOf('2√3')).toBeCloseTo(2 * Math.sqrt(3), 15);
  });

  it('supports scientific notation and signed decimals', () => {
    expect(valueOf('2.5e-4')).toBeCloseTo(0.00025, 15);
    expect(valueOf('1E-9')).toBeCloseTo(1e-9, 22);
    expect(valueOf('-0.125')).toBeCloseTo(-0.125, 15);
    expect(valueOf('2×10^-4')).toBeCloseTo(0.0002, 15);
    expect(valueOf('1.5e3')).toBeCloseTo(1500, 9);
  });

  it('normalizes full-width signs, operators and digits', () => {
    expect(valueOf('−3÷4')).toBeCloseTo(-0.75, 15);
    expect(valueOf('（１＋２）／３')).toBeCloseTo(1, 15);
    expect(valueOf('2×（1+√3）')).toBeCloseTo(2 * (1 + Math.sqrt(3)), 15);
    const result = parseParameterExpression('  √3/2  ');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.normalized).toBe('√3/2');
  });

  it('accepts zero and negative zero as finite values', () => {
    expect(valueOf('0')).toBe(0);
    expect(Object.is(valueOf('-0'), -0)).toBe(true);
  });
});

describe('parameterExpression: error classification', () => {
  it.each([
    ['', 'incomplete'],
    ['   ', 'incomplete'],
    ['-', 'incomplete'],
    ['√(', 'incomplete'],
    ['1/', 'incomplete'],
    ['2e-', 'incomplete'],
    ['2e+', 'incomplete'],
    ['(1+2', 'incomplete'],
  ])('treats %j as an editing state (%s)', (text, reason) => {
    const result = parseParameterExpression(text);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe(reason);
  });

  it.each([
    ['1/0', 'division-by-zero'],
    ['√(-1)', 'sqrt-negative'],
    ['sqrt(-4)', 'sqrt-negative'],
    ['1e9999', 'non-finite'],
    ['0^-1', 'non-finite'],
    ['(-2)^0.5', 'non-finite'],
    ['window.alert(1)', 'forbidden'],
    ['alert(1)', 'forbidden'],
    ['constructor', 'forbidden'],
    ['__proto__', 'forbidden'],
    ['Infinity', 'forbidden'],
    ['NaN', 'forbidden'],
    ['2*/3', 'syntax'],
    ['2 3', 'syntax'],
    ['1+2)', 'syntax'],
    ['()', 'syntax'],
    ['2,3', 'syntax'],
  ])('rejects %j with reason %s', (text, reason) => {
    const result = parseParameterExpression(text);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe(reason);
      expect(result.message.length).toBeGreaterThan(0);
    }
  });

  it('contains no eval or new Function in the parser implementation', () => {
    const source = readFileSync(`${process.cwd()}/src/math/parameterExpression.ts`, 'utf8');
    expect(source).not.toMatch(/\beval\s*\(/);
    expect(source).not.toMatch(/new\s+Function\s*\(/);
  });

  it('does not execute JavaScript or mutate globals', () => {
    const probe = globalThis as unknown as { __paramProbe?: unknown };
    delete probe.__paramProbe;
    for (const text of ['window.__paramProbe = 1', 'this.__paramProbe = 1', 'Function("return 1")()', 'eval("1+1")']) {
      const result = parseParameterExpression(text);
      expect(result.ok).toBe(false);
    }
    expect(probe.__paramProbe).toBeUndefined();
  });

  it('rejects expressions over the character limit', () => {
    const text = `1+${'2+'.repeat(70)}3`;
    expect(text.length).toBeGreaterThan(MAX_EXPRESSION_LENGTH);
    const result = parseParameterExpression(text);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('too-complex');
  });

  it('rejects deeply nested parentheses without freezing', () => {
    const text = `${'('.repeat(MAX_EXPRESSION_DEPTH + 4)}1${')'.repeat(MAX_EXPRESSION_DEPTH + 4)}`;
    const result = parseParameterExpression(text);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('too-complex');
  });

  it('accepts nesting just below the depth limit', () => {
    const depth = Math.min(MAX_EXPRESSION_DEPTH - 2, 20);
    const text = `${'('.repeat(depth)}1+1${')'.repeat(depth)}`;
    expect(valueOf(text)).toBe(2);
  });

  it('stays responsive for repeated complex input', () => {
    const started = performance.now();
    for (let index = 0; index < 500; index += 1) {
      parseParameterExpression(`(1+√${index % 9})/${(index % 7) + 1}`);
    }
    expect(performance.now() - started).toBeLessThan(1500);
  });
});
