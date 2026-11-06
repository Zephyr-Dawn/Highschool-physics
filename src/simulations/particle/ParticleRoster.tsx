import { Icon } from '../../components/Icon';
import { formatTime } from '../../lib/format';
import { MAX_PARTICLES, type ParticleLineStyle } from '../../physics/particles/multiParticle';

export interface RosterParticle {
  id: string;
  label: string;
  color: string;
  lineStyle: ParticleLineStyle;
  visible: boolean;
  showTrail: boolean;
  selected: boolean;
  launchTimeSec: number;
  tauS: number | null;
}

interface ParticleRosterProps {
  particles: RosterParticle[];
  onSelect: (id: string) => void;
  onAdd: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onRelaunchSelected: () => void;
  onRelaunchAll: () => void;
  onToggleTrail: () => void;
  onClearTrail: () => void;
  onToggleVisible: () => void;
  showTime?: boolean;
  showLaunchActions?: boolean;
  showTrailActions?: boolean;
  showVisibilityAction?: boolean;
}

const LINE_LABEL: Record<ParticleLineStyle, string> = {
  solid: '实线',
  dashed: '虚线',
  dotted: '点线',
  'dash-dot': '点划线',
  'long-dash': '长虚线',
};

export function ParticleRoster({
  particles,
  onSelect,
  onAdd,
  onDuplicate,
  onRemove,
  onRelaunchSelected,
  onRelaunchAll,
  onToggleTrail,
  onClearTrail,
  onToggleVisible,
  showTime = true,
  showLaunchActions = true,
  showTrailActions = true,
  showVisibilityAction = true,
}: ParticleRosterProps) {
  const selected = particles.find((particle) => particle.selected) ?? particles[0];
  const atLimit = particles.length >= MAX_PARTICLES;
  return (
    <section className="particle-roster" aria-label="多粒子列表与操作" data-testid="particle-roster">
      <div className="particle-chip-row" role="group" aria-label="选择粒子">
        {particles.map((particle) => (
          <button
            key={particle.id}
            type="button"
            className={`particle-chip ${particle.selected ? 'is-selected' : ''} ${particle.visible ? '' : 'is-hidden'}`}
            aria-pressed={particle.selected}
            aria-label={`粒子 ${particle.label}${showTime ? `，${particle.tauS === null ? '尚未发射' : `局部时间 ${formatTime(particle.tauS)}`}` : ''}`}
            title={`${particle.label} · ${LINE_LABEL[particle.lineStyle]}${showTime ? ` · 发射于 ${formatTime(particle.launchTimeSec)}` : ''}`}
            style={{ '--particle-color': particle.color } as React.CSSProperties}
            onClick={() => onSelect(particle.id)}
            data-testid={`particle-chip-${particle.id}`}
          >
            <span className="particle-chip-dot" aria-hidden="true" />
            <strong>{particle.label}</strong>
            {showTime ? (
              <span className="particle-chip-time">
                {particle.tauS === null ? '待发射' : `τ ${formatTime(particle.tauS)}`}
              </span>
            ) : null}
          </button>
        ))}
        <span className="particle-count">{particles.length}/{MAX_PARTICLES}</span>
      </div>
      <div className="particle-action-row">
        <button type="button" className="particle-action" onClick={onAdd} disabled={atLimit} data-testid="particle-add">
          <Icon name="plus" size={15} />
          添加
        </button>
        <button type="button" className="particle-action" onClick={onDuplicate} disabled={atLimit} data-testid="particle-duplicate">
          复制当前
        </button>
        <button
          type="button"
          className="particle-action"
          onClick={onRemove}
          disabled={particles.length <= 1}
          data-testid="particle-remove"
        >
          <Icon name="trash" size={15} />
          删除当前
        </button>
        {showLaunchActions ? (
          <>
            <button type="button" className="particle-action" onClick={onRelaunchSelected} data-testid="particle-relaunch-selected">
              仅发射当前
            </button>
            <button type="button" className="particle-action" onClick={onRelaunchAll} data-testid="particle-relaunch-all">
              全部同步发射
            </button>
          </>
        ) : null}
        {showTrailActions ? (
          <>
            <button type="button" className="particle-action" onClick={onToggleTrail} data-testid="particle-toggle-trail">
              {selected?.showTrail ? '隐藏轨迹' : '显示轨迹'}
            </button>
            <button type="button" className="particle-action" onClick={onClearTrail} data-testid="particle-clear-trail">
              清除已走轨迹
            </button>
          </>
        ) : null}
        {showVisibilityAction ? (
          <button type="button" className="particle-action" onClick={onToggleVisible} data-testid="particle-toggle-visible">
            {selected?.visible ? '隐藏当前粒子' : '显示当前粒子'}
          </button>
        ) : null}
      </div>
    </section>
  );
}
