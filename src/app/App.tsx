import { lazy, Suspense, useEffect } from 'react';
import { HashRouter, Link, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { HomePage } from '../pages/HomePage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { Icon } from '../components/Icon';
import { CaseReturnBanner } from '../components/CaseReturnBanner';

const UniformBPage = lazy(() =>
  import('../simulations/particle/UniformBPage').then((module) => ({ default: module.UniformBPage })),
);
const LorentzForcePage = lazy(() =>
  import('../simulations/particle/LorentzForcePage').then((module) => ({ default: module.LorentzForcePage })),
);
const HalfPlanePage = lazy(() =>
  import('../simulations/particle/HalfPlanePage').then((module) => ({ default: module.HalfPlanePage })),
);
const FiniteFieldPage = lazy(() =>
  import('../simulations/particle/FiniteFieldPage').then((module) => ({ default: module.FiniteFieldPage })),
);
const AlternatingFieldsPage = lazy(() =>
  import('../simulations/particle/AlternatingFieldsPage').then((module) => ({ default: module.AlternatingFieldsPage })),
);
const P06Page = lazy(() =>
  import('../simulations/particle/P06Page').then((module) => ({ default: module.P06Page })),
);
const BeamlinePage = lazy(() =>
  import('../simulations/particle/BeamlinePage').then((module) => ({ default: module.BeamlinePage })),
);
const ConstraintLabPage = lazy(() =>
  import('../simulations/particle/ConstraintLabPage').then((module) => ({ default: module.ConstraintLabPage })),
);
const LoopEntryPage = lazy(() =>
  import('../simulations/induction/LoopEntryPage').then((module) => ({ default: module.LoopEntryPage })),
);
const TimeVaryingPage = lazy(() =>
  import('../simulations/induction/TimeVaryingPage').then((module) => ({ default: module.TimeVaryingPage })),
);
const MovingRodPage = lazy(() =>
  import('../simulations/induction/MovingRodPage').then((module) => ({ default: module.MovingRodPage })),
);
const FluxLenzPage = lazy(() =>
  import('../simulations/induction/FluxLenzPage').then((module) => ({ default: module.FluxLenzPage })),
);
const CoupledLoopPage = lazy(() =>
  import('../simulations/induction/CoupledLoopPage').then((module) => ({ default: module.CoupledLoopPage })),
);
const DualRodsPage = lazy(() =>
  import('../simulations/induction/DualRodsPage').then((module) => ({ default: module.DualRodsPage })),
);
const OppositeFieldsLoopPage = lazy(() =>
  import('../simulations/induction/OppositeFieldsLoopPage').then((module) => ({ default: module.OppositeFieldsLoopPage })),
);
const AcGeneratorPage = lazy(() =>
  import('../simulations/induction/AcGeneratorPage').then((module) => ({ default: module.AcGeneratorPage })),
);
const CaseListPage = lazy(() =>
  import('../pages/CaseListPage').then((module) => ({ default: module.CaseListPage })),
);
const CaseDetailPage = lazy(() =>
  import('../pages/CaseDetailPage').then((module) => ({ default: module.CaseDetailPage })),
);
const DeviceCheckPage = lazy(() =>
  import('../pages/DeviceCheckPage').then((module) => ({ default: module.DeviceCheckPage })),
);
const TeacherProblemListPage = lazy(() =>
  import('../pages/TeacherProblemListPage').then((module) => ({ default: module.TeacherProblemListPage })),
);
const TeacherProblemEditorPage = lazy(() =>
  import('../pages/TeacherProblemEditorPage').then((module) => ({ default: module.TeacherProblemEditorPage })),
);
const TeacherProblemPreviewPage = lazy(() =>
  import('../pages/TeacherProblemPreviewPage').then((module) => ({ default: module.TeacherProblemPreviewPage })),
);
const LearningPathPage = lazy(() =>
  import('../pages/LearningPathPage').then((module) => ({ default: module.LearningPathPage })),
);
const LearningPathDetailPage = lazy(() =>
  import('../pages/LearningPathDetailPage').then((module) => ({ default: module.LearningPathDetailPage })),
);
const PracticePage = lazy(() =>
  import('../pages/PracticePage').then((module) => ({ default: module.PracticePage })),
);
const ProgressPage = lazy(() =>
  import('../pages/ProgressPage').then((module) => ({ default: module.ProgressPage })),
);

const NAV_ITEMS = [
  { to: '/', label: '首页', end: true },
  { to: '/particle/uniform-b', label: '粒子运动' },
  { to: '/induction/loop-entry', label: '电磁感应' },
  { to: '/cases', label: '题目实验' },
  { to: '/teacher/problems', label: '教师题目' },
  { to: '/path', label: '学习路线' },
  { to: '/practice', label: '练习与真题' },
  { to: '/progress', label: '我的记录' },
];

function TopBar() {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Link className="brand" to="/" aria-label="EM Physics Lab 首页">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 40 40" width="34" height="34">
              <rect width="40" height="40" rx="11" fill="#182442" />
              <circle cx="20" cy="21" r="10.5" fill="none" stroke="#94c5ff" strokeWidth="2" />
              <circle cx="20" cy="21" r="1.5" fill="#d6e7ff" />
              <circle cx="24.4" cy="11.6" r="3.2" fill="#fbbf24" />
              <path d="M27 8.6l3.4-2" stroke="#fbbf24" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </span>
          <span className="brand-text">
            <span className="brand-title">EM Physics Lab</span>
            <span className="brand-sub">高中电磁学交互实验室</span>
          </span>
        </Link>
        <nav className="main-nav" aria-label="主导航">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `nav-link ${isActive ? 'is-active' : ''}`}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <span className="topbar-badge">Phase 1</span>
      </div>
    </header>
  );
}

