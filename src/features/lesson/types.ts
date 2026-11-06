export interface LessonReadStep {
  kind: 'read';
  id: string;
  title: string;
  body: string[];
  formula?: string;
  note?: string;
}

export interface LessonPredictStep {
  kind: 'predict';
  id: string;
  title: string;
  question: string;
  options: string[];
  correct: number;
  hint: string;
  explain: string;
  formula?: string;
}

export interface LessonTaskStep {
  kind: 'task';
  id: string;
  title: string;
  instruction: string;
  observations: string[];
  presetId?: string;
  presetLabel?: string;
}

export type LessonStep = LessonReadStep | LessonPredictStep | LessonTaskStep;

export interface LessonAnswerState {
  selected: number | null;
  correct: boolean | null;
  hintShown: boolean;
  completed: boolean;
}

export interface LessonProgress {
  stepIndex: number;
  answers: Record<string, LessonAnswerState>;
}
