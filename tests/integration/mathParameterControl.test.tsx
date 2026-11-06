import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  MathTargetInput,
  ParamSlider,
  formatParameterInputValue,
} from '../../src/components/ParamSlider';
import { PARAMETER_DOMAINS } from '../../src/math/parameterValidation';

function SliderHarness({
  initial = 0.5,
  min = 0,
  max = 2,
  step = 0.05,
  unit = 'T',
  domain,
  onCommit,
}: {
  initial?: number;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  domain?: typeof PARAMETER_DOMAINS.magneticField;
  onCommit?: (value: number) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <ParamSlider
      label="磁感应强度 |B|"
      value={value}
      min={min}
      max={max}
      step={step}
      unit={unit}
      domain={domain}
      onChange={(next) => {
        onCommit?.(next);
        setValue(next);
      }}
    />
  );
}

function expressionInput(): HTMLInputElement {
  return screen.getByLabelText('磁感应强度 |B|数值（T）') as HTMLInputElement;
}

describe('MathParameterControl: slider and expression share one value', () => {
  it('keeps the original expression after commit and previews the value', async () => {
    const committed = vi.fn();
    render(<SliderHarness onCommit={committed} />);
    const input = expressionInput();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '√3/2' } });
    expect(committed).not.toHaveBeenCalled();
    expect(screen.getByText(/预览 ≈ 0\.8660254 T/)).toBeInTheDocument();

    fireEvent.blur(input);
    expect(committed).toHaveBeenCalledTimes(1);
    expect(committed.mock.calls[0][0]).toBeCloseTo(Math.sqrt(3) / 2, 14);
    expect(expressionInput().value).toBe('√3/2');
    expect(screen.getByText(/已提交 √3\/2 ≈ 0\.8660254 T/)).toBeInTheDocument();
  });

  it('syncs a slider change back to the text input and clears the expression', () => {
    const committed = vi.fn();
    render(<SliderHarness initial={Math.sqrt(3) / 2} onCommit={committed} />);
    const input = expressionInput();
    fireEvent.change(input, { target: { value: '√3/2' } });
    fireEvent.blur(input);
    const range = screen.getByLabelText('磁感应强度 |B|滑块（T）') as HTMLInputElement;
    fireEvent.change(range, { target: { value: '0.5' } });
    expect(committed).toHaveBeenLastCalledWith(0.5);
    expect(expressionInput().value).toBe('0.50');
    expect(expressionInput().value).not.toContain('√');
  });

  it('does not clamp a valid value beyond the slider range', () => {
    const committed = vi.fn();
    render(<SliderHarness onCommit={committed} />);
    const input = expressionInput();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '5' } });
    fireEvent.blur(input);
    expect(committed).toHaveBeenCalledWith(5);
    expect(expressionInput().value).toBe('5');
    const root = screen.getByText('磁感应强度 |B|').closest('.param');
    expect(root).toHaveAttribute('data-out-of-range', 'true');
    expect(screen.getByText(/超出滑块快捷范围 0–2 T/)).toBeInTheDocument();
    const range = screen.getByLabelText('磁感应强度 |B|滑块（T）') as HTMLInputElement;
    expect(Number(range.value)).toBe(2);
  });

  it('accepts negative values beyond the slider range when the domain allows it', () => {
    const committed = vi.fn();
    render(<SliderHarness onCommit={committed} domain={PARAMETER_DOMAINS.magneticField} />);
    const input = expressionInput();
    fireEvent.change(input, { target: { value: '-10' } });
    fireEvent.blur(input);
    expect(committed).toHaveBeenCalledWith(-10);
    expect(expressionInput().value).toBe('-10');
  });
});

