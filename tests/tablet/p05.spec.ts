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
  const metrics = await page.evaluate(() => ({ width: window.innerWidth, scrollWidth: document.documentElement.scrollWidth }));
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.width + 1);
}

async function stageState(page: Page) {
  return page.getByTestId('p05-stage').evaluate((element) => {
    const names = ['data-status', 'data-crossings', 'data-tangents', 'data-region-times', 'data-checkpoint-times', 'data-start-x', 'data-start-y', 'data-particle-count'];
    return Object.fromEntries(names.map((name) => [name, element.getAttribute(name)]));
  });
}

async function particleState(page: Page, label: string) {
  return page.getByTestId(`p05-particle-${label}`).evaluate((element) => {
    const names = ['data-status', 'data-crossings', 'data-tangents', 'data-launch-time', 'data-tau', 'data-x', 'data-y', 'data-region', 'data-region-times'];
    return Object.fromEntries(names.map((name) => [name, element.getAttribute(name)]));
  });
}

async function setTimeline(page: Page, value: number) {
  await page.getByTestId('timeline').evaluate((element, next) => {
    const input = element as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, String(next));
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
  await page.waitForTimeout(160);
}

test('P05 two opposite half-planes expose two analytic crossings and region times', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/particle/alternating-fields?preset=p05-two-halves');
  await page.getByTestId('p05-stage').waitFor();
  const state = await stageState(page);
  expect(state['data-status']).toBe('crossed');
  expect(Number(state['data-crossings'])).toBeGreaterThanOrEqual(2);
  const checkpoints = (state['data-checkpoint-times'] ?? '').split(',').map(Number);
  expect(checkpoints[1]).toBeCloseTo(Math.PI, 3);
  expect(checkpoints[2]).toBeCloseTo(2 * Math.PI, 3);
  await page.getByRole('tab', { name: /数据/ }).click();
  await expect(page.getByTestId('p05-event-list')).toContainText('跨界');
  await page.screenshot({ path: path.resolve('docs/screenshots/p05-two-halves.png') });
  expect(errors, errors.join(' | ')).toEqual([]);
});

test('P05 same-time table proves arrival independently of path intersection', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/particle/alternating-fields?preset=p05-arrival-same');
  await page.getByTestId('p05-stage').waitFor();
  await page.getByRole('tab', { name: /数据/ }).click();
  await setTimeline(page, 2);
  const a = await page.getByTestId('p05-same-A').evaluate((element) => ({ x: element.getAttribute('data-x'), tau: element.getAttribute('data-tau') }));
  const b = await page.getByTestId('p05-same-B').evaluate((element) => ({ x: element.getAttribute('data-x'), tau: element.getAttribute('data-tau') }));
  expect(Number(a.x)).toBeCloseTo(2, 6);
  expect(Number(b.x)).toBeCloseTo(2, 6);
  expect(Number(a.tau)).toBeCloseTo(2, 6);
  expect(Number(b.tau)).toBeCloseTo(1, 6);
  const distance = await page.getByTestId('p05-distance-A–B').getAttribute('data-distance');
  expect(Number(distance)).toBeCloseTo(0, 8);
  await page.screenshot({ path: path.resolve('docs/screenshots/p05-simultaneous-arrival.png') });

  await page.goto('/#/particle/alternating-fields?preset=p05-cross-not-simultaneous');
  await page.getByTestId('p05-stage').waitFor();
  await page.getByRole('tab', { name: /数据/ }).click();
  await setTimeline(page, 1);
  const crossDistance = await page.getByTestId('p05-distance-A–B').getAttribute('data-distance');
  expect(Number(crossDistance)).toBeGreaterThan(0.5);
  await page.screenshot({ path: path.resolve('docs/screenshots/p05-cross-not-simultaneous.png') });
  expect(errors, errors.join(' | ')).toEqual([]);
});

test('P05 three-zone preset includes a straight zero-field segment', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/particle/alternating-fields?preset=p05-three-zone');
  await page.getByTestId('p05-stage').waitFor();
  await page.getByRole('tab', { name: /数据/ }).click();
  const state = await stageState(page);
  expect(state['data-status']).toBe('crossed');
  const regionTimes = (state['data-region-times'] ?? '').split(',').map(Number);
  expect(regionTimes.length).toBe(3);
  expect(regionTimes[0]).toBeGreaterThan(0);
  expect(regionTimes[1]).toBeGreaterThan(0);
  await expect(page.getByTestId('p05-event-list')).toContainText('跨界');
  await page.screenshot({ path: path.resolve('docs/screenshots/p05-three-zone.png') });
  expect(errors, errors.join(' | ')).toEqual([]);
});

