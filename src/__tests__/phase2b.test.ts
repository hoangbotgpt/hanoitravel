import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  BIKES,
  OBSTACLE_TYPES,
  STAGES,
  getStageSpec,
  type ObstacleTypeId,
  type StageId
} from '../config/gameConfig.ts';
import {
  advanceToNextStage,
  completeCurrentStage,
  startNewGame
} from '../core/gameState.ts';
import {
  getStageRouteFeatures,
  getTrafficLightState
} from '../core/routeFeatures.ts';
import { isObstacleAllowedOnStage } from '../core/trafficRules.ts';
import {
  COLD_FINE_AMOUNTS,
  ColdFineTracker,
  settleColdFinesAtFinish
} from '../core/violations.ts';
import { TrafficSpawner, isPedestrianObstacle } from '../gameplay/trafficSpawner.ts';
import type { TrafficVisualPool } from '../world/trafficModels.ts';

function createMockPool(): TrafficVisualPool {
  return {
    acquire: () => {
      const g = new THREE.Group();
      const b1 = new THREE.Mesh();
      const b2 = new THREE.Mesh();
      b1.visible = false;
      b2.visible = false;
      g.userData.warningBlinkers = [b1, b2];
      return g;
    },
    release: () => {},
    setTaxiTemplate: () => {},
    setBusTemplate: () => {},
    setTruckTemplate: () => {},
    hasTaxiTemplate: () => true,
    hasCarTemplates: () => true,
    hasBusTemplate: () => true,
    hasTruckTemplate: () => true,
    hasHeavyTruckTemplate: () => true,
    dispose: () => {}
  } as unknown as TrafficVisualPool;
}

describe('Phase 2.0B — 9-Stage Campaign 1:1 Progression (FR-11, FR-12, FR-15..17)', () => {
  it('defines 9 stages ordered 6 -> 4 -> 2 lanes with 2000/5000/10000m lengths and 9 iconic destinations', () => {
    expect(STAGES).toHaveLength(9);
    expect(STAGES.map((s) => s.codeLabel)).toEqual([
      '1-1', '1-2', '1-3',
      '2-1', '2-2', '2-3',
      '3-1', '3-2', '3-3'
    ]);
    expect(STAGES.map((s) => s.laneCount)).toEqual([6, 6, 6, 4, 4, 4, 2, 2, 2]);
    expect(STAGES.map((s) => s.length)).toEqual([
      2000, 5000, 10000,
      2000, 5000, 10000,
      2000, 5000, 10000
    ]);
    expect(STAGES.map((s) => s.destinationKey)).toEqual([
      'my_dinh',
      'quan_su',
      'vinuni',
      'nha_hat_lon',
      'lang_bac',
      'cot_co',
      'nha_tho_lon',
      'ho_hoan_kiem',
      'ga_ha_noi'
    ]);
    expect(STAGES.map((s) => s.speedLimitKmh)).toEqual([
      70, 70, 70,
      60, 60, 60,
      45, 45, 45
    ]);
  });

  it('progresses cleanly across all 9 stages and enters victory only after Stage 9', () => {
    let state = startNewGame('honda', 'medium');
    expect(state.stageId).toBe(1);

    for (let id = 1 as StageId; id <= 9; id = (id + 1) as StageId) {
      expect(state.stageId).toBe(id);
      const outcome = completeCurrentStage(state);
      expect(outcome.completed).toBe(true);
      state = outcome.state;

      if (id < 9) {
        expect(outcome.isFinalStage).toBe(false);
        expect(state.screen).toBe('stage_clear');
        state = advanceToNextStage(state);
        expect(state.screen).toBe('playing');
        expect(state.stageId).toBe(id + 1);
      } else {
        expect(outcome.isFinalStage).toBe(true);
        expect(state.screen).toBe('victory');
      }
    }

    // Starting directly at Stage 6 (2-3) initializes cleanly
    const midStart = startNewGame('vinfast', 'easy', 6);
    expect(midStart.stageId).toBe(6);
    expect(midStart.stageIndex).toBe(5);
    expect(midStart.speed).toBe(BIKES.vinfast.minCruiseSpeed);
  });
});

