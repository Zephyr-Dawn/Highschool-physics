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
  return page.getByTestId('p01-3d-stage').evaluate((element) => {
    const names = [
      'data-mode',
      'data-webgl',
      'data-camera-preset',
      'data-camera-azimuth',
      'data-camera-polar',
      'data-camera-distance',
      'data-selected',
      'data-particle-count',
      'data-q',
      'data-mass',
      'data-vx',
      'data-vy',
      'data-vz',
      'data-bx',
      'data-by',
      'data-bz',
      'data-fx',
      'data-fy',
      'data-fz',
      'data-force-mag',
      'data-theta-deg',
      'data-zero-reason',
      'data-force-hidden',
      'data-time',
      'data-edit-plane',
      'data-editing',
      'data-selected-waiting',
      'data-render-calls',
      'data-render-triangles',
      'data-render-lines',
    ];
    return Object.fromEntries(names.map((name) => [name, element.getAttribute(name)]));
  });
}

async function particleState(page: Page, label: string) {
  return page.getByTestId(`p01-3d-particle-${label}`).evaluate((element) => {
    const names = [
      'data-id',
      'data-launch-time',
      'data-tau',
      'data-waiting',
      'data-x',
      'data-y',
      'data-z',
      'data-vx',
      'data-vy',
      'data-vz',
      'data-initial-x',
      'data-initial-y',
      'data-initial-z',
      'data-initial-vx',
      'data-initial-vy',
      'data-initial-vz',
      'data-charge-c',
      'data-mass-kg',
      'data-kind',
      'data-radius',
      'data-period',
      'data-pitch',
    ];
    return Object.fromEntries(names.map((name) => [name, element.getAttribute(name)]));
  });
}

async function waitFor3D(page: Page) {
  await page.getByTestId('p01-3d-stage').waitFor();
  await expect(page.locator('[data-testid="p01-3d-canvas"]')).toBeVisible();
  await expect
    .poll(async () => Number(await page.getByTestId('p01-3d-stage').getAttribute('data-render-triangles')), {
      timeout: 15_000,
    })
    .toBeGreaterThan(0);
}

async function dragEmptyStage(page: Page, dx = 70, dy = -35) {
  const canvas = page.locator('[data-testid="p01-3d-canvas"]');
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;
  const x = box.x + box.width * 0.73;
  const y = box.y + box.height * 0.34;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(160);
}

async function setTimeline(page: Page, value: number) {
  await page.getByTestId('timeline').evaluate((element, next) => {
    const input = element as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, String(next));
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
  await page.waitForTimeout(160);
}

async function dragVelocityHandle(page: Page, dx = 30, dy = -24) {
  const handle = page.getByTestId('p01-3d-handle-velocity');
  await expect(handle).toBeVisible();
  const box = await handle.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.waitForTimeout(80);
  await page.mouse.move(x + dx, y + dy, { steps: 8 });
  await page.waitForTimeout(120);
  await page.mouse.up();
  await page.waitForTimeout(160);
}

test('P01 3D force loads a real WebGL canvas with physically sourced vectors and can return to 2D', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/particle/lorentz-force');
  await waitFor3D(page);
  const state = await stageState(page);
  expect(state['data-webgl']).toBe('true');
  expect(state['data-mode']).toBe('force3d');
  expect(Number(state['data-q'])).toBe(2);
  expect(Number(state['data-vx'])).toBe(2);
  expect(Number(state['data-vz'])).toBe(1);
  expect(Number(state['data-bz'])).toBe(2);
  expect(Number(state['data-fx'])).toBeCloseTo(0, 8);
  expect(Number(state['data-fy'])).toBeCloseTo(-8, 8);
  expect(Number(state['data-fz'])).toBeCloseTo(0, 8);
  expect(Number(state['data-render-triangles'])).toBeGreaterThan(0);
  await expect(page.getByTestId('p01-3d-gizmo')).toBeVisible();
  await expect(page.getByTestId('p01-3d-handle-position')).toBeVisible();
  await expect(page.getByTestId('p01-3d-handle-velocity')).toBeVisible();
  await page.screenshot({ path: path.resolve('docs/screenshots/p01-3d-force-oblique.png') });

  await page.getByRole('button', { name: '2D 运动', exact: true }).click();
  await expect(page.getByTestId('p01-planar-page')).toBeVisible();
  await expect(page.getByTestId('p02-stage-svg')).toBeVisible();
  expect(errors, errors.join(' | ')).toEqual([]);
});

