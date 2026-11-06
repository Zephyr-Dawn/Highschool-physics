# Round 17 发布与真实设备矩阵

日期：2026-11-05  
结论先行：**本地静态发布包已生成并通过自检；外部 HTTPS 部署为 `BLOCKED`（无托管授权/账号）；真实 iPadOS Safari 与 Android Chrome 为 `NOT_TESTED`；Playwright/headless 的触控与离线结果只记为 `SIMULATED`。**

## 1. 发布状态

| 项目 | 状态 | 证据/说明 |
|---|---|---|
| 生产构建 | `STATIC_PACKAGE_READY` | `npm run build` 成功 |
| 静态产物校验 | 通过（本轮实测） | `npm run verify:static`；`dist/release-manifest.json` 生成 |
| 外部 HTTPS staging/正式发布 | `BLOCKED` | 没有托管账号、站点授权或访问令牌；不虚构 URL |
| 公网深链/离线/升级 | `NOT_TESTED` | 需真实部署后验证；本机只验证了离线重载与 localStorage 键保留，未切换两个线上版本 |
| iPadOS Safari 真机 | `NOT_TESTED` | 无真机证据；不得用 CDP/Playwright 替代 |
| Android Chrome 真机 | `NOT_TESTED` | 同上 |
| 真机 15 分钟暖机/发热/续航 | `NOT_TESTED` | 未测；不声称 60 fps |

## 2. 本地发布准备（不需要托管授权）

```bash
npm ci
npm run typecheck
npx vitest run
npm run build
npx playwright test
npm run test:pwa
npm run verify:static
```

`verify:static` 现在检查：

- `index.html`、`sw.js`、`manifest.webmanifest`、图标、`_headers` 是否存在；
- manifest 是 `standalone`、至少 3 个图标、含 `start_url`；
- `index.html` 不加载第三方脚本，含 React root；
- `sw.js` 为 Workbox 且有 precache；
- `_headers` 对 `sw.js` 设置 `no-cache`；
- 生成 `dist/release-manifest.json`：构建时间、应用版本、文件路径、字节数与 SHA-256，可用于归档和回滚比对。

本地预览：

```bash
npm run preview:staging
```

地址为 `http://localhost:4174/`，**不是公网 HTTPS**，也不能用于证明 PWA 安装或真机验收通过。

## 3. 获得授权后的 Netlify 发布

现有 `netlify.toml` 使用 `npm run build`、发布 `dist`、SPA 回退 `/* → /index.html 200`。下一步需要用户自行提供托管授权，不得索要或提交秘密到仓库。

1. 在 Netlify UI 连接仓库，或在本机执行 `npx netlify-cli login`（授权由用户完成）。
2. 使用已有 `netlify.toml` 参数关联站点；不新建付费服务，不改写为代理/隧道。
3. 发布：`npx netlify-cli deploy --prod --dir=dist`。
4. 记录真实的 HTTPS URL、deploy ID 与 `release-manifest.json` 哈希。
5. 在真实设备浏览器打开 URL，先检查证书、manifest、`sw.js no-cache` 与直接深链。

发布后必测深链：

- `/#/`、`/#/cases`、`/#/cases/case-a17-electric-magnetic-screen`、`/#/teacher/problems`、`/#/device-check`、`/#/path`；
- `/#/teacher/problems/:draftId/edit` 与 `/preview`（使用本机已有草稿）；
- 16 个模型路由直接刷新；
- P01 3D lazy chunk 与教师工作台 lazy chunk 在离线时可用。

只有真实部署且访问成功后，`DEPLOYED` 才可写入发布记录。当前仍为 `BLOCKED`。

## 4. PWA 更新与数据保留

所有键都不属于构建缓存；更新 Service Worker 不得清空用户数据：

| 数据 | 存储键 |
|---|---|
| 模型场景 | 各模型 `emplab.<model>.scene.v2`（P01 保留旧布局迁移） |
| 132 题进度/收藏/错题 | `emplab.progress.v1` |
| C01–C08 + A17-01 案例进度 | `emplab.cases.progress.v1` |
| 案例场景备份/返回 | `emplab.case.sceneBackup.v1`、`emplab.case.return.v1` |
| 教师私有草稿 | `emplab.teacher-problems.v1` |
| 设备检测记录 | `emplab.deviceCheck.*.v1` |
| 安全表达式会话记忆 | 仅内存，不写 localStorage |

更新验收：

