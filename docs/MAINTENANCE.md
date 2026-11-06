# 长期维护手册

日期：2026-11-06  
适用：EM Physics Lab 公开仓库与 Netlify 免费静态站点  
正式站点：<https://soft-toffee-cbd208.netlify.app/>

## 1. 发布流程

统一采用：

```text
codex/<task> 分支 → GitHub PR → GitHub Actions verify → 维护者审查 → 合并 main → Netlify 自动发布
```

- `main` 是生产分支，禁止直接 push、force push、改写历史或绕过 PR。
- 不因普通文档清理重写历史；需要撤销时用新的 revert commit。
- PR 必须说明改动范围、是否触及物理/数据 schema/PWA、测试结果与回滚方式。
- 合并前检查 PR diff 不含凭据、教师私有题包、学生数据、未授权原卷内容。
- GitHub 仓库保持 Public；若要进行可见性变更，必须由维护者明确批准且另开任务。

### 每次发布

1. 本地/CI：`npm run typecheck`、`npx vitest run`、`npm run build`、`npx playwright test`、`npm run test:pwa`、`npm run verify:static`。
2. 记录 GitHub `main` SHA、`dist/release-manifest.json` 的 `buildId`/文件哈希与 Netlify Published deploy 的 commit/SHA；三者应能对应。
3. 部署后运行一次真实 URL 冒烟：
   ```bash
   npm run smoke:staging -- https://soft-toffee-cbd208.netlify.app/
   ```
4. 人工抽查：首页、`/#/cases/case-a17-electric-magnetic-screen`、16 模型中的 P01 3D/P07、132 题页面、教师工作台、设备检测。
5. 检查 Service Worker 更新（两次打开/刷新）、manifest/icons、CSP/安全头、直接深链刷新。
6. 抽查“我的记录 → 完整本地数据备份”导出与恢复；不得用 `localStorage.clear()` 作为更新/修复手段。
7. 若失败：在 Netlify 选择上一已验证 deploy 回滚；必要时重新发布归档 `dist`；回滚不删除浏览器数据。

Netlify 免费额度、构建分钟与带宽有限；不要为纯文档改动反复触发无意义生产部署。合并 PR 后才产生生产部署，PR 预览按平台额度使用。

## 2. 巡检节奏

### 每周

- 打开正式站点，确认 HTTPS、首页/案例/练习/教师页可访问且没有新的控制台错误。
- 查看 Netlify Deploys、带宽/构建分钟和错误日志；记录异常时间与 deploy ID。
- 在至少一条中国大陆实际网络（浙江/黑龙江等）做无代理访问抽测；没有数据就继续标 `NOT_TESTED`，不要推断全国可用。
- 归集 Issue/教师反馈，按物理错误、内容权利、触控/输入、PWA/部署、原生分类。

### 每月

- 检查 Dependabot/`npm audit`；依赖升级单独 PR，先查许可证与破坏性变更，再跑全量物理与浏览器回归。
- 在真实 iPad Safari / Android Chrome 检查触控手柄、双指缩放、软键盘、读屏、WebGL context loss/恢复、离线和 15 分钟暖机；结果写 PASS/FAIL/BLOCKED/NOT_TESTED，不能把 Playwright 写成真机 PASS。
- 抽查教师草稿导入/导出、统一备份恢复、旧场景 v2 与 132 题进度兼容。
- 检查 GitHub 仍为 Public、分支保护/CI 仍生效；不擅自改 Netlify 权限。

### 每学期

- 物理教师复核原创题、案例推导、单位/符号与教学适用性；更新作者/审核记录。
- 复核 5 条高考来源的核验与权利状态；没有权威原卷/书面授权就保持 `unverified / link_only`。
- 收集课堂试用反馈，按“物理正确性 > 权利合规 > 学习体验 > 性能”排序。
- 评估是否需要新增内容；新增前先立项，不为数量破坏现有模型与测试。

## 3. Service Worker、PWA 与数据

