import { lazy, Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { usePersistentState } from '../../hooks/usePersistentState';
import type { LearningMode, P01ViewMode } from './P01Header';

const P01ThreeDLab = lazy(() =>
  import('./P01ThreeDLab').then((module) => ({ default: module.P01ThreeDLab })),
);
const P01PlanarLab = lazy(() =>
  import('./P01PlanarLab').then((module) => ({ default: module.P01PlanarLab })),
);

function ModelLoading({ label }: { label: string }) {
  return (
    <div className="page-loading p01-model-loading" role="status" aria-live="polite">
      <span className="page-loading-dot" aria-hidden="true" />
      正在加载{label}…
    </div>
  );
}

export function LorentzForcePage() {
  const [viewMode, setViewMode] = usePersistentState<P01ViewMode>('emplab.p01.view.v1', 'force3d');
  const [learningMode, setLearningMode] = usePersistentState<LearningMode>('emplab.p01.learning.v1', 'guided');
  const [teacher, setTeacher] = useState(false);
  const [searchParams] = useSearchParams();
  const presetId = searchParams.get('preset');
  const [pendingPresetId, setPendingPresetId] = useState<string | null>(presetId);

  useEffect(() => {
    setPendingPresetId(presetId);
    if (!presetId) return;
    if (presetId.startsWith('p01-motion3d-')) setViewMode('motion3d');
    else if (presetId.startsWith('p01-force-') || presetId.startsWith('p01-3d-')) setViewMode('force3d');
    else if (presetId.startsWith('p01-motion-')) setViewMode('planar');
  }, [presetId, setViewMode]);

  if (viewMode === 'planar') {
    return (
      <Suspense fallback={<ModelLoading label="二维运动模式" />}>
        <P01PlanarLab
          learningMode={learningMode}
          teacher={teacher}
          presetId={pendingPresetId}
          onModeChange={setViewMode}
          onLearningModeChange={setLearningMode}
          onTeacherChange={setTeacher}
          onPresetConsumed={() => setPendingPresetId(null)}
        />
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<ModelLoading label="三维实验" />}>
      <P01ThreeDLab
        mode={viewMode}
        learningMode={learningMode}
        teacher={teacher}
        presetId={pendingPresetId}
        onModeChange={setViewMode}
        onLearningModeChange={setLearningMode}
        onTeacherChange={setTeacher}
        onPresetConsumed={() => setPendingPresetId(null)}
      />
    </Suspense>
  );
}
