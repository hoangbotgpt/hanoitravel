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
const EXPECTED_SUZUKI_RGV_SRC_BYTES = 1524664;
const EXPECTED_MY_DINH_SRC_BYTES = 2759060;
const EXPECTED_MILITARY_MUSEUM_SRC_BYTES = 928628;
const EXPECTED_VINUNI_SRC_BYTES = 1539880;
const EXPECTED_NHA_HAT_LON_SRC_BYTES = 1422408;
const EXPECTED_LANG_BAC_SRC_BYTES = 451640;
const EXPECTED_COT_CO_SRC_BYTES = 719084;
const EXPECTED_NHA_THO_LON_SRC_BYTES = 712512;
const EXPECTED_THAP_RUA_SRC_BYTES = 603160;
const EXPECTED_GA_HA_NOI_SRC_BYTES = 4155468;
const EXPECTED_GSXS_SRC_BYTES = 301436;
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

  it('defines 9 Ver 2.0 stages A->B ordered 6 -> 4 -> 2 lanes with 2/5/10 km real-time lengths', () => {
    expect(STAGES).toHaveLength(9);
    expect(STAGES.map((s) => s.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(STAGES.map((s) => s.laneCount)).toEqual([6, 6, 6, 4, 4, 4, 2, 2, 2]);
    expect(STAGES.map((s) => s.length)).toEqual([
      2000, 5000, 10000,
      2000, 5000, 10000,
      2000, 5000, 10000
    ]);

    const themes = new Set(STAGES.map((s) => s.theme));
    expect(themes.size).toBe(3);

    // Chapter 1 (6 lanes, 20.4m)
    for (const s of STAGES.slice(0, 3)) {
      expect(s.chapter).toBe(1);
      expect(s.laneCount).toBe(6);
      expect(s.roadWidth).toBeCloseTo(20.4, 2);
      expect(s.lanes).toHaveLength(6);
      expect(s.hasIntersections).toBe(false);
    }

    // Chapter 2 (4 lanes, 13.5m)
    for (const s of STAGES.slice(3, 6)) {
      expect(s.chapter).toBe(2);
      expect(s.laneCount).toBe(4);
      expect(s.roadWidth).toBeCloseTo(13.5, 2);
      expect(s.lanes).toHaveLength(4);
      expect(s.hasIntersections).toBe(true);
    }

    // Chapter 3 (2 lanes, 7.4m)
    for (const s of STAGES.slice(6, 9)) {
      expect(s.chapter).toBe(3);
      expect(s.laneCount).toBe(2);
      expect(s.roadWidth).toBeCloseTo(7.4, 2);
      expect(s.lanes).toHaveLength(2);
      expect(s.hasIntersections).toBe(true);
    }

    const s1Weights = STAGES[0].obstacleWeights;
    const s1Total = Object.values(s1Weights).reduce((acc, w) => acc + (w ?? 0), 0);
    const s1Heavy =
      (s1Weights.car ?? 0) +
      (s1Weights.bus ?? 0) +
      (s1Weights.truck ?? 0) +
      (s1Weights.heavy_truck ?? 0);
    expect(s1Heavy / Math.max(1, s1Total)).toBeGreaterThanOrEqual(0.75);

    for (const stage of STAGES) {
      expect(stage.length).toBeGreaterThanOrEqual(2000);
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

  it('defines 4 distinct motorbikes (Honda, VinFast, Suzuki RGV 120 & Suzuki GSX-S) pointing to optimized web GLBs', () => {
    expect(Object.keys(BIKES).sort()).toEqual([
      'honda',
      'suzuki_gsxs',
      'suzuki_rgv',
      'vinfast'
    ]);
    expect(BIKES.honda.modelPath).toBe('/assets/models/honda.glb');
    expect(BIKES.vinfast.modelPath).toBe('/assets/models/vinfast.glb');
    expect(BIKES.suzuki_rgv.modelPath).toBe('/assets/models/suzuki_rgv.glb');
    expect(BIKES.suzuki_gsxs.modelPath).toBe('/assets/models/suzuki_gsxs.glb');

    expect(BIKES.honda.maxSpeed).not.toBe(BIKES.vinfast.maxSpeed);
    expect(BIKES.suzuki_rgv.maxSpeed).toBeGreaterThan(BIKES.vinfast.maxSpeed);
    expect(BIKES.suzuki_gsxs.maxSpeed).toBeGreaterThan(BIKES.suzuki_rgv.maxSpeed);
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

  it('defines all 11 Hanoi traffic, pedestrian & heavy obstacle types with valid road classes', () => {
    expect(Object.keys(OBSTACLE_TYPES).sort()).toEqual([
      'bus',
      'car',
      'flower_bike',
      'heavy_truck',
      'motorbike',
      'office_worker',
      'reckless_moto',
      'taxi',
      'tourist',
      'truck',
      'vendor'
    ]);

    for (const obs of Object.values(OBSTACLE_TYPES)) {
      expect(obs.penalty).toBeGreaterThan(0);
      expect(obs.halfW).toBeGreaterThan(0);
      expect(obs.halfL).toBeGreaterThan(0);
      expect(obs.allowedRoadClasses.length).toBeGreaterThan(0);
    }
    expect(OBSTACLE_TYPES.vendor.crossSpeed).toBeGreaterThan(0);
    expect(OBSTACLE_TYPES.tourist.crossSpeed).toBeGreaterThan(0);
    expect(OBSTACLE_TYPES.office_worker.crossSpeed).toBeGreaterThan(0);
    expect(OBSTACLE_TYPES.bus.penalty).toBeGreaterThan(OBSTACLE_TYPES.car.penalty);

    // Strict real-world hierarchy: 45-seat bus > heavy_truck > 1.9T truck >> 5-seat taxi, fitting lanes cleanly
    expect(OBSTACLE_TYPES.bus.halfW).toBeGreaterThan(OBSTACLE_TYPES.truck.halfW);
    expect(OBSTACLE_TYPES.heavy_truck.halfW).toBeGreaterThan(OBSTACLE_TYPES.truck.halfW);
    expect(OBSTACLE_TYPES.truck.halfW).toBeGreaterThan(OBSTACLE_TYPES.taxi.halfW);
    expect(OBSTACLE_TYPES.bus.halfL).toBeGreaterThan(OBSTACLE_TYPES.truck.halfL * 1.5);
    expect(OBSTACLE_TYPES.heavy_truck.halfL).toBeGreaterThan(OBSTACLE_TYPES.truck.halfL);
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
    const rgvSrc = path.join(ROOT_DIR, 'Models', 'suzuky-rgv.glb');
    const myDinhSrc = path.join(ROOT_DIR, 'Models', 'my_dinh_stadium.glb');
    const museumSrc = path.join(ROOT_DIR, 'Models', 'military_museum.glb');
    const vinuniSrc = path.join(ROOT_DIR, 'Models', 'vinuni_campus.glb');
    const nhaHatLonSrc = path.join(ROOT_DIR, 'Models', 'NhaHatLon_ChiTiet_Game_Draco.glb');
    const langBacSrc = path.join(ROOT_DIR, 'Models', 'LangBac_Game.glb');
    const cotCoSrc = path.join(ROOT_DIR, 'Models', 'CotCoHaNoi_Game.glb');
    const nhaThoLonSrc = path.join(ROOT_DIR, 'Models', 'NhaThoLon_Game_Draco.glb');
    const thapRuaSrc = path.join(ROOT_DIR, 'Models', 'ThapRua_Game_Draco.glb');
    const gaHaNoiSrc = path.join(ROOT_DIR, 'Models', 'GaHaNoiCo_Game.glb');
    const gsxSSrc = path.join(ROOT_DIR, 'Models', 'GSX_S.glb');
    if (!fs.existsSync(path.join(ROOT_DIR, 'Models'))) {
      return;
    }

    expect(fs.existsSync(hondaSrc)).toBe(true);
    expect(fs.existsSync(vinfastSrc)).toBe(true);
    expect(fs.existsSync(driverSrc)).toBe(true);
    expect(fs.existsSync(taxiSrc)).toBe(true);
    expect(fs.existsSync(busSrc)).toBe(true);
    expect(fs.existsSync(truckSrc)).toBe(true);
    expect(fs.existsSync(rgvSrc)).toBe(true);
    expect(fs.existsSync(myDinhSrc)).toBe(true);
    expect(fs.existsSync(museumSrc)).toBe(true);
    expect(fs.existsSync(vinuniSrc)).toBe(true);
    expect(fs.existsSync(nhaHatLonSrc)).toBe(true);
    expect(fs.existsSync(langBacSrc)).toBe(true);
    expect(fs.existsSync(cotCoSrc)).toBe(true);
    expect(fs.existsSync(nhaThoLonSrc)).toBe(true);
    expect(fs.existsSync(thapRuaSrc)).toBe(true);
    expect(fs.existsSync(gaHaNoiSrc)).toBe(true);
    expect(fs.existsSync(gsxSSrc)).toBe(true);
    expect(fs.statSync(hondaSrc).size).toBe(EXPECTED_HONDA_SRC_BYTES);
    expect(fs.statSync(vinfastSrc).size).toBe(EXPECTED_VINFAST_SRC_BYTES);
    expect(fs.statSync(driverSrc).size).toBe(EXPECTED_DRIVER_SRC_BYTES);
    expect(fs.statSync(taxiSrc).size).toBe(EXPECTED_TAXI_SRC_BYTES);
    expect(fs.statSync(busSrc).size).toBe(EXPECTED_BUS_SRC_BYTES);
    expect(fs.statSync(truckSrc).size).toBe(EXPECTED_TRUCK_SRC_BYTES);
    expect(fs.statSync(rgvSrc).size).toBe(EXPECTED_SUZUKI_RGV_SRC_BYTES);
    expect(fs.statSync(myDinhSrc).size).toBe(EXPECTED_MY_DINH_SRC_BYTES);
    expect(fs.statSync(museumSrc).size).toBe(EXPECTED_MILITARY_MUSEUM_SRC_BYTES);
    expect(fs.statSync(vinuniSrc).size).toBe(EXPECTED_VINUNI_SRC_BYTES);
    expect(fs.statSync(nhaHatLonSrc).size).toBe(EXPECTED_NHA_HAT_LON_SRC_BYTES);
    expect(fs.statSync(langBacSrc).size).toBe(EXPECTED_LANG_BAC_SRC_BYTES);
    expect(fs.statSync(cotCoSrc).size).toBe(EXPECTED_COT_CO_SRC_BYTES);
    expect(fs.statSync(nhaThoLonSrc).size).toBe(EXPECTED_NHA_THO_LON_SRC_BYTES);
    expect(fs.statSync(thapRuaSrc).size).toBe(EXPECTED_THAP_RUA_SRC_BYTES);
    expect(fs.statSync(gaHaNoiSrc).size).toBe(EXPECTED_GA_HA_NOI_SRC_BYTES);
    expect(fs.statSync(gsxSSrc).size).toBe(EXPECTED_GSXS_SRC_BYTES);

    const carSources: Array<[string, number]> = [
      ['coupe_black.glb', 340304],
      ['coupe_grey.glb', 341348],
      ['coupe_red.glb', 343124],
      ['coupe_white.glb', 343180],
      ['hatch_black.glb', 227232],
      ['hatch_white.glb', 227228],
      ['hatch_yellow.glb', 227228],
      ['suv_black.glb', 322452],
      ['suv_blue.glb', 322444],
      ['suv_white.glb', 322444]
    ];
    for (const [name, expectedBytes] of carSources) {
      const p = path.join(ROOT_DIR, 'Models', 'cars', name);
      expect(fs.existsSync(p)).toBe(true);
      expect(fs.statSync(p).size).toBe(expectedBytes);
    }

    const busSources: Array<[string, number]> = [
      ['ecoline_blue.glb', 418920],
      ['ecoline_green.glb', 418920],
      ['ecoline_red.glb', 418920],
      ['ecoline_white.glb', 418916],
      ['IRIZAR_I6.glb', 5985664]
    ];
    for (const [name, expectedBytes] of busSources) {
      const p = path.join(ROOT_DIR, 'Models', 'buses', name);
      expect(fs.existsSync(p)).toBe(true);
      expect(fs.statSync(p).size).toBe(expectedBytes);
    }

    const truckSources: Array<[string, number]> = [
      ['dump_truck.glb', 222808],
      ['pickup_blue.glb', 626464],
      ['pickup_grey.glb', 626464],
      ['pickup_red.glb', 626464],
      ['pickup_strada_black.glb', 1014468],
      ['pickup_strada_red.glb', 1014452],
      ['pickup_strada_silver.glb', 1014464],
      ['pickup_strada_white.glb', 1014460],
      ['pickup_white.glb', 626460],
      ['semi_container45_blue.glb', 416980],
      ['semi_container45_green.glb', 416980],
      ['semi_container45_grey.glb', 416976],
      ['semi_container45_red.glb', 416976],
      ['semi_tractor.glb', 382228],
      ['van_beige.glb', 950484],
      ['van_blue.glb', 941504],
      ['van_silver.glb', 791724],
      ['van_teal.glb', 913484],
      ['van_white.glb', 773680]
    ];
    for (const [name, expectedBytes] of truckSources) {
      const p = path.join(ROOT_DIR, 'Models', 'Trucks', name);
      expect(fs.existsSync(p)).toBe(true);
      expect(fs.statSync(p).size).toBe(expectedBytes);
    }
  });

  it('ships all 9 optimized/passthrough destination GLBs in public/assets/landmarks/', () => {
    const landmarksDir = path.join(ROOT_DIR, 'public', 'assets', 'landmarks');
    const landmarkCases = [
      { file: 'my_dinh_stadium.glb', srcBytes: EXPECTED_MY_DINH_SRC_BYTES, passthrough: false },
      { file: 'military_museum.glb', srcBytes: EXPECTED_MILITARY_MUSEUM_SRC_BYTES, passthrough: false },
      { file: 'vinuni_campus.glb', srcBytes: EXPECTED_VINUNI_SRC_BYTES, passthrough: false },
      { file: 'nha_hat_lon.glb', srcBytes: EXPECTED_NHA_HAT_LON_SRC_BYTES, passthrough: true },
      { file: 'lang_bac.glb', srcBytes: EXPECTED_LANG_BAC_SRC_BYTES, passthrough: false },
      { file: 'cot_co.glb', srcBytes: EXPECTED_COT_CO_SRC_BYTES, passthrough: false },
      { file: 'nha_tho_lon.glb', srcBytes: EXPECTED_NHA_THO_LON_SRC_BYTES, passthrough: true },
      { file: 'thap_rua.glb', srcBytes: EXPECTED_THAP_RUA_SRC_BYTES, passthrough: true },
      { file: 'ga_ha_noi.glb', srcBytes: EXPECTED_GA_HA_NOI_SRC_BYTES, passthrough: false }
    ];

    for (const item of landmarkCases) {
      const fullPath = path.join(landmarksDir, item.file);
      expect(fs.existsSync(fullPath)).toBe(true);
      const size = fs.statSync(fullPath).size;
      expect(size).toBeGreaterThan(10_000);
      if (item.passthrough) {
        expect(size).toBe(item.srcBytes);
      } else {
        expect(size).toBeLessThan(item.srcBytes);
      }
    }
  });

  it('ships optimized Honda, VinFast, Suzuki RGV, Suzuki GSX-S, Driver, Taxi, Bus, and Truck GLBs + Draco decoders within <= 6 MB total', () => {
    const modelsDir = path.join(ROOT_DIR, 'public', 'assets', 'models');
    const dracoDir = path.join(ROOT_DIR, 'public', 'assets', 'draco');
    const modelFiles = [
      'honda.glb',
      'vinfast.glb',
      'suzuki_rgv.glb',
      'suzuki_gsxs.glb',
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

  it('ships all 10 car GLBs and 5 bus GLBs in public/assets/traffic/ matching Draco source sizes', () => {
    const trafficDir = path.join(ROOT_DIR, 'public', 'assets', 'traffic');

    const carFiles: Array<[string, number]> = [
      ['coupe_black.glb', 340304],
      ['coupe_grey.glb', 341348],
      ['coupe_red.glb', 343124],
      ['coupe_white.glb', 343180],
      ['hatch_black.glb', 227232],
      ['hatch_white.glb', 227228],
      ['hatch_yellow.glb', 227228],
      ['suv_black.glb', 322452],
      ['suv_blue.glb', 322444],
      ['suv_white.glb', 322444]
    ];
    for (const [name, expectedBytes] of carFiles) {
      const fullPath = path.join(trafficDir, 'cars', name);
      expect(fs.existsSync(fullPath)).toBe(true);
      expect(fs.statSync(fullPath).size).toBe(expectedBytes);
    }

    const busFiles: Array<[string, string, number]> = [
      ['ecoline_blue.glb', 'ecoline_blue.glb', 418920],
      ['ecoline_green.glb', 'ecoline_green.glb', 418920],
      ['ecoline_red.glb', 'ecoline_red.glb', 418920],
      ['ecoline_white.glb', 'ecoline_white.glb', 418916],
      ['irizar_i6.glb', 'IRIZAR_I6.glb', 5985664]
    ];
    for (const [outName, _srcName, expectedBytes] of busFiles) {
      const fullPath = path.join(trafficDir, 'buses', outName);
      expect(fs.existsSync(fullPath)).toBe(true);
      expect(fs.statSync(fullPath).size).toBe(expectedBytes);
    }
  });

  it('ships all 19 truck & heavy_truck GLBs in public/assets/traffic/trucks/ matching Draco source sizes', () => {
    const trucksDir = path.join(ROOT_DIR, 'public', 'assets', 'traffic', 'trucks');
    const truckFiles: Array<[string, number]> = [
      ['dump_truck.glb', 222808],
      ['pickup_blue.glb', 626464],
      ['pickup_grey.glb', 626464],
      ['pickup_red.glb', 626464],
      ['pickup_strada_black.glb', 1014468],
      ['pickup_strada_red.glb', 1014452],
      ['pickup_strada_silver.glb', 1014464],
      ['pickup_strada_white.glb', 1014460],
      ['pickup_white.glb', 626460],
      ['semi_container45_blue.glb', 416980],
      ['semi_container45_green.glb', 416980],
      ['semi_container45_grey.glb', 416976],
      ['semi_container45_red.glb', 416976],
      ['semi_tractor.glb', 382228],
      ['van_beige.glb', 950484],
      ['van_blue.glb', 941504],
      ['van_silver.glb', 791724],
      ['van_teal.glb', 913484],
      ['van_white.glb', 773680]
    ];

    for (const [filename, expectedBytes] of truckFiles) {
      const fullPath = path.join(trucksDir, filename);
      expect(fs.existsSync(fullPath)).toBe(true);
      expect(fs.statSync(fullPath).size).toBe(expectedBytes);
    }
  });
});
