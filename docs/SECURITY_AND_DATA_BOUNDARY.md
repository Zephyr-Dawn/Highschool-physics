# 安全与数据边界

日期：2026-11-06  
适用仓库：`Zephyr-Dawn/Highschool-physics`。用户已明确授权使用**public**代码仓库；仓库只允许包含经过审计的源代码、文档、原创内容与脱敏截图，绝不包含凭据、教师私有题包、学生数据或未授权真题。代码以 `GPL-3.0-only` 授权，第三方依赖与素材按各自许可证分发，详见 [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md)。

## 1. 数据分层

| 层 | 示例 | 存储位置 | 是否进入 Git |
|---|---|---|---|
| 公共源代码与原创内容 | `src/**`、`tests/**`、原创题面/解析、公开文档、模拟截图 | 本 public 仓库 | 是（已按秘密扫描审计） |
| 构建与测试产物 | `dist/`、`test-results/`、Playwright trace、`.local-evidence/` | 本机/CI 临时目录 | 否（`.gitignore`） |
| 浏览器私有数据 | 模型场景、132 题进度、案例进度、教师私有草稿 `emplab.teacher-problems.v1`、设备诊断 | 用户浏览器 `localStorage` | **绝不** |
| 授权材料 | 原卷、图片、商业题库、教师个人资料 | 用户设备/授权平台 | 未经书面授权**绝不** |
| 凭据与签名 | GitHub token、Netlify token、Android keystore、Apple 证书 | 平台密钥/本机安全存储 | **绝不** |

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

- 当前远端为 `Zephyr-Dawn/Highschool-physics`；用户已明确授权 public 推送。任何私有/未授权数据仍不得进入仓库。
- public 仓库意味着源代码和原创题面/解析公开可读；教师私有草稿、学生数据、凭据与未授权原卷必须继续留在本机或私有平台。
- 不得在聊天、提交、issue、CI 日志中粘贴 GitHub token、Netlify token 或其他平台密钥。若凭据曾出现在外部渠道，应立即撤销并重新生成。
- 分支保护至少要求：禁止直接 push `main`、CI `verify` 通过、至少 1 个 reviewer、禁止 force push/删除 `main`。
- GPL 授权只覆盖作者有权许可的原创代码与内容；第三方依赖、KaTeX 字体、转载/外链真题与外部图片不因本仓库采用 GPL 而被重新许可。贡献 PR 的版权状态需单独确认。

## 6. 发现问题的处理

若未来扫描发现可疑凭据：

1. 不打印/提交秘密，不在聊天粘贴；
2. 立即轮换/吊销对应凭据；
3. 若已在 Git 历史，停止推送并评估 `git filter-repo`/BFG 等历史清理；清理需要用户明确授权；
4. 不重写已发布的 `main` 历史，除非用户明确批准并完成协作方通知。

## 7. 发布加固与迁移边界

- **完整本地备份**：`/#/progress` 的“完整本地数据备份”可导出场景、132 题、案例进度、教师草稿、讲解/模式、设备自测为 `emplab.local-backup` v1；导入先预览，按同名键覆盖，失败回滚，不调用 `localStorage.clear()`。备份可能包含教师私有题目，禁止公开上传。
- **跨容器边界**：网站、PWA 主屏幕、Capacitor WebView 是不同 origin/存储容器；必须人工导出/导入，不存在自动同步。原生包不预置教师草稿或学生进度。
- **静态包安全**：`verify:static` 禁止 `.map`/`.env`/证书/密钥/签名文件，扫描高置信度 secret，写入带 `buildId`/SHA-256 的 release manifest；`_headers` 增加 CSP、`X-Content-Type-Options`、`X-Frame-Options`、`Referrer-Policy`、`Permissions-Policy`；`smoke:headers` 用本地静态服务器验证首页/A17/教师页。
- **发布状态**：正式站 <https://soft-toffee-cbd208.netlify.app/> 已上线；没有逐项真机证据不得写 `DEVICE_VERIFIED`；没有真实 Gradle/Xcode 产物不得写 `NATIVE_BUILD_VERIFIED`。线上当前缺少 `release-manifest.json`，下次部署后复查。
- **开源边界**：仓库代码与原创内容采用 `GPL-3.0-only`；不得把第三方依赖、转载试卷、外部图片或未核验真题声明为作者可再许可。GitHub 仓库保持 Public。
- **教师/学生边界**：教师入口不是服务端认证；本地私有草稿在同一浏览器用户间可见；师生共用平板需说明风险。5 条真题继续 `unverified/link_only`，未授权内容不得进入构建、备份公开分享或原生资产。
