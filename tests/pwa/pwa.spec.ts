import { expect, test } from '@playwright/test';

test('production build installs a service worker and opens all sixteen models offline', async ({ page, context }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await page.goto('/');
  await expect(page.locator('h1')).toContainText('拖到眼前');

  const manifest = await page.evaluate(async () => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if (!link) return null;
    const response = await fetch(link.href);
    return response.ok ? await response.json() : null;
  });
  expect(manifest).not.toBeNull();
  expect(manifest.name).toContain('EM Physics Lab');
  expect(manifest.display).toBe('standalone');
  expect(manifest.icons.length).toBeGreaterThanOrEqual(3);

  const sw = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return { supported: false, active: false };
    const registration = await navigator.serviceWorker.ready;
    return {
      supported: true,
      active: Boolean(registration.active),
      scope: registration.scope,
    };
  });
  expect(sw.supported).toBe(true);
  expect(sw.active).toBe(true);

  // A reload after activation gives the page a controlling service worker.
  await page.reload();
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, {
    timeout: 20_000,
  });

  await page.goto('/#/particle/uniform-b');
  await expect(page.getByTestId('p02-stage-svg')).toBeVisible();
  await expect(page.getByTestId('particle-roster')).toBeVisible();
  await page.getByTestId('particle-add').click();
  await expect(page.getByTestId('p02-stage')).toHaveAttribute('data-particle-count', '2');

  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('h1')).toContainText('匀强磁场内的多粒子圆周运动');
  await expect(page.getByTestId('p02-stage-svg')).toBeVisible();
  await expect(page.getByTestId('particle-roster')).toBeVisible();
  await page.getByTestId('particle-add').click();
  await expect(page.getByTestId('p02-stage')).toHaveAttribute('data-particle-count', '2');

  await page.evaluate(() => {
    localStorage.setItem(
      'emplab.p01.force.scene.v1',
      JSON.stringify({
        schemaVersion: 1,
        model: 'p01-force',
        field: { B: { x: 0, y: 0, z: -4 } },
        particles: [
          {
            id: 'p1',
            label: 'A',
            color: '#1d4ed8',
            lineStyle: 'solid',
            chargeC: 2,
            massKg: 1,
            velocity: { x: 3, y: 0, z: 0 },
            visible: true,
          },
        ],
        activeParticleId: 'p1',
      }),
    );
  });
  await page.goto('/#/particle/lorentz-force');
  await expect(page.locator('h1')).toContainText('真实 WebGL 三维洛伦兹力');
  await expect(page.getByTestId('p01-3d-stage')).toBeVisible();
  await expect(page.locator('[data-testid="p01-3d-canvas"]')).toBeVisible();
  await expect(page.getByTestId('p01-3d-stage')).toHaveAttribute('data-q', '2');
  await expect(page.getByTestId('p01-3d-stage')).toHaveAttribute('data-bz', '-4');
  const migrated = await page.getByTestId('p01-3d-particle-A').evaluate((element) => ({
    x: element.getAttribute('data-x'),
    launch: element.getAttribute('data-launch-time'),
  }));
  expect(Number(migrated.x)).toBeCloseTo(-1.2, 5);
  expect(migrated.launch).toBe('0');
  await page.getByRole('button', { name: '2D 运动', exact: true }).click();
  await expect(page.getByTestId('p02-stage')).toBeVisible();

  await page.goto('/#/particle/finite-field');
  await expect(page.locator('h1')).toContainText('条形 / 矩形有界磁场与临界条件');
  await expect(page.getByTestId('p04-stage-svg')).toBeVisible();
  await page.getByRole('tab', { name: /数据/ }).click();
  await expect(page.getByTestId('p04-event-list')).toBeVisible();

  await page.goto('/#/particle/alternating-fields');
  await expect(page.locator('h1')).toContainText('相反磁场多区域与粒子时序');
  await expect(page.getByTestId('p05-stage-svg')).toBeVisible();
  await page.getByRole('tab', { name: /数据/ }).click();
  await expect(page.getByTestId('p05-event-list')).toBeVisible();

  await page.goto('/#/induction/loop-entry');
  await expect(page.locator('h1')).toContainText('矩形线框进入 / 离开磁场');
  await expect(page.getByTestId('i03-stage-svg')).toBeVisible();

  await page.goto('/#/induction/moving-rod');
  await expect(page.locator('h1')).toContainText('单导体棒切割磁感线');
  await expect(page.getByTestId('i02-stage-svg')).toBeVisible();
  await page.getByRole('tab', { name: /参数/ }).click();
  await page.getByRole('button', { name: '自由滑行', exact: true }).click();
  await expect(page.getByTestId('i02-stage')).toHaveAttribute('data-mode', 'free-decay');

  await page.goto('/#/particle/half-plane');
  await expect(page.locator('h1')).toContainText('直线边界半平面有界磁场的多粒子运动');
  await expect(page.getByTestId('p03-stage-svg')).toBeVisible();
  await expect(page.getByTestId('particle-roster')).toBeVisible();
  await page.getByTestId('particle-add').click();
  await expect(page.getByTestId('p03-stage')).toHaveAttribute('data-particle-count', '2');

  await page.goto('/#/particle/combined-fields');
  await expect(page.locator('h1')).toContainText('同区电磁叠加场');
  await expect(page.getByTestId('p06-stage-svg')).toBeVisible();
  await page.getByRole('button', { name: /电场→磁场/ }).click();
  await expect(page.getByTestId('p06-stage')).toHaveAttribute('data-mode', 'segmented');
  await page.getByTestId('particle-add').click();
  await expect(page.getByTestId('p06-stage')).toHaveAttribute('data-particle-count', '2');

  await page.goto('/#/particle/beamline?preset=p07-multi');
  await expect(page.locator('h1')).toContainText('多级带电粒子束线综合实验');
  await expect(page.getByTestId('p07-stage-svg')).toBeVisible();
  await expect(page.getByTestId('p07-stage')).toHaveAttribute('data-particle-count', '3');
  await page.getByRole('tab', { name: /数据/ }).click();
  await expect(page.getByTestId('p07-detection-table')).toBeVisible();
  await expect(page.getByTestId('p07-event-list')).toBeVisible();

  await page.goto('/#/induction/time-varying-field');
  await expect(page.locator('h1')).toContainText('时变磁场中的静止线圈');
  await expect(page.getByTestId('i04-stage-svg')).toBeVisible();
  await page.getByRole('tab', { name: /数据/ }).click();
  await expect(page.getByTestId('i04-chart-panel')).toBeVisible();

  await page.goto('/#/induction/flux-lenz');
  await expect(page.locator('h1')).toContainText('磁通量与楞次定律');
  await expect(page.getByTestId('i01-stage-svg')).toBeVisible();
  await page.getByRole('button', { name: '改变面积', exact: true }).click();
  await expect(page.getByTestId('i01-stage')).toHaveAttribute('data-mode', 'area');

  await page.goto('/#/induction/coupled-loop?preset=i05-static-entry');
  await expect(page.locator('h1')).toContainText('时变磁场中的运动线框');
  await expect(page.getByTestId('i05-stage-svg')).toBeVisible();
  await page.getByRole('tab', { name: /参数/ }).click();
  const i05B0 = page.getByLabel('偏置 B₀数值（T）');
  await i05B0.fill('√2');
  await i05B0.blur();
  await expect(i05B0).toHaveValue('√2');
  await expect.poll(async () => Number(await page.getByTestId('i05-stage').getAttribute('data-bz'))).toBeCloseTo(Math.SQRT2, 5);

  await page.goto('/#/induction/dual-rods?preset=i06-free-symmetric');
  await expect(page.locator('h1')).toContainText('双导体棒在平行导轨上的电磁耦合');
  await expect(page.getByTestId('i06-stage-svg')).toBeVisible();
  await page.getByRole('tab', { name: /数据与图像/ }).click();
  await expect(page.getByTestId('i06-charts')).toBeVisible();

  await page.goto('/#/induction/opposite-fields-wall?preset=i07-free-wall');
  await expect(page.locator('h1')).toContainText('相反磁场双区域');
  await expect(page.getByTestId('i07-stage-svg')).toBeVisible();
  await page.getByRole('tab', { name: /数据与图像/ }).click();
  await expect(page.getByTestId('i07-event-list')).toContainText('挡板反弹');

  await page.goto('/#/particle/constraint-lab?preset=p08-two-crossings');
  await expect(page.locator('h1')).toContainText('复合电磁场约束');
  await expect(page.getByTestId('p08-stage-svg')).toBeVisible();
  await page.getByRole('tab', { name: /数据与反求/ }).click();
  await expect(page.getByTestId('p08-outcome-table')).toBeVisible();
  await expect(page.getByTestId('p08-event-list')).toContainText('正向穿越');

  await page.goto('/#/induction/ac-generator?preset=i08-standard');
  await expect(page.locator('h1')).toContainText('交流发电机与交变电流');
  await expect(page.getByTestId('i08-stage-svg')).toBeVisible();
  await page.getByRole('tab', { name: /数据与图像/ }).click();
  await expect(page.getByTestId('i08-frequency')).toContainText('1 Hz');
  await expect(page.getByTestId('i08-charts')).toBeVisible();

  await page.goto('/#/cases');
  await expect(page.getByTestId('cases-page')).toBeVisible();
  await expect(page.locator('[data-testid^="case-card-"]')).toHaveCount(9);
  await page.goto('/#/cases/case-c01-boundary-exit');
  await expect(page.getByTestId('case-detail')).toBeVisible();
  await expect(page.getByTestId('case-stem')).toContainText('条形');
  await expect(page.getByTestId('whole-problem-lab')).toBeVisible();
  await page.goto('/#/cases/case-c07-analyzer-critical');
  await expect(page.getByTestId('whole-problem-lab')).toBeVisible();
  await expect(page.getByTestId('wpl-event-screen')).toBeVisible();
  await page.goto('/#/cases/case-c08-dual-rod-contact');
  await expect(page.getByTestId('whole-problem-lab')).toBeVisible();
  await expect(page.getByTestId('wpl-event-contact')).toBeVisible();
  await page.goto('/#/cases/case-a17-electric-magnetic-screen');
  await expect(page.getByTestId('whole-problem-lab')).toBeVisible();
  await expect(page.getByTestId('wpl-event-screen-hit')).toBeVisible();
  await page.goto('/#/cases/case-c01-boundary-exit');
  await page.getByTestId('case-open-experiment').click();
  await expect(page.getByTestId('p04-stage-svg')).toBeVisible();
  await page.getByTestId('case-return-banner').getByRole('link').click();
  await expect(page.getByTestId('case-return-notice')).toBeVisible();
  await page.goto('/#/device-check');
  await expect(page.getByTestId('device-check-page')).toBeVisible();

  await page.goto('/#/teacher/problems');
  await expect(page.getByTestId('teacher-problem-list')).toBeVisible();
  await page.getByTestId('teacher-template-a17-01').getByRole('button', { name: '使用模板' }).click();
  await expect(page.getByTestId('teacher-editor')).toBeVisible();
  await expect(page.getByTestId('teacher-editor-status')).toContainText('仿真已验证');
  await page.getByTestId('teacher-save-preview').click();
  await expect(page.getByTestId('whole-problem-lab')).toBeVisible();
  await expect(page.getByTestId('wpl-event-screen-hit')).toBeVisible();

  await page.goto('/#/path');
  await expect(page.getByTestId('learning-path-page')).toBeVisible();
  await expect(page.locator('[data-testid^="path-step-"]')).toHaveCount(16);
  await page.goto('/#/path/induction/i08');
  await expect(page.getByTestId('path-detail-page')).toBeVisible();
  await expect(page.getByTestId('path-detail-title')).toContainText('交流发电机');
  await page.getByTestId('path-open-practice').click();
  await expect(page.locator('.question-card')).toHaveCount(8);

  await page.goto('/#/practice');
  await expect(page.locator('.question-card')).toHaveCount(132);
  await expect(page.getByText('洛伦兹力的方向')).toBeVisible();
  await expect(page.getByText('线框进入磁场时的电流方向')).toBeVisible();
  await expect(page.getByText('两杆同速运动时的总电动势')).toBeVisible();

  await context.setOffline(false);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('offline reload preserves the committed numeric value of a mathematical expression', async ({ page, context }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, {
    timeout: 20_000,
  });

  await page.goto('/#/particle/uniform-b');
  await expect(page.getByTestId('p02-stage-svg')).toBeVisible();
  await page.getByRole('tab', { name: /参数/ }).click();
  const input = page.getByLabel('磁感应强度 |B|数值（T）');
  await input.fill('√3/2');
  await input.blur();
  await expect(input).toHaveValue('√3/2');
  await expect.poll(async () => page.evaluate(() => {
    const raw = window.localStorage.getItem('emplab.p02.scene.v2');
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as { field?: { fieldMag?: number } };
      return parsed.field?.fieldMag ?? null;
    } catch {
      return null;
    }
  })).toBeCloseTo(Math.sqrt(3) / 2, 8);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByTestId('p02-stage-svg')).toBeVisible();
  await page.getByRole('tab', { name: /参数/ }).click();
  await expect(page.getByLabel('磁感应强度 |B|数值（T）')).toHaveValue('0.866025403784');
  await page.getByRole('tab', { name: /数据/ }).click();
  await expect(page.getByTestId('p02-radius')).toContainText('14.4 cm');
  await context.setOffline(false);
});