describe('MathParameterControl: editing states and errors', () => {
  it('treats incomplete input as an editing state and keeps the last valid value', () => {
    const committed = vi.fn();
    render(<SliderHarness onCommit={committed} />);
    const input = expressionInput();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '√(' } });
    expect(committed).not.toHaveBeenCalled();
    expect(screen.getByText(/当前实验仍为 0\.5 T/)).toBeInTheDocument();
    expect(input.value).toBe('√(');
  });

  it('rejects division by zero without hiding the error or changing the value', () => {
    const committed = vi.fn();
    render(<SliderHarness onCommit={committed} />);
    const input = expressionInput();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '1/0' } });
    fireEvent.blur(input);
    expect(committed).not.toHaveBeenCalled();
    expect(input.value).toBe('1/0');
    expect(screen.getByText(/除数不能为 0/)).toBeInTheDocument();
    expect(screen.getByText(/当前实验仍为 0\.5 T/)).toBeInTheDocument();
  });

  it('rejects negative square roots', () => {
    const committed = vi.fn();
    render(<SliderHarness onCommit={committed} />);
    const input = expressionInput();
    fireEvent.change(input, { target: { value: '√(-1)' } });
    fireEvent.blur(input);
    expect(committed).not.toHaveBeenCalled();
    expect(screen.getByText(/负数不能开平方/)).toBeInTheDocument();
  });

  it('reverts to the previous value on Escape', async () => {
    const committed = vi.fn();
    render(<SliderHarness onCommit={committed} />);
    const input = expressionInput();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '√3/2' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    await waitFor(() => expect(input.value).toBe('0.50'));
    expect(committed).not.toHaveBeenCalled();
  });

  it('commits on Enter and blurs the input', () => {
    const committed = vi.fn();
    render(<SliderHarness onCommit={committed} />);
    const input = expressionInput();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '2π' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(committed).toHaveBeenCalledWith(2 * Math.PI);
    expect(document.activeElement).not.toBe(input);
  });

  it('keeps the committed expression across a tab-switch style remount, but not across a slider change', () => {
    const value = Math.sqrt(3) / 2;
    const first = render(
      <ParamSlider label="磁感应强度 |B|" value={value} min={0} max={2} step={0.05} unit="T" onChange={() => {}} />,
    );
    const input = expressionInput();
    fireEvent.change(input, { target: { value: '√3/2' } });
    fireEvent.blur(input);
    first.unmount();

    const second = render(
      <ParamSlider label="磁感应强度 |B|" value={value} min={0} max={2} step={0.05} unit="T" onChange={() => {}} />,
    );
    expect(expressionInput().value).toBe('√3/2');
    const range = screen.getByLabelText('磁感应强度 |B|滑块（T）') as HTMLInputElement;
    fireEvent.change(range, { target: { value: '0.5' } });
    second.unmount();

    render(<ParamSlider label="磁感应强度 |B|" value={0.5} min={0} max={2} step={0.05} unit="T" onChange={() => {}} />);
    expect(expressionInput().value).toBe('0.50');
  });

  it('restores a numeric draft when an external value change arrives', () => {
    const { rerender } = render(
      <ParamSlider label="磁感应强度 |B|" value={Math.sqrt(3) / 2} min={0} max={2} step={0.05} unit="T" onChange={() => {}} />,
    );
    const input = expressionInput();
    fireEvent.change(input, { target: { value: '√3/2' } });
    fireEvent.blur(input);
    rerender(<ParamSlider label="磁感应强度 |B|" value={0.8} min={0} max={2} step={0.05} unit="T" onChange={() => {}} />);
    expect(expressionInput().value).toBe('0.80');
  });
});

describe('MathParameterControl: domains and integer parameters', () => {
  it('rejects a non-integer turn count instead of rounding 3/2 to 2', () => {
    const onCommit = vi.fn();
    function TurnsHarness() {
      const [value, setValue] = useState(10);
      return (
        <ParamSlider
          label="匝数 N"
          value={value}
          min={1}
          max={100}
          step={1}
          unit="匝"
          domain={PARAMETER_DOMAINS.turns}
          onChange={(next) => {
            onCommit(next);
            setValue(next);
          }}
        />
      );
    }
    render(<TurnsHarness />);
    const input = screen.getByLabelText('匝数 N数值（匝）') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '3/2' } });
    fireEvent.blur(input);
    expect(onCommit).not.toHaveBeenCalled();
    expect(input.value).toBe('3/2');
    expect(screen.getByText(/必须是整数/)).toBeInTheDocument();
    expect(screen.getByText(/不会被四舍五入/)).toBeInTheDocument();

    fireEvent.change(input, { target: { value: '8' } });
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledWith(8);
  });

  it('rejects non-positive mass with a physical-domain message', () => {
    const onCommit = vi.fn();
    render(
      <ParamSlider
        label="质量 m"
        value={1}
        min={0.1}
        max={5}
        step={0.01}
        unit="×10⁻²⁶ kg"
        domain={PARAMETER_DOMAINS.positiveMass}
        onChange={onCommit}
      />,
    );
    const input = screen.getByLabelText('质量 m数值（×10⁻²⁶ kg）') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '0' } });
    fireEvent.blur(input);
    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.getByText(/物理有效域/)).toBeInTheDocument();
  });
});

describe('MathParameterControl: tablet shortcuts', () => {
  it('inserts π and keeps focus on the expression input', async () => {
    render(<SliderHarness />);
    const input = expressionInput();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: '插入圆周率 π' }));
    await waitFor(() => expect(input.value).toBe('π'));
    expect(document.activeElement).toBe(input);
  });

  it('inserts a square-root template with the cursor inside', async () => {
    render(<SliderHarness />);
    const input = expressionInput();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: '插入根号' }));
    await waitFor(() => expect(input.value).toBe('√()'));
    await waitFor(() => expect(input.selectionStart).toBe(2));
  });
});

describe('MathParameterControl: continuous target input', () => {
  it('surfaces a handler rejection and does not pretend the target was accepted', () => {
    render(
      <MathTargetInput
        label="手动目标 B"
        value={0.4}
        unit="T"
        domain={PARAMETER_DOMAINS.i04Field}
        onCommit={() => '暂停中不会记录手动调磁。'}
      />,
    );
    const input = screen.getByLabelText('手动目标 B数值（T）') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '√2' } });
    fireEvent.blur(input);
    expect(screen.getByText(/暂停中不会记录手动调磁/)).toBeInTheDocument();
    expect(screen.getByText(/当前实验仍为 0\.4 T/)).toBeInTheDocument();
  });
});

describe('formatParameterInputValue', () => {
  it('keeps enough precision to show the real committed value', () => {
    expect(formatParameterInputValue(0.5, 2)).toBe('0.50');
    expect(formatParameterInputValue(Math.sqrt(3) / 2, 2)).toBe('0.866025403784');
    expect(formatParameterInputValue(1e-9, 2)).toBe('1e-9');
  });
});
