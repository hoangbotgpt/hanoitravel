/**
 * Pure mathematical spline helpers for the 3 linear Road Rash stages.
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
  if (stageId === 1) {
    // Gentle Old Quarter curve approaching Ô Quan Chưởng and curving toward Hoàn Kiếm
    return Math.sin(d * 0.0055) * 9.5 + Math.sin(d * 0.012) * 3.2;
  }
  if (stageId === 2) {
    // Sweeping tree-lined avenue bends
    return Math.sin(d * 0.0046 + 0.4) * 12.0 + Math.cos(d * 0.009) * 3.5 - 3.5;
  }
  // Stage 3: straighter approach for the overpass (35%-72%), gentle bends before/after
  const overpassBlend =
    d > 620 && d < 1460
      ? 1 - 0.65 * Math.sin(((d - 620) / 840) * Math.PI)
      : 1;
  return (Math.sin(d * 0.0042) * 11.0 + Math.sin(d * 0.0085) * 3.0) * overpassBlend;
}

export function getRoadElevationY(stageId: number, distance: number): number {
  const d = Math.max(0, distance);
  if (stageId !== 3) {
    return 0;
  }
  // Stage 3 length = 1950m; smooth Concrete Overpass spans 35% (682.5m) to 72% (1404m)
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
