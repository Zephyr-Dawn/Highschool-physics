# 数学表达式参数输入规范（Round 11.5，Round 12 扩展至 I05/I06）

## 1. 目标与非目标

**目标**：在不删除原滑动条、不改变物理解算器数值类型的前提下，让 13 个已实现模型的全部可调物理数值支持分数、根式、π、四则运算、括号、隐式乘法、幂和科学计数法输入。表达式输入范围不受滑动条 `min/max` 限制；合法值直接进入同一份场景状态与求解器。

**非目标**：
- Round 13 已把 I07（17 个）与 P08（19 个）按同一规范接入；Round 14 已接入 I08 的 8 个物理参数（N/A/B/θ₀/ω/R_L/r/时长）。
- 不做符号运算，不保证 `1/3` 的无限精度；
- 不解析单位，不在表达式中接受任意函数/变量；
- 不把表达式文本塞进物理参数对象，也不把物理参数类型改为 `string`；
- 不宣称真实 iPadOS/Android 软键盘体验已验收。

## 2. 文件与职责

| 文件 | 职责 |
|---|---|
| `src/math/parameterExpression.ts` | 归一化、tokenizer、递归下降 AST、求值、错误分类、资源限制；纯函数、无 React/DOM |
| `src/math/parameterValidation.ts` | 单位/标签→物理域、物理约束、整数约束、稳定性上下限、错误消息 |
| `src/math/parameterExpressionMemory.ts` | 仅会话内的原式记忆（跨 tab/组件重挂载），不写 localStorage |
| `src/components/ParamSlider.tsx` | `ParamSlider`（滑块+表达式）与 `MathTargetInput`（连续目标，无滑块） |
| `tests/math/parameterExpression.test.ts` | 解析值、优先级、错误、恶意输入、长度/嵌套/性能 |
| `tests/math/parameterValidation.test.ts` | 物理域、整数、稳定域、单位解析 |
| `tests/integration/mathParameterControl.test.tsx` | 草稿/提交/Escape/焦点/快捷符号/超范围/状态 |
| `tests/integration/mathParameterPages.test.tsx` | 真实页面中的表达式→数据面板链路 |
| `tests/physics/mathParameterPhysics.test.ts` | 表达式数值进入 P02/P06/P07/I01–I04 求解器 |
| `tests/tablet/math-parameters.spec.ts` | 11 模型浏览器覆盖、超范围、错误、快捷符号、横竖屏、多粒子、手动 ramp；I05/I06 另见 `i05.spec.ts` / `i06.spec.ts` |
| `tests/pwa/pwa.spec.ts` | 离线输入后刷新仍保留已提交数值 |

## 3. 语法

### 3.1 文法

```text
add     := mul (('+' | '-') mul)*
mul     := unary (('*' | '/' | implicit) unary)*
unary   := ('+' | '-') unary | sqrt unary | power
power   := primary ('^' unary)?          // 右结合
primary := number | 'π' | '(' add ')'
implicit:= 值后直接出现 '(', 'π', '√', 'sqrt' 或 'pi'
```

- 一元 `√` 绑定紧邻的幂：`√3/2 = (√3)/2`，`√(3/2) = sqrt(3/2)`。
- `2^3^2 = 2^(3^2) = 512`；`-2^2 = -(2^2) = -4`；`2^-3 = 0.125`。
- 支持 `√` 与 `sqrt()`；仅此一个函数。`pi` 不区分大小写。
- 隐式乘法仅接受 `(`, `π`, `√`, `sqrt`, `pi` 作为因子；`2 3` 报语法错误，不猜测。
- 表达式内的 `e` 只能是数字字面量的一部分（`2.5e-4`），不是自然常数。

### 3.2 归一化

只转换明确的数学符号，不把未知文本变数值：

| 输入 | 归一化 |
|---|---|
| `×` `✕` `✖` `·` `⋅` `＊` | `*` |
| `÷` `／` | `/` |
| `−` `–` `—` `－` | `-` |
| `＋` | `+` |
| `（ ） 【 】 ［ ］` | `( ) ( ) ( )` |
| `．` | `.` |
| 全角数字 `０…９` | `0…9` |
| `＾` | `^` |

