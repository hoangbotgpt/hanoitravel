import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  BIKES,
  DIFFICULTIES,
  GAME_HEIGHT,
  GAME_WIDTH,
  INVULNERABILITY_SECONDS,
  LANES,
  OBSTACLE_TYPES,
  PLAYER_HALF_L,
  PLAYER_HALF_W,
  ROAD_WIDTH,
  STAGES
} from '../config/gameConfig';

const ROOT_DIR = fileURLToPath(new URL('../../', import.meta.url));
const EXPECTED_HONDA_SRC_BYTES = 41612256;
const EXPECTED_VINFAST_SRC_BYTES = 42196744;
const EXPECTED_DRIVER_SRC_BYTES = 24440696;
const EXPECTED_TAXI_SRC_BYTES = 246680;
const EXPECTED_BUS_SRC_BYTES = 9539644;
const EXPECTED_TRUCK_SRC_BYTES = 4093104;
const MAX_OPTIMIZED_MODELS_BYTES = 6 * 1024 * 1024; // 6 MiB gate

describe('gameConfig & asset invariants', () => {
  it('enforces 1280x720 strict 16:9 viewport constants and valid lanes', () => {
    expect(GAME_WIDTH).toBe(1280);
    expect(GAME_HEIGHT).toBe(720);
    expect(GAME_WIDTH / GAME_HEIGHT).toBeCloseTo(16 / 9, 6);

    expect(INVULNERABILITY_SECONDS).toBe(1.2);
    expect(PLAYER_HALF_W).toBeGreaterThan(0);
    expect(PLAYER_HALF_L).toBeGreaterThan(0);
    expect(ROAD_WIDTH).toBeGreaterThan(10);
    expect(LANES).toHaveLength(4);

    for (const laneX of LANES) {
      expect(Math.abs(laneX) + PLAYER_HALF_W).toBeLessThan(ROAD_WIDTH / 2);
    }
  });

  it('defines 3 Road Rash stages A->B with 2/4/6-lane road classes, valid obstacles, and positive lengths', () => {
    expect(STAGES).toHaveLength(3);
    expect(STAGES.map((s) => s.id)).toEqual([1, 2, 3]);

    const themes = new Set(STAGES.map((s) => s.theme));
    expect(themes.size).toBe(3);

    expect(STAGES[0].laneCount).toBe(2);
    expect(STAGES[0].roadWidth).toBeCloseTo(7.4, 2);
    expect(STAGES[0].lanes).toHaveLength(2);

    expect(STAGES[1].laneCount).toBe(4);
    expect(STAGES[1].roadWidth).toBeCloseTo(13.5, 2);
    expect(STAGES[1].lanes).toHaveLength(4);

    expect(STAGES[2].laneCount).toBe(6);
    expect(STAGES[2].roadWidth).toBeCloseTo(20.4, 2);
    expect(STAGES[2].lanes).toHaveLength(6);

    const s3Weights = STAGES[2].obstacleWeights;
    const s3Total = Object.values(s3Weights).reduce((acc, w) => acc + (w ?? 0), 0);
    const s3Heavy = (s3Weights.car ?? 0) + (s3Weights.bus ?? 0) + (s3Weights.truck ?? 0);
    expect(s3Heavy / Math.max(1, s3Total)).toBeGreaterThanOrEqual(0.75);

    for (const stage of STAGES) {
      expect(stage.length).toBeGreaterThanOrEqual(1000);
      expect(stage.fromLabel.length).toBeGreaterThan(0);
      expect(stage.toLabel.length).toBeGreaterThan(0);
      expect(stage.fromLabel).not.toBe(stage.toLabel);
      expect(stage.taxiCountPerStage).toBeGreaterThanOrEqual(2);
      expect(stage.taxiCountPerStage).toBeLessThanOrEqual(3);
      expect(stage.allowedObstacles).toContain('taxi');
      expect(stage.allowedObstacles.length).toBeGreaterThanOrEqual(4);
      for (const lx of stage.lanes) {
        expect(Math.abs(lx) + PLAYER_HALF_W).toBeLessThan(stage.roadWidth / 2);
      }
      for (const obsId of stage.allowedObstacles) {
        expect(OBSTACLE_TYPES[obsId]).toBeDefined();
      }
    }
  });

  it('defines 2 distinct motorbikes (Honda & VinFast) pointing to optimized web GLBs', () => {
    expect(Object.keys(BIKES).sort()).toEqual(['honda', 'vinfast']);
    expect(BIKES.honda.modelPath).toBe('/assets/models/honda.glb');
    expect(BIKES.vinfast.modelPath).toBe('/assets/models/vinfast.glb');

    expect(BIKES.honda.maxSpeed).not.toBe(BIKES.vinfast.maxSpeed);
    expect(BIKES.honda.accel).not.toBe(BIKES.vinfast.accel);
    expect(BIKES.honda.handling).not.toBe(BIKES.vinfast.handling);

    for (const bike of Object.values(BIKES)) {
      expect(bike.maxSpeed).toBeGreaterThan(bike.minCruiseSpeed);
      expect(bike.accel).toBeGreaterThan(0);
      expect(bike.brakeDecel).toBeGreaterThan(0);
      expect(bike.handling).toBeGreaterThan(0);
      expect(bike.leanMax).toBeGreaterThan(0);
    }
  });

  it('defines all 7 Hanoi traffic & obstacle types including VF e34 taxi and cargo truck', () => {
    expect(Object.keys(OBSTACLE_TYPES).sort()).toEqual([
      'bus',
      'car',
      'flower_bike',
      'motorbike',
      'taxi',
      'truck',
      'vendor'
    ]);

    for (const obs of Object.values(OBSTACLE_TYPES)) {
      expect(obs.penalty).toBeGreaterThan(0);
      expect(obs.halfW).toBeGreaterThan(0);
      expect(obs.halfL).toBeGreaterThan(0);
    }
    expect(OBSTACLE_TYPES.vendor.crossSpeed).toBeGreaterThan(0);
    expect(OBSTACLE_TYPES.bus.penalty).toBeGreaterThan(OBSTACLE_TYPES.car.penalty);

    // Strict real-world hierarchy: 45-seat bus > 1.9T truck >> 5-seat taxi, fitting lanes cleanly
    expect(OBSTACLE_TYPES.bus.halfW).toBeGreaterThan(OBSTACLE_TYPES.truck.halfW);
    expect(OBSTACLE_TYPES.truck.halfW).toBeGreaterThan(OBSTACLE_TYPES.taxi.halfW);
    expect(OBSTACLE_TYPES.bus.halfL).toBeGreaterThan(OBSTACLE_TYPES.truck.halfL * 1.5);
    expect(OBSTACLE_TYPES.truck.halfL).toBeGreaterThan(OBSTACLE_TYPES.taxi.halfL * 1.5);
    expect(OBSTACLE_TYPES.bus.halfW * 2).toBeLessThan(2.8);
    expect(OBSTACLE_TYPES.truck.halfW * 2).toBeLessThan(2.5);
  });

  it('differentiates Easy, Medium, and Hard difficulty presets consistently', () => {
    expect(Object.keys(DIFFICULTIES).sort()).toEqual(['easy', 'hard', 'medium']);
    const { easy, medium, hard } = DIFFICULTIES;

    expect(easy.startingWallet).toBeGreaterThan(medium.startingWallet);
    expect(medium.startingWallet).toBeGreaterThan(hard.startingWallet);

    expect(easy.spawnInterval).toBeGreaterThan(medium.spawnInterval);
    expect(medium.spawnInterval).toBeGreaterThan(hard.spawnInterval);

    expect(easy.maxActiveObstacles).toBeLessThan(medium.maxActiveObstacles);
    expect(medium.maxActiveObstacles).toBeLessThan(hard.maxActiveObstacles);

    expect(easy.trafficSpeedScale).toBeLessThan(medium.trafficSpeedScale);
    expect(medium.trafficSpeedScale).toBeLessThan(hard.trafficSpeedScale);

    expect(easy.penaltyMultiplier).toBeLessThan(medium.penaltyMultiplier);
    expect(medium.penaltyMultiplier).toBeLessThan(hard.penaltyMultiplier);
  });

  it('preserves original Models/ GLBs untouched at exact byte sizes', () => {
    const hondaSrc = path.join(ROOT_DIR, 'Models', 'honda.glb');
    const vinfastSrc = path.join(ROOT_DIR, 'Models', 'vinfast', 'model.glb');
    const driverSrc = path.join(ROOT_DIR, 'Models', 'driver.glb');
    const taxiSrc = path.join(ROOT_DIR, 'Models', 'VF_e34_Taxi.glb');
    const busSrc = path.join(ROOT_DIR, 'Models', 'xe_buyt.glb');
    const truckSrc = path.join(ROOT_DIR, 'Models', 'xe_tai_canter.glb');
    if (!fs.existsSync(path.join(ROOT_DIR, 'Models'))) {
      return;
    }

    expect(fs.existsSync(hondaSrc)).toBe(true);
    expect(fs.existsSync(vinfastSrc)).toBe(true);
    expect(fs.existsSync(driverSrc)).toBe(true);
    expect(fs.existsSync(taxiSrc)).toBe(true);
    expect(fs.existsSync(busSrc)).toBe(true);
    expect(fs.existsSync(truckSrc)).toBe(true);
    expect(fs.statSync(hondaSrc).size).toBe(EXPECTED_HONDA_SRC_BYTES);
    expect(fs.statSync(vinfastSrc).size).toBe(EXPECTED_VINFAST_SRC_BYTES);
    expect(fs.statSync(driverSrc).size).toBe(EXPECTED_DRIVER_SRC_BYTES);
    expect(fs.statSync(taxiSrc).size).toBe(EXPECTED_TAXI_SRC_BYTES);
    expect(fs.statSync(busSrc).size).toBe(EXPECTED_BUS_SRC_BYTES);
    expect(fs.statSync(truckSrc).size).toBe(EXPECTED_TRUCK_SRC_BYTES);
  });

  it('ships optimized Honda, VinFast, Driver, Taxi, Bus, and Truck GLBs + Draco decoders within <= 6 MB total', () => {
    const modelsDir = path.join(ROOT_DIR, 'public', 'assets', 'models');
    const dracoDir = path.join(ROOT_DIR, 'public', 'assets', 'draco');
    const modelFiles = [
      'honda.glb',
      'vinfast.glb',
      'driver.glb',
      'vf_e34_taxi.glb',
      'xe_buyt.glb',
      'xe_tai_canter.glb'
    ];

    expect(fs.existsSync(path.join(dracoDir, 'draco_decoder.wasm'))).toBe(true);
    expect(fs.existsSync(path.join(dracoDir, 'draco_wasm_wrapper.js'))).toBe(true);

    let totalBytes = 0;
    for (const filename of modelFiles) {
      const fullPath = path.join(modelsDir, filename);
      expect(fs.existsSync(fullPath)).toBe(true);
      const size = fs.statSync(fullPath).size;
      expect(size).toBeGreaterThan(1024);
      totalBytes += size;
    }
    expect(totalBytes).toBeLessThanOrEqual(MAX_OPTIMIZED_MODELS_BYTES);
  });
});
