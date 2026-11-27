import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { describe, expect, it } from 'vitest';
import { BIKES, getStageSpec } from '../config/gameConfig.ts';
import {
  COMING_SOON_MESSAGE,
  PROFILE_STORAGE_KEY,
  SHOP_CATALOG,
  createDefaultProfile,
  creditCareerEarnings,
  loadProfile,
  saveProfile,
  type StorageLike
} from '../core/profileStore.ts';
import { AudioManager } from '../gameplay/audioManager.ts';
import { PlayerController } from '../gameplay/playerController.ts';
import {
  createFallbackBike,
  extractBikeRig,
  setBikeBrakeLight,
  setBikeStoppedPose
} from '../world/bikeLoader.ts';

const ROOT_DIR = fileURLToPath(new URL('../../', import.meta.url));

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

describe('Phase 2.0A — Audio Engine Profile Split (AudioManager)', () => {
  it('gasoline profile produces idle garăngti gain at 0 km/h and steps through gears 1..4', () => {
    const audio = new AudioManager();
    audio.setEngineProfile('gasoline');
    expect(audio.getEngineProfile()).toBe('gasoline');

    audio.updateEngine(0, true, { speed: 0, isBraking: false });
    const idle = audio.getEngineTelemetry();
    expect(idle.profile).toBe('gasoline');
    expect(idle.active).toBe(true);
    expect(idle.estimatedGain).toBeGreaterThan(0.03);
    expect(idle.gear).toBe(1);

    const observedGears: number[] = [];
    for (const ratio of [0.15, 0.35, 0.6, 0.9]) {
      audio.updateEngine(ratio, true, { speed: ratio * 64, isBraking: false });
      const t = audio.getEngineTelemetry();
      observedGears.push(t.gear);
      expect(t.estimatedGain).toBeGreaterThan(0.03);
    }
    expect(observedGears).toEqual([1, 2, 3, 4]);

    audio.updateEngine(0.5, false);
    const inactive = audio.getEngineTelemetry();
    expect(inactive.active).toBe(false);
    expect(inactive.estimatedGain).toBe(0);
    expect(inactive.gear).toBe(0);
  });

  it('electric profile stays near-silent at 0 km/h, rises smoothly when moving, and tracks regen braking', () => {
    const audio = new AudioManager();
    audio.setEngineProfile('electric');
    expect(audio.getEngineProfile()).toBe('electric');

    audio.updateEngine(0, true, { speed: 0, isBraking: false });
    const idle = audio.getEngineTelemetry();
    expect(idle.profile).toBe('electric');
    expect(idle.active).toBe(true);
    expect(idle.gear).toBe(0);
    expect(idle.estimatedGain).toBeLessThanOrEqual(0.008);

    audio.updateEngine(0.5, true, { speed: 34, isBraking: false });
    const cruise = audio.getEngineTelemetry();
    expect(cruise.gear).toBe(0);
    expect(cruise.isBraking).toBe(false);
    expect(cruise.estimatedGain).toBeGreaterThan(0.02);

    audio.updateEngine(0.5, true, { speed: 34, isBraking: true });
    const regen = audio.getEngineTelemetry();
    expect(regen.gear).toBe(0);
    expect(regen.isBraking).toBe(true);
    expect(regen.estimatedGain).toBeGreaterThan(cruise.estimatedGain);
  });
});

