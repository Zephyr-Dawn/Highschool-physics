import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { QuestionCard } from '../../src/features/practice/QuestionCard';
import { questionById } from '../../src/content/questions';
import { clearAllProgress, getQuestionRecord } from '../../src/features/progress/progressStore';

function renderQuestion(id: string) {
  const question = questionById(id);
  if (!question) throw new Error(`missing ${id}`);
  return render(
    <MemoryRouter>
      <QuestionCard question={question} />
    </MemoryRouter>,
  );
}

describe('original question interaction', () => {
  beforeEach(() => {
    clearAllProgress();
    window.localStorage.clear();
  });

  it('grades a correct single-choice answer and reveals the solution', () => {
    renderQuestion('p02-01');
    fireEvent.click(screen.getByRole('radio', { name: /竖直向下/ }));
    fireEvent.click(screen.getByTestId('check-p02-01'));
    expect(screen.getAllByText('回答正确').length).toBeGreaterThan(0);
    expect(screen.getByText('答案与解析')).toBeInTheDocument();
    expect(getQuestionRecord('p02-01').lastCorrect).toBe(true);
    expect(window.localStorage.getItem('emplab.progress.v1')).toContain('p02-01');
  });

  it('shows layered hints after a wrong answer, then accepts the correct option', () => {
    renderQuestion('p02-01');
    fireEvent.click(screen.getByRole('radio', { name: /竖直向上/ }));
    fireEvent.click(screen.getByTestId('check-p02-01'));
    expect(screen.getAllByText('还不正确').length).toBeGreaterThan(0);
    expect(screen.getByText('分层提示')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: /竖直向下/ }));
    fireEvent.click(screen.getByTestId('check-p02-01'));
    expect(getQuestionRecord('p02-01').lastCorrect).toBe(true);
  });

  it('supports numeric answers with units and tolerance', () => {
    renderQuestion('p02-03');
    fireEvent.change(screen.getByLabelText('数值答案'), { target: { value: '4' } });
    fireEvent.click(screen.getByTestId('check-p02-03'));
    expect(screen.getAllByText('回答正确').length).toBeGreaterThan(0);
    expect(getQuestionRecord('p02-03').lastCorrect).toBe(true);
  });

  it('supports multi-select answers and requires all correct choices', () => {
    renderQuestion('i03-03');
    const options = screen.getAllByRole('button', { name: /^[A-D]/ });
    fireEvent.click(options[0]);
    fireEvent.click(options[1]);
    fireEvent.click(options[2]);
    fireEvent.click(screen.getByTestId('check-i03-03'));
    expect(getQuestionRecord('i03-03').lastCorrect).toBe(true);
  });

  it('persists a selected draft through a remount', () => {
    const first = renderQuestion('p02-01');
    fireEvent.click(screen.getByRole('radio', { name: /竖直向下/ }));
    first.unmount();
    renderQuestion('p02-01');
    expect(getQuestionRecord('p02-01').lastAnswer).toEqual({ kind: 'single', value: 1 });
    const selected = screen.getByRole('radio', { name: /竖直向下/ });
    expect(selected).toHaveAttribute('aria-checked', 'true');
  });
});