describe('Phase 2.0B — FR-23 Road-Class Rules & FR-08 Reckless Motorbikes', () => {
  it('enforces allowedRoadClasses and minLevelInChapter across all 11 ObstacleTypeIds', () => {
    expect(OBSTACLE_TYPES.heavy_truck.allowedRoadClasses).toEqual([6]);
    expect(OBSTACLE_TYPES.truck.allowedRoadClasses).toEqual([6, 4]);
    expect(OBSTACLE_TYPES.bus.allowedRoadClasses).toEqual([6, 4]);
    expect(OBSTACLE_TYPES.flower_bike.allowedRoadClasses).toEqual([4, 2]);
    expect(OBSTACLE_TYPES.vendor.allowedRoadClasses).toEqual([4, 2]);
    expect(OBSTACLE_TYPES.tourist.allowedRoadClasses).toEqual([4, 2]);
    expect(OBSTACLE_TYPES.office_worker.allowedRoadClasses).toEqual([4, 2]);
    expect(OBSTACLE_TYPES.reckless_moto.minLevelInChapter).toBe(3);

    for (const stage of STAGES) {
      if (stage.laneCount === 6) {
        expect(isObstacleAllowedOnStage('heavy_truck', stage)).toBe(true);
        expect(isObstacleAllowedOnStage('truck', stage)).toBe(true);
        expect(isObstacleAllowedOnStage('bus', stage)).toBe(true);
        expect(isObstacleAllowedOnStage('flower_bike', stage)).toBe(false);
        expect(isObstacleAllowedOnStage('vendor', stage)).toBe(false);
        expect(isObstacleAllowedOnStage('tourist', stage)).toBe(false);
        expect(isObstacleAllowedOnStage('office_worker', stage)).toBe(false);
      } else if (stage.laneCount === 4) {
        expect(isObstacleAllowedOnStage('heavy_truck', stage)).toBe(false);
        expect(isObstacleAllowedOnStage('truck', stage)).toBe(true);
        expect(isObstacleAllowedOnStage('bus', stage)).toBe(true);
        expect(isObstacleAllowedOnStage('flower_bike', stage)).toBe(true);
        expect(isObstacleAllowedOnStage('vendor', stage)).toBe(true);
        expect(isObstacleAllowedOnStage('tourist', stage)).toBe(true);
        expect(isObstacleAllowedOnStage('office_worker', stage)).toBe(true);
      } else {
        expect(isObstacleAllowedOnStage('heavy_truck', stage)).toBe(false);
        expect(isObstacleAllowedOnStage('truck', stage)).toBe(false);
        expect(isObstacleAllowedOnStage('bus', stage)).toBe(false);
        expect(isObstacleAllowedOnStage('flower_bike', stage)).toBe(true);
        expect(isObstacleAllowedOnStage('vendor', stage)).toBe(true);
        expect(isObstacleAllowedOnStage('tourist', stage)).toBe(true);
        expect(isObstacleAllowedOnStage('office_worker', stage)).toBe(true);
      }

      // FR-08: reckless_moto strictly gated to Level 3 (stages 3, 6, 9)
      expect(isObstacleAllowedOnStage('reckless_moto', stage)).toBe(
        stage.levelInChapter === 3
      );
    }
  });

  it('spawns only road-class-legal vehicles & pedestrians across stages 1, 3, 4, 6, 7, 9', () => {
    const scene = new THREE.Scene();
    const spawner = new TrafficSpawner(scene, createMockPool());
    const testStages: StageId[] = [1, 3, 4, 6, 7, 9];

    for (const stageId of testStages) {
      const stage = getStageSpec(stageId);
      spawner.reset(stageId, 'hard');
      const seenTypes = new Set<ObstacleTypeId>();

      const recordVisible = () => {
        for (const obs of spawner.getActiveObstacles()) {
          seenTypes.add(obs.type);
          expect(isObstacleAllowedOnStage(obs.type, stage)).toBe(true);

          if (isPedestrianObstacle(obs.type)) {
            const features = getStageRouteFeatures(stageId);
            expect(obs.crosswalkId).not.toBeNull();
            const matched = features.crosswalks.find((cw) => cw.id === obs.crosswalkId);
            expect(matched).toBeDefined();
            expect(Math.abs(obs.distance - matched!.distance)).toBeLessThanOrEqual(3.5);
          }
        }
      };

      recordVisible();
      // Simulate a generous distance sweep along the stage
      const maxSimDist = Math.min(stage.length - 50, 2600);
      let dist = 0;
      let t = 0;
      const dt = 0.05;
      while (dist < maxSimDist) {
        spawner.update(dt, dist, t);
        recordVisible();
        dist += 28 * dt;
        t += dt;
      }

      if (stage.laneCount === 6) {
        expect(seenTypes.has('flower_bike')).toBe(false);
        expect(seenTypes.has('vendor')).toBe(false);
        expect(seenTypes.has('tourist')).toBe(false);
        expect(seenTypes.has('office_worker')).toBe(false);
      } else if (stage.laneCount === 4) {
        expect(seenTypes.has('heavy_truck')).toBe(false);
      } else {
        expect(seenTypes.has('heavy_truck')).toBe(false);
        expect(seenTypes.has('truck')).toBe(false);
        expect(seenTypes.has('bus')).toBe(false);
      }

      if (stage.levelInChapter < 3) {
        expect(seenTypes.has('reckless_moto')).toBe(false);
      }
    }

    spawner.dispose();
  });

  it('spawns reckless_moto on Level 3 stages and triggers 0.55s warning before weaving safely', () => {
    const scene = new THREE.Scene();
    const spawner = new TrafficSpawner(scene, createMockPool());
    let warningCount = 0;
    spawner.setRecklessWarningCallback(() => {
      warningCount += 1;
    });

    spawner.reset(3, 'hard');
    let sawReckless = false;
    let sawWeaveOrDone = false;

    let dist = 0;
    let t = 0;
    const dt = 0.05;
    while (dist < 4000) {
      spawner.update(dt, dist, t);
      for (const obs of spawner.getActiveObstacles()) {
        if (obs.type === 'reckless_moto') {
          sawReckless = true;
          if (obs.recklessPhase === 'weaving' || obs.recklessPhase === 'done') {
            sawWeaveOrDone = true;
          }
        }
      }
      if (sawReckless && sawWeaveOrDone && warningCount > 0) break;
      dist += 22 * dt;
      t += dt;
    }

    expect(sawReckless).toBe(true);
    expect(warningCount).toBeGreaterThan(0);
    expect(sawWeaveOrDone).toBe(true);

    spawner.dispose();
  });
});

