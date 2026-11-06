# 静态部署、HTTPS 与线上验收

## 1. 当前状态

- 正式网站：<https://soft-toffee-cbd208.netlify.app/>（公开、免费使用，匿名可访问）。
- 托管：Netlify 静态站点；`main` 合并后自动构建 `npm run build` 并发布 `dist/`。
- 2026-11-06 复查：首页返回 HTTPS 200；CSP、HSTS、`X-Content-Type-Options`、`X-Frame-Options`、`Referrer-Policy`、`Permissions-Policy` 均存在；`sw.js` 为 `application/javascript` 且 `no-cache`；`manifest.webmanifest` 为 `application/manifest+json`。
- 线上当前构建尚未包含 `release-manifest.json`（请求回退为 HTML）。`postbuild` 已修复构建流程，下一次 Netlify 生产部署会自动生成该文件。
- 真实 iPad Safari 打开与“添加到主屏幕”已由使用者完成；完整触控、软键盘、WebGL 恢复、离线升级与 15 分钟稳定性仍为 `NOT_TESTED`。Android 未测试。见 [DEVICE_ACCEPTANCE.md](DEVICE_ACCEPTANCE.md)。

本文件不把浏览器自动化或 CDP 合成触摸当作真机通过。完整发布与回滚步骤见 [STAGING_RUNBOOK.md](STAGING_RUNBOOK.md)。

## 2. 本地构建与自检

```bash
npm ci
npm run typecheck
npx vitest run
npm run build
npx playwright test
npm run test:pwa
npm run verify:static
```

`verify:static` 检查 `dist` 的必需文件、JS/CSS、Service Worker、manifest、图标与 `_headers`，拒绝源映射、`.env`、证书、密钥或高置信度秘密，并生成 `dist/release-manifest.json`（buildId、文件字节与 SHA-256）。`postbuild` 保证普通 `npm run build` 也会生成该 manifest。

本地生产预览：

```bash
npm run preview:staging
# 另一个终端
npm run smoke:staging -- http://127.0.0.1:4174
```

## 3. 线上发布

1. 功能开发使用 `codex/<task>` 分支，经 PR、CI 与代码审查后合并 `main`。
2. 合并会触发 Netlify 自动构建；不直接在 `main` 提交，不强制推送，不在文档清理时反复触发无意义部署。
3. 发布后记录 Netlify deploy SHA、构建 ID，并核对 GitHub `main` 与线上产物一致。
4. 运行线上冒烟：

```bash
npm run smoke:staging -- https://soft-toffee-cbd208.netlify.app
```

5. 抽取检查 `/#/`、`/#/cases`、`/#/path`、`/#/device-check`、`/#/teacher/problems`、`/#/cases/case-a17-electric-magnetic-screen`，以及 P01 3D 懒加载 chunk 与 `release-manifest.json`。

当前发布的 `release-manifest.json` 在下次部署前仍缺失；这是已知发布产物缺口，不影响应用主功能。

## 4. 缓存与安全头

- `public/_headers`：`/sw.js`、`/manifest.webmanifest` 为 `no-cache`；`/assets/*` 长缓存；图标 7 天缓存。
- `index.html` 由 Netlify 返回 `Cache-Control: public,max-age=0,must-revalidate`，避免旧 HTML 指向已删除 chunk。
- CSP 仅允许同源脚本与样式、`data:`/`blob:` 图片与字体、同源连接、`blob:` worker；不引入远程脚本或第三方分析。
- HSTS 已启用；HTTP 访问由 Netlify 跳转 HTTPS。

## 5. PWA 安装、离线与更新

- 安装：iPadOS Safari 分享 → 添加到主屏幕；Android Chrome 菜单 → 安装应用；桌面 Chrome 地址栏安装。
- 首次离线可用要求先在线完整加载并等待 Service Worker 激活；未缓存时不得承诺离线。
- 更新由 `vite-plugin-pwa` 的 `autoUpdate` 处理；本地数据键独立于构建，更新不调用 `localStorage.clear()`。
- 若线上仍显示旧资源，先确认 `sw.js` 为 `no-cache`，再按平台流程注销旧 Service Worker 并重载。
- 回滚：在 Netlify 选择上一个已验证 deploy 重新发布；不得清空用户 localStorage。

## 6. 中国大陆网络与限制

- 未在浙江、黑龙江或其他真实校园网络做系统性可访问性测量；不要宣称“国内稳定访问”。
- Netlify 仅作为当前技术选择；如真实链路不可用，再评估等价静态托管迁移，不改动物理与数据层。
- 外部真题来源为 `unverified / link_only`，离线不可用属预期；站点不缓存未授权原卷。
- Netlify 免费额度有限；发布 PR 前说明合并后将消耗一次生产部署额度。

## 7. 真机验收入口

设备状态、逐项清单与结果模板见：

- [DEVICE_ACCEPTANCE.md](DEVICE_ACCEPTANCE.md)
- [DEVICE_RELEASE_MATRIX.md](DEVICE_RELEASE_MATRIX.md)
- [CLASSROOM_DEVICE_QA.md](CLASSROOM_DEVICE_QA.md)

自动化结果只能标 `SIMULATED`，不能写成真实 iPad/Android 通过。
