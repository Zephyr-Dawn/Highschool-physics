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
  return page.getByTestId('p04-stage').evaluate((element) => {
    const names = ['data-status', 'data-entry-time-s', 'data-exit-time-s', 'data-field-time-s', 'data-boundary-ids', 'data-particle-count', 'data-start-x', 'data-start-y', 'data-selected-tau', 'data-selected-launch-time'];
    return Object.fromEntries(names.map((name) => [name, element.getAttribute(name)]));
  });
}

async function particleState(page: Page, label: string) {
  return page.getByTestId(`p04-particle-${label}`).evaluate((element) => {
    const names = ['data-status', 'data-entry-time-s', 'data-exit-time-s', 'data-launch-time', 'data-tau', 'data-x', 'data-y', 'data-exit-boundary-ids'];
    return Object.fromEntries(names.map((name) => [name, element.getAttribute(name)]));
  });
}

test('P04 strip and rectangle presets expose exact analytic exit events', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/particle/finite-field?preset=p04-strip-cross');
  await page.getByTestId('p04-stage').waitFor();
  const stripState = await stageState(page);
  expect(stripState['data-status']).toBe('entered-and-exited');
  expect(Number(stripState['data-exit-time-s'])).toBeCloseTo(Math.PI / 6, 4);
  expect(stripState['data-boundary-ids']).toContain('right');
  await page.getByRole('tab', { name: /数据/ }).click();
  await expect(page.getByTestId('p04-exit-boundary')).toContainText('right');
  await expect(page.getByTestId('p04-event-list')).toContainText('出射');
  await page.screenshot({ path: path.resolve('docs/screenshots/p04-strip-cross.png') });

  await page.getByRole('tab', { name: /参数/ }).click();
  await page.getByRole('button', { name: '矩形上出', exact: true }).click();
  await page.waitForTimeout(220);
  const rectState = await stageState(page);
  expect(rectState['data-status']).toBe('entered-and-exited');
  expect(rectState['data-boundary-ids']).toContain('top');
  expect(Number(rectState['data-exit-time-s'])).toBeCloseTo(Math.PI / 3, 4);
  await page.screenshot({ path: path.resolve('docs/screenshots/p04-rect-top.png') });
  expect(errors, errors.join(' | ')).toEqual([]);
});

test('P04 three particles: editing A during playback keeps B/C event timelines', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/particle/finite-field?preset=p04-three');
  await page.getByTestId('p04-stage').waitFor();
  expect(await page.getByTestId('p04-stage').getAttribute('data-particle-count')).toBe('3');
  const bBefore = await particleState(page, 'B');
  const cBefore = await particleState(page, 'C');
  await page.getByTestId('play-toggle').click();
  await page.waitForTimeout(360);
  const bMoving = await particleState(page, 'B');
  const cMoving = await particleState(page, 'C');
  expect(Number(bMoving['data-x'])).not.toBe(Number(bBefore['data-x']));
  expect(Number(cMoving['data-x'])).not.toBe(Number(cBefore['data-x']));

  await page.getByRole('tab', { name: /参数/ }).click();
  const speed = page.getByLabel('速度大小 v数值（m/s）');
  await speed.fill('0.8');
  await speed.blur();
  await page.waitForTimeout(220);
  const aAfter = await particleState(page, 'A');
  const bAfter = await particleState(page, 'B');
  const cAfter = await particleState(page, 'C');
  expect(Number(aAfter['data-launch-time'])).toBeGreaterThan(0);
  expect(bAfter['data-launch-time']).toBe(bBefore['data-launch-time']);
  expect(cAfter['data-launch-time']).toBe(cBefore['data-launch-time']);
  expect(Number(bAfter['data-x'])).not.toBe(Number(bMoving['data-x']));
  expect(Number(cAfter['data-x'])).not.toBe(Number(cMoving['data-x']));
  await expect(page.getByTestId('p04-page')).toHaveAttribute('data-sim-playing', 'true');
  await page.screenshot({ path: path.resolve('docs/screenshots/p04-live-edit.png') });
  expect(errors, errors.join(' | ')).toEqual([]);
});

