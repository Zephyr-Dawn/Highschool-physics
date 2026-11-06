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

async function setTimeline(page: Page, value: number | 'max') {
  await page.getByTestId('timeline').evaluate((element, next) => {
    const input = element as HTMLInputElement;
    const target = next === 'max' ? input.max : String(next);
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, target);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
  await page.waitForTimeout(180);
}

async function stageState(page: Page) {
  return page.getByTestId('p07-stage').evaluate((element) => {
    const names = [
      'data-selected-outcome',
      'data-selected-final-outcome',
      'data-selected-tau',
      'data-detection-y',
      'data-global-hit-time',
      'data-absorption-slit',
      'data-screen-crossing-y',
      'data-selector-matched',
      'data-particle-count',
      'data-screen-x',
      'data-entrance-aperture',
      'data-exit-aperture',
      'data-view-scale',
    ];
    return Object.fromEntries(names.map((name) => [name, element.getAttribute(name)]));
  });
}

async function particleState(page: Page, label: string) {
  return page.getByTestId(`p07-particle-${label}`).evaluate((element) => {
    const names = [
      'data-outcome',
      'data-final-outcome',
      'data-region',
      'data-launch-time',
      'data-tau',
      'data-x',
      'data-y',
      'data-detection-y',
      'data-global-hit-time',
      'data-absorption-slit',
      'data-absorption-time',
      'data-screen-crossing-y',
      'data-speed',
      'data-kinetic-j',
      'data-start-x',
      'data-start-y',
      'data-selector-matched',
    ];
    return Object.fromEntries(names.map((name) => [name, element.getAttribute(name)]));
  });
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

test('P07 standard beamline passes both slits and detects the analytic screen spot', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/particle/beamline?preset=p07-standard');
  await page.getByTestId('p07-stage-svg').waitFor();
  const initial = await stageState(page);
  expect(initial['data-selected-final-outcome']).toBe('screen-hit');
  expect(Number(initial['data-detection-y'])).toBeCloseTo(1.0893164, 6);
  expect(Number(initial['data-global-hit-time'])).toBeCloseTo(3.6782993, 5);
  expect(initial['data-selector-matched']).toBe('true');
  expect(initial['data-entrance-aperture']).toBe('0.1200');
  expect(initial['data-exit-aperture']).toBe('0.1200');
  expect(await page.getByTestId('p07-detection-A').count()).toBe(0);
  await page.screenshot({ path: path.resolve('docs/screenshots/p07-standard.png') });

  await setTimeline(page, 'max');
  const final = await stageState(page);
  expect(final['data-selected-outcome']).toBe('screen-hit');
  expect(Number(final['data-selected-tau'])).toBeCloseTo(3.6782993, 5);
  await expect(page.getByTestId('p07-detection-A')).toBeVisible();
  const a = await particleState(page, 'A');
  expect(a['data-outcome']).toBe('screen-hit');
  expect(Number(a['data-x'])).toBeCloseTo(5, 6);
  expect(Number(a['data-y'])).toBeCloseTo(1.0893164, 6);

  await page.getByRole('tab', { name: /数据/ }).click();
  await expect(page.getByTestId('p07-detection-table')).toBeVisible();
  await expect(page.getByTestId('p07-row-A')).toHaveAttribute('data-final-outcome', 'screen-hit');
  await expect(page.getByTestId('p07-event-list')).toContainText('入口狭缝');
  await expect(page.getByTestId('p07-event-list')).toContainText('出口狭缝');
  await expect(page.getByTestId('p07-event-list')).toContainText('被探测');
  await expect(page.getByTestId('p07-detection-y')).toContainText('1.089');
  await expect(page.getByTestId('p07-global-hit')).toContainText('3.68');
  await page.screenshot({ path: path.resolve('docs/screenshots/p07-screen-hit-data.png') });
  expect(errors, errors.join(' | ')).toEqual([]);
});

test('P07 real slits, plates and screen window produce distinct terminal outcomes', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1194, height: 834 });

  await page.goto('/#/particle/beamline?preset=p07-slow');
  await page.getByTestId('p07-stage').waitFor();
  expect((await stageState(page))['data-selected-final-outcome']).toBe('absorbed');
  expect(await page.getByTestId('p07-absorb-A').count()).toBe(0);
  await setTimeline(page, 'max');
  await expect(page.getByTestId('p07-absorb-A')).toBeVisible();
  let state = await particleState(page, 'A');
  expect(state['data-outcome']).toBe('absorbed');
  expect(state['data-absorption-slit']).toBe('exit');
  expect(Number(state['data-y'])).toBeLessThan(-0.12);
  expect(await page.getByTestId('p07-detection-A').count()).toBe(0);
  await page.screenshot({ path: path.resolve('docs/screenshots/p07-slow-absorbed.png') });

  await page.goto('/#/particle/beamline?preset=p07-offset-entry');
  await page.getByTestId('p07-stage').waitFor();
  await setTimeline(page, 'max');
  state = await particleState(page, 'A');
  expect(state['data-absorption-slit']).toBe('entrance');
  expect(Number(state['data-y'])).toBeCloseTo(0.2, 6);

  await page.goto('/#/particle/beamline?preset=p07-screen-miss');
  await page.getByTestId('p07-stage').waitFor();
  expect((await stageState(page))['data-selected-final-outcome']).toBe('screen-outside');
  await setTimeline(page, 'max');
  await expect(page.getByTestId('p07-outside-A')).toBeVisible();
  expect(Number((await particleState(page, 'A'))['data-screen-crossing-y'])).toBeCloseTo(1.0893164, 6);
  expect(await page.getByTestId('p07-detection-A').count()).toBe(0);
  await page.screenshot({ path: path.resolve('docs/screenshots/p07-screen-outside.png') });

  await page.goto('/#/particle/beamline?preset=p07-negative');
  await page.getByTestId('p07-stage').waitFor();
  await setTimeline(page, 'max');
  state = await particleState(page, 'A');
  expect(state['data-final-outcome']).toBe('screen-hit');
  expect(Number(state['data-detection-y'])).toBeCloseTo(-1.0893164, 6);
  expect(state['data-selector-matched']).toBe('true');

  await page.goto('/#/particle/beamline?preset=p07-reverse-analyzer');
  await page.getByTestId('p07-stage').waitFor();
  await setTimeline(page, 'max');
  state = await particleState(page, 'A');
  expect(state['data-final-outcome']).toBe('screen-outside');
  expect(Number(state['data-screen-crossing-y'])).toBeCloseTo(-1.7559831, 6);
  await page.screenshot({ path: path.resolve('docs/screenshots/p07-reverse-analyzer.png') });
  expect(errors, errors.join(' | ')).toEqual([]);
});

