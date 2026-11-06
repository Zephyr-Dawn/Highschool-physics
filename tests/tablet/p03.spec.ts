import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

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
  await page.waitForTimeout(150);
  if (callbacks?.afterDown) await callbacks.afterDown();
  await page.mouse.move(x + dx, y + dy, { steps: 8 });
  await page.waitForTimeout(150);
  if (callbacks?.beforeUp) await callbacks.beforeUp();
  await page.mouse.up();
}

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  return errors;
}

test('P03 default entry/exit, data and entry/exit keyframes', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/particle/half-plane');
  await page.getByTestId('p03-stage-svg').waitFor();
  const stage = page.getByTestId('p03-stage');
  await expect(stage).toHaveAttribute('data-status', 'entered-and-exited');
  await expect(page.getByTestId('p03-entry-marker')).toBeVisible();
  await expect(page.getByTestId('p03-exit-marker')).toBeVisible();

  const entryTime = Number(await stage.getAttribute('data-entry-time-s'));
  const exitTime = Number(await stage.getAttribute('data-exit-time-s'));
  expect(Number.isFinite(entryTime)).toBe(true);
  expect(Number.isFinite(exitTime)).toBe(true);
  expect(exitTime).toBeGreaterThan(entryTime);

  await page.getByTestId('next-keyframe').click();
  await page.waitForTimeout(100);
  expect(Number(await page.locator('.sim-page').getAttribute('data-sim-time'))).toBeCloseTo(entryTime, 9);
  await page.getByTestId('next-keyframe').click();
  await page.waitForTimeout(100);
  expect(Number(await page.locator('.sim-page').getAttribute('data-sim-time'))).toBeCloseTo(exitTime, 9);

  await page.getByRole('tab', { name: /数据/ }).click();
  await expect(page.getByTestId('p03-status')).toContainText('已进入并出场');
  await expect(page.getByTestId('p03-field-time')).not.toContainText('—');
  await expect(page.getByTestId('p03-exit-point')).toContainText('cm');
  await page.screenshot({ path: path.resolve('docs/screenshots/p03-default.png') });
  expect(errors, errors.join(' | ')).toEqual([]);
});

test('P03 can drag launch point, direction and boundary during playback with a live full prediction', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/particle/half-plane');
  await page.getByTestId('p03-stage-svg').waitFor();
  await page.getByRole('button', { name: '0.25×' }).click();
  await page.getByRole('tab', { name: /数据/ }).click();
  await page.getByTestId('play-toggle').click();
  await page.waitForTimeout(250);

  const sim = page.locator('.sim-page');
  const stage = page.getByTestId('p03-stage');
  const preview = page.getByTestId('p03-preview-path');
  await expect(sim).toHaveAttribute('data-sim-playing', 'true');
  const entryPointBefore = await page.getByTestId('p03-entry-point').innerText();

  let pathAtDown = '';
  await dragHandle(page, 'p03-start-handle-hit', 56, 28, {
    afterDown: async () => {
      await expect(sim).toHaveAttribute('data-sim-editing', 'true');
      await expect(sim).toHaveAttribute('data-sim-playing', 'true');
      await expect(page.getByTestId('p03-condition-notice')).toContainText('其他粒子继续运动');
      await expect(preview).toBeVisible();
      expect(Number(await page.getByTestId('timeline').inputValue())).toBeGreaterThan(0);
      pathAtDown = (await preview.locator('path').first().getAttribute('d')) ?? '';
    },
    beforeUp: async () => {
      const currentPath = (await preview.locator('path').first().getAttribute('d')) ?? '';
      expect(currentPath).not.toBe(pathAtDown);
      expect(await page.getByTestId('p03-entry-point').innerText()).not.toBe(entryPointBefore);
    },
  });
  await expect(sim).toHaveAttribute('data-sim-playing', 'true');
  await page.waitForTimeout(300);
  expect(Number(await page.getByTestId('timeline').inputValue())).toBeGreaterThan(0);

  // Grab the direction handle while the clock is still playing. Its position moves
  // slowly at 0.25x; the 52px hit target absorbs the few pixels of drift.
  const exitBefore = await page.getByTestId('p03-exit-point').innerText();
  let directionAtDown = '';
  let directionPathAtDown = '';
  await dragHandle(page, 'p03-velocity-handle-hit', 42, -60, {
    afterDown: async () => {
      await expect(sim).toHaveAttribute('data-sim-editing', 'true');
      directionAtDown = (await stage.getAttribute('data-direction-deg')) ?? '';
      directionPathAtDown = (await preview.locator('path').first().getAttribute('d')) ?? '';
    },
    beforeUp: async () => {
      expect(await stage.getAttribute('data-direction-deg')).not.toBe(directionAtDown);
      expect((await preview.locator('path').first().getAttribute('d')) ?? '').not.toBe(directionPathAtDown);
      expect(await page.getByTestId('p03-exit-point').innerText()).not.toBe(exitBefore);
    },
  });
  await expect(sim).toHaveAttribute('data-sim-playing', 'true');
  await page.waitForTimeout(300);
  expect(Number(await page.getByTestId('timeline').inputValue())).toBeGreaterThan(0);

  const boundaryBefore = await page.getByTestId('p03-boundary').innerText();
  const boundaryXBefore = await stage.getAttribute('data-boundary-x');
  let boundaryPathAtDown = '';
  await dragHandle(page, 'p03-boundary-handle-hit', 38, 0, {
    afterDown: async () => {
      await expect(sim).toHaveAttribute('data-sim-editing', 'true');
      await expect(page.getByTestId('p03-condition-notice')).toContainText('公共场预览中');
      await expect(sim).toHaveAttribute('data-sim-playing', 'false');
      boundaryPathAtDown = (await preview.locator('path').first().getAttribute('d')) ?? '';
    },
    beforeUp: async () => {
      expect(await stage.getAttribute('data-boundary-x')).not.toBe(boundaryXBefore);
      expect((await preview.locator('path').first().getAttribute('d')) ?? '').not.toBe(boundaryPathAtDown);
      expect(await page.getByTestId('p03-boundary').innerText()).not.toBe(boundaryBefore);
    },
  });
  await expect(sim).toHaveAttribute('data-sim-playing', 'true');
  await page.waitForTimeout(300);
  expect(Number(await page.getByTestId('timeline').inputValue())).toBeGreaterThan(0);

  // A numeric parameter edit while playing must also rerun from the new initial state
  // without a second play click.
  await page.getByRole('tab', { name: /参数/ }).click();
  const bInput = page.getByLabel('磁感应强度 |B|数值（T）');
  await bInput.fill('0.7');
  await bInput.blur();
  await expect(sim).toHaveAttribute('data-sim-playing', 'true');
  await page.waitForTimeout(300);
  expect(Number(await page.getByTestId('timeline').inputValue())).toBeGreaterThan(0);

  await page.screenshot({ path: path.resolve('docs/screenshots/p03-playback-edit.png') });
  expect(errors, errors.join(' | ')).toEqual([]);
});