const PAGE_TITLES: Record<string, string> = {
  '/': 'EM Physics Lab｜高中电磁学交互实验室',
  '/particle/lorentz-force': 'P01 真实三维洛伦兹力与磁场运动｜EM Physics Lab',
  '/particle/uniform-b': 'P02 匀强磁场内的多粒子圆周运动｜EM Physics Lab',
  '/particle/half-plane': 'P03 直线边界半平面有界磁场的多粒子运动｜EM Physics Lab',
  '/particle/finite-field': 'P04 条形 / 矩形有界磁场与临界条件｜EM Physics Lab',
  '/particle/alternating-fields': 'P05 相反磁场多区域与粒子时序｜EM Physics Lab',
  '/particle/combined-fields': 'P06 电磁复合场｜EM Physics Lab',
  '/particle/beamline': 'P07 多级带电粒子束线综合实验｜EM Physics Lab',
  '/particle/constraint-lab': 'P08 复合电磁场约束与单参数反求｜EM Physics Lab',
  '/induction/loop-entry': 'I03 矩形线框进入 / 离开磁场｜EM Physics Lab',
  '/induction/time-varying-field': 'I04 时变磁场中的静止线圈｜EM Physics Lab',
  '/induction/coupled-loop': 'I05 时变磁场中的运动线框｜EM Physics Lab',
  '/induction/dual-rods': 'I06 双导体棒在平行导轨上的电磁耦合｜EM Physics Lab',
  '/induction/opposite-fields-wall': 'I07 相反磁场双区域 · 运动线框 · 弹性挡板｜EM Physics Lab',
  '/induction/ac-generator': 'I08 交流发电机与交变电流｜EM Physics Lab',
  '/induction/moving-rod': 'I02 单导体棒切割磁感线｜EM Physics Lab',
  '/induction/flux-lenz': 'I01 磁通量与楞次定律｜EM Physics Lab',
  '/cases': '题目实验｜EM Physics Lab',
  '/cases/:caseId': '题目实验｜EM Physics Lab',
  '/teacher/problems': '教师题目工作台｜EM Physics Lab',
  '/teacher/problems/:draftId/edit': '编辑教师题目｜EM Physics Lab',
  '/teacher/problems/:draftId/preview': '教师题目预览｜EM Physics Lab',
  '/device-check': '课堂设备检测｜EM Physics Lab',
  '/path': '16 模型学习路线｜EM Physics Lab',
  '/practice': '练习与真题索引｜EM Physics Lab',
  '/progress': '我的记录｜EM Physics Lab',
};

