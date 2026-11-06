import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { OppositeFieldsLoopPage } from '../../src/simulations/induction/OppositeFieldsLoopPage';
import { ConstraintLabPage } from '../../src/simulations/particle/ConstraintLabPage';

function renderAt(path: string, element: React.ReactNode) {
  return render(
    <MemoryRouter initialEntries={[path]}>{element}</MemoryRouter>,
  );
}

describe('I07/P08 page integration', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('renders I07 with four modes, stage, event list and charts', () => {
    renderAt('/induction/opposite-fields-wall', <OppositeFieldsLoopPage />);
    expect(screen.getByRole('heading', { level: 1, name: /相反磁场双区域/ })).toBeInTheDocument();
    expect(screen.getByTestId('i07-stage-svg')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: /参数/ }));
    for (const mode of ['prescribed', 'free', 'forces', 'manual-x']) {
      expect(screen.getByTestId(`i07-mode-${mode}`)).toBeInTheDocument();
    }
    fireEvent.click(screen.getByRole('tab', { name: /数据与图像/ }));
    expect(screen.getByTestId('i07-flux')).toBeInTheDocument();
    expect(screen.getByTestId('i07-s').textContent).toContain('1');
    expect(screen.getByTestId('i07-emf').textContent).toContain('V');
    expect(screen.getByTestId('i07-event-list')).toBeInTheDocument();
    expect(screen.getByTestId('i07-charts')).toBeInTheDocument();
    expect(screen.getByTestId('i07-residual').textContent).toContain('J');
  });

  it('loads an I07 wall preset and exposes a real bounce event', () => {
    renderAt('/induction/opposite-fields-wall?preset=i07-free-wall', <OppositeFieldsLoopPage />);
    fireEvent.click(screen.getByRole('tab', { name: /数据与图像/ }));
    const eventList = screen.getByTestId('i07-event-list');
    expect(eventList.textContent).toContain('挡板反弹');
    expect(screen.getByTestId('i07-impact').textContent).toBeTruthy();
  });

  it('renders P08 with the target line, outcome table and all crossings', () => {
    renderAt('/particle/constraint-lab?preset=p08-two-crossings', <ConstraintLabPage />);
    expect(screen.getByRole('heading', { level: 1, name: /复合电磁场约束/ })).toBeInTheDocument();
    expect(screen.getByTestId('p08-stage-svg')).toBeInTheDocument();
    expect(screen.getByTestId('p08-target-line')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: /数据与反求/ }));
    expect(screen.getByTestId('p08-outcome-table')).toBeInTheDocument();
    const eventList = screen.getByTestId('p08-event-list');
    expect(eventList.textContent).toContain('正向穿越');
    expect(eventList.textContent).toContain('反向穿越');
    expect(screen.getByTestId('p08-status').textContent).toContain('满足约束');
    expect(screen.getByTestId('p08-residual-chart')).toBeInTheDocument();
  });

  it('runs the P08 inverse solver for Ey and revalidates the candidate', () => {
    renderAt('/particle/constraint-lab?preset=p08-inverse-ey', <ConstraintLabPage />);
    fireEvent.click(screen.getByRole('tab', { name: /数据与反求/ }));
    fireEvent.click(screen.getByTestId('p08-run-inverse'));
    const status = screen.getByTestId('p08-inverse-status');
    expect(status.textContent).toContain('确认候选');
    const list = screen.getByTestId('p08-candidate-list');
    expect(list.textContent).toContain('1.5');
    expect(list.textContent).toContain('正向复核通过');
  });
});
