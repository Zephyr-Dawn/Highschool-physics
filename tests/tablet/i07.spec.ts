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

async function loopState(page: Page) {
  return page.getByTestId('i07-loop').evaluate((element) => {
    const names = ['data-x', 'data-v', 'data-s', 'data-flux', 'data-emf', 'data-current', 'data-joule', 'data-impact', 'data-status'];
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

test('I07 default: signed flux, S, EMF and current are visible and consistent', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/induction/opposite-fields-wall');
  await page.getByTestId('i07-stage-svg').waitFor();
  const state = await loopState(page);
  expect(Number(state['data-x'])).toBeCloseTo(-0.5, 6);
  expect(Number(state['data-v'])).toBeCloseTo(2, 6);
  expect(Number(state['data-s'])).toBeCloseTo(1, 6);
  expect(Number(state['data-flux'])).toBeCloseTo(0.5, 6);
  expect(Number(state['data-emf'])).toBeCloseTo(-2, 6);
  expect(Number(state['data-current'])).toBeCloseTo(-2, 6);
  await page.getByRole('tab', { name: /数据与图像/ }).click();
  await expect(page.getByTestId('i07-flux')).toContainText('500 mWb');
  await expect(page.getByTestId('i07-s').locator('.readout-value')).toContainText('1');
  await expect(page.getByTestId('i07-event-list')).toContainText('场界');
  await expect(page.getByTestId('i07-charts')).toBeVisible();
  expect(errors).toEqual([]);
});

test('I07 free wall: the wall event is a real bounce and stops the displayed position at the wall', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/induction/opposite-fields-wall?preset=i07-free-wall');
  await page.getByTestId('i07-stage-svg').waitFor();
  await setTimeline(page, 1.1);
  await expect(page.getByTestId('i07-bounce-marker')).toHaveCount(1);
  await page.getByRole('tab', { name: /数据与图像/ }).click();
  await expect(page.getByTestId('i07-event-list')).toContainText('挡板反弹');
  await expect(page.getByTestId('i07-impact')).toContainText('0 J');
  const state = await loopState(page);
  expect(Number(state['data-x'])).toBeGreaterThanOrEqual(2.3);
  expect(Number(state['data-x'])).toBeLessThanOrEqual(2.5 + 1e-6);
  expect(errors).toEqual([]);
});

test('I07 inelastic wall: impact loss is separate from Joule heat', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/induction/opposite-fields-wall?preset=i07-inelastic-wall');
  await page.getByTestId('i07-stage-svg').waitFor();
  await setTimeline(page, 'max');
  await page.getByRole('tab', { name: /数据与图像/ }).click();
  await expect(page.getByTestId('i07-impact')).toContainText('375 mJ');
  await expect(page.getByTestId('i07-heat')).toContainText('0 J');
  await expect(page.getByTestId('i07-residual')).toContainText('J');
  expect(errors).toEqual([]);
});

test('I07 manual drag: real-time history, nonzero current and release holds at rest', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/induction/opposite-fields-wall?preset=i07-manual');
  await page.getByTestId('i07-stage-svg').waitFor();
  await page.getByTestId('play-toggle').click();
  await page.waitForTimeout(220);
  const before = await loopState(page);
  const hit = page.getByTestId('i07-loop-hit');
  const box = await hit.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.waitForTimeout(150);
  await page.mouse.move(x + 90, y, { steps: 10 });
  const during = await loopState(page);
  expect(Number(during['data-x'])).toBeGreaterThan(Number(before['data-x']) + 0.02);
  // 电流只在持续拖动时非零；固定等待会越过 0.12 s 速度窗口而正确归零。
  let step = 0;
  await expect
    .poll(
      async () => {
        step += 1;
        await page.mouse.move(x + 90 + (step % 2 === 0 ? 8 : -8), y);
        return Math.abs(Number((await loopState(page))['data-current']));
      },
      { message: '手动拖动期间应持续产生感应电流', timeout: 3000 },
    )
    .toBeGreaterThan(1e-6);
  await page.mouse.up();
  await page.waitForTimeout(150);
  const released = await loopState(page);
  expect(Math.abs(Number(released['data-v']))).toBeLessThan(0.02);
  expect(Number(released['data-joule'])).toBeGreaterThanOrEqual(0);
  expect(errors).toEqual([]);
});

test('I07 persists a committed B1 value and falls back safely from corrupted storage', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/induction/opposite-fields-wall');
  await page.getByRole('tab', { name: /参数/ }).click();
  const field = page.getByLabel('B₁ 场强数值（T）');
  await field.fill('0.5');
  await field.press('Enter');
  await page.waitForTimeout(180);
  await page.reload();
  await page.getByTestId('i07-stage-svg').waitFor();
  await page.getByRole('tab', { name: /参数/ }).click();
  await expect(page.getByLabel('B₁ 场强数值（T）')).toHaveValue('0.50');

  await page.evaluate(() => {
    window.localStorage.setItem('emplab.i07.scene.v2', '{bad json');
  });
  await page.reload();
  await page.getByTestId('i07-stage-svg').waitFor();
  const state = await loopState(page);
  expect(Number(state['data-x'])).toBeCloseTo(-0.5, 6);
  expect(errors).toEqual([]);
});

test('I07 teacher view, portrait layout and practice link remain usable', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto('/#/induction/opposite-fields-wall?preset=i07-free-wall');
  await page.getByTestId('i07-stage-svg').waitFor();
  await expectNoHorizontalOverflow(page);
  await page.getByTestId('i07-teacher-toggle').click();
  await expect(page.locator('.teacher-dock')).toBeVisible();
  await page.screenshot({ path: path.resolve('docs/screenshots/i07-teacher.png') });
  await page.getByTestId('i07-teacher-toggle').click();
  await page.getByRole('tab', { name: /练习/ }).click();
  await expect(page.locator('.question-card').first()).toBeVisible();
  expect(errors).toEqual([]);
});