### 3.3 支持示例

| 输入 | 值 | 说明 |
|---|---|---|
| `1/2`、`-3/4`、`(1+2)/3` | 0.5、−0.75、1 | 分数/四则 |
| `√2`、`sqrt(2)`、`√(3/2)` | 1.414…、1.414…、1.224… | 根式 |
| `√3/2`、`(√3)/2` | 0.866… | 根式与除法优先级 |
| `(1+√5)/2` | 1.618… | 括号混合 |
| `π`、`pi`、`2π`、`2*pi`、`π/2` | 3.141…、6.283…、1.570… | π 与隐式乘法 |
| `2.5e-4`、`1E-9`、`-0.125` | 0.00025、1e−9、−0.125 | 科学计数法 |
| `2*(1+√3)`、`2(1+√3)` | 5.464… | 显式/隐式乘法 |
| `2^(-3)`、`2^3^2` | 0.125、512 | 幂与右结合 |

## 4. 错误分类

| reason | 触发示例 | UI 语义 |
|---|---|---|
| `incomplete` | 空串、`-`、`√(`、`1/`、`2e-`、`(1+2` | 编辑中，不清空、不提交、不改实验 |
| `syntax` | `2*/3`、`2 3`、`1+2)`、`()`、`2,3` | 格式错误 |
| `division-by-zero` | `1/0` | 明确拒绝 |
| `sqrt-negative` | `√(-1)`、`sqrt(-4)` | 明确拒绝 |
| `non-finite` | `1e9999`、`0^-1`、`(-2)^0.5` | 计算结果不是有限实数 |
| `forbidden` | `window.alert(1)`、`constructor`、`__proto__`、`Infinity`、`NaN` | 非白名单名称；不执行代码 |
| `too-complex` | >128 字符、>32 层、>256 节点 | 防 UI 冻结 |

**资源限制**：`MAX_EXPRESSION_LENGTH = 128`、`MAX_EXPRESSION_DEPTH = 32`、`MAX_EXPRESSION_NODES = 256`。解析器不调用 `eval` / `new Function`，不访问全局对象、网络或 DOM；`tests/math/parameterExpression.test.ts` 会静态检查实现中不存在这两种调用。

## 5. 有效域与单位

### 5.1 三层校验

1. **数学**：解析成功且 `Number.isFinite(value)`。
2. **物理域**：质量 > 0、长度 > 0、`N` 为正整数、屏幕窗口上限 > 下限、边界严格递增等；错误为 `out-of-domain` / `not-integer`。
3. **数值稳定域**：极小质量/电阻、`|B|>100 T`、`|E|>1e6 V/m`、`|v|>1e7 m/s` 等；错误为 `unstable`。这些是教学模型的可稳定计算边界，不是自然定律。

任何一层失败都**不调用 onChange**，当前实验保持最后一个已提交有效值；UI 同时显示错误与“当前实验仍为 …”，不隐藏不匹配。

### 5.2 单位

- 表达式始终在**显示单位空间**求值；`cm→m`、`×10⁻²⁶ kg`、`×10⁶ m/s`、`e/C`、`°→rad` 只在现有页面 handler 中换算。
- 角度控件单位是 `°`；`π/2` 表示约 1.57°，不是 90°。需要 90° 时输入 `90`。I01 的 `θ₀` 在说明中明确这一点。
- 单位不进入表达式；输入框旁保留单位标签。
- 换算不四舍五入：如 P03 边界 `√2 cm` → `0.0141421356… m`，不再 `toFixed(4)`。

### 5.3 域解析策略

`resolveParameterDomain(label, unit)` 给未显式传 `domain` 的控件兜底：

