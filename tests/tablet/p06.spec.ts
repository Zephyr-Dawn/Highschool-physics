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

async function dragHandle(
  page: Page,
  testId: string,
  dx: number,
  dy: number,
  callbacks?: { afterDown?: () => Promise<void>; beforeUp?: () => Promise<void> },
) {
  const handle = page.getByTestId(testId);
  const box = await handle.boundingBox();
  expect(box, `missing handle ${testId}`).not.toBeNull();
  if (!box) return;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.waitForTimeout(140);
  if (callbacks?.afterDown) await callbacks.afterDown();
  await page.mouse.move(x + dx, y + dy, { steps: 8 });
  await page.waitForTimeout(140);
  if (callbacks?.beforeUp) await callbacks.beforeUp();
  await page.mouse.up();
}

async function particleState(page: Page, label: string) {
  const group = page.getByTestId(`p06-particle-${label}`);
  await expect(group).toHaveCount(1);
  return group.evaluate((el) => {
    const names = [
      'data-mode',
      'data-region',
      'data-launch-time',
      'data-tau',
      'data-x',
      'data-y',
      'data-start-x',
      'data-start-y',
      'data-vx0',
      'data-vy0',
      'data-speed',
      'data-kinetic-j',
      'data-force-e',
      'data-force-b',
      'data-force',
      'data-selector-matched',
    ];
    return Object.fromEntries(names.map((name) => [name, el.getAttribute(name)]));
  });
}

test('P06 mode A selector shows one straight matched particle and a distinct full trajectory set', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/particle/combined-fields?preset=p06-selector');
  await page.getByTestId('p06-stage-svg').waitFor();
  const stage = page.getByTestId('p06-stage');
  await expect(stage).toHaveAttribute('data-mode', 'crossed');
  await expect(stage).toHaveAttribute('data-particle-count', '3');
  const a0 = await particleState(page, 'A');
  const b0 = await particleState(page, 'B');
  const c0 = await particleState(page, 'C');
  expect(Number(b0['data-force'])).toBeLessThan(1e-8);
  expect(b0['data-selector-matched']).toBe('true');
  expect(Number(a0['data-force'])).toBeGreaterThan(0.1);
  expect(Number(c0['data-force'])).toBeGreaterThan(0.1);
  await page.screenshot({ path: path.resolve('docs/screenshots/p06-crossed-selector.png') });

  await page.getByTestId('play-toggle').click();
  await page.waitForTimeout(280);
  const a1 = await particleState(page, 'A');
  const b1 = await particleState(page, 'B');
  const c1 = await particleState(page, 'C');
  expect(Number(b1['data-y'])).toBeCloseTo(0, 5);
  expect(Number(a1['data-y'])).not.toBeCloseTo(0, 3);
  expect(Number(c1['data-y'])).not.toBeCloseTo(0, 3);
  expect(Number(b1['data-force'])).toBeLessThan(1e-7);
  await page.getByTestId('particle-chip-p2').click();
  await page.getByRole('tab', { name: /数据/ }).click();
  await expect(page.getByTestId('p06-selector')).toContainText('满足（初始净力为零）');
  await expect(page.getByTestId('p06-compare-row-A')).toBeVisible();
  await expect(page.getByTestId('p06-compare-row-B')).toBeVisible();
  await expect(page.getByTestId('p06-compare-row-C')).toBeVisible();
  await page.getByTestId('particle-add').click();
  await page.getByTestId('particle-add').click();
  await expect(page.getByTestId('p06-stage')).toHaveAttribute('data-particle-count', '5');
  await page.screenshot({ path: path.resolve('docs/screenshots/p06-five.png') });

  await page.getByRole('button', { name: /电场→磁场/ }).click();
  await page.waitForTimeout(250);
  await expect(stage).toHaveAttribute('data-mode', 'segmented');
  await expect(stage).toHaveAttribute('data-particle-count', '1');
  await expect(page.getByTestId('p06-boundary-handle')).toBeVisible();
  await page.screenshot({ path: path.resolve('docs/screenshots/p06-segmented-default.png') });
  expect(errors, errors.join(' | ')).toEqual([]);
});

