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

async function dragHandle(page: Page, testId: string, dx: number, dy: number, callbacks?: { afterDown?: () => Promise<void>; beforeUp?: () => Promise<void> }) {
  const handle = page.getByTestId(testId);
  const box = await handle.boundingBox();
  expect(box, `missing ${testId}`).not.toBeNull();
  if (!box) return;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.waitForTimeout(120);
  if (callbacks?.afterDown) await callbacks.afterDown();
  await page.mouse.move(x + dx, y + dy, { steps: 8 });
  await page.waitForTimeout(120);
  if (callbacks?.beforeUp) await callbacks.beforeUp();
  await page.mouse.up();
}

async function forceState(page: Page) {
  return page.getByTestId('p01-3d-stage').evaluate((element) => {
    const names = ['data-mode', 'data-selected', 'data-particle-count', 'data-q', 'data-vx', 'data-vy', 'data-vz', 'data-bx', 'data-by', 'data-bz', 'data-fx', 'data-fy', 'data-fz', 'data-force-mag', 'data-theta-deg', 'data-zero-reason', 'data-force-hidden'];
    return Object.fromEntries(names.map((name) => [name, element.getAttribute(name)]));
  });
}

async function planarState(page: Page, label: string) {
  return page.getByTestId(`p02-particle-${label}`).evaluate((element) => {
    const names = ['data-launch-time', 'data-start-x', 'data-start-y', 'data-x', 'data-y', 'data-vx', 'data-vy', 'data-charge-c', 'data-mass-kg'];
    return Object.fromEntries(names.map((name) => [name, element.getAttribute(name)]));
  });
}

test('P01 3D force shows positive and negative charge force with signed components', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/particle/lorentz-force?preset=p01-force-default');
  await page.getByTestId('p01-3d-stage').waitFor();
  const stage = page.getByTestId('p01-3d-stage');
  await expect(stage).toHaveAttribute('data-mode', 'force3d');
  await expect(stage).toHaveAttribute('data-particle-count', '3');
  const positive = await forceState(page);
  expect(Number(positive['data-q'])).toBe(2);
  expect(Number(positive['data-vx'])).toBe(3);
  expect(Number(positive['data-bz'])).toBe(-4);
  expect(Number(positive['data-fx'])).toBeCloseTo(0, 8);
  expect(Number(positive['data-fy'])).toBeCloseTo(24, 8);
  expect(Number(positive['data-force-mag'])).toBeCloseTo(24, 8);
  expect(positive['data-zero-reason']).toBe('none');
  await page.screenshot({ path: path.resolve('docs/screenshots/p01-force-3d.png') });

  await page.getByTestId('particle-chip-p2').click();
  const negative = await forceState(page);
  expect(Number(negative['data-q'])).toBe(-2);
  expect(Number(negative['data-fy'])).toBeCloseTo(-24, 8);
  expect(negative['data-force-hidden']).toBe('false');
  await page.screenshot({ path: path.resolve('docs/screenshots/p01-force-negative.png') });
  await expectNoHorizontalOverflow(page);
  expect(errors, errors.join(' | ')).toEqual([]);
});

test('P01 3D zero-force modes and oblique components stay consistent', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/particle/lorentz-force?preset=p01-force-parallel');
  await page.getByTestId('p01-3d-stage').waitFor();
  await expect(page.getByTestId('p01-3d-stage')).toHaveAttribute('data-zero-reason', 'parallel');
  const parallel = await forceState(page);
  expect(parallel['data-zero-reason']).toBe('parallel');
  expect(Number(parallel['data-force-mag'])).toBe(0);
  expect(parallel['data-force-hidden']).toBe('true');

  await page.goto('/#/particle/lorentz-force?preset=p01-force-oblique');
  await page.getByTestId('p01-3d-stage').waitFor();
  const oblique = await forceState(page);
  expect(Number(oblique['data-fx'])).toBeCloseTo(10, 8);
  expect(Number(oblique['data-fy'])).toBeCloseTo(-20, 8);
  expect(Number(oblique['data-fz'])).toBeCloseTo(10, 8);
  await page.getByRole('tab', { name: /数据/ }).click();
  await expect(page.getByTestId('p01-force-dot-v')).toContainText('W');
  await expect(page.getByTestId('p01-force-dot-b')).toContainText('0');
  await page.screenshot({ path: path.resolve('docs/screenshots/p01-force-oblique.png') });
  expect(errors, errors.join(' | ')).toEqual([]);
});

