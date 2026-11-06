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

test('C03 whole-problem lab: one stage, real events, per-part derivation and answer check', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/cases/case-c03-beamline-detector');
  await page.getByTestId('whole-problem-lab').waitFor();
  await expect(page.getByTestId('whole-problem-stage')).toBeVisible();
  await expect(page.getByTestId('wpl-event-entry-slit')).toBeVisible();
  await expect(page.getByTestId('wpl-event-exit-slit')).toBeVisible();
  await expect(page.getByTestId('wpl-event-screen')).toBeVisible();

  await page.getByTestId('wpl-event-screen').click();
  await expect(page.getByTestId('wpl-time-label')).toContainText('3.678');
  await expect(page.getByTestId('wpl-event-detail')).toContainText('屏幕');

  await page.getByTestId('whole-problem-lab').scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.resolve('docs/screenshots/round16-c03-lab-viewport.png') });
  await page.getByTestId('wpl-reveal-part').click();
  await expect(page.getByTestId('wpl-step-a1')).toContainText('选速');
  await page.getByTestId('wpl-answer-input').fill('√4');
  await page.getByTestId('wpl-check-answer').click();
  await expect(page.getByTestId('wpl-answer-result')).toContainText('正确');
  await page.getByTestId('wpl-answer-result').scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.resolve('docs/screenshots/round16-c03-solution-viewport.png') });
  await page.getByTestId('whole-problem-lab').screenshot({ path: path.resolve('docs/screenshots/round16-c03-lab.png') });

  await page.reload();
  await page.getByTestId('whole-problem-lab').waitFor();
  await expect(page.getByTestId('wpl-answer-input')).toHaveValue('√4');
  await page.goto('/#/cases/case-c03-beamline-detector?part=c');
  await page.getByTestId('whole-problem-lab').waitFor();
  await expect(page.getByTestId('wpl-part-c')).toHaveAttribute('aria-selected', 'true');
  expect(errors).toEqual([]);
});

test('C03 variation invalidates the stale standard result and updates the event outcome', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/cases/case-c03-beamline-detector');
  await page.getByTestId('whole-problem-lab').waitFor();
  const speed = page.getByLabel('入射速率 v0数值（m/s）');
  await speed.fill('1.5');
  await speed.press('Enter');
  await expect(page.getByTestId('wpl-variant-warning')).toBeVisible();
  await expect(page.getByTestId('wpl-event-absorbed')).toBeVisible();
  await page.getByTestId('wpl-part-b').click();
  await page.getByTestId('wpl-reveal-part').click();
  await page.getByTestId('wpl-answer-input').fill('3.678299314');
  await page.getByTestId('wpl-check-answer').click();
  await expect(page.getByTestId('wpl-answer-result')).toContainText('没有给出唯一数值答案');
  await page.getByTestId('whole-problem-lab').screenshot({ path: path.resolve('docs/screenshots/round16-c03-variant.png') });
  expect(errors).toEqual([]);
});

test('C02 whole-problem lab keeps two particles on one clock and derives B arrival time', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/cases/case-c02-alternating-time');
  await page.getByTestId('whole-problem-lab').waitFor();
  await expect(page.getByTestId('whole-problem-stage')).toBeVisible();
  await page.getByTestId('wpl-part-c').click();
  await page.getByTestId('wpl-reveal-part').click();
  await page.getByTestId('wpl-answer-input').fill('1+π');
  await page.getByTestId('wpl-check-answer').click();
  await expect(page.getByTestId('wpl-answer-result')).toContainText('正确');
  await expect(page.getByTestId('wpl-event-b-cross-1')).toBeVisible();

  await page.getByTestId('wpl-event-b-start').click();
  await expect(page.getByTestId('wpl-time-label')).toContainText('1 s /');
  const bBefore = await page.getByTestId('wpl-marker-B').evaluate((element) => ({ x: element.getAttribute('cx'), y: element.getAttribute('cy') }));
  const aSpeed = page.getByLabel('A 的初速度数值（m/s）');
  await aSpeed.fill('2');
  await aSpeed.press('Enter');
  await expect(page.getByTestId('wpl-variant-warning')).toBeVisible();
  await expect(page.getByTestId('wpl-time-label')).toContainText('1 s /');
  const bAfter = await page.getByTestId('wpl-marker-B').evaluate((element) => ({ x: element.getAttribute('cx'), y: element.getAttribute('cy') }));
  expect(bAfter).toEqual(bBefore);
  await page.getByTestId('whole-problem-lab').screenshot({ path: path.resolve('docs/screenshots/round16-c02-lab.png') });
  expect(errors).toEqual([]);
});

