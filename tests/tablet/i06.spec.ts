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
  return page.getByTestId('i06-stage').evaluate((element) => {
    const names = [
      'data-mode',
      'data-x1',
      'data-x2',
      'data-v1',
      'data-v2',
      'data-emf',
      'data-current',
      'data-force1',
      'data-force2',
      'data-separation',
      'data-status',
      'data-contact',
      'data-relative-v',
      'data-vcm',
      'data-momentum',
      'data-kinetic',
      'data-heat',
      'data-ext-work',
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


test('I06 D1: free rods converge, momentum conserved and K+Q_J constant', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/induction/dual-rods?preset=i06-free-symmetric');
  await page.getByTestId('i06-stage-svg').waitFor();
  await setTimeline(page, 1);
  const state = await stageState(page);
  expect(Number(state['data-v1'])).toBeCloseTo(1 - Math.exp(-1), 3);
  expect(Number(state['data-v2'])).toBeCloseTo(1 + Math.exp(-1), 3);
  expect(Number(state['data-separation'])).toBeGreaterThan(3);
  expect(Number(state['data-momentum'])).toBeCloseTo(2, 4);
  expect(Number(state['data-kinetic'])).toBeCloseTo(1 + Math.exp(-2), 4);
  expect(Number(state['data-heat'])).toBeCloseTo(1 - Math.exp(-2), 4);
  expect(Math.abs(Number(state['data-residual']))).toBeLessThan(1e-6);
  await page.getByRole('tab', { name: /数据与图像/ }).click();
  await expect(page.getByTestId('i06-charts')).toBeVisible();
  await expect(page.getByTestId('i06-energy-residual')).toBeVisible();
  await page.screenshot({ path: path.resolve('docs/screenshots/i06-free-rods.png') });
  expect(errors, errors.join(' | ')).toEqual([]);
});

test('I06 same-speed control: no current, no magnetic force and no fake braking', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/induction/dual-rods?preset=i06-same-speed');
  await page.getByTestId('i06-stage-svg').waitFor();
  const initial = await stageState(page);
  expect(Number(initial['data-current'])).toBe(0);
  expect(Number(initial['data-force1'])).toBe(0);
  expect(Number(initial['data-force2'])).toBe(0);
  await setTimeline(page, 1);
  const after = await stageState(page);
  expect(Number(after['data-x1'])).toBeCloseTo(3, 5);
  expect(Number(after['data-x2'])).toBeCloseTo(6, 5);
  expect(Number(after['data-separation'])).toBeCloseTo(3, 5);
  expect(Number(after['data-current'])).toBe(0);
  await page.screenshot({ path: path.resolve('docs/screenshots/i06-same-speed.png') });
  expect(errors, errors.join(' | ')).toEqual([]);
});

test('I06 contact: analytic stop at ln2 without crossing or collision heat', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/induction/dual-rods?preset=i06-contact');
  await page.getByTestId('i06-stage-svg').waitFor();
  const duration = Number(await page.getByTestId('timeline').getAttribute('max'));
  expect(duration).toBeCloseTo(Math.log(2), 4);
  await setTimeline(page, 'max');
  const state = await stageState(page);
  expect(state['data-status']).toBe('contact-stop');
  expect(state['data-contact']).toBe('true');
  expect(Number(state['data-separation'])).toBeGreaterThanOrEqual(-1e-9);
  expect(Number(state['data-x2'])).toBeGreaterThanOrEqual(Number(state['data-x1']));
  await page.getByRole('tab', { name: /数据与图像/ }).click();
  await expect(page.getByTestId('i06-event-list')).toContainText('接触');
  await page.screenshot({ path: path.resolve('docs/screenshots/i06-contact.png') });
  expect(errors, errors.join(' | ')).toEqual([]);
});

test('I06 D2: opposite external forces keep momentum zero and satisfy the energy ledger', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/induction/dual-rods?preset=i06-opposed-forces');
  await page.getByTestId('i06-stage-svg').waitFor();
  await setTimeline(page, 1);
  const state = await stageState(page);
  expect(Number(state['data-v1'])).toBeCloseTo(1 - Math.exp(-1), 3);
  expect(Number(state['data-v2'])).toBeCloseTo(-(1 - Math.exp(-1)), 3);
  expect(Number(state['data-momentum'])).toBeCloseTo(0, 6);
  expect(Number(state['data-ext-work'])).toBeCloseTo(2 * Math.exp(-1), 4);
  expect(Number(state['data-heat'])).toBeGreaterThan(0);
  expect(Math.abs(Number(state['data-residual']))).toBeLessThan(1e-6);
  await page.screenshot({ path: path.resolve('docs/screenshots/i06-forces.png') });
  expect(errors, errors.join(' | ')).toEqual([]);
});

test('I06 open circuit: EMF exists while current, forces and heat vanish', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/induction/dual-rods?preset=i06-open');
  await page.getByTestId('i06-stage-svg').waitFor();
  const state = await stageState(page);
  expect(Math.abs(Number(state['data-emf']))).toBeGreaterThan(0.5);
  expect(Number(state['data-current'])).toBe(0);
  expect(Number(state['data-force1'])).toBe(0);
  expect(Number(state['data-force2'])).toBe(0);
  expect(Number(state['data-heat'])).toBe(0);
  await page.screenshot({ path: path.resolve('docs/screenshots/i06-open.png') });
  expect(errors, errors.join(' | ')).toEqual([]);
});