test('P01 3D orbit and pinch change only the camera, never physical state', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/particle/lorentz-force');
  await waitFor3D(page);
  const before = await stageState(page);
  await dragEmptyStage(page);
  const afterOrbit = await stageState(page);
  expect(Number(afterOrbit['data-camera-azimuth'])).not.toBeCloseTo(Number(before['data-camera-azimuth']), 1);
  expect(afterOrbit['data-camera-preset']).toBe('custom');
  for (const key of ['data-q', 'data-vx', 'data-vy', 'data-vz', 'data-bx', 'data-by', 'data-bz', 'data-time']) {
    expect(afterOrbit[key]).toBe(before[key]);
  }

  const cdp = await page.context().newCDPSession(page);
  const canvas = page.locator('[data-testid="p01-3d-canvas"]');
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;
  const y = box.y + box.height * 0.45;
  const x1 = box.x + box.width * 0.56;
  const x2 = box.x + box.width * 0.7;
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      { x: x1, y, id: 1 },
      { x: x2, y, id: 2 },
    ],
  });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [
      { x: x1 - 45, y, id: 1 },
      { x: x2 + 45, y, id: 2 },
    ],
  });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(220);
  const afterPinch = await stageState(page);
  expect(Number(afterPinch['data-camera-distance'])).not.toBeCloseTo(Number(afterOrbit['data-camera-distance']), 2);
  for (const key of ['data-q', 'data-vx', 'data-vy', 'data-vz', 'data-bx', 'data-by', 'data-bz', 'data-time', 'data-editing']) {
    expect(afterPinch[key]).toBe(before[key]);
  }
  expect(errors, errors.join(' | ')).toEqual([]);
});

test('P01 camera presets keep axis labels and physical signs consistent', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/particle/lorentz-force?preset=p01-3d-force-front');
  await waitFor3D(page);
  const physical = await stageState(page);
  expect(Number(physical['data-fy'])).toBeCloseTo(-24, 8);

  await page.getByTestId('p01-camera-front').click();
  await page.waitForTimeout(160);
  const front = await stageState(page);
  expect(front['data-camera-preset']).toBe('front');
  expect(Number(front['data-camera-azimuth'])).toBeCloseTo(0, 0);
  expect(Number(front['data-camera-polar'])).toBeCloseTo(90, 0);
  await expect(page.getByTestId('p01-3d-field-glyph')).toHaveAttribute('data-orientation', 'out-of-screen');
  await page.screenshot({ path: path.resolve('docs/screenshots/p01-3d-force-front.png') });

  await page.getByTestId('p01-camera-side').click();
  await page.waitForTimeout(160);
  const side = await stageState(page);
  expect(side['data-camera-preset']).toBe('side');
  expect(Math.abs(Number(side['data-camera-azimuth']))).toBeGreaterThan(80);

  await page.getByTestId('p01-camera-top').click();
  await page.waitForTimeout(160);
  const top = await stageState(page);
  expect(top['data-camera-preset']).toBe('top');
  expect(Number(top['data-camera-polar'])).toBeLessThan(15);

  await page.getByTestId('p01-camera-reset').click();
  await page.waitForTimeout(160);
  const reset = await stageState(page);
  expect(reset['data-camera-preset']).toBe('reset');
  expect(Number(reset['data-camera-azimuth'])).toBeGreaterThan(20);
  for (const key of ['data-q', 'data-vx', 'data-vy', 'data-vz', 'data-bx', 'data-by', 'data-bz', 'data-fx', 'data-fy', 'data-fz']) {
    expect(reset[key]).toBe(physical[key]);
  }
  await page.screenshot({ path: path.resolve('docs/screenshots/p01-3d-force-top.png') });
  expect(errors, errors.join(' | ')).toEqual([]);
});