describe('Phase 2.0B — FR-02 Intersections, Crosswalks & Cross-Traffic', () => {
  it('places 0 intersections/crosswalks on 6-lane stages and valid cycles on 4-lane & 2-lane stages', () => {
    for (const id of [1, 2, 3] as StageId[]) {
      const f = getStageRouteFeatures(id);
      expect(f.intersections).toHaveLength(0);
      expect(f.crosswalks).toHaveLength(0);
      expect(f.cameras.length).toBeGreaterThan(0);
    }

    for (const id of [4, 5, 6, 7, 8, 9] as StageId[]) {
      const f = getStageRouteFeatures(id);
      expect(f.intersections.length).toBeGreaterThan(0);
      expect(f.crosswalks.length).toBeGreaterThan(f.intersections.length);
      expect(f.cameras.length).toBeGreaterThan(0);
    }

    // Verify green (7s) -> yellow (2.5s) -> red (4.5s) cycle
    const zone = { ...getStageRouteFeatures(4).intersections[0], phaseOffset: 0 };
    expect(getTrafficLightState(zone, 0.5)).toBe('green');
    expect(getTrafficLightState(zone, 6.9)).toBe('green');
    expect(getTrafficLightState(zone, 7.1)).toBe('yellow');
    expect(getTrafficLightState(zone, 9.4)).toBe('yellow');
    expect(getTrafficLightState(zone, 9.6)).toBe('red');
    expect(getTrafficLightState(zone, 13.9)).toBe('red');
    expect(getTrafficLightState(zone, 14.1)).toBe('green');
  });

  it('emits perpendicular cross-traffic at 4-lane & 2-lane intersections during red lights and never on 6-lane', () => {
    const scene = new THREE.Scene();
    const spawner = new TrafficSpawner(scene, createMockPool());

    // Stage 1 (6-lane): never emits cross-traffic
    spawner.reset(1, 'medium');
    for (let t = 0; t < 16; t += 0.1) {
      spawner.update(0.1, 300, t);
      expect(spawner.getCrossTrafficCount()).toBe(0);
    }

    // Stage 4 (4-lane): intersection 0 is at 420m with phaseOffset 0 -> red during t in [9.5, 14.0]
    spawner.reset(4, 'medium');
    const zone0 = getStageRouteFeatures(4).intersections[0];
    expect(zone0.distance).toBe(420);
    let maxCrossTraffic = 0;
    for (let t = 9.6; t <= 13.5; t += 0.1) {
      spawner.update(0.1, 350, t);
      maxCrossTraffic = Math.max(maxCrossTraffic, spawner.getCrossTrafficCount());
    }
    expect(maxCrossTraffic).toBeGreaterThan(0);

    spawner.dispose();
  });
});

