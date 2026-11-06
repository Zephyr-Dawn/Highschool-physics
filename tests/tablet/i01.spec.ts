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
  return page.getByTestId('i01-stage').evaluate((element) => {
    const names = ['data-mode', 'data-bz', 'data-area', 'data-theta', 'data-flux', 'data-emf', 'data-current', 'data-current-sense', 'data-induced-field', 'data-closed', 'data-derivative-quality', 'data-history-count', 'data-answers-hidden', 'data-drive'];
    return Object.fromEntries(names.map((name) => [name, element.getAttribute(name)]));
  });
}

async function dragHandle(page: Page, testId: string, dx: number, dy: number, callbacks?: { afterDown?: () => Promise<void>; beforeUp?: () => Promise<void> }) {
  const handle = page.getByTestId(testId);
  const box = await handle.boundingBox();
  expect(box, `missing ${testId}`).not.toBeNull();
  if (!box) return;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.waitForTimeout(120);
  if (callbacks?.afterDown) await callbacks.afterDown();
  await page.mouse.move(x + dx, y + dy, { steps: 10 });
  await page.waitForTimeout(80);
  if (callbacks?.beforeUp) await callbacks.beforeUp();
  await page.mouse.up();
}

async function ensurePlaying(page: Page) {
  const root = page.getByTestId('i01-page');
  if ((await root.getAttribute('data-sim-playing')) !== 'true') {
    await page.getByTestId('play-toggle').click();
  }
  await expect(root).toHaveAttribute('data-sim-playing', 'true');
}

test('I01 manual B drag keeps time, updates B/EMF and retains history', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/induction/flux-lenz');
  await page.getByTestId('i01-stage').waitFor();
  await expect(page.getByTestId('i01-stage')).toHaveAttribute('data-mode', 'field');
  const initial = await stageState(page);
  expect(Number(initial['data-bz'])).toBeCloseTo(0.5, 6);
  expect(Number(initial['data-flux'])).toBeCloseTo(0.2, 6);
  await page.getByTestId('play-toggle').click();
  await page.waitForTimeout(220);
  await ensurePlaying(page);
  const timeBefore = Number(await page.getByTestId('timeline').inputValue());
  await dragHandle(page, 'i01-field-handle-hit', 0, -70);
  await page.waitForTimeout(520);
  const after = await stageState(page);
  expect(Number(after['data-bz'])).not.toBeCloseTo(0.5, 4);
  expect(Number(await page.getByTestId('timeline').inputValue())).toBeGreaterThan(timeBefore);
  expect(Number(after['data-history-count'])).toBeGreaterThan(1);
  await page.screenshot({ path: path.resolve('docs/screenshots/i01-field-drag.png') });
  expect(errors, errors.join(' | ')).toEqual([]);
});

test('I01 automatic B increase/decrease has correct EMF and Lenz direction', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/induction/flux-lenz?preset=i01-field-increase');
  await page.getByTestId('i01-stage').waitFor();
  await ensurePlaying(page);
  await page.waitForTimeout(650);
  const increasing = await stageState(page);
  expect(Number(increasing['data-bz'])).toBeGreaterThan(0.2);
  expect(Number(increasing['data-emf'])).toBeLessThan(0);
  expect(Number(increasing['data-current'])).toBeLessThan(0);
  expect(increasing['data-current-sense']).toBe('clockwise-relative-normal');
  expect(increasing['data-induced-field']).toBe('opposite-normal');
  await page.screenshot({ path: path.resolve('docs/screenshots/i01-field-increase.png') });

  await page.goto('/#/induction/flux-lenz?preset=i01-field-decrease');
  await page.getByTestId('i01-stage').waitFor();
  await ensurePlaying(page);
  await page.waitForTimeout(650);
  const decreasing = await stageState(page);
  expect(Number(decreasing['data-emf'])).toBeGreaterThan(0);
  expect(Number(decreasing['data-current'])).toBeGreaterThan(0);
  expect(decreasing['data-current-sense']).toBe('counterclockwise-relative-normal');
  expect(decreasing['data-induced-field']).toBe('along-normal');
  await page.screenshot({ path: path.resolve('docs/screenshots/i01-field-decrease.png') });
  expect(errors, errors.join(' | ')).toEqual([]);
});