test('P01 3D motion shows exact helix values and component edits update R and pitch', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/particle/lorentz-force?preset=p01-motion3d-helix');
  await waitFor3D(page);
  await expect(page.getByTestId('p01-3d-stage')).toHaveAttribute('data-mode', 'motion3d');
  const helix = await particleState(page, 'A');
  expect(helix['data-kind']).toBe('helix');
  expect(Number(helix['data-radius'])).toBeCloseTo(1, 8);
  expect(Number(helix['data-period'])).toBeCloseTo(2 * Math.PI, 8);
  expect(Number(helix['data-pitch'])).toBeCloseTo(2 * Math.PI, 8);
  await page.screenshot({ path: path.resolve('docs/screenshots/p01-3d-helix-oblique.png') });

  await page.getByTestId('play-toggle').click();
  await page.waitForTimeout(360);
  const launchBeforeEdit = Number((await particleState(page, 'A'))['data-launch-time']);
  await page.getByRole('tab', { name: /参数/ }).click();
  const vxInput = page.getByLabel('初速度 vx数值（m/s）');
  await vxInput.fill('2');
  await vxInput.blur();
  await page.waitForTimeout(220);
  const changed = await particleState(page, 'A');
  expect(Number(changed['data-initial-vx'])).toBe(2);
  expect(Number(changed['data-initial-vz'])).toBeCloseTo(1, 8);
  expect(Number(changed['data-radius'])).toBeCloseTo(2, 8);
  expect(Number(changed['data-pitch'])).toBeCloseTo(2 * Math.PI, 8);
  expect(Number(changed['data-launch-time'])).toBeGreaterThan(launchBeforeEdit);
  expect(Number((await stageState(page))['data-time'])).toBeGreaterThan(0);

  await page.getByTestId('p01-edit-plane-XY').click();
  await dragVelocityHandle(page);
  const afterHandle = await particleState(page, 'A');
  expect(Number(afterHandle['data-initial-vz'])).toBeCloseTo(1, 8);
  expect(Number(afterHandle['data-initial-vx'])).not.toBeCloseTo(1, 2);
  await expect(page.getByTestId('p01-3d-stage')).toHaveAttribute('data-editing', 'false');
  await page.getByTestId('play-toggle').click();
  await page.getByTestId('p01-camera-front').click();
  await page.waitForTimeout(180);
  await page.screenshot({ path: path.resolve('docs/screenshots/p01-3d-helix-front.png') });
  expect(errors, errors.join(' | ')).toEqual([]);
});

test('P01 3D motion play, pause, scrub and keyframe step stay analytically consistent', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/particle/lorentz-force?preset=p01-motion3d-helix');
  await waitFor3D(page);
  await page.getByTestId('play-toggle').click();
  await page.waitForTimeout(450);
  const playing = await stageState(page);
  expect(Number(playing['data-time'])).toBeGreaterThan(0);
  expect(
    Math.hypot(
      Number(playing['data-vx']),
      Number(playing['data-vy']),
      Number(playing['data-vz']),
    ),
  ).toBeCloseTo(Math.sqrt(2), 6);
  expect(Number(playing['data-force-mag'])).toBeCloseTo(1, 8);
  await page.getByTestId('play-toggle').click();
  const paused = await stageState(page);
  expect(Number(paused['data-time'])).toBeGreaterThanOrEqual(Number(playing['data-time']));
  await page.waitForTimeout(180);
  const stillPaused = await stageState(page);
  expect(stillPaused['data-time']).toBe(paused['data-time']);

  await setTimeline(page, 2);
  const atTwo = await stageState(page);
  expect(Number(atTwo['data-time'])).toBeCloseTo(2, 2);
  const particle = await particleState(page, 'A');
  expect(Number(particle['data-x'])).toBeCloseTo(Math.sin(2), 5);
  expect(Number(particle['data-y'])).toBeCloseTo(-(1 - Math.cos(2)), 5);
  expect(Number(particle['data-z'])).toBeCloseTo(2, 5);
  expect(Number(particle['data-radius'])).toBeCloseTo(1, 8);
  expect(Number(particle['data-period'])).toBeCloseTo(2 * Math.PI, 8);

  await page.getByTestId('next-keyframe').click();
  await page.waitForTimeout(120);
  const stepped = await stageState(page);
  expect(Number(stepped['data-time'])).toBeGreaterThan(2);
  await page.getByRole('tab', { name: /数据/ }).click();
  await expect(page.getByTestId('p01-3d-radius')).toContainText('m');
  await expect(page.getByTestId('p01-3d-pitch')).toContainText('m');
  await page.screenshot({ path: path.resolve('docs/screenshots/p01-3d-helix-mid.png') });
  expect(errors, errors.join(' | ')).toEqual([]);
});