test('P06 mode A live edit updates A only while B/C keep moving', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/particle/combined-fields?preset=p06-selector');
  await page.getByTestId('p06-stage-svg').waitFor();
  await page.getByTestId('particle-chip-p1').click();
  await page.getByRole('button', { name: '0.25×' }).click();
  await page.getByTestId('play-toggle').click();
  await page.waitForTimeout(300);
  const sim = page.locator('.sim-page');
  await expect(sim).toHaveAttribute('data-sim-playing', 'true');
  const bBefore = await particleState(page, 'B');
  const cBefore = await particleState(page, 'C');
  const aStartBefore = await page.getByTestId('p06-stage').getAttribute('data-selected-start-x');
  await dragHandle(page, 'p06-start-handle-hit', 48, 24, {
    afterDown: async () => {
      await expect(sim).toHaveAttribute('data-sim-editing', 'true');
      await expect(sim).toHaveAttribute('data-sim-playing', 'true');
      await expect(page.getByTestId('p06-preview-path')).toBeVisible();
      await expect(page.getByTestId('p06-condition-notice')).toContainText('其他粒子继续运动');
    },
    beforeUp: async () => {
      const bDuring = await particleState(page, 'B');
      const cDuring = await particleState(page, 'C');
      expect(bDuring['data-launch-time']).toBe(bBefore['data-launch-time']);
      expect(cDuring['data-launch-time']).toBe(cBefore['data-launch-time']);
      expect(bDuring['data-start-x']).toBe(bBefore['data-start-x']);
      expect(cDuring['data-start-y']).toBe(cBefore['data-start-y']);
      expect(Number(bDuring['data-x'])).not.toBeCloseTo(Number(bBefore['data-x']), 8);
    },
  });
  await page.waitForTimeout(180);
  await expect(sim).toHaveAttribute('data-sim-playing', 'true');
  const aAfter = await particleState(page, 'A');
  const bAfter = await particleState(page, 'B');
  const cAfter = await particleState(page, 'C');
  expect(Number(aAfter['data-launch-time'])).toBeGreaterThan(0);
  expect(bAfter['data-launch-time']).toBe(bBefore['data-launch-time']);
  expect(cAfter['data-launch-time']).toBe(cBefore['data-launch-time']);
  expect(await page.getByTestId('p06-stage').getAttribute('data-selected-start-x')).not.toBe(aStartBefore);
  await page.screenshot({ path: path.resolve('docs/screenshots/p06-live-edit.png') });
  expect(errors, errors.join(' | ')).toEqual([]);
});

test('P06 mode B exposes exact entry/exit keyframes and selected event data', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/particle/combined-fields?preset=p06-accelerate');
  await page.getByTestId('p06-stage-svg').waitFor();
  const stage = page.getByTestId('p06-stage');
  await expect(stage).toHaveAttribute('data-mode', 'segmented');
  const a0 = await particleState(page, 'A');
  expect(a0['data-region']).toBe('electric');
  await page.getByTestId('next-keyframe').click();
  await page.waitForTimeout(120);
  await expect(stage).toHaveAttribute('data-selected-tau', /.+/);
  await expect(page.getByTestId('p06-entry-marker')).toBeVisible();
  const tauEntry = Number(await stage.getAttribute('data-selected-tau'));
  expect(tauEntry).toBeCloseTo(Math.sqrt(8) - 2, 3);
  await page.getByTestId('next-keyframe').click();
  await page.waitForTimeout(120);
  await expect(page.getByTestId('p06-exit-marker')).toBeVisible();
  const tauExit = Number(await stage.getAttribute('data-selected-tau'));
  expect(tauExit).toBeCloseTo(Math.sqrt(8) - 2 + Math.PI, 3);
  await page.getByRole('tab', { name: /数据/ }).click();
  await expect(page.getByTestId('p06-region')).toContainText('电场区');
  await expect(page.getByTestId('p06-events')).toContainText('跨界');
  await expect(page.getByTestId('p06-y')).toContainText('m');
  await page.screenshot({ path: path.resolve('docs/screenshots/p06-segmented-events.png') });
  expect(errors, errors.join(' | ')).toEqual([]);
});