test('offline reload keeps teacher drafts, legacy scenes, answer progress and case progress', async ({ page, context }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, {
    timeout: 20_000,
  });

  await page.goto('/#/teacher/problems');
  await page.getByTestId('teacher-template-a17-02').getByRole('button', { name: '使用模板' }).click();
  await expect(page).toHaveURL(/\/teacher\/problems\/.+\/edit/);
  const teacherUrl = page.url();
  await page.getByTestId('teacher-title').fill('PWA 离线保留教师题');
  await page.getByTestId('teacher-save').click();
  const teacherDraftsBefore = await page.evaluate(() => window.localStorage.getItem('emplab.teacher-problems.v1'));
  expect(teacherDraftsBefore).toContain('PWA 离线保留教师题');

  await page.evaluate(() => {
    window.localStorage.setItem('emplab.p02.scene.v2', '{"schemaVersion":2,"model":"p02","marker":"legacy-v2"}');
    window.localStorage.setItem('emplab.progress.v1', '{"version":1,"answers":{"p02-01":{"status":"correct"}},"bookmarks":[],"wrong":[]}');
    window.localStorage.setItem('emplab.cases.progress.v1', '{"version":1,"cases":{},"marker":"legacy-case-progress"}');
  });

  await page.goto('/#/teacher/problems');
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByTestId('teacher-problem-list')).toBeVisible();
  await expect(page.getByTestId('teacher-draft-count')).toContainText('1');
  const persisted = await page.evaluate(() => ({
    teacher: window.localStorage.getItem('emplab.teacher-problems.v1'),
    scene: window.localStorage.getItem('emplab.p02.scene.v2'),
    progress: window.localStorage.getItem('emplab.progress.v1'),
    cases: window.localStorage.getItem('emplab.cases.progress.v1'),
  }));
  expect(persisted.teacher).toContain('PWA 离线保留教师题');
  expect(persisted.scene).toContain('legacy-v2');
  expect(persisted.progress).toContain('p02-01');
  expect(persisted.cases).toContain('legacy-case-progress');
  await page.screenshot({ path: 'docs/screenshots/round17-offline-teacher.png', fullPage: false });

  await page.goto('/#/progress');
  await expect(page.getByTestId('local-backup-panel')).toBeVisible();
  await page.goto(teacherUrl);
  await expect(page.getByTestId('teacher-editor')).toBeVisible();
  await expect(page.getByTestId('teacher-editor-status')).toContainText('仿真已验证');
  await context.setOffline(false);
});
