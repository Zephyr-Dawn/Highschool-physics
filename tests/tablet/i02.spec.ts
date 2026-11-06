import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  return errors;
}

async function expectNoHorizontalOverflow(page: Page) {
  const metrics = await page.evaluate(() => ({
    width: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.width + 1);
}

async function stageState(page: Page) {
  return page.getByTestId('i02-stage').evaluate((element) => {
    const names = [
      'data-mode',
      'data-x',
      'data-v',
      'data-emf',
      'data-current',
      'data-force',
      'data-power',
      'data-heat',
      'data-time',
      'data-status',
      'data-estimated',
      'data-manual-dragging',
      'data-initial-dragging',
      'data-history-count',
      'data-history-min-current',
      'data-history-max-current',
      'data-boundary-time',
      'data-field',
      'data-circuit-closed',
      'data-start-x',
    ];
    return Object.fromEntries(names.map((name) => [name, element.getAttribute(name)]));
  });
}

async function openDataTab(page: Page) {
  await page.getByRole('tab', { name: /数据/ }).click();
}

async function dragRod(page: Page, dx: number) {
  const handle = page.getByTestId('i02-rod-handle');
  const box = await handle.boundingBox();
  expect(box, 'missing I02 rod handle').not.toBeNull();
  if (!box) return null;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.waitForTimeout(60);
  for (let step = 1; step <= 6; step++) {
    await page.mouse.move(x + (dx * step) / 6, y);
    await page.waitForTimeout(45);
  }
  await page.waitForTimeout(5);
  return { x, y };
}

async function moveRod(page: Page, fromX: number, fromY: number, dx: number, steps = 6) {
  for (let step = 1; step <= steps; step++) {
    await page.mouse.move(fromX + (dx * step) / steps, fromY);
    await page.waitForTimeout(45);
  }
  await page.waitForTimeout(5);
}

async function waitForManualHistoryCurrent(page: Page, positive: boolean) {
  await page.waitForFunction(
    (wantedPositive) => {
      const stage = document.querySelector('[data-testid="i02-stage"]');
      const value = Number(stage?.getAttribute(wantedPositive ? 'data-history-max-current' : 'data-history-min-current'));
      return wantedPositive ? value > 1e-4 : value < -1e-4;
    },
    positive,
    { timeout: 2500 },
  );
}

async function waitForManualZero(page: Page) {
  await page.waitForFunction(
    () => {
      const stage = document.querySelector('[data-testid="i02-stage"]');
      return Math.abs(Number(stage?.getAttribute('data-current'))) < 1e-7;
    },
    null,
    { timeout: 2500 },
  );
}

test('I02 renders four modes, signed default state and tablet layouts', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/induction/moving-rod');
  await page.getByTestId('i02-stage-svg').waitFor();
  await expect(page.locator('h1')).toContainText('单导体棒切割磁感线');
  const stage = await stageState(page);
  expect(stage['data-mode']).toBe('constant-speed');
  expect(Number(stage['data-emf'])).toBeCloseTo(-1.5, 6);
  expect(Number(stage['data-current'])).toBeCloseTo(-0.75, 6);
  expect(Number(stage['data-force'])).toBeCloseTo(-0.75, 6);
  expect(stage['data-circuit-closed']).toBe('true');
  await page.getByRole('tab', { name: /参数/ }).click();
  for (const label of ['匀速切割', '自由滑行', '恒力驱动', '手指推拉']) {
    await expect(page.getByRole('button', { name: label, exact: true })).toBeVisible();
  }
  await expect(page.getByTestId('i02-rod')).toHaveCount(1);
  await expect(page.getByTestId('i02-start-handle')).toBeVisible();
  await expect(page.getByTestId('i02-current-arrow')).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: path.resolve('docs/screenshots/i02-constant-speed.png') });

  await page.setViewportSize({ width: 768, height: 1024 });
  await page.waitForTimeout(250);
  await expectNoHorizontalOverflow(page);
  await expect(page.getByTestId('i02-stage-svg')).toBeVisible();
  await page.screenshot({ path: path.resolve('docs/screenshots/i02-portrait.png') });
  expect(errors, errors.join(' | ')).toEqual([]);
});

