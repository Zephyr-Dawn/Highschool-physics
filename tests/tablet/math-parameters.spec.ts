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

async function openTab(page: Page, name: '参数' | '数据') {
  await page.getByRole('tab', { name: new RegExp(name) }).click();
}

async function fillExpression(page: Page, label: string, expression: string) {
  const input = page.getByLabel(label);
  await input.scrollIntoViewIfNeeded();
  await input.fill(expression);
  await input.blur();
  await expect(input).toHaveValue(expression);
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

async function setTimelineFraction(page: Page, fraction: number) {
  const max = await page.getByTestId('timeline').evaluate((element) => Number((element as HTMLInputElement).max));
  await setTimeline(page, max * fraction);
}

test.describe('every implemented model accepts mathematical expressions', () => {
  test('P01 3D: Bz = √2 T reaches the 3D field vector', async ({ page }) => {
    const errors = collectErrors(page);
    await page.setViewportSize({ width: 1194, height: 834 });
    await page.goto('/#/particle/lorentz-force?preset=p01-3d-force-front');
    await page.getByTestId('p01-3d-stage').waitFor({ timeout: 30_000 });
    await openTab(page, '参数');
    await fillExpression(page, 'Bz数值（T）', '√2');
    await expect.poll(async () => Number(await page.getByTestId('p01-3d-stage').getAttribute('data-bz'))).toBeCloseTo(Math.SQRT2, 6);
    await page.screenshot({ path: path.resolve('docs/screenshots/math-p01-3d.png') });
    expect(errors, errors.join(' | ')).toEqual([]);
  });

  test('P01 planar: √2 T drives the same analytic radius', async ({ page }) => {
    const errors = collectErrors(page);
    await page.setViewportSize({ width: 1194, height: 834 });
    await page.goto('/#/particle/lorentz-force?preset=p01-motion-default');
    await page.getByTestId('p02-stage').waitFor();
    await openTab(page, '参数');
    await fillExpression(page, '磁感应强度 |B|数值（T）', '√2');
    const particle = await page.getByTestId('p02-particle-A').evaluate((element) => ({
      q: Math.abs(Number(element.getAttribute('data-charge-c'))),
      m: Number(element.getAttribute('data-mass-kg')),
      vx: Number(element.getAttribute('data-vx')),
      vy: Number(element.getAttribute('data-vy')),
    }));
    const expectedRadiusM = (particle.m * Math.hypot(particle.vx, particle.vy)) / (particle.q * Math.SQRT2);
    await openTab(page, '数据');
    const radiusText = await page.getByTestId('p01-planar-radius').textContent();
    const radiusCm = Number(radiusText?.match(/([\d.]+) cm/)?.[1] ?? Number.NaN);
    expect(radiusCm).toBeCloseTo(expectedRadiusM * 100, 0);
    expect(errors, errors.join(' | ')).toEqual([]);
  });

  test('P02: √3/2 T is preserved and used in the data panel', async ({ page }) => {
    const errors = collectErrors(page);
    await page.setViewportSize({ width: 1194, height: 834 });
    await page.goto('/#/particle/uniform-b');
    await page.getByTestId('p02-stage').waitFor();
    await openTab(page, '参数');
    await fillExpression(page, '磁感应强度 |B|数值（T）', '√3/2');
    await openTab(page, '数据');
    await expect(page.getByTestId('p02-radius')).toContainText('14.4 cm');
    await openTab(page, '参数');
    await page.getByLabel('磁感应强度 |B|数值（T）').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.resolve('docs/screenshots/math-expression-fraction.png') });
    expect(errors, errors.join(' | ')).toEqual([]);
  });

  test('P03: boundary x = √2 cm is stored exactly without rounding to the slider step', async ({ page }) => {
    const errors = collectErrors(page);
    await page.setViewportSize({ width: 1194, height: 834 });
    await page.goto('/#/particle/half-plane');
    await page.getByTestId('p03-stage').waitFor();
    await openTab(page, '参数');
    await fillExpression(page, '共享磁场边界 x数值（cm）', '√2');
    await expect.poll(async () => Number(await page.getByTestId('p03-stage').getAttribute('data-boundary-x'))).toBeCloseTo(Math.SQRT2 / 100, 3);
    expect(errors, errors.join(' | ')).toEqual([]);
  });

  test('P04: Bz = √2 T gives the analytic 70.7 cm radius', async ({ page }) => {
    const errors = collectErrors(page);
    await page.setViewportSize({ width: 1194, height: 834 });
    await page.goto('/#/particle/finite-field?preset=p04-strip-return');
    await page.getByTestId('p04-stage').waitFor();
    await openTab(page, '参数');
    await fillExpression(page, 'Bz数值（T）', '√2');
    await openTab(page, '数据');
    await expect(page.getByTestId('p04-radius')).toContainText('70.7 cm');
    expect(errors, errors.join(' | ')).toEqual([]);
  });

  test('P05: region B = √2 T is used by the region solver', async ({ page }) => {
    const errors = collectErrors(page);
    await page.setViewportSize({ width: 1194, height: 834 });
    await page.goto('/#/particle/alternating-fields?preset=p05-two-halves');
    await page.getByTestId('p05-stage').waitFor();
    await openTab(page, '参数');
    await fillExpression(page, '区域 B Bz数值（T）', '√2');
    await openTab(page, '数据');
    await expect(page.getByTestId('p05-current-bz')).toContainText('1.4');
    expect(errors, errors.join(' | ')).toEqual([]);
  });

  test('P06: B_z = √2 T breaks the earlier selector match', async ({ page }) => {
    const errors = collectErrors(page);
    await page.setViewportSize({ width: 1194, height: 834 });
    await page.goto('/#/particle/combined-fields?preset=p06-default');
    await page.getByTestId('p06-stage').waitFor();
    await openTab(page, '参数');
    await fillExpression(page, 'B_z数值（T）', '√2');
    await openTab(page, '数据');
    await expect(page.getByTestId('p06-selector')).toContainText('不满足');
    expect(errors, errors.join(' | ')).toEqual([]);
  });

  test('P07: analyzer B = -√2 T changes the analytic screen spot', async ({ page }) => {
    const errors = collectErrors(page);
    await page.setViewportSize({ width: 1194, height: 834 });
    await page.goto('/#/particle/beamline?preset=p07-standard');
    await page.getByTestId('p07-stage').waitFor();
    const before = Number(await page.getByTestId('p07-stage').getAttribute('data-detection-y'));
    expect(Number.isFinite(before)).toBe(true);
    await openTab(page, '参数');
    await fillExpression(page, '磁分析区 B_z数值（T）', '-√2');
    await expect.poll(async () => Number(await page.getByTestId('p07-stage').getAttribute('data-detection-y'))).not.toBeCloseTo(before, 4);
    const after = Number(await page.getByTestId('p07-stage').getAttribute('data-detection-y'));
    expect(Number.isFinite(after)).toBe(true);
    expect(errors, errors.join(' | ')).toEqual([]);
  });

  test('I01: N = √64 (= 8) is accepted as an integer and used in flux linkage', async ({ page }) => {
    const errors = collectErrors(page);
    await page.setViewportSize({ width: 1194, height: 834 });
    await page.goto('/#/induction/flux-lenz');
    await page.getByTestId('i01-stage').waitFor();
    await openTab(page, '参数');
    await fillExpression(page, '匝数 N数值（turn）', '√64');
    await openTab(page, '数据');
    await expect(page.getByTestId('i01-psi')).toContainText('1.6');
    expect(errors, errors.join(' | ')).toEqual([]);
  });

  test('I02: R = 1/3 Ω changes the real current/EMF ratio', async ({ page }) => {
    const errors = collectErrors(page);
    await page.setViewportSize({ width: 1194, height: 834 });
    await page.goto('/#/induction/moving-rod');
    await page.getByTestId('i02-stage').waitFor();
    await openTab(page, '参数');
    await fillExpression(page, '回路电阻 R数值（Ω）', '1/3');
    const stage = page.getByTestId('i02-stage');
    await expect.poll(async () => Number(await stage.getAttribute('data-current'))).toBeCloseTo(-4.5, 6);
    expect(Number(await stage.getAttribute('data-emf'))).toBeCloseTo(-1.5, 6);
    expect(errors, errors.join(' | ')).toEqual([]);
  });

  test('I03: B = √2 T scales the flux at the same uniform-driving time', async ({ page }) => {
    const errors = collectErrors(page);
    await page.setViewportSize({ width: 1194, height: 834 });
    await page.goto('/#/induction/loop-entry');
    await page.getByTestId('i03-stage-svg').waitFor();
    await setTimelineFraction(page, 0.4);
    const baseline = Number(await page.getByTestId('i03-flux-value').textContent());
    const baselineEmf = Number(await page.getByTestId('i03-emf-value').textContent());
    expect(Math.abs(baseline)).toBeGreaterThan(1e-6);
    expect(Math.abs(baselineEmf)).toBeGreaterThan(1e-6);
    await openTab(page, '参数');
    await fillExpression(page, '磁感应强度 |B|数值（T）', '√2');
    await setTimelineFraction(page, 0.4);
    const boosted = Number(await page.getByTestId('i03-flux-value').textContent());
    const boostedEmf = Number(await page.getByTestId('i03-emf-value').textContent());
    expect(boosted).toBeCloseTo(baseline * Math.SQRT2, 12);
    expect(boostedEmf).toBeCloseTo(baselineEmf * Math.SQRT2, 12);
    expect(errors, errors.join(' | ')).toEqual([]);
  });

  test('I04: manual target √2 T is reached through the finite ramp', async ({ page }) => {
    const errors = collectErrors(page);
    await page.setViewportSize({ width: 1194, height: 834 });
    await page.goto('/#/induction/time-varying-field?preset=i04-manual');
    await page.getByTestId('i04-stage').waitFor();
    await page.getByTestId('play-toggle').click();
    await page.waitForTimeout(250);
    await openTab(page, '参数');
    await fillExpression(page, '实时目标 B数值（T）', '√2');
    await expect.poll(async () => Number(await page.getByTestId('i04-stage').getAttribute('data-bz')), { timeout: 4000 }).toBeCloseTo(Math.SQRT2, 2);
    const phaseOne = Number(await page.getByTestId('i04-stage').getAttribute('data-emf'));
    expect(Number.isFinite(phaseOne)).toBe(true);
    await expect(page.getByLabel('实时目标 B数值（T）')).toHaveValue('√2');
    await page.screenshot({ path: path.resolve('docs/screenshots/math-i04-manual.png') });
    expect(errors, errors.join(' | ')).toEqual([]);
  });
});

