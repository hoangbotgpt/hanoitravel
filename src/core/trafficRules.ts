import {
  OBSTACLE_TYPES,
  type ObstacleTypeId,
  type StageSpec
} from '../config/gameConfig.ts';

export type TrafficDirection = 1 | -1;

/**
 * Ver 2.0 road-class & chapter-level filter (FR-23).
 */
export function isObstacleAllowedOnStage(
  type: ObstacleTypeId,
  stage: StageSpec
): boolean {
  const spec = OBSTACLE_TYPES[type];
  if (!spec.allowedRoadClasses.includes(stage.laneCount)) return false;
  if (spec.minLevelInChapter && stage.levelInChapter < spec.minLevelInChapter) {
    return false;
  }
  return true;
}

/**
 * Hanoi two-way carriageway convention (supports 2-lane, 4-lane, and 6-lane roads):
 * - Left half (lanes 0 .. laneCount/2 - 1; lateralOffset < 0): oncoming traffic (-1, heading toward player / +Z)
 * - Right half (lanes laneCount/2 .. laneCount - 1; lateralOffset > 0): forward traffic (+1, heading A -> B / -Z)
 */
export function getLaneDirection(laneIndex: number, laneCount = 4): TrafficDirection {
  return laneIndex < laneCount / 2 ? -1 : 1;
}

export function isOncomingLane(lateralOffset: number): boolean {
  return lateralOffset < -0.25;
}

export function advanceObstacleDistance(
  distance: number,
  speed: number,
  direction: TrafficDirection,
  dt: number
): number {
  const safeDt = Math.max(0, dt);
  return distance + direction * Math.max(0, speed) * safeDt;
}

export const MIN_TAXIS_PER_STAGE = 2;
export const MAX_TAXIS_PER_STAGE = 3;

export interface TaxiEncounterSlot {
  triggerPlayerDist: number;
  targetSpawnDist: number;
  preferOncoming: boolean;
  spawned: boolean;
}

/**
 * Balances oncoming closing velocity (~72% of nominal baseSpeed scaled by difficulty)
 * so head-on two-way traffic feels thrilling without creating unfair reaction traps.
 */
export function computeOncomingSpeed(
  baseSpeed: number,
  difficultySpeedScale: number
): number {
  return Math.max(0, baseSpeed * difficultySpeedScale * 0.72);
}

/**
 * Generates an explicit per-stage schedule of 2–3 VF e34 Xanh SM taxi encounters
 * spread across opening, mid-stage oncoming, and late-stage traffic.
 */
export function buildStageTaxiSchedule(
  stageLength: number,
  quota: number,
  rng: () => number = Math.random
): TaxiEncounterSlot[] {
  const safeQuota = Math.max(
    MIN_TAXIS_PER_STAGE,
    Math.min(MAX_TAXIS_PER_STAGE, Math.round(quota))
  );

  const clamp = (val: number, min: number, max: number) =>
    Math.max(min, Math.min(max, val));

  const slots: TaxiEncounterSlot[] = [
    {
      triggerPlayerDist: 0,
      targetSpawnDist: Math.min(stageLength - 45, 96 + rng() * 20),
      preferOncoming: false,
      spawned: false
    }
  ];

  if (safeQuota === 2) {
    const trigger = clamp(
      stageLength * 0.46 + (rng() - 0.5) * 80,
      220,
      Math.max(220, stageLength - 220)
    );
    slots.push({
      triggerPlayerDist: trigger,
      targetSpawnDist: Math.min(stageLength - 45, trigger + 125),
      preferOncoming: true,
      spawned: false
    });
  } else {
    const trigger1 = clamp(
      stageLength * 0.34 + (rng() - 0.5) * 60,
      200,
      Math.max(200, stageLength * 0.52)
    );
    slots.push({
      triggerPlayerDist: trigger1,
      targetSpawnDist: Math.min(stageLength - 45, trigger1 + 128),
      preferOncoming: true,
      spawned: false
    });

    const minT2 = stageLength * 0.55;
    const maxT2 = Math.max(minT2, stageLength - 200);
    const trigger2 = clamp(
      stageLength * 0.67 + (rng() - 0.5) * 60,
      minT2,
      maxT2
    );
    slots.push({
      triggerPlayerDist: trigger2,
      targetSpawnDist: Math.min(stageLength - 45, trigger2 + 115),
      preferOncoming: false,
      spawned: false
    });
  }

  return slots;
}
