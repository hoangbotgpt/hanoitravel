import { describe, expect, it } from 'vitest';
import { STAGES } from '../config/gameConfig';
import {
  distanceToWorldZ,
  getRoadCenterX,
  getRoadElevationY,
  getRoadProgress,
  getRoadSlope,
  getRoadTangentYaw,
  worldZToDistance
} from '../core/roadMath';

describe('roadMath', () => {
  it('maps distance and worldZ consistently along -Z', () => {
    expect(distanceToWorldZ(0) + 0).toBe(0);
    expect(distanceToWorldZ(250)).toBe(-250);
    expect(worldZToDistance(-250)).toBe(250);
    expect(worldZToDistance(distanceToWorldZ(1234.5))).toBeCloseTo(1234.5, 6);
  });

  it('clamps road progress strictly within [0, 1]', () => {
    expect(getRoadProgress(-50, 1450)).toBe(0);
    expect(getRoadProgress(0, 1450)).toBe(0);
    expect(getRoadProgress(725, 1450)).toBeCloseTo(0.5, 6);
    expect(getRoadProgress(1450, 1450)).toBe(1);
    expect(getRoadProgress(2500, 1450)).toBe(1);
    expect(getRoadProgress(500, 0)).toBe(0);
    expect(getRoadProgress(500, -100)).toBe(0);
  });

  it('keeps road center X continuous and finite across all 9 stages', () => {
    for (const stage of STAGES) {
      expect(getRoadCenterX(stage.id, -20)).toBeCloseTo(getRoadCenterX(stage.id, 0), 6);

      let prevX = getRoadCenterX(stage.id, 0);
      expect(Number.isFinite(prevX)).toBe(true);

      for (let d = 1; d <= stage.length; d += 1) {
        const x = getRoadCenterX(stage.id, d);
        expect(Number.isFinite(x)).toBe(true);
        expect(Math.abs(x - prevX)).toBeLessThan(0.25);
        prevX = x;
      }
    }
  });

  it('keeps non-overpass stages (all except Stage 3) completely flat at y = 0', () => {
    for (const stageId of [1, 2, 4, 5, 6, 7, 8, 9] as const) {
      const stage = STAGES.find((s) => s.id === stageId)!;
      for (let d = 0; d <= stage.length; d += 25) {
        expect(getRoadElevationY(stageId, d)).toBe(0);
        expect(getRoadSlope(stageId, d)).toBe(0);
      }
    }
  });

  it('models Stage 3 overpass smooth rise and fall between 682.5m and 1404m peaking at 5.6m', () => {
    expect(getRoadElevationY(3, 0)).toBe(0);
    expect(getRoadElevationY(3, 682.5)).toBe(0);
    expect(getRoadElevationY(3, 1404)).toBe(0);
    expect(getRoadElevationY(3, 1950)).toBe(0);

    const midDistance = (682.5 + 1404) / 2; // 1043.25m
    const peakY = getRoadElevationY(3, midDistance);
    expect(peakY).toBeCloseTo(5.6, 5);

    let prevY = 0;
    for (let d = 680; d <= 1406; d += 1) {
      const y = getRoadElevationY(3, d);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(5.6 + 1e-6);
      expect(Math.abs(y - prevY)).toBeLessThan(0.06);
      prevY = y;
    }

    // Symmetry around overpass peak
    expect(getRoadElevationY(3, midDistance - 150)).toBeCloseTo(
      getRoadElevationY(3, midDistance + 150),
      5
    );

    // Positive slope climbing, near-zero at peak, negative slope descending
    expect(getRoadSlope(3, 860)).toBeGreaterThan(0.01);
    expect(Math.abs(getRoadSlope(3, midDistance))).toBeLessThan(1e-4);
    expect(getRoadSlope(3, 1220)).toBeLessThan(-0.01);
  });

  it('computes continuous finite road tangent yaw across all 9 stages', () => {
    for (const stage of STAGES) {
      let prevYaw = getRoadTangentYaw(stage.id, 0);
      for (let d = 1; d <= stage.length; d += 5) {
        const yaw = getRoadTangentYaw(stage.id, d);
        expect(Number.isFinite(yaw)).toBe(true);
        expect(yaw).toBeGreaterThanOrEqual(-Math.PI);
        expect(yaw).toBeLessThanOrEqual(Math.PI);
        expect(Math.abs(yaw - prevYaw)).toBeLessThan(0.15);
        prevYaw = yaw;
      }
    }
  });
});
