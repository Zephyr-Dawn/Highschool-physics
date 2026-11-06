import path from 'node:path';
import fs from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
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

test('case list: nine originals, source-only references, no copied exam text', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/cases');
  await expect(page.getByTestId('cases-page')).toBeVisible();
  await expect(page.locator('[data-testid^="case-card-"]')).toHaveCount(9);
  await expect(page.locator('[data-testid^="case-source-"]')).toHaveCount(5);
  await expect(page.getByText('未在线复核').first()).toBeVisible();
  await expect(page.getByText('原创 · 高考风格').first()).toBeVisible();
  await page.screenshot({ path: path.resolve('docs/screenshots/cases-list.png') });
  expect(errors).toEqual([]);
});

test('case launch uses a real preset, returns to the question and restores the personal P04 scene', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/particle/finite-field');
  await page.getByTestId('p04-stage-svg').waitFor();
  await page.getByRole('tab', { name: /参数/ }).click();
  const bz = page.getByLabel('Bz数值（T）');
  await bz.fill('2.3');
  await bz.press('Enter');
  await page.waitForTimeout(220);
  const personalScene = await page.evaluate(() => window.localStorage.getItem('emplab.p04.scene.v2'));
  expect(personalScene).not.toBeNull();

  await page.goto('/#/cases/case-c01-boundary-exit');
  await page.getByTestId('case-detail').waitFor();
  await page.getByTestId('case-open-experiment').click();
  await expect(page).toHaveURL(/finite-field\?preset=p04-strip-cross&case=case-c01-boundary-exit/);
  await expect(page.getByTestId('case-return-banner')).toBeVisible();
  await page.waitForTimeout(250);
  const caseScene = await page.evaluate(() => window.localStorage.getItem('emplab.p04.scene.v2'));
  expect(caseScene).not.toBe(personalScene);

  await page.getByTestId('case-return-banner').getByRole('link').click();
  await expect(page.getByTestId('case-detail')).toBeVisible();
  await expect(page.getByTestId('case-return-notice')).toContainText('p04');
  const restored = await page.evaluate(() => window.localStorage.getItem('emplab.p04.scene.v2'));
  expect(restored).toBe(personalScene);
  expect(errors).toEqual([]);
});

test('case detail: prediction, masked derivation and stage switching', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/cases/case-c03-beamline-detector?stage=c03-screen-window');
  await page.getByTestId('case-detail').waitFor();
  await expect(page.getByTestId('case-stage-c03-screen-window')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('case-stem')).toContainText('多级束线');
  await expect(page.getByTestId('case-expected')).toHaveCount(0);
  await page.getByTestId('case-reveal-solution').click();
  await expect(page.getByTestId('case-expected')).toBeVisible();
  await expect(page.getByTestId('case-expected')).toContainText('beamY');
  await page.getByTestId('case-stage-c03-standard').click();
  await expect(page.getByTestId('case-stage-c03-standard')).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({ path: path.resolve('docs/screenshots/case-detail-solved.png') });
  expect(errors).toEqual([]);
});

test('case detail: multi-stage opposite-field/wall case exposes the 0.375 J impact result', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/cases/case-c06-opposite-wall?stage=c06-inelastic-wall');
  await page.getByTestId('case-detail').waitFor();
  await page.getByTestId('case-reveal-solution').click();
  await expect(page.getByTestId('case-expected')).toContainText('0.375');
  await page.getByTestId('case-teacher-toggle').click();
  await expect(page.getByTestId('case-expected')).toBeVisible();
  await page.screenshot({ path: path.resolve('docs/screenshots/case-wall-solved.png') });
  expect(errors).toEqual([]);
});

test('case pages are usable in portrait without horizontal overflow', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto('/#/cases');
  await expect(page.getByTestId('cases-page')).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.getByTestId('case-open-case-c05-loop-changing-field').click();
  await page.getByTestId('case-detail').waitFor();
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: path.resolve('docs/screenshots/case-portrait.png') });
  expect(errors).toEqual([]);
});

test('device check: NOT_TESTED defaults, redacted export and 10 s scheduling proxy', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/device-check');
  await expect(page.getByTestId('device-check-page')).toBeVisible();
  await expect(page.getByLabel(/触控手柄命中.*状态/)).toHaveValue('NOT_TESTED');
  await page.getByLabel('设备型号').fill('Playwright simulated tablet');
  await page.getByLabel('系统 / 浏览器').fill('Chromium 156 / Windows');
  await page.screenshot({ path: path.resolve('docs/screenshots/device-check.png') });

  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('device-export').click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  const report = JSON.parse(await fs.readFile(downloadPath!, 'utf8')) as Record<string, unknown>;
  expect(report.appVersion).toBe('0.1.0-round18');
  expect((report.privacy as Record<string, unknown>).containsSceneData).toBe(false);
  expect((report.privacy as Record<string, unknown>).containsQuestionAnswers).toBe(false);
  expect(JSON.stringify(report)).not.toContain('emplab.progress');
  expect(JSON.stringify(report)).not.toContain('personalScene');

  await page.getByTestId('device-probe-10').click();
  await expect(page.getByTestId('device-probe-result')).toContainText('frames', { timeout: 15_000 });
  await expect(page.getByTestId('device-probe-result')).toContainText('p95');
  await page.screenshot({ path: path.resolve('docs/screenshots/device-check-probe.png') });
  expect(errors).toEqual([]);
});
