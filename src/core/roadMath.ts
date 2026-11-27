/**
 * Pure mathematical spline helpers for the 9-stage campaign (Stages 1..9).
 * Convention:
 * - `distance` runs from `0` (Point A) to `stage.length` (Point B).
 * - In Three.js world space, forward travel runs along `-Z` (`worldZ = -distance`).
 */

export function distanceToWorldZ(distance: number): number {
  return -distance;
}

export function worldZToDistance(worldZ: number): number {
  return -worldZ;
}

export function getRoadProgress(distance: number, stageLength: number): number {
  if (stageLength <= 0) return 0;
  return Math.max(0, Math.min(1, distance / stageLength));
}

export function getRoadCenterX(stageId: number, distance: number): number {
  const d = Math.max(0, distance);

  // Chapter 1 (Stages 1..3): 6-lane wide urban avenues
  if (stageId === 1) {
    return Math.sin(d * 0.004) * 10.5 + Math.sin(d * 0.0082) * 2.8;
  }
  if (stageId === 2) {
    return Math.sin(d * 0.0038 + 0.5) * 11.5 + Math.cos(d * 0.0075) * 2.6 - 2.6;
  }
  if (stageId === 3) {
    // Stage 1-3 (Cầu vượt Cổ Linh -> VinUni): straighter approach for the overpass (620..1460m)
    const overpassBlend =
      d > 620 && d < 1460
        ? 1 - 0.65 * Math.sin(((d - 620) / 840) * Math.PI)
        : 1;
    return (Math.sin(d * 0.0042) * 11.0 + Math.sin(d * 0.0085) * 3.0) * overpassBlend;
  }

  // Chapter 2 (Stages 4..6): 4-lane tree-canopy boulevards
  if (stageId >= 4 && stageId <= 6) {
    const phase = (stageId - 4) * 0.6;
    return (
      Math.sin(d * 0.0046 + 0.4 + phase) * 11.5 +
      Math.cos(d * 0.0088 + phase) * 3.2 -
      3.2 * Math.cos(phase)
    );
  }

  // Chapter 3 (Stages 7..9): 2-lane narrow Old Quarter streets
  const phase = Math.max(0, stageId - 7) * 0.55;
  return (
    Math.sin(d * 0.0052 + phase) * 8.8 +
    Math.sin(d * 0.011 + phase) * 2.8 -
    Math.sin(phase) * 8.8 -
    Math.sin(phase) * 2.8
  );
}

export function getRoadElevationY(stageId: number, distance: number): number {
  const d = Math.max(0, distance);
  if (stageId !== 3) {
    return 0;
  }
  // Stage 1-3 (Cầu vượt Cổ Linh): smooth concrete overpass spanning 682.5m to 1404m
  const startD = 682.5;
  const endD = 1404.0;
  if (d <= startD || d >= endD) {
    return 0;
  }
  const t = (d - startD) / (endD - startD); // 0..1
  // Smooth raised-cosine bridge profile peaking at 5.6m
  const peakHeight = 5.6;
  return peakHeight * 0.5 * (1 - Math.cos(2 * Math.PI * t));
}

export function getRoadSlope(stageId: number, distance: number): number {
  const eps = 1.0;
  const y1 = getRoadElevationY(stageId, Math.max(0, distance - eps));
  const y2 = getRoadElevationY(stageId, distance + eps);
  return (y2 - y1) / (2 * eps);
}

export function getRoadTangentYaw(stageId: number, distance: number): number {
  const eps = 1.0;
  const x1 = getRoadCenterX(stageId, Math.max(0, distance - eps));
  const x2 = getRoadCenterX(stageId, distance + eps);
  // Forward vector in world space is (dx, 0, -2*eps)
  return Math.atan2(-(x2 - x1), 2 * eps);
}