| 单位/标签 | 默认域 |
|---|---|
| `turn` / `匝` / `匝数` | 整数 1…1000 |
| `T` | 磁场；标签含 `\|B\|` 时为 0…100，否则 ±100 |
| `V/m` | ±1e6 |
| `T/s` | ±1e6 |
| `Hz` | 0…1e6（I04 显式 0.01…20） |
| `Ω` | >0，稳定 1e-9…1e9 |
| `rad/s` | ±1e7 |
| `°` | ±1e7 |
| `s` | >0（I04 显式波形时长/边沿/平台） |
| `kg` | >0，稳定 1e-12…1e6 |
| `m/s` | 标签含“大小”为 0…1e7，否则 ±1e7 |
| `×10⁶ m/s` | 0…1e7 |
| `×10⁻²⁶ kg` | >0，稳定 1e-12…1e6 |
| `m` | 几何名（宽度/长度/高度/间距/边长/半宽）>0；坐标/屏幕 y 带符号 |
| `cm` | 位置 ±1e8；几何名 >0 |
| `e` / `C` | 标签含 `\|q\|` 为 0…1e6，否则 ±1e6 |
| `N` | ±1e9 |

页面可传 `domain={...}` 覆盖为模型专属域。所有覆盖清单见 [PARAMETER_INPUT_AUDIT.md](PARAMETER_INPUT_AUDIT.md)。

## 6. 提交、预览与焦点

### 6.1 状态模型

- 唯一物理真值：`value`（已提交的显示单位 `number`）。
- 表达式文本：组件内部 `draft`；独立于物理状态。
- `committedExpression`：当前值对应的原式（若用户输入的是表达式且数值不同）。
- `localError`：父级 handler 返回的拒绝消息（例如暂停中的手动目标）。
- 解析/域校验在每次输入时即时进行，但**不调用 onChange**。

### 6.2 行为

| 操作 | 行为 |
|---|---|
| 输入 | 保持焦点/光标/未完成文本；显示预览 `≈ …`；不重置时间轴 |
| Enter / 软键盘 Done | 合法则提交；非法保持输入并显示错误 |
| 失焦 | 合法则提交；非法保留文本与错误，不改变实验值 |
| Escape | 回退到上一个已提交原式/数值 |
| 滑块 | 更新同一数值，清除原式，文本框改为数值文本 |
| 合法超滑块范围 | 不 clamp；值照常提交；滑块显式虚线/减弱拇指，并显示“超出滑块快捷范围…实验仍使用该数值，未做钳制” |
| 值相等 | 不重复 onChange（避免无意义重启） |
| 提交后 | 表达式原样保留（如 `√3/2`），状态行显示 `已提交 √3/2 ≈ 0.8660254 T` |
| 外部值变化 | 清除原式并显示新的数值文本 |
| tab 切换/组件重挂载 | 会话内按“路由 hash + label + unit”恢复原式；若恢复值不等于当前物理值则自动丢弃 |
| 刷新 | 原式不持久化；显示已提交数值；旧场景/参数 key 不受影响 |

### 6.3 平板与无障碍

- 输入框 `inputMode="text"`、`enterKeyHint="done"`、`autoComplete/autoCorrect/spellCheck` 关闭；保留系统键盘。
- 聚焦时显示快捷符号：`√( )`、`π`、`/`、`( )`、`^`、`×10^`；按钮最小 44×44 CSS px，`pointerdown.preventDefault()` 保持焦点，按光标位置插入。
- 输入框与快捷按钮使用 `aria-label`/`role="status"`/`aria-invalid`；错误与预览通过 `aria-describedby` 关联。
- 输入宽度 150 px（目标控件 170 px），窄屏自动换行；快捷行 `flex-wrap`，不产生横向溢出（1194×834 与 768×1024 均有 Playwright 断言）。

## 7. 与物理时间轴/多粒子的一致性

- **单粒子**：P01–P07 中提交 q/m/v/r0 只更新当前粒子并 `updateParticleAndRelaunch`；全局 tGlobal、其他粒子 launchTime、场、轨迹/事件表不变。
- **共享场/器件**：B/E/边界/狭缝/屏幕/区段长度提交后沿用 `applySharedField` + 重演；I01/I04 的 setupKey/参数变化重建时钟。
- **I01 手动 B / A / θ**：
  - 文本框的“起点 Bz/初始宽度/初始角度”是初态/结构参数，不是手势历史；
  - “实时目标 Bz”提交到 `applyManualTarget`，按 0.4 s、最大 4 T/s 的已有 ramp 逼近；ε 用实际斜率；
  - 暂停时拒绝并提示，不记录假变化。
