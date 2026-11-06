import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { clamp } from '../physics/core/vec2';
import { formatNumber } from '../lib/format';
import { parseParameterExpression, type MathParseResult } from '../math/parameterExpression';
import {
  resolveParameterDomain,
  validateParameterValue,
  type ParameterDomain,
  type ParameterValidation,
} from '../math/parameterValidation';
import {
  forgetParameterExpression,
  parameterExpressionKey,
  recallParameterExpression,
  rememberParameterExpression,
} from '../math/parameterExpressionMemory';

export type ParameterCommitSemantics =
  | 'single-particle'
  | 'shared-reset'
  | 'continuous-target'
  | 'config';

interface ParamSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (value: number) => void;
  description?: string;
  decimals?: number;
  testId?: string;
  domain?: ParameterDomain;
  validateValue?: (value: number) => string | null;
  commitSemantics?: ParameterCommitSemantics;
}

interface MathTargetInputProps {
  label: string;
  value: number;
  unit: string;
  onCommit: (value: number) => string | null | void;
  description?: string;
  decimals?: number;
  testId?: string;
  domain?: ParameterDomain;
  validateValue?: (value: number) => string | null;
  disabled?: boolean;
}

const APPROX_TOLERANCE = 1e-10;

function decimalsForStep(step: number): number {
  if (step >= 1) return 0;
  return Math.min(6, Math.max(1, Math.ceil(-Math.log10(step))));
}

function approxEqual(left: number, right: number): boolean {
  if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
  return Math.abs(left - right) <= Math.max(1e-12, Math.max(Math.abs(left), Math.abs(right)) * APPROX_TOLERANCE);
}

export function formatParameterInputValue(value: number, decimals: number): string {
  if (!Number.isFinite(value)) return '';
  if (value === 0) return (0).toFixed(decimals);
  const abs = Math.abs(value);
  const fixed = value.toFixed(decimals);
  const tolerance = Math.max(1e-12, abs * 1e-10);
  if (Math.abs(Number(fixed) - value) <= tolerance) return fixed;
  if (abs >= 1e9 || abs < 1e-6) return value.toExponential(8).replace(/\.?0+e/, 'e');
  return String(Number(value.toPrecision(12)));
}

export function formatParameterApprox(value: number): string {
  if (!Number.isFinite(value)) return '—';
  if (value === 0) return '0';
  const abs = Math.abs(value);
  if (abs >= 1e6 || abs < 1e-4) return value.toExponential(6).replace(/\.?0+e/, 'e');
  return String(Number(value.toPrecision(8)));
}

type Analysis =
  | { ok: true; value: number; normalized: string }
  | { ok: false; reason: 'incomplete' | 'error'; message: string };

interface MathExpressionEditorProps {
  id: string;
  label: string;
  value: number;
  unit: string;
  decimals: number;
  domain: ParameterDomain;
  inputAriaLabel: string;
  onCommit: (value: number) => string | null | void;
  validateValue?: (value: number) => string | null;
  testId?: string;
  disabled?: boolean;
  resetToken?: number;
  descriptionId?: string;
}

function analyzeDraft(
  parsed: MathParseResult,
  domain: ParameterDomain,
  label: string,
  unit: string,
  validateValue?: (value: number) => string | null,
): Analysis {
  if (!parsed.ok) {
    return {
      ok: false,
      reason: parsed.reason === 'incomplete' ? 'incomplete' : 'error',
      message: parsed.message,
    };
  }
  const domainResult: ParameterValidation = validateParameterValue(parsed.value, domain, label, unit);
  if (!domainResult.ok) {
    return { ok: false, reason: 'error', message: domainResult.message };
  }
  const custom = validateValue?.(parsed.value) ?? null;
  if (custom) {
    return { ok: false, reason: 'error', message: custom };
  }
  return { ok: true, value: parsed.value, normalized: parsed.normalized };
}

