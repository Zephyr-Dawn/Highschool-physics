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
  await page.waitForTimeout(220);
}

async function i08State(page: Page) {
  return page.getByTestId('i08-stage').evaluate((element) => {
    const names = ['data-mode', 'data-theta', 'data-omega', 'data-flux', 'data-emf', 'data-current', 'data-closed', 'data-status'];
    return Object.fromEntries(names.map((name) => [name, element.getAttribute(name)]));
  });
}

test('I08 auto: quarter-period EMF/current and synchronized readouts', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/induction/ac-generator?preset=i08-standard');
  await page.getByTestId('i08-stage-svg').waitFor();
  await setTimeline(page, 0.25);
  const state = await i08State(page);
  expect(state['data-mode']).toBe('auto');
  expect(Math.abs(Number(state['data-theta']))).toBeCloseTo(Math.PI / 2, 5);
  expect(Number(state['data-emf'])).toBeCloseTo(0.2 * Math.PI, 5);
  expect(Number(state['data-current'])).toBeCloseTo(0.04 * Math.PI, 5);
  await page.getByRole('tab', { name: /数据与图像/ }).click();
  await expect(page.getByTestId('i08-emf')).toContainText('628');
  await expect(page.getByTestId('i08-rms')).toContainText('444');
  await expect(page.getByTestId('i08-frequency')).toContainText('1 Hz');
  await expect(page.getByTestId('i08-energy-residual')).toContainText('J');
  await page.getByRole('tab', { name: /参数/ }).click();
  await page.getByTestId('play-toggle').click();
  await page.waitForTimeout(500);
  expect(Number(await page.getByTestId('timeline').inputValue())).toBeGreaterThan(0);
  await page.getByTestId('play-toggle').click();
  expect(errors).toEqual([]);
});

test('I08 switch: opening and closing preserves theta and immediately changes current/power', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/induction/ac-generator?preset=i08-standard');
  await page.getByTestId('i08-stage-svg').waitFor();
  await setTimeline(page, 0.25);
  const before = await i08State(page);
  expect(Math.abs(Number(before['data-current']))).toBeGreaterThan(0.1);
  await page.getByRole('tab', { name: /参数/ }).click();
  await page.getByRole('switch', { name: /闭合回路|断开回路/ }).click();
  await page.waitForTimeout(160);
  const opened = await i08State(page);
  expect(opened['data-closed']).toBe('false');
  expect(Number(opened['data-current'])).toBe(0);
  expect(Number(opened['data-theta'])).toBeCloseTo(Number(before['data-theta']), 9);
  await page.getByRole('switch', { name: /闭合回路|断开回路/ }).click();
  await page.waitForTimeout(160);
  const closed = await i08State(page);
  expect(closed['data-closed']).toBe('true');
  expect(Math.abs(Number(closed['data-current']))).toBeGreaterThan(0.1);
  expect(Number(closed['data-theta'])).toBeCloseTo(Number(before['data-theta']), 9);
  await page.screenshot({ path: path.resolve('docs/screenshots/i08-switch.png') });
  expect(errors).toEqual([]);
});

test('I08 manual: angle handle creates real-time EMF, stop returns omega/EMF to zero', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/induction/ac-generator?preset=i08-manual');
  await page.getByTestId('i08-stage-svg').waitFor();
  await expect(page.getByTestId('i08-angle-handle')).toBeVisible();
  await page.getByTestId('play-toggle').click();
  await page.waitForTimeout(250);
  const handle = page.getByTestId('i08-angle-handle');
  const box = await handle.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.waitForTimeout(120);
  await page.mouse.move(x - 80, y - 80, { steps: 8 });
  await page.waitForTimeout(120);
  const during = await i08State(page);
  expect(during['data-mode']).toBe('manual');
  expect(Math.abs(Number(during['data-omega']))).toBeGreaterThan(0.1);
  expect(Math.abs(Number(during['data-emf']))).toBeGreaterThan(0.01);
  await page.mouse.up();
  await page.waitForTimeout(220);
  const released = await i08State(page);
  expect(Math.abs(Number(released['data-omega']))).toBeLessThan(0.05);
  expect(Math.abs(Number(released['data-emf']))).toBeLessThan(0.01);
  await page.screenshot({ path: path.resolve('docs/screenshots/i08-manual.png') });
  expect(errors).toEqual([]);
});

test('I08 mathematical input keeps 2π, √2/2 and 1/3 and rejects N=3/2', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/induction/ac-generator?preset=i08-standard');
  await page.getByTestId('i08-stage-svg').waitFor();
  await page.getByRole('tab', { name: /参数/ }).click();
  const omega = page.getByLabel('角速度 ω数值（rad/s）');
  await omega.fill('2π');
  await omega.press('Enter');
  await page.waitForTimeout(150);
  await expect(omega).toHaveValue('2π');
  const b = page.getByLabel('磁感应强度 B数值（T）');
  await b.fill('√2/2');
  await b.press('Enter');
  await page.waitForTimeout(150);
  await expect(b).toHaveValue('√2/2');
  const rl = page.getByLabel('负载电阻 R_L数值（Ω）');
  await rl.fill('1/3');
  await rl.press('Enter');
  await page.waitForTimeout(150);
  await expect(rl).toHaveValue('1/3');
  const n = page.getByLabel('匝数 N数值（turn）');
  await n.fill('3/2');
  await n.press('Enter');
  await page.waitForTimeout(150);
  await expect(page.getByTestId('i08-total-resistance')).toBeVisible();
  await expect(page.locator('.param-math-status.is-error').filter({ hasText: /整数/ }).first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('I08 teacher view and portrait layout remain usable', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto('/#/induction/ac-generator?preset=i08-standard');
  await page.getByTestId('i08-stage-svg').waitFor();
  await expectNoHorizontalOverflow(page);
  await page.getByTestId('i08-teacher-toggle').click();
  await expect(page.locator('.teacher-dock')).toBeVisible();
  await page.screenshot({ path: path.resolve('docs/screenshots/i08-portrait-teacher.png') });
  await page.getByTestId('i08-teacher-toggle').click();
  await page.getByRole('tab', { name: /练习/ }).click();
  await expect(page.locator('.question-card').first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('I08 scene persists and corrupted storage falls back safely', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/induction/ac-generator');
  await page.getByTestId('i08-stage-svg').waitFor();
  await page.getByRole('tab', { name: /参数/ }).click();
  const b = page.getByLabel('磁感应强度 B数值（T）');
  await b.fill('0.75');
  await b.press('Enter');
  await page.waitForTimeout(150);
  await page.reload();
  await page.getByTestId('i08-stage-svg').waitFor();
  await page.getByRole('tab', { name: /参数/ }).click();
  await expect(page.getByLabel('磁感应强度 B数值（T）')).toHaveValue('0.750');
  await page.evaluate(() => {
    window.localStorage.setItem('emplab.i08.scene.v2', '{bad json');
  });
  await page.reload();
  await page.getByTestId('i08-stage-svg').waitFor();
  const state = await i08State(page);
  expect(Number(state['data-flux'])).toBeCloseTo(0.01, 5);
  expect(errors).toEqual([]);
});