- **I04 手动 B**：
  - “手动实验起始 B”只在复位/切换模式时使用；
  - “实时目标 B”同样走 `applyManualTarget`；
  - 舞台竖直手柄继续按真实 pointer 时间戳工作；文本不伪造 ramp 历史。
- **I02 手指推拉**：文本框只改初速度/几何/力；手动模式的“速度由拖动样本估计”不读取文本框；导体棒拖动仍是真实 pointer 采样。
- **I03 拖线框/磁场**：手势与文本滑块的几何量最终都进入同一 `simulateLoop`；没有为本轮新建伪动画。

## 8. 持久化与兼容

- 物理参数继续以 `number` 存入既有 localStorage key（场景 v2、I01–I04 params v1）与 JSON 导入导出；不新增必填字段。
- 数学表达式文本**不写入**场景/参数 JSON；旧存档、旧导入文件、旧 P01 受力 v1 迁移全部保持可读。
- 会话内原式记忆 `src/math/parameterExpressionMemory.ts` 仅是 `Map`，页面刷新即清空；恢复前重新解析、校验域并核对与当前值一致。
- 若未来需要持久化原式，应新增版本化 `expressions` metadata，导入时重新解析并核对 SI 值；当前未实现，避免把任意文本当可信数据。
- 类型检查保证求解器仍只接收 `number`；`ParamSlider` 的 `onChange` 签名未变，页面无需改写物理逻辑。

## 9. 测试证据

| 层 | 文件 | 覆盖 |
|---|---|---|
| 解析 | `tests/math/parameterExpression.test.ts` | 分数/根式/π/科学计数法/幂/优先级；错误分类；恶意 JS；长度/深度；500 次解析性能；无 eval/new Function |
| 域 | `tests/math/parameterValidation.test.ts` | 超滑块合法值；质量/长度/电阻 >0；N 整数；稳定域；单位解析 |
| 组件 | `tests/integration/mathParameterControl.test.tsx` | slider/text 同源；原式保留；预览；错误；Escape；Enter；焦点；快捷符号；超范围不 clamp；跨重挂载原式 |
| 页面 | `tests/integration/mathParameterPages.test.tsx` | P02 √3/2、B=5 超范围；I04 √2；I01 N=3/2 拒绝/N=8；P07 屏幕窗口反序拒绝 |
| 物理 | `tests/physics/mathParameterPhysics.test.ts` | P02/P03 半径；P06/P07 单粒子重发射；P07 分数狭缝；I01 N/B/ramp；I02 R=1/3/F=√2；I03 超滑块 B；I04 斜率 |
| 浏览器 | `tests/tablet/math-parameters.spec.ts` + `i05.spec.ts` / `i06.spec.ts` | 13 模型各至少 1 个公式输入；超范围；错误；快捷 π；横竖屏；P07 多粒子；I01/I04/I05 ramp；I06 R=1/3 |
| PWA | `tests/pwa/pwa.spec.ts` | 离线刷新后已提交数值与数据面板仍正确 |

## 10. 已知限制

- 解析为实数双精度近似；不提供符号精确分数/根式，不声称高精度实验数据。
- 表达式不解析单位；不会自动把 `π/2` 当 90°。
- 极端参数按教学尺度拒绝；相对论、极高能、材料非线性不在模型范围。
- 真机软键盘/输入法、长按选择、系统字体放大、安全区、VoiceOver/TalkBack **NOT_TESTED**。
- I01 手动 B 与 I04 手动 B 的 ±10 T 上限来自既有 manual timeline 的稳定夹取；UI 提前拒绝，不隐藏夹取。
- 会话内原式记忆不跨刷新；这是有意选择，不是物理值丢失。
