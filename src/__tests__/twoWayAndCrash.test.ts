import { describe, expect, it } from 'vitest';
import { LANES, ROAD_WIDTH } from '../config/gameConfig.ts';
import {
  DEFAULT_CRASH_RIDER,
  IMPACT_TUMBLE_DURATION,
  REMOUNT_DURATION,
  RUN_TO_BIKE_DURATION,
  STAND_UP_DURATION,
  TOTAL_CRASH_DURATION,
  createIdleCrashState,
  sampleCrashVisuals,
  startCrashSequence,
  stepCrashSequence
} from '../core/crashSequence.ts';
import {
  advanceObstacleDistance,
  computeOncomingSpeed,
  getLaneDirection,
  isOncomingLane
} from '../core/trafficRules.ts';

describe('Two-way Hanoi carriageway rules (trafficRules)', () => {
  it('assigns oncoming (-1) to left lanes and forward (+1) to right lanes across 2, 4, and 6 lanes', () => {
    expect(getLaneDirection(0, 2)).toBe(-1);
    expect(getLaneDirection(1, 2)).toBe(1);

    expect(getLaneDirection(0)).toBe(-1);
    expect(getLaneDirection(1)).toBe(-1);
    expect(getLaneDirection(2)).toBe(1);
    expect(getLaneDirection(3)).toBe(1);

    expect([0, 1, 2, 3, 4, 5].map((i) => getLaneDirection(i, 6))).toEqual([
      -1, -1, -1, 1, 1, 1
    ]);

    expect(isOncomingLane(LANES[0])).toBe(true);
    expect(isOncomingLane(LANES[1])).toBe(true);
    expect(isOncomingLane(LANES[2])).toBe(false);
    expect(isOncomingLane(LANES[3])).toBe(false);
    expect(isOncomingLane(0)).toBe(false);
  });

  it('advances obstacle distance according to traffic direction', () => {
    expect(advanceObstacleDistance(120, 14, -1, 0.5)).toBeCloseTo(113, 5);
    expect(advanceObstacleDistance(120, 14, 1, 0.5)).toBeCloseTo(127, 5);
    expect(advanceObstacleDistance(120, 14, -1, -1)).toBe(120);
  });

  it('computes scaled oncoming traffic speed cleanly', () => {
    expect(computeOncomingSpeed(15, 1.0)).toBeCloseTo(10.8, 5);
    expect(computeOncomingSpeed(15, 1.25)).toBeCloseTo(13.5, 5);
    expect(computeOncomingSpeed(-5, 1.0)).toBe(0);
  });
});