function MathExpressionEditor({
  id,
  label,
  value,
  unit,
  decimals,
  domain,
  inputAriaLabel,
  onCommit,
  validateValue,
  testId,
  disabled,
  resetToken,
  descriptionId,
}: MathExpressionEditorProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const memoryKey = useMemo(() => parameterExpressionKey(label, unit), [label, unit]);
  const initialExpressionRef = useRef<string | null | undefined>(undefined);
  if (initialExpressionRef.current === undefined) {
    initialExpressionRef.current = recallParameterExpression(memoryKey, value, domain, label, unit, validateValue);
  }
  const [draft, setDraft] = useState(() => initialExpressionRef.current ?? formatParameterInputValue(value, decimals));
  const [committedExpression, setCommittedExpression] = useState<string | null>(() => initialExpressionRef.current ?? null);
  const [focused, setFocused] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const lastValueRef = useRef(value);
  const composingRef = useRef(false);
  const skipBlurCommitRef = useRef(false);
  const previousResetRef = useRef(resetToken);

  const parsed = useMemo(() => parseParameterExpression(draft), [draft]);
  const analysis = useMemo(
    () => analyzeDraft(parsed, domain, label, unit, validateValue),
    [domain, label, parsed, unit, validateValue],
  );

  useEffect(() => {
    if (previousResetRef.current !== resetToken) {
      previousResetRef.current = resetToken;
      lastValueRef.current = value;
      forgetParameterExpression(memoryKey);
      setDraft(formatParameterInputValue(value, decimals));
      setCommittedExpression(null);
      setLocalError(null);
      return;
    }
    if (approxEqual(value, lastValueRef.current)) {
      lastValueRef.current = value;
      return;
    }
    if (document.activeElement === inputRef.current) {
      lastValueRef.current = value;
      return;
    }
    lastValueRef.current = value;
    forgetParameterExpression(memoryKey);
    setDraft(formatParameterInputValue(value, decimals));
    setCommittedExpression(null);
    setLocalError(null);
  }, [decimals, memoryKey, resetToken, value]);

  const applyDraft = (next: string) => {
    setDraft(next);
    setLocalError(null);
  };

  const commit = (): boolean => {
    if (disabled) return false;
    if (composingRef.current) return false;
    if (!analysis.ok) return false;
    const trimmed = draft.trim();
    const canonical = formatParameterInputValue(analysis.value, decimals);
    const expression = trimmed === canonical ? null : trimmed;
    if (approxEqual(analysis.value, value)) {
      lastValueRef.current = value;
      rememberParameterExpression(memoryKey, expression);
      setCommittedExpression(expression);
      setDraft(expression ?? canonical);
      setLocalError(null);
      return true;
    }
    const outcome = onCommit(analysis.value);
    if (typeof outcome === 'string') {
      setLocalError(outcome);
      return false;
    }
    lastValueRef.current = analysis.value;
    rememberParameterExpression(memoryKey, expression);
    setCommittedExpression(expression);
    setDraft(expression ?? formatParameterInputValue(analysis.value, decimals));
    setLocalError(null);
    return true;
  };

  const revert = () => {
    setDraft(committedExpression ?? formatParameterInputValue(value, decimals));
    if (committedExpression) rememberParameterExpression(memoryKey, committedExpression);
    else forgetParameterExpression(memoryKey);
    setLocalError(null);
  };

  const insert = (text: string, cursorOffset = text.length) => {
    const input = inputRef.current;
    const start = input?.selectionStart ?? draft.length;
    const end = input?.selectionEnd ?? start;
    const next = `${draft.slice(0, start)}${text}${draft.slice(end)}`;
    applyDraft(next);
    const position = start + cursorOffset;
    input?.focus();
    window.requestAnimationFrame(() => {
      input?.setSelectionRange(position, position);
    });
  };

  const preventFocusLoss = (event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
  };

  const valueText = `${formatParameterApprox(value)} ${unit}`;
  let statusTone: 'incomplete' | 'error' | 'preview' | 'committed' | 'hint' | null = null;
  let statusText: string | null = null;
  let ariaInvalid = false;
  if (localError) {
    statusTone = 'error';
    statusText = `${localError} 未提交；当前实验仍为 ${valueText}。`;
    ariaInvalid = true;
  } else if (!analysis.ok) {
    statusTone = analysis.reason === 'incomplete' ? 'incomplete' : 'error';
    statusText = analysis.reason === 'incomplete'
      ? `${analysis.message} 当前实验仍为 ${valueText}。`
      : `${analysis.message} 未提交；当前实验仍为 ${valueText}。`;
    ariaInvalid = analysis.reason === 'error';
  } else if (!approxEqual(analysis.value, value)) {
    statusTone = 'preview';
    statusText = `预览 ≈ ${formatParameterApprox(analysis.value)} ${unit} · Enter 或失焦提交；当前实验仍为 ${valueText}。`;
  } else if (committedExpression) {
    statusTone = 'committed';
    statusText = `已提交 ${committedExpression} ≈ ${formatParameterApprox(value)} ${unit}。`;
  } else if (focused && analysis.ok) {
    statusTone = 'hint';
    statusText = `= ${formatParameterApprox(analysis.value)} ${unit}。支持分数、√、π、括号、^ 和科学计数法。`;
  }
  const showStatus = statusText !== null && (focused || committedExpression !== null || localError !== null || !analysis.ok || statusTone === 'committed');
  const describedBy = [showStatus ? `${id}-status` : null, descriptionId].filter(Boolean).join(' ') || undefined;

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing || composingRef.current) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      const committed = commit();
      if (committed) {
        skipBlurCommitRef.current = true;
        inputRef.current?.blur();
      }
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      revert();
      skipBlurCommitRef.current = true;
      inputRef.current?.blur();
    }
  };

  return (
    <>
      <div className="param-head">
        <label htmlFor={id} className="param-label">
          {label}
        </label>
        <div className={`param-number-wrap ${focused ? 'is-focused' : ''}`}>
          <input
            ref={inputRef}
            id={id}
            className="param-number param-expression"
            type="text"
            inputMode="text"
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="done"
            disabled={disabled}
            aria-label={inputAriaLabel}
            aria-invalid={ariaInvalid}
            aria-describedby={describedBy}
            value={draft}
            onChange={(event) => {
              if (composingRef.current) {
                setDraft(event.target.value);
                return;
              }
              applyDraft(event.target.value);
            }}
            onCompositionStart={() => {
              composingRef.current = true;
            }}
            onCompositionEnd={(event) => {
              composingRef.current = false;
              applyDraft(event.currentTarget.value);
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => {
              setFocused(false);
              if (skipBlurCommitRef.current) {
                skipBlurCommitRef.current = false;
                return;
              }
              commit();
            }}
            onKeyDown={handleKeyDown}
            data-testid={testId ? `${testId}-expression` : undefined}
          />
          <span className="param-unit">{unit}</span>
        </div>
      </div>
      {showStatus ? (
        <p
          id={`${id}-status`}
          className={`param-math-status is-${statusTone ?? 'hint'}`}
          role="status"
          aria-live="polite"
          data-testid={testId ? `${testId}-status` : undefined}
        >
          {statusText}
        </p>
      ) : null}
      {focused ? (
        <div className="param-math-shortcuts" role="group" aria-label={`${label}数学符号快捷输入`}>
          <button type="button" onPointerDown={preventFocusLoss} onClick={() => insert('√()', 2)} aria-label="插入根号">√( )</button>
          <button type="button" onPointerDown={preventFocusLoss} onClick={() => insert('π')} aria-label="插入圆周率 π">π</button>
          <button type="button" onPointerDown={preventFocusLoss} onClick={() => insert('/')} aria-label="插入除号">/</button>
          <button type="button" onPointerDown={preventFocusLoss} onClick={() => insert('()', 1)} aria-label="插入括号">( )</button>
          <button type="button" onPointerDown={preventFocusLoss} onClick={() => insert('^')} aria-label="插入幂运算符">^</button>
          <button type="button" onPointerDown={preventFocusLoss} onClick={() => insert('×10^')} aria-label="插入科学计数法">×10^</button>
        </div>
      ) : null}
    </>
  );
}

