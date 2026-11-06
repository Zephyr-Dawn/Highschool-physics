import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { AcGeneratorPage } from '../../src/simulations/induction/AcGeneratorPage';
import { LearningPathPage } from '../../src/pages/LearningPathPage';
import { LearningPathDetailPage } from '../../src/pages/LearningPathDetailPage';
import { PracticePage } from '../../src/pages/PracticePage';
import { clearAllProgress } from '../../src/features/progress/progressStore';

function renderAt(path: string, element: React.ReactNode) {
  return render(<MemoryRouter initialEntries={[path]}>{element}</MemoryRouter>);
}

describe('I08 page and learning paths', () => {
  beforeEach(() => {
    clearAllProgress();
    window.localStorage.clear();
  });

  it('renders I08 with the analytic snapshot, modes, charts and energy ledger', () => {
    renderAt('/induction/ac-generator?preset=i08-standard', <AcGeneratorPage />);
    expect(screen.getByRole('heading', { level: 1, name: '交流发电机与交变电流' })).toBeInTheDocument();
    expect(screen.getByTestId('i08-stage-svg')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: /数据与图像/ }));
    expect(screen.getByTestId('i08-theta').textContent).toContain('0');
    expect(screen.getByTestId('i08-flux').textContent).toContain('10 mWb');
    expect(screen.getByTestId('i08-emf').textContent).toContain('0 V');
    expect(screen.getByTestId('i08-frequency').textContent).toContain('1 Hz');
    expect(screen.getByTestId('i08-energy-residual').textContent).toContain('J');
    expect(screen.getByTestId('i08-charts')).toBeInTheDocument();
    expect(screen.getByTestId('i08-event-list')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: /参数/ }));
    expect(screen.getByTestId('i08-mode-auto')).toBeInTheDocument();
    expect(screen.getByTestId('i08-mode-manual')).toBeInTheDocument();
    expect(screen.getByTestId('i08-total-resistance').textContent).toContain('5');
  });

  it('shows open-circuit status without a fake current', () => {
    renderAt('/induction/ac-generator?preset=i08-open', <AcGeneratorPage />);
    fireEvent.click(screen.getByRole('tab', { name: /数据与图像/ }));
    expect(screen.getByTestId('i08-status').textContent).toContain('open-circuit');
    expect(screen.getByTestId('i08-current').textContent).toContain('0 A');
    expect(screen.getByTestId('i08-current-rms').textContent).toContain('—');
  });

  it('renders the 16-model learning path with real practice and experiment links', () => {
    renderAt('/path', <LearningPathPage />);
    expect(screen.getByTestId('learning-path-page')).toBeInTheDocument();
    expect(screen.getAllByTestId(/^path-step-/)).toHaveLength(16);
    expect(screen.getByText('16')).toBeInTheDocument();
    expect(screen.getByTestId('path-open-i08').getAttribute('href')).toContain('/induction/ac-generator?preset=i08-standard');
    expect(screen.getByTestId('path-practice-i08').getAttribute('href')).toContain('/practice?model=i08');
    expect(screen.getByTestId('path-lesson-i08').getAttribute('href')).toContain('/path/induction/i08');
    expect(screen.getAllByTestId(/^demo-/)).toHaveLength(3);
  });

  it('opens a real lesson step from the path detail and keeps next/prev links', () => {
    render(
      <MemoryRouter initialEntries={['/path/induction/i08']}>
        <Routes>
          <Route path="/path/:pathId/:modelId" element={<LearningPathDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByTestId('path-detail-page')).toBeInTheDocument();
    expect(screen.getByTestId('path-detail-title').textContent).toContain('交流发电机');
    expect(screen.getByText('先约定角度：法线与 B 的夹角')).toBeInTheDocument();
    expect(screen.getByTestId('path-open-experiment').getAttribute('href')).toContain('/induction/ac-generator?preset=i08-standard');
    expect(screen.getByTestId('path-prev').getAttribute('href')).toContain('/path/induction/i07');
    expect(screen.queryByTestId('path-next')).toBeNull();
  });

  it('filters the practice page to exactly the requested model', () => {
    renderAt('/practice?model=i08', <PracticePage />);
    expect(screen.getByTestId('practice-model-filter')).toHaveValue('i08');
    expect(document.querySelectorAll('.question-card')).toHaveLength(8);
    expect(screen.getByText('θ=0 时的磁通与电动势')).toBeInTheDocument();
  });
});
