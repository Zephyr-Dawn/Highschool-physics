import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { LessonRunner } from '../../src/features/lesson/LessonRunner';
import { P02_LESSON } from '../../src/content/lessons';
import { P02_PRESETS } from '../../src/simulations/particle/params';

function renderLesson(onApplyPreset: (id: string) => void = () => {}) {
  return render(
    <LessonRunner
      steps={P02_LESSON}
      storageKey="test.p02.lesson.v1"
      onApplyPreset={onApplyPreset}
    />,
  );
}

describe('guided lesson flow', () => {
  beforeEach(() => window.localStorage.clear());

  it('requires a correct prediction before continuing and does not auto-reveal the answer', () => {
    renderLesson();
    expect(screen.getByText('磁场只改变速度的方向')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /下一步/ }));
    expect(screen.getByText('先预测：力朝哪边？')).toBeInTheDocument();
    const next = screen.getByRole('button', { name: /下一步/ });
    expect(next).toBeDisabled();

    // Hint is opt-in and must not contain the answer index.
    expect(screen.queryByText('v × B 指向 −y；正电荷受力与之一致，所以洛伦兹力竖直向下，粒子会向下方弯曲。')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /查看提示/ }));
    expect(screen.getByText(/v 沿 \+x，B 沿 \+z/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: /竖直向上/ }));
    fireEvent.click(screen.getByRole('button', { name: '检查预测' }));
    expect(screen.getByText('还不对，先别急着看答案')).toBeInTheDocument();
    expect(next).toBeDisabled();

    fireEvent.click(screen.getByRole('radio', { name: /竖直向下/ }));
    fireEvent.click(screen.getByRole('button', { name: '检查预测' }));
    expect(screen.getByText('预测正确')).toBeInTheDocument();
    expect(screen.getByText(/正电荷受力与之一致/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /下一步/ })).toBeEnabled();
  });

  it('completes a task step and reports preset application', () => {
    const applied: string[] = [];
    renderLesson((id) => applied.push(id));
    fireEvent.click(screen.getByRole('button', { name: /下一步/ }));
    fireEvent.click(screen.getByRole('radio', { name: /竖直向下/ }));
    fireEvent.click(screen.getByRole('button', { name: '检查预测' }));
    fireEvent.click(screen.getByRole('button', { name: /下一步/ }));
    fireEvent.click(screen.getByRole('button', { name: /下一步/ }));
    fireEvent.click(screen.getByRole('radio', { name: /一半，T 变为原来的一半/ }));
    fireEvent.click(screen.getByRole('button', { name: '检查预测' }));
    fireEvent.click(screen.getByRole('button', { name: /下一步/ }));
    expect(screen.getByText('动手观察：速度只改变半径')).toBeInTheDocument();
    const taskButton = screen.getByRole('button', { name: /载入“速度加倍”参数/ });
    fireEvent.click(taskButton);
    expect(applied).toEqual(['p02-fast']);
    expect(P02_PRESETS['p02-fast']).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: /我已完成观察/ }));
    expect(screen.getByRole('button', { name: /下一步/ })).toBeEnabled();
  });
});