function PageLoading() {
  return (
    <div className="page-loading" role="status" aria-live="polite">
      <span className="page-loading-dot" aria-hidden="true" />
      正在加载模型…
    </div>
  );
}

function ScrollManager() {
  const location = useLocation();
  useEffect(() => {
    if (location.pathname !== '/practice' || !location.search.includes('q=')) {
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
    document.title = PAGE_TITLES[location.pathname] ?? 'EM Physics Lab';
  }, [location.pathname, location.search]);
  return null;
}

function AppFooter() {
  const location = useLocation();
  if (location.pathname.startsWith('/particle/') || location.pathname.startsWith('/induction/')) {
    return null;
  }
  return (
    <footer className="app-footer">
      <div>
        <Icon name="info" size={15} />
        <span>本机学习记录 · 无需账号 · P01–P08 / I01–I08 已实现并测试</span>
      </div>
      <span>面向黑龙江新高考物理复习 · 内容标注“原创 / 待核验”以示区分</span>
    </footer>
  );
}

export function App() {
  return (
    <HashRouter>
      <ScrollManager />
      <a className="skip-link" href="#main-content">
        跳到主要内容
      </a>
      <div className="app-shell">
        <TopBar />
        <CaseReturnBanner />
        <main className="app-main" id="main-content">
          <Suspense fallback={<PageLoading />}>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/particle/lorentz-force" element={<LorentzForcePage />} />
              <Route path="/particle/uniform-b" element={<UniformBPage />} />
              <Route path="/particle/half-plane" element={<HalfPlanePage />} />
              <Route path="/particle/finite-field" element={<FiniteFieldPage />} />
              <Route path="/particle/alternating-fields" element={<AlternatingFieldsPage />} />
              <Route path="/particle/combined-fields" element={<P06Page />} />
              <Route path="/particle/beamline" element={<BeamlinePage />} />
              <Route path="/particle/constraint-lab" element={<ConstraintLabPage />} />
              <Route path="/induction/flux-lenz" element={<FluxLenzPage />} />
              <Route path="/induction/loop-entry" element={<LoopEntryPage />} />
              <Route path="/induction/moving-rod" element={<MovingRodPage />} />
              <Route path="/induction/time-varying-field" element={<TimeVaryingPage />} />
              <Route path="/induction/coupled-loop" element={<CoupledLoopPage />} />
              <Route path="/induction/dual-rods" element={<DualRodsPage />} />
              <Route path="/induction/opposite-fields-wall" element={<OppositeFieldsLoopPage />} />
              <Route path="/induction/ac-generator" element={<AcGeneratorPage />} />
              <Route path="/cases" element={<CaseListPage />} />
              <Route path="/cases/:caseId" element={<CaseDetailPage />} />
              <Route path="/teacher/problems" element={<TeacherProblemListPage />} />
              <Route path="/teacher/problems/:draftId/edit" element={<TeacherProblemEditorPage />} />
              <Route path="/teacher/problems/:draftId/preview" element={<TeacherProblemPreviewPage />} />
              <Route path="/device-check" element={<DeviceCheckPage />} />
              <Route path="/path" element={<LearningPathPage />} />
              <Route path="/path/:pathId/:modelId" element={<LearningPathDetailPage />} />
              <Route path="/practice" element={<PracticePage />} />
              <Route path="/progress" element={<ProgressPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Suspense>
        </main>
        <AppFooter />
      </div>
    </HashRouter>
  );
}