describe('Phase 2.0B — FR-09 Camera Phạt Nguội & Game Over Settlement', () => {
  it('records speeding, wrong_lane, and red_light violations once per gate without touching wallet mid-run', () => {
    const stage = getStageSpec(4); // 4-lane, speedLimitKmh = 60
    const features = getStageRouteFeatures(4);
    const tracker = new ColdFineTracker();

    const firstCam = features.cameras[0];
    const firstIntersection = features.intersections[0];

    // 1. Cross first camera over speed limit (72 > 60) AND in oncoming lane (-1.4)
    const camHits = tracker.evaluateFrame({
      prevDistance: firstCam.distance - 1,
      distance: firstCam.distance + 0.5,
      displayKmh: 72,
      lateralOffset: -1.4,
      elapsedTime: 2.0,
      stage,
      features
    });
    expect(camHits.map((v) => v.type).sort()).toEqual(['speeding', 'wrong_lane']);
    expect(tracker.getTotalAmount()).toBe(
      COLD_FINE_AMOUNTS.speeding + COLD_FINE_AMOUNTS.wrong_lane
    );

    // 2. Re-crossing the same camera distance does NOT duplicate fines
    const dupHits = tracker.evaluateFrame({
      prevDistance: firstCam.distance - 0.5,
      distance: firstCam.distance + 0.2,
      displayKmh: 75,
      lateralOffset: -1.4,
      elapsedTime: 2.5,
      stage,
      features
    });
    expect(dupHits).toHaveLength(0);

    // 3. Cross intersection stop line during red phase (elapsedTime = 11.0 with phaseOffset 0 -> red)
    const redHits = tracker.evaluateFrame({
      prevDistance: firstIntersection.stopLineDistance - 1,
      distance: firstIntersection.stopLineDistance + 0.5,
      displayKmh: 40,
      lateralOffset: 1.4,
      elapsedTime: 11.0,
      stage,
      features
    });
    expect(redHits).toHaveLength(1);
    expect(redHits[0].type).toBe('red_light');
    expect(redHits[0].amount).toBe(150_000);

    expect(tracker.getCount()).toBe(3);
    expect(tracker.getTotalAmount()).toBe(370_000);
  });

  it('settles cold fines at finish line and triggers GAME OVER when net balance <= 0 VND', () => {
    const tracker = new ColdFineTracker();
    // 100k + 120k + 150k + 150k = 520.000đ in cold fines
    tracker.recordViolation({ type: 'speeding', distanceMeters: 300, timestampSec: 12 });
    tracker.recordViolation({ type: 'wrong_lane', distanceMeters: 414, timestampSec: 18 });
    tracker.recordViolation({ type: 'red_light', distanceMeters: 410, timestampSec: 19 });
    tracker.recordViolation({ type: 'red_light', distanceMeters: 930, timestampSec: 36 });

    // Direct settlement helper boundary (rawBalance === 0 -> bankrupt)
    const exactZero = settleColdFinesAtFinish(300_000, 220_000, tracker.getViolations());
    expect(exactZero.totalColdFines).toBe(520_000);
    expect(exactZero.rawBalance).toBe(0);
    expect(exactZero.finalWallet).toBe(0);
    expect(exactZero.bankruptByColdFines).toBe(true);

    // Full GameSessionState finish flow: 'hard' starts at 250k + 200k*1.0 + 100k = 550k gross
    // Add one more 150k violation -> 670k total fines -> rawBalance = -120k <= 0 -> game_over!
    tracker.recordViolation({ type: 'red_light', distanceMeters: 1450, timestampSec: 52 });
    const playing = startNewGame('honda', 'hard', 1);
    expect(playing.wallet).toBe(250_000); // wallet untouched before finish

    const outcome = completeCurrentStage(playing, tracker.getViolations());
    expect(outcome.completed).toBe(true);
    expect(outcome.bankrupt).toBe(true);
    expect(outcome.state.screen).toBe('game_over');
    expect(outcome.state.wallet).toBe(0);
    expect(outcome.state.lastColdFineSettlement?.bankruptByColdFines).toBe(true);
    expect(outcome.state.lastColdFineSettlement?.totalColdFines).toBe(670_000);
    expect(outcome.state.lastColdFineSettlement?.violations).toHaveLength(5);

    // Clean run with affordable fine (100k) clears stage with reduced net reward
    const affordable = new ColdFineTracker();
    affordable.recordViolation({ type: 'speeding', distanceMeters: 450, timestampSec: 16 });
    const clearOutcome = completeCurrentStage(playing, affordable.getViolations());
    expect(clearOutcome.bankrupt).toBe(false);
    expect(clearOutcome.state.screen).toBe('stage_clear');
    expect(clearOutcome.state.wallet).toBe(250_000 + 300_000 - 100_000);
    expect(clearOutcome.state.lastColdFineSettlement?.netChange).toBe(200_000);
  });
});
