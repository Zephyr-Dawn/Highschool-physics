import {
  verifyCompositeContinuity,
  type CompositeSnapshot,
  type ElectricMagneticScreenSolution,
} from '../../physics/composite/electricMagneticScreen';
import type { WholeProblemModel } from '../cases/wholeProblem/types';

export type PhysicalStageKind = 'electric-acceleration' | 'magnetic-strip' | 'free-drift';

export interface ParticleSnapshotSI {
  kind: PhysicalStageKind;
  particleId: string;
  globalTime: number;
  localTime: number;
  position: { x: number; y: number };
  velocity: { x: number; y: number };
  chargeC: number;
  massKg: number;
  speedMps: number;
  kineticEnergyJ: number;
}

export type StageExitStatus =
  | 'transition'
  | 'absorbed'
  | 'screen-hit'
  | 'screen-outside'
  | 'stopped'
  | 'event-limited'
  | 'unsupported';

export interface StageExit {
  status: StageExitStatus;
  atGlobalTime: number;
  stage: PhysicalStageKind;
  boundaryId?: string;
  physicalState: ParticleSnapshotSI | null;
  explanation: string;
}

export function toParticleSnapshotSI(snapshot: CompositeSnapshot): ParticleSnapshotSI {
  return {
    kind: snapshot.stage,
    particleId: snapshot.particleId,
    globalTime: snapshot.globalTimeS,
    localTime: snapshot.localTimeS,
    position: { ...snapshot.position },
    velocity: { ...snapshot.velocity },
    chargeC: snapshot.chargeC,
    massKg: snapshot.massKg,
    speedMps: snapshot.speedMps,
    kineticEnergyJ: snapshot.kineticEnergyJ,
  };
}

export function stageExitsFromA17(solution: ElectricMagneticScreenSolution): StageExit[] {
  const exits: StageExit[] = [];
  if (solution.exitAElectric) {
    exits.push({
      status: solution.outcome === 'boundary-not-reached' ? 'stopped' : 'transition',
      atGlobalTime: solution.stageTimings.electricS,
      stage: 'electric-acceleration',
      boundaryId: 'a-exit',
      physicalState: toParticleSnapshotSI(solution.exitAElectric),
      explanation: '电场边界出口状态直接作为磁场阶段入口。',
    });
  }
  if (solution.exitBMagnetic) {
    exits.push({
      status: 'transition',
      atGlobalTime: solution.stageTimings.electricS + solution.stageTimings.magneticS,
      stage: 'magnetic-strip',
      boundaryId: 'b-exit',
      physicalState: toParticleSnapshotSI(solution.exitBMagnetic),
      explanation: '磁场真实出场状态直接作为无场漂移入口。',
    });
  }
  if (solution.screen) {
    exits.push({
      status: solution.screen.accepted ? 'screen-hit' : 'screen-outside',
      atGlobalTime: solution.screen.timeS,
      stage: 'free-drift',
      boundaryId: solution.screen.accepted ? 'screen-hit' : 'screen-outside',
      physicalState: toParticleSnapshotSI(solution.screen.snapshot),
      explanation: solution.screen.accepted ? '粒子命中屏幕有效接收区。' : '到达屏幕直线但超出有效接收区。',
    });
  }
  if (solution.outcome === 'magnetic-no-exit' && solution.exitAElectric) {
    exits.push({
      status: 'event-limited',
      atGlobalTime: solution.durationS,
      stage: 'magnetic-strip',
      boundaryId: 'magnetic-no-exit',
      physicalState: toParticleSnapshotSI(solution.stateAt(solution.durationS)),
      explanation: '磁场阶段没有真实出场事件，后续自由漂移与屏幕不执行。',
    });
  }
  return exits;
}

export interface ContinuityEvidence {
  continuous: boolean;
  handoffCount: number;
  maxPositionErrorM: number;
  maxVelocityErrorMps: number;
  maxTimeErrorS: number;
  notes: string[];
}

export function a17ContinuityEvidence(solution: ElectricMagneticScreenSolution): ContinuityEvidence {
  return {
    continuous: verifyCompositeContinuity(solution),
    handoffCount: solution.handoffs.length,
    maxPositionErrorM: Math.max(0, ...solution.handoffs.map((item) => item.positionErrorM)),
    maxVelocityErrorMps: Math.max(0, ...solution.handoffs.map((item) => item.velocityErrorMps)),
    maxTimeErrorS: Math.max(0, ...solution.handoffs.map((item) => item.timeErrorS)),
    notes: solution.handoffs.map((item) => item.explanation),
  };
}

export function wholeProblemContinuityNote(model: WholeProblemModel): string | null {
  const handoffs = model.events.filter((event) => event.kind === 'handoff');
  if (handoffs.length === 0) return null;
  return handoffs.map((event) => event.label).join('；');
}
