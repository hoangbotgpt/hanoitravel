import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  BIKES,
  OBSTACLE_TYPES,
  getStageSpec,
  type StageId
} from '../config/gameConfig.ts';
import {
  SHOP_CATALOG,
  createDefaultProfile,
  loadProfile,
  purchaseBike,
  type StorageLike
} from '../core/profileStore.ts';
import {
  getStageRouteFeatures,
  getTrafficLightState
} from '../core/routeFeatures.ts';
import {
  STOP_LINE_VISUAL_OFFSET,
  canIntersectionPedestrianCross,
  checkEntitiesOverlap2D,
  computeRedLightCapSpeed,
  resolveTrafficNonPenetration,
  type PhysicsCrossEntity,
  type PhysicsObstacleEntity
} from '../core/trafficPhysics.ts';
import { AudioManager, RGV_ENGINE_AUDIO_PATH } from '../gameplay/audioManager.ts';
import {
  TrafficSpawner,
  isPedestrianObstacle,
  type CrossTrafficVehicle
} from '../gameplay/trafficSpawner.ts';
import {
  createFallbackBike,
  extractBikeRig,
  setBikeBrakeLight,
  setBikeStoppedPose
} from '../world/bikeLoader.ts';
import { HanoiWorldManager } from '../world/worldManager.ts';
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

function createMemoryStorage(initial: Record<string, string> = {}): StorageLike {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    getItem(key: string): string | null {
      return store.has(key) ? (store.get(key) ?? null) : null;
    },
    setItem(key: string, value: string): void {
      store.set(key, value);
    }
  };
}

