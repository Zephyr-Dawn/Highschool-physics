# 安全与数据边界（GitHub / AI Studio）

日期：2026-11-06  
适用仓库：`Zephyr-Dawn/Highschool-physics`（当前远端可见性为 public、空仓库；迁移前必须由用户确认/改为 private）。

## 1. 数据分层

| 层 | 示例 | 存储位置 | 是否进入 Git |
|---|---|---|---|
| 公共源代码与原创内容 | `src/**`、`tests/**`、原创题面/解析、公开文档、模拟截图 | 本仓库 | 是 |
| 构建与测试产物 | `dist/`、`test-results/`、Playwright trace、`.local-evidence/` | 本机/CI 临时目录 | 否（`.gitignore`） |
| 浏览器私有数据 | 模型场景、132 题进度、案例进度、教师私有草稿 `emplab.teacher-problems.v1`、设备诊断 | 用户浏览器 `localStorage` | **绝不** |
| 授权材料 | 原卷、图片、商业题库、教师个人资料 | 用户设备/授权平台 | 未经书面授权**绝不** |
| 凭据与签名 | GitHub token、Netlify token、Gemini key、Android keystore、Apple 证书 | 平台密钥/本机安全存储 | **绝不** |

## 2. Git 提交边界

- 不提交 `node_modules/`、`dist/`、`test-results/`、`playwright-report/`、`coverage/`、`.local-evidence/`、日志。
- 不提交 `.env*`、私钥、证书、keystore、token、cookie、账号配置。
- 不提交教师私有题包、学生作答、真实设备诊断原始文件；只提交不含个人数据的代码、夹具和已脱敏截图。
- 已提交的截图仅来自原创测试场景（C01–C08、A17-01、教师模板的虚构文本），不是真实课堂数据。
- 5 条高考来源仍为 `unverified/link_only`，只含年份/卷名/题号/外部链接元数据；仓库不新增原卷、图片或答案。

## 3. 秘密扫描（本轮实际执行）

对本目录（排除 `node_modules/`、`dist/`、`test-results/`、`.git/`、`.local-evidence/`）执行了模式扫描：

- GitHub PAT、Google API key、OpenAI key、Netlify token、AWS key、Slack token；
- PEM/私钥头、URL 中嵌入账号密码；
- `.env*`、`*.pem`、`*.key`、`*.p12`、`*.jks`、`*.keystore`、`*.mobileprovision`；
- 常见 `api_key = "..."` / `token = "..."` / `password = "..."` 赋值。

结果：**未发现高置信度凭据或签名文件**。扫描不打印秘密本身。由于当前目录此前没有 Git 历史，不存在需要清理的旧提交。

## 4. 浏览器私有数据保护

- 教师草稿默认仅本机 localStorage；页面明确提示浏览器清理会丢失，需手动导出题包备份。
- 任何迁移到新域名/原生 WebView 都会产生新的 origin 存储空间；需使用已有 JSON 导出/导入完成迁移，不能假设自动同步。
- 诊断 JSON 不包含教师题干、答案、场景、坐标或账号；导出仅由用户显式点击。
- Git 备份代码不等于备份 localStorage。

## 5. 仓库与授权

- 当前远端为 `Zephyr-Dawn/Highschool-physics`，本轮检查时 `private=false`、`size=0`。在用户确认将其改为私有之前，不执行任何 push。
- 推荐访问控制：仅仓库所有者/必要协作者；AI Studio 连接时使用最小权限 GitHub App；不给 AI Studio 提供 `main` 直接写权限。
- 不得在聊天、提交、issue、CI 日志中粘贴 GitHub token、Netlify token 或 Gemini key。若凭据曾出现在外部渠道，应立即撤销并重新生成。
- 分支保护至少要求：禁止直接 push `main`、CI `verify` 通过、至少 1 个 reviewer、禁止 force push/删除 `main`。
- AI Studio 若无明确 `ai-studio-dev` 分支目标显示，只能导出 ZIP 由 Codex 审查提交；禁止点击 Sync/Push。

## 6. 发现问题的处理

若未来扫描发现可疑凭据：

1. 不打印/提交秘密，不在聊天粘贴；
2. 立即轮换/吊销对应凭据；
3. 若已在 Git 历史，停止推送并评估 `git filter-repo`/BFG 等历史清理；清理需要用户明确授权；
4. 不重写已发布的 `main` 历史，除非用户明确批准并完成协作方通知。
