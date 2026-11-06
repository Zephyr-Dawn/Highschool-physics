# Git / GitHub 工作流

日期：2026-11-06  
生产分支：`main`（Netlify 自动发布）；仓库：<https://github.com/Zephyr-Dawn/Highschool-physics>。

## 1. 分支与提交

| 分支 | 用途 | 规则 |
|---|---|---|
| `main` | 生产稳定版本 | 禁止直接 push、force push、历史重写；必须 PR + CI + 审查 |
| `codex/<task>` | 功能、修复、文档与许可证维护 | 从最新 main 创建，小步提交，PR 回 main |
| 历史 `ai-studio-dev` | 旧流程遗留 | 当前工作流不再使用 Google AI Studio；不擅自删除，等待维护者确认 |

- 一次提交只做一件可解释的事；物理、UI、依赖升级、纯文档分别提交。
- 不在仓库写入 token、私钥、教师私有题包、学生数据、未授权原卷。
- 提交信息示例：`docs: adopt GPLv3 and prune repository`。
- `main` 合并采用 PR；是否 squash 由维护者决定，不强制改写已发布历史。

## 2. PR 检查清单

- 改动范围与不涉及物理/数据 schema 的说明；
- 受影响页面、路由、PWA、教师数据边界；
- 本地与 CI 测试结果（typecheck/Vitest/Playwright/PWA/build/verify:static）；
- 物理修复的独立解析与回归证据；
- 截图（如涉及 UI）；
- 回滚方式；
- 新增第三方依赖/素材的许可证记录。

CI 由 `.github/workflows/ci.yml` 在 PR→main、push main 和手动 dispatch 时运行；权限只读，不使用可能泄漏密钥的 `pull_request_target`。

## 3. 合并与回退

1. PR 的 `verify` 通过且审查完成，由维护者合并 `main`。
2. Netlify 自动构建/发布；合并后按 `docs/MAINTENANCE.md` 检查线上 SHA、页面、PWA 与备份。
3. 代码回退优先新开 `codex/revert-*` PR 或 `git revert`，不强制推送/重写 main。
4. 站点回退在 Netlify 选择上一已验证 deploy，**不删除**任何浏览器本地数据。

## 4. 本地命令

```bash
git switch main
git pull --ff-only origin main
git switch -c codex/your-task
# edits
npm run typecheck
npx vitest run
npm run build
npx playwright test
npm run test:pwa
npm run verify:static
git add <reviewed files>
git commit -m "type: concise summary"
git push -u origin codex/your-task
# create PR to main; do not auto-merge or force push
```

## 5. 受保护内容

涉及 `src/physics/**`、`src/math/**`、题目答案、持久化 schema、PWA 生命周期或全部测试的改动必须独立 PR、给出物理/兼容证据；不能用 UI 预览成功代替全量回归。

## 6. 旧 AI Studio 资源

`ai-studio-dev` 远端分支与旧文档仅作为历史遗留；当前统一使用 Codex 分支 + PR + CI + Netlify。不得重新引入 Google AI Studio 开发流程；删除远端分支需维护者明确批准。
