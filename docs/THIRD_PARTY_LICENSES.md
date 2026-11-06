# 第三方许可与版权审计

日期：2026-11-06  
审计范围：仓库跟踪的源代码、原创题目/讲解、`public/` 资源、截图、直接依赖与 Capacitor pilot 配置。

## 1. 项目自身许可

- 原创源代码、原创练习、C01–C08/A17-01 原创整题案例与教学文字：**GPL-3.0-only**（SPDX）。
- 项目版权声明：`Copyright (C) 2026 EM Physics Lab contributors`。具体权利人的公开显示名可由维护者后续确认；这不改变已授出的 GPL 权利。
- 根目录 `LICENSE` 是 GNU 官方 `gpl-3.0.txt` 原文（674 行），未修改；SHA-256：`3972dc9744f6499f0f9b2dbf76696f2ae7ad8af9b23dde66d6af86c9dfb36986`。
- 项目名称/标识用于识别官方项目；GPL 不自动授予商标权，也不限制 GPL 源码本身的合法使用。

## 2. 直接运行时依赖

| 包 | 安装版本 | 许可 | 上游 |
|---|---:|---|---|
| `@react-three/fiber` | 9.8.2 | MIT | https://github.com/pmndrs/react-three-fiber |
| `katex` | 0.16.47 | MIT | https://github.com/KaTeX/KaTeX |
| `react` | 19.3.1 | MIT | https://github.com/facebook/react |
| `react-dom` | 19.3.1 | MIT | https://github.com/facebook/react |
| `react-router-dom` | 7.18.5 | MIT | https://github.com/remix-run/react-router |
| `three` | 0.187.0 | MIT | https://github.com/mrdoob/three.js |
| `zod` | 4.6.7 | MIT | https://github.com/colinhacks/zod |

## 3. 直接开发/构建依赖

| 包 | 安装版本 | 许可 |
|---|---:|---|
| `@playwright/test` | 1.64.1 | Apache-2.0 |
| `@testing-library/jest-dom` | 6.9.1 | MIT |
| `@testing-library/react` | 16.3.3 | MIT |
| `@types/*` | 见 lockfile | MIT |
| `@vitejs/plugin-react` | 5.2.0 | MIT |
| `jsdom` | 27.4.0 | MIT |
| `typescript` | 5.9.3 | Apache-2.0 |
| `vite` | 7.3.7 | MIT |
| `vite-plugin-pwa` | 1.3.0 | MIT |
| `vitest` | 3.2.7 | MIT |

这些工具不随生产应用源码重新授权；其版权仍归各自作者。传递依赖由 `package-lock.json` 固定，并由各包自带许可证；`node_modules/` 不提交。

## 4. Capacitor Pilot

`native/capacitor-pilot/package.json` 固定：

| 包 | 版本 | 许可 | 状态 |
|---|---:|---|---|
| `@capacitor/core` | 8.6.0 | MIT | 未在本机安装/未生成原生工程 |
| `@capacitor/android` | 8.6.0 | MIT | 未安装 |
| `@capacitor/cli` | 8.6.0 | MIT | 未安装 |

原生依赖安装后会带入各自的传递依赖；构建前需重新执行许可清单审计。当前没有 APK/IPA。

## 5. 内容、字体、图片与外部来源

- KaTeX 字体/CSS：随 `katex` 以 MIT 分发；未单独修改第三方字体文件。
- `public/favicon.svg`、`public/icons/*`：由项目脚本/项目设计生成，按项目 GPL 发布；未发现外部图标包署名。
- `docs/screenshots/product-*.png`：本项目自身界面的脱敏截图，不包含真实学生/教师数据。
- 5 条高考来源索引：只保留年份/卷名/题号/外链等元数据，**未复制题干、图片或答案**；权利状态仍为 `unverified / link_only`。**这些第三方内容不由本项目 GPL 重新许可。**
- 教师导入的题包、外部试卷、第三方图片：属于用户本机内容，不在 GPL 覆盖范围；公开分发前由用户自行确认权利。

## 6. 待核验事项（PENDING_REVIEW）

1. 权利人公开显示名是否采用 `EM Physics Lab contributors` 或另行确认的法定名称。
2. 原生 Capacitor 依赖安装后的传递依赖许可清单。
3. 任何未来新增的题目图片、教辅素材、外部字体或图标必须先记录来源和许可，再提交。
4. 5 条真题索引仍无权威原卷/转载授权；不得因项目整体采用 GPL 而将其重新许可。
