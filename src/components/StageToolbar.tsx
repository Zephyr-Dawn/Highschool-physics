import { Icon } from './Icon';
import { Segmented } from './Segmented';

export type StageMode = 'interact' | 'pan';

interface StageToolbarProps {
  mode: StageMode;
  onModeChange: (mode: StageMode) => void;
  onFit: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  extra?: React.ReactNode;
}

export function StageToolbar({
  mode,
  onModeChange,
  onFit,
  onZoomIn,
  onZoomOut,
  extra,
}: StageToolbarProps) {
  return (
    <div className="stage-toolbar">
      <div className="stage-toolbar-mode">
        <Segmented<StageMode>
          ariaLabel="舞台手势模式"
          value={mode}
          onChange={onModeChange}
          size="sm"
          options={[
            {
              value: 'interact',
              label: '操作元素',
              icon: <Icon name="pointer" size={17} />,
            },
            {
              value: 'pan',
              label: '平移视野',
              icon: <Icon name="hand" size={17} />,
            },
          ]}
        />
      </div>
      <div className="stage-toolbar-actions">
        {extra}
        <button
          type="button"
          className="icon-button icon-button-sm"
          aria-label="缩小视野"
          title="缩小视野"
          onClick={onZoomOut}
        >
          <Icon name="minus" size={18} />
        </button>
        <button
          type="button"
          className="icon-button icon-button-sm"
          aria-label="放大视野"
          title="放大视野"
          onClick={onZoomIn}
        >
          <Icon name="plus" size={18} />
        </button>
        <button
          type="button"
          className="tool-button tool-button-sm"
          onClick={onFit}
          data-testid="fit-view"
        >
          <Icon name="fit" size={17} />
          <span>适配视图</span>
        </button>
      </div>
    </div>
  );
}
