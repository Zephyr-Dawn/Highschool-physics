import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const SHOT_DIR = path.resolve('docs/screenshots');
mkdirSync(SHOT_DIR, { recursive: true });

const VIEWPORTS = [
  { name: 'ipad-landscape-1024x768', width: 1024, height: 768, portrait: false },
  { name: 'ipad-landscape-1194x834', width: 1194, height: 834, portrait: false },
  { name: 'ipad-pro-landscape-1366x1024', width: 1366, height: 1024, portrait: false },
  { name: 'ipad-portrait-768x1024', width: 768, height: 1024, portrait: true },
  { name: 'android-portrait-810x1080', width: 810, height: 1080, portrait: true },
];

async function collectErrors(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  return errors;
}

async function expectNoHorizontalOverflow(page: Page) {
  const metrics = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(metrics.scrollWidth, 'page must not overflow horizontally').toBeLessThanOrEqual(
    metrics.innerWidth + 1,
  );
}

async function expectGridColumns(page: Page, columns: number) {
  const count = await page.evaluate(() => {
    const el = document.querySelector('.sim-layout');
    if (!el) return 0;
    return getComputedStyle(el).gridTemplateColumns.split(' ').filter(Boolean).length;
  });
  expect(count).toBe(columns);
}

test('required tablet viewports keep the stage visible without horizontal overflow', async ({ page }) => {
  const errors = await collectErrors(page);

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto('/#/');
    await page.locator('.hero').waitFor();
    await expectNoHorizontalOverflow(page);
    if (viewport.name === 'ipad-landscape-1194x834' || viewport.name === 'ipad-portrait-768x1024') {
      await page.screenshot({ path: path.join(SHOT_DIR, `home-${viewport.name}.png`) });
    }

    await page.goto('/#/particle/uniform-b');
    await page.getByTestId('p02-stage-svg').waitFor();
    await expectNoHorizontalOverflow(page);
    await expectGridColumns(page, viewport.portrait ? 1 : 2);
    const stageBox = await page.getByTestId('p02-stage').boundingBox();
    expect(stageBox?.width ?? 0).toBeGreaterThan(300);
    expect(stageBox?.height ?? 0).toBeGreaterThan(viewport.portrait ? 300 : 230);
    if (viewport.name !== 'android-portrait-810x1080') {
      await page.screenshot({ path: path.join(SHOT_DIR, `p02-${viewport.name}.png`) });
    }

    await page.goto('/#/particle/lorentz-force');
    await page.getByTestId('p01-3d-stage').waitFor();
    await page.locator('[data-testid="p01-3d-canvas"]').waitFor();
    await expectNoHorizontalOverflow(page);
    await expectGridColumns(page, viewport.portrait ? 1 : 2);
    const forceStageBox = await page.getByTestId('p01-3d-stage').boundingBox();
    expect(forceStageBox?.width ?? 0).toBeGreaterThan(300);
    expect(forceStageBox?.height ?? 0).toBeGreaterThan(viewport.portrait ? 300 : 230);
    if (viewport.name !== 'android-portrait-810x1080') {
      await page.screenshot({ path: path.join(SHOT_DIR, `p01-3d-${viewport.name}.png`) });
    }

    await page.goto('/#/particle/half-plane');
    await page.getByTestId('p03-stage-svg').waitFor();
    await expectNoHorizontalOverflow(page);
    await expectGridColumns(page, viewport.portrait ? 1 : 2);
    const boundedStageBox = await page.getByTestId('p03-stage').boundingBox();
    expect(boundedStageBox?.width ?? 0).toBeGreaterThan(300);
    expect(boundedStageBox?.height ?? 0).toBeGreaterThan(viewport.portrait ? 300 : 230);
    if (viewport.name !== 'android-portrait-810x1080') {
      await page.screenshot({ path: path.join(SHOT_DIR, `p03-${viewport.name}.png`) });
    }

    await page.goto('/#/induction/flux-lenz');
    await page.getByTestId('i01-stage-svg').waitFor();
    await expectNoHorizontalOverflow(page);
    await expectGridColumns(page, viewport.portrait ? 1 : 2);
    const fluxStageBox = await page.getByTestId('i01-stage').boundingBox();
    expect(fluxStageBox?.width ?? 0).toBeGreaterThan(300);
    expect(fluxStageBox?.height ?? 0).toBeGreaterThan(viewport.portrait ? 300 : 230);
    if (viewport.name !== 'android-portrait-810x1080') {
      await page.screenshot({ path: path.join(SHOT_DIR, `i01-${viewport.name}.png`) });
    }

    await page.goto('/#/induction/loop-entry');
    await page.getByTestId('i03-stage-svg').waitFor();
    await expectNoHorizontalOverflow(page);
    await expectGridColumns(page, viewport.portrait ? 1 : 2);
    const loopStageBox = await page.getByTestId('i03-stage').boundingBox();
    expect(loopStageBox?.width ?? 0).toBeGreaterThan(300);
    expect(loopStageBox?.height ?? 0).toBeGreaterThan(viewport.portrait ? 300 : 230);
    if (viewport.name !== 'android-portrait-810x1080') {
      await page.screenshot({ path: path.join(SHOT_DIR, `i03-${viewport.name}.png`) });
    }

    await page.goto('/#/induction/moving-rod');
    await page.getByTestId('i02-stage-svg').waitFor();
    await expectNoHorizontalOverflow(page);
    await expectGridColumns(page, viewport.portrait ? 1 : 2);
    const rodStageBox = await page.getByTestId('i02-stage').boundingBox();
    expect(rodStageBox?.width ?? 0).toBeGreaterThan(300);
    expect(rodStageBox?.height ?? 0).toBeGreaterThan(viewport.portrait ? 300 : 230);
    if (viewport.name !== 'android-portrait-810x1080') {
      await page.screenshot({ path: path.join(SHOT_DIR, `i02-${viewport.name}.png`) });
    }

    await page.goto('/#/induction/time-varying-field');
    await page.getByTestId('i04-stage-svg').waitFor();
    await expectNoHorizontalOverflow(page);
    await expectGridColumns(page, viewport.portrait ? 1 : 2);
    const timeVaryingStageBox = await page.getByTestId('i04-stage').boundingBox();
    expect(timeVaryingStageBox?.width ?? 0).toBeGreaterThan(300);
    expect(timeVaryingStageBox?.height ?? 0).toBeGreaterThan(viewport.portrait ? 300 : 230);
    if (viewport.name !== 'android-portrait-810x1080') {
      await page.screenshot({ path: path.join(SHOT_DIR, `i04-${viewport.name}.png`) });
    }

    await page.goto('/#/particle/combined-fields');
    await page.getByTestId('p06-stage-svg').waitFor();
    await expectNoHorizontalOverflow(page);
    await expectGridColumns(page, viewport.portrait ? 1 : 2);
    const combinedStageBox = await page.getByTestId('p06-stage').boundingBox();
    expect(combinedStageBox?.width ?? 0).toBeGreaterThan(300);
    expect(combinedStageBox?.height ?? 0).toBeGreaterThan(viewport.portrait ? 300 : 230);
    if (viewport.name !== 'android-portrait-810x1080') {
      await page.screenshot({ path: path.join(SHOT_DIR, `p06-${viewport.name}.png`) });
    }
  }

  expect(errors, errors.join('\n')).toEqual([]);
});

