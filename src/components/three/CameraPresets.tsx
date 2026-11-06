export type CameraPreset = 'front' | 'side' | 'top' | 'oblique' | 'reset' | 'custom';

const PRESETS: Array<{ id: Exclude<CameraPreset, 'custom'>; label: string; hint: string }> = [
  { id: 'front', label: '正视 +z', hint: '从 +z 看向原点' },
  { id: 'side', label: '侧视 +x', hint: '从 +x 看向原点' },
  { id: 'top', label: '俯视 +y', hint: '从 +y 看向原点' },
  { id: 'oblique', label: '斜视', hint: '保留深度感的三维视角' },
  { id: 'reset', label: '重置相机', hint: '回到默认斜视，不改变物理量' },
];

export function CameraPresets({
  active,
  onChange,
}: {
  active: CameraPreset;
  onChange: (preset: Exclude<CameraPreset, 'custom'>) => void;
}) {
  return (
    <div className="p01-3d-camera-presets" role="group" aria-label="三维相机预设">
      {PRESETS.map((preset) => (
        <button
          key={preset.id}
          type="button"
          className={`chip-button ${active === preset.id ? 'is-active' : ''}`}
          aria-pressed={active === preset.id}
          title={preset.hint}
          onClick={() => onChange(preset.id)}
          data-testid={`p01-camera-${preset.id}`}
        >
          {preset.label}
        </button>
      ))}
    </div>
  );
}
