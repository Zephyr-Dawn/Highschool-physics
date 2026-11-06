import type { QuestionPart, WholeProblemScenario } from '../../../content/problemCaseSchema';

export interface WholeProblemLabItem {
  id: string;
  parts: QuestionPart[];
  wholeProblem: WholeProblemScenario;
}

export type WholeProblemCoverage =
  | 'full_problem_simulated'
  | 'partial_stage'
  | 'concept_illustration'
  | 'unsupported';

export interface WholeProblemPoint {
  t: number;
  x: number;
  y: number;
}

export interface WholeProblemTrace {
  id: string;
  label: string;
  color: string;
  points: WholeProblemPoint[];
}

export interface WholeProblemEvent {
  id: string;
  t: number;
  kind: string;
  label: string;
  x?: number;
  y?: number;
  detail?: string;
}

export interface WholeProblemGeometry {
  mode: 'particles' | 'loop' | 'rods';
  viewBox: { xMin: number; xMax: number; yMin: number; yMax: number };
  bands: Array<{ x0: number; x1: number; label: string; color: string; glyph?: '+' | '-' | '0' }>;
  verticalGuides: Array<{ x: number; label?: string; color?: string; dashed?: boolean }>;
  slits: Array<{ x: number; yCenter: number; halfWidth: number }>;
  screen: { x: number; yMin: number; yMax: number } | null;
  wall: { x: number } | null;
  loop: { widthM: number; heightM: number } | null;
  rods: { railMinM: number; railMaxM: number; yM: number } | null;
}

export interface WholeProblemChart {
  id: string;
  title: string;
  unit: string;
  color: string;
  points: Array<{ tS: number; value: number }>;
  signed?: boolean;
}

export interface WholeProblemObservable {
  value: number | null;
  unit: string;
  label: string;
  note?: string;
}

export type WholeProblemObservables = Record<string, WholeProblemObservable>;

export interface WholeProblemMarker {
  id: string;
  label: string;
  color: string;
  x: number;
  y: number;
}

export interface WholeProblemLoopState {
  id: string;
  label: string;
  xM: number;
  color: string;
}

export interface WholeProblemFrame {
  time: number;
  markers: WholeProblemMarker[];
  loops: WholeProblemLoopState[];
  rods: Array<{ id: string; label: string; xM: number; color: string }> | null;
  observables: WholeProblemObservables;
}

export interface WholeProblemModel {
  caseId: string;
  adapterId: string;
  coverage: WholeProblemCoverage;
  durationS: number;
  geometry: WholeProblemGeometry;
  traces: WholeProblemTrace[];
  events: WholeProblemEvent[];
  charts: WholeProblemChart[];
  observations: WholeProblemObservables;
  answers: WholeProblemObservables;
  issue: string | null;
  parameterValues: Record<string, number>;
  baselineValues: Record<string, number>;
  hasChanges: boolean;
  frameAt(timeS: number): WholeProblemFrame;
}

export interface WholeProblemBuildInput {
  caseId: string;
  adapterId: string;
  overrides: Record<string, number>;
  baseline: Record<string, number>;
}