test('P02: play, pause, change B, drag entry point and answer a question', async ({ page }) => {
  const errors = await collectErrors(page);
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/particle/uniform-b');
  await page.getByTestId('p02-stage-svg').waitFor();

  const initialTime = await page.getByTestId('timeline').inputValue();
  expect(Number(initialTime)).toBe(0);
  await page.getByTestId('play-toggle').click();
  await page.waitForTimeout(900);
  const advancedTime = Number(await page.getByTestId('timeline').inputValue());
  expect(advancedTime).toBeGreaterThan(0);
  await page.getByTestId('play-toggle').click();
  await page.waitForTimeout(120);
  const pausedTime = Number(await page.getByTestId('timeline').inputValue());
  await page.waitForTimeout(300);
  expect(Number(await page.getByTestId('timeline').inputValue())).toBeCloseTo(pausedTime, 6);

  await page.getByRole('tab', { name: /参数/ }).click();
  const bInput = page.getByLabel('磁感应强度 |B|数值（T）');
  await bInput.fill('1.0');
  await bInput.blur();
  await page.getByRole('tab', { name: /数据/ }).click();
  await expect(page.getByTestId('p02-radius')).toContainText('12.5 cm');
  await expect(page.getByTestId('p02-period')).toContainText('392');
  await page.screenshot({ path: path.join(SHOT_DIR, 'p02-data-panel.png') });

  await page.getByRole('tab', { name: /参数/ }).click();
  const startInput = page.getByLabel('入射点 x数值（cm）');
  const beforeX = await startInput.inputValue();
  const handle = page.getByTestId('p02-start-handle-hit');
  const handleBox = await handle.boundingBox();
  expect(handleBox).not.toBeNull();
  if (handleBox) {
    await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(handleBox.x + handleBox.width / 2 + 55, handleBox.y + handleBox.height / 2, {
      steps: 6,
    });
    await page.mouse.up();
  }
  await page.waitForTimeout(200);
  expect(await startInput.inputValue()).not.toBe(beforeX);
  await expect(page.locator('.sim-page')).toHaveAttribute('data-sim-playing', 'false');
  expect(Number(await page.getByTestId('timeline').inputValue())).toBe(0);

  await page.goto('/#/practice?q=p02-01');
  const p02Question = page.locator('#question-p02-01');
  await p02Question.getByRole('radio', { name: /竖直向下/ }).click();
  await page.getByTestId('check-p02-01').click();
  await expect(p02Question.getByText('回答正确').first()).toBeVisible();
  await expect(p02Question.getByText('答案与解析')).toBeVisible();
  await page.goto('/#/practice');
  await expect(page.locator('.practice-summary-card')).toContainText('1 / 132');

  expect(errors, errors.join('\n')).toEqual([]);
});