test('I02 mode A speed edit while playing keeps playback and replays from a new setting', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/induction/moving-rod');
  await page.getByTestId('i02-stage-svg').waitFor();
  const sim = page.locator('.sim-page');
  await page.getByTestId('play-toggle').click();
  await page.waitForTimeout(320);
  await expect(sim).toHaveAttribute('data-sim-playing', 'true');
  const timeBefore = Number(await page.getByTestId('timeline').inputValue());
  expect(timeBefore).toBeGreaterThan(0);

  await page.getByRole('tab', { name: /参数/ }).click();
  const speedInput = page.getByLabel(/设定速度 v_set数值/);
  await speedInput.fill('2.2');
  await speedInput.blur();
  await page.waitForTimeout(260);
  await expect(sim).toHaveAttribute('data-sim-playing', 'true');
  const state = await stageState(page);
  expect(Number(state['data-emf'])).toBeCloseTo(-2.2, 5);
  expect(Number(state['data-current'])).toBeCloseTo(-1.1, 5);
  expect(Number(state['data-power'])).toBeCloseTo(2.42, 5);
  const timeAfter = Number(await page.getByTestId('timeline').inputValue());
  expect(timeAfter).toBeLessThan(timeBefore + 0.2);
  await page.screenshot({ path: path.resolve('docs/screenshots/i02-uniform-edit.png') });
  expect(errors, errors.join(' | ')).toEqual([]);
});

test('I02 B and v reversal follow the same signed snapshot', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/induction/moving-rod?preset=i02-reverse-field');
  await page.getByTestId('i02-stage-svg').waitFor();
  const reverseField = await stageState(page);
  expect(Number(reverseField['data-field'])).toBeCloseTo(-1, 9);
  expect(Number(reverseField['data-emf'])).toBeGreaterThan(0);
  expect(Number(reverseField['data-current'])).toBeGreaterThan(0);
  expect(Number(reverseField['data-force'])).toBeLessThan(0);
  await page.screenshot({ path: path.resolve('docs/screenshots/i02-reverse-field.png') });

  await page.goto('/#/induction/moving-rod?preset=i02-reverse-motion');
  await page.getByTestId('i02-stage-svg').waitFor();
  const reverseMotion = await stageState(page);
  expect(Number(reverseMotion['data-v'])).toBeCloseTo(-1.2, 6);
  expect(Number(reverseMotion['data-current'])).toBeGreaterThan(0);
  expect(Number(reverseMotion['data-force'])).toBeGreaterThan(0);
  await page.screenshot({ path: path.resolve('docs/screenshots/i02-reverse-motion.png') });
  expect(errors, errors.join(' | ')).toEqual([]);
});

test('I02 manual drag follows the finger, flips current and keeps history without resetting time', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/induction/moving-rod?preset=i02-manual');
  await page.getByTestId('i02-stage-svg').waitFor();
  await expect(page.getByTestId('i02-stage')).toHaveAttribute('data-mode', 'manual-drag');
  await page.getByTestId('play-toggle').click();
  await page.waitForTimeout(220);
  const before = await stageState(page);
  const timeBefore = Number(await page.getByTestId('timeline').inputValue());

  const start = await dragRod(page, 92);
  expect(start).not.toBeNull();
  await waitForManualHistoryCurrent(page, false);
  const right = await stageState(page);
  expect(right['data-manual-dragging']).toBe('true');
  expect(right['data-estimated']).toBe('true');
  expect(Number(right['data-x'])).toBeGreaterThan(Number(before['data-x']));
  expect(Number(right['data-history-min-current'])).toBeLessThan(-1e-4);
  expect(Number(await page.getByTestId('timeline').inputValue())).toBeGreaterThan(timeBefore);
  await page.screenshot({ path: path.resolve('docs/screenshots/i02-manual-drag.png') });

  if (start) {
    await moveRod(page, start.x + 92, start.y, -184, 12);
  }
  await waitForManualHistoryCurrent(page, true);
  const left = await stageState(page);
  expect(Number(left['data-x'])).toBeLessThan(Number(right['data-x']));
  expect(Number(left['data-history-max-current'])).toBeGreaterThan(1e-4);
  await page.mouse.up();
  await waitForManualZero(page);
  await page.waitForTimeout(120);
  const released = await stageState(page);
  expect(released['data-manual-dragging']).toBe('false');
  expect(Math.abs(Number(released['data-emf']))).toBeLessThan(1e-7);
  expect(Math.abs(Number(released['data-current']))).toBeLessThan(1e-7);
  expect(Math.abs(Number(released['data-force']))).toBeLessThan(1e-7);
  expect(Number(released['data-history-count'])).toBeGreaterThan(2);
  expect(Number(await page.getByTestId('timeline').inputValue())).toBeGreaterThan(timeBefore);

  await openDataTab(page);
  await expect(page.getByTestId('i02-chart-stack')).toBeVisible();
  await expect(page.getByTestId('i02-chart-current')).toBeVisible();
  await expect(page.getByTestId('i02-chart-emf')).toBeVisible();
  await page.getByTestId('i02-chart-stack').scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.resolve('docs/screenshots/i02-manual-chart.png') });
  expect(errors, errors.join(' | ')).toEqual([]);
});

