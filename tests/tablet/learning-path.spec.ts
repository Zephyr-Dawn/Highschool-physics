import path from 'node:path';
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

test('learning path: all 16 models, real lesson, experiment and practice links', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/path');
  await expect(page.getByTestId('learning-path-page')).toBeVisible();
  await expect(page.locator('[data-testid^="path-step-"]')).toHaveCount(16);
  await expect(page.getByTestId('path-particles')).toBeVisible();
  await expect(page.getByTestId('path-induction')).toBeVisible();
  await expect(page.locator('[data-testid^="demo-"]')).toHaveCount(3);
  await page.screenshot({ path: path.resolve('docs/screenshots/learning-path.png') });

  await page.getByTestId('path-lesson-i08').click();
  await expect(page.getByTestId('path-detail-page')).toBeVisible();
  await expect(page.getByTestId('path-detail-title')).toContainText('交流发电机');
  await expect(page.getByText('先约定角度：法线与 B 的夹角')).toBeVisible();
  await page.screenshot({ path: path.resolve('docs/screenshots/learning-path-i08.png') });

  await page.getByTestId('path-open-experiment').click();
  await expect(page.getByTestId('i08-stage-svg')).toBeVisible();
  await expect(page).toHaveURL(/ac-generator\?preset=i08-standard/);
  expect(errors).toEqual([]);
});

test('learning path: prev/next and model-filtered practice', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/path/induction/i08');
  await expect(page.getByTestId('path-detail-page')).toBeVisible();
  expect(await page.getByTestId('path-prev').getAttribute('href')).toContain('/path/induction/i07');
  await page.getByTestId('path-prev').click();
  await expect(page.getByTestId('path-detail-title')).toContainText('相反磁场');
  await page.getByTestId('path-next').click();
  await expect(page.getByTestId('path-detail-title')).toContainText('交流发电机');

  await page.getByTestId('path-open-practice').click();
  await expect(page).toHaveURL(/practice\?model=i08/);
  await expect(page.getByTestId('practice-model-filter')).toHaveValue('i08');
  await expect(page.locator('.question-card')).toHaveCount(8);
  await page.getByTestId('practice-model-filter').selectOption('all');
  await expect(page.locator('.question-card')).toHaveCount(132);
  await page.screenshot({ path: path.resolve('docs/screenshots/practice-model-filter.png') });
  expect(errors).toEqual([]);
});

test('learning path: home entry and portrait layout without horizontal overflow', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /按知识路线/ })).toBeVisible();
  await page.getByRole('link', { name: /打开学习路线/ }).click();
  await expect(page.getByTestId('learning-path-page')).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: path.resolve('docs/screenshots/learning-path-portrait.png') });
  expect(errors).toEqual([]);
});

test('learning path: teacher demo route opens a real I08 preset', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/#/path');
  await page.getByTestId('demo-demo-induction-core').getByRole('link', { name: 'I08 正弦交流' }).click();
  await expect(page.getByTestId('i08-stage-svg')).toBeVisible();
  await expect(page).toHaveURL(/ac-generator\?preset=i08-standard/);
  expect(errors).toEqual([]);
});