test('C06 whole-problem lab exposes impact loss and recomputes it after restitution change', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/cases/case-c06-opposite-wall');
  await page.getByTestId('whole-problem-lab').waitFor();
  await page.getByTestId('wpl-part-b').click();
  await page.getByTestId('wpl-reveal-part').click();
  await page.getByTestId('wpl-answer-input').fill('1.215');
  await page.getByTestId('wpl-check-answer').click();
  await expect(page.getByTestId('wpl-answer-result')).toContainText('正确');

  const restitution = page.getByLabel('恢复系数 e数值（1）');
  await restitution.fill('1');
  await restitution.press('Enter');
  await expect(page.getByTestId('wpl-variant-warning')).toBeVisible();
  await page.getByTestId('wpl-answer-input').fill('0');
  await page.getByTestId('wpl-check-answer').click();
  await expect(page.getByTestId('wpl-answer-result')).toContainText('正确');
  await page.getByTestId('whole-problem-lab').screenshot({ path: path.resolve('docs/screenshots/round16-c06-lab.png') });
  expect(errors).toEqual([]);
});

test('C07/C08 labs render their critical and contact event timelines', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/cases/case-c07-analyzer-critical');
  await page.getByTestId('whole-problem-lab').waitFor();
  await expect(page.getByTestId('wpl-event-screen')).toBeVisible();
  await page.getByTestId('wpl-part-c').click();
  await page.getByTestId('wpl-reveal-part').click();
  await page.getByTestId('wpl-answer-input').fill('2');
  await page.getByTestId('wpl-check-answer').click();
  await expect(page.getByTestId('wpl-answer-result')).toContainText('正确');

  await page.goto('/#/cases/case-c08-dual-rod-contact');
  await page.getByTestId('whole-problem-lab').waitFor();
  await expect(page.getByTestId('wpl-event-contact')).toBeVisible();
  await page.getByTestId('wpl-part-c').click();
  await page.getByTestId('wpl-reveal-part').click();
  await page.getByTestId('wpl-answer-input').fill('3/4');
  await page.getByTestId('wpl-check-answer').click();
  await expect(page.getByTestId('wpl-answer-result')).toContainText('正确');
  await page.getByTestId('whole-problem-lab').screenshot({ path: path.resolve('docs/screenshots/round16-c08-lab.png') });
  expect(errors).toEqual([]);
});

test('all eight case labs render a stage and three answer parts', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1194, height: 834 });
  const routes = [
    'case-c01-boundary-exit', 'case-c02-alternating-time', 'case-c03-beamline-detector',
    'case-c04-loop-entry', 'case-c05-loop-changing-field', 'case-c06-opposite-wall',
    'case-c07-analyzer-critical', 'case-c08-dual-rod-contact',
  ];
  for (const route of routes) {
    await page.goto(`/#/cases/${route}`);
    await page.getByTestId('whole-problem-lab').waitFor();
    await expect(page.getByTestId('whole-problem-stage')).toBeVisible();
    await expect(page.getByRole('tab')).toHaveCount(3);
  }
  expect(errors).toEqual([]);
});

test('whole-problem lab remains usable in portrait without horizontal overflow', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto('/#/cases/case-c03-beamline-detector');
  await page.getByTestId('whole-problem-lab').waitFor();
  const metrics = await page.evaluate(() => ({ width: window.innerWidth, scrollWidth: document.documentElement.scrollWidth }));
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.width + 1);
  await page.getByTestId('whole-problem-lab').screenshot({ path: path.resolve('docs/screenshots/round16-c03-portrait.png') });
  expect(errors).toEqual([]);
});
