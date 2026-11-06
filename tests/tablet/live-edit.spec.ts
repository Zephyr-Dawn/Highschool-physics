import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

async function dragMouse(
  page: Page,
  selector: string,
  dx: number,
  dy: number,
  callbacks?: { afterDown?: () => Promise<void>; beforeUp?: () => Promise<void> },
) {
  const handle = page.getByTestId(selector);
  const box = await handle.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.waitForTimeout(140);
  if (callbacks?.afterDown) await callbacks.afterDown();
  await page.mouse.move(startX + dx, startY + dy, { steps: 8 });
  await page.waitForTimeout(140);
  if (callbacks?.beforeUp) await callbacks.beforeUp();
  await page.mouse.up();
}

test('P02 keeps playing after dragging the entry point, with a live preview during the drag', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/particle/uniform-b');
  await page.getByTestId('p02-stage-svg').waitFor();

  await page.getByTestId('play-toggle').click();
  await page.waitForTimeout(550);
  const sim = page.locator('.sim-page');
  await expect(sim).toHaveAttribute('data-sim-playing', 'true');
  expect(Number(await page.getByTestId('timeline').inputValue())).toBeGreaterThan(0);

  const beforeX = await page.getByTestId('p02-stage').getAttribute('data-initial-start-x');
  const orbit = page.getByTestId('p02-preview-orbit');
  const notice = page.getByTestId('p02-condition-notice');
  await page.getByRole('tab', { name: /数据/ }).click();
  const centerReadout = page.getByTestId('p02-center');
  const centerReadoutBefore = await centerReadout.innerText();

  await dragMouse(page, 'p02-start-handle-hit', 74, 38, {
    afterDown: async () => {
      // The preview must already exist at t=0 before the pointer starts moving.
      await expect(orbit).toBeVisible();
    },
    beforeUp: async () => {
      // These assertions run while the mouse is still held down.
      await expect(sim).toHaveAttribute('data-sim-editing', 'true');
      // Multi-particle semantic: editing A must not pause the global clock.
      await expect(sim).toHaveAttribute('data-sim-playing', 'true');
      await expect(notice).toBeVisible();
      await expect(notice).toContainText('其他粒子继续运动');
      await expect(orbit).toBeVisible();
      expect(Number(await page.getByTestId('timeline').inputValue())).toBeGreaterThan(0);
      const centerAfter = await orbit.getAttribute('data-center-x-m');
      const startAfter = await page.getByTestId('p02-stage').getAttribute('data-initial-start-x');
      expect(startAfter).not.toBe(beforeX);
      expect(centerAfter).not.toBeNull();
      expect(await centerReadout.innerText()).not.toBe(centerReadoutBefore);
      await page.screenshot({ path: path.resolve('docs/screenshots/p02-live-edit-preview.png') });
    },
  });

  // Release: no extra play click. The original playing state must resume.
  await expect(sim).toHaveAttribute('data-sim-editing', 'false');
  await expect(sim).toHaveAttribute('data-sim-playing', 'true');
  await expect(page.getByTestId('play-toggle')).toContainText('暂停');
  await expect(notice).toContainText('其他粒子未重置');
  expect(Number(await page.getByTestId('p02-stage').getAttribute('data-selected-launch-time'))).toBeGreaterThan(0);

  await page.waitForTimeout(500);
  expect(Number(await page.getByTestId('timeline').inputValue())).toBeGreaterThan(0);
  expect(errors, errors.join(' | ')).toEqual([]);
});

test('P02 direction edits update the predicted orbit live and keep the play state', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/particle/uniform-b');
  await page.getByTestId('p02-stage-svg').waitFor();

  await page.getByRole('button', { name: '0.25×' }).click();
  await page.getByTestId('play-toggle').click();
  await page.waitForTimeout(220);

  const stage = page.getByTestId('p02-stage');
  const orbit = page.getByTestId('p02-preview-orbit');
  await expect(page.locator('.sim-page')).toHaveAttribute('data-sim-playing', 'true');
  const directionBefore = await stage.getAttribute('data-initial-direction-deg');
  await page.getByRole('tab', { name: /数据/ }).click();
  const centerReadout = page.getByTestId('p02-center');
  const centerReadoutBefore = await centerReadout.innerText();

  let centerAtPointerDown: string | null = null;
  await dragMouse(page, 'p02-velocity-handle-hit', 55, -72, {
    afterDown: async () => {
      await expect(orbit).toBeVisible();
      centerAtPointerDown = await orbit.getAttribute('data-center-x-m');
    },
    beforeUp: async () => {
      await expect(page.locator('.sim-page')).toHaveAttribute('data-sim-editing', 'true');
      await expect(orbit).toBeVisible();
      const directionDuring = await stage.getAttribute('data-initial-direction-deg');
      expect(directionDuring).not.toBeNull();
      expect(directionDuring).not.toBe(directionBefore);
      const centerX = await orbit.getAttribute('data-center-x-m');
      const centerY = await orbit.getAttribute('data-center-y-m');
      expect(Number.isFinite(Number(centerX))).toBe(true);
      expect(Number.isFinite(Number(centerY))).toBe(true);
      expect(centerX).not.toBe(centerAtPointerDown);
      expect(await centerReadout.innerText()).not.toBe(centerReadoutBefore);
    },
  });

  await expect(page.locator('.sim-page')).toHaveAttribute('data-sim-playing', 'true');
  await expect(page.getByTestId('play-toggle')).toContainText('暂停');
  await page.waitForTimeout(500);
  expect(Number(await page.getByTestId('timeline').inputValue())).toBeGreaterThan(0);
  expect(errors, errors.join(' | ')).toEqual([]);
});