test('P03 remains paused after a paused edit', async ({ page }) => {
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/particle/half-plane');
  await page.getByTestId('p03-stage-svg').waitFor();
  const sim = page.locator('.sim-page');
  await expect(sim).toHaveAttribute('data-sim-playing', 'false');

  await dragHandle(page, 'p03-start-handle-hit', 44, 20);
  await expect(sim).toHaveAttribute('data-sim-playing', 'false');
  await expect(sim).toHaveAttribute('data-sim-editing', 'false');
  expect(Number(await page.getByTestId('timeline').inputValue())).toBe(0);
});

test('P03 tangent, no-entry and teacher layer toggles are explicit and finite', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1194, height: 834 });

  await page.goto('/#/particle/half-plane?preset=p03-tangent');
  await page.getByTestId('p03-stage-svg').waitFor();
  await expect(page.getByTestId('p03-stage')).toHaveAttribute('data-status', 'tangent-no-exit');
  await expect(page.getByTestId('p03-exit-marker')).toHaveCount(0);
  await expect(page.getByTestId('p03-tangent-marker')).toBeVisible();
  await page.getByRole('tab', { name: /数据/ }).click();
  await expect(page.getByTestId('p03-exit-time')).toContainText('—');
  await expect(page.getByTestId('p03-deflection')).toContainText('—');
  await expect(page.getByTestId('p03-status')).toContainText('相切');
  await page.screenshot({ path: path.resolve('docs/screenshots/p03-tangent.png') });

  await page.goto('/#/particle/half-plane?preset=p03-no-entry');
  await page.getByTestId('p03-stage-svg').waitFor();
  await expect(page.getByTestId('p03-stage')).toHaveAttribute('data-status', 'no-entry');
  await expect(page.getByTestId('p03-entry-marker')).toHaveCount(0);
  await expect(page.getByTestId('p03-exit-marker')).toHaveCount(0);
  await page.getByRole('tab', { name: /数据/ }).click();
  await expect(page.getByTestId('p03-status')).toContainText('无有效入场');
  await expect(page.getByTestId('p03-radius')).not.toContainText('NaN');

  await page.goto('/#/particle/half-plane?preset=p03-reverse');
  await page.getByTestId('p03-stage-svg').waitFor();
  await expect(page.getByTestId('p03-stage')).toHaveAttribute('data-status', 'entered-and-exited');
  await page.getByRole('tab', { name: /数据/ }).click();
  await expect(page.getByTestId('p03-exit-point')).toContainText('cm');
  await page.screenshot({ path: path.resolve('docs/screenshots/p03-reverse-exit.png') });

  await page.goto('/#/particle/half-plane?preset=p03-default');
  await page.getByTestId('p03-stage-svg').waitFor();
  await expect(page.getByTestId('p03-stage')).toHaveAttribute('data-status', 'entered-and-exited');
  await page.waitForTimeout(2950);
  await page.getByRole('button', { name: /教师视图/ }).click();
  await page.waitForTimeout(300);
  await expect(page.locator('.teacher-dock')).toBeVisible();
  await page.screenshot({ path: path.resolve('docs/screenshots/p03-teacher.png') });
  const layerBar = page.locator('.teacher-layer-bar');
  await expect(layerBar).toBeVisible();
  const centerToggle = layerBar.getByRole('button', { name: '圆心', exact: true });
  await expect(centerToggle).toHaveAttribute('aria-pressed', 'true');
  await centerToggle.click();
  await expect(centerToggle).toHaveAttribute('aria-pressed', 'false');
  await centerToggle.click();
  await expect(centerToggle).toHaveAttribute('aria-pressed', 'true');
  const formulaToggle = layerBar.getByRole('button', { name: '公式', exact: true });
  await formulaToggle.click();
  await expect(page.locator('.teacher-dock .teacher-formula')).toHaveCount(0);
  await page.screenshot({ path: path.resolve('docs/screenshots/p03-teacher-layers.png') });
  await formulaToggle.click();
  await expect(page.locator('.teacher-dock .teacher-formula')).toBeVisible();

  await page.setViewportSize({ width: 768, height: 1024 });
  await page.waitForTimeout(250);
  await expectNoHorizontalOverflowInP03(page);
  await expect(layerBar).toBeVisible();
  await page.screenshot({ path: path.resolve('docs/screenshots/p03-teacher-768x1024.png') });
  expect(errors, errors.join(' | ')).toEqual([]);
});

