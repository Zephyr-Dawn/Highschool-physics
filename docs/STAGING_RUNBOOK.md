# 部署与回滚 Runbook

日期：2026-11-06  
正式站点：<https://soft-toffee-cbd208.netlify.app/>  
平台：Netlify Free（静态 `dist`，现有 `netlify.toml` 保持不变）

## 1. 当前状态

| 项目 | 状态 |
|---|---|
| 正式 HTTPS 站点 | **已上线并可访问**（Netlify） |
| 公网首页 | 已复查可访问；深链/PWA 完整矩阵仍持续记录 |
| iPad Safari | 已实际打开并添加到主屏幕；完整课堂矩阵见 `docs/DEVICE_ACCEPTANCE.md` |
| Android Chrome / 长时稳定性 | **NOT_TESTED / 持续验收** |
| 正式站点 release-manifest | 当前线上旧构建可能返回 HTML fallback；本 PR 的 `postbuild` 已修复后续部署生成 manifest，合并后复验 |

## 2. 发布方式

`main` 合并后由 Netlify 自动执行：

```toml
command = "npm run build"
publish = "dist"
redirect /* -> /index.html 200
```

`npm run build` 现包含 `postbuild`：自动生成 `dist/release-manifest.json`（buildId + 文件 SHA-256 + secret/私有文件检查），无需更改 Netlify 站点设置。不要直接 push `main`，也不要在 PR 中触发无意义部署。

## 3. 发布前门禁

```bash
npm ci
npm run typecheck
npx vitest run
npx playwright test
npm run build
npm run verify:static
npm run test:pwa
npm run smoke:headers
```

记录 GitHub `main` SHA、`release-manifest.json` buildId/SHA 与 Netlify Published deploy 的 commit SHA。

## 4. 线上冒烟

```bash
npm run smoke:staging -- https://soft-toffee-cbd208.netlify.app/
```

检查：

- HTTPS 证书、`/`、manifest、`sw.js`（no-cache）、release manifest；
- `/#/`、`/#/cases/case-a17-electric-magnetic-screen`、`/#/teacher/problems`、`/#/device-check`、`/#/path` 直接打开/刷新；
- 16 模型、P01 3D lazy chunk、A17 整题、教师编辑器加载；
- 首次在线加载后断网重载；真实手机/平板交互单独记录；
- CSP、安全头、教师草稿不进入缓存；5 条真题仍只显示元数据/外链。

若线上仍返回旧构建或 release-manifest fallback：不要修改 Netlify 权限；等待合并后的自动部署，或由维护者在 Netlify 重新发布已验证 `dist`。

## 5. PWA 更新与数据

- Build A 保存一个 P07 场景、I05/I07 手动历史、一道题、一个案例逐问、一个教师草稿；
- 部署 Build B 后等待 `autoUpdate` 激活并刷新；逐键检查数据仍在；
- 本地 `npm run simulate:upgrade` 只是 `SIMULATED`，不能替代同 origin 真实验证；
- 不使用 `localStorage.clear()` 修复缓存/更新问题。

## 6. 回滚

1. 记录回滚前 URL、deploy ID、`buildId`、manifest SHA。
2. Netlify Deploys → 选择上一已验证 deploy → Publish deploy；或重新上传归档 `dist`。
3. 不删除浏览器数据；如 SW 仍持旧缓存，按平台流程更新/注销后重载。
4. 重跑线上深链、PWA、A17、教师页与统一备份检查。

## 7. 网络与额度

Netlify Free 的构建分钟/带宽有限；纯文档 PR 不反复触发生产部署。中国大陆课堂网络需真实链路抽测；没有数据时写 `NOT_TESTED`，不要用本机结果推断全国可访问性。