test('P07 multi-particle arrival table separates same spot from same global time', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/particle/beamline?preset=p07-arrival');
  await page.getByTestId('p07-stage').waitFor();
  await page.getByRole('tab', { name: /数据/ }).click();
  await setTimeline(page, 'max');
  const a = await page.getByTestId('p07-arrival-A').evaluate((element) => ({
    time: Number(element.getAttribute('data-time')),
    delta: Number(element.getAttribute('data-delta')),
  }));
  const b = await page.getByTestId('p07-arrival-B').evaluate((element) => ({
    time: Number(element.getAttribute('data-time')),
    delta: Number(element.getAttribute('data-delta')),
  }));
  expect(a.time).toBeCloseTo(3.6782993, 5);
  expect(b.time).toBeCloseTo(4.0782993, 5);
  expect(b.time - a.time).toBeCloseTo(0.4, 5);
  expect(b.delta).toBeCloseTo(0.4, 5);
  await expect(page.getByTestId('p07-same-time-table')).toBeVisible();
  await expect(page.getByTestId('p07-row-A')).toHaveAttribute('data-final-outcome', 'screen-hit');
  await expect(page.getByTestId('p07-row-B')).toHaveAttribute('data-final-outcome', 'screen-hit');
  await page.screenshot({ path: path.resolve('docs/screenshots/p07-arrival-comparison.png') });

  await page.goto('/#/particle/beamline?preset=p07-multi');
  await page.getByTestId('p07-stage').waitFor();
  await page.getByRole('tab', { name: /数据/ }).click();
  await setTimeline(page, 'max');
  await expect(page.getByTestId('p07-row-B')).toHaveAttribute('data-final-outcome', 'absorbed');
  await expect(page.getByTestId('p07-row-C')).toHaveAttribute('data-final-outcome', 'screen-hit');
  await page.screenshot({ path: path.resolve('docs/screenshots/p07-multi-final.png') });
  expect(errors, errors.join(' | ')).toEqual([]);
});