describe('Road Rash collision crash & recovery rig (crashSequence)', () => {
  it('starts idle in riding phase with seated rider and zero bike roll', () => {
    const idle = createIdleCrashState();
    const visual = sampleCrashVisuals(idle);
    expect(idle.phase).toBe('riding');
    expect(visual.useStandingRider).toBe(false);
    expect(visual.bikeRoll).toBe(0);
    expect(visual.bikeHeightY).toBe(0);
  });

  it('topples bike away from obstacle and clamps rider & bike within asphalt width', () => {
    const rightEdgeMax = ROAD_WIDTH * 0.5 - 1.15;
    const edgeCrash = startCrashSequence(200, 5.7, 26, 6.2, 800);
    expect(edgeCrash.fallSide).toBe(-1);
    expect(Math.abs(edgeCrash.bikeFinalLat)).toBeLessThanOrEqual(rightEdgeMax + 1e-6);

    const leftEdgeCrash = startCrashSequence(200, -5.6, 26, -4.2, 800);
    // Obstacle is on right side -> bike falls left (-1), so riderSide should reverse inward (+1)
    expect(leftEdgeCrash.fallSide).toBe(-1);
    expect(leftEdgeCrash.riderSide).toBe(1);
    expect(leftEdgeCrash.riderLandRelX).toBeGreaterThan(0);

    // Near finish line slide stays before stage end
    const nearFinish = startCrashSequence(796, 1.4, 28, 1.4, 800);
    expect(nearFinish.startDistance + nearFinish.slideLength).toBeLessThanOrEqual(799.1);

    // Narrow 7.4m Old Quarter street clamps bike & reverses rider inward safely onto asphalt
    const narrowRightMax = 7.4 * 0.5 - 1.15; // 2.55m
    const narrowCrash = startCrashSequence(120, 2.1, 22, 1.8, 1450, DEFAULT_CRASH_RIDER, 7.4);
    expect(narrowCrash.fallSide).toBe(1);
    expect(narrowCrash.riderSide).toBe(-1);
    expect(Math.abs(narrowCrash.bikeFinalLat)).toBeLessThanOrEqual(narrowRightMax + 1e-6);
    expect(Math.abs(narrowCrash.bikeFinalLat + narrowCrash.riderLandRelX)).toBeLessThanOrEqual(
      narrowRightMax + 0.5
    );
  });

  it('steps through all 4 recovery phases and triggers completedRemount back to riding', () => {
    let crash = startCrashSequence(150, 1.4, 24, 1.2, 800);
    expect(crash.phase).toBe('impact_tumble');

    // Mid impact_tumble: bike leaning onto its side, rider falling onto asphalt
    let res = stepCrashSequence(crash, IMPACT_TUMBLE_DURATION * 0.5);
    crash = res.state;
    expect(res.completedRemount).toBe(false);
    expect(crash.phase).toBe('impact_tumble');
    const tumbleVis = sampleCrashVisuals(crash);
    expect(tumbleVis.useStandingRider).toBe(true);
    expect(Math.abs(tumbleVis.bikeRoll)).toBeGreaterThan(0.5);
    expect(tumbleVis.bikeDistance).toBeGreaterThan(150);
    expect(tumbleVis.riderPitch).toBeLessThan(-0.3);

    // Enter stand_up cleanly at phaseElapsed = 0
    res = stepCrashSequence(crash, IMPACT_TUMBLE_DURATION * 0.5);
    crash = res.state;
    expect(crash.phase).toBe('stand_up');
    const standVis = sampleCrashVisuals(crash);
    expect(standVis.useStandingRider).toBe(true);
    expect(Math.abs(standVis.bikeRoll)).toBeCloseTo(1.42, 2);

    // Enter run_to_bike cleanly and verify rider moves closer to fallen bike over time
    res = stepCrashSequence(crash, STAND_UP_DURATION);
    crash = res.state;
    expect(crash.phase).toBe('run_to_bike');
    const runStart = sampleCrashVisuals(crash);
    res = stepCrashSequence(crash, RUN_TO_BIKE_DURATION * 0.65);
    crash = res.state;
    const runLate = sampleCrashVisuals(crash);
    expect(Math.hypot(runLate.riderRelX, runLate.riderRelZ)).toBeLessThan(
      Math.hypot(runStart.riderRelX, runStart.riderRelZ)
    );

    // Enter remount cleanly: bike lifts back upright and switches to seated rider at end of hop
    res = stepCrashSequence(crash, RUN_TO_BIKE_DURATION * 0.35);
    crash = res.state;
    expect(crash.phase).toBe('remount');
    res = stepCrashSequence(crash, REMOUNT_DURATION * 0.72);
    crash = res.state;
    expect(crash.phase).toBe('remount');
    const remountLate = sampleCrashVisuals(crash);
    expect(Math.abs(remountLate.bikeRoll)).toBeLessThan(0.35);
    expect(remountLate.useStandingRider).toBe(false);

    // Final step triggers completedRemount and transitions back to riding
    res = stepCrashSequence(crash, REMOUNT_DURATION * 0.35);
    expect(res.completedRemount).toBe(true);
    expect(res.state.phase).toBe('riding');
    expect(TOTAL_CRASH_DURATION).toBeCloseTo(
      IMPACT_TUMBLE_DURATION +
        STAND_UP_DURATION +
        RUN_TO_BIKE_DURATION +
        REMOUNT_DURATION,
      5
    );
  });
});

describe('Articulated rider poses during crash (riderPose)', () => {
  const rider = {
    seatY: 0.72,
    seatZ: 0.21,
    dims: { hipHeight: 0.8, thighLength: 0.31, shinLength: 0.45 }
  };

  it('launches the rider high over the handlebars and flips them forward mid-air', () => {
    const crash = startCrashSequence(100, 1.4, 30, 1.0, 800, rider);
    const mid = sampleCrashVisuals(stepCrashSequence(crash, IMPACT_TUMBLE_DURATION * 0.24).state);
    expect(mid.riderPose.y).toBeGreaterThan(rider.seatY + 0.5);
    expect(mid.riderPose.pitch).toBeLessThan(-1.5);
    expect(mid.riderRelZ).toBeLessThan(0); // ahead of the bike
  });

  it('ends the tumble lying on the asphalt and stands up with feet on the ground', () => {
    const crash = startCrashSequence(100, 1.4, 30, 1.0, 800, rider);
    const lying = sampleCrashVisuals(stepCrashSequence(crash, IMPACT_TUMBLE_DURATION - 0.001).state);
    expect(lying.riderPose.y).toBeLessThan(0.2);

    const standing = sampleCrashVisuals(
      stepCrashSequence(crash, IMPACT_TUMBLE_DURATION + STAND_UP_DURATION - 0.001).state
    );
    expect(standing.riderPose.y).toBeGreaterThan(rider.dims.hipHeight - 0.05);
    expect(Math.abs(standing.riderPose.pitch)).toBeLessThan(0.1);
  });

  it('swings the legs while running and finishes the remount on the seat', () => {
    const crash = startCrashSequence(100, 1.4, 30, 1.0, 800, rider);
    const runStart = IMPACT_TUMBLE_DURATION + STAND_UP_DURATION;
    const a = sampleCrashVisuals(stepCrashSequence(crash, runStart + RUN_TO_BIKE_DURATION * 0.4).state);
    expect(Math.abs(a.riderPose.legL.flex - a.riderPose.legR.flex)).toBeGreaterThan(0.2);

    const seated = sampleCrashVisuals(
      stepCrashSequence(crash, TOTAL_CRASH_DURATION - REMOUNT_DURATION * 0.36).state
    );
    expect(seated.riderPose.y).toBeCloseTo(rider.seatY, 1);
    expect(seated.riderRelZ).toBeCloseTo(rider.seatZ, 2);
    expect(seated.riderRelX).toBeCloseTo(0, 2);
  });
});