test('P01 3D multi-particle edit A only, while B and C continue on the same clock', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/particle/lorentz-force?preset=p01-motion3d-live-edit');
  await waitFor3D(page);
  const initialB = await particleState(page, 'B');
  const initialC = await particleState(page, 'C');
  const initialA = await particleState(page, 'A');
  await page.getByTestId('play-toggle').click();
  await page.waitForTimeout(420);
  const movingB = await particleState(page, 'B');
  const movingC = await particleState(page, 'C');
  expect(Number(movingB['data-x'])).not.toBe(Number(initialB['data-x']));
  expect(Number(movingC['data-x'])).not.toBe(Number(initialC['data-x']));

  await page.getByRole('tab', { name: /参数/ }).click();
  await page.getByLabel('初速度 vx数值（m/s）').fill('2.5');
  await page.getByLabel('初速度 vx数值（m/s）').blur();
  await page.waitForTimeout(220);
  const afterB = await particleState(page, 'B');
  const afterC = await particleState(page, 'C');
  const afterA = await particleState(page, 'A');
  expect(afterB['data-launch-time']).toBe(initialB['data-launch-time']);
  expect(afterC['data-launch-time']).toBe(initialC['data-launch-time']);
  expect(Number(afterA['data-launch-time'])).toBeGreaterThan(Number(initialA['data-launch-time']));
  expect(Number(afterB['data-x'])).not.toBe(Number(movingB['data-x']));
  expect(Number(afterC['data-x'])).not.toBe(Number(movingC['data-x']));
  await page.screenshot({ path: path.resolve('docs/screenshots/p01-3d-live-edit-a.png') });
  expect(errors, errors.join(' | ')).toEqual([]);
});

test('P01 3D waiting state, five-particle limit, overlap selection and teacher overlay', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/particle/lorentz-force?preset=p01-motion3d-waiting');
  await waitFor3D(page);
  const before = await particleState(page, 'B');
  expect(before['data-waiting']).toBe('true');
  expect(before['data-tau']).toBe('');
  await expect(page.getByTestId('particle-chip-p2')).toContainText('待发射');

  await setTimeline(page, 1.6);
  const after = await particleState(page, 'B');
  expect(after['data-waiting']).toBe('false');
  expect(Number(after['data-tau'])).toBeGreaterThan(0);

  await page.getByTestId('particle-add').click();
  await page.getByTestId('particle-add').click();
  await expect(page.getByTestId('p01-3d-stage')).toHaveAttribute('data-particle-count', '5');
  await expect(page.getByTestId('particle-add')).toBeDisabled();
  await expect(page.getByTestId('particle-duplicate')).toBeDisabled();
  await page.getByTestId('particle-chip-p2').click();
  await expect(page.getByTestId('p01-3d-stage')).toHaveAttribute('data-selected', 'B');

  await page.getByRole('button', { name: '教师视图', exact: true }).click();
  await expect(page.getByTestId('p01-3d-stage')).toBeVisible();
  await expect(page.locator('.teacher-layer-bar')).toBeVisible();
  await page.getByRole('button', { name: '全部', exact: true }).click();
  await page.getByTestId('particle-chip-p1').click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.resolve('docs/screenshots/p01-3d-five-particles.png') });
  await page.screenshot({ path: path.resolve('docs/screenshots/p01-3d-teacher.png') });
  expect(errors, errors.join(' | ')).toEqual([]);
});

test('P01 shared B change restarts all particles but camera-only gestures do not', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/particle/lorentz-force?preset=p01-motion3d-restart');
  await waitFor3D(page);
  await page.getByTestId('play-toggle').click();
  await page.waitForTimeout(480);
  await page.getByTestId('play-toggle').click();
  const beforeCamera = await stageState(page);
  expect(Number(beforeCamera['data-time'])).toBeGreaterThan(0);
  await dragEmptyStage(page, 55, -18);
  await page.waitForTimeout(700);
  const afterOrbit = await stageState(page);
  expect(Number(afterOrbit['data-time'])).toBe(Number(beforeCamera['data-time']));
  expect(Number(afterOrbit['data-camera-azimuth'])).not.toBeCloseTo(Number(beforeCamera['data-camera-azimuth']), 1);

  await page.getByRole('tab', { name: /参数/ }).click();
  const bzInput = page.getByLabel('Bz数值（T）');
  await bzInput.fill('-1');
  await bzInput.blur();
  await page.waitForTimeout(260);
  const restarted = await stageState(page);
  expect(Number(restarted['data-bz'])).toBe(-1);
  expect(Number(restarted['data-time'])).toBeLessThan(0.15);
  expect(restarted['data-camera-preset']).toBe('custom');
  expect(Math.abs(Number(restarted['data-camera-azimuth']) - Number(afterOrbit['data-camera-azimuth']))).toBeLessThan(1.5);
  for (const label of ['A', 'B', 'C']) {
    const particle = await particleState(page, label);
    expect(Number(particle['data-launch-time'])).toBe(0);
  }
  expect(errors, errors.join(' | ')).toEqual([]);
});

