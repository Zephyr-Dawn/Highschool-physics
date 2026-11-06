export interface SimulationInfo {
  id: string;
  route: string;
  title: string;
  shortTitle: string;
  moduleLabel: string;
  description: string;
  topics: string[];
  status: 'available' | 'planned';
  phase: 'MVP' | '二期' | '三期';
}

export const P01_SIM: SimulationInfo = {
  id: 'p01',
  route: '/particle/lorentz-force',
  title: '真实三维洛伦兹力与磁场运动',
  shortTitle: '三维洛伦兹力实验',
  moduleLabel: 'P01 · 粒子运动',
  description: '在真实 WebGL 场景中旋转、缩放并编辑 v、B 与 F=q(v×B)；同一解析引擎展示 1–5 个粒子的直线、圆周和螺旋，保留二维快速视图。',
  topics: ['真实 3D', 'v×B', '圆周与螺旋', '多粒子'],
  status: 'available',
  phase: 'MVP',
};

export const P02_SIM: SimulationInfo = {
  id: 'p02',
  route: '/particle/uniform-b',
  title: '匀强磁场内的多粒子圆周运动',
  shortTitle: '多粒子圆周运动',
  moduleLabel: 'P02 · 粒子运动',
  description: '在同一磁场与全局时间轴上比较 1–5 个独立粒子，拖动选中粒子的入射点和方向，其他粒子继续运动。',
  topics: ['洛伦兹力', '圆心与半径', '周期', '转向'],
  status: 'available',
  phase: 'MVP',
};

export const P03_SIM: SimulationInfo = {
  id: 'p03',
  route: '/particle/half-plane',
  title: '直线边界半平面有界磁场的多粒子运动',
  shortTitle: '多粒子有界磁场',
  moduleLabel: 'P03 · 粒子运动',
  description: '在同一半平面磁场中比较 1–5 个粒子的事件差异；单粒子编辑不暂停其他粒子，共享边界变化才全场重算。',
  topics: ['入场判定', '出射点', '圆心角', '临界相切'],
  status: 'available',
  phase: 'MVP',
};
export const P04_SIM: SimulationInfo = {
  id: 'p04',
  route: '/particle/finite-field',
  title: '条形 / 矩形有界磁场与临界条件',
  shortTitle: '有限磁场区域',
  moduleLabel: 'P04 · 粒子运动',
  description: '在条形或矩形磁场中精确求解入场、出射边、相切、角点接触与临界宽度；支持 1–5 粒子和播放中单粒子编辑。',
  topics: ['条形磁场', '矩形磁场', '出射边', '相切与角点'],
  status: 'available',
  phase: '二期',
};

export const P05_SIM: SimulationInfo = {
  id: 'p05',
  route: '/particle/alternating-fields',
  title: '相反磁场多区域与粒子时序',
  shortTitle: '相反磁场多区',
  moduleLabel: 'P05 · 粒子运动',
  description: '在 2–4 个竖直磁区中解析求解多次跨界、区内停留时间和不同 launchTime；区分轨迹交叉与同一时刻相遇。',
  topics: ['相反磁场', '多次跨界', '区内停留', '粒子时序'],
  status: 'available',
  phase: '二期',
};


export const I01_SIM: SimulationInfo = {
  id: 'i01',
  route: '/induction/flux-lenz',
  title: '磁通量与楞次定律',
  shortTitle: '磁通量与楞次定律',
  moduleLabel: 'I01 · 电磁感应',
  description: '连续改变 B、面积或线圈角度，观察有符号 Φ/Ψ、ε、I 与楞次方向。',
  topics: ['磁通量', '磁链', '楞次定律', '连续变化'],
  status: 'available',
  phase: 'MVP',
};

export const I02_SIM: SimulationInfo = {
  id: 'i02',
  route: '/induction/moving-rod',
  title: '单导体棒切割磁感线',
  shortTitle: '单棒导轨',
  moduleLabel: 'I02 · 电磁感应',
  description: '匀速、自由滑行、恒力驱动与手指推拉四种模式，实时追踪 ε、I、安培力、焦耳热与能量。',
  topics: ['动生电动势', '安培力', '电磁阻尼', '能量转化'],
  status: 'available',
  phase: 'MVP',
};