test('I02 touch pinch does not move the rod and a second finger cancels a manual drag', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1024, height: 768 }, hasTouch: true });
  const page = await context.newPage();
  const errors = collectErrors(page);
  await page.goto('http://127.0.0.1:4173/#/induction/moving-rod?preset=i02-manual');
  await page.getByTestId('i02-stage-svg').waitFor();
  await page.getByTestId('play-toggle').click();
  await page.waitForTimeout(180);
  const xBefore = Number((await stageState(page))['data-x']);
  const scaleBefore = Number(await page.getByTestId('i02-stage').getAttribute('data-view-scale'));
  const stageBox = await page.getByTestId('i02-stage').boundingBox();
  expect(stageBox).not.toBeNull();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  if (stageBox) {
    const y = stageBox.y + stageBox.height * 0.86;
    const x1 = stageBox.x + stageBox.width * 0.22;
    const x2 = stageBox.x + stageBox.width * 0.78;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x1, y, id: 1 }, { x: x2, y, id: 2 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x1 - 55, y, id: 1 }, { x: x2 + 55, y, id: 2 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }
  await page.waitForTimeout(180);
  expect(Number((await stageState(page))['data-x'])).toBeCloseTo(xBefore, 4);
  expect(Number(await page.getByTestId('i02-stage').getAttribute('data-view-scale'))).toBeGreaterThan(scaleBefore * 1.12);

  const handle = await page.getByTestId('i02-rod-handle').boundingBox();
  expect(handle).not.toBeNull();
  if (handle) {
    const x = handle.x + handle.width / 2;
    const y = handle.y + handle.height / 2;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 3 }] });
    for (let step = 1; step <= 4; step++) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: x + (70 * step) / 4, y, id: 3 }],
      });
      await page.waitForTimeout(55);
    }
    await page.waitForTimeout(5);
    await waitForManualHistoryCurrent(page, false);
    const moving = await stageState(page);
    expect(moving['data-manual-dragging']).toBe('true');
    expect(Number(moving['data-history-min-current'])).not.toBe(0);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: x + 70, y, id: 3 }, { x: x + 250, y: y - 80, id: 4 }],
    });
    await page.waitForTimeout(100);
    const canceled = await stageState(page);
    expect(canceled['data-manual-dragging']).toBe('false');
    expect(Number(canceled['data-current'])).toBe(0);
    expect(Number.isFinite(Number(canceled['data-x']))).toBe(true);
    await page.screenshot({ path: path.resolve('docs/screenshots/i02-touch-pinch.png') });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }
  expect(errors, errors.join(' | ')).toEqual([]);
  await context.close();
});

