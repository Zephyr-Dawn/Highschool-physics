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
  return page.getByTestId('i05-stage').evaluate((element) => {
    const names = [
      'data-mode',
      'data-x',
      'data-v',
      'data-bz',
      'data-emf-total',
      'data-emf-transformer',
      'data-emf-motional',
      'data-current',
      'data-force',
      'data-overlap',
      'data-status',
      'data-kinetic',
      'data-heat',
      'data-residual',
      'data-history-count',
    ];
    return Object.fromEntries(names.map((name) => [name, element.getAttribute(name)]));
  });
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
  await page.waitForTimeout(220);
}

async function dragBy(page: Page, testId: string, dx: number) {
  const handle = page.getByTestId(testId);
  const box = await handle.boundingBox();
  expect(box, `missing ${testId}`).not.toBeNull();
  if (!box) return;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.waitForTimeout(120);
  await page.mouse.move(x + dx, y, { steps: 8 });
  await page.waitForTimeout(120);
  await page.mouse.up();
}

test('I05 M1: static-field entering loop shows motional EMF, current and force', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/induction/coupled-loop?preset=i05-static-entry');
  await page.getByTestId('i05-stage-svg').waitFor();
  const initial = await stageState(page);
  expect(initial['data-mode']).toBe('prescribed');
  expect(Number(initial['data-emf-transformer'])).toBeCloseTo(0, 10);
  expect(Math.abs(Number(initial['data-emf-motional']))).toBeGreaterThan(0.5);
  expect(Math.abs(Number(initial['data-current']))).toBeGreaterThan(0.2);
  expect(Math.abs(Number(initial['data-force']))).toBeGreaterThan(0.2);

  await page.getByRole('tab', { name: /数据与图像/ }).click();
  await expect(page.getByTestId('i05-emf-t')).toBeVisible();
  await expect(page.getByTestId('i05-emf-m')).toBeVisible();
  await expect(page.getByTestId('i05-emf-total')).toBeVisible();
  await expect(page.getByTestId('i05-current')).toBeVisible();
  await expect(page.getByTestId('i05-charts')).toBeVisible();
  await page.screenshot({ path: path.resolve('docs/screenshots/i05-static-entry.png') });
  expect(errors, errors.join(' | ')).toEqual([]);
});

test('I05 math expression: √2 T and an out-of-slider 5 T are used without clamping', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/induction/coupled-loop?preset=i05-static-entry');
  await page.getByTestId('i05-stage-svg').waitFor();
  await page.getByRole('tab', { name: /参数/ }).click();
  const input = page.getByLabel('偏置 B₀数值（T）');
  await input.fill('√2');
  await input.blur();
  await expect(input).toHaveValue('√2');
  await expect.poll(async () => Number((await stageState(page))['data-bz'])).toBeCloseTo(Math.SQRT2, 5);
  await input.fill('5');
  await input.blur();
  await expect(input).toHaveValue('5');
  await expect.poll(async () => Number((await stageState(page))['data-bz'])).toBeCloseTo(5, 6);
  const root = page.locator('.param.is-overflow').filter({ has: input }).first();
  await expect(root).toHaveAttribute('data-out-of-range', 'true');
  await page.screenshot({ path: path.resolve('docs/screenshots/i05-expression-overflow.png') });
  expect(errors, errors.join(' | ')).toEqual([]);
});

test('I05 M2: static-B free damping matches the analytic reference and keeps energy residual small', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/induction/coupled-loop?preset=i05-free-damping');
  await page.getByTestId('i05-stage-svg').waitFor();
  await setTimeline(page, 0.5);
  const state = await stageState(page);
  expect(Number(state['data-v'])).toBeCloseTo(Math.exp(-1), 3);
  expect(Number(state['data-v'])).toBeGreaterThan(0);
  expect(Number(state['data-x'])).toBeCloseTo(-0.5 + (1 - Math.exp(-1)) / 2, 2);
  expect(Number(state['data-heat'])).toBeGreaterThan(0);
  expect(Math.abs(Number(state['data-residual']))).toBeLessThan(1e-4);
  await page.getByRole('tab', { name: /数据与图像/ }).click();
  await expect(page.getByTestId('i05-energy-residual')).toContainText('J');
  await page.screenshot({ path: path.resolve('docs/screenshots/i05-free-damping.png') });
  expect(errors, errors.join(' | ')).toEqual([]);
});

test('I05 M3: manual B target ramps continuously and pause rejects new events', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/induction/coupled-loop?preset=i05-manual-b');
  await page.getByTestId('i05-stage-svg').waitFor();
  await page.getByTestId('play-toggle').click();
  await page.waitForTimeout(300);
  await page.getByRole('tab', { name: /参数/ }).click();
  const input = page.getByLabel('实时目标 B数值（T）');
  await input.fill('√2');
  await input.blur();
  await expect(input).toHaveValue('√2');
  await expect.poll(async () => Number((await stageState(page))['data-bz']), { timeout: 4000 }).toBeCloseTo(Math.SQRT2, 2);
  const time = Number(await page.getByTestId('timeline').inputValue());
  expect(time).toBeGreaterThan(0.2);
  await page.screenshot({ path: path.resolve('docs/screenshots/i05-manual-b.png') });

  await page.getByTestId('play-toggle').click();
  await input.fill('5');
  await input.blur();
  await expect(input).toHaveValue('5');
  await expect(page.getByTestId('i05-condition-notice')).toContainText('暂停中不会记录手动调磁');
  expect(errors, errors.join(' | ')).toEqual([]);
});