export function ParamSlider({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
  description,
  decimals = decimalsForStep(step),
  testId,
  domain: domainProp,
  validateValue,
  commitSemantics = 'config',
}: ParamSliderProps) {
  const id = useId();
  const [resetToken, setResetToken] = useState(0);
  const domain = useMemo(
    () => domainProp ?? resolveParameterDomain(label, unit),
    [domainProp, label, unit],
  );
  const tolerance = Math.max(1e-12, Math.abs(max - min) * 1e-12);
  const outOfRange = value < min - tolerance || value > max + tolerance;
  const sliderValue = clamp(value, min, max);
  const descriptionId = description ? `${id}-description` : undefined;

  return (
    <div
      className={`param ${outOfRange ? 'is-overflow' : ''}`}
      data-testid={testId}
      data-out-of-range={outOfRange ? 'true' : 'false'}
      data-committed-value={value}
      data-commit-semantics={commitSemantics}
    >
      <MathExpressionEditor
        id={`${id}-expression`}
        label={label}
        value={value}
        unit={unit}
        decimals={decimals}
        domain={domain}
        inputAriaLabel={`${label}数值（${unit}）`}
        onCommit={onChange}
        validateValue={validateValue}
        testId={testId}
        resetToken={resetToken}
        descriptionId={descriptionId}
      />
      <input
        id={`${id}-range`}
        className="param-range"
        type="range"
        min={min}
        max={max}
        step={step}
        value={sliderValue}
        aria-label={`${label}滑块（${unit}）`}
        aria-valuetext={`${formatNumber(value, 3)} ${unit}`}
        onChange={(event) => {
          const next = clamp(Number(event.target.value), min, max);
          setResetToken((token) => token + 1);
          onChange(next);
        }}
      />
      <div className="param-scale" aria-hidden="true">
        <span>{formatNumber(min, 2)}</span>
        <span>{formatNumber(max, 2)}</span>
      </div>
      {outOfRange ? (
        <p className="param-overflow-note" data-testid={testId ? `${testId}-overflow` : undefined}>
          当前值 {formatParameterApprox(value)} {unit} 超出滑块快捷范围 {formatNumber(min, 2)}–{formatNumber(max, 2)} {unit}
          ；实验仍使用该数值，未做钳制。
        </p>
      ) : null}
      {description ? (
        <p className="param-description" id={descriptionId}>
          {description}
        </p>
      ) : null}
    </div>
  );
}

export function MathTargetInput({
  label,
  value,
  unit,
  onCommit,
  description,
  decimals = 4,
  testId,
  domain: domainProp,
  validateValue,
  disabled,
}: MathTargetInputProps) {
  const id = useId();
  const domain = useMemo(
    () => domainProp ?? resolveParameterDomain(label, unit),
    [domainProp, label, unit],
  );
  const descriptionId = description ? `${id}-description` : undefined;
  return (
    <div className="param param-target" data-testid={testId}>
      <MathExpressionEditor
        id={`${id}-expression`}
        label={label}
        value={value}
        unit={unit}
        decimals={decimals}
        domain={domain}
        inputAriaLabel={`${label}数值（${unit}）`}
        onCommit={onCommit}
        validateValue={validateValue}
        testId={testId}
        disabled={disabled}
        descriptionId={descriptionId}
      />
      {description ? (
        <p className="param-description" id={descriptionId}>
          {description}
        </p>
      ) : null}
    </div>
  );
}
