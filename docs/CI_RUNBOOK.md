# CI Runbook

日期：2026-11-06  
工作流：`.github/workflows/ci.yml`  
当前状态：**CI_NOT_RUN**（尚无 GitHub 授权/推送，不能声称 GitHub Actions 已通过）。

## 1. 触发条件

- `pull_request` 到 `main`
- `push` 到 `main`
- `push` 到 `ai-studio-dev`
- 手动 `workflow_dispatch`

权限仅 `contents: read`；未使用 `pull_request_target`，未使用第三方 action 执行不可信代码。

## 2. 阶段

1. `actions/checkout@v4`
2. `actions/setup-node@v4`，Node 22，npm cache
3. `npm ci`
4. `npm run typecheck`
5. `npx vitest run --reporter=dot`
6. `npm run build`
7. `npm run verify:static`
8. `npx playwright install --with-deps chrome`
9. `npx playwright test`
10. `npm run test:pwa`
11. 仅失败时上传 `test-results/` 与 `.local-evidence/`（脱敏，7 天）

## 3. 本地等价命令

```bash
npm ci
npm run typecheck
npx vitest run --reporter=dot
npm run build
npm run verify:static
npx playwright install --with-deps chrome   # 首次/CI
npx playwright test
npm run test:pwa
```

本地 Windows 使用已安装的 Chrome（Playwright 配置 `channel: 'chrome'`）。CI 使用官方 Ubuntu runner 安装 Chrome 和系统依赖；若安装受限，该步骤必须建为失败/`BLOCKED`，不能注释掉 Playwright 后宣称全绿。

## 4. 常见问题

### Playwright 找不到 Chrome

- `npx playwright install --with-deps chrome`
- CI 的 `ubuntu-latest` 需要 `--with-deps`；不能只安装 Chromium 后仍使用 `channel: chrome`。
- 如需改用 Chromium，必须通过受审查的配置变更并重跑 180 项，不能在失败后降低覆盖率。

### 端口占用

- 浏览器开发服务器：4173（`npm run dev`）
- PWA 生产预览：4174（`npm run test:pwa` 内部 build + preview）
- 若已有进程占用，先定位来源；不要直接杀未知进程。CI 为干净环境。

### PWA 测试失败

- 必须先生成生产 `dist`；`test:pwa` 已包含 build。
- 检查 `manifest.webmanifest`、`sw.js`、`_headers`。
- 不得用清空用户 localStorage 或 PWA 缓存来修复。
- 离线测试失败时保留 `test-results/` 与浏览器 console 输出。

### 静态检查失败

- `verify:static` 会检查 manifest、external scripts、SW no-cache、release manifest。
- 修复构建/配置；不要删除检查或降低要求。

## 5. Branch protection 配置（需要仓库管理员授权）

在用户确认仓库私有并完成 GitHub 登录后，优先使用 GitHub UI：

- Settings → Branches → Add branch protection rule
- Branch name pattern: `main`
- Require a pull request before merging
- Require approvals: 1
- Dismiss stale approvals
- Require status checks: `verify`
- Require branches to be up to date before merging
- Block force pushes
- Block deletions
- Include administrators / restrict bypass（若可用）

`gh` 等价示例（**仅在已授权时执行**）：仓库已准备 `scripts/configure-github-protection.sh`，会先检查 CLI 登录和仓库是否私有，再调用 GitHub API：

```bash
REPO=Zephyr-Dawn/Highschool-physics bash scripts/configure-github-protection.sh
```

脚本拒绝在仓库仍为 public 时执行。要求 `main` 的 `verify` 检查通过、至少 1 个审批、禁止 force push/删除、管理员也受保护。

如果 `gh` 未安装，使用 `winget install --id GitHub.cli --source winget` 或从 GitHub 官网下载；不需要把 token 粘贴到聊天。先完成浏览器登录/组织授权，再由用户确认仓库私有。

## 6. 证据记录

每次发布/PR 记录：

- GitHub Actions run URL 与结果；
- `main` / `ai-studio-dev` SHA；
- `dist/release-manifest.json` 的 SHA/文件计数；
- 本地失败重跑日志（脱敏）；
- 真机结果仅从真实设备记录；模拟器/headless 标 `SIMULATED`。

## 7. 当前未完成

- 仓库在检查时仍是 public 且为空；未得到改为私有的授权，未执行 push。
- 因此无 GitHub Actions run、无远端 branch protection 配置、无 CI URL。
- 这些均属于 `BLOCKED: GITHUB_AUTH_OR_PRIVATE_VISIBILITY`，不是测试失败。