test.describe('expression safety, slider coexistence and tablet layout', () => {
  test('P02 keeps B = 5 T (outside the slider) and labels the overflow honestly', async ({ page }) => {
    const errors = collectErrors(page);
    await page.setViewportSize({ width: 1194, height: 834 });
    await page.goto('/#/particle/uniform-b');
    await page.getByTestId('p02-stage').waitFor();
    await openTab(page, '参数');
    const input = page.getByLabel('磁感应强度 |B|数值（T）');
    await input.fill('5');
    await input.blur();
    const root = page.locator('.param.is-overflow').filter({ has: input }).first();
    await expect(root).toHaveAttribute('data-out-of-range', 'true');
    await expect(page.getByText(/超出滑块快捷范围 0–1\.5 T/)).toBeVisible();
    const range = root.locator('input[type="range"]');
    await expect(range).toHaveValue('1.5');
    await openTab(page, '数据');
    await expect(page.getByTestId('p02-radius')).toContainText('2.5 cm');
    await openTab(page, '参数');
    await input.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.resolve('docs/screenshots/math-expression-overflow.png') });
    expect(errors, errors.join(' | ')).toEqual([]);
  });

  test('P02 rejects 1/0 visibly while the experiment keeps its last valid value', async ({ page }) => {
    const errors = collectErrors(page);
    await page.setViewportSize({ width: 1194, height: 834 });
    await page.goto('/#/particle/uniform-b');
    await page.getByTestId('p02-stage').waitFor();
    await openTab(page, '参数');
    const input = page.getByLabel('磁感应强度 |B|数值（T）');
    await input.fill('1/0');
    await input.blur();
    await expect(input).toHaveValue('1/0');
    await expect(page.getByText(/除数不能为 0/)).toBeVisible();
    await expect(page.getByText(/当前实验仍为 0\.5 T/)).toBeVisible();
    await input.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.resolve('docs/screenshots/math-expression-error.png') });
    await openTab(page, '数据');
    await expect(page.getByTestId('p02-radius')).toContainText('25 cm');
    expect(errors, errors.join(' | ')).toEqual([]);
  });

  test('π shortcut and portrait/landscape layouts remain usable without overflow', async ({ page }) => {
    const errors = collectErrors(page);
    await page.setViewportSize({ width: 1194, height: 834 });
    await page.goto('/#/particle/uniform-b');
    await page.getByTestId('p02-stage').waitFor();
    await openTab(page, '参数');
    const input = page.getByLabel('磁感应强度 |B|数值（T）');
    await input.scrollIntoViewIfNeeded();
    await input.focus();
    await expect(page.getByRole('button', { name: '插入圆周率 π' })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await page.screenshot({ path: path.resolve('docs/screenshots/math-landscape.png') });

    await page.setViewportSize({ width: 768, height: 1024 });
    await page.waitForTimeout(250);
    await expectNoHorizontalOverflow(page);
    await input.scrollIntoViewIfNeeded();
    await input.focus();
    await input.fill('');
    await page.getByRole('button', { name: '插入圆周率 π' }).click();
    await page.keyboard.type('/10');
    await page.keyboard.press('Enter');
    await expect(input).toHaveValue('π/10');
    await page.screenshot({ path: path.resolve('docs/screenshots/math-portrait.png') });
    expect(errors, errors.join(' | ')).toEqual([]);
  });
});

