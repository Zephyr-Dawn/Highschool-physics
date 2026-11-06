import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { UniformBPage } from '../../src/simulations/particle/UniformBPage';
import { LoopEntryPage } from '../../src/simulations/induction/LoopEntryPage';
import { HalfPlanePage } from '../../src/simulations/particle/HalfPlanePage';
import { TimeVaryingPage } from '../../src/simulations/induction/TimeVaryingPage';
import { MovingRodPage } from '../../src/simulations/induction/MovingRodPage';
import { LorentzForcePage } from '../../src/simulations/particle/LorentzForcePage';
import { FluxLenzPage } from '../../src/simulations/induction/FluxLenzPage';
import { P06Page } from '../../src/simulations/particle/P06Page';
import { PracticePage } from '../../src/pages/PracticePage';
import { clearAllProgress } from '../../src/features/progress/progressStore';

function renderRoute(element: React.ReactNode) {
  return render(<MemoryRouter>{element}</MemoryRouter>);
}

describe('page smoke and tablet panel integration', () => {
  beforeEach(() => {
    clearAllProgress();
    window.localStorage.clear();
  });

  it('renders P02 with a stage, playback controls, lesson and data readouts', () => {
    renderRoute(<UniformBPage />);
    expect(screen.getByRole('heading', { level: 1, name: '匀强磁场内的多粒子圆周运动' })).toBeInTheDocument();
    expect(screen.getByTestId('p02-stage-svg')).toBeInTheDocument();
    expect(screen.getByTestId('play-toggle')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /讲解/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: /数据/ }));
    expect(screen.getByTestId('p02-radius').textContent).toContain('cm');
    expect(screen.getByTestId('p02-period').textContent).toMatch(/ns|µs/);
    expect(screen.getByTestId('p02-direction').textContent).toContain('顺时针');
    expect(screen.getByTestId('p02-speed').textContent).toContain('m/s');
  });

  it('renders I03 initial boundary state and exposes the same state in the data panel', () => {
    renderRoute(<LoopEntryPage />);
    expect(screen.getByRole('heading', { level: 1, name: '矩形线框进入 / 离开磁场' })).toBeInTheDocument();
    expect(screen.getByTestId('i03-stage-svg')).toBeInTheDocument();
    expect(screen.getByTestId('i03-phase-value').textContent).toBe('before');
    fireEvent.click(screen.getByRole('tab', { name: /数据/ }));
    expect(screen.getByTestId('i03-phase').textContent).toContain('未进入磁场');
    expect(screen.getByTestId('i03-flux').textContent).toContain('0 Wb');
    expect(screen.getByTestId('i03-current').textContent).toContain('0 A');
    expect(screen.getAllByText('磁通量 Φ').length).toBeGreaterThan(0);
  });

  it('renders P03 with its analytic status and data readouts', () => {
    renderRoute(<HalfPlanePage />);
    expect(screen.getByRole('heading', { level: 1, name: '直线边界半平面有界磁场的多粒子运动' })).toBeInTheDocument();
    expect(screen.getByTestId('p03-stage-svg')).toBeInTheDocument();
    expect(screen.getByTestId('p03-stage')).toHaveAttribute('data-status', 'entered-and-exited');
    expect(screen.getByTestId('p03-entry-marker')).toBeInTheDocument();
    expect(screen.getByTestId('p03-exit-marker')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: /数据/ }));
    expect(screen.getByTestId('p03-status').textContent).toContain('已进入并出场');
    expect(screen.getByTestId('p03-field-time').textContent).toMatch(/ns|µs/);
    expect(screen.getByTestId('p03-exit-point').textContent).toContain('cm');
  });

  it('renders I04 with analytic induction data and the shared chart stack', () => {
    renderRoute(<TimeVaryingPage />);
    expect(screen.getByRole('heading', { level: 1, name: '时变磁场中的静止线圈' })).toBeInTheDocument();
    expect(screen.getByTestId('i04-stage-svg')).toBeInTheDocument();
    expect(screen.getByTestId('i04-b-value').textContent).toBe('0.2');
    expect(Number(screen.getByTestId('i04-emf-value').textContent)).toBeCloseTo(-0.1, 9);
    fireEvent.click(screen.getByRole('tab', { name: /数据/ }));
    expect(screen.getByTestId('i04-flux').textContent).toContain('mWb');
    expect(screen.getByTestId('i04-flux-linkage').textContent).toContain('Wb·turn');
    expect(screen.getByTestId('i04-emf').textContent).toContain('mV');
    expect(screen.getByTestId('i04-current').textContent).toContain('mA');
    expect(screen.getByTestId('i04-direction').textContent).toContain('顺时针');
    expect(screen.getByTestId('i04-chart-panel')).toBeInTheDocument();
    expect(screen.getByTestId('i04-chart-panel-emf')).toBeInTheDocument();
  });


  it('renders P06 both modes and exposes the shared field/data state', () => {
    renderRoute(<P06Page />);
    expect(screen.getByRole('heading', { level: 1, name: '同区电磁叠加场' })).toBeInTheDocument();
    expect(screen.getByTestId('p06-stage-svg')).toBeInTheDocument();
    expect(screen.getByTestId('p06-stage')).toHaveAttribute('data-mode', 'crossed');
    expect(screen.getByTestId('p06-particle-A')).toHaveAttribute('data-selector-matched', 'true');
    fireEvent.click(screen.getByRole('tab', { name: /数据/ }));
    expect(screen.getByTestId('p06-region').textContent).toContain('同区');
    expect(screen.getByTestId('p06-speed').textContent).toContain('m/s');
    expect(screen.getByTestId('p06-force-e').textContent).toContain('N');
    expect(screen.getByTestId('p06-force-b').textContent).toContain('N');
  });

  it('renders I02 moving rod with signed state and shared charts', () => {
    renderRoute(<MovingRodPage />);
    expect(screen.getByRole('heading', { level: 1, name: '单导体棒切割磁感线' })).toBeInTheDocument();
    expect(screen.getByTestId('i02-stage-svg')).toBeInTheDocument();
    const stage = screen.getByTestId('i02-stage');
    expect(stage).toHaveAttribute('data-mode', 'constant-speed');
    expect(Number(stage.getAttribute('data-emf'))).toBeCloseTo(-1.5, 9);
    expect(Number(stage.getAttribute('data-current'))).toBeCloseTo(-0.75, 9);
    expect(Number(stage.getAttribute('data-force'))).toBeCloseTo(-0.75, 9);
    fireEvent.click(screen.getByRole('tab', { name: /数据/ }));
    expect(screen.getByTestId('i02-emf').textContent).toContain('V');
    expect(screen.getByTestId('i02-current').textContent).toContain('A');
    expect(screen.getByTestId('i02-chart-stack')).toBeInTheDocument();
    expect(screen.getByTestId('i02-chart-emf')).toBeInTheDocument();
  });

  it('renders I02 safely with malformed persisted parameters', () => {
    window.localStorage.setItem(
      'emplab.i02.params.v1',
      JSON.stringify({
        mode: 'manual-drag',
        BzSign: -1,
        BzMagnitudeT: null,
        lengthM: -3,
        resistanceOhm: 0,
        massKg: 0,
        startXM: -99,
        initialSpeedMps: Infinity,
        externalForceN: null,
        circuitClosed: false,
      }),
    );
    renderRoute(<MovingRodPage />);
    const stage = screen.getByTestId('i02-stage');
    expect(stage).toHaveAttribute('data-mode', 'manual-drag');
    expect(Number(stage.getAttribute('data-x'))).toBeGreaterThanOrEqual(0.05);
    expect(Number.isFinite(Number(stage.getAttribute('data-emf')))).toBe(true);
    expect(Number.isFinite(Number(stage.getAttribute('data-heat')))).toBe(true);
    expect(stage).toHaveAttribute('data-circuit-closed', 'false');
  });

  it('renders P01 3D force fallback and switches to planar multi-particle mode', async () => {
    renderRoute(<LorentzForcePage />);
    expect(
      await screen.findByRole('heading', { level: 1, name: '真实 WebGL 三维洛伦兹力' }),
    ).toBeInTheDocument();
    const stage = await screen.findByTestId('p01-force-stage');
    expect(stage).toHaveAttribute('data-mode', 'force3d');
    expect(stage).toHaveAttribute('data-particle-count', '1');
    expect(Number(stage.getAttribute('data-fy'))).toBeCloseTo(-8, 6);
    expect(screen.getByTestId('p01-3d-fallback')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: /数据/ }));
    expect(screen.getByTestId('p01-force-vector').textContent).toContain('N');
    fireEvent.click(screen.getByRole('button', { name: /^2D 运动$/ }));
    expect(await screen.findByTestId('p01-planar-page')).toBeInTheDocument();
    expect(await screen.findByTestId('p02-stage')).toHaveAttribute('data-particle-count', '3');
  });

  it('renders I01 signed flux/Lenz state and history controls', () => {
    renderRoute(<FluxLenzPage />);
    expect(screen.getByRole('heading', { level: 1, name: '磁通量与楞次定律' })).toBeInTheDocument();
    const stage = screen.getByTestId('i01-stage');
    expect(stage).toHaveAttribute('data-mode', 'field');
    expect(Number(stage.getAttribute('data-bz'))).toBeCloseTo(0.5, 9);
    expect(Number(stage.getAttribute('data-flux'))).toBeCloseTo(0.2, 9);
    fireEvent.click(screen.getByRole('tab', { name: /数据/ }));
    expect(screen.getByTestId('i01-flux').textContent).toContain('Wb');
    expect(screen.getByTestId('i01-psi').textContent).toContain('Wb·turn');
    expect(screen.getByTestId('i01-chart-stack')).toBeInTheDocument();
  });

  it('renders the practice page with filters and all 132 original questions', () => {
    renderRoute(<PracticePage />);
    expect(screen.getByRole('heading', { level: 1, name: /用原创题检验理解/ })).toBeInTheDocument();
    expect(screen.getAllByText(/原创/).length).toBeGreaterThan(10);
    const cards = document.querySelectorAll('.question-card');
    expect(cards.length).toBe(132);

    fireEvent.click(screen.getByRole('button', { name: '粒子运动' }));
    expect(document.querySelectorAll('.question-card').length).toBe(70);
    fireEvent.click(screen.getByRole('button', { name: '电磁感应' }));
    expect(document.querySelectorAll('.question-card').length).toBe(62);
    fireEvent.click(screen.getByRole('button', { name: '清除筛选' }));
    expect(document.querySelectorAll('.question-card').length).toBe(132);

    fireEvent.click(screen.getByRole('tab', { name: /真题索引/ }));
    expect(screen.getByText(/真题尚未在线复核/)).toBeInTheDocument();
    expect(document.querySelectorAll('.exam-card').length).toBe(5);
  }, 15000);
});