describe('Bug 1 — Red-Light Compliance & Intersection Pedestrian Waiting', () => {
  it('stops approaching forward & oncoming vehicles before the stop line on red and resumes on green', () => {
    const scene = new THREE.Scene();
    const spawner = new TrafficSpawner(scene, createMockPool());
    const features = getStageRouteFeatures(4);
    const zone0 = features.intersections[0]; // distance = 420, phaseOffset = 0 (green 0..7, yellow 7..9.5, red 9.5..14)
    const forwardStopLine = zone0.distance - STOP_LINE_VISUAL_OFFSET; // 408.4
    const oncomingStopLine = zone0.distance + STOP_LINE_VISUAL_OFFSET; // 431.6

    spawner.reset(4, 'medium');
    spawner.clearAll();
    // Deterministically spawn a forward car approaching 408.4 and an oncoming car approaching 431.6
    const trySpawn = (
      spawner as unknown as {
        trySpawnAtDistance: (
          spawnDist: number,
          preferOncoming?: boolean,
          forcedType?: 'car'
        ) => boolean;
      }
    ).trySpawnAtDistance.bind(spawner);
    expect(trySpawn(386, false, 'car')).toBe(true);
    expect(trySpawn(454, true, 'car')).toBe(true);

    const trackedForwardIds = new Set<number>();
    const trackedOncomingIds = new Set<number>();
    for (const obs of spawner.getActiveObstacles()) {
      if (isPedestrianObstacle(obs.type)) continue;
      const spec = OBSTACLE_TYPES[obs.type];
      if (obs.direction === 1 && obs.distance + spec.halfL < forwardStopLine && obs.distance > 350) {
        trackedForwardIds.add(obs.id);
      }
      if (obs.direction === -1 && obs.distance - spec.halfL > oncomingStopLine && obs.distance < 500) {
        trackedOncomingIds.add(obs.id);
      }
    }
    expect(trackedForwardIds.size).toBeGreaterThan(0);
    expect(trackedOncomingIds.size).toBeGreaterThan(0);

    // Step across the entire red light window [9.5s, 13.8s]
    expect(getTrafficLightState(zone0, 9.5)).toBe('red');
    expect(getTrafficLightState(zone0, 13.8)).toBe('red');
    for (let t = 9.5; t <= 13.8; t += 0.05) {
      spawner.update(0.05, 320, t);
    }

    const stoppedVehicles: Array<{ id: number; dir: 1 | -1; dist: number }> = [];
    for (const obs of spawner.getActiveObstacles()) {
      const spec = OBSTACLE_TYPES[obs.type];
      if (trackedForwardIds.has(obs.id)) {
        expect(obs.distance + spec.halfL).toBeLessThanOrEqual(forwardStopLine + 0.2);
        if (forwardStopLine - (obs.distance + spec.halfL) < 2.0) {
          expect(obs.currentSpeed).toBeLessThanOrEqual(0.5);
          stoppedVehicles.push({ id: obs.id, dir: 1, dist: obs.distance });
        }
      }
      if (trackedOncomingIds.has(obs.id)) {
        expect(obs.distance - spec.halfL).toBeGreaterThanOrEqual(oncomingStopLine - 0.2);
        if ((obs.distance - spec.halfL) - oncomingStopLine < 2.0) {
          expect(obs.currentSpeed).toBeLessThanOrEqual(0.5);
          stoppedVehicles.push({ id: obs.id, dir: -1, dist: obs.distance });
        }
      }
    }
    expect(stoppedVehicles.length).toBeGreaterThan(0);

    // Light turns green at t = 14.0 -> once cross-traffic clears box, stopped vehicles accelerate past 5 m/s
    expect(getTrafficLightState(zone0, 14.1)).toBe('green');
    expect(getTrafficLightState(zone0, 16.8)).toBe('green');
    for (let t = 14.05; t <= 16.8; t += 0.05) {
      spawner.update(0.05, 320, t);
    }

    for (const sv of stoppedVehicles) {
      const after = spawner.getActiveObstacles().find((o) => o.id === sv.id);
      if (after) {
        expect(after.currentSpeed).toBeGreaterThan(5);
      }
    }

    // Also verify direct computeRedLightCapSpeed math at stop line
    const capAtStop = computeRedLightCapSpeed({
      distance: forwardStopLine - 1.5,
      direction: 1,
      halfL: 1.5,
      desiredSpeed: 22,
      intersections: [zone0],
      elapsedTime: 10.5
    });
    expect(capAtStop.maxSpeed).toBe(0);
    expect(capAtStop.stopClampDist).toBeCloseTo(forwardStopLine - 1.5 - 0.25, 5);

    spawner.dispose();
  });

  it('holds intersection pedestrians on sidewalk during green/yellow and allows crossing on red', () => {
    const stage4 = getStageSpec(4);
    const roadHalfW = stage4.roadWidth * 0.5;
    const sidewalkLat = roadHalfW + 0.65;

    expect(canIntersectionPedestrianCross('green', sidewalkLat, roadHalfW)).toBe(false);
    expect(canIntersectionPedestrianCross('yellow', -sidewalkLat, roadHalfW)).toBe(false);
    expect(canIntersectionPedestrianCross('red', sidewalkLat, roadHalfW)).toBe(true);
    // Already mid-road: allowed to finish crossing
    expect(canIntersectionPedestrianCross('green', 1.2, roadHalfW)).toBe(true);

    const scene = new THREE.Scene();
    const spawner = new TrafficSpawner(scene, createMockPool());
    const features = getStageRouteFeatures(4);
    spawner.reset(4, 'hard');

    let observedSidewalkWaitOnGreenOrYellow = false;
    let observedCrossOnRed = false;

    let dist = 200;
    let t = 0;
    const dt = 0.05;
    while (dist < 1850) {
      spawner.update(dt, dist, t);
      for (const obs of spawner.getActiveObstacles()) {
        if (!isPedestrianObstacle(obs.type) || obs.intersectionId == null) continue;
        const zone = features.intersections.find((z) => z.id === obs.intersectionId);
        if (!zone) continue;
        const light = getTrafficLightState(zone, t);
        if ((light === 'green' || light === 'yellow') && obs.currentSpeed === 0) {
          expect(Math.abs(obs.lateralOffset)).toBeGreaterThanOrEqual(roadHalfW - 0.36);
          observedSidewalkWaitOnGreenOrYellow = true;
        }
        if (light === 'red' && obs.currentSpeed > 0) {
          observedCrossOnRed = true;
        }
      }
      if (observedSidewalkWaitOnGreenOrYellow && observedCrossOnRed) break;
      dist += 16 * dt;
      t += dt;
    }

    expect(observedSidewalkWaitOnGreenOrYellow).toBe(true);
    expect(observedCrossOnRed).toBe(true);

    spawner.dispose();
  });

  it('keeps 3D gantry lamp state locked to authoritative elapsedStageTime even when world dt drifts during crash recovery', () => {
    const scene = new THREE.Scene();
    const world = new HanoiWorldManager(scene);
    world.buildStage(4);

    const zone0 = getStageRouteFeatures(4).intersections[0];
    expect(getTrafficLightState(zone0, 0.5)).toBe('green');
    expect(getTrafficLightState(zone0, 10.5)).toBe('red');

    // Advance dt by 10.5s total while holding trafficElapsedTime at 0.5s (green): 3D lamp MUST stay green
    for (let i = 0; i < 210; i += 1) {
      world.update(zone0.distance - 30, 0.05, 0.5);
    }

    const ixGroup = scene.getObjectByName(`Intersection_${zone0.id}`) as THREE.Group | undefined;
    expect(ixGroup).toBeDefined();
    const redLamp = ixGroup?.getObjectByName('RedLamp') as THREE.Mesh | undefined;
    const greenLamp = ixGroup?.getObjectByName('GreenLamp') as THREE.Mesh | undefined;
    expect(redLamp).toBeDefined();
    expect(greenLamp).toBeDefined();
    expect((greenLamp?.material as THREE.MeshBasicMaterial).color.getHex()).toBe(0x22eb6e);
    expect((redLamp?.material as THREE.MeshBasicMaterial).color.getHex()).toBe(0x381010);

    // Switch trafficElapsedTime to 10.5s (red): 3D lamp MUST turn red
    world.update(zone0.distance - 30, 0.016, 10.5);
    expect((redLamp?.material as THREE.MeshBasicMaterial).color.getHex()).toBe(0xff2b2b);
    expect((greenLamp?.material as THREE.MeshBasicMaterial).color.getHex()).toBe(0x0e381c);

    world.disposeStage();
  });

  it('rejects spawning non-pedestrian vehicles inside an intersection box', () => {
    const scene = new THREE.Scene();
    const spawner = new TrafficSpawner(scene, createMockPool());
    spawner.reset(4, 'medium');
    spawner.clearAll();

    const zone0 = getStageRouteFeatures(4).intersections[0];
    const trySpawn = (
      spawner as unknown as {
        trySpawnAtDistance: (
          spawnDist: number,
          preferOncoming?: boolean,
          forcedType?: 'car'
        ) => boolean;
      }
    ).trySpawnAtDistance.bind(spawner);

    expect(trySpawn(zone0.distance, false, 'car')).toBe(false);
    expect(trySpawn(zone0.distance - 8, false, 'car')).toBe(false);
    expect(trySpawn(zone0.distance + 8, true, 'car')).toBe(false);

    spawner.dispose();
  });
});

