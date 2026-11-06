# CI Runbook

日期：2026-11-06  
工作流：`.github/workflows/ci.yml`  
仓库：<https://github.com/Zephyr-Dawn/Highschool-physics>（Public）  
生产站点：<https://soft-toffee-cbd208.netlify.app/>

## 1. 触发条件

- `pull_request` 到 `main`
- `push` 到 `main`
- 手动 `workflow_dispatch`

不触发旧的 `ai-studio-dev` 分支；Google AI Studio 流程已废弃。权限仅 `contents: read`，不使用 `pull_request_target`。

## 2. CI 阶段

1. `actions/checkout@v4`
2. `actions/setup-node@v4`，Node 22，npm cache
3. `npm ci`
4. `npm run typecheck`
5. `npx vitest run --reporter=dot`
6. `npm run build`
7. `npm run verify:static`
8. `npx playwright install --with-deps chrome`
9. `npx playwright test --reporter=list,github`
10. `npm run test:pwa -- --reporter=list,github`
11. 失败时上传 `test-results/`、`.local-evidence/`（7 天，脱敏）

## 3. 本地等价命令

```bash
npm ci
npm run typecheck
npx vitest run --reporter=dot
npm run build
npm run verify:static
npx playwright test
npm run test:pwa
```

本机 Windows 使用已安装 Chrome；CI Ubuntu 使用 `--with-deps chrome`。若安装受限，应让步骤失败并记录 `BLOCKED`，不能注释 Playwright 后宣称全绿，也不能降低测试数量。

当前基线（以实际 run 为准）：Vitest 610、Playwright 183（SIMULATED）、PWA 3、`verify:static` 通过。

## 4. 常见问题

### Playwright / Chrome

- `npx playwright install --with-deps chrome`；不能只装 Chromium 后仍用 `channel: chrome`。
- 端口：开发 4173；PWA preview 4174。CI 为干净环境。

### PWA / 静态检查

- `test:pwa` 已包含生产 build；失败时检查 `manifest.webmanifest`、`sw.js`、`_headers`、CSP。
- `verify:static` 检查 manifest、外部脚本、SW no-cache、secret/私有文件、release manifest。
- 不得用清空用户 localStorage 或删除检查来修复。

### 文档/许可证 PR

- 纯文档变更仍应跑 typecheck/Vitest/build/verify:static；合并后的 main push 会触发 Netlify 生产部署，避免无意义频繁部署。
- `LICENSE` 必须是 GNU 官方 GPLv3 原文；`package.json` 保持 `"license": "GPL-3.0-only"` 和 `"private": true`。
- 不提交历史 Prompt、教师私有题包、学生数据、凭据或未授权原卷。

## 5. 分支保护（需仓库管理员权限）

建议在 GitHub UI 设置 `main`：

- Require a pull request before merging
- Require approvals ≥1
- Require status check `verify`
- Require branches up to date
- Dismiss stale approvals
- Block force pushes and deletions
- Include administrators（若可用）

仓库保持 Public；是否用脚本配置保护取决于维护者权限和 GitHub 计划。`scripts/configure-github-protection.sh` 仅可作为已授权时的辅助，不在 CI 中运行。

## 6. 证据记录

每次 PR/发布记录：

- GitHub Actions run URL 与结论；
- `main` SHA、`dist/release-manifest.json` 的 buildId/SHA、Netlify deploy SHA；
- 失败的脱敏日志与重跑结果；
- 真机结果只从真实设备记录；模拟器/headless 标 `SIMULATED`。

## 7. 当前边界

- 正式站点可访问；CI 是否已在新 PR 上跑通以实际 Actions run 为准。
- 真实 Android/完整 iPad 交互、软键盘、读屏、WebGL 恢复和长时稳定性仍按 `docs/DEVICE_ACCEPTANCE.md` 记录，不能用 CI 代替。
