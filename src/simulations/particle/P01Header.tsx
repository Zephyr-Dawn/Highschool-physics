import { Icon } from '../../components/Icon';
import { Segmented } from '../../components/Segmented';

export type P01ViewMode = 'force3d' | 'motion3d' | 'planar';
export type LearningMode = 'guided' | 'free';

interface P01HeaderProps {
  mode: P01ViewMode;
  learningMode: LearningMode;
  teacher: boolean;
  onModeChange: (mode: P01ViewMode) => void;
  onLearningModeChange: (mode: LearningMode) => void;
  onTeacherChange: (teacher: boolean) => void;
}

const TITLES: Record<P01ViewMode, string> = {
  force3d: '真实 WebGL 三维洛伦兹力',
  motion3d: '匀强磁场中的三维解析运动',
  planar: '平面磁场中的多粒子运动',
};

const SUBTITLES: Record<P01ViewMode, string> = {
  force3d: '旋转真实深度场景观察 v、B 与 F_B=q(v×B)；1–5 个粒子共享 B，相机操作不改变世界分量，可切换到 3D 运动查看圆周或螺旋。',
  motion3d: '在同一 3D 画布中展示直线、圆周和螺旋：共享静态 B 与全局时钟，独立 launchTime，播放中只重发射被编辑的粒子。轨迹来自解析解，不是屏幕动画。',
  planar: '复用 P02 解析轨迹与多粒子控制：共享 Bz、独立初态与 launchTime，播放中只重发射被编辑的粒子。这是保留的二维快速教学视图。',
};

export function P01Header({
  mode,
  learningMode,
  teacher,
  onModeChange,
  onLearningModeChange,
  onTeacherChange,
}: P01HeaderProps) {
  return (
    <header className="sim-header">
      <div className="sim-title-block">
        <p className="eyebrow">P01 · 模块 A · 洛伦兹力实验台</p>
        <h1>{TITLES[mode]}</h1>
        <p className="sim-subtitle">{SUBTITLES[mode]}</p>
      </div>
      <div className="sim-header-actions">
        <Segmented<P01ViewMode>
          ariaLabel="P01 实验模式"
          value={mode}
          onChange={onModeChange}
          options={[
            { value: 'force3d', label: '3D 受力' },
            { value: 'motion3d', label: '3D 运动' },
            { value: 'planar', label: '2D 运动' },
          ]}
        />
        {!teacher ? (
          <Segmented<LearningMode>
            ariaLabel="学习模式"
            value={learningMode}
            onChange={onLearningModeChange}
            options={[
              { value: 'guided', label: '引导学习', icon: <Icon name="book" size={16} /> },
              { value: 'free', label: '自由实验', icon: <Icon name="sliders" size={16} /> },
            ]}
          />
        ) : null}
        <button
          type="button"
          className={`tool-button ${teacher ? 'is-active' : ''}`}
          onClick={() => onTeacherChange(!teacher)}
          aria-pressed={teacher}
        >
          <Icon name="target" size={17} />
          {teacher ? '退出教师视图' : '教师视图'}
        </button>
      </div>
    </header>
  );
}