test.describe('multi-particle and continuous-manual semantics', () => {
  test('P07 multi: editing A with v = √3 m/s keeps B/C launch times and motion', async ({ page }) => {
    const errors = collectErrors(page);
    await page.setViewportSize({ width: 1194, height: 834 });
    await page.goto('/#/particle/beamline?preset=p07-multi');
    await page.getByTestId('p07-stage').waitFor();
    await page.getByTestId('play-toggle').click();
    await page.waitForTimeout(420);
    const beforeB = await page.getByTestId('p07-particle-B').evaluate((element) => ({
      launch: element.getAttribute('data-launch-time'),
      x: element.getAttribute('data-x'),
    }));
    const beforeC = await page.getByTestId('p07-particle-C').evaluate((element) => ({
      launch: element.getAttribute('data-launch-time'),
      x: element.getAttribute('data-x'),
    }));
    await openTab(page, '参数');
    await fillExpression(page, '初速度大小 v₀数值（m/s）', '√3');
    await page.waitForTimeout(260);
    const afterA = await page.getByTestId('p07-particle-A').evaluate((element) => ({
      launch: element.getAttribute('data-launch-time'),
      x: element.getAttribute('data-x'),
    }));
    const afterB = await page.getByTestId('p07-particle-B').evaluate((element) => ({
      launch: element.getAttribute('data-launch-time'),
      x: element.getAttribute('data-x'),
    }));
    const afterC = await page.getByTestId('p07-particle-C').evaluate((element) => ({
      launch: element.getAttribute('data-launch-time'),
      x: element.getAttribute('data-x'),
    }));
    expect(Number(afterA.launch)).toBeGreaterThan(0);
    expect(afterB.launch).toBe(beforeB.launch);
    expect(afterC.launch).toBe(beforeC.launch);
    expect(Number(afterB.x)).not.toBe(Number(beforeB.x));
    expect(Number(afterC.x)).not.toBe(Number(beforeC.x));
    await expect(page.getByLabel('初速度大小 v₀数值（m/s）')).toHaveValue('√3');
    await page.screenshot({ path: path.resolve('docs/screenshots/math-p07-multi.png') });
    expect(errors, errors.join(' | ')).toEqual([]);
  });

  test('I01 manual: a √2 T target ramps instead of creating an infinite EMF jump', async ({ page }) => {
    const errors = collectErrors(page);
    await page.setViewportSize({ width: 1194, height: 834 });
    await page.goto('/#/induction/flux-lenz?preset=i01-field-manual');
    await page.getByTestId('i01-stage').waitFor();
    await page.getByTestId('play-toggle').click();
    await page.waitForTimeout(250);
    await openTab(page, '参数');
    await fillExpression(page, '实时目标 Bz数值（T）', '√2');
    await expect.poll(async () => Number(await page.getByTestId('i01-stage').getAttribute('data-bz')), { timeout: 4000 }).toBeCloseTo(Math.SQRT2, 2);
    const emf = Number(await page.getByTestId('i01-stage').getAttribute('data-emf'));
    expect(Number.isFinite(emf)).toBe(true);
    await expect(page.getByLabel('实时目标 Bz数值（T）')).toHaveValue('√2');
    await page.screenshot({ path: path.resolve('docs/screenshots/math-i01-manual.png') });
    expect(errors, errors.join(' | ')).toEqual([]);
  });
});