async function expectNoHorizontalOverflowInP03(page: Page) {
  const sizes = await page.evaluate(() => ({
    width: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(sizes.scrollWidth).toBeLessThanOrEqual(sizes.width + 1);
}

test('P03 question links to the tangent experiment and keeps progress after return', async ({ page }) => {
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/practice?q=p03-06');
  const card = page.locator('#question-p03-06');
  await card.waitFor();
  await card.getByRole('radio', { name: /相切只是接触边界/ }).click();
  await card.getByTestId('check-p03-06').click();
  await expect(card.getByText('回答正确').first()).toBeVisible();
  await card.getByRole('link', { name: /进入实验验证/ }).click();
  await expect(page).toHaveURL(/particle\/half-plane\?preset=p03-tangent/);
  await expect(page.getByTestId('p03-stage')).toHaveAttribute('data-status', 'tangent-no-exit');
  await page.goBack();
  await expect(card.getByRole('radio', { name: /相切只是接触边界/ })).toHaveAttribute('aria-checked', 'true');
  await page.reload();
  await expect(page.locator('#question-p03-06').getByRole('radio', { name: /相切只是接触边界/ })).toHaveAttribute('aria-checked', 'true');
});

test('P03 touch: one-finger drag and two-finger pinch do not conflict', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1024, height: 768 }, hasTouch: true });
  const page = await context.newPage();
  const errors = collectErrors(page);
  await page.goto('http://127.0.0.1:4173/#/particle/half-plane');
  await page.getByTestId('p03-stage-svg').waitFor();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });

  const stage = page.getByTestId('p03-stage');
  const startBefore = await stage.getAttribute('data-start-x');
  const boundaryBefore = await stage.getAttribute('data-boundary-x');
  const scrollBefore = await page.evaluate(() => window.scrollY);
  const handleBox = await page.getByTestId('p03-start-handle-hit').boundingBox();
  expect(handleBox).not.toBeNull();
  if (handleBox) {
    const x = handleBox.x + handleBox.width / 2;
    const y = handleBox.y + handleBox.height / 2;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: x + 48, y: y + 24, id: 1 }],
    });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(200);
  }
  const startAfter = await stage.getAttribute('data-start-x');
  expect(startAfter).not.toBe(startBefore);
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);

  const scaleBefore = Number(await stage.getAttribute('data-view-scale'));
  const stageBox = await stage.boundingBox();
  expect(stageBox).not.toBeNull();
  if (stageBox) {
    const midY = stageBox.y + stageBox.height * 0.55;
    const leftX = stageBox.x + stageBox.width * 0.38;
    const rightX = stageBox.x + stageBox.width * 0.62;
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [
        { x: leftX, y: midY, id: 2 },
        { x: rightX, y: midY, id: 3 },
      ],
    });
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        { x: leftX - 55, y: midY, id: 2 },
        { x: rightX + 55, y: midY, id: 3 },
      ],
    });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(200);
  }
  const stageAfter = page.getByTestId('p03-stage');
  expect(Number(await stageAfter.getAttribute('data-view-scale'))).toBeGreaterThan(scaleBefore * 1.15);
  expect(await stageAfter.getAttribute('data-start-x')).toBe(startAfter);
  expect(await stageAfter.getAttribute('data-boundary-x')).toBe(boundaryBefore);
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);
  expect(errors, errors.join(' | ')).toEqual([]);
  await context.close();
});
