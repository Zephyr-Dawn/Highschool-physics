import type { LessonStep } from '../features/lesson/types';
import type { ModelId } from './schema';
import {
  I01_LESSON,
  I02_LESSON,
  I03_LESSON,
  I04_LESSON,
  I05_LESSON,
  I06_LESSON,
  I07_LESSON,
  I08_LESSON,
  P01_MOTION3D_LESSON,
  P02_LESSON,
  P03_LESSON,
  P04_LESSON,
  P05_LESSON,
  P06_LESSON,
  P07_LESSON,
  P08_LESSON,
} from './lessons';

export const LESSON_BY_MODEL: Record<ModelId, LessonStep[]> = {
  p01: P01_MOTION3D_LESSON,
  p02: P02_LESSON,
  p03: P03_LESSON,
  p04: P04_LESSON,
  p05: P05_LESSON,
  p06: P06_LESSON,
  p07: P07_LESSON,
  p08: P08_LESSON,
  i01: I01_LESSON,
  i02: I02_LESSON,
  i03: I03_LESSON,
  i04: I04_LESSON,
  i05: I05_LESSON,
  i06: I06_LESSON,
  i07: I07_LESSON,
  i08: I08_LESSON,
};
