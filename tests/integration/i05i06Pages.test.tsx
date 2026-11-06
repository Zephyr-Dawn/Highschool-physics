import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { CoupledLoopPage } from '../../src/simulations/induction/CoupledLoopPage';
import { DualRodsPage } from '../../src/simulations/induction/DualRodsPage';

function renderRoute(element: React.ReactNode) {
  return render(<MemoryRouter>{element}</MemoryRouter>);
}

describe('I05/I06 page integration', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('renders I05 with four modes, a real stage, charts and energy residual', () => {
    renderRoute(<CoupledLoopPage />);
    expect(screen.getByRole('heading', { level: 1, name: '时变磁场中的运动线框' })).toBeInTheDocument();
    expect(screen.getByTestId('i05-stage-svg')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: /参数/ }));
    for (const mode of ['prescribed', 'dynamic', 'manual-b', 'manual-x']) {
      expect(screen.getByTestId(`i05-mode-${mode}`)).toBeInTheDocument();
    }
    fireEvent.click(screen.getByRole('tab', { name: /数据与图像/ }));
    expect(screen.getByTestId('i05-emf-t')).toBeInTheDocument();
    expect(screen.getByTestId('i05-emf-m')).toBeInTheDocument();
    expect(screen.getByTestId('i05-emf-total')).toBeInTheDocument();
    expect(screen.getByTestId('i05-current')).toBeInTheDocument();
    expect(screen.getByTestId('i05-energy-residual')).toBeInTheDocument();
    expect(screen.getByTestId('i05-charts')).toBeInTheDocument();
    expect(screen.getByTestId('i05-event-list')).toBeInTheDocument();
  });

  it('renders I06 with two rods, four modes, paired forces and independent energy residual', () => {
    renderRoute(<DualRodsPage />);
    expect(screen.getByRole('heading', { level: 1, name: '双导体棒在平行导轨上的电磁耦合' })).toBeInTheDocument();
    expect(screen.getByTestId('i06-stage-svg')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: /参数/ }));
    for (const mode of ['free', 'forces', 'manual-rod1', 'manual-rod2']) {
      expect(screen.getByTestId(`i06-mode-${mode}`)).toBeInTheDocument();
    }
    fireEvent.click(screen.getByRole('tab', { name: /数据与图像/ }));
    expect(screen.getByTestId('i06-current')).toBeInTheDocument();
    expect(screen.getByTestId('i06-force1')).toBeInTheDocument();
    expect(screen.getByTestId('i06-force2')).toBeInTheDocument();
    expect(screen.getByTestId('i06-momentum')).toBeInTheDocument();
    expect(screen.getByTestId('i06-energy-residual')).toBeInTheDocument();
    expect(screen.getByTestId('i06-charts')).toBeInTheDocument();
  });

  it('I05 accepts a valid out-of-slider expression in the waveform parameter', () => {
    renderRoute(<CoupledLoopPage />);
    fireEvent.click(screen.getByRole('tab', { name: /参数/ }));
    const input = screen.getByLabelText('偏置 B₀数值（T）') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '√2' } });
    fireEvent.blur(input);
    expect(input.value).toBe('√2');
  });

  it('I06 rejects x2 <= x1 in the numeric control without changing the scene', () => {
    renderRoute(<DualRodsPage />);
    fireEvent.click(screen.getByRole('tab', { name: /参数/ }));
    const x1 = screen.getByLabelText('杆 1 初始位置 x₁数值（m）') as HTMLInputElement;
    fireEvent.change(x1, { target: { value: '9' } });
    fireEvent.blur(x1);
    expect(screen.getByText(/必须保持 x₂ > x₁/)).toBeInTheDocument();
    expect(x1.value).toBe('9');
  });
});