test('P01 planar mode runs three particles with opposite charge bending', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/particle/lorentz-force?preset=p01-motion-default');
  await page.getByTestId('p02-stage').waitFor();
  await expect(page.getByTestId('p01-planar-page')).toHaveAttribute('data-particle-count', '3');
  await page.getByTestId('play-toggle').click();
  await page.waitForTimeout(420);
  const a = await planarState(page, 'A');
  const b = await planarState(page, 'B');
  expect(Number(a['data-y'])).toBeLessThan(0);
  expect(Number(b['data-y'])).toBeGreaterThan(0);
  expect(Math.sign(Number(a['data-vy']))).toBe(-Math.sign(Number(b['data-vy'])));
  await page.screenshot({ path: path.resolve('docs/screenshots/p01-planar-3.png') });

  await page.getByTestId('particle-add').click();
  await page.getByTestId('particle-add').click();
  await expect(page.getByTestId('p02-stage')).toHaveAttribute('data-particle-count', '5');
  await expect(page.getByTestId('particle-add')).toBeDisabled();
  await page.screenshot({ path: path.resolve('docs/screenshots/p01-planar-5.png') });
  expect(errors, errors.join(' | ')).toEqual([]);
});

test('P01 planar live edit A keeps B/C moving and only relaunches A', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/particle/lorentz-force?preset=p01-motion-default');
  await page.getByTestId('p02-stage').waitFor();
  await page.getByTestId('particle-chip-p1').click();
  await page.getByRole('button', { name: '0.25×' }).click();
  await page.getByTestId('play-toggle').click();
  await page.waitForTimeout(320);
  const sim = page.getByTestId('p01-planar-page');
  const bBefore = await planarState(page, 'B');
  const cBefore = await planarState(page, 'C');
  await dragHandle(page, 'p02-start-handle-hit', 42, 22, {
    afterDown: async () => {
      await expect(sim).toHaveAttribute('data-sim-playing', 'true');
      await expect(sim).toHaveAttribute('data-sim-editing', 'true');
      await expect(page.getByTestId('p02-preview-orbit')).toBeVisible();
    },
    beforeUp: async () => {
      const bDuring = await planarState(page, 'B');
      const cDuring = await planarState(page, 'C');
      expect(bDuring['data-launch-time']).toBe(bBefore['data-launch-time']);
      expect(cDuring['data-launch-time']).toBe(cBefore['data-launch-time']);
      expect(Number(bDuring['data-x'])).not.toBeCloseTo(Number(bBefore['data-x']), 7);
    },
  });
  await page.waitForTimeout(220);
  const aAfter = await planarState(page, 'A');
  const bAfter = await planarState(page, 'B');
  const cAfter = await planarState(page, 'C');
  expect(Number(aAfter['data-launch-time'])).toBeGreaterThan(0);
  expect(bAfter['data-launch-time']).toBe(bBefore['data-launch-time']);
  expect(cAfter['data-launch-time']).toBe(cBefore['data-launch-time']);
  await expect(sim).toHaveAttribute('data-sim-playing', 'true');
  await page.screenshot({ path: path.resolve('docs/screenshots/p01-planar-live-edit.png') });
  expect(errors, errors.join(' | ')).toEqual([]);
});

test('P01 shared Bz change synchronously restarts all particles and preserves play intent', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/particle/lorentz-force?preset=p01-motion-default');
  await page.getByTestId('p02-stage').waitFor();
  await page.getByTestId('play-toggle').click();
  await page.waitForTimeout(300);
  await page.getByRole('tab', { name: /参数/ }).click();
  const bInput = page.getByLabel('磁感应强度 |B|数值（T）');
  await bInput.fill('0.8');
  await bInput.blur();
  await page.waitForTimeout(280);
  await expect(page.getByTestId('p01-planar-page')).toHaveAttribute('data-sim-playing', 'true');
  for (const label of ['A', 'B', 'C']) {
    expect((await planarState(page, label))['data-launch-time']).toBe('0');
  }
  expect(Number(await page.getByTestId('timeline').inputValue())).toBeGreaterThan(0);
  await page.getByRole('button', { name: /教师视图/ }).click();
  await page.waitForTimeout(180);
  const bar = page.locator('.teacher-layer-bar');
  await expect(bar).toBeVisible();
  const allVectors = bar.getByRole('button', { name: '全部矢量', exact: true });
  if ((await allVectors.getAttribute('aria-pressed')) === 'false') {
    await allVectors.click();
  }
  await expect(allVectors).toHaveAttribute('aria-pressed', 'true');
  await allVectors.click();
  await expect(allVectors).toHaveAttribute('aria-pressed', 'false');
  await page.screenshot({ path: path.resolve('docs/screenshots/p01-planar-teacher.png') });
  expect(errors, errors.join(' | ')).toEqual([]);
});