test('P06 mode B shared boundary uses a frozen full-field preview and commits a synchronized reset', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/particle/combined-fields?preset=p06-accelerate');
  await page.getByTestId('p06-stage-svg').waitFor();
  await page.getByTestId('play-toggle').click();
  await page.waitForTimeout(220);
  const stage = page.getByTestId('p06-stage');
  const dBefore = Number(await stage.getAttribute('data-d'));
  const entryBefore = (await particleState(page, 'A'))['data-tau'];
  await dragHandle(page, 'p06-boundary-handle-hit', 35, 0, {
    afterDown: async () => {
      await expect(page.locator('.sim-page')).toHaveAttribute('data-sim-playing', 'false');
      await expect(page.locator('.sim-page')).toHaveAttribute('data-sim-editing', 'true');
      await expect(page.getByTestId('p06-condition-notice')).toContainText('公共场预览中');
    },
    beforeUp: async () => {
      const dDuring = Number(await stage.getAttribute('data-d'));
      expect(dDuring).not.toBeCloseTo(dBefore, 6);
      await page.screenshot({ path: path.resolve('docs/screenshots/p06-field-preview.png') });
    },
  });
  await page.waitForTimeout(300);
  await expect(page.locator('.sim-page')).toHaveAttribute('data-sim-playing', 'true');
  await expect(page.getByTestId('p06-condition-notice')).toContainText('场条件改变');
  await expect(stage).not.toHaveAttribute('data-d', String(dBefore));
  expect(Number(await page.getByTestId('timeline').inputValue())).toBeGreaterThan(0);
  expect(Number((await particleState(page, 'A'))['data-launch-time'])).toBe(0);
  expect(entryBefore).not.toBeNull();
  await page.screenshot({ path: path.resolve('docs/screenshots/p06-field-commit.png') });
  expect(errors, errors.join(' | ')).toEqual([]);
});

test('P06 mode B live edit A preserves a second particle and its launch time', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/particle/combined-fields?preset=p06-exit-electric');
  await page.getByTestId('p06-stage-svg').waitFor();
  await expect(page.getByTestId('p06-stage')).toHaveAttribute('data-particle-count', '2');
  await page.getByTestId('particle-add').click();
  await expect(page.getByTestId('p06-stage')).toHaveAttribute('data-particle-count', '3');
  await page.getByTestId('particle-chip-p1').click();
  await page.screenshot({ path: path.resolve('docs/screenshots/p06-segmented-3.png') });
  await page.getByRole('button', { name: '0.25×' }).click();
  await page.getByTestId('play-toggle').click();
  await page.waitForTimeout(280);
  const bBefore = await particleState(page, 'B');
  await dragHandle(page, 'p06-start-handle-hit', 40, 20, {
    afterDown: async () => {
      await expect(page.getByTestId('p06-preview-path')).toBeVisible();
      await expect(page.locator('.sim-page')).toHaveAttribute('data-sim-playing', 'true');
    },
    beforeUp: async () => {
      const bDuring = await particleState(page, 'B');
      expect(bDuring['data-launch-time']).toBe(bBefore['data-launch-time']);
      expect(bDuring['data-start-x']).toBe(bBefore['data-start-x']);
      expect(Number(bDuring['data-x'])).not.toBeCloseTo(Number(bBefore['data-x']), 8);
    },
  });
  await page.waitForTimeout(180);
  const aAfter = await particleState(page, 'A');
  const bAfter = await particleState(page, 'B');
  expect(Number(aAfter['data-launch-time'])).toBeGreaterThan(0);
  expect(bAfter['data-launch-time']).toBe(bBefore['data-launch-time']);
  expect(errors, errors.join(' | ')).toEqual([]);
});

