export type TrafficDirection = 1 | -1;

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
