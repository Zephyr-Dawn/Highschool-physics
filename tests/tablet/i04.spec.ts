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

test('I04 waveform data, shared charts and explicit triangle kinks', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/induction/time-varying-field');
  await page.getByTestId('i04-stage-svg').waitFor();
  const stage = page.getByTestId('i04-stage');
  await expect(stage).toHaveAttribute('data-mode', 'waveform');
  expect(Number(await stage.getAttribute('data-bz'))).toBeCloseTo(0.2, 9);
  expect(Number(await stage.getAttribute('data-emf'))).toBeCloseTo(-0.1, 9);
  await expect(stage).toHaveAttribute('data-current-direction', 'clockwise');

  await page.getByRole('tab', { name: /数据/ }).click();
  await expect(page.getByTestId('i04-bz')).toContainText('0.2 T');
  await expect(page.getByTestId('i04-flux')).toContainText('4 mWb');
  await expect(page.getByTestId('i04-flux-linkage')).toContainText('mWb·turn');
  await expect(page.getByTestId('i04-emf')).toContainText('mV');
  await expect(page.getByTestId('i04-current')).toContainText('mA');
  await expect(page.getByTestId('i04-direction')).toContainText('顺时针');
  await expect(page.getByTestId('i04-chart-panel')).toBeVisible();
  await expect(page.getByTestId('i04-chart-panel-b')).toBeVisible();
  await expect(page.getByTestId('i04-chart-panel-emf')).toBeVisible();
  await page.screenshot({ path: path.resolve('docs/screenshots/i04-default.png') });
  await page.getByTestId('i04-chart-panel').scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.resolve('docs/screenshots/i04-charts.png') });

  await page.goto('/#/induction/time-varying-field?preset=i04-triangle');
  await page.getByTestId('i04-stage-svg').waitFor();
  await page.getByTestId('next-keyframe').click();
  await page.waitForTimeout(120);
  await expect(stage).toHaveAttribute('data-emf', 'kink');
  await page.getByRole('tab', { name: /数据/ }).click();
  await expect(page.getByTestId('i04-kink-note')).toBeVisible();
  await expect(page.getByTestId('i04-dbdt')).toContainText('折点');
  await expect(page.getByTestId('i04-direction')).toContainText('折点');
  await expect(page.getByTestId('i04-chart-panel-emf')).toContainText('折点');
  await page.screenshot({ path: path.resolve('docs/screenshots/i04-kink.png') });

  expect(errors, errors.join(' | ')).toEqual([]);
});

test('I04 waveform edits during playback restart from the new configuration and keep playing', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/induction/time-varying-field');
  await page.getByTestId('i04-stage-svg').waitFor();
  const sim = page.locator('.sim-page');
  const stage = page.getByTestId('i04-stage');
  await page.getByRole('button', { name: '0.25×' }).click();
  await page.getByTestId('play-toggle').click();
  await page.waitForTimeout(300);
  expect(Number(await page.getByTestId('timeline').inputValue())).toBeGreaterThan(0);
  await expect(sim).toHaveAttribute('data-sim-playing', 'true');

  await page.getByRole('tab', { name: /参数/ }).click();
  const slopeRange = page.locator('.param').filter({ hasText: '变化率 k = dB/dt' }).locator('input[type="range"]');
  await slopeRange.scrollIntoViewIfNeeded();
  const rangeBox = await slopeRange.boundingBox();
  expect(rangeBox).not.toBeNull();
  if (rangeBox) {
    await page.mouse.move(rangeBox.x + rangeBox.width * 0.8, rangeBox.y + rangeBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(rangeBox.x + rangeBox.width * 0.2, rangeBox.y + rangeBox.height / 2, { steps: 6 });
    await page.mouse.up();
  }
  await expect(sim).toHaveAttribute('data-sim-playing', 'true');
  await page.waitForTimeout(180);
  expect(Number(await page.getByTestId('timeline').inputValue())).toBeGreaterThan(0);
  await expect(stage).toHaveAttribute('data-current-direction', 'counterclockwise');

  const slopeInput = page.getByLabel(/变化率 k = dB\/dt数值/);
  await slopeInput.fill('-0.4');
  await slopeInput.blur();
  await expect(sim).toHaveAttribute('data-sim-playing', 'true');
  await page.waitForTimeout(250);
  expect(Number(await page.getByTestId('timeline').inputValue())).toBeGreaterThan(0);
  await expect(stage).toHaveAttribute('data-current-direction', 'counterclockwise');

  const turnsInput = page.getByLabel(/匝数 N数值/);
  await turnsInput.fill('20');
  await turnsInput.blur();
  await expect(sim).toHaveAttribute('data-sim-playing', 'true');
  await page.waitForTimeout(200);
  await page.getByRole('tab', { name: /数据/ }).click();
  await expect(page.getByTestId('i04-direction')).toContainText('逆时针');
  await expect(page.getByTestId('i04-flux-linkage')).toContainText('mWb·turn');
  const chartPath = await page.getByTestId('i04-chart-panel-emf').locator('path').first().getAttribute('d');
  expect(chartPath?.length ?? 0).toBeGreaterThan(50);
  await page.screenshot({ path: path.resolve('docs/screenshots/i04-waveform-edit.png') });

  expect(errors, errors.join(' | ')).toEqual([]);
});