test('I06 math expression: R = 1/3 Ω is used without slider clamping', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/induction/dual-rods?preset=i06-free-symmetric');
  await page.getByTestId('i06-stage-svg').waitFor();
  await page.getByRole('tab', { name: /参数/ }).click();
  const input = page.getByLabel('回路总电阻 R数值（Ω）');
  await input.fill('1/3');
  await input.blur();
  await expect(input).toHaveValue('1/3');
  await expect.poll(async () => Number((await stageState(page))['data-current'])).toBeCloseTo(-6, 5);
  await page.screenshot({ path: path.resolve('docs/screenshots/i06-expression-r.png') });
  expect(errors, errors.join(' | ')).toEqual([]);
});

test('I06 D4: hand dragging rod 1 keeps rod 2 clamped and produces one shared current', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/induction/dual-rods?preset=i06-manual-rod1');
  await page.getByTestId('i06-stage-svg').waitFor();
  const before = await stageState(page);
  const clampedX = before['data-x2'];
  await page.getByTestId('play-toggle').click();
  await page.waitForTimeout(250);
  const handle = page.getByTestId('i06-rod-1-hit');
  const box = await handle.boundingBox();
  expect(box).not.toBeNull();
  if (box) {
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.waitForTimeout(120);
    await page.mouse.move(x + 90, y, { steps: 8 });
    const during = await stageState(page);
    expect(Number(during['data-x1'])).not.toBeCloseTo(Number(before['data-x1']), 3);
    expect(during['data-x2']).toBe(clampedX);
    // 电流只在持续拖动时非零；固定等待会越过 0.12 s 速度窗口而正确归零。
    let step = 0;
    await expect
      .poll(
        async () => {
          step += 1;
          await page.mouse.move(x + 90 + (step % 2 === 0 ? 8 : -8), y);
          return Math.abs(Number((await stageState(page))['data-current']));
        },
        { message: '手动拖动期间应持续产生共享电流', timeout: 3000 },
      )
      .toBeGreaterThan(0.05);
    await page.mouse.up();
  }
  const after = await stageState(page);
  expect(Number(after['data-history-count'])).toBeGreaterThan(2);
  expect(Number(await page.getByTestId('timeline').inputValue())).toBeGreaterThan(0.1);
  await page.screenshot({ path: path.resolve('docs/screenshots/i06-manual-rod.png') });
  expect(errors, errors.join(' | ')).toEqual([]);
});

test('I06 tablet portrait and corrupt scene import remain usable', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto('/#/induction/dual-rods?preset=i06-unequal-masses');
  await page.getByTestId('i06-stage-svg').waitFor();
  await expectNoHorizontalOverflow(page);
  await page.getByRole('tab', { name: /参数/ }).click();
  await page.getByTestId('i06-scene-import').setInputFiles({
    name: 'bad-i06.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"schemaVersion":2,"model":"i06","params":{"mass1Kg":0}}'),
  });
  await expect(page.getByTestId('i06-condition-notice')).toContainText('导入失败');
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: path.resolve('docs/screenshots/i06-portrait.png') });
  expect(errors, errors.join(' | ')).toEqual([]);
});

test('I06 touch: a second finger cancels manual rod drag without crossing the clamped rod', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1194, height: 834 }, hasTouch: true });
  const page = await context.newPage();
  const errors = collectErrors(page);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await page.goto('/#/induction/dual-rods?preset=i06-manual-rod1');
  await page.getByTestId('i06-stage-svg').waitFor();
  await page.getByTestId('play-toggle').click();
  await page.waitForTimeout(220);
  const handle = await page.getByTestId('i06-rod-1-hit').boundingBox();
  expect(handle).not.toBeNull();
  if (handle) {
    const x = handle.x + handle.width / 2;
    const y = handle.y + handle.height / 2;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
    for (let step = 1; step <= 5; step++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + (70 * step) / 5, y, id: 1 }] });
      await page.waitForTimeout(55);
    }
    await page.waitForTimeout(45);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: x + 70, y, id: 1 }, { x: x + 220, y: y - 80, id: 2 }],
    });
    await page.waitForTimeout(120);
    const canceled = await stageState(page);
    expect(await page.getByTestId('i06-stage').getAttribute('data-manual-dragging')).toBe('false');
    expect(Number(canceled['data-x2'])).toBeGreaterThan(Number(canceled['data-x1']));
    expect(Number(canceled['data-v1'])).toBe(0);
    await page.screenshot({ path: path.resolve('docs/screenshots/i06-touch-cancel.png') });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }
  expect(errors, errors.join(' | ')).toEqual([]);
  await context.close();
});

test('I06 practice link opens the verified preset and returns to the question', async ({ page }) => {
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/practice?q=i06-01');
  await expect(page.getByText('两杆同速运动时的总电动势')).toBeVisible();
  await page.locator('#question-i06-01').getByRole('link', { name: /进入实验验证/ }).click();
  await expect(page).toHaveURL(/\/induction\/dual-rods\?preset=i06-same-speed/);
  await expect(page.getByTestId('i06-stage-svg')).toBeVisible();
  await page.goBack();
  await expect(page.getByText('两杆同速运动时的总电动势')).toBeVisible();
});
