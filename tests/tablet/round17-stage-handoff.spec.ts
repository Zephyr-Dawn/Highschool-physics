import { expect, test } from '@playwright/test';

test('A17-01 exposes two continuous handoffs and withholds a screen event when the physics has no hit', async ({ page }) => {
  await page.goto('/#/cases/case-a17-electric-magnetic-screen');
  await expect(page.getByTestId('whole-problem-lab')).toBeVisible();
  await expect(page.getByTestId('wpl-event-a-exit')).toBeVisible();
  await expect(page.getByTestId('wpl-event-b-exit')).toBeVisible();
  await expect(page.getByTestId('wpl-event-screen-hit')).toBeVisible();

  await page.getByTestId('wpl-event-handoff-magnetic-strip').click();
  await expect(page.getByTestId('wpl-event-detail')).toContainText('位置误差');
  await expect(page.getByTestId('wpl-event-detail')).toContainText('速度误差');

  const bz = page.getByLabel('磁场 Bz数值（T）');
  await bz.fill('-2');
  await bz.press('Enter');
  await expect(page.getByTestId('wpl-variant-warning')).toBeVisible();
  await expect(page.getByTestId('wpl-event-screen-missed')).toBeVisible();
  await expect(page.getByTestId('wpl-event-screen-hit')).toHaveCount(0);
  await expect(page.getByTestId('wpl-event-screen-outside')).toHaveCount(0);
  await page.screenshot({ path: 'docs/screenshots/round17-a17-no-hit.png', fullPage: false });

  await bz.fill('0');
  await bz.press('Enter');
  await expect(page.getByTestId('wpl-event-screen-hit')).toBeVisible();
  await expect(page.getByTestId('wpl-event-screen-missed')).toHaveCount(0);
});

test('A17-01 reference answers are recomputed instead of showing stale standard values', async ({ page }) => {
  await page.goto('/#/cases/case-a17-electric-magnetic-screen');
  await page.getByTestId('wpl-teacher-toggle').click();
  await page.getByTestId('wpl-part-c').click();
  const standardText = await page.getByTestId('wpl-answer-standard').innerText();
  expect(standardText).toContain('0.809401');
  const screenY = page.getByLabel('屏幕距离 Δx数值（m）');
  await screenY.fill('1.4');
  await screenY.press('Enter');
  await expect(page.getByTestId('wpl-answer-standard')).toContainText('已按当前变式重算');
  await expect(page.getByTestId('wpl-answer-standard')).not.toContainText('0.809401');
  await expect(page.getByTestId('wpl-derivation-stale')).toBeVisible();
  const answerInput = page.getByTestId('wpl-answer-input');
  await answerInput.fill('0.81');
  await page.getByTestId('wpl-check-answer').click();
  await expect(page.getByTestId('wpl-answer-result')).toContainText('当前参数下求解结果');
});
