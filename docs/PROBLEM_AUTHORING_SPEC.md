# Round 17 教师题目建模规范

日期：2026-11-05  
状态：本机教师工作台已实现；不是公开题库、云同步或真题授权系统。

## 1. 路由与用户流

| 路由 | 页面 | 作用 |
|---|---|---|
| `/#/teacher/problems` | `TeacherProblemListPage` | 模板创建、复制内置案例、导入私有题包、列表、删除、复制、导出、状态 |
| `/#/teacher/problems/:draftId/edit` | `TeacherProblemEditorPage` | 题干/小问/推导/提示/答案绑定/阶段/参数/来源与权利编辑 |
| `/#/teacher/problems/:draftId/preview` | `TeacherProblemPreviewPage` | 使用同一个 `WholeProblemLab` 的学生视图，带“本机教师草稿，非官方真题”标识 |

新建题只允许选择注册为 `authorable` 的适配器：

- `a17-electric-magnetic-screen`：A17-01 电场加速 → 有限磁场 → 无场漂移 → 屏幕。
- `i07-opposite-wall`：A17-02 相反磁区 → 感应电流 → 挡板碰撞 → 再入。

C01–C08 及 A17-01 可复制为私有草稿；复制通过 `sourceCaseId` 保留已核验内置适配器的行为，不修改内置数据。

## 2. 数据契约

持久化 schema 版本：`emplab.teacher-problem.v1`。单份草稿包含：

```text
schema, version, id, title, subtitle, difficulty, topicTags, stem
provenance: kind, sourceUrl?, examYear?, paperName?, questionNumber?,
            sourcePublisher?, sourceReview, rights, reviewEvidence?,
            rightsEvidence?, reviewNotes?
scenario: adapterId, originDescription, physicalStages[], teacherAnnotations[],
          variations[]
parts[]: id, prompt, targetQuantities[], hints[], derivationSteps[],
         answerSpec{quantity, unit, tolerance{abs,rel}, dependsOn[]},
         misconception, independentProofRef
sourceCaseId?, createdAt, updatedAt
```

内容上限：

- 题干 8,000 字符；题目/阶段/小问/推导/提示均有限长。
- 小问 ≤12，每问推导 ≤8 步、提示 ≤6 条、目标量 ≤6 个；规范质量门槛仍为 ≥3 问、≥2 提示、≥3 推导。
- 物理阶段 ≤8，变式 ≤6。
- 单草稿 ≤256 KiB；导入题包 ≤512 KiB；JSON 深度 ≤24。
- 文本拒绝控制字符；来源链接只允许无用户名/密码的 `http/https` URL。

答案单位使用现有 `caseAnswerCheck` 支持的单位集合；编辑量纲不匹配会在编译期阻止预览。不保存 `baselineValue`：每次编译从当前适配器的 `model.answers[quantity]` 重新取值，避免导出/导入后沿用旧答案。

## 3. 白名单适配器与阶段能力

`src/features/problem-authoring/problemAdapterRegistry.ts` 是唯一适配器清单。持久化数据只保存适配器 ID 和有限数值/文本，不保存函数、类、模块路径或代码。编译器对未知 ID 直接拒绝，不执行动态 `import`。

| 适配器 | 能力 | 阶段 | 可编辑参数 |
|---|---|---|---|
| A17-01 | `continuous`，跨求解器 | 电场加速 / 有限磁场 / 自由漂移 | `electricFieldX`, `magneticFieldZ`, `magneticWidthM`, `screenGapM` |
| A17-02 | `continuous`，I07 同一引擎 | 双场 / 挡板 / 再入 | `restitution`, `field2Bz` |
| 其他 7 个内置适配器 | 只用于复制内置案例 | 沿用内置事件 | 不允许新建 |

A17-01 使用 `crossedFields` 的真实解析运动、`finiteMagneticRegion` 的真实边界事件与自由漂移；A17-02 使用 `solveI07` 的完整多事件轨迹。没有把“都有 x/v”的任意模型自动拼接；未注册组合不显示连续徽标。

阶段交接不保存为可编辑的任意 JSON 函数，而是由物理运行时返回：

- `StageExit`：阶段、全局时间、边界 ID、粒子状态、状态码。
- 交接检查：位置、速度、全局时间误差均要求 ≤1e-9（本轮实际为 0），并检查 `q,m` 与粒子身份。
- 若无出场/命中，返回 `not reached / no-exit / missed / outside`，不生成下一段伪造状态。

## 4. 教师可编辑内容

- 题干、题目名称、副标题、难度、知识点。
- 任意增删排序小问；每问题干、目标量、两层以上提示、推导步骤、公式、引用事件、误区、独立验算依据。
- 答案观测量只能从当前适配器 `model.answers` 的键中选择；单位随观测量设定；容差可编辑。
- 阶段标题、起止事件 ID、阶段限制、舞台坐标/时间说明、教师提示。
- 已注册参数变式的显示名称、标准值/最小/最大/步长。标准值使用现有安全数学表达式输入，不接受 `eval`。
- 来源类型、核验状态、来源链接、核验证据、公开转载权利、权利依据。**核验与权利是独立字段**。

导出题包只包含上述 JSON；导出仅在点击“导出”时发生。导入不会自动发布、不会自动上传，也不会自动把审核状态变成已验证。

## 5. 验证状态

编译/检查结果由当前代码实时生成，不信任题包内的自述：

| 状态 | 条件 |
|---|---|
| `unsupported` | 未知或不支持的适配器 |
| `physics_unverified` | 适配器构建失败、无物理模型 |
| `content_incomplete` | 阻断错误（事件缺失、答案未绑定、单位不符、公式含危险命令等）或不足 3 问 |
| `simulation_verified` | 模型构建成功、事件引用有效、A17 两个交接点通过、至少 3 问全部绑定且当前答案有限 |

来源核验与公开权利不会因 `simulation_verified` 自动升级。`exam_reference` 且未记录 `permission_granted` 的草稿只允许本机预览，并显示明确警告。

## 6. 安全与存储

- 存储键：`emplab.teacher-problems.v1`；只写 `localStorage`，不进入构建、PWA precache、日志或诊断 JSON。
- 首次加载损坏 JSON：返回错误并保留原始存储，不自动清空。
- 导入先做字节上限、JSON 深度/危险键（`__proto__`、`prototype`、`constructor`）扫描，再做 strict Zod 校验；失败不写任何数据。
- 重名 ID 导入自动分配新草稿 ID；内容与物理绑定不变。
- 解析公式在 UI 中以 KaTeX `trust: false` 渲染；编译器额外拒绝 `\href`、`\url`、`\html`、`\includegraphics`、`\class`、`\style`、`<script>/<iframe>/<img>` 与 `javascript:`。
- 教师文本一律 React 纯文本渲染，不支持任意 HTML/Markdown 注入。
- 浏览器清理站点数据会删除草稿；UI 明确提示并提供导出。未实现图片附件，避免把大 Blob/base64 写入 localStorage。

## 7. 已知边界

- 没有服务端同步、公开题库、账号或多人协作。
- 新建题只支持 A17-01/A17-02 两类白名单物理编排；C01–C08 的复制是内容编辑，不是任意求解器拼接。
- 预览不写入案例进度；学生若要在另一台设备使用，需要教师显式导出题包再由该设备导入。
- 真机键盘、读屏和 15 分钟暖机仍需真实 iPadOS/Android 测试；headless 结果只算 `SIMULATED`。