export const I03_SIM: SimulationInfo = {
  id: 'i03',
  route: '/induction/loop-entry',
  title: '矩形线框进入 / 离开磁场',
  shortTitle: '线框进出磁场',
  moduleLabel: 'I03 · 电磁感应',
  description: '拖动线框、改变 B、R 与速度，实时追踪 Φ、ε、I、安培力、阶段事件与焦耳热。',
  topics: ['磁通量', '动生电动势', '楞次定律', '安培力'],
  status: 'available',
  phase: 'MVP',
};

export const I04_SIM: SimulationInfo = {
  id: 'i04',
  route: '/induction/time-varying-field',
  title: '时变磁场中的静止线圈',
  shortTitle: '时变磁场感应',
  moduleLabel: 'I04 · 电磁感应',
  description: '固定线圈，用预设 B(t) 或连续手动调磁观察 Φ、ε、I 的符号、图像与楞次方向。',
  topics: ['感生电动势', '磁链', 'B–t 图像', '楞次定律'],
  status: 'available',
  phase: 'MVP',
};


export const P06_SIM: SimulationInfo = {
  id: 'p06',
  route: '/particle/combined-fields',
  title: '电磁复合场：同区叠加与电场→磁场',
  shortTitle: '电磁复合场',
  moduleLabel: 'P06 · 粒子运动',
  description: '同一舞台比较 1–5 个粒子：E+B 同区解析运动、速度选择条件，以及电场加速后进入磁场的分段事件。',
  topics: ['电场力', '磁场力', '速度选择', '分段事件'],
  status: 'available',
  phase: 'MVP',
};

export const P07_SIM: SimulationInfo = {
  id: 'p07',
  route: '/particle/beamline',
  title: '多级带电粒子束线综合实验',
  shortTitle: '多级束线综合',
  moduleLabel: 'P07 · 粒子运动',
  description: '加速、真实狭缝、E+B 选速、磁分析、末段电偏转与屏幕探测同场运行；1–5 个粒子按真实事件通过、吸收或命中。',
  topics: ['多级束线', '狭缝与吸收板', '速度选择', '屏幕探测'],
  status: 'available',
  phase: '三期',
};

export const I05_SIM: SimulationInfo = {
  id: 'i05',
  route: '/induction/coupled-loop',
  title: '时变磁场中的运动线框',
  shortTitle: '运动线框耦合感应',
  moduleLabel: 'I05 · 电磁感应',
  description: '线框同时在空间条带中运动、外加 B(t) 又在变化；分解感生与动生电动势，核对场源、机械功与焦耳热的完整能量账本。',
  topics: ['感生电动势', '动生电动势', '能量来源', '数值动力学'],
  status: 'available',
  phase: '三期',
};

export const I06_SIM: SimulationInfo = {
  id: 'i06',
  route: '/induction/dual-rods',
  title: '双导体棒在平行导轨上的电磁耦合',
  shortTitle: '双棒导轨',
  moduleLabel: 'I06 · 电磁感应',
  description: '两根可动导体棒共享同一回路电流：相对速度产生电动势，磁场力反对相对运动，质心动量与焦耳热共同约束双棒动力学。',
  topics: ['双棒耦合', '相对速度', '动量守恒', '接触停止'],
  status: 'available',
  phase: '三期',
};

export const I07_SIM: SimulationInfo = {
  id: 'i07',
  route: '/induction/opposite-fields-wall',
  title: '相反磁场双区域 · 运动线框 · 弹性挡板',
  shortTitle: '反向磁区与挡板',
  moduleLabel: 'I07 · 电磁感应',
  description: '带符号磁通量跨两个相反磁区叠加；线框自由/恒力/规定/手动运动，真实挡板反弹，焦耳热与冲击损失分别记账。',
  topics: ['相反磁区', '带符号磁通量', '弹性碰撞', '能量账本'],
  status: 'available',
  phase: '三期',
};