test('P01 front, side and oblique screenshots are different perspectives of the same scene', async ({ page }) => {
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/particle/lorentz-force?preset=p01-3d-force-oblique');
  await waitFor3D(page);
  const physical = await stageState(page);
  await page.getByTestId('p01-camera-front').click();
  await page.waitForTimeout(180);
  const front = await page.locator('[data-testid="p01-3d-stage"]').screenshot({
    path: path.resolve('docs/screenshots/p01-3d-perspective-front.png'),
  });
  await page.getByTestId('p01-camera-side').click();
  await page.waitForTimeout(180);
  const side = await page.locator('[data-testid="p01-3d-stage"]').screenshot({
    path: path.resolve('docs/screenshots/p01-3d-perspective-side.png'),
  });
  await page.getByTestId('p01-camera-oblique').click();
  await page.waitForTimeout(180);
  const oblique = await page.locator('[data-testid="p01-3d-stage"]').screenshot({
    path: path.resolve('docs/screenshots/p01-3d-perspective-oblique.png'),
  });
  expect(front.equals(side)).toBe(false);
  expect(side.equals(oblique)).toBe(false);
  expect(front.equals(oblique)).toBe(false);
  const after = await stageState(page);
  for (const key of ['data-q', 'data-vx', 'data-vy', 'data-vz', 'data-fx', 'data-fy', 'data-fz', 'data-time']) {
    expect(after[key]).toBe(physical[key]);
  }
});

test('P01 negative charge flips the 3D force while B and v stay fixed', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/particle/lorentz-force?preset=p01-3d-force-negative');
  await waitFor3D(page);
  await page.getByTestId('p01-camera-front').click();
  await page.waitForTimeout(180);
  const state = await stageState(page);
  expect(Number(state['data-q'])).toBe(-2);
  expect(Number(state['data-vx'])).toBe(3);
  expect(Number(state['data-bz'])).toBe(4);
  expect(Number(state['data-fy'])).toBeCloseTo(24, 8);
  await expect(page.getByTestId('p01-3d-field-glyph')).toHaveAttribute('data-orientation', 'out-of-screen');
  await page.screenshot({ path: path.resolve('docs/screenshots/p01-3d-force-negative-charge.png') });
  expect(errors, errors.join(' | ')).toEqual([]);
});

test('P01 overlapping 3D particles remain selectable from the roster and teacher overlay', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/particle/lorentz-force?preset=p01-motion3d-sign');
  await waitFor3D(page);
  const a = await particleState(page, 'A');
  const b = await particleState(page, 'B');
  expect(Number(a['data-x'])).toBeCloseTo(Number(b['data-x']), 8);
  expect(Number(a['data-y'])).toBeCloseTo(Number(b['data-y']), 8);
  await page.getByTestId('particle-chip-p2').click();
  await expect(page.getByTestId('p01-3d-stage')).toHaveAttribute('data-selected', 'B');
  await expect(page.getByTestId('p01-3d-stage')).toHaveAttribute('data-q', '-1');
  await page.getByRole('button', { name: '教师视图', exact: true }).click();
  const allVectors = page.locator('.teacher-layer-bar').getByRole('button', { name: '全部矢量', exact: true });
  if ((await allVectors.getAttribute('aria-pressed')) === 'false') await allVectors.click();
  await expect(allVectors).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({ path: path.resolve('docs/screenshots/p01-3d-overlap-teacher.png') });
  expect(errors, errors.join(' | ')).toEqual([]);
});