test('P04 shared field change restarts all particles; touch pinch only changes the view', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1194, height: 834 }, hasTouch: true });
  const page = await context.newPage();
  const errors = collectErrors(page);
  await page.goto('/#/particle/finite-field?preset=p04-three');
  await page.getByTestId('p04-stage').waitFor();
  await page.getByTestId('play-toggle').click();
  await page.waitForTimeout(300);
  await page.getByTestId('play-toggle').click();
  await page.getByRole('tab', { name: /参数/ }).click();
  const bz = page.getByLabel('Bz数值（T）');
  await bz.fill('2');
  await bz.blur();
  await page.waitForTimeout(260);
  await expect(page.getByTestId('p04-page')).toHaveAttribute('data-sim-time', '0');
  for (const label of ['A', 'B', 'C']) {
    expect((await particleState(page, label))['data-launch-time']).toBe('0');
  }

  const stage = page.getByTestId('p04-stage-svg');
  const box = await stage.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;
  const before = await stageState(page);
  const beforeScale = await page.getByTestId('p04-stage').getAttribute('data-view-scale');
  const cdp = await context.newCDPSession(page);
  const y = box.y + box.height * 0.24;
  const pinch = async () => {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: box.x + box.width * 0.22, y, id: 1 }, { x: box.x + box.width * 0.38, y, id: 2 }],
    });
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: box.x + box.width * 0.14, y, id: 1 }, { x: box.x + box.width * 0.52, y, id: 2 }],
    });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(240);
  };
  await pinch();
  let after = await page.getByTestId('p04-stage').evaluate((element) => ({
    scale: element.getAttribute('data-view-scale'),
    startX: element.getAttribute('data-start-x'),
  }));
  if (Number(after.scale) === Number(beforeScale)) {
    await pinch();
    after = await page.getByTestId('p04-stage').evaluate((element) => ({
      scale: element.getAttribute('data-view-scale'),
      startX: element.getAttribute('data-start-x'),
    }));
  }
  expect(Number(after.scale)).not.toBeCloseTo(Number(beforeScale), 3);
  expect(after.startX).toBe(before['data-start-x']);
  expect(errors, errors.join(' | ')).toEqual([]);
  await context.close();
});

test('P04 teacher layer, corner event table and portrait remain usable', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/particle/finite-field?preset=p04-corner');
  await page.getByTestId('p04-stage').waitFor();
  const state = await stageState(page);
  expect(state['data-boundary-ids']).toContain('top');
  expect(state['data-boundary-ids']).toContain('right');
  await page.getByRole('button', { name: '教师视图', exact: true }).click();
  await expect(page.locator('.teacher-layer-bar')).toBeVisible();
  await page.screenshot({ path: path.resolve('docs/screenshots/p04-teacher.png') });
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.waitForTimeout(220);
  await expectNoHorizontalOverflow(page);
  await expect(page.getByTestId('p04-stage-svg')).toBeVisible();
  await page.screenshot({ path: path.resolve('docs/screenshots/p04-portrait.png') });
  expect(errors, errors.join(' | ')).toEqual([]);
});

test('P04 practice link loads the matching rectangle preset and keeps the answer', async ({ page }) => {
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/practice?q=p04-03');
  const card = page.locator('#question-p04-03');
  await card.waitFor();
  await card.getByRole('radio', { name: /上边界，t=π\/3/ }).click();
  await card.getByTestId('check-p04-03').click();
  await expect(card.getByText('回答正确').first()).toBeVisible();
  await card.getByRole('link', { name: /进入实验验证/ }).click();
  await expect(page).toHaveURL(/particle\/finite-field\?preset=p04-rect-top/);
  await page.getByTestId('p04-stage').waitFor();
  await expect(page.getByTestId('p04-stage')).toHaveAttribute('data-status', 'entered-and-exited');
  await expect(page.getByTestId('p04-stage')).toHaveAttribute('data-boundary-ids', /top/);
  await page.goBack();
  await page.reload();
  await expect(page.locator('#question-p04-03').getByRole('radio', { name: /上边界，t=π\/3/ })).toHaveAttribute('aria-checked', 'true');
});
