import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

function collectErrors(page: import('@playwright/test').Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

test('Round 17 deep links work directly and on reload', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/#/teacher/problems');
  await expect(page.getByTestId('teacher-problem-list')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('teacher-problem-list')).toBeVisible();
  await expect(page.getByTestId('teacher-template-a17-01')).toBeVisible();

  await page.goto('/#/cases');
  await expect(page.locator('[data-testid^="case-card-"]')).toHaveCount(9);
  await expect(page.getByTestId('case-card-case-a17-electric-magnetic-screen')).toBeVisible();
  await page.goto('/#/cases/case-a17-electric-magnetic-screen');
  await expect(page.getByTestId('whole-problem-lab')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('whole-problem-lab')).toBeVisible();
  await expect(page.getByTestId('wpl-event-screen-hit')).toBeVisible();

  await page.goto('/#/device-check');
  await expect(page.getByTestId('device-check-page')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('device-check-page')).toBeVisible();
  expect(errors, errors.join('\n')).toEqual([]);
});

test('device diagnostic export is source-labelled, sanitized and defaults hardware checks to NOT_TESTED', async ({ page }) => {
  await page.goto('/#/device-check');
  await expect(page.getByTestId('device-check-page')).toBeVisible();
  await expect(page.getByTestId('device-evidence-source')).toHaveValue('simulated');
  await expect(page.getByTestId('device-simulated-warning')).toContainText('不得计入真实');

  await page.screenshot({ path: 'docs/screenshots/round17-device-check.png', fullPage: false });
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('device-export').click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).toBeTruthy();
  const text = await readFile(path!, 'utf8');
  const report = JSON.parse(text) as Record<string, unknown>;
  expect(report.schemaVersion).toBe(2);
  expect(report.source).toMatchObject({
    evidenceSource: 'simulated',
  });
  expect(report.device).toMatchObject({ webdriver: true });
  const manual = report.manual as Record<string, { status: string }>;
  expect(manual['touch-handles'].status).toBe('NOT_TESTED');
  expect(manual['teacher-authoring'].status).toBe('NOT_TESTED');
  expect(manual['update-preserve'].status).toBe('NOT_TESTED');
  expect(report.privacy).toMatchObject({
    containsTeacherContent: false,
    containsQuestionAnswers: false,
    containsSceneData: false,
    uploadedAutomatically: false,
  });
  expect(text).not.toContain('A17-01');
  expect(text).not.toContain('求粒子');
  expect(text).not.toContain('emplab.teacher-problems');
});

test('teacher authoring and A17 stage survive 1024×768 and 768×1024 viewports', async ({ page }) => {
  for (const size of [{ width: 1024, height: 768 }, { width: 768, height: 1024 }]) {
    await page.setViewportSize(size);
    await page.goto('/#/cases/case-a17-electric-magnetic-screen');
    await expect(page.getByTestId('whole-problem-lab')).toBeVisible();
    await expect(page.getByTestId('wpl-event-a-exit')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await page.goto('/#/teacher/problems');
    await expect(page.getByTestId('teacher-problem-list')).toBeVisible();
    const listOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(listOverflow).toBeLessThanOrEqual(1);
  }
});