test('I02 free decay matches the analytic state and energy split', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/induction/moving-rod?preset=i02-free-decay');
  await page.getByTestId('i02-stage-svg').waitFor();
  await expect(page.getByTestId('i02-stage')).toHaveAttribute('data-mode', 'free-decay');
  await page.getByTestId('next-keyframe').click();
  await page.waitForTimeout(140);
  const state = await stageState(page);
  expect(Number(state['data-time'])).toBeCloseTo(2, 4);
  expect(Number(state['data-v'])).toBeCloseTo(2 * Math.exp(-1), 4);
  expect(Number(state['data-emf'])).toBeCloseTo(-2 * Math.exp(-1), 4);
  expect(Number(state['data-heat'])).toBeCloseTo(2 * (1 - Math.exp(-2)), 4);
  await page.screenshot({ path: path.resolve('docs/screenshots/i02-free-decay.png') });

  await openDataTab(page);
  await page.getByTestId('i02-chart-group-energy').click();
  await expect(page.getByTestId('i02-chart-heat')).toBeVisible();
  await expect(page.getByTestId('i02-chart-kinetic')).toBeVisible();
  await expect(page.getByTestId('i02-energy-residual')).toBeVisible();
  expect(errors, errors.join(' | ')).toEqual([]);
});

test('I02 constant force approaches terminal speed and the turnaround flips current', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/induction/moving-rod?preset=i02-constant-force');
  await page.getByTestId('i02-stage-svg').waitFor();
  await page.getByTestId('next-keyframe').click();
  await page.waitForTimeout(120);
  await page.getByTestId('next-keyframe').click();
  await page.waitForTimeout(140);
  const terminalState = await stageState(page);
  expect(Number(terminalState['data-time'])).toBeCloseTo(6, 4);
  expect(Number(terminalState['data-v'])).toBeGreaterThan(1.85);
  await openDataTab(page);
  await expect(page.getByTestId('i02-terminal')).toContainText('2 m/s');
  await page.screenshot({ path: path.resolve('docs/screenshots/i02-constant-force.png') });

  await page.goto('/#/induction/moving-rod?preset=i02-turnaround');
  await page.getByTestId('i02-stage-svg').waitFor();
  const initial = await stageState(page);
  expect(Number(initial['data-current'])).toBeLessThan(0);
  await openDataTab(page);
  const zeroEvent = page.getByRole('button', { name: /速度过零/ });
  await expect(zeroEvent).toBeVisible();
  await zeroEvent.click();
  await page.waitForTimeout(140);
  const atZero = await stageState(page);
  expect(Number(atZero['data-v'])).toBeCloseTo(0, 3);
  expect(Number(atZero['data-current'])).toBeCloseTo(0, 3);
  await page.getByTestId('play-toggle').click();
  await page.waitForTimeout(520);
  const afterZero = await stageState(page);
  expect(Number(afterZero['data-v'])).toBeLessThan(-0.01);
  expect(Number(afterZero['data-current'])).toBeGreaterThan(0.001);
  await page.screenshot({ path: path.resolve('docs/screenshots/i02-turnaround.png') });
  expect(errors, errors.join(' | ')).toEqual([]);
});

test('I02 open circuit keeps EMF but removes current, force and Joule power', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/induction/moving-rod?preset=i02-open-circuit');
  await page.getByTestId('i02-stage-svg').waitFor();
  const state = await stageState(page);
  expect(state['data-circuit-closed']).toBe('false');
  expect(Number(state['data-emf'])).toBeCloseTo(-1.5, 6);
  expect(Number(state['data-current'])).toBe(0);
  expect(Number(state['data-force'])).toBe(0);
  expect(Number(state['data-power'])).toBe(0);
  await expect(page.getByTestId('i02-open-circuit-label')).toBeVisible();
  await expect(page.getByTestId('i02-current-arrow')).toHaveCount(0);
  await openDataTab(page);
  await expect(page.getByTestId('i02-current')).toContainText('0 A');
  await expect(page.getByTestId('i02-emf')).toContainText('V');
  await page.screenshot({ path: path.resolve('docs/screenshots/i02-open-circuit.png') });
  expect(errors, errors.join(' | ')).toEqual([]);
});