- `vite-plugin-pwa` 使用 `autoUpdate`；`sw.js` 必须 `no-cache`，hash 资源可长缓存。
- 升级测试：Build A 保存 P07 场景、I05/I07 手动历史、一道题、一个案例逐问、一个教师草稿；部署 Build B 后刷新，逐键验证仍存在。
- 本地 `npm run simulate:upgrade` 只算 `SIMULATED`；真实升级需在正式/staging origin 验证。
- 首次离线能力来自之前一次成功的在线加载与 SW 缓存；不能承诺全新安装空网可用。
- 存储键：`emplab.progress.v1`、`emplab.cases.progress.v1`、`emplab.teacher-problems.v1`、各模型 `emplab.<model>.scene.v2`、`emplab.deviceCheck.*`。临时案例返回/备份键不进入完整备份。
- 备份/迁移必须“我的记录 → 完整本地数据备份”显式导出导入；Web、PWA 主屏、Capacitor WebView 不自动共享 localStorage。
- 数据 schema 变更必须保留旧版读取/迁移路径；不得静默覆盖教师草稿。

## 4. 安全与许可

- 不提交 `.env*`、token、私钥、证书、keystore、教师私有题包、学生数据或未授权原卷；`verify:static` 会扫描构建产物中的明显 secret/私有文件。
- 发现凭据泄漏：先在平台吊销/轮换，再评估 Git 历史；不要只删除当前文件。
- 第三方依赖保留各自许可证；新增依赖必须在 `docs/THIRD_PARTY_LICENSES.md` 记录包名、版本、许可证和来源。
- 项目原创代码/题目/教学文字采用 `GPL-3.0-only`；不得添加“禁止商业使用”“禁止修改”“必须作者批准”等与 GPL 冲突的附加限制。
- GPL 不覆盖第三方试卷、图片、答案、教师导入内容或商标；外部真题继续只展示元数据/外链。
- 外部贡献 PR：要求贡献者确认其有权提交该内容；不能因为收到 PR 就自动推断所有内容可重新许可。保留 NOTICE/版权与许可证通知。

## 5. 故障与回滚

| 故障 | 第一动作 |
|---|---|
| 站点不可用 | 查 Netlify deploy/状态与 DNS/证书；确认是否平台故障；必要时回滚上一 deploy |
| Netlify 额度耗尽 | 暂停部署，保留下载的已验证 `dist`；评估迁移到等价静态平台，不改源码 |
| PWA 缓存污染/旧 chunk 404 | 检查 `sw.js` `no-cache` 与 manifest；按平台流程更新/注销旧 SW；不删除用户数据 |
| 数据丢失/升级异常 | 停止写入；让用户先导出备份；用旧版本或备份恢复；不使用 `localStorage.clear()` |
| 构建/CI 失败 | 查看 Actions 日志；在 `codex/<task>` 修复并重跑；不得跳过失败测试 |
| 物理/答案错误 | 立即下架相关内容或回滚；补独立解析与失败测试；教师复核后再发布 |
| 密钥泄漏 | 平台吊销/轮换；评估历史暴露；按安全事件流程处理 |
| 国内网络不可用 | 记录真实链路与 DNS/证书证据；评估镜像/迁移，不虚构可用性 |

## 6. 状态口径

- `CODE_READY`：代码/文档/本地测试就绪。
- `STAGING_DEPLOYED` / `PRODUCTION_DEPLOYED`：必须有真实 HTTPS URL、部署 SHA 与线上 smoke。
- `DEVICE_VERIFIED`：只在真实设备完成对应项目后填写；平板/浏览器分开。
- `NATIVE_BUILD_VERIFIED`：必须有真实 Gradle/Xcode 产物和设备日志；仅配置就绪不算。
- `STORE_PUBLISHED`：商店实际审核通过，单独立项。
- 当前正式站点与 iPad Safari 首次打开/添加到主屏幕已有实际使用；Android、完整软键盘/读屏/WebGL 恢复/长时稳定性仍需按 `docs/DEVICE_ACCEPTANCE.md` 记录。

## 7. 分支与废弃资源

- 日常：`codex/<task>` → PR → CI → 合并 `main`。
- 远端 `ai-studio-dev` 是旧流程遗留分支；当前工作流不再使用 Google AI Studio。**不要擅自删除远端分支**，如需清理由维护者确认。
- 历史 Prompt/Brief/旧 QA/大部分截图已移出 Git 跟踪并保存到仓库外私人归档；公开仓库只保留产品 README、技术规范、维护文档和 3 张产品截图。
- 私有归档不得重新提交 Git；归档的 manifest/校验值用于恢复审计。
