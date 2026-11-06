# GitHub 交接基线（2026-11-06）

工作区：`H:\programming\EM_Physics_Lab`  
目标仓库：`https://github.com/Zephyr-Dawn/Highschool-physics`  
本轮：Round 18.5 — 稳定基线冻结、GitHub 私有仓库、`ai-studio-dev`、CI 与 AI Studio 交接。

## 1. 初始 Git 状态（审计时）

| 项目 | 实际值 |
|---|---|
| 当前目录 | 无 `.git`（审计开始时） |
| 历史提交 | 无（不是已有 Git 仓库） |
| remote | 无 |
| 包管理器 | npm；仅 `package-lock.json`，无 pnpm/yarn/bun 锁文件 |
| Node / npm | v22.20.0 / 11.7.0 |
| Playwright | 1.64.1；本机 Chrome channel |
| 远端仓库 | 存在，HTTP 200；GitHub API 返回 `private=false`、`size=0`、默认分支 `main`、无 heads |
| GitHub CLI / token | `gh` 未安装；环境无 `GITHUB_TOKEN`/`GH_TOKEN`；未探测/导出凭据管理器秘密 |
| GitHub 推送 | **BLOCKED：需要私有化确认与 GitHub 登录授权** |

## 2. 本轮实际测试基线

| 命令 | 退出码 | 实际结果 |
|---|---:|---|
| `npm run typecheck` | 0 | 通过 |
| `npx vitest run --reporter=dot` | 0 | **593/593**，54 文件 |
| `npx playwright test` | 0 | **180/180**，7.1 分钟（headless/SIMULATED） |
| `npm run build` | 0 | 通过；PWA precache 143 项 / 4298.11 KiB |
| `npm run test:pwa` | 0 | **3/3**（含教师草稿/旧进度离线保留） |
| `npm run verify:static` | 0 | `71 JS, 1 CSS, assets 4239.4 KiB, 139 files, sha f3ea43f6b30e`；生成 `dist/release-manifest.json` |

构建大小：入口 JS 339.74 kB（gzip 103.33 kB）；CSS 140.61 kB（gzip 28.78 kB）；P01 3D 978.52 kB（gzip 263.16 kB，独立懒加载）。

日志与退出码保存在本机 `.local-evidence/`（被 `.gitignore` 排除，不提交）。没有失败、跳过或放宽测试。

## 3. 内容与安全审计

- 高置信度 secret 模式扫描：未发现 GitHub PAT、Google API key、Netlify token、PEM/私钥头、URL 内嵌凭据或常见 token/password 赋值。
- 敏感文件类型扫描：未发现 `.env*`、`*.pem`、`*.key`、`*.p12`、`*.jks`、`*.keystore`、`*.mobileprovision`。
- 当前目录此前无 Git 历史，因此没有旧提交泄密需要清理。
- `.gitignore` 已排除 `node_modules/`、`dist/`、`test-results/`、`playwright-report/`、`coverage/`、`.local-evidence/`、`.env*`、证书/密钥/keystore/签名、私有教师导出与本地设备报告。
- 5 条高考索引仍为 `unverified/link_only`；没有新增原卷、图片或答案。
- 教师草稿/学生数据只存在浏览器 localStorage；任何脚本都不读取或上传。
- 详细边界见 `docs/SECURITY_AND_DATA_BOUNDARY.md`。

## 4. 纳入 Git 的内容

- `src/**`、`tests/**`、`public/**`、`scripts/**`、配置文件；`package.json` + `package-lock.json`。
- 项目文档、原创题目/解析、教师工作台实现、已脱敏的原创测试截图。
- Round 1–17 任务书与 `01_/02_` 交接文件；不含凭据。
- `.github/workflows/ci.yml`、AI Studio 交接与 Git/发布/原生评估文档。

排除：依赖、构建产物、测试 trace/视频/报告、本地日志、浏览器数据、凭据、签名、私有题包。

## 5. 状态定义

| 状态 | 本轮 |
|---|---|
| `LOCAL_BASELINE_VERIFIED` | 是 |
| `GITHUB_PUSHED` | **否：BLOCKED（仓库仍 public、无 GitHub 授权）** |
| `AI_STUDIO_BRANCH_READY` | 局部：本地分支与交接文件已准备；远端未推送 |
| `CI_VERIFIED` | **否：CI_NOT_RUN（无推送）** |
| `AI_STUDIO_IMPORT_VERIFIED` | **否：NOT_TESTED（无授权账号/UI 验证）** |
| `STAGING_DEPLOYED` | **否：BLOCKED（无托管授权）** |
| `NATIVE_BUILD_VERIFIED` | **否：BLOCKED（本机无 Java/Android SDK/Xcode）** |
| `REAL_TABLET_VERIFIED` | **否：NOT_TESTED** |

## 6. 授权后执行顺序

1. 用户将 `Zephyr-Dawn/Highschool-physics` 改为 **private**（或明确书面授权公开），并完成 GitHub 登录。
2. 本地验证 `git status` 无未审查改动；`git remote add origin https://github.com/Zephyr-Dawn/Highschool-physics.git`。
3. `git push -u origin main`；确认远端 main SHA。
4. `git push -u origin ai-studio-dev`；确认两个分支同基线 SHA。
5. `git push origin baseline-pre-ai-studio-2026-11`（tag）。
6. 用已认证 `gh` 运行 `bash scripts/configure-github-protection.sh`，或在 GitHub Settings→Branches 配置 `main` 保护。
7. 观察两个分支的 Actions `verify`，记录 run URL 与结果；只有真实通过才写 `CI_VERIFIED`。
8. 在 AI Studio 导入仓库，先确认 push 目标为 `ai-studio-dev`；无法确认则使用 ZIP fallback。

## 7. 仍需用户操作

- 确认并授予 GitHub 私有仓库/推送授权（不要把 token 粘贴到聊天）。
- 如需远程 CI 和分支保护，需要仓库管理员权限。
- 如要实际部署，提供 Netlify（或等价）站点授权；当前无公网 URL。
- 真机 iPadOS/Android 验收仍需用户设备。