test('I03: event keyframes expose consistent flux/EMF/current/force stages', async ({ page }) => {
  const errors = await collectErrors(page);
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/induction/loop-entry');
  await page.getByTestId('i03-stage-svg').waitFor();
  await expect(page.getByTestId('i03-phase-value')).toHaveText('before');

  const phases: string[] = [];
  for (let i = 0; i < 4; i++) {
    await page.getByTestId('next-keyframe').click();
    await page.waitForTimeout(120);
    phases.push((await page.getByTestId('i03-phase-value').textContent()) ?? '');
  }
  expect(phases).toEqual(['entering', 'inside', 'leaving', 'after']);

  // Step back from "after" onto the leaving boundary event.
  await page.getByTestId('prev-keyframe').click();
  await page.waitForTimeout(120);
  await expect(page.getByTestId('i03-phase-value')).toHaveText('leaving');
  const emfLeaving = Number(await page.getByTestId('i03-emf-value').textContent());
  const currentLeaving = Number(await page.getByTestId('i03-current-value').textContent());
  const forceLeaving = Number(await page.getByTestId('i03-force-value').textContent());
  expect(emfLeaving).toBeGreaterThan(0);
  expect(currentLeaving).toBeGreaterThan(0);
  expect(forceLeaving).toBeLessThan(0);

  await page.screenshot({ path: path.join(SHOT_DIR, 'i03-leaving-event.png') });

  await page.getByRole('tab', { name: /数据/ }).click();
  await expect(page.getByTestId('i03-phase')).toContainText('离开磁场中');
  await expect(page.getByTestId('i03-area')).toContainText('cm²');
  await page.getByTestId('prev-keyframe').click();
  await expect(page.getByTestId('i03-phase')).toContainText('完全在磁场中');
  await expect(page.getByTestId('i03-current')).toContainText('0 A');
  await page.getByTestId('prev-keyframe').click();
  await expect(page.getByTestId('i03-emf')).toContainText('mV');

  await page.goto('/#/induction/loop-entry?preset=i03-free');
  await page.getByTestId('i03-stage-svg').waitFor();
  await expect(page.locator('.stage-hud')).toContainText('自由滑行');
  await page.getByTestId('play-toggle').click();
  await page.waitForTimeout(400);
  await page.getByRole('tab', { name: /数据/ }).click();
  await expect(page.getByTestId('i03-heat')).not.toContainText('0 mJ');
  await expect(page.getByTestId('i03-phase')).not.toContainText('未进入');

  const loopHandle = page.getByTestId('i03-loop-handle');
  const loopBox = await loopHandle.boundingBox();
  expect(loopBox).not.toBeNull();
  await page.getByRole('tab', { name: /参数/ }).click();
  const startX = page.getByLabel('初始位置 x数值（cm）');
  const beforeLoopX = await startX.inputValue();
  if (loopBox) {
    await page.getByTestId('play-toggle').click();
    await page.getByTestId('reset-playback').click();
    await page.getByRole('tab', { name: /参数/ }).click();
    const refreshedBox = await loopHandle.boundingBox();
    if (refreshedBox) {
      await page.mouse.move(refreshedBox.x + refreshedBox.width / 2, refreshedBox.y + refreshedBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(refreshedBox.x + refreshedBox.width / 2 + 50, refreshedBox.y + refreshedBox.height / 2, {
        steps: 6,
      });
      await page.mouse.up();
    }
  }
  await page.waitForTimeout(250);
  expect(await startX.inputValue()).not.toBe(beforeLoopX);

  expect(errors, errors.join('\n')).toEqual([]);
});

test('portrait stacks stage and console, and teacher view exposes formula dock without hiding stage', async ({ page }) => {
  const errors = await collectErrors(page);
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto('/#/particle/uniform-b');
  await page.getByTestId('p02-stage-svg').waitFor();
  await expectGridColumns(page, 1);
  const stageBox = await page.getByTestId('p02-stage').boundingBox();
  const tabsBox = await page.locator('.panel-tabs').boundingBox();
  expect(tabsBox?.y ?? 0).toBeGreaterThanOrEqual((stageBox?.y ?? 0) + (stageBox?.height ?? 0) - 2);
  await expectNoHorizontalOverflow(page);

  await page.getByRole('button', { name: /教师视图/ }).click();
  await page.waitForTimeout(260);
  const teacherButton = page.getByRole('button', { name: /退出教师视图/ });
  await expect(teacherButton).toHaveClass(/is-active/);
  expect(await teacherButton.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(
    'rgb(20, 33, 61)',
  );
  await expect(page.locator('.sim-panel')).toHaveCount(0);
  await expect(page.locator('.teacher-dock')).toBeVisible();
  await expect(page.locator('.stage-hud')).toBeVisible();
  await expect(page.getByTestId('p02-stage-svg')).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: path.join(SHOT_DIR, 'p02-teacher-768x1024.png') });

  expect(errors, errors.join('\n')).toEqual([]);
});

test('two-finger pinch zooms the stage on a touch tablet profile', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 1024, height: 768 },
    hasTouch: true,
  });
  const page = await context.newPage();
  const errors = await collectErrors(page);
  await page.goto('http://127.0.0.1:4173/#/particle/uniform-b');
  await page.getByTestId('p02-stage-svg').waitFor();
  const stage = page.getByTestId('p02-stage');
  const before = Number(await stage.getAttribute('data-view-scale'));
  const box = await stage.boundingBox();
  expect(box).not.toBeNull();

  if (box) {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    const midY = box.y + box.height * 0.55;
    const leftX = box.x + box.width * 0.38;
    const rightX = box.x + box.width * 0.62;
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [
        { x: leftX, y: midY, id: 1 },
        { x: rightX, y: midY, id: 2 },
      ],
    });
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        { x: leftX - 60, y: midY, id: 1 },
        { x: rightX + 60, y: midY, id: 2 },
      ],
    });
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
    await page.waitForTimeout(200);
  }

  const after = Number(await stage.getAttribute('data-view-scale'));
  expect(after).toBeGreaterThan(before * 1.2);
  expect(errors, errors.join(' | ')).toEqual([]);
  await context.close();
});
