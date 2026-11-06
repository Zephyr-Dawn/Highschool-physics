import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';

export function NotFoundPage() {
  return (
    <div className="not-found">
      <p className="eyebrow">404</p>
      <h1>这个实验页还没有搭建</h1>
      <p>当前一期可用 P02 与 I03。其余模型在路线图中明确标记为“规划中”。</p>
      <div className="hero-actions">
        <Link className="primary-button" to="/">
          返回首页
          <Icon name="arrowRight" size={17} />
        </Link>
        <Link className="secondary-button" to="/practice">
          去练习
        </Link>
      </div>
    </div>
  );
}
