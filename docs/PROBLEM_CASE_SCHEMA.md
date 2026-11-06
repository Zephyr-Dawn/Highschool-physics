# 题目案例 Schema 与作者规范（Round 15）

## 1. 目标

`ProblemCase` 是“题目 → 预设实验 → 推导核验 → 变式 → 返回题目”的类型化数据契约。它独立于 132 道原创选择题；案例数量单独统计，不自动增加题数。

实现：`src/content/problemCaseSchema.ts`、`src/content/problemCases.ts`。页面：`src/pages/CaseListPage.tsx`、`src/pages/CaseDetailPage.tsx`。

## 2. 类型

```ts
type SourceKind = 'original_case' | 'exam_reference';
type VerificationStatus = 'unverified' | 'metadata_verified' | 'paper_and_solution_verified';
type RightsStatus = 'original' | 'link_only' | 'permission_granted' | 'unknown';
type MatchLevel = 'exact_model' | 'partial_stage' | 'concept_illustration' | 'unsupported';
```

`ProblemCase` 包含：

- `provenance`：来源类型、年份/地区/题号（仅核验后）、来源 URL、检查日期、verification、rights、权利证据、审阅备注；
- `stem`：只有原创或书面授权内容才允许展示；
- `prediction`：实验前预测；答案与解释默认隐藏；
- `stages[]`：每段真实模型、匹配级别、预设 ID、限制、参数映射、可检查量、期望值与容差、概念检查；
- `reasoningSteps`（4–8 步）、`variations`（≥2）、`checkpoint`、`independentVerification`、`dimensionalCheck`、`commonMistakes`。

## 3. 安全与注入

- 阶段不保存任意函数名/类名/脚本；只保存 `modelId` + `presetId`，页面通过 `routeForModel(modelId)` 打开真实模型页面。
- 所有预设 ID 在 `tests/content/problemCases.test.ts` 中与真实 preset map 逐一核对；不存在则测试失败。
- URL 只允许 `/#/cases/<caseId>?stage=<stageId>`；无任意 JSON 或可执行内容。
- 场景进入前使用 `backupCaseScene(modelId)` 保存个人场景；返回题目时 `restoreCaseBackups()` 恢复。若原本没有场景，则删除案例场景，不留下伪存档。
- 案例进度 `emplab.cases.progress.v1` 独立于 `emplab.progress.v1`、模型场景和 lesson 进度；损坏 JSON 安全回退。

## 4. 原创案例最低标准

1. 题面、图示/描述、解析和数值均为本项目原创，标 `original_case` / `original` / `paper_and_solution_verified`。
2. 至少 3 个粒子模型案例和 3 个感应案例；至少 2 个多阶段。
3. 每案至少一个预测、一个真实实验入口、4–8 步推导、期望值与容差、独立验算、常见误区和最终检查。
4. 多阶段如不能严格传播状态，必须标 `分阶段独立建模` 并在新阶段重置。
5. 不复制真题题干、图片、答案；真题只作元数据外链。

## 5. 作者新增案例检查清单

- [ ] 唯一 `id`，`stem` 为原创；
- [ ] `provenance` 三项（sourceKind/verification/rights）正确；
- [ ] 每个 `stage.modelId` 是 16 个真实 ID 之一；
- [ ] `stage.presetId` 在真实 preset map 中存在；
- [ ] 参数映射覆盖题目所有符号和单位；
- [ ] 期望值由独立推导得到，不由引擎输出反填；
- [ ] 有量纲核对（如 `ε=Sv → T·m·m/s=V`），并显示在推导区；
- [ ] 至少一个预测与一个最终检查，答案在提交前隐藏；
- [ ] 案例页面可用键盘/触控操作，按钮 ≥44 CSS px；
- [ ] 进入/返回不覆盖个人场景；损坏案例数据安全失败。

## 6. Round 16 扩展：逐问与整题场景

每个 `ProblemCase` 现在包含：

- `parts: QuestionPart[]`（至少 3）：`prompt`、`targetQuantities`、≥2 `hints`、≥3 `derivationSteps`、`answerSpec`、`misconception`、`independentProofRef`。
- `wholeProblem: WholeProblemScenario`：`adapterId`、`coverage`、`originDescription`、`physicalStages`、`teacherAnnotations`、≥2 `variations`。
- `answerSpec.dependsOn` 必须引用 `wholeProblem.variations[].parameterKey`；参数变化时 `caseAnswerCheck` 读取当前求解器答案，无唯一值返回 `needs_review`。
- `coverage` 取 `full_problem_simulated | partial_stage | concept_illustration | unsupported`；没有同舞台/统一时钟/连续状态时不得标 FULL。
- 适配器白名单：`p04-boundary`、`p05-multizone`、`p07-beamline`、`i03-loop-entry`、`i05-loop-field`、`i06-dual-rod`、`i07-opposite-wall`、`a17-electric-magnetic-screen`；不得从 URL/JSON 接受代码或模块名。教师私有草稿使用独立的 `emplab.teacher-problem.v1` schema，编译后才进入整题运行时，详见 `ROUND17_PROBLEM_AUTHORING_SPEC.md`。
- 逐问进度写入 `emplab.cases.progress.v1` 的可选 `parts` 字段；`?part=a|b|c` 是白名单深链。
- 旧 `stages[]` 仍保留为基础模型对照/场景备份入口，不作为整题连续仿真的证明。
