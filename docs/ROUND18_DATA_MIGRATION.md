# Round 18 本地数据备份与迁移

日期：2026-11-06  
适用范围：Web 标签页、PWA 主屏幕、Capacitor 原生 WebView 之间的手工迁移。**没有云同步，不能假定自动共享。**

## 1. 数据分类

| 数据 | localStorage 键 | 进入统一备份 |
|---|---|---|
| 16 模型场景 v2 | `emplab.p0x.scene.v2`、`emplab.i0x.scene.v2`、P01 专用键 | 是 |
| 132 题答题/收藏/错题 | `emplab.progress.v1` | 是 |
| 案例逐问进度 | `emplab.cases.progress.v1` | 是 |
| 教师私有草稿 | `emplab.teacher-problems.v1` | 是（文件含私有题目，妥善保管） |
| 模型讲解/模式/图层 | `emplab.<model>.lesson/mode/layers/learning.v1`、`emplab.path.*` | 是 |
| 设备自测记录 | `emplab.deviceCheck.*.v1` | 是 |
| 案例临时备份/返回 | `emplab.case.sceneBackup.v1`、`emplab.case.return.v1` | **否**（临时状态） |
| 精确位置/IP/账号/教师题包导出历史 | 不存在/不存储 | 否 |

## 2. 导出

“我的记录”页 → **完整本地数据备份** → 导出完整备份：
- 只在用户点击时生成 Blob 下载，不上传服务器；
- 单键 ≤1 MiB，总包 ≤4 MiB，最多 1000 个键；
- 备份格式 `emplab.local-backup`，schemaVersion 1，含 `appVersion`、`exportedAt`、汇总计数与原始值；
- 教师草稿包含在文件中；像试卷文件一样保管，不要公开发送。

教师也可在 `/#/teacher/problems` 导出单个题包（`emplab.teacher-problem-package`），用于单题分享/迁移；题包同样只在点击时下载。

## 3. 导入

1. 在目标浏览器打开“我的记录 → 完整本地数据备份”。
2. 选择备份文件；页面先显示条目/题记录/案例/教师草稿/场景数量与同名键冲突数。
3. 只有点击“确认恢复并刷新”才写入；导入前不会改动现有数据。
4. 恢复按备份中的同名键覆盖，不调用 `localStorage.clear()`，不删除备份未包含的键。
5. 写入失败会尝试回滚已写入键，保留原数据；请保留备份文件并重试。
6. 损坏 JSON、错误格式/版本、`__proto__`/`prototype`/`constructor`、超大值、结构不兼容的教师草稿会被拒绝。

## 4. 跨环境迁移

| 场景 | 是否自动迁移 | 正确做法 |
|---|---|---|
| staging → 正式域名 | 否（不同 origin） | 旧站导出完整备份 → 新站导入 |
| Safari 标签页 → 主屏幕 PWA | 通常同 origin 可共享，但不保证 | 仍建议导出备份；若数据缺失再导入 |
| Capacitor WebView ↔ 网站/PWA | 否（不同 origin/容器） | 各自导出/导入；不能宣称自动同步 |
| 换设备/换浏览器/无痕 | 否 | 导出备份后在新环境导入 |
| 清除站点数据 | 会删除 | 无法恢复；只能从已有备份导入 |

## 5. 冲突与安全

- 同名键覆盖前会显示冲突数量；没有自动合并，避免教师草稿/答题记录被静默覆盖。
- 导入失败保持旧数据；不要用清空 localStorage 解决缓存或迁移问题。
- 教师草稿、学生进度、设备自测均不含服务器账号；师生共用平板时数据可能互相可见。
- 备份文件可能含教师题干/答案，不能上传到公开仓库、聊天或第三方云盘；公开仓库只允许代码/原创内容/脱敏截图。

## 6. 测试覆盖

- `tests/release/localBackup.test.ts`：导出汇总、临时键排除、round-trip、损坏/超大/原型污染拒绝、教师草稿结构校验、写入失败回滚、空备份。
- `tests/tablet/round18-release.spec.ts`：真实页面导出/预览/恢复，保留无关键，教师草稿与场景恢复。
- `tests/content/round18Release.test.ts`：备份模块禁止 fetch/XHR/`localStorage.clear`，大小与原型键保护。
