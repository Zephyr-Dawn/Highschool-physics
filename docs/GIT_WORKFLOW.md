# Git / GitHub / Google AI Studio 工作流

日期：2026-11-06

## 1. 分支模型

| 分支 | 用途 | 写入规则 |
|---|---|---|
| `main` | 经验证的稳定源代码；Netlify/发布以它或批准的 tag 为源 | 禁止直接 push；必须 PR + `verify` CI + 审查 |
| `ai-studio-dev` | AI Studio 的 UI/UX 收口与受控原生试验 | 小批量提交；禁止直接合并到 main |
| `codex/*` | Codex 修复/兼容性改动 | 从 main 或必要基线创建，PR 回各自目标 |
| `native-pilot/*` | Capacitor/原生隔离试验 | 不影响 main/ai-studio-dev 的物理与数据 |

初始 `main` 与 `ai-studio-dev` 必须指向同一个经验证基线 commit。基线 tag 使用 `baseline-pre-ai-studio-2026-11`（若已存在不得覆盖）。

## 2. AI Studio 同步前检查

AI Studio 每次打开/同步前：

1. 记录 GitHub 仓库、当前可见分支、HEAD SHA（如界面显示）。
2. 确认目标分支明确为 `ai-studio-dev`；不能因为仓库中存在该分支就假设默认推送目标。
3. 若 UI 不能选择/显示目标分支，或可能推送到 `main`：**不点 Push/Sync**。
4. 检查是否已有 Codex 新提交；有则先拉取/查看差异。
5. 只进行白名单内 UI 文件的小步修改。
6. 任何涉及 `src/physics/**`、`src/math/**`、PWA、数据 schema、题目答案的改动都先停止。

## 3. ZIP fallback（强制）

当分支不确定、认证异常、冲突或 Studio 无法运行完整测试：

1. 在 Studio 使用 `Download app` / 导出 ZIP，不在 GitHub 写入。
2. 保存 ZIP 与文件清单到本机非仓库目录。
3. Codex 在 `ai-studio-dev` 上创建临时分支/工作树，解压并仅挑选允许目录。
4. 审查 diff，运行 `npm run typecheck`、定向测试、全量 CI。
5. 由 Codex 提交到 `ai-studio-dev`，开启 PR；不直接推 `main`。
6. 记录 ZIP 来源、文件 hash、应用后的 commit SHA。

ZIP 中不得包含教师私有导出、真实学生数据、API key、签名材料。

## 4. 提交与 PR 规则

- 一次提交只做一件可解释的事；UI、物理、依赖升级分开。
- 提交信息建议：`ui: tighten P07 tablet stage controls`。
- PR 描述必须列出：
  - 改动范围与不涉及物理的说明；
  - 受影响页面/视口；
  - 本地与 CI 测试结果；
  - 截图；
  - 回退方式。
- 禁止 `--force`、历史重写、修改已发布 tag。
- 禁止直接向 `main` push；禁止在 PR 中混入未授权真题内容。

## 5. CI 与保护

- `.github/workflows/ci.yml` 在 PR→main 与 push main/ai-studio-dev 上运行。
- 权限仅 `contents: read`；不使用 `pull_request_target`。
- CI 必须通过 `typecheck`、Vitest、build、`verify:static`、Playwright、PWA。
- 分支保护建议：
  - Require a pull request before merging；
  - Require approvals ≥1；
  - Require status check `verify`；
  - Dismiss stale approvals；
  - Require conversation resolution；
  - Block force pushes and deletions；
  - Do not allow bypass（包括管理员，若可用）。
- 具体配置命令/界面步骤见 `docs/CI_RUNBOOK.md`。

## 6. 合并与回退

- UI 批次：Codex 审核受保护文件未变更 → CI 通过 → 用户批准 PR → merge（建议 squash）到 `main`。
- 物理修复：单独分支、独立解析/测试证据，再单独 PR。
- AI Studio 错误修改：
  1. 在 `ai-studio-dev` 找到批次 commit；
  2. `git revert <sha>`（不重写历史）；
  3. 推送 revert commit；
  4. 全量 CI；
  5. 如影响 main，另开修复 PR。
- 不直接删除 `ai-studio-dev` 或重置远端来掩盖问题；保留历史。

## 7. 本地命令

```bash
git switch main
git pull --ff-only origin main
git switch -c codex/ui-xxx
# edits
npm run typecheck
npx vitest run
# targeted browser tests
git add <reviewed files>
git commit -m "ui: ..."
git push -u origin codex/ui-xxx
# open PR to ai-studio-dev or main as appropriate
```

## 8. 冲突处理

涉及以下冲突时，不用 UI 端“Use my version”：

- `src/physics/**`
- `src/math/**`
- `src/content/**` 的答案/题目
- `src/app/App.tsx` 路由/Provider
- `vite.config.ts` / PWA
- `package.json` / lockfile
- 持久化 schema/keys

处理方式：导出当前改动 ZIP/补丁，Codex 读取双方历史，逐文件合并，跑物理回归和全量 CI，再提交。