test('I05 M4: dragging the loop produces signed current/history without resetting the clock', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/induction/coupled-loop?preset=i05-manual-x');
  await page.getByTestId('i05-stage-svg').waitFor();
  await page.getByTestId('play-toggle').click();
  await page.waitForTimeout(250);
  const before = await stageState(page);
  await dragBy(page, 'i05-manual-handle-hit', 100);
  expect(Number((await stageState(page))['data-x'])).not.toBeCloseTo(Number(before['data-x']), 3);
  expect(Number(await page.getByTestId('timeline').inputValue())).toBeGreaterThan(0.15);
  const after = await stageState(page);
  expect(Number(after['data-history-count'])).toBeGreaterThan(2);
  expect(Number(after['data-heat'])).toBeGreaterThan(0);
  await page.screenshot({ path: path.resolve('docs/screenshots/i05-manual-x.png') });
  expect(errors, errors.join(' | ')).toEqual([]);
});

test('I05 open circuit keeps EMF but suppresses current, force and heat', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/induction/coupled-loop?preset=i05-open');
  await page.getByTestId('i05-stage-svg').waitFor();
  const state = await stageState(page);
  expect(Math.abs(Number(state['data-emf-total']))).toBeGreaterThan(0.5);
  expect(Number(state['data-current'])).toBe(0);
  expect(Number(state['data-force'])).toBe(0);
  expect(Number(state['data-heat'])).toBe(0);
  await page.screenshot({ path: path.resolve('docs/screenshots/i05-open.png') });
  expect(errors, errors.join(' | ')).toEqual([]);
});

test('I05 tablet portrait and corrupt scene import stay usable', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto('/#/induction/coupled-loop?preset=i05-cancel');
  await page.getByTestId('i05-stage-svg').waitFor();
  await expectNoHorizontalOverflow(page);
  await page.getByRole('tab', { name: /参数/ }).click();
  await page.getByTestId('i05-scene-import').setInputFiles({
    name: 'bad-i05.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"schemaVersion":2,"model":"i05","params":{"massKg":0}}'),
  });
  await expect(page.getByTestId('i05-condition-notice')).toContainText('导入失败');
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: path.resolve('docs/screenshots/i05-portrait.png') });
  expect(errors, errors.join(' | ')).toEqual([]);
});

test('I05 touch: a second finger cancels manual loop drag without a velocity spike', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1194, height: 834 }, hasTouch: true });
  const page = await context.newPage();
  const errors = collectErrors(page);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await page.goto('/#/induction/coupled-loop?preset=i05-manual-x');
  await page.getByTestId('i05-stage-svg').waitFor();
  await page.getByTestId('play-toggle').click();
  await page.waitForTimeout(220);
  const handle = await page.getByTestId('i05-manual-handle-hit').boundingBox();
  expect(handle).not.toBeNull();
  if (handle) {
    const x = handle.x + handle.width / 2;
    const y = handle.y + handle.height / 2;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
    for (let step = 1; step <= 5; step++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + (80 * step) / 5, y, id: 1 }] });
      await page.waitForTimeout(55);
    }
    await page.waitForTimeout(50);
    expect(await page.getByTestId('i05-stage').getAttribute('data-manual-dragging')).toBe('true');
    const during = await stageState(page);
    expect(Number.isFinite(Number(during['data-x']))).toBe(true);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: x + 80, y, id: 1 }, { x: x + 240, y: y - 90, id: 2 }],
    });
    await page.waitForTimeout(120);
    const canceled = await stageState(page);
    expect(await page.getByTestId('i05-stage').getAttribute('data-manual-dragging')).toBe('false');
    expect(Number.isFinite(Number(canceled['data-x']))).toBe(true);
    expect(Number(canceled['data-v'])).toBe(0);
    await page.screenshot({ path: path.resolve('docs/screenshots/i05-touch-cancel.png') });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }
  expect(errors, errors.join(' | ')).toEqual([]);
  await context.close();
});

test('I05 practice link opens the verified preset and returns to the question', async ({ page }) => {
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/practice?q=i05-01');
  await expect(page.getByText('线框进入磁场时的电流方向')).toBeVisible();
  await page.locator('#question-i05-01').getByRole('link', { name: /进入实验验证/ }).click();
  await expect(page).toHaveURL(/\/induction\/coupled-loop\?preset=i05-static-entry/);
  await expect(page.getByTestId('i05-stage-svg')).toBeVisible();
  await page.goBack();
  await expect(page.getByText('线框进入磁场时的电流方向')).toBeVisible();
});