test('P01 3D touch handle drag commits, while a second finger cancels safely', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1194, height: 834 }, hasTouch: true });
  const page = await context.newPage();
  const errors = collectErrors(page);
  const cdp = await context.newCDPSession(page);
  await page.goto('/#/particle/lorentz-force?preset=p01-motion3d-helix');
  await waitFor3D(page);
  await page.getByTestId('play-toggle').click();
  await page.waitForTimeout(300);
  const before = await particleState(page, 'A');
  expect(Number(before['data-radius'])).toBeCloseTo(1, 8);
  const handle = page.getByTestId('p01-3d-handle-velocity');
  await expect(handle).toBeVisible();
  const firstBox = await handle.boundingBox();
  expect(firstBox).not.toBeNull();
  if (!firstBox) return;
  const x = firstBox.x + firstBox.width / 2;
  const y = firstBox.y + firstBox.height / 2;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
  await page.waitForTimeout(90);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: x + 26, y: y - 18, id: 1 }],
  });
  await page.waitForTimeout(120);
  await expect(page.getByTestId('p01-3d-stage')).toHaveAttribute('data-editing', 'true');
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      { x: x + 26, y: y - 18, id: 1 },
      { x: x + 80, y: y + 22, id: 2 },
    ],
  });
  await page.waitForTimeout(180);
  await expect(page.getByTestId('p01-3d-stage')).toHaveAttribute('data-editing', 'false');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const afterCancel = await particleState(page, 'A');
  expect(Number(afterCancel['data-radius'])).toBeCloseTo(1, 8);
  expect(afterCancel['data-launch-time']).toBe(before['data-launch-time']);

  const secondBox = await handle.boundingBox();
  expect(secondBox).not.toBeNull();
  if (!secondBox) return;
  const x2 = secondBox.x + secondBox.width / 2;
  const y2 = secondBox.y + secondBox.height / 2;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x2, y: y2, id: 3 }] });
  await page.waitForTimeout(80);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: x2 + 28, y: y2 - 20, id: 3 }],
  });
  await page.waitForTimeout(100);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(220);
  const afterDrag = await particleState(page, 'A');
  expect(Number(afterDrag['data-radius'])).not.toBeCloseTo(1, 2);
  expect(Number(afterDrag['data-launch-time'])).toBeGreaterThan(Number(before['data-launch-time']));
  expect(errors, errors.join(' | ')).toEqual([]);
  await context.close();
});

test('P01 WebGL fallback keeps the 2D force view and the rest of the app usable', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1024, height: 768 } });
  const page = await context.newPage();
  const errors = collectErrors(page);
  await page.goto('/#/particle/lorentz-force?p01-webgl=off');
  await expect(page.getByTestId('p01-3d-fallback')).toBeVisible();
  await expect(page.getByTestId('p01-force-stage-svg')).toBeVisible();
  await expect(page.getByTestId('p01-force-stage')).toHaveAttribute('data-q', '2');
  await page.screenshot({ path: path.resolve('docs/screenshots/p01-3d-fallback.png') });
  await page.getByRole('button', { name: '切换到二维运动' }).click();
  await expect(page.getByTestId('p01-planar-page')).toBeVisible();
  await page.goto('/#/particle/uniform-b');
  await expect(page.getByTestId('p02-stage-svg')).toBeVisible();
  expect(errors, errors.join(' | ')).toEqual([]);
  await context.close();
});

test('P01 WebGL context loss is caught and replaced by a clear fallback', async ({ page }) => {
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/particle/lorentz-force');
  await waitFor3D(page);
  await page.locator('[data-testid="p01-3d-canvas"]').evaluate((canvas) => {
    canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
  });
  await expect(page.getByTestId('p01-3d-fallback')).toBeVisible();
  await expect(page.getByTestId('p01-force-stage-svg')).toBeVisible();
  await page.goto('/#/practice');
  await expect(page.locator('.question-card').first()).toBeVisible();
});

test('P01 3D tablet viewports fit without overflow and keep the canvas usable', async ({ browser }) => {
  const viewports = [
    { width: 1024, height: 768 },
    { width: 1194, height: 834 },
    { width: 768, height: 1024 },
    { width: 810, height: 1080 },
  ];
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    const errors = collectErrors(page);
    await page.goto('/#/particle/lorentz-force?preset=p01-motion3d-helix');
    await waitFor3D(page);
    await expectNoHorizontalOverflow(page);
    const stageBox = await page.getByTestId('p01-3d-stage').boundingBox();
    expect(stageBox).not.toBeNull();
    await page.screenshot({
      path: path.resolve(`docs/screenshots/p01-3d-${viewport.width}x${viewport.height}.png`),
    });
    if (stageBox) {
      expect(stageBox.height).toBeGreaterThan(260);
      expect(stageBox.width).toBeLessThanOrEqual(viewport.width + 1);
    }
    if (viewport.width === 768) {
      await page.screenshot({ path: path.resolve('docs/screenshots/p01-3d-portrait.png') });
    }
    expect(errors, errors.join(' | ')).toEqual([]);
    await context.close();
  }
});