test('I02 teacher layers do not change the underlying data and work in portrait', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/induction/moving-rod');
  await page.getByTestId('i02-stage-svg').waitFor();
  const emfBefore = await page.getByTestId('i02-emf-value').textContent();
  await page.getByRole('button', { name: /教师视图/ }).click();
  await page.waitForTimeout(220);
  const bar = page.locator('.teacher-layer-bar');
  await expect(bar).toBeVisible();
  for (const name of ['磁场', '电流', '力矢量', '功率流', '能量']) {
    const chip = bar.getByRole('button', { name, exact: true });
    await expect(chip).toHaveAttribute('aria-pressed', 'true');
    await chip.click();
    await expect(chip).toHaveAttribute('aria-pressed', 'false');
    await chip.click();
  }
  await bar.getByRole('button', { name: '公式', exact: true }).click();
  await expect(bar.getByRole('button', { name: '公式', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByTestId('i02-emf-value')).toHaveText(emfBefore ?? '');
  await bar.getByRole('button', { name: '公式', exact: true }).click();
  await expect(bar.getByRole('button', { name: '公式', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({ path: path.resolve('docs/screenshots/i02-teacher.png') });

  await page.setViewportSize({ width: 768, height: 1024 });
  await page.waitForTimeout(250);
  await expectNoHorizontalOverflow(page);
  await expect(page.getByTestId('i02-stage-svg')).toBeVisible();
  await page.screenshot({ path: path.resolve('docs/screenshots/i02-teacher-768x1024.png') });
  expect(errors, errors.join(' | ')).toEqual([]);
});

test('I02 practice link loads the matching preset and keeps the answer after reload', async ({ page }) => {
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/practice?q=i02-01');
  const card = page.locator('#question-i02-01');
  await card.waitFor();
  await card.getByLabel('数值答案').fill('-3');
  await card.getByTestId('check-i02-01').click();
  await expect(card.getByText('回答正确').first()).toBeVisible();
  await card.getByRole('link', { name: /进入实验验证/ }).click();
  await expect(page).toHaveURL(/induction\/moving-rod\?preset=i02-q1-emf/);
  await expect(page.getByTestId('i02-stage')).toHaveAttribute('data-mode', 'constant-speed');
  expect(Number((await stageState(page))['data-emf'])).toBeCloseTo(-3, 6);
  await page.goBack();
  await page.reload();
  await expect(page.locator('#question-i02-01').getByLabel('数值答案')).toHaveValue('-3');
});

test('I02 pause, parameter edit and lifecycle freeze do not create a huge time jump', async ({ page, context }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/induction/moving-rod');
  await page.getByTestId('i02-stage-svg').waitFor();
  const sim = page.locator('.sim-page');
  await page.getByTestId('play-toggle').click();
  await page.waitForTimeout(260);
  await page.getByTestId('play-toggle').click();
  await page.waitForTimeout(120);
  const pausedTime = Number(await page.getByTestId('timeline').inputValue());
  await page.waitForTimeout(300);
  await expect(sim).toHaveAttribute('data-sim-playing', 'false');
  expect(Number(await page.getByTestId('timeline').inputValue())).toBeCloseTo(pausedTime, 6);

  await page.getByRole('tab', { name: /参数/ }).click();
  const speedInput = page.getByLabel(/设定速度 v_set数值/);
  await speedInput.fill('1.8');
  await speedInput.blur();
  await page.waitForTimeout(160);
  await expect(sim).toHaveAttribute('data-sim-playing', 'false');
  expect(Number(await page.getByTestId('timeline').inputValue())).toBe(0);
  const finiteState = await stageState(page);
  expect(Number.isFinite(Number(finiteState['data-emf']))).toBe(true);
  expect(Number.isFinite(Number(finiteState['data-heat']))).toBe(true);

  await page.getByTestId('play-toggle').click();
  await page.waitForTimeout(220);
  const beforeFreeze = Number(await page.getByTestId('timeline').inputValue());
  const cdp = await context.newCDPSession(page);
  await cdp.send('Page.setWebLifecycleState', { state: 'frozen' });
  await page.waitForTimeout(350);
  await cdp.send('Page.setWebLifecycleState', { state: 'active' });
  await page.waitForTimeout(180);
  const afterFreeze = Number(await page.getByTestId('timeline').inputValue());
  expect(Number.isFinite(afterFreeze)).toBe(true);
  expect(afterFreeze - beforeFreeze).toBeLessThan(0.6);
  expect(Number.isFinite(Number((await stageState(page))['data-current']))).toBe(true);
  expect(errors, errors.join(' | ')).toEqual([]);
});