describe('Bug 2 — Strict 2D Non-Penetration Physics Across Traffic, Pedestrians & Cross-Traffic', () => {
  it('maintains zero overlapping active obstacles or cross-traffic pairs across 1,500 frames on Stages 3, 4, and 7', () => {
    const scene = new THREE.Scene();
    const spawner = new TrafficSpawner(scene, createMockPool());
    const stages: StageId[] = [3, 4, 7];

    for (const stageId of stages) {
      spawner.reset(stageId, 'hard');
      let dist = 0;
      let t = 0;
      const dt = 0.033;

      for (let frame = 0; frame < 500; frame += 1) {
        spawner.update(dt, dist, t);

        const active = spawner.getActiveObstacles();
        const cross = (
          spawner as unknown as { crossTraffic: ReadonlyArray<CrossTrafficVehicle> }
        ).crossTraffic;

        // 1. Main-road entity vs main-road entity
        for (let i = 0; i < active.length; i += 1) {
          const a = active[i];
          const specA = OBSTACLE_TYPES[a.type];
          for (let j = i + 1; j < active.length; j += 1) {
            const b = active[j];
            const specB = OBSTACLE_TYPES[b.type];
            const overlaps = checkEntitiesOverlap2D(
              {
                lateralOffset: a.lateralOffset,
                distance: a.distance,
                halfW: specA.halfW,
                halfL: specA.halfL
              },
              {
                lateralOffset: b.lateralOffset,
                distance: b.distance,
                halfW: specB.halfW,
                halfL: specB.halfL
              },
              -0.05,
              -0.05
            );
            expect(overlaps).toBe(false);
          }
        }

        // 2. Cross-traffic vs cross-traffic (rotated 90 deg: halfX = halfL, halfZ = halfW)
        for (let i = 0; i < cross.length; i += 1) {
          const a = cross[i];
          const specA = OBSTACLE_TYPES[a.type];
          for (let j = i + 1; j < cross.length; j += 1) {
            const b = cross[j];
            const specB = OBSTACLE_TYPES[b.type];
            const overlaps = checkEntitiesOverlap2D(
              {
                lateralOffset: a.lateralOffset,
                distance: a.distance,
                halfW: specA.halfL,
                halfL: specA.halfW
              },
              {
                lateralOffset: b.lateralOffset,
                distance: b.distance,
                halfW: specB.halfL,
                halfL: specB.halfW
              },
              -0.05,
              -0.05
            );
            expect(overlaps).toBe(false);
          }

          // 3. Cross-traffic vs main-road entity
          for (const obs of active) {
            const obsSpec = OBSTACLE_TYPES[obs.type];
            const overlaps = checkEntitiesOverlap2D(
              {
                lateralOffset: a.lateralOffset,
                distance: a.distance,
                halfW: specA.halfL,
                halfL: specA.halfW
              },
              {
                lateralOffset: obs.lateralOffset,
                distance: obs.distance,
                halfW: obsSpec.halfW,
                halfL: obsSpec.halfL
              },
              -0.05,
              -0.05
            );
            expect(overlaps).toBe(false);
          }
        }

        dist += 24 * dt;
        t += dt;
      }
    }

    spawner.dispose();
  });

  it('separates crafted overlapping same-dir, opposite-dir, and cross-main pairs via resolveTrafficNonPenetration', () => {
    const obstacles: PhysicsObstacleEntity[] = [
      {
        id: 1,
        type: 'car',
        laneIndex: 2,
        direction: 1,
        distance: 420,
        lateralOffset: 1.4,
        crossDir: 1,
        speed: 24,
        currentSpeed: 10
      },
      {
        id: 2,
        type: 'motorbike',
        laneIndex: 2,
        direction: 1,
        distance: 419.2,
        lateralOffset: 1.4,
        crossDir: 1,
        speed: 22,
        currentSpeed: 22
      },
      {
        id: 3,
        type: 'vendor',
        laneIndex: 2,
        direction: 1,
        distance: 420.1,
        lateralOffset: 1.5,
        crossDir: 1,
        speed: 0,
        currentSpeed: 1.6
      }
    ];
    const cross: PhysicsCrossEntity[] = [
      {
        id: 4,
        type: 'car',
        intersectionId: 1,
        distance: 420,
        lateralOffset: 1.3,
        crossDir: 1,
        speed: 11,
        currentSpeed: 11
      }
    ];

    resolveTrafficNonPenetration(obstacles, cross, 13.5);

    const car = obstacles[0];
    const moto = obstacles[1];
    const ped = obstacles[2];
    const ct = cross[0];

    expect(
      checkEntitiesOverlap2D(
        { lateralOffset: car.lateralOffset, distance: car.distance, halfW: OBSTACLE_TYPES.car.halfW, halfL: OBSTACLE_TYPES.car.halfL },
        { lateralOffset: moto.lateralOffset, distance: moto.distance, halfW: OBSTACLE_TYPES.motorbike.halfW, halfL: OBSTACLE_TYPES.motorbike.halfL }
      )
    ).toBe(false);
    expect(
      checkEntitiesOverlap2D(
        { lateralOffset: car.lateralOffset, distance: car.distance, halfW: OBSTACLE_TYPES.car.halfW, halfL: OBSTACLE_TYPES.car.halfL },
        { lateralOffset: ped.lateralOffset, distance: ped.distance, halfW: OBSTACLE_TYPES.vendor.halfW, halfL: OBSTACLE_TYPES.vendor.halfL }
      )
    ).toBe(false);
    expect(
      checkEntitiesOverlap2D(
        { lateralOffset: ct.lateralOffset, distance: ct.distance, halfW: OBSTACLE_TYPES.car.halfL, halfL: OBSTACLE_TYPES.car.halfW },
        { lateralOffset: car.lateralOffset, distance: car.distance, halfW: OBSTACLE_TYPES.car.halfW, halfL: OBSTACLE_TYPES.car.halfL }
      )
    ).toBe(false);
  });
});