test('P07 live edit of A keeps B/C launch times and motion untouched', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/particle/beamline?preset=p07-multi');
  await page.getByTestId('p07-stage').waitFor();
  await expect(page.getByTestId('p07-stage')).toHaveAttribute('data-particle-count', '3');
  const sim = page.locator('.sim-page');
  await page.getByTestId('particle-chip-p1').click();
  await page.getByTestId('play-toggle').click();
  await page.waitForTimeout(760);
  await expect(sim).toHaveAttribute('data-sim-playing', 'true');
  const bBefore = await particleState(page, 'B');
  const cBefore = await particleState(page, 'C');
  const aStartBefore = await page.getByTestId('p07-stage').getAttribute('data-selected-start-x');
  expect(Number(bBefore['data-tau'])).toBeGreaterThan(0);

  await dragHandle(page, 'p07-start-handle-hit', 45, 22, {
    afterDown: async () => {
      await expect(sim).toHaveAttribute('data-sim-editing', 'true');
      await expect(sim).toHaveAttribute('data-sim-playing', 'true');
      await expect(page.getByTestId('p07-preview-path')).toBeVisible();
      await expect(page.getByTestId('p07-condition-notice')).toContainText('其他粒子继续运动');
    },
    beforeUp: async () => {
      const bDuring = await particleState(page, 'B');
      const cDuring = await particleState(page, 'C');
      expect(bDuring['data-launch-time']).toBe(bBefore['data-launch-time']);
      expect(cDuring['data-launch-time']).toBe(cBefore['data-launch-time']);
      expect(Number(bDuring['data-x'])).not.toBeCloseTo(Number(bBefore['data-x']), 6);
    },
  });
  await page.waitForTimeout(180);
  const aAfter = await particleState(page, 'A');
  const bAfter = await particleState(page, 'B');
  const cAfter = await particleState(page, 'C');
  expect(Number(aAfter['data-launch-time'])).toBeGreaterThan(0);
  expect(bAfter['data-launch-time']).toBe(bBefore['data-launch-time']);
  expect(cAfter['data-launch-time']).toBe(cBefore['data-launch-time']);
  expect(await page.getByTestId('p07-stage').getAttribute('data-selected-start-x')).not.toBe(aStartBefore);
  await page.screenshot({ path: path.resolve('docs/screenshots/p07-live-edit.png') });
  expect(errors, errors.join(' | ')).toEqual([]);
});

test('P07 shared apparatus change rebuilds all particles and clears old detections', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/particle/beamline?preset=p07-multi');
  await page.getByTestId('p07-stage').waitFor();
  await setTimeline(page, 'max');
  await expect(page.getByTestId('p07-detection-A')).toBeVisible();
  await expect(page.getByTestId('p07-detection-C')).toBeVisible();
  expect(Number((await particleState(page, 'B'))['data-launch-time'])).toBeCloseTo(0.3, 6);

  await page.getByRole('tab', { name: /参数/ }).click();
  const analyzerBz = page.getByLabel('磁分析区 B_z数值（T）');
  await analyzerBz.fill('1.2');
  await analyzerBz.blur();
  await page.waitForTimeout(320);
  await expect(page.locator('.sim-page')).toHaveAttribute('data-sim-time', '0');
  await expect(page.getByTestId('p07-condition-notice')).toContainText('公共场或器件改变');
  for (const label of ['A', 'B', 'C']) {
    expect((await particleState(page, label))['data-launch-time']).toBe('0');
  }
  expect(await page.getByTestId('p07-detection-A').count()).toBe(0);
  expect(await page.getByTestId('p07-detection-C').count()).toBe(0);
  await page.screenshot({ path: path.resolve('docs/screenshots/p07-shared-reset.png') });
  expect(errors, errors.join(' | ')).toEqual([]);
});

