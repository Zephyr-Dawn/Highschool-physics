import { Link, useLocation } from 'react-router-dom';
import { Icon } from './Icon';

export function CaseReturnBanner() {
  const location = useLocation();
  if (location.pathname.startsWith('/cases') || location.pathname.startsWith('/device-check')) return null;
  const params = new URLSearchParams(location.search);
  const caseId = params.get('case');
  const stageId = params.get('stage');
  if (!caseId || !stageId) return null;
  return (
    <div className="case-return-banner" role="status" data-testid="case-return-banner">
      <span><Icon name="info" size={15} />案例实验模式：返回时会恢复进入前的个人场景。</span>
      <Link to={`/cases/${caseId}?stage=${stageId}`}>返回题目<Icon name="arrowRight" size={15} /></Link>
    </div>
  );
}