export const P08_SIM: SimulationInfo = {
  id: 'p08',
  route: '/particle/constraint-lab',
  title: '复合电磁场约束 · 临界条件 · 单参数反求',
  shortTitle: '约束与反求',
  moduleLabel: 'P08 · 粒子运动',
  description: '给定 E/B 与初态，编辑目标线段、时间窗与方向；区分穿越/相切/不可达，并对单参数做带正向复核的反向求解。',
  topics: ['目标约束', '相切临界', '单参数反求', '多解与可达性'],
  status: 'available',
  phase: '三期',
};

export const I08_SIM: SimulationInfo = {
  id: 'i08',
  route: '/induction/ac-generator',
  title: '交流发电机与交变电流',
  shortTitle: '发电机与交流电',
  moduleLabel: 'I08 · 电磁感应',
  description: '线圈在匀强磁场中匀速或手动转动：正弦电动势、峰值与有效值、负载/内阻功率、机械输入与开关事件。',
  topics: ['正弦交流', '峰值与有效值', '负载功率', '能量守恒'],
  status: 'available',
  phase: '三期',
};

export const PLANNED_SIMS: SimulationInfo[] = [];

export const SIMULATIONS = [P01_SIM, P02_SIM, P03_SIM, P04_SIM, P05_SIM, P06_SIM, P07_SIM, P08_SIM, I01_SIM, I02_SIM, I03_SIM, I04_SIM, I05_SIM, I06_SIM, I07_SIM, I08_SIM];

export function routeForModel(
  modelId: 'p01' | 'p02' | 'p03' | 'p04' | 'p05' | 'p06' | 'p07' | 'p08' | 'i01' | 'i02' | 'i03' | 'i04' | 'i05' | 'i06' | 'i07' | 'i08',
): string {
  if (modelId === 'p01') return P01_SIM.route;
  if (modelId === 'p02') return P02_SIM.route;
  if (modelId === 'p03') return P03_SIM.route;
  if (modelId === 'p04') return P04_SIM.route;
  if (modelId === 'p05') return P05_SIM.route;
  if (modelId === 'p06') return P06_SIM.route;
  if (modelId === 'p07') return P07_SIM.route;
  if (modelId === 'p08') return P08_SIM.route;
  if (modelId === 'i01') return I01_SIM.route;
  if (modelId === 'i02') return I02_SIM.route;
  if (modelId === 'i04') return I04_SIM.route;
  if (modelId === 'i05') return I05_SIM.route;
  if (modelId === 'i06') return I06_SIM.route;
  if (modelId === 'i07') return I07_SIM.route;
  if (modelId === 'i08') return I08_SIM.route;
  return I03_SIM.route;
}

export function simTitleForModel(
  modelId: 'p01' | 'p02' | 'p03' | 'p04' | 'p05' | 'p06' | 'p07' | 'p08' | 'i01' | 'i02' | 'i03' | 'i04' | 'i05' | 'i06' | 'i07' | 'i08',
): string {
  if (modelId === 'p01') return P01_SIM.shortTitle;
  if (modelId === 'p02') return P02_SIM.shortTitle;
  if (modelId === 'p03') return P03_SIM.shortTitle;
  if (modelId === 'p04') return P04_SIM.shortTitle;
  if (modelId === 'p05') return P05_SIM.shortTitle;
  if (modelId === 'p06') return P06_SIM.shortTitle;
  if (modelId === 'p07') return P07_SIM.shortTitle;
  if (modelId === 'p08') return P08_SIM.shortTitle;
  if (modelId === 'i01') return I01_SIM.shortTitle;
  if (modelId === 'i02') return I02_SIM.shortTitle;
  if (modelId === 'i04') return I04_SIM.shortTitle;
  if (modelId === 'i05') return I05_SIM.shortTitle;
  if (modelId === 'i06') return I06_SIM.shortTitle;
  if (modelId === 'i07') return I07_SIM.shortTitle;
  if (modelId === 'i08') return I08_SIM.shortTitle;
  return I03_SIM.shortTitle;
}