1. 旧版本打开并保存一个模型场景、至少一道题正确、一个案例逐问答案、一个教师草稿。
2. 发布新版本，等待 `autoUpdate` 激活并刷新一次。
3. 逐项读取上述键；确认模型页、案例、教师编辑器和 `/#/device-check` 可打开。
4. 不通过“清除站点数据”解决缓存问题；若出现旧资源，检查 `sw.js` 响应头与 Update 流程。
5. 回滚：Netlify 选择上一个已核验 deploy，或重新发布归档的已验证 `dist`；回滚不迁移/清空 localStorage。

## 5. 真机验收脚本

每台设备单独记录，填写 `/#/device-check` 的“目标设备”和“证据来源”。Playwright/自动浏览器的 `navigator.webdriver=true` 会默认标记为 `simulated`，不能改为 PASS。

### 5.1 iPadOS Safari

可直接执行/填写的包：[ipados-safari-round17.md](device-test-packages/ipados-safari-round17.md)。

1. 用真实 HTTPS 打开，确认证书、manifest 与 `/#/device-check` 的安全上下文。
2. Safari 分享菜单“添加到主屏幕”；从主屏图标启动，确认 standalone。
3. 完成首轮缓存与一次在线加载；飞行模式重启，打开 `/#/cases/case-a17-electric-magnetic-screen`、`/#/teacher/problems` 和已导入草稿的预览。
4. 横/竖屏各切换 3 次，检查安全区、动态字体、无横向溢出。
5. 打开 `/#/particle/lorentz-force`：单指旋转、双指缩放、矢量手柄、第二指取消；切后台 1 分钟恢复，记录 WebGL context lost/恢复。
6. 打开 P07 五粒子与 I05/I07 手动时间控制；打开 A17-01，修改 Eₓ/Bz，确认事件和逐问答案更新。
7. 打开教师工作台：创建 A17-02 模板、编辑至少一个字段、保存、预览；确认键盘弹出不遮住保存/舞台。
8. 打开读屏，遍历主导航、教师编辑器、逐问答案输入；记录名称与焦点顺序。
9. 复位网络，执行 15 分钟循环，记录发热、掉电、崩溃、会话回收与输入延迟（只记录系统可见信息）。

### 5.2 Android Chrome

可直接执行/填写的包：[android-chrome-round17.md](device-test-packages/android-chrome-round17.md)。

1. 用真实 HTTPS 打开，确认安装提示或 Chrome 菜单“安装应用”；从桌面图标启动。
2. 在线首载后断网重载；验证案例、教师草稿、16 模型与 lazy chunk。
3. 检查地址栏高度变化、返回手势、软键盘/完成键、数字/数学符号输入。
4. 物理手指触摸 P01 3D、P07 手柄、A17 变式滑块与教师表单；检查 44 CSS px 目标。
5. 切后台 1 分钟、旋转 3 次、读屏 TalkBack 遍历。
6. 执行同样的教师创建/编辑/预览与 15 分钟暖机流程，独立记录。

### 5.3 状态规则

- `PASS`：该设备、系统、浏览器版本、日期、操作下实际完成。
- `FAIL`：可复现失败，记录步骤、截图、导出 JSON。
- `BLOCKED`：无设备、无 HTTPS 授权、无法安装等外部阻碍。
- `N/A`：该设备/场景不适用，写明原因。
- 未执行必须保持 `NOT_TESTED`。
- 自动 Playwright / 无头 Chrome / CDP 合成触摸只属于 `SIMULATED`，不能汇总进真机 PASS 计数。

## 6. 设备诊断报告

`/#/device-check` 导出 JSON（schemaVersion 2）包含：

- `source.evidenceSource`：`simulated` 或 `physical-device-self-reported`；`source.deviceTarget`：iPadOS/Android/桌面模拟/未指定。
- 视口、屏幕、DPR、方向、安全上下文、SW 状态、在线状态、standalone、WebGL/渲染器、CPU/内存、UA、`webdriver`、触点数。
- WebGL 丢失/恢复测试结果、rAF p50/p95/p99、人工检查状态与备注。
- `privacy`：不含教师内容、题目答案、场景数据、精确位置、IP/账号；不自动上传。

报告不会读取或导出 `emplab.teacher-problems.v1`；教师题干/小问/答案不会进入诊断。真机项目默认 `NOT_TESTED`，只有人工在该设备上操作后才能改状态。

## 7. 当前剩余问题

- 无托管授权：无法提供真实 HTTPS URL；需用户选择托管平台并完成登录/授权。
- 无真机：iPadOS/Android 的安装、软键盘、读屏、WebGL 恢复、发热/续航全部未验证。
- 15 分钟暖机不可用自动化替代；不声称精确温度/电池健康。
- 外部真题仍为 `unverified/link_only`，未因本轮部署/教师工作台而升级。
