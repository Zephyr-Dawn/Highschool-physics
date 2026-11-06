import { parseParameterExpression } from './parameterExpression';
import { validateParameterValue, type ParameterDomain } from './parameterValidation';

/**
 * Session-only memory for the *text* the learner typed. Physics still uses the
 * committed numeric value; this only keeps "√3/2" visible after a tab switch
 * or a component remount. It never survives a full page reload.
 */
const memory = new Map<string, string>();

function currentRoute(): string {
  if (typeof window === 'undefined') return '';
  return window.location.hash || window.location.pathname;
}

export function parameterExpressionKey(label: string, unit: string): string {
  return `${currentRoute()}|${label}|${unit}`;
}

export function rememberParameterExpression(key: string, expression: string | null): void {
  const trimmed = expression?.trim() ?? '';
  if (trimmed.length === 0) {
    memory.delete(key);
    return;
  }
  memory.set(key, trimmed);
}

export function forgetParameterExpression(key: string): void {
  memory.delete(key);
}

export function recallParameterExpression(
  key: string,
  value: number,
  domain: ParameterDomain,
  label: string,
  unit: string,
  validateValue?: (value: number) => string | null,
): string | null {
  const expression = memory.get(key);
  if (!expression) return null;
  const parsed = parseParameterExpression(expression);
  if (!parsed.ok) {
    memory.delete(key);
    return null;
  }
  const domainResult = validateParameterValue(parsed.value, domain, label, unit);
  if (!domainResult.ok || (validateValue?.(parsed.value) ?? null)) {
    memory.delete(key);
    return null;
  }
  const tolerance = Math.max(1e-12, Math.max(Math.abs(value), Math.abs(parsed.value)) * 1e-10);
  if (Math.abs(parsed.value - value) > tolerance) {
    memory.delete(key);
    return null;
  }
  return expression;
}

export function clearParameterExpressionMemory(): void {
  memory.clear();
}