test('touch: one-finger entry drag and two-finger pinch do not conflict', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 1024, height: 768 },
    hasTouch: true,
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await page.goto('http://127.0.0.1:4173/#/particle/uniform-b');
  await page.getByTestId('p02-stage-svg').waitFor();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });

  const stage = page.getByTestId('p02-stage');
  const startBefore = await stage.getAttribute('data-initial-start-x');
  const scrollBefore = await page.evaluate(() => window.scrollY);
  const handle = page.getByTestId('p02-start-handle-hit');
  const handleBox = await handle.boundingBox();
  expect(handleBox).not.toBeNull();

  if (handleBox) {
    const x = handleBox.x + handleBox.width / 2;
    const y = handleBox.y + handleBox.height / 2;
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x, y, id: 1 }],
    });
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: x + 54, y: y + 20, id: 1 }],
    });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(200);
  }

  const startAfterDrag = await stage.getAttribute('data-initial-start-x');
  expect(startAfterDrag).not.toBe(startBefore);
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);

  const scaleBefore = Number(await stage.getAttribute('data-view-scale'));
  const stageBox = await stage.boundingBox();
  expect(stageBox).not.toBeNull();
  if (stageBox) {
    const midY = stageBox.y + stageBox.height * 0.58;
    const leftX = stageBox.x + stageBox.width * 0.35;
    const rightX = stageBox.x + stageBox.width * 0.65;
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
        { x: leftX - 55, y: midY, id: 1 },
        { x: rightX + 55, y: midY, id: 2 },
      ],
    });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(200);
  }

  const stageAfterPinch = page.getByTestId('p02-stage');
  const scaleAfter = Number(await stageAfterPinch.getAttribute('data-view-scale'));
  expect(scaleAfter).toBeGreaterThan(scaleBefore * 1.15);
  expect(await stageAfterPinch.getAttribute('data-initial-start-x')).toBe(startAfterDrag);
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);

  // A two-finger gesture that starts on a control handle must cancel the edit
  // rather than moving the entry point under the user's other finger.
  const handleAfter = page.getByTestId('p02-start-handle-hit');
  const handleAfterBox = await handleAfter.boundingBox();
  expect(handleAfterBox).not.toBeNull();
  if (handleAfterBox) {
    const startAfterConflict = await stageAfterPinch.getAttribute('data-initial-start-x');
    const x = handleAfterBox.x + handleAfterBox.width / 2;
    const y = handleAfterBox.y + handleAfterBox.height / 2;
    const otherX = Math.min(stageBox ? stageBox.x + stageBox.width - 60 : x + 180, x + 190);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [
        { x, y, id: 3 },
        { x: otherX, y: y + 40, id: 4 },
      ],
    });
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        { x: x - 45, y: y + 15, id: 3 },
        { x: otherX + 45, y: y + 15, id: 4 },
      ],
    });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(200);
    expect(await stageAfterPinch.getAttribute('data-initial-start-x')).toBe(startAfterConflict);
    expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);
  }

  expect(errors, errors.join(' | ')).toEqual([]);
  await context.close();
});

test('P02 parameter edits while playing recompute at t=0 and keep playing without pressing play again', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/particle/uniform-b');
  await page.getByTestId('p02-stage-svg').waitFor();
  await page.getByRole('tab', { name: /参数/ }).click();
  await page.getByTestId('play-toggle').click();
  await page.waitForTimeout(450);
  const sim = page.locator('.sim-page');
  await expect(sim).toHaveAttribute('data-sim-playing', 'true');

  const bInput = page.getByLabel('磁感应强度 |B|数值（T）');
  await bInput.fill('0.9');
  await bInput.blur();
  await expect(sim).toHaveAttribute('data-sim-playing', 'true');
  await expect(page.getByTestId('p02-condition-notice')).toContainText('场条件改变');

  // No second play-button click: the clock must keep advancing from the new t=0.
  await page.waitForTimeout(450);
  expect(Number(await page.getByTestId('timeline').inputValue())).toBeGreaterThan(0);
  await page.getByRole('tab', { name: /数据/ }).click();
  await expect(page.getByTestId('p02-radius')).toContainText('13.9 cm');
  expect(errors, errors.join(' | ')).toEqual([]);
});

test('P02 parameter edits while paused stay paused at t=0', async ({ page }) => {
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/particle/uniform-b');
  await page.getByTestId('p02-stage-svg').waitFor();
  await page.getByRole('tab', { name: /参数/ }).click();

  const sim = page.locator('.sim-page');
  await expect(sim).toHaveAttribute('data-sim-playing', 'false');
  const bInput = page.getByLabel('磁感应强度 |B|数值（T）');
  await bInput.fill('0.8');
  await bInput.blur();
  await expect(sim).toHaveAttribute('data-sim-playing', 'false');
  await expect(page.getByTestId('p02-condition-notice')).toContainText('场条件改变');
  expect(Number(await page.getByTestId('timeline').inputValue())).toBe(0);
});