describe('Phase 2.0A — Brake-to-0 Physics & Rear Tail-Light (PlayerController + bikeLoader)', () => {
  it('brakes smoothly all the way to 0 km/h with brake light lit and leanAngle reset to 0', () => {
    const controller = new PlayerController('honda');
    const bikeMesh = createFallbackBike('honda');
    const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 300);
    const stageLength = getStageSpec(1).length;

    controller.setBike('honda', bikeMesh);
    controller.resetForStage(1, camera);

    // Build some forward speed and lean before braking
    controller.setInputState({ accelerate: true, right: true, brake: false });
    for (let i = 0; i < 20; i++) {
      controller.update(0.03, stageLength, camera);
    }
    expect(controller.getPose().speed).toBeGreaterThan(BIKES.honda.minCruiseSpeed);
    expect(Math.abs(controller.getPose().leanAngle)).toBeGreaterThan(0.01);

    // Apply brake continuously until bike comes to a complete 0 km/h stop
    controller.setInputState({ accelerate: false, right: false, brake: true });
    let pose = controller.getPose();
    for (let i = 0; i < 120; i++) {
      pose = controller.update(0.03, stageLength, camera);
      expect(controller.isBraking()).toBe(true);
      expect(controller.isBrakeLightLit()).toBe(true);
    }

    expect(pose.speed).toBe(0);
    expect(pose.displayKmh).toBe(0);
    expect(pose.isBraking).toBe(true);
    expect(pose.leanAngle).toBe(0);
    expect(controller.isBraking()).toBe(true);
    expect(controller.isBrakeLightLit()).toBe(true);

    const handles = extractBikeRig(bikeMesh);
    expect(handles.brakeLight).not.toBeNull();
    expect(handles.brakeLight?.glowMesh.visible).toBe(true);
    expect(handles.brakeLight?.lensMaterial.emissiveIntensity).toBeGreaterThanOrEqual(3);

    // Release brake and accelerate: must climb smoothly from 0 without snapping to minCruiseSpeed
    controller.setInputState({ brake: false, accelerate: true });
    const firstAccelPose = controller.update(0.016, stageLength, camera);
    expect(firstAccelPose.speed).toBeGreaterThan(0);
    expect(firstAccelPose.speed).toBeLessThan(BIKES.honda.minCruiseSpeed * 0.5);
    expect(firstAccelPose.isBraking).toBe(false);
    expect(controller.isBraking()).toBe(false);
    expect(controller.isBrakeLightLit()).toBe(false);
  });

  it('attaches isolated BrakeLight handles on both honda & vinfast fallback bikes and supports stopped pose', () => {
    for (const bikeId of ['honda', 'vinfast'] as const) {
      const template = createFallbackBike(bikeId);
      const cloneA = SkeletonUtils.clone(template) as THREE.Group;
      const cloneB = SkeletonUtils.clone(template) as THREE.Group;

      const handlesA = extractBikeRig(cloneA);
      const handlesB = extractBikeRig(cloneB);

      expect(handlesA.brakeLight).not.toBeNull();
      expect(handlesB.brakeLight).not.toBeNull();

      // Idle state
      expect(handlesA.brakeLight?.glowMesh.visible).toBe(false);
      expect(handlesA.brakeLight?.lensMaterial.emissiveIntensity).toBeLessThan(1);

      // Braking lights ONLY cloneA, keeping cloneB untouched
      setBikeBrakeLight(handlesA, true);
      expect(handlesA.brakeLight?.glowMesh.visible).toBe(true);
      expect(handlesA.brakeLight?.lensMaterial.emissiveIntensity).toBeGreaterThanOrEqual(3);
      expect(handlesB.brakeLight?.glowMesh.visible).toBe(false);
      expect(handlesB.brakeLight?.lensMaterial.emissiveIntensity).toBeLessThan(1);

      setBikeBrakeLight(handlesA, false);
      expect(handlesA.brakeLight?.glowMesh.visible).toBe(false);
      expect(handlesA.brakeLight?.lensMaterial.emissiveIntensity).toBeLessThan(1);

      // Stopped pose toggles cleanly
      setBikeStoppedPose(handlesA, true);
      expect(handlesA.bikeAssembly.rotation.z).not.toBe(0);
      setBikeStoppedPose(handlesA, false);
      expect(handlesA.bikeAssembly.rotation.z).toBe(0);
    }
  });
});

