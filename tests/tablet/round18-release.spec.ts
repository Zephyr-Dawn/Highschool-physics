import fs from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from '@playwright/test';

test('variant derivation stays collapsed until an explicit standard-only reveal', async ({ page }) => {
  await page.goto('/#/cases/case-a17-electric-magnetic-screen');
  await page.getByTestId('wpl-teacher-toggle').click();
  await page.getByTestId('wpl-part-c').click();
  await expect(page.getByTestId('wpl-step-c2')).toBeVisible();

  const screenY = page.getByLabel('屏幕距离 Δx数值（m）');
  await screenY.fill('1.4');
  await screenY.press('Enter');
  await expect(page.getByTestId('wpl-derivation-stale')).toBeVisible();
  await expect(page.getByTestId('wpl-stale-derivation-guard')).toBeVisible();
  await expect(page.getByTestId('wpl-step-c2')).toHaveCount(0);
  await expect(page.getByTestId('wpl-answer-standard')).toContainText('已按当前变式重算');
  await page.getByTestId('wpl-stale-derivation-guard').scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.resolve('docs/screenshots/round18-stale-derivation-guard.png'), fullPage: false });

  await page.getByTestId('wpl-reveal-stale-derivation').click();
  await expect(page.getByTestId('wpl-step-c2')).toBeVisible();
  await expect(page.getByTestId('wpl-stale-derivation-visible')).toBeVisible();
  await page.screenshot({ path: path.resolve('docs/screenshots/round18-stale-derivation-revealed.png'), fullPage: false });
});

test('full local backup exports, previews and restores scenes, progress and teacher drafts', async ({ page }) => {
  await page.goto('/#/progress');
  await page.evaluate(() => {
    localStorage.setItem('emplab.i05.scene.v2', '{"schemaVersion":2,"model":"i05","marker":"backup-round18"}');
    localStorage.setItem('emplab.teacher-problems.v1', '{"version":1,"drafts":[]}');
  });
  const panel = page.getByTestId('local-backup-panel');
  await expect(panel).toBeVisible();
  await panel.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.resolve('docs/screenshots/round18-backup-panel.png'), fullPage: false });

  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('backup-export').click();
  const download = await downloadPromise;
  const filePath = await download.path();
  expect(filePath).toBeTruthy();
  const backupText = await fs.readFile(filePath!, 'utf8');
  const backup = JSON.parse(backupText) as { format: string; entries: Record<string, string> };
  expect(backup.format).toBe('emplab.local-backup');
  expect(backup.entries['emplab.i05.scene.v2']).toContain('backup-round18');
  expect(backup.entries['emplab.teacher-problems.v1']).toContain('drafts');
  expect(backup.entries['emplab.case.sceneBackup.v1']).toBeUndefined();

  await page.evaluate(() => {
    localStorage.setItem('emplab.i05.scene.v2', '{"schemaVersion":2,"model":"i05","marker":"changed-later"}');
    localStorage.setItem('unrelated-key', 'keep');
  });
  await page.getByLabel('选择完整本地数据备份 JSON').setInputFiles({
    name: 'round18-backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(backupText),
  });
  await expect(page.getByTestId('backup-preview')).toBeVisible();
  await expect(page.getByTestId('backup-preview')).toContainText('教师草稿');
  await page.getByTestId('backup-restore').click();
  await page.waitForLoadState('load');
  await page.waitForTimeout(900);
  const restored = await page.evaluate(() => ({
    scene: localStorage.getItem('emplab.i05.scene.v2'),
    unrelated: localStorage.getItem('unrelated-key'),
  }));
  expect(restored.scene).toContain('backup-round18');
  expect(restored.unrelated).toBe('keep');
});

test('device diagnostic shows runtime platform without claiming physical verification', async ({ page }) => {
  await page.goto('/#/device-check');
  await expect(page.getByTestId('device-check-page')).toBeVisible();
  await expect(page.getByText(/运行平台/)).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('device-export').click();
  const download = await downloadPromise;
  const filePath = await download.path();
  const report = JSON.parse(await fs.readFile(filePath!, 'utf8')) as Record<string, unknown>;
  expect(report.runtime).toMatchObject({ platform: 'browser' });
  expect(report.source).toMatchObject({ evidenceSource: 'simulated' });
});