test('P06 teacher layers expose FE, FB and resultant without changing data', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/particle/combined-fields?preset=p06-general');
  await page.getByTestId('p06-stage-svg').waitFor();
  const before = await particleState(page, 'A');
  await page.getByRole('button', { name: /教师视图/ }).click();
  await page.waitForTimeout(250);
  const bar = page.locator('.teacher-layer-bar');
  await expect(bar).toBeVisible();
  for (const name of ['F_E', 'F_B', '合力']) {
    const chip = bar.getByRole('button', { name, exact: true });
    await expect(chip).toHaveAttribute('aria-pressed', 'true');
    await chip.click();
    await expect(chip).toHaveAttribute('aria-pressed', 'false');
    await chip.click();
  }
  await bar.getByRole('button', { name: '全部矢量', exact: true }).click();
  await expect(page.getByTestId('p06-particle-A')).toHaveAttribute('data-force-e', before['data-force-e'] ?? '');
  await expect(page.getByTestId('p06-particle-A')).toHaveAttribute('data-force-b', before['data-force-b'] ?? '');
  await page.screenshot({ path: path.resolve('docs/screenshots/p06-teacher.png') });
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.waitForTimeout(250);
  await expectNoHorizontalOverflow(page);
  await expect(page.getByTestId('p06-stage-svg')).toBeVisible();
  await page.screenshot({ path: path.resolve('docs/screenshots/p06-teacher-768x1024.png') });
  expect(errors, errors.join(' | ')).toEqual([]);
});

test('P06 tablet viewports and touch editing remain usable in both modes', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1024, height: 768 }, hasTouch: true });
  const page = await context.newPage();
  const errors = collectErrors(page);
  await page.goto('http://127.0.0.1:4173/#/particle/combined-fields?preset=p06-selector');
  await page.getByTestId('p06-stage-svg').waitFor();
  await expectNoHorizontalOverflow(page);
  await page.getByTestId('particle-chip-p1').click();
  const startBefore = await page.getByTestId('p06-stage').getAttribute('data-selected-start-x');
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  const handle = await page.getByTestId('p06-start-handle-hit').boundingBox();
  expect(handle).not.toBeNull();
  if (handle) {
    const x = handle.x + handle.width / 2;
    const y = handle.y + handle.height / 2;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + 46, y: y + 22, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }
  await page.waitForTimeout(180);
  expect(await page.getByTestId('p06-stage').getAttribute('data-selected-start-x')).not.toBe(startBefore);
  const scaleBefore = Number(await page.getByTestId('p06-stage').getAttribute('data-view-scale'));
  const box = await page.getByTestId('p06-stage').boundingBox();
  expect(box).not.toBeNull();
  if (box) {
    const y = box.y + box.height * 0.88;
    const x1 = box.x + box.width * 0.2;
    const x2 = box.x + box.width * 0.8;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x1, y, id: 2 }, { x: x2, y, id: 3 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x1 - 50, y, id: 2 }, { x: x2 + 50, y, id: 3 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }
  await page.waitForTimeout(180);
  expect(Number(await page.getByTestId('p06-stage').getAttribute('data-view-scale'))).toBeGreaterThan(scaleBefore * 1.15);
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.waitForTimeout(250);
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: path.resolve('docs/screenshots/p06-touch-portrait.png') });
  expect(errors, errors.join(' | ')).toEqual([]);
  await context.close();
});

test('P06 practice link loads the selector scene and preserves answer after reload', async ({ page }) => {
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/practice?q=p06-01');
  const card = page.locator('#question-p06-01');
  await card.waitFor();
  await card.getByRole('radio', { name: /速率为 2 m\/s 的粒子/ }).click();
  await card.getByTestId('check-p06-01').click();
  await expect(card.getByText('回答正确').first()).toBeVisible();
  await card.getByRole('link', { name: /进入实验验证/ }).click();
  await expect(page).toHaveURL(/particle\/combined-fields\?preset=p06-selector/);
  await expect(page.getByTestId('p06-stage')).toHaveAttribute('data-particle-count', '3');
  await page.goBack();
  await page.reload();
  await expect(page.locator('#question-p06-01').getByRole('radio', { name: /速率为 2 m\/s 的粒子/ })).toHaveAttribute('aria-checked', 'true');
});