test('P07 touch pinch, teacher layers and portrait layout remain usable', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1194, height: 834 }, hasTouch: true });
  const page = await context.newPage();
  const errors = collectErrors(page);
  await page.goto('/#/particle/beamline?preset=p07-multi');
  await page.getByTestId('p07-stage').waitFor();
  await setTimeline(page, 2.2);
  const beforeStart = (await particleState(page, 'A'))['data-start-x'];
  const beforeScale = Number((await stageState(page))['data-view-scale']);
  const box = await page.getByTestId('p07-stage-svg').boundingBox();
  expect(box).not.toBeNull();
  if (box) {
    const cdp = await context.newCDPSession(page);
    const y = box.y + box.height * 0.86;
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [
        { x: box.x + box.width * 0.2, y, id: 1 },
        { x: box.x + box.width * 0.8, y, id: 2 },
      ],
    });
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        { x: box.x + box.width * 0.12, y, id: 1 },
        { x: box.x + box.width * 0.88, y, id: 2 },
      ],
    });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }
  await page.waitForTimeout(220);
  expect(Number((await stageState(page))['data-view-scale'])).toBeGreaterThan(beforeScale * 1.1);
  expect((await particleState(page, 'A'))['data-start-x']).toBe(beforeStart);

  await page.getByRole('button', { name: '教师视图', exact: true }).click();
  await expect(page.locator('.teacher-layer-bar')).toBeVisible();
  const bar = page.locator('.teacher-layer-bar');
  for (const name of ['F_E', 'F_B', '合力']) {
    const chip = bar.getByRole('button', { name, exact: true });
    await expect(chip).toHaveAttribute('aria-pressed', 'true');
    await chip.click();
    await expect(chip).toHaveAttribute('aria-pressed', 'false');
    await chip.click();
  }
  await bar.getByRole('button', { name: '全部矢量', exact: true }).click();
  await page.screenshot({ path: path.resolve('docs/screenshots/p07-teacher.png') });
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.waitForTimeout(260);
  await expectNoHorizontalOverflow(page);
  await expect(page.getByTestId('p07-stage-svg')).toBeVisible();
  await page.screenshot({ path: path.resolve('docs/screenshots/p07-portrait.png') });
  expect(errors, errors.join(' | ')).toEqual([]);
  await context.close();
});

test('P07 scene export and import preserve the apparatus safely', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/particle/beamline?preset=p07-standard');
  await page.getByTestId('p07-stage-svg').waitFor();

  await page.getByRole('tab', { name: /参数/ }).click();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('emplab.p07.scene.v2') ?? 'null'));
  expect(stored).not.toBeNull();
  stored.field.screen.x = 6;
  stored.field.screen.yMin = -1;
  stored.field.screen.yMax = 2;
  await page.getByTestId('p07-scene-import').setInputFiles({
    name: 'p07-scene.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(stored)),
  });
  await expect(page.getByTestId('p07-stage')).toHaveAttribute('data-screen-x', '6.0000');
  await expect(page.getByTestId('p07-stage')).toHaveAttribute('data-particle-count', '1');

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /导出场景 JSON/ }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('p07-scene.json');
  await page.screenshot({ path: path.resolve('docs/screenshots/p07-scene-io.png') });
  expect(errors, errors.join(' | ')).toEqual([]);
});

test('P07 practice link opens the standard preset and keeps the answer after reload', async ({ page }) => {
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/practice?q=p07-01');
  const card = page.locator('#question-p07-01');
  await card.waitFor();
  await card.getByRole('radio', { name: /2\.0 m\/s/ }).click();
  await card.getByTestId('check-p07-01').click();
  await expect(card.getByText('回答正确').first()).toBeVisible();
  await card.getByRole('link', { name: /进入实验验证/ }).click();
  await expect(page).toHaveURL(/particle\/beamline\?preset=p07-standard/);
  await page.getByTestId('p07-stage').waitFor();
  expect((await stageState(page))['data-selected-final-outcome']).toBe('screen-hit');
  await page.screenshot({ path: path.resolve('docs/screenshots/p07-practice-link.png') });
  await page.goBack();
  await page.reload();
  await expect(page.locator('#question-p07-01').getByRole('radio', { name: /2\.0 m\/s/ })).toHaveAttribute('aria-checked', 'true');
});
