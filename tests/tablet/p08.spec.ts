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

async function particleState(page: Page, label: string) {
  return page.getByTestId(`p08-particle-${label}`).evaluate((element) => {
    const names = ['data-x', 'data-y', 'data-vx', 'data-vy', 'data-status'];
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

test('P08 tangent: a touch event is not accepted as a forward crossing', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/particle/constraint-lab?preset=p08-tangent');
  await page.getByTestId('p08-stage-svg').waitFor();
  await page.getByRole('tab', { name: /数据与反求/ }).click();
  await expect(page.getByTestId('p08-status')).toContainText('相切临界');
  await expect(page.getByTestId('p08-event-list')).toContainText('相切');
  await expect(page.getByTestId('p08-event-list')).not.toContainText('✔');
  await expect(page.getByTestId('p08-outcome-table')).toContainText('相切临界');
  expect(errors).toEqual([]);
});

test('P08 two crossings: both directions are preserved and only accepted ones count', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/particle/constraint-lab?preset=p08-two-crossings');
  await page.getByTestId('p08-stage-svg').waitFor();
  await page.getByRole('tab', { name: /数据与反求/ }).click();
  const list = page.getByTestId('p08-event-list');
  await expect(list).toContainText('正向穿越');
  await expect(list).toContainText('反向穿越');
  await expect(page.getByTestId('p08-status')).toContainText('满足约束');
  await setTimeline(page, 2.3);
  await expect(page.getByTestId('p08-event-marker').first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('P08 direction and unreachable presets report distinct physical statuses', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/particle/constraint-lab?preset=p08-direction');
  await page.getByTestId('p08-stage-svg').waitFor();
  await page.getByRole('tab', { name: /数据与反求/ }).click();
  await expect(page.getByTestId('p08-status')).toContainText('相切临界');
  await page.goto('/#/particle/constraint-lab?preset=p08-unreachable');
  await page.getByTestId('p08-stage-svg').waitFor();
  await page.getByRole('tab', { name: /数据与反求/ }).click();
  await expect(page.getByTestId('p08-status')).toContainText('不可达');
  await expect(page.getByTestId('p08-event-list')).toContainText('没有数学交点');
  expect(errors).toEqual([]);
});

test('P08 inverse: finds Ey=1.5, shows forward revalidation and applies only on request', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/particle/constraint-lab?preset=p08-inverse-ey');
  await page.getByTestId('p08-stage-svg').waitFor();
  await page.getByRole('tab', { name: /数据与反求/ }).click();
  await page.getByTestId('p08-run-inverse').click();
  await expect(page.getByTestId('p08-inverse-status')).toContainText('确认候选');
  const candidates = page.getByTestId('p08-candidate-list');
  await expect(candidates).toContainText('Ey = 1.5');
  await expect(candidates).toContainText('正向复核通过');
  await page.getByTestId('p08-apply-candidate-0').click();
  await expect(page.getByTestId('p08-condition-notice')).toContainText('已应用');
  expect(Number(await page.getByTestId('timeline').inputValue())).toBe(0);
  await page.screenshot({ path: path.resolve('docs/screenshots/p08-inverse-ey.png') });
  expect(errors).toEqual([]);
});

test('P08 multi-particle: editing A does not restart B or stop the clock', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/particle/constraint-lab?preset=p08-five');
  await page.getByTestId('p08-stage-svg').waitFor();
  await page.getByTestId('play-toggle').click();
  await page.waitForTimeout(650);
  const beforeB = await particleState(page, 'B');
  const timeBefore = Number(await page.getByTestId('timeline').inputValue());
  expect(timeBefore).toBeGreaterThan(0);
  await page.getByRole('tab', { name: /参数/ }).click();
  const speed = page.getByLabel('A 速率滑块（m/s）');
  await speed.fill('2.4');
  await page.waitForTimeout(260);
  const afterB = await particleState(page, 'B');
  expect(Math.hypot(Number(afterB['data-x']), Number(afterB['data-y']))).toBeGreaterThan(0.1);
  expect(Number(afterB['data-x'])).not.toBe(0);
  expect(await page.getByTestId('play-toggle').textContent()).toContain('暂停');
  expect(Math.abs(Number(afterB['data-x']) - Number(beforeB['data-x']))).toBeLessThan(2.5);
  expect(errors).toEqual([]);
});

test('P08 moving the target only re-evaluates constraints and keeps the physical clock running', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/particle/constraint-lab?preset=p08-two-crossings');
  await page.getByTestId('p08-stage-svg').waitFor();
  await page.getByTestId('play-toggle').click();
  await page.waitForTimeout(600);
  const timeBefore = Number(await page.getByTestId('timeline').inputValue());
  const before = await particleState(page, 'A');
  await dragBy(page, 'p08-target-hit', 45);
  const timeAfter = Number(await page.getByTestId('timeline').inputValue());
  const after = await particleState(page, 'A');
  expect(timeAfter).toBeGreaterThanOrEqual(timeBefore - 1e-9);
  expect(Number(after['data-x'])).not.toBe(0);
  expect(Math.abs(Number(after['data-x']) - Number(before['data-x']))).toBeLessThan(3);
  await expect(page.getByTestId('p08-condition-notice')).toContainText('目标约束修改');
  await expect(page.getByTestId('play-toggle')).toContainText('暂停');
  expect(errors).toEqual([]);
});

test('P08 portrait, teacher view and practice link work without horizontal overflow', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto('/#/particle/constraint-lab?preset=p08-two-crossings');
  await page.getByTestId('p08-stage-svg').waitFor();
  await expectNoHorizontalOverflow(page);
  await page.getByTestId('p08-teacher-toggle').click();
  await expect(page.locator('.teacher-dock')).toBeVisible();
  await page.screenshot({ path: path.resolve('docs/screenshots/p08-portrait-teacher.png') });
  await page.getByTestId('p08-teacher-toggle').click();
  await page.getByRole('tab', { name: /练习/ }).click();
  await expect(page.locator('.question-card').first()).toBeVisible();
  expect(errors).toEqual([]);
});
