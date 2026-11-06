import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { CaseListPage } from '../../src/pages/CaseListPage';
import { CaseDetailPage } from '../../src/pages/CaseDetailPage';
import { DeviceCheckPage } from '../../src/pages/DeviceCheckPage';

function renderAt(path: string, element: React.ReactNode) {
  return render(<MemoryRouter initialEntries={[path]}>{element}</MemoryRouter>);
}

describe('Round 15 case and device pages', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('lists eight original cases and five metadata-only exam references', () => {
    renderAt('/cases', <CaseListPage />);
    expect(screen.getByTestId('cases-page')).toBeInTheDocument();
    expect(screen.getAllByTestId(/^case-card-/)).toHaveLength(9);
    expect(screen.getAllByTestId(/^case-source-/)).toHaveLength(5);
    expect(screen.getAllByText('未在线复核').length).toBe(5);
    expect(screen.queryByText('已在线复核')).toBeNull();
    expect(screen.queryByText(/高考原题答案/)).toBeNull();
  });

  it('hides the derivation until revealed and keeps the checkpoint interactive', async () => {
    render(
      <MemoryRouter initialEntries={['/cases/case-c01-boundary-exit']}>
        <Routes>
          <Route path="/cases/:caseId" element={<CaseDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByTestId('case-detail')).toBeInTheDocument();
    expect(screen.queryByTestId('case-expected')).toBeNull();
    fireEvent.click(screen.getByTestId('case-reveal-solution'));
    await waitFor(() => expect(screen.getByTestId('case-expected')).toBeInTheDocument());
    expect(screen.getByTestId('case-expected').textContent).toContain('exitTimeS');
    expect(screen.getByTestId('case-expected').textContent).toContain('0.5235987755982988');
    fireEvent.click(screen.getByRole('radio', { name: /恰好与右边界相切/ }));
    fireEvent.click(screen.getByTestId('case-check-checkpoint'));
    await waitFor(() => expect(screen.getByText(/正确/)).toBeInTheDocument());
  });

  it('switches stages and exposes the multi-stage C03 sequence', () => {
    render(
      <MemoryRouter initialEntries={['/cases/case-c03-beamline-detector?stage=c03-screen-window']}>
        <Routes>
          <Route path="/cases/:caseId" element={<CaseDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByTestId('case-stage-c03-standard')).toBeInTheDocument();
    expect(screen.getByTestId('case-stage-c03-screen-window')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('case-stem').textContent).toContain('多级束线');
    fireEvent.click(screen.getByTestId('case-stage-c03-standard'));
    expect(screen.getByTestId('case-stage-c03-standard')).toHaveAttribute('aria-pressed', 'true');
  });

  it('starts all hardware checks as NOT_TESTED and provides a local export button', () => {
    renderAt('/device-check', <DeviceCheckPage />);
    expect(screen.getByTestId('device-check-page')).toBeInTheDocument();
    expect(screen.getByTestId('device-export')).toBeInTheDocument();
    expect(screen.getByTestId('device-info').textContent).toContain('安全上下文');
    const select = screen.getByLabelText(/触控手柄命中.*状态/);
    expect((select as HTMLSelectElement).value).toBe('NOT_TESTED');
    expect(screen.getByTestId('device-probe-result').textContent).toContain('尚未采样');
  });
});
