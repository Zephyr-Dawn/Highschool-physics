import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { TeacherProblemListPage } from '../../src/pages/TeacherProblemListPage';
import { TeacherProblemEditorPage } from '../../src/pages/TeacherProblemEditorPage';
import { TeacherProblemPreviewPage } from '../../src/pages/TeacherProblemPreviewPage';
import { compileTeacherProblem } from '../../src/features/problem-authoring/problemCompiler';
import { createA17InductionTemplate, createA17TeacherTemplate } from '../../src/features/problem-authoring/round17Templates';
import { loadTeacherDrafts, upsertTeacherDraft } from '../../src/features/problem-authoring/teacherProblemStore';

function renderAt(path: string, routePattern: string, element: React.ReactNode) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={routePattern} element={element} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Round 17 teacher authoring pages', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('creates a template from the private problem list and shows engine status', () => {
    const template = createA17TeacherTemplate();
    expect(upsertTeacherDraft(template).ok).toBe(true);
    renderAt('/teacher/problems', '/teacher/problems', <TeacherProblemListPage />);
    expect(screen.getByTestId('teacher-problem-list')).toBeInTheDocument();
    expect(screen.getByTestId('teacher-draft-count').textContent).toContain('1');
    expect(screen.getByTestId(`teacher-draft-${template.id}`)).toBeInTheDocument();
    expect(screen.getByTestId(`teacher-status-${template.id}`).textContent).toContain('仿真已验证');
    expect(screen.getByTestId(`teacher-preview-${template.id}`)).toBeInTheDocument();
    expect(screen.getByTestId('teacher-create-blank')).toBeInTheDocument();
    expect(screen.getByTestId('teacher-import-button')).toBeInTheDocument();
  });

  it('loads a draft into the editor and saves content changes locally', () => {
    const template = createA17TeacherTemplate();
    expect(upsertTeacherDraft(template).ok).toBe(true);
    renderAt(`/teacher/problems/${template.id}/edit`, '/teacher/problems/:draftId/edit', <TeacherProblemEditorPage />);
    expect(screen.getByTestId('teacher-editor')).toBeInTheDocument();
    expect(screen.getByTestId('teacher-editor-status').textContent).toContain('仿真已验证');
    expect(screen.getByTestId('teacher-check-stage-continuity').textContent).toContain('2 个交接点');
    fireEvent.change(screen.getByTestId('teacher-title'), { target: { value: '教师改写后的 A17 题' } });
    expect(screen.getByTestId('teacher-unsaved')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('teacher-save'));
    expect(screen.queryByTestId('teacher-unsaved')).toBeNull();
    expect(loadTeacherDrafts().state.drafts[0].title).toBe('教师改写后的 A17 题');
  });

  it('renders the compiled teacher item in the same student whole-problem view', async () => {
    const template = createA17InductionTemplate();
    expect(upsertTeacherDraft(template).ok).toBe(true);
    renderAt(`/teacher/problems/${template.id}/preview`, '/teacher/problems/:draftId/preview', <TeacherProblemPreviewPage />);
    expect(screen.getByTestId('teacher-preview')).toBeInTheDocument();
    expect(screen.getByTestId('teacher-preview-disclaimer').textContent).toContain('不是官方真题');
    expect(screen.getByTestId('teacher-preview-status').textContent).toContain('仿真已验证');
    expect(screen.getByTestId('whole-problem-lab')).toBeInTheDocument();
    expect(screen.getByTestId('wpl-event-wall-bounce')).toBeInTheDocument();
    expect(screen.getByTestId('wpl-stage-fields')).toBeInTheDocument();
    expect(screen.getByTestId('wpl-stage-return')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('wpl-part-body').textContent).toContain('求初始时刻线框的感应电动势'));
  });

  it('accepts safe math expressions for teacher-owned parameter values', () => {
    const template = createA17TeacherTemplate();
    expect(upsertTeacherDraft(template).ok).toBe(true);
    renderAt(`/teacher/problems/${template.id}/edit`, '/teacher/problems/:draftId/edit', <TeacherProblemEditorPage />);
    const valueInput = screen.getByLabelText('加速电场 Eₓ 标准值数值（V/m）');
    fireEvent.change(valueInput, { target: { value: '√2' } });
    fireEvent.blur(valueInput);
    expect((valueInput as HTMLInputElement).value).toBe('√2');
    expect(screen.getByTestId('teacher-editor-status').textContent).toBe('仿真已验证');
    fireEvent.click(screen.getByTestId('teacher-save'));
    expect(loadTeacherDrafts().state.drafts[0].scenario.variations[0].baseValue).toBeCloseTo(Math.SQRT2, 10);
  });

  it('updates the current reference answer after a teacher-authored parameter change', async () => {
    const template = createA17TeacherTemplate();
    const compile = compileTeacherProblem(template);
    expect(compile.item).not.toBeNull();
    expect(upsertTeacherDraft(template).ok).toBe(true);
    renderAt(`/teacher/problems/${template.id}/preview`, '/teacher/problems/:draftId/preview', <TeacherProblemPreviewPage />);
    fireEvent.click(screen.getByTestId('wpl-teacher-toggle'));
    fireEvent.click(screen.getByTestId('wpl-part-c'));
    const before = screen.getByTestId('wpl-answer-standard').textContent;
    expect(before).toContain('0.809401');
    const field = screen.getByLabelText('加速电场 Eₓ数值（V/m）') as HTMLInputElement;
    fireEvent.change(field, { target: { value: '2' } });
    fireEvent.blur(field);
    await waitFor(() => {
      const after = screen.getByTestId('wpl-answer-standard').textContent;
      expect(after).not.toBe(before);
      expect(after).toContain('已按当前变式重算');
    });
    expect(screen.getByTestId('wpl-variant-warning')).toBeInTheDocument();
  });

  it('renders authored HTML-like text as inert text rather than executing it', () => {
    const template = createA17TeacherTemplate();
    template.title = '<img src=x onerror="window.__teacherXss=1">';
    template.stem = '<script>window.__teacherXss=2</script> 一段文字，仍需保留为纯文本。';
    expect(upsertTeacherDraft(template).ok).toBe(true);
    renderAt(`/teacher/problems/${template.id}/preview`, '/teacher/problems/:draftId/preview', <TeacherProblemPreviewPage />);
    expect(screen.getByTestId('teacher-preview')).toBeInTheDocument();
    expect(document.querySelector('img[src="x"]')).toBeNull();
    expect(document.querySelector('script')).toBeNull();
    expect((window as unknown as { __teacherXss?: number }).__teacherXss).toBeUndefined();
  });

  it('shows a blocked preview instead of a fabricated stage for unsafe authored formulas', () => {
    const template = createA17TeacherTemplate();
    template.parts[0].derivationSteps[0].formula = '\\href{javascript:alert(1)}{x}';
    expect(upsertTeacherDraft(template).ok).toBe(true);
    renderAt(`/teacher/problems/${template.id}/preview`, '/teacher/problems/:draftId/preview', <TeacherProblemPreviewPage />);
    expect(screen.getByTestId('teacher-preview-blocked')).toBeInTheDocument();
    expect(screen.queryByTestId('whole-problem-lab')).toBeNull();
  });
});