test('I04 manual mode changes a continuous B(t) without resetting time, then settles to zero', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/induction/time-varying-field?preset=i04-manual');
  await page.getByTestId('i04-stage-svg').waitFor();
  const stage = page.getByTestId('i04-stage');
  await expect(stage).toHaveAttribute('data-mode', 'manual');
  await page.getByTestId('play-toggle').click();
  await page.waitForTimeout(350);
  const timeBefore = Number(await page.getByTestId('timeline').inputValue());
  const bBefore = Number(await stage.getAttribute('data-bz'));
  expect(timeBefore).toBeGreaterThan(0.15);

  const handle = page.getByTestId('i04-manual-handle-hit');
  const box = await handle.boundingBox();
  expect(box).not.toBeNull();
  if (!box) throw new Error('manual handle missing');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y - 88, { steps: 8 });
  await page.waitForTimeout(25);
  const bDuringUp = Number(await stage.getAttribute('data-bz'));
  const emfDuringUp = Number(await stage.getAttribute('data-emf'));
  const timeDuringUp = Number(await page.getByTestId('timeline').inputValue());
  expect(bDuringUp).toBeGreaterThan(bBefore + 0.02);
  expect(Math.abs(emfDuringUp)).toBeGreaterThan(1e-4);
  expect(timeDuringUp).toBeGreaterThan(timeBefore);
  await expect(stage).toHaveAttribute('data-current-direction', 'clockwise');
  await page.screenshot({ path: path.resolve('docs/screenshots/i04-manual.png') });

  await page.mouse.up();
  await page.waitForTimeout(450);
  await expect(page.getByTestId('i04-dbdt-value')).toHaveText('0');
  expect(Math.abs(Number(await stage.getAttribute('data-emf')))).toBeLessThan(1e-9);
  expect(Math.abs(Number(await stage.getAttribute('data-current')))).toBeLessThan(1e-9);
  const settledB = Number(await stage.getAttribute('data-bz'));

  await page.mouse.move(x, y - 70);
  await page.mouse.down();
  await page.mouse.move(x, y + 20, { steps: 7 });
  await page.waitForTimeout(25);
  const emfDuringDown = Number(await stage.getAttribute('data-emf'));
  expect(emfDuringDown).toBeGreaterThan(1e-4);
  expect(Number(await stage.getAttribute('data-bz'))).toBeLessThan(settledB - 0.01);
  await expect(stage).toHaveAttribute('data-current-direction', 'counterclockwise');
  const timeDuringDown = Number(await page.getByTestId('timeline').inputValue());
  expect(timeDuringDown).toBeGreaterThan(timeDuringUp);
  await page.mouse.up();
  await page.waitForTimeout(450);

  await page.getByTestId('play-toggle').click();
  await page.waitForTimeout(100);
  const pausedB = Number(await stage.getAttribute('data-bz'));
  const pausedTime = Number(await page.getByTestId('timeline').inputValue());
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y - 60, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(120);
  await expect(page.getByTestId('i04-manual-notice')).toContainText('暂停中不会记录');
  expect(Number(await stage.getAttribute('data-bz'))).toBeCloseTo(pausedB, 9);
  expect(Number(await page.getByTestId('timeline').inputValue())).toBeCloseTo(pausedTime, 6);

  expect(errors, errors.join(' | ')).toEqual([]);
});

test('I04 open circuit keeps EMF while current and power become zero', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/induction/time-varying-field');
  await page.getByTestId('i04-stage-svg').waitFor();
  const stage = page.getByTestId('i04-stage');
  await page.getByRole('tab', { name: /参数/ }).click();
  const closedSwitch = page.getByRole('switch', { name: /回路闭合/ });
  await expect(closedSwitch).toHaveAttribute('aria-checked', 'true');
  await closedSwitch.click();
  await expect(stage).toHaveAttribute('data-circuit-closed', 'false');
  await expect(stage).toHaveAttribute('data-current-direction', 'none');
  await page.getByRole('tab', { name: /数据/ }).click();
  await expect(page.getByTestId('i04-circuit')).toContainText('断开');
  await expect(page.getByTestId('i04-emf')).toContainText('mV');
  await expect(page.getByTestId('i04-current')).toContainText('0 A');
  await expect(page.getByTestId('i04-power')).toContainText('0 W');
  await expect(page.getByTestId('i04-direction')).toContainText('无感应电流');
  await expect(page.getByTestId('i04-circuit-gap')).toBeVisible();
  await page.screenshot({ path: path.resolve('docs/screenshots/i04-open-circuit.png') });

  expect(errors, errors.join(' | ')).toEqual([]);
});

