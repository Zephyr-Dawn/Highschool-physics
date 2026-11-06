import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
});

test('teacher creates, edits, previews and exports the A17-01 cross-solver problem', async ({ page }) => {
  await page.goto('/#/teacher/problems');
  await expect(page.getByTestId('teacher-problem-list')).toBeVisible();
  await page.screenshot({ path: 'docs/screenshots/round17-teacher-list.png', fullPage: false });

  await page.getByTestId('teacher-template-a17-01').getByRole('button', { name: '使用模板' }).click();
  await expect(page).toHaveURL(/\/teacher\/problems\/.+\/edit/);
  await expect(page.getByTestId('teacher-editor-status')).toContainText('仿真已验证');
  await expect(page.getByTestId('teacher-check-stage-continuity')).toContainText('2 个交接点');
  await page.screenshot({ path: 'docs/screenshots/round17-teacher-editor.png', fullPage: false });

  await page.getByTestId('teacher-title').fill('教师自编 A17 连续题');
  await page.getByTestId('teacher-stem').fill(
    'q=+1 C、m=1 kg 的粒子从原点以 (1,0) m/s 出发，依次经过 E=(1,0) V/m 的加速区、Bz=−1 T 的有限磁场条带和无场漂移区。求电场出射速率、磁场出射 y 与屏幕落点 y。',
  );
  await page.getByTestId('teacher-save').click();
  await expect(page.getByTestId('teacher-unsaved')).toHaveCount(0);
  await expect(page.getByTestId('teacher-editor-notice')).toBeVisible();

  await page.getByTestId('teacher-save-preview').click();
  await expect(page).toHaveURL(/\/preview$/);
  await expect(page.getByTestId('whole-problem-lab')).toBeVisible();
  await expect(page.getByTestId('wpl-event-a-exit')).toBeVisible();
  await expect(page.getByTestId('wpl-event-b-exit')).toBeVisible();
  await expect(page.getByTestId('wpl-event-screen-hit')).toBeVisible();
  await expect(page.getByTestId('teacher-preview-status')).toContainText('仿真已验证');
  await page.screenshot({ path: 'docs/screenshots/round17-a17-preview.png', fullPage: false });
  await page.getByTestId('whole-problem-lab').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'docs/screenshots/round17-a17-stage.png', fullPage: false });

  await page.getByTestId('wpl-teacher-toggle').click();
  await page.getByTestId('wpl-part-c').click();
  await expect(page.getByTestId('wpl-answer-standard')).toContainText('0.809401');
  if (await page.getByTestId('wpl-reveal-part').count()) {
    await page.getByTestId('wpl-reveal-part').click();
  }
  await page.getByTestId('wpl-part-body').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'docs/screenshots/round17-a17-derivation.png', fullPage: false });

  const electric = page.getByLabel('加速电场 Eₓ数值（V/m）');
  await electric.fill('2');
  await electric.press('Enter');
  await expect(page.getByTestId('wpl-variant-warning')).toBeVisible();
  await expect(page.getByTestId('wpl-answer-standard')).not.toContainText('0.809401');
  await expect(page.getByTestId('wpl-answer-standard')).toContainText('已按当前变式重算');
  await page.screenshot({ path: 'docs/screenshots/round17-a17-variant.png', fullPage: false });

  const downloadPromise = page.waitForEvent('download');
  await page.goto('/#/teacher/problems');
  await page.getByTestId(/^teacher-export-/).click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  expect(downloadPath).toBeTruthy();
  await page.getByTestId('teacher-import-input').setInputFiles(downloadPath!);
  await expect(page.getByTestId('teacher-notice')).toContainText('新 ID');
  await expect(page.getByTestId('teacher-draft-count')).toContainText('2');
  await page.screenshot({ path: 'docs/screenshots/round17-import-export.png', fullPage: false });
});

test('A17-02 teacher template previews Q_J and wall impact as separate events and answers', async ({ page }) => {
  await page.goto('/#/teacher/problems');
  await page.getByTestId('teacher-template-a17-02').getByRole('button', { name: '使用模板' }).click();
  await expect(page).toHaveURL(/\/teacher\/problems\/.+\/edit/);
  await expect(page.getByTestId('teacher-editor-status')).toContainText('仿真已验证');
  await page.getByTestId('teacher-save-preview').click();
  await expect(page.getByTestId('whole-problem-lab')).toBeVisible();
  await expect(page.getByTestId('wpl-event-wall-bounce')).toBeVisible();
  await expect(page.getByTestId('wpl-event-re-enter')).toBeVisible();
  await expect(page.locator('.wpl-part-tab')).toHaveCount(4);
  await page.getByTestId('wpl-teacher-toggle').click();
  await page.getByTestId('wpl-part-part-c-impact').click();
  await expect(page.getByTestId('wpl-answer-standard')).toContainText('1.215');
  await page.getByTestId('wpl-part-body').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'docs/screenshots/round17-a17-02-preview.png', fullPage: false });
  const restitution = page.getByLabel('恢复系数 e数值（1）');
  await restitution.fill('1');
  await restitution.press('Enter');
  await expect(page.getByTestId('wpl-answer-standard')).toContainText('0 ');
  await expect(page.getByTestId('wpl-answer-standard')).toContainText('已按当前变式重算');
  await expect(page.getByTestId('wpl-variant-warning')).toBeVisible();
});

test('teacher pages remain usable at tablet portrait, landscape and phone widths', async ({ page }) => {
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/teacher/problems');
  await page.getByTestId('teacher-template-a17-01').getByRole('button', { name: '使用模板' }).click();
  await expect(page.getByTestId('teacher-editor')).toBeVisible();
  const landscapeOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(landscapeOverflow).toBeLessThanOrEqual(1);
  const saveBox = await page.getByTestId('teacher-save').boundingBox();
  expect(saveBox?.height ?? 0).toBeGreaterThanOrEqual(44);
  await page.screenshot({ path: 'docs/screenshots/round17-tablet-landscape.png', fullPage: false });

  await page.setViewportSize({ width: 768, height: 1024 });
  await expect(page.getByTestId('teacher-editor')).toBeVisible();
  const portraitOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(portraitOverflow).toBeLessThanOrEqual(1);
  await expect(page.getByTestId('teacher-title')).toBeVisible();
  await expect(page.getByLabel(/加速电场 Eₓ.*数值/)).toBeVisible();
  await page.screenshot({ path: 'docs/screenshots/round17-tablet-portrait.png', fullPage: false });

  await page.setViewportSize({ width: 430, height: 820 });
  const phoneOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(phoneOverflow).toBeLessThanOrEqual(1);
  await expect(page.getByTestId('teacher-save')).toBeVisible();
});