test('I01 area auto and manual dragging change area and reverse EMF sign', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/induction/flux-lenz?preset=i01-area-expand');
  await page.getByTestId('i01-stage').waitFor();
  await expect(page.getByTestId('i01-stage')).toHaveAttribute('data-mode', 'area');
  await ensurePlaying(page);
  await page.waitForTimeout(620);
  const auto = await stageState(page);
  expect(Number(auto['data-area'])).toBeGreaterThan(0.17);
  expect(Number(auto['data-emf'])).toBeLessThan(0);
  await page.screenshot({ path: path.resolve('docs/screenshots/i01-area-auto.png') });
  await page.getByRole('tab', { name: /数据/ }).click();
  await page.getByTestId('i01-chart-stack').scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.resolve('docs/screenshots/i01-area-charts.png') });

  await page.goto('/#/induction/flux-lenz?preset=i01-area-contract');
  await page.getByTestId('i01-stage').waitFor();
  await ensurePlaying(page);
  await page.waitForTimeout(620);
  const contract = await stageState(page);
  expect(Number(contract['data-emf'])).toBeGreaterThan(0);

  await page.goto('/#/induction/flux-lenz?preset=i01-area-manual');
  await page.getByTestId('i01-stage').waitFor();
  await ensurePlaying(page);
  await page.waitForTimeout(220);
  const before = await stageState(page);
  await dragHandle(page, 'i01-area-handle', 70, 0, {
    beforeUp: async () => {
      const during = await stageState(page);
      expect(Number(during['data-area'])).toBeGreaterThan(Number(before['data-area']));
      await page.screenshot({ path: path.resolve('docs/screenshots/i01-area-manual.png') });
    },
  });
  await page.waitForTimeout(220);
  const after = await stageState(page);
  expect(Number(after['data-area'])).toBeGreaterThanOrEqual(0.05 * 0.8 - 1e-6);
  expect(Number(after['data-area'])).toBeGreaterThan(Number(before['data-area']));
  expect(Number(after['data-history-count'])).toBeGreaterThan(2);
  expect(errors, errors.join(' | ')).toEqual([]);
});

test('I01 rotating coil has analytic theta/EMF and manual angle drag without resets', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/induction/flux-lenz?preset=i01-angle-auto');
  await page.getByTestId('i01-stage').waitFor();
  await expect(page.getByTestId('i01-stage')).toHaveAttribute('data-mode', 'angle');
  expect(await page.getByTestId('i01-stage').getAttribute('data-theta')).toBe('0');
  expect(Number(await page.getByTestId('i01-stage').getAttribute('data-emf'))).toBeCloseTo(0, 5);
  await ensurePlaying(page);
  await page.waitForTimeout(620);
  const auto = await stageState(page);
  expect(Number(auto['data-theta'])).toBeGreaterThan(0.1);
  expect(Number(auto['data-emf'])).not.toBeCloseTo(0, 2);
  expect(auto['data-derivative-quality']).toBe('exact');
  await page.screenshot({ path: path.resolve('docs/screenshots/i01-angle-auto.png') });

  await page.goto('/#/induction/flux-lenz?preset=i01-angle-manual');
  await page.getByTestId('i01-stage').waitFor();
  await ensurePlaying(page);
  await page.waitForTimeout(220);
  const timeBefore = Number(await page.getByTestId('timeline').inputValue());
  const thetaBefore = Number(await page.getByTestId('i01-stage').getAttribute('data-theta'));
  await dragHandle(page, 'i01-angle-handle', 75, 0);
  await page.waitForTimeout(250);
  const manual = await stageState(page);
  expect(Number(manual['data-theta'])).not.toBeCloseTo(thetaBefore, 4);
  expect(Number(await page.getByTestId('timeline').inputValue())).toBeGreaterThan(timeBefore);
  expect(Number.isFinite(Number(manual['data-emf']))).toBe(true);
  await page.screenshot({ path: path.resolve('docs/screenshots/i01-angle-manual.png') });
  expect(errors, errors.join(' | ')).toEqual([]);
});