test('I04 touch drag changes B and a two-finger pinch does not alter B or the circuit', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1024, height: 768 }, hasTouch: true });
  const page = await context.newPage();
  const errors = collectErrors(page);
  await page.goto('http://127.0.0.1:4173/#/induction/time-varying-field?preset=i04-manual');
  await page.getByTestId('i04-stage-svg').waitFor();
  const stage = page.getByTestId('i04-stage');
  await page.getByTestId('play-toggle').click();
  await page.waitForTimeout(250);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });

  const bBefore = Number(await stage.getAttribute('data-bz'));
  const scrollBefore = await page.evaluate(() => window.scrollY);
  const handleBox = await page.getByTestId('i04-manual-handle-hit').boundingBox();
  expect(handleBox).not.toBeNull();
  if (handleBox) {
    const x = handleBox.x + handleBox.width / 2;
    const y = handleBox.y + handleBox.height / 2;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - 76, id: 1 }] });
    await page.waitForTimeout(30);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }
  await page.waitForTimeout(350);
  const bAfterDrag = Number(await stage.getAttribute('data-bz'));
  expect(bAfterDrag).toBeGreaterThan(bBefore + 0.02);
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);

  const scaleBefore = Number(await stage.getAttribute('data-view-scale'));
  const stageBox = await stage.boundingBox();
  expect(stageBox).not.toBeNull();
  if (stageBox) {
    const midY = stageBox.y + stageBox.height * 0.58;
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
  }
  await page.waitForTimeout(200);
  const stageAfter = page.getByTestId('i04-stage');
  expect(Number(await stageAfter.getAttribute('data-view-scale'))).toBeGreaterThan(scaleBefore * 1.15);
  expect(Number(await stageAfter.getAttribute('data-bz'))).toBeCloseTo(bAfterDrag, 9);
  await expect(stageAfter).toHaveAttribute('data-circuit-closed', 'true');
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);
  expect(errors, errors.join(' | ')).toEqual([]);
  await context.close();
});

test('I04 teacher view exposes direction layers, formula toggles and portrait layout', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/induction/time-varying-field');
  await page.getByTestId('i04-stage-svg').waitFor();
  await page.getByRole('button', { name: /教师视图/ }).click();
  await page.waitForTimeout(250);
  await expect(page.locator('.teacher-dock')).toBeVisible();
  const layerBar = page.locator('.teacher-layer-bar');
  await expect(layerBar).toBeVisible();
  const fieldToggle = layerBar.getByRole('button', { name: '外加场', exact: true });
  await expect(fieldToggle).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('i04-field-glyph')).toBeVisible();
  await fieldToggle.click();
  await expect(fieldToggle).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByTestId('i04-field-glyph')).toHaveCount(0);
  await fieldToggle.click();
  const formulaToggle = layerBar.getByRole('button', { name: '公式', exact: true });
  await formulaToggle.click();
  await expect(page.locator('.teacher-dock .teacher-formula')).toHaveCount(0);
  await page.screenshot({ path: path.resolve('docs/screenshots/i04-teacher-layers.png') });
  await formulaToggle.click();
  await expect(page.locator('.teacher-dock .teacher-formula')).toBeVisible();
  await page.screenshot({ path: path.resolve('docs/screenshots/i04-teacher.png') });

  await page.setViewportSize({ width: 768, height: 1024 });
  await page.waitForTimeout(250);
  const metrics = await page.evaluate(() => ({
    width: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.width + 1);
  await expect(page.getByTestId('i04-stage-svg')).toBeVisible();
  await expect(layerBar).toBeVisible();
  await page.screenshot({ path: path.resolve('docs/screenshots/i04-teacher-768x1024.png') });
  expect(errors, errors.join(' | ')).toEqual([]);
});

test('I04 question links to the sine peak experiment and persists after return', async ({ page }) => {
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/practice?q=i04-04');
  const card = page.locator('#question-i04-04');
  await card.waitFor();
  await card.getByRole('radio', { name: /ε = 0，I = 0/ }).click();
  await card.getByTestId('check-i04-04').click();
  await expect(card.getByText('回答正确').first()).toBeVisible();
  await card.getByRole('link', { name: /进入实验验证/ }).click();
  await expect(page).toHaveURL(/induction\/time-varying-field\?preset=i04-sine-peak/);
  await expect(page.getByTestId('i04-stage')).toHaveAttribute('data-emf', '0');
  await page.goBack();
  await expect(card.getByRole('radio', { name: /ε = 0，I = 0/ })).toHaveAttribute('aria-checked', 'true');
  await page.reload();
  await expect(page.locator('#question-i04-04').getByRole('radio', { name: /ε = 0，I = 0/ })).toHaveAttribute('aria-checked', 'true');
});
