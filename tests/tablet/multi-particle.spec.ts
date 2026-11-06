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

async function particleState(page: Page, model: 'p02' | 'p03', label: string) {
  const group = page.getByTestId(`${model}-particle-${label}`);
  await expect(group).toHaveCount(1);
  const attrs = await group.evaluate((el) => {
    const names = [
      'data-status',
      'data-launch-time',
      'data-tau',
      'data-x',
      'data-y',
      'data-start-x',
      'data-start-y',
      'data-vx0',
      'data-vy0',
      'data-entry-time-s',
      'data-exit-time-s',
      'data-field-time-s',
    ];
    return Object.fromEntries(names.map((name) => [name, el.getAttribute(name)]));
  });
  return attrs;
}

test.describe('P02 multi-particle live editing', () => {
  test('three real particles share one stage and editing A keeps B/C moving', async ({ page }) => {
    const errors = collectErrors(page);
    await page.setViewportSize({ width: 1194, height: 834 });
    await page.goto('/#/particle/uniform-b?preset=p02-multi-radius');
    const stage = page.getByTestId('p02-stage');
    await expect(stage).toHaveAttribute('data-particle-count', '2');
    await page.getByTestId('particle-add').click();
    await expect(stage).toHaveAttribute('data-particle-count', '3');
    await page.getByTestId('particle-chip-p1').click();
    await page.getByRole('button', { name: '0.25×' }).click();
    await page.getByTestId('play-toggle').click();
    await page.waitForTimeout(350);
    const sim = page.locator('.sim-page');
    await expect(sim).toHaveAttribute('data-sim-playing', 'true');
    await page.screenshot({ path: path.resolve('docs/screenshots/p02-multi-3.png') });

    const bBefore = await particleState(page, 'p02', 'B');
    const cBefore = await particleState(page, 'p02', 'C');
    const aStartBefore = await stage.getAttribute('data-initial-start-x');

    let previewAtDown = '';
    await dragHandle(page, 'p02-start-handle-hit', 52, 26, {
      afterDown: async () => {
        await expect(sim).toHaveAttribute('data-sim-editing', 'true');
        await expect(sim).toHaveAttribute('data-sim-playing', 'true');
        await expect(page.getByTestId('p02-preview-orbit')).toBeVisible();
        await expect(page.getByTestId('p02-condition-notice')).toContainText('其他粒子继续运动');
        previewAtDown = (await page.getByTestId('p02-preview-orbit').getAttribute('data-center-x-m')) ?? '';
        expect(Number(await page.getByTestId('timeline').inputValue())).toBeGreaterThan(0);
      },
      beforeUp: async () => {
        const previewAfter = await page.getByTestId('p02-preview-orbit').getAttribute('data-center-x-m');
        expect(previewAfter).not.toBe(previewAtDown);
        const bDuring = await particleState(page, 'p02', 'B');
        const cDuring = await particleState(page, 'p02', 'C');
        expect(Number(bDuring['data-x'])).not.toBeCloseTo(Number(bBefore['data-x']), 9);
        expect(Number(cDuring['data-x'])).not.toBeCloseTo(Number(cBefore['data-x']), 9);
        expect(bDuring['data-launch-time']).toBe(bBefore['data-launch-time']);
        expect(cDuring['data-launch-time']).toBe(cBefore['data-launch-time']);
        expect(bDuring['data-start-x']).toBe(bBefore['data-start-x']);
        expect(cDuring['data-start-y']).toBe(cBefore['data-start-y']);
        await page.screenshot({ path: path.resolve('docs/screenshots/p02-multi-edit.png') });
      },
    });

    await expect(sim).toHaveAttribute('data-sim-playing', 'true');
    await expect(sim).toHaveAttribute('data-sim-editing', 'false');
    await page.waitForTimeout(250);
    const aAfter = await particleState(page, 'p02', 'A');
    const bAfter = await particleState(page, 'p02', 'B');
    const cAfter = await particleState(page, 'p02', 'C');
    expect(Number(aAfter['data-launch-time'])).toBeGreaterThan(0);
    expect(bAfter['data-launch-time']).toBe(bBefore['data-launch-time']);
    expect(cAfter['data-launch-time']).toBe(cBefore['data-launch-time']);
    expect(await stage.getAttribute('data-initial-start-x')).not.toBe(aStartBefore);
    const positions = [
      `${aAfter['data-x']},${aAfter['data-y']}`,
      `${bAfter['data-x']},${bAfter['data-y']}`,
      `${cAfter['data-x']},${cAfter['data-y']}`,
    ];
    expect(new Set(positions).size).toBe(3);
    await page.getByRole('tab', { name: /数据/ }).click();
    await expect(page.getByTestId('p02-compare-row-A')).toBeVisible();
    await expect(page.getByTestId('p02-compare-row-B')).toBeVisible();
    await expect(page.getByTestId('p02-compare-row-C')).toBeVisible();
    await page.getByRole('tab', { name: /参数/ }).click();
    const fieldInput = page.getByLabel('磁感应强度 |B|数值（T）');
    await fieldInput.fill('0.8');
    await fieldInput.blur();
    await expect(sim).toHaveAttribute('data-sim-playing', 'true');
    await expect(page.getByTestId('p02-condition-notice')).toContainText('场条件改变');
    await page.waitForTimeout(180);
    for (const label of ['A', 'B', 'C']) {
      expect(Number((await particleState(page, 'p02', label))['data-launch-time'])).toBe(0);
    }
    expect(Number(await page.getByTestId('timeline').inputValue())).toBeGreaterThan(0);
    expect(errors, errors.join(' | ')).toEqual([]);
  });

  test('five particles remain usable in landscape and portrait, including teacher vectors', async ({ page }) => {
    const errors = collectErrors(page);
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto('/#/particle/uniform-b');
    await page.getByTestId('p02-stage-svg').waitFor();
    for (let index = 0; index < 4; index++) await page.getByTestId('particle-add').click();
    await expect(page.getByTestId('p02-stage')).toHaveAttribute('data-particle-count', '5');
    await expect(page.getByTestId('particle-add')).toBeDisabled();
    await expectNoHorizontalOverflow(page);
    await page.screenshot({ path: path.resolve('docs/screenshots/p02-multi-5.png') });

    await page.setViewportSize({ width: 768, height: 1024 });
    await page.waitForTimeout(300);
    await expectNoHorizontalOverflow(page);
    const stageBox = await page.getByTestId('p02-stage').boundingBox();
    expect(stageBox?.width ?? 0).toBeGreaterThan(300);
    await expect(page.getByTestId('particle-roster')).toBeVisible();
    await page.screenshot({ path: path.resolve('docs/screenshots/p02-multi-5-portrait.png') });

    await page.getByRole('button', { name: /教师视图/ }).click();
    await page.waitForTimeout(300);
    const layerBar = page.locator('.teacher-layer-bar');
    await expect(layerBar).toBeVisible();
    await layerBar.getByRole('button', { name: '全部矢量', exact: true }).click();
    await expect(layerBar.getByRole('button', { name: '全部矢量', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.screenshot({ path: path.resolve('docs/screenshots/p02-multi-teacher.png') });

    await page.goto('/#/particle/half-plane');
    await page.getByTestId('p03-stage-svg').waitFor();
    for (let index = 0; index < 4; index++) await page.getByTestId('particle-add').click();
    await expect(page.getByTestId('p03-stage')).toHaveAttribute('data-particle-count', '5');
    await expectNoHorizontalOverflow(page);
    await page.screenshot({ path: path.resolve('docs/screenshots/p03-multi-5-portrait.png') });
    expect(errors, errors.join(' | ')).toEqual([]);
  });

  test('P03 mixed events stay independent and editing A keeps B/C event state', async ({ page }) => {
    const errors = collectErrors(page);
    await page.setViewportSize({ width: 1194, height: 834 });
    await page.goto('/#/particle/half-plane?preset=p03-multi-mixed');
    const stage = page.getByTestId('p03-stage');
    await expect(stage).toHaveAttribute('data-particle-count', '3');
    await expect(page.getByTestId('p03-particle-A')).toHaveAttribute('data-status', 'entered-and-exited');
    await expect(page.getByTestId('p03-particle-B')).toHaveAttribute('data-status', 'tangent-no-exit');
    await expect(page.getByTestId('p03-particle-C')).toHaveAttribute('data-status', 'no-entry');
    await expect(page.getByTestId('p03-particle-B-exit')).toHaveCount(0);
    await expect(page.getByTestId('p03-particle-C-entry')).toHaveCount(0);
    await page.screenshot({ path: path.resolve('docs/screenshots/p03-multi-mixed.png') });

    await page.getByRole('button', { name: '0.25×' }).click();
    await page.getByTestId('play-toggle').click();
    await page.waitForTimeout(300);
    const bBefore = await particleState(page, 'p03', 'B');
    const cBefore = await particleState(page, 'p03', 'C');
    await dragHandle(page, 'p03-start-handle-hit', 48, 22, {
      afterDown: async () => {
        await expect(page.locator('.sim-page')).toHaveAttribute('data-sim-playing', 'true');
        await expect(page.locator('.sim-page')).toHaveAttribute('data-sim-editing', 'true');
        await expect(page.getByTestId('p03-preview-path')).toBeVisible();
        await expect(page.getByTestId('p03-particle-B')).toHaveAttribute('data-status', 'tangent-no-exit');
        await expect(page.getByTestId('p03-particle-C')).toHaveAttribute('data-status', 'no-entry');
      },
      beforeUp: async () => {
        const bDuring = await particleState(page, 'p03', 'B');
        const cDuring = await particleState(page, 'p03', 'C');
        expect(bDuring['data-status']).toBe(bBefore['data-status']);
        expect(cDuring['data-status']).toBe(cBefore['data-status']);
        expect(bDuring['data-launch-time']).toBe(bBefore['data-launch-time']);
        expect(Number(bDuring['data-x'])).not.toBeCloseTo(Number(bBefore['data-x']), 9);
        expect(cDuring['data-entry-time-s']).toBe('');
        await page.screenshot({ path: path.resolve('docs/screenshots/p03-multi-edit.png') });
      },
    });
    await page.waitForTimeout(200);
    await expect(page.locator('.sim-page')).toHaveAttribute('data-sim-playing', 'true');
    const aAfter = await particleState(page, 'p03', 'A');
    const bAfter = await particleState(page, 'p03', 'B');
    const cAfter = await particleState(page, 'p03', 'C');
    expect(Number(aAfter['data-launch-time'])).toBeGreaterThan(0);
    expect(bAfter['data-status']).toBe('tangent-no-exit');
    expect(cAfter['data-status']).toBe('no-entry');
    expect(bAfter['data-launch-time']).toBe(bBefore['data-launch-time']);
    await page.getByRole('tab', { name: /数据/ }).click();
    await expect(page.getByTestId('p03-compare-row-A')).toContainText('出场');
    await expect(page.getByTestId('p03-compare-row-B')).toContainText('相切');
    await expect(page.getByTestId('p03-compare-row-C')).toContainText('无有效入场');
    await page.screenshot({ path: path.resolve('docs/screenshots/p03-multi-compare.png') });
    await page.getByRole('button', { name: /教师视图/ }).click();
    await page.waitForTimeout(250);
    const bar = page.locator('.teacher-layer-bar');
    await bar.getByRole('button', { name: '全部矢量', exact: true }).click();
    await bar.getByRole('button', { name: '全部圆心', exact: true }).click();
    await page.screenshot({ path: path.resolve('docs/screenshots/p03-multi-teacher.png') });
    expect(errors, errors.join(' | ')).toEqual([]);
  });

  test('P03 shared boundary preview updates all predictions and commits a full reset', async ({ page }) => {
    const errors = collectErrors(page);
    await page.setViewportSize({ width: 1194, height: 834 });
    await page.goto('/#/particle/half-plane?preset=p03-multi-mixed');
    await page.getByTestId('p03-stage-svg').waitFor();
    await page.getByTestId('play-toggle').click();
    await page.waitForTimeout(220);
    const stage = page.getByTestId('p03-stage');
    const boundaryBefore = Number(await stage.getAttribute('data-boundary-x'));
    const entryBefore = (await particleState(page, 'p03', 'A'))['data-entry-time-s'];

    await dragHandle(page, 'p03-boundary-handle-hit', 36, 0, {
      afterDown: async () => {
        await expect(page.locator('.sim-page')).toHaveAttribute('data-sim-playing', 'false');
        await expect(page.locator('.sim-page')).toHaveAttribute('data-sim-editing', 'true');
        await expect(page.getByTestId('p03-condition-notice')).toContainText('公共场预览中');
      },
      beforeUp: async () => {
        const boundaryDuring = Number(await stage.getAttribute('data-boundary-x'));
        expect(boundaryDuring).not.toBeCloseTo(boundaryBefore, 9);
        const aDuring = await particleState(page, 'p03', 'A');
        expect(aDuring['data-entry-time-s']).not.toBe(entryBefore);
        await expect(page.getByTestId('p03-particle-A')).toHaveCount(1);
        await expect(page.getByTestId('p03-particle-B')).toHaveCount(1);
        await expect(page.getByTestId('p03-particle-C')).toHaveCount(1);
        await page.screenshot({ path: path.resolve('docs/screenshots/p03-multi-field-preview.png') });
      },
    });
    await page.waitForTimeout(300);
    await expect(page.locator('.sim-page')).toHaveAttribute('data-sim-playing', 'true');
    await expect(page.getByTestId('p03-condition-notice')).toContainText('场条件改变');
    const aAfter = await particleState(page, 'p03', 'A');
    const bAfter = await particleState(page, 'p03', 'B');
    const cAfter = await particleState(page, 'p03', 'C');
    expect(Number(aAfter['data-launch-time'])).toBe(0);
    expect(Number(bAfter['data-launch-time'])).toBe(0);
    expect(Number(cAfter['data-launch-time'])).toBe(0);
    expect(Number(await page.getByTestId('timeline').inputValue())).toBeGreaterThan(0);
    expect(Number(await stage.getAttribute('data-boundary-x'))).not.toBeCloseTo(boundaryBefore, 9);
    await page.screenshot({ path: path.resolve('docs/screenshots/p03-multi-field-commit.png') });
    expect(errors, errors.join(' | ')).toEqual([]);
  });

  test('individual launch, global sync launch and time rewind preserve launch semantics', async ({ page }) => {
    const errors = collectErrors(page);
    await page.setViewportSize({ width: 1194, height: 834 });
    await page.goto('/#/particle/uniform-b');
    await page.getByTestId('p02-stage-svg').waitFor();
    await page.getByRole('button', { name: '0.25×' }).click();
    await page.getByTestId('play-toggle').click();
    await page.waitForTimeout(300);
    await page.getByTestId('particle-add').click();
    const a1 = await particleState(page, 'p02', 'A');
    const b1 = await particleState(page, 'p02', 'B');
    expect(Number(a1['data-launch-time'])).toBe(0);
    expect(Number(b1['data-launch-time'])).toBeGreaterThan(0);
    await page.getByTestId('particle-chip-p1').click();
    await page.getByTestId('particle-relaunch-selected').click();
    const a2 = await particleState(page, 'p02', 'A');
    const b2 = await particleState(page, 'p02', 'B');
    expect(Number(a2['data-launch-time'])).toBeGreaterThan(0);
    expect(b2['data-launch-time']).toBe(b1['data-launch-time']);

    await page.getByTestId('reset-playback').click();
    const a3 = await particleState(page, 'p02', 'A');
    const b3 = await particleState(page, 'p02', 'B');
    expect(a3['data-tau']).toBe('');
    expect(b3['data-tau']).toBe('');
    expect(await page.locator('.sim-page').getAttribute('data-sim-playing')).toBe('false');
    await page.getByTestId('particle-relaunch-all').click();
    const a4 = await particleState(page, 'p02', 'A');
    const b4 = await particleState(page, 'p02', 'B');
    expect(Number(a4['data-launch-time'])).toBe(0);
    expect(Number(b4['data-launch-time'])).toBe(0);
    expect(Number(await page.getByTestId('timeline').inputValue())).toBe(0);
    await page.getByTestId('play-toggle').click();
    await page.waitForTimeout(180);
    const timeBeforeClear = Number(await page.getByTestId('timeline').inputValue());
    const launchesBeforeClear = [
      (await particleState(page, 'p02', 'A'))['data-launch-time'],
      (await particleState(page, 'p02', 'B'))['data-launch-time'],
    ];
    await page.getByTestId('particle-clear-trail').click();
    expect(Number(await page.getByTestId('timeline').inputValue())).toBeGreaterThanOrEqual(timeBeforeClear);
    expect((await particleState(page, 'p02', 'A'))['data-launch-time']).toBe(launchesBeforeClear[0]);
    expect((await particleState(page, 'p02', 'B'))['data-launch-time']).toBe(launchesBeforeClear[1]);
    expect(errors, errors.join(' | ')).toEqual([]);
  });

  test('scene persists across reload and survives JSON export/import', async ({ page }) => {
    const errors = collectErrors(page);
    await page.setViewportSize({ width: 1194, height: 834 });
    await page.goto('/#/particle/uniform-b');
    await page.getByTestId('p02-stage-svg').waitFor();
    await page.getByTestId('particle-add').click();
    await page.getByTestId('particle-add').click();
    await expect(page.getByTestId('p02-stage')).toHaveAttribute('data-particle-count', '3');
    await page.waitForTimeout(400);
    await page.reload();
    await page.getByTestId('p02-stage-svg').waitFor();
    await expect(page.getByTestId('p02-stage')).toHaveAttribute('data-particle-count', '3');
    await expect(page.locator('.sim-page')).toHaveAttribute('data-sim-playing', 'false');
    expect(Number(await page.getByTestId('timeline').inputValue())).toBe(0);
    for (const label of ['A', 'B', 'C']) {
      expect(Number((await particleState(page, 'p02', label))['data-launch-time'])).toBe(0);
    }

    await page.getByRole('tab', { name: /参数/ }).click();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /导出场景 JSON/ }).click(),
    ]);
    const filePath = await download.path();
    expect(filePath).not.toBeNull();
    await page.getByTestId('particle-remove').click();
    await expect(page.getByTestId('p02-stage')).toHaveAttribute('data-particle-count', '2');
    if (filePath) {
      await page.getByTestId('p02-scene-import').setInputFiles(filePath);
      await expect(page.getByTestId('p02-stage')).toHaveAttribute('data-particle-count', '3');
    }
    await page.goto('/#/practice');
    await expect(page.locator('.question-card')).toHaveCount(132);
    expect(errors, errors.join(' | ')).toEqual([]);
  });

  test('overlapping particles can be selected from the list and pinch/second finger cancel a draft', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1024, height: 768 }, hasTouch: true });
    const page = await context.newPage();
    const errors = collectErrors(page);
    await page.goto('http://127.0.0.1:4173/#/particle/uniform-b');
    await page.getByTestId('p02-stage-svg').waitFor();
    await page.getByTestId('particle-duplicate').click();
    await expect(page.getByTestId('p02-stage')).toHaveAttribute('data-particle-count', '2');
    await page.getByTestId('particle-chip-p2').click();
    await expect(page.getByTestId('p02-stage')).toHaveAttribute('data-selected-id', 'p2');
    const startBefore = await page.getByTestId('p02-stage').getAttribute('data-initial-start-x');
    const scrollBefore = await page.evaluate(() => window.scrollY);
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    const handleBox = await page.getByTestId('p02-start-handle-hit').boundingBox();
    expect(handleBox).not.toBeNull();
    if (handleBox) {
      const x = handleBox.x + handleBox.width / 2;
      const y = handleBox.y + handleBox.height / 2;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + 44, y: y + 20, id: 1 }] });
      await page.waitForTimeout(80);
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [
          { x: x + 44, y: y + 20, id: 1 },
          { x: x + 180, y: y + 60, id: 2 },
        ],
      });
      await page.waitForTimeout(120);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    }
    await page.waitForTimeout(200);
    await expect(page.locator('.sim-page')).toHaveAttribute('data-sim-editing', 'false');
    expect(await page.getByTestId('p02-stage').getAttribute('data-initial-start-x')).toBe(startBefore);
    const a = await particleState(page, 'p02', 'A');
    const b = await particleState(page, 'p02', 'B');
    expect(Number(a['data-launch-time'])).toBe(0);
    expect(Number(b['data-launch-time'])).toBe(0);
    expect(a['data-start-x']).toBe(b['data-start-x']);
    expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);
    expect(errors, errors.join(' | ')).toEqual([]);
    await context.close();
  });
  test('multi-particle question presets load comparison scenes without mixing user scenes', async ({ page }) => {
    await page.setViewportSize({ width: 1194, height: 834 });
    await page.goto('/#/practice?q=p02-multi-01');
    const p02Card = page.locator('#question-p02-multi-01');
    await p02Card.waitFor();
    await p02Card.getByRole('radio', { name: /B 的轨道半径是 A 的 2 倍，两者周期相同/ }).click();
    await p02Card.getByTestId('check-p02-multi-01').click();
    await expect(p02Card.getByText('回答正确').first()).toBeVisible();
    await p02Card.getByRole('link', { name: /进入实验验证/ }).click();
    await expect(page).toHaveURL(/particle\/uniform-b\?preset=p02-multi-radius/);
    await expect(page.getByTestId('p02-stage')).toHaveAttribute('data-particle-count', '2');

    await page.goto('/#/practice?q=p03-multi-02');
    const p03Card = page.locator('#question-p03-multi-02');
    await p03Card.waitFor();
    await p03Card.getByRole('button', { name: /A 有真实入场与出场事件/ }).click();
    await p03Card.getByRole('button', { name: /C 没有入场事件/ }).click();
    await p03Card.getByRole('button', { name: /三颗粒子共享磁场和边界/ }).click();
    await p03Card.getByTestId('check-p03-multi-02').click();
    await expect(p03Card.getByText('回答正确').first()).toBeVisible();
    await p03Card.getByRole('link', { name: /进入实验验证/ }).click();
    await expect(page).toHaveURL(/particle\/half-plane\?preset=p03-multi-mixed/);
    await expect(page.getByTestId('p03-stage')).toHaveAttribute('data-particle-count', '3');
  });

});
