import { Icon } from '../Icon';

export function WebGLFallback({
  reason,
  onRetry,
  onUse2D,
}: {
  reason: string;
  onRetry?: () => void;
  onUse2D: () => void;
}) {
  return (
    <section className="p01-3d-fallback" role="status" data-testid="p01-3d-fallback">
      <div className="p01-3d-fallback-mark" aria-hidden="true">
        <Icon name="info" size={28} />
      </div>
      <div>
        <p className="eyebrow">3D 视图暂不可用</p>
        <h2>已切换到兼容的 2D 受力视图</h2>
        <p>{reason}</p>
        <p className="small-note">
          物理公式、数据面板、题库和其他模型不受影响。可以继续使用原有二维受力图，或切换到二维平面运动。
        </p>
        <div className="p01-3d-fallback-actions">
          {onRetry ? (
            <button type="button" className="secondary-button" onClick={onRetry}>
              <Icon name="reset" size={16} />
              重试 3D
            </button>
          ) : null}
          <button type="button" className="primary-button" onClick={onUse2D}>
            切换到二维运动
          </button>
        </div>
      </div>
    </section>
  );
}