test('I01 open circuit keeps EMF but removes current and induced field', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/induction/flux-lenz?preset=i01-open');
  await page.getByTestId('i01-stage').waitFor();
  await ensurePlaying(page);
  await page.waitForTimeout(620);
  const state = await stageState(page);
  expect(state['data-closed']).toBe('false');
  expect(Number(state['data-emf'])).not.toBe(0);
  expect(Number(state['data-current'])).toBe(0);
  expect(state['data-induced-field']).toBe('none');
  await expect(page.getByTestId('i01-current-arrow')).toHaveCount(0);
  await page.getByRole('tab', { name: /数据/ }).click();
  await expect(page.getByTestId('i01-current')).toContainText('0 A');
  await expect(page.getByTestId('i01-power')).toContainText('0 W');
  await page.screenshot({ path: path.resolve('docs/screenshots/i01-open.png') });
  expect(errors, errors.join(' | ')).toEqual([]);
});

test('I01 teacher can mask direction answers and portrait remains usable', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/induction/flux-lenz?preset=i01-field-increase');
  await page.getByTestId('i01-stage').waitFor();
  await page.getByRole('button', { name: /教师视图/ }).click();
  await page.waitForTimeout(200);
  await expect(page.locator('.teacher-layer-bar')).toBeVisible();
  await page.getByTestId('i01-mask-toggle').click();
  await expect(page.getByTestId('i01-stage')).toHaveAttribute('data-answers-hidden', 'true');
  await expect(page.getByTestId('i01-answer-masked')).toBeVisible();
  await page.screenshot({ path: path.resolve('docs/screenshots/i01-teacher.png') });
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.waitForTimeout(220);
  await expectNoHorizontalOverflow(page);
  await expect(page.getByTestId('i01-stage-svg')).toBeVisible();
  await page.screenshot({ path: path.resolve('docs/screenshots/i01-teacher-768x1024.png') });
  expect(errors, errors.join(' | ')).toEqual([]);
});

test('I01 practice link loads the flux preset and keeps the numeric answer', async ({ page }) => {
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/practice?q=i01-01');
  const card = page.locator('#question-i01-01');
  await card.waitFor();
  await card.getByLabel('数值答案').fill('0.1');
  await card.getByTestId('check-i01-01').click();
  await expect(card.getByText('回答正确').first()).toBeVisible();
  await card.getByRole('link', { name: /进入实验验证/ }).click();
  await expect(page).toHaveURL(/induction\/flux-lenz\?preset=i01-q1-flux/);
  await expect(page.getByTestId('i01-stage')).toHaveAttribute('data-mode', 'field');
  await expect(page.getByTestId('i01-stage')).toHaveAttribute('data-bz', '0.5');
  await page.goBack();
  await page.reload();
  await expect(page.locator('#question-i01-01').getByLabel('数值答案')).toHaveValue('0.1');
});

test('I01 touch pinch does not change B, area or angle', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1024, height: 768 }, hasTouch: true });
  const page = await context.newPage();
  const errors = collectErrors(page);
  await page.goto('http://127.0.0.1:4173/#/induction/flux-lenz?preset=i01-area-manual');
  await page.getByTestId('i01-stage').waitFor();
  const before = await stageState(page);
  const scaleBefore = Number(await page.getByTestId('i01-stage').getAttribute('data-view-scale'));
  const box = await page.getByTestId('i01-stage').boundingBox();
  expect(box).not.toBeNull();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  if (box) {
    const y = box.y + box.height * 0.82;
    const x1 = box.x + box.width * 0.22;
    const x2 = box.x + box.width * 0.78;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x1, y, id: 1 }, { x: x2, y, id: 2 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x1 - 50, y, id: 1 }, { x: x2 + 50, y, id: 2 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }
  await page.waitForTimeout(220);
  const after = await stageState(page);
  expect(Number(after['data-bz'])).toBeCloseTo(Number(before['data-bz']), 6);
  expect(Number(after['data-area'])).toBeCloseTo(Number(before['data-area']), 6);
  expect(Number(after['data-theta'])).toBeCloseTo(Number(before['data-theta']), 6);
  expect(Number(await page.getByTestId('i01-stage').getAttribute('data-view-scale'))).toBeGreaterThan(scaleBefore * 1.1);
  await page.screenshot({ path: path.resolve('docs/screenshots/i01-touch-pinch.png') });
  expect(errors, errors.join(' | ')).toEqual([]);
  await context.close();
});
