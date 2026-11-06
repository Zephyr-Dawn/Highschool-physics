import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { UniformBPage } from '../../src/simulations/particle/UniformBPage';
import { BeamlinePage } from '../../src/simulations/particle/BeamlinePage';
import { TimeVaryingPage } from '../../src/simulations/induction/TimeVaryingPage';
import { FluxLenzPage } from '../../src/simulations/induction/FluxLenzPage';

function renderRoute(element: React.ReactNode) {
  return render(<MemoryRouter>{element}</MemoryRouter>);
}

function openParams() {
  fireEvent.click(screen.getByRole('tab', { name: /参数/ }));
}

describe('page-level mathematical parameter input', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('P02 uses √3/2 T in the data panel and keeps the expression', () => {
    renderRoute(<UniformBPage />);
    openParams();
    const input = screen.getByLabelText('磁感应强度 |B|数值（T）') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '√3/2' } });
    fireEvent.blur(input);
    expect(input.value).toBe('√3/2');
    const root = input.closest('.param');
    expect(root).toHaveAttribute('data-out-of-range', 'false');
    fireEvent.click(screen.getByRole('tab', { name: /数据/ }));
    expect(screen.getByTestId('p02-radius').textContent).toContain('14.4 cm');
  });

  it('P02 keeps an out-of-slider B = 5 T and labels the overflow', () => {
    renderRoute(<UniformBPage />);
    openParams();
    const input = screen.getByLabelText('磁感应强度 |B|数值（T）') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '5' } });
    fireEvent.blur(input);
    expect(input.value).toBe('5');
    const root = input.closest('.param');
    expect(root).toHaveAttribute('data-out-of-range', 'true');
    expect(screen.getByText(/超出滑块快捷范围 0–1\.5 T/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: /数据/ }));
    expect(screen.getByTestId('p02-radius').textContent).toContain('2.5 cm');
  });

  it('I04 uses √2 T/s in the analytic EMF readout', () => {
    renderRoute(<TimeVaryingPage />);
    openParams();
    const input = screen.getByLabelText('变化率 k = dB/dt数值（T/s）') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '√2' } });
    fireEvent.blur(input);
    expect(input.value).toBe('√2');
    fireEvent.click(screen.getByRole('tab', { name: /数据/ }));
    expect(screen.getByTestId('i04-emf').textContent).toMatch(/-282|mV/);
  });

  it('I01 rejects N = 3/2 and accepts N = 8 without rounding', () => {
    renderRoute(<FluxLenzPage />);
    openParams();
    const input = screen.getByLabelText('匝数 N数值（turn）') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '3/2' } });
    fireEvent.blur(input);
    expect(screen.getByText(/必须是整数/)).toBeInTheDocument();
    expect(screen.getByText(/不会被四舍五入/)).toBeInTheDocument();
    expect(input.value).toBe('3/2');

    fireEvent.change(input, { target: { value: '8' } });
    fireEvent.blur(input);
    expect(input.value).toBe('8');
    fireEvent.click(screen.getByRole('tab', { name: /数据/ }));
    expect(screen.getByTestId('i01-psi').textContent).toContain('1.6');
  });

  it('P07 rejects an inverted screen window instead of silently moving the edge', () => {
    renderRoute(<BeamlinePage />);
    openParams();
    const input = screen.getByLabelText('屏幕 y 下限数值（m）') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '3' } });
    fireEvent.blur(input);
    expect(screen.getByText(/屏幕 y 下限必须小于上限/)).toBeInTheDocument();
    expect(input.value).toBe('3');
    expect(screen.getByTestId('p07-stage')).toBeInTheDocument();
  });
});