test('P01 force teacher can hide the answer and works in portrait', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/particle/lorentz-force?preset=p01-force-oblique');
  await page.getByTestId('p01-3d-stage').waitFor();
  const before = await forceState(page);
  await page.getByRole('button', { name: /教师视图/ }).click();
  await page.waitForTimeout(180);
  const bar = page.locator('.teacher-layer-bar');
  const forceChip = bar.getByRole('button', { name: 'F', exact: true });
  await expect(forceChip).toHaveAttribute('aria-pressed', 'true');
  await forceChip.click();
  await expect(page.getByTestId('p01-3d-stage')).toHaveAttribute('data-force-hidden', 'true');
  expect((await forceState(page))['data-force-mag']).toBe(before['data-force-mag']);
  await expect(page.getByTestId('p01-3d-stage')).toContainText('F 已隐藏或为零');
  await page.screenshot({ path: path.resolve('docs/screenshots/p01-force-teacher.png') });
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.waitForTimeout(220);
  await expectNoHorizontalOverflow(page);
  await expect(page.locator('[data-testid="p01-3d-canvas"]')).toBeVisible();
  await page.screenshot({ path: path.resolve('docs/screenshots/p01-3d-force-portrait.png') });
  expect(errors, errors.join(' | ')).toEqual([]);
});

test('P01 practice link loads the matching planar scene and keeps the answer', async ({ page }) => {
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/practice?q=p01-06');
  const card = page.locator('#question-p01-06');
  await card.waitFor();
  await card.getByRole('radio', { name: /F 相同，R 和 T 都加倍/ }).click();
  await card.getByTestId('check-p01-06').click();
  await expect(card.getByText('回答正确').first()).toBeVisible();
  await card.getByRole('link', { name: /进入实验验证/ }).click();
  await expect(page).toHaveURL(/particle\/lorentz-force\?preset=p01-motion-radius/);
  await expect(page.getByTestId('p01-planar-page')).toBeVisible();
  await expect(page.getByTestId('p02-stage')).toHaveAttribute('data-particle-count', '2');
  await page.goBack();
  await page.reload();
  await expect(page.locator('#question-p01-06').getByRole('radio', { name: /F 相同，R 和 T 都加倍/ })).toHaveAttribute('aria-checked', 'true');
});

test('P01 tablet viewports and mode switching remain usable', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1024, height: 768 }, hasTouch: true });
  const page = await context.newPage();
  const errors = collectErrors(page);
  await page.goto('http://127.0.0.1:4173/#/particle/lorentz-force?preset=p01-force-default');
  await page.getByTestId('p01-3d-stage').waitFor();
  await expectNoHorizontalOverflow(page);
  await page.getByTestId('particle-chip-p2').click();
  await expect(page.getByTestId('p01-3d-stage')).toHaveAttribute('data-q', '-2');
  await page.getByRole('button', { name: '2D 运动', exact: true }).click();
  await page.getByTestId('p02-stage').waitFor();
  await expect(page.getByTestId('p01-planar-page')).toHaveAttribute('data-p01-mode', 'planar');
  await page.getByRole('button', { name: '3D 受力', exact: true }).click();
  await page.getByTestId('p01-3d-stage').waitFor();
  await expect(page.getByTestId('p01-3d-stage')).toHaveAttribute('data-q', '-2');
  await page.setViewportSize({ width: 810, height: 1080 });
  await page.waitForTimeout(220);
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: path.resolve('docs/screenshots/p01-3d-810x1080.png') });
  expect(errors, errors.join(' | ')).toEqual([]);
  await context.close();
});