test('P05 multi-particle live edit and shared field restart', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/particle/alternating-fields?preset=p05-multi');
  await page.getByTestId('p05-stage').waitFor();
  expect(await page.getByTestId('p05-stage').getAttribute('data-particle-count')).toBe('3');
  const bBefore = await particleState(page, 'B');
  const cBefore = await particleState(page, 'C');
  await page.getByTestId('play-toggle').click();
  await page.waitForTimeout(350);
  const bMoving = await particleState(page, 'B');
  const cMoving = await particleState(page, 'C');
  expect(Number(bMoving['data-tau'])).toBeGreaterThan(0);
  expect(cMoving['data-tau']).toBe('');
  await page.getByRole('tab', { name: /参数/ }).click();
  const speed = page.getByLabel('速度大小 v数值（m/s）');
  await speed.fill('1.4');
  await speed.blur();
  await page.waitForTimeout(220);
  const bAfter = await particleState(page, 'B');
  const cAfter = await particleState(page, 'C');
  expect(bAfter['data-launch-time']).toBe(bBefore['data-launch-time']);
  expect(cAfter['data-launch-time']).toBe(cBefore['data-launch-time']);
  expect(Number(bAfter['data-tau'])).not.toBe(Number(bMoving['data-tau']));
  expect(Number(cAfter['data-tau'])).toBeGreaterThan(0);
  await expect(page.getByTestId('p05-page')).toHaveAttribute('data-sim-playing', 'true');

  await page.getByTestId('play-toggle').click();
  const bz = page.getByLabel('区域 A Bz数值（T）');
  await bz.fill('0.5');
  await bz.blur();
  await page.waitForTimeout(260);
  await expect(page.getByTestId('p05-page')).toHaveAttribute('data-sim-time', '0');
  for (const label of ['A', 'B', 'C']) {
    expect((await particleState(page, label))['data-launch-time']).toBe('0');
  }
  await page.screenshot({ path: path.resolve('docs/screenshots/p05-live-edit.png') });
  expect(errors, errors.join(' | ')).toEqual([]);
});

test('P05 touch pinch, teacher layer and portrait layout', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1194, height: 834 }, hasTouch: true });
  const page = await context.newPage();
  const errors = collectErrors(page);
  await page.goto('/#/particle/alternating-fields?preset=p05-two-halves');
  await page.getByTestId('p05-stage').waitFor();
  const before = await stageState(page);
  const beforeScale = await page.getByTestId('p05-stage').getAttribute('data-view-scale');
  const box = await page.getByTestId('p05-stage-svg').boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;
  const cdp = await context.newCDPSession(page);
  const y = box.y + box.height * 0.45;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + box.width * 0.55, y, id: 1 }, { x: box.x + box.width * 0.7, y, id: 2 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: box.x + box.width * 0.45, y, id: 1 }, { x: box.x + box.width * 0.8, y, id: 2 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(180);
  const afterScale = await page.getByTestId('p05-stage').getAttribute('data-view-scale');
  expect(Number(afterScale)).not.toBeCloseTo(Number(beforeScale), 3);
  expect((await stageState(page))['data-start-x']).toBe(before['data-start-x']);
  await page.getByRole('button', { name: '教师视图', exact: true }).click();
  await expect(page.locator('.teacher-layer-bar')).toBeVisible();
  await page.screenshot({ path: path.resolve('docs/screenshots/p05-teacher.png') });
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.waitForTimeout(220);
  await expectNoHorizontalOverflow(page);
  await expect(page.getByTestId('p05-stage-svg')).toBeVisible();
  await page.screenshot({ path: path.resolve('docs/screenshots/p05-portrait.png') });
  expect(errors, errors.join(' | ')).toEqual([]);
  await context.close();
});

test('P05 practice link loads reversed-field preset and keeps the answer', async ({ page }) => {
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/practice?q=p05-03');
  const card = page.locator('#question-p05-03');
  await card.waitFor();
  await card.getByRole('radio', { name: /\(0,2\)/ }).click();
  await card.getByTestId('check-p05-03').click();
  await expect(card.getByText('回答正确').first()).toBeVisible();
  await card.getByRole('link', { name: /进入实验验证/ }).click();
  await expect(page).toHaveURL(/particle\/alternating-fields\?preset=p05-reversed/);
  await page.getByTestId('p05-stage').waitFor();
  await expect(page.getByTestId('p05-stage')).toHaveAttribute('data-status', 'crossed');
  await page.goBack();
  await page.reload();
  await expect(page.locator('#question-p05-03').getByRole('radio', { name: /\(0,2\)/ })).toHaveAttribute('aria-checked', 'true');
});
