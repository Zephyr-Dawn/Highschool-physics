import type { WholeProblemVariation } from '../../content/problemCaseSchema';
import { buildWholeProblemModel } from '../cases/wholeProblem/buildWholeProblem';
import type { WholeProblemModel } from '../cases/wholeProblem/types';
import { observableOptionsForModel, bindTeacherPart } from './solutionBinding';
import {
  adapterRegistryEntry,
  adapterSupportLabel,
  type AuthoringAdapterRegistryEntry,
} from './problemAdapterRegistry';
import {
  TEACHER_PROBLEM_SCHEMA,
  type DraftReviewStatus,
  type TeacherCompiledItem,
  type TeacherProblemDraft,
} from './teacherProblemSchema';

export interface DraftCheck {
  id: string;
  label: string;
  status: 'pass' | 'warn' | 'fail';
  detail: string;
}

export interface TeacherCompileResult {
  status: DraftReviewStatus;
  adapter: AuthoringAdapterRegistryEntry | null;
  support: string;
  item: TeacherCompiledItem | null;
  model: WholeProblemModel | null;
  checks: DraftCheck[];
  errors: string[];
  warnings: string[];
  observableOptions: Array<{ key: string; label: string; unit: string }>;
  evidence: string[];
}

const UNSAFE_FORMULA = /\\href|\\url|\\html|\\includegraphics|\\class\{|\\style\{|<script|<iframe|<img|javascript:|onerror\s*=/i;

function badFormula(text: string): boolean {
  return UNSAFE_FORMULA.test(text);
}

function checkVariation(variation: WholeProblemVariation): string | null {
  if (!(variation.max > variation.min)) return `参数 ${variation.parameterKey} 的范围必须递增。`;
  if (!(variation.step > 0)) return `参数 ${variation.parameterKey} 的步长必须为正。`;
  if (variation.baseValue < variation.min || variation.baseValue > variation.max) {
    return `参数 ${variation.parameterKey} 的标准值不在滑块范围内。`;
  }
  return null;
}

function toWholeProblemVariations(draft: TeacherProblemDraft): WholeProblemVariation[] {
  return draft.scenario.variations.map((variation) => ({
    id: variation.id,
    label: variation.label || variation.parameterKey,
    parameterKey: variation.parameterKey,
    unit: variation.unit,
    min: variation.min,
    max: variation.max,
    step: variation.step,
    baseValue: variation.baseValue,
    expectedBehavior: variation.expectedBehavior,
  }));
}

function formulaSafetyErrors(draft: TeacherProblemDraft): string[] {
  const errors: string[] = [];
  for (const part of draft.parts) {
    for (const step of part.derivationSteps) {
      if (badFormula(step.formula) || badFormula(step.explanation)) {
        errors.push(`小问 ${part.id} 的推导包含不允许的 HTML/外部资源/链接命令；公式只能使用可信数学记号。`);
      }
    }
  }
  return errors;
}

export function compileTeacherProblem(draft: TeacherProblemDraft): TeacherCompileResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const checks: DraftCheck[] = [];
  const evidence: string[] = [];
  const entry = adapterRegistryEntry(draft.scenario.adapterId);
  if (!entry) {
    return {
      status: 'unsupported',
      adapter: null,
      support: 'unsupported',
      item: null,
      model: null,
      checks: [{ id: 'adapter', label: '物理适配器', status: 'fail', detail: '当前草稿引用未知适配器；不会执行任何代码。' }],
      errors: ['未知的物理阶段适配器。'],
      warnings,
      observableOptions: [],
      evidence,
    };
  }
  checks.push({
    id: 'adapter',
    label: '白名单物理适配器',
    status: entry.support === 'unsupported' ? 'fail' : 'pass',
    detail: `${entry.label} · ${adapterSupportLabel(entry.support)}`,
  });
  if (entry.support === 'unsupported' || entry.coverage === 'unsupported') {
    errors.push('当前适配器声明为 unsupported，不能生成整题仿真。');
  }

  if (!draft.title.trim()) errors.push('题目标题不能为空。');
  if (draft.stem.trim().length < 20) errors.push('题干至少需要 20 个字符，才能作为完整题目预览。');
  if (draft.scenario.originDescription.trim().length < 10) errors.push('舞台坐标/时间说明至少需要 10 个字符。');
  if (draft.scenario.physicalStages.length === 0) errors.push('至少需要一个物理阶段，用于事件定位。');
  for (const stage of draft.scenario.physicalStages) {
    if (!stage.title.trim()) errors.push(`物理阶段 ${stage.id} 缺少标题。`);
  }

  const variations = toWholeProblemVariations(draft);
  if (variations.length === 0) errors.push('至少需要一个白名单参数变式，以便重算下游答案。');
  for (const variation of variations) {
    const issue = checkVariation(variation);
    if (issue) errors.push(issue);
  }
  const variationKeys = variations.map((variation) => variation.parameterKey);
  checks.push({
    id: 'parameters',
    label: '参数与变式范围',
    status: errors.some((error) => error.includes('参数')) ? 'fail' : 'pass',
    detail: variations.length > 0
      ? `${variations.length} 个参数绑定；修改后整题重新求解。`
      : '尚未绑定参数变式。',
  });

  const securityErrors = formulaSafetyErrors(draft);
  const securityFailed = securityErrors.length > 0;
  errors.push(...securityErrors);
  checks.push({
    id: 'content-security',
    label: '内容安全',
    status: securityErrors.length > 0 ? 'fail' : 'pass',
    detail: securityErrors.length > 0
      ? '发现不允许的公式/HTML 内容，已阻止预览。'
      : '纯文本与可信数学记号；未发现脚本、外部资源或危险链接。',
  });

  const provenance = draft.provenance;
  checks.push({
    id: 'provenance',
    label: '来源与权利独立记录',
    status: 'pass',
    detail: `来源：${provenance.kind} · 核验：${provenance.sourceReview} · 权利：${provenance.rights}。物理仿真通过不会提升来源或转载状态。`,
  });
  if (provenance.kind === 'exam_reference' && provenance.rights !== 'permission_granted') {
    warnings.push('本题标为真题引用且未记录公开转载许可：只允许本机私有预览，不得对外发布题面、图片或解析。');
  }
  if (provenance.kind === 'teacher_private' && provenance.sourceReview === 'paper_and_solution_verified') {
    warnings.push('“题目与解析已核验”是教师自述，不是系统认证；请保留可复核证据。');
  }
  checks.push({
    id: 'local-only',
    label: '本机私有',
    status: 'pass',
    detail: '草稿只保存在当前浏览器的版本化命名空间，不进入构建、PWA 预缓存或自动上传。',
  });

  const baseline = Object.fromEntries(variations.map((variation) => [variation.parameterKey, variation.baseValue]));
  const physicsCaseId = draft.sourceCaseId ?? draft.id;
  let model: WholeProblemModel | null = null;
  if (entry.support !== 'unsupported' && entry.coverage !== 'unsupported') {
    try {
      model = buildWholeProblemModel({
        caseId: physicsCaseId,
        adapterId: entry.id,
        overrides: {},
        baseline,
      });
    } catch {
      errors.push('当前题目参数未能通过物理适配器构建；请检查几何、场和单位范围。');
    }
  }
  if (model) {
    checks.push({
      id: 'model-build',
      label: '整题物理构建',
      status: model.issue ? 'warn' : 'pass',
      detail: model.issue
        ? `求解器报告（作为限制提示，不伪造额外物理）：${model.issue}`
        : `${model.events.length} 个真实事件、${model.traces.length} 条轨迹、${model.charts.length} 张图。`,
    });
    evidence.push(`物理模型构建成功：事件 ${model.events.length}，持续时间 ${model.durationS.toFixed(6)} s。`);
    if (model.issue) warnings.push(`当前适配器记录的物理限制：${model.issue}`);
  } else if (entry.support !== 'unsupported') {
    checks.push({ id: 'model-build', label: '整题物理构建', status: 'fail', detail: '物理构建失败。' });
  }

  if (model) {
    const missingEvents: string[] = [];
    for (const stage of draft.scenario.physicalStages) {
      if (stage.startEventId && !model.events.some((event) => event.id === stage.startEventId)) {
        missingEvents.push(`${stage.id}→${stage.startEventId}`);
      }
      if (stage.endEventId && !model.events.some((event) => event.id === stage.endEventId)) {
        missingEvents.push(`${stage.id}→${stage.endEventId}`);
      }
    }
    for (const part of draft.parts) {
      for (const step of part.derivationSteps) {
        if (step.referenceEventId && !model.events.some((event) => event.id === step.referenceEventId)) {
          missingEvents.push(`${part.id}/${step.id}→${step.referenceEventId}`);
        }
      }
    }
    if (missingEvents.length > 0) {
      errors.push(`阶段或推导引用了不存在的物理事件：${missingEvents.join('、')}。`);
    }
    checks.push({
      id: 'event-references',
      label: '阶段与事件引用',
      status: missingEvents.length > 0 ? 'fail' : 'pass',
      detail: missingEvents.length > 0 ? `缺失事件：${missingEvents.join('、')}` : '所有阶段与推导事件均可在当前求解器中定位。',
    });

    const handoffs = model.events.filter((event) => event.kind === 'handoff');
    const expectedHandoffs = entry.id === 'a17-electric-magnetic-screen' ? 2 : null;
    const continuityPass = expectedHandoffs === null || handoffs.length === expectedHandoffs;
    if (!continuityPass) errors.push(`连续阶段应有 ${expectedHandoffs} 个状态交接，但当前只有 ${handoffs.length} 个。`);
    checks.push({
      id: 'stage-continuity',
      label: '阶段交接',
      status: continuityPass ? 'pass' : 'fail',
      detail: expectedHandoffs === null
        ? '同一适配器内部事件连续；未擅自拼接不同物理求解器。'
        : `${handoffs.length} 个交接点，位置/速度/时间误差由运行时检查。`,
    });
    if (handoffs.length > 0) {
      evidence.push(`阶段交接：${handoffs.map((handoff) => handoff.label).join(' | ')}`);
    }
  }

  const boundParts = [];
  if (model) {
    for (const part of draft.parts) {
      const binding = bindTeacherPart(part, model, variationKeys);
      errors.push(...binding.errors);
      if (binding.ok && binding.part) boundParts.push(binding.part);
    }
    checks.push({
      id: 'answer-binding',
      label: '逐问答案绑定',
      status: draft.parts.length > 0 && errors.every((error) => !error.includes('小问')) ? 'pass' : 'fail',
      detail: draft.parts.length === 0
        ? '尚未添加小问。'
        : `${boundParts.length}/${draft.parts.length} 个小问已绑定当前求解器观测量与单位。`,
    });
    if (boundParts.length > 0) evidence.push(`答案绑定：${boundParts.length} 个小问按当前求解器重算基线值。`);
  }
  if (draft.parts.length < 3) {
    warnings.push('整题至少需要 3 个小问才能标记为内容完整；当前可以保存草稿，但不会标记为 simulation_verified。');
  }

  const status: DraftReviewStatus = (() => {
    if (entry.support === 'unsupported' || entry.coverage === 'unsupported') return 'unsupported';
    if (!model) return 'physics_unverified';
    if (errors.length > 0) return 'content_incomplete';
    if (boundParts.length < 3 || draft.stem.trim().length < 20) return 'content_incomplete';
    return 'simulation_verified';
  })();

  let item: TeacherCompiledItem | null = null;
  if (!securityFailed && model && boundParts.length === draft.parts.length && boundParts.length > 0) {
    item = {
      id: draft.id,
      title: draft.title || '未命名教师题目',
      subtitle: draft.subtitle || '本机教师草稿',
      stem: draft.stem,
      parts: boundParts,
      wholeProblem: {
        adapterId: entry.id,
        coverage: entry.coverage,
        originDescription: draft.scenario.originDescription || entry.originDescription,
        physicalStages: draft.scenario.physicalStages.length > 0
          ? draft.scenario.physicalStages.map((stage) => ({ ...stage, title: stage.title || stage.id }))
          : entry.defaultPhysicalStages.map((stage) => ({ ...stage, limitations: [...stage.limitations] })),
        teacherAnnotations: draft.scenario.teacherAnnotations.length > 0
          ? [...draft.scenario.teacherAnnotations]
          : [...entry.teacherAnnotations],
        variations,
      },
      provenance: provenance,
      ...(draft.sourceCaseId ? { sourceCaseId: draft.sourceCaseId } : {}),
      adapterId: entry.id,
      support: entry.support,
    };
  }

  return {
    status,
    adapter: entry,
    support: adapterSupportLabel(entry.support),
    item,
    model,
    checks,
    errors: [...new Set(errors)],
    warnings: [...new Set(warnings)],
    observableOptions: model ? observableOptionsForModel(model) : entry.observables.map(({ key, label, unit }) => ({ key, label, unit })),
    evidence,
  };
}

export function draftSchemaIsCurrent(value: unknown): boolean {
  return typeof value === 'object'
    && value !== null
    && (value as { schema?: unknown }).schema === TEACHER_PROBLEM_SCHEMA;
}