describe('Phase 2.0A — Career Profile Store & Bike Shop Catalog (profileStore)', () => {
  it('creates, saves, loads, and safely recovers corrupt localStorage JSON', () => {
    const def = createDefaultProfile();
    expect(def.version).toBe(2);
    expect(def.careerWallet).toBe(0);
    expect(def.totalDeliveries).toBe(0);
    expect(def.totalDistanceMeters).toBe(0);
    expect(def.ownedBikes).toEqual(['honda', 'vinfast']);
    expect(def.selectedBikeId).toBe('honda');

    const emptyStorage = createMemoryStorage();
    expect(loadProfile(emptyStorage)).toEqual(def);

    const corruptStorage = createMemoryStorage({
      [PROFILE_STORAGE_KEY]: '{not-valid-json'
    });
    expect(loadProfile(corruptStorage)).toEqual(def);

    const wrongVersionStorage = createMemoryStorage({
      [PROFILE_STORAGE_KEY]: JSON.stringify({ version: 1, careerWallet: 999999 })
    });
    expect(loadProfile(wrongVersionStorage)).toEqual(def);

    const storage = createMemoryStorage();
    const updated = {
      ...def,
      careerWallet: 420_000,
      selectedBikeId: 'vinfast' as const
    };
    expect(saveProfile(updated, storage)).toBe(true);
    expect(loadProfile(storage)).toEqual(updated);
  });

  it('credits career earnings and persists across reloads', () => {
    const storage = createMemoryStorage();
    const initial = loadProfile(storage);
    const afterFirst = creditCareerEarnings(initial, 175_000, 1450, storage);

    expect(afterFirst.careerWallet).toBe(175_000);
    expect(afterFirst.totalDeliveries).toBe(1);
    expect(afterFirst.totalDistanceMeters).toBe(1450);

    const afterSecond = creditCareerEarnings(afterFirst, 225_000, 2000, storage);
    expect(afterSecond.careerWallet).toBe(400_000);
    expect(afterSecond.totalDeliveries).toBe(2);
    expect(afterSecond.totalDistanceMeters).toBe(3450);

    expect(loadProfile(storage)).toEqual(afterSecond);
  });

  it('exposes honda & vinfast as owned and coming_soon bikes with the exact status message', () => {
    const expectedMsg = 'Xe chưa về kho — Vui lòng quay lại ở bản cập nhật sau';
    expect(COMING_SOON_MESSAGE).toBe(expectedMsg);

    const honda = SHOP_CATALOG.find((item) => item.id === 'honda');
    const vinfast = SHOP_CATALOG.find((item) => item.id === 'vinfast');
    expect(honda?.status).toBe('owned');
    expect(vinfast?.status).toBe('owned');

    const comingSoon = SHOP_CATALOG.filter((item) => item.status === 'coming_soon');
    expect(comingSoon.length).toBeGreaterThanOrEqual(3);
    for (const item of comingSoon) {
      expect(item.priceVnd).toBeGreaterThan(0);
      expect(item.statusMessage).toBe(expectedMsg);
    }
  });
});

describe('Phase 2.0A — Single Unified Font & HUD/Shop DOM Invariants', () => {
  it('enforces Be Vietnam Pro only (no Playfair Display or JetBrains Mono) in index.html & styles.css', () => {
    const html = fs.readFileSync(path.join(ROOT_DIR, 'index.html'), 'utf8');
    const css = fs.readFileSync(path.join(ROOT_DIR, 'src', 'ui', 'styles.css'), 'utf8');

    expect(html).toContain('Be+Vietnam+Pro');
    expect(css).toContain('Be Vietnam Pro');

    expect(html).not.toMatch(/Playfair[\s+]*Display/i);
    expect(html).not.toMatch(/JetBrains[\s+]*Mono/i);
    expect(css).not.toMatch(/Playfair[\s+]*Display/i);
    expect(css).not.toMatch(/JetBrains[\s+]*Mono/i);
  });

  it('replaces old .hud-route bar with corner GPS minimap & Bike Shop DOM elements', () => {
    const html = fs.readFileSync(path.join(ROOT_DIR, 'index.html'), 'utf8');

    expect(html).toContain('id="hud-minimap"');
    expect(html).toContain('id="minimap-canvas"');
    expect(html).toContain('id="btn-open-shop"');
    expect(html).toContain('id="screen-shop"');
    expect(html).not.toContain('hud-route');
  });
});