describe('Feature 3 — Rearview Mirror Threat Detection', () => {
  it('detects forward vehicles & reckless motorbikes within 55m behind playerDist and returns inactive when clear', () => {
    const scene = new THREE.Scene();
    const spawner = new TrafficSpawner(scene, createMockPool());
    spawner.reset(3, 'hard');

    // Immediately after reset, all initial traffic is ahead of 0m -> no rear threat
    const clear = spawner.getRearThreatInfo(0, 4.8);
    expect(clear.active).toBe(false);
    expect(clear.distanceMeters).toBe(0);

    // Advance until at least one forward vehicle / reckless_moto is within [1.5, 55]m behind player
    let detectedBehind = false;
    let dist = 0;
    let t = 0;
    const dt = 0.05;
    while (dist < 1500) {
      spawner.update(dt, dist, t);
      const threat = spawner.getRearThreatInfo(dist, 4.8);
      if (threat.active) {
        expect(threat.distanceMeters).toBeGreaterThan(0);
        expect(threat.distanceMeters).toBeLessThanOrEqual(55);
        expect(Number.isFinite(threat.lateralDelta)).toBe(true);
        detectedBehind = true;
        break;
      }
      dist += 24 * dt;
      t += dt;
    }

    expect(detectedBehind).toBe(true);
    spawner.dispose();
  });
});

describe('Feature 4 — Suzuki RGV 120 (Xì Po) Shop Purchase, 2-Stroke Audio & Rig', () => {
  it('exposes suzuki_rgv as available for 500.000đ in SHOP_CATALOG and enforces careerWallet purchase', () => {
    const rgvItem = SHOP_CATALOG.find((item) => item.id === 'suzuki_rgv');
    expect(rgvItem).toBeDefined();
    expect(rgvItem?.engineType).toBe('two_stroke');
    expect(rgvItem?.status).toBe('available');
    expect(rgvItem?.priceVnd).toBe(500_000);

    const storage = createMemoryStorage();
    const poorProfile = { ...createDefaultProfile(), careerWallet: 350_000 };
    const failed = purchaseBike(poorProfile, 'suzuki_rgv', 500_000, storage);
    expect(failed.purchased).toBe(false);
    expect(failed.reason).toBe('insufficient_funds');
    expect(failed.profile.careerWallet).toBe(350_000);
    expect(failed.profile.ownedBikes).not.toContain('suzuki_rgv');

    const richProfile = { ...createDefaultProfile(), careerWallet: 750_000 };
    const success = purchaseBike(richProfile, 'suzuki_rgv', 500_000, storage);
    expect(success.purchased).toBe(true);
    expect(success.profile.careerWallet).toBe(250_000);
    expect(success.profile.ownedBikes).toContain('suzuki_rgv');
    expect(success.profile.selectedBikeId).toBe('suzuki_rgv');

    // Persists across loadProfile and rejects duplicate purchase
    const reloaded = loadProfile(storage);
    expect(reloaded.ownedBikes).toContain('suzuki_rgv');
    expect(reloaded.selectedBikeId).toBe('suzuki_rgv');
    expect(reloaded.careerWallet).toBe(250_000);

    const dup = purchaseBike(reloaded, 'suzuki_rgv', 500_000, storage);
    expect(dup.purchased).toBe(false);
    expect(dup.reason).toBe('already_owned');
  });

  it('synthesizes 2-stroke idle gain > 0.03, steps 6 gears, and ships real RGV MP3 sample', () => {
    const rootDir = fileURLToPath(new URL('../../', import.meta.url));
    const mp3Path = path.join(rootDir, 'public', RGV_ENGINE_AUDIO_PATH);
    expect(RGV_ENGINE_AUDIO_PATH).toBe('/assets/audio/suzuki_rgv_engine.mp3');
    expect(fs.existsSync(mp3Path)).toBe(true);
    expect(fs.statSync(mp3Path).size).toBeGreaterThan(100_000);

    expect(BIKES.suzuki_rgv.engineProfile).toBe('two_stroke');
    expect(BIKES.suzuki_rgv.displayMaxKmh).toBeGreaterThan(BIKES.honda.displayMaxKmh);

    const audio = new AudioManager();
    expect(audio.hasRgvAudioSample()).toBe(false);
    audio.setEngineProfile('two_stroke');
    expect(audio.getEngineProfile()).toBe('two_stroke');

    audio.updateEngine(0, true, { speed: 0, isBraking: false });
    const idle = audio.getEngineTelemetry();
    expect(idle.profile).toBe('two_stroke');
    expect(idle.active).toBe(true);
    expect(idle.estimatedGain).toBeGreaterThan(0.03);
    expect(idle.gear).toBe(1);

    const gears: number[] = [];
    for (const ratio of [0.08, 0.25, 0.42, 0.6, 0.78, 0.94]) {
      audio.updateEngine(ratio, true, { speed: ratio * 74, isBraking: false });
      const t = audio.getEngineTelemetry();
      gears.push(t.gear);
      expect(t.estimatedGain).toBeGreaterThan(0.05);
    }
    expect(gears).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('builds a valid BikeRigHandles + BrakeLight on createFallbackBike(suzuki_rgv)', () => {
    const bike = createFallbackBike('suzuki_rgv');
    const handles = extractBikeRig(bike);

    expect(handles.bikeAssembly).toBeDefined();
    expect(handles.seatedRider).not.toBeNull();
    expect(handles.standingRider).not.toBeNull();
    expect(handles.deliveryBox).not.toBeNull();
    expect(handles.brakeLight).not.toBeNull();

    setBikeBrakeLight(handles, true);
    expect(handles.brakeLight?.glowMesh.visible).toBe(true);
    expect(handles.brakeLight?.lensMaterial.emissiveIntensity).toBeGreaterThanOrEqual(3);

    setBikeBrakeLight(handles, false);
    expect(handles.brakeLight?.glowMesh.visible).toBe(false);

    setBikeStoppedPose(handles, true);
    expect(handles.bikeAssembly.rotation.z).not.toBe(0);
    setBikeStoppedPose(handles, false);
    expect(handles.bikeAssembly.rotation.z).toBe(0);
  });
});
