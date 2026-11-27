import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  SHOP_CATALOG,
  createDefaultProfile,
  loadProfile,
  purchaseBike,
  type StorageLike
} from '../core/profileStore.ts';
import { checkEntitiesOverlap2D } from '../core/trafficPhysics.ts';
import { TrafficSpawner } from '../gameplay/trafficSpawner.ts';
import {
  createFallbackBike,
  extractBikeRig,
  setBikeBrakeLight,
  setBikeStoppedPose
} from '../world/bikeLoader.ts';
import { TrafficVisualPool } from '../world/trafficModels.ts';

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

describe('Phase 2.0C Vehicles — Suzuki GSX-S Shop, Rig & Multi-GLB Traffic Pool', () => {
  it('lists suzuki_gsxs as available for 950.000đ and handles purchaseBike persistence & guards', () => {
    const gsxs = SHOP_CATALOG.find((item) => item.id === 'suzuki_gsxs');
    expect(gsxs).toBeDefined();
    expect(gsxs?.status).toBe('available');
    expect(gsxs?.priceVnd).toBe(950_000);
    expect(gsxs?.engineType).toBe('gasoline');

    const storage = createMemoryStorage();

    // Insufficient careerWallet rejected cleanly
    const poor = { ...createDefaultProfile(), careerWallet: 800_000 };
    const failRes = purchaseBike(poor, 'suzuki_gsxs', 950_000, storage);
    expect(failRes.purchased).toBe(false);
    expect(failRes.reason).toBe('insufficient_funds');
    expect(failRes.profile.careerWallet).toBe(800_000);
    expect(failRes.profile.ownedBikes).not.toContain('suzuki_gsxs');

    // Sufficient funds deducts wallet, appends ownedBikes, selects suzuki_gsxs & persists
    const rich = { ...createDefaultProfile(), careerWallet: 1_200_000 };
    const okRes = purchaseBike(rich, 'suzuki_gsxs', 950_000, storage);
    expect(okRes.purchased).toBe(true);
    expect(okRes.profile.careerWallet).toBe(250_000);
    expect(okRes.profile.ownedBikes).toContain('suzuki_gsxs');
    expect(okRes.profile.selectedBikeId).toBe('suzuki_gsxs');

    const reloaded = loadProfile(storage);
    expect(reloaded.careerWallet).toBe(250_000);
    expect(reloaded.ownedBikes).toContain('suzuki_gsxs');
    expect(reloaded.selectedBikeId).toBe('suzuki_gsxs');

    // Duplicate purchase rejected
    const dupRes = purchaseBike(reloaded, 'suzuki_gsxs', 950_000, storage);
    expect(dupRes.purchased).toBe(false);
    expect(dupRes.reason).toBe('already_owned');
  });

  it('constructs full BikeRigHandles + BrakeLight & stopped pose for createFallbackBike(suzuki_gsxs)', () => {
    const bike = createFallbackBike('suzuki_gsxs');
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

  it('rotates through GLB car & bus templates via setCarTemplates, setBusTemplates, and addBusTemplates', () => {
    const pool = new TrafficVisualPool();

    const makeCarTemplate = (variant: string): THREE.Group => {
      const g = new THREE.Group();
      g.userData.carVariant = variant;
      g.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial()));
      return g;
    };

    const makeBusTemplate = (variant: string): THREE.Group => {
      const g = new THREE.Group();
      g.userData.busVariant = variant;
      g.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial()));
      return g;
    };

    const t1 = makeCarTemplate('coupe_red');
    const t2 = makeCarTemplate('suv_blue');
    pool.setCarTemplates([t1, t2]);
    expect(pool.hasCarTemplates()).toBe(true);

    const seenCars = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const c = pool.acquire('car');
      expect(c.userData.isGltfCar).toBe(true);
      seenCars.add(String(c.userData.carVariant));
    }
    expect(seenCars).toEqual(new Set(['coupe_red', 'suv_blue']));

    const b1 = makeBusTemplate('vinbus');
    const b2 = makeBusTemplate('ecoline_green');
    const b3 = makeBusTemplate('irizar_i6');
    pool.setBusTemplates([b1, b2]);
    pool.addBusTemplates([b3]);
    expect(pool.hasBusTemplate()).toBe(true);

    const seenBuses = new Set<string>();
    for (let i = 0; i < 16; i++) {
      const b = pool.acquire('bus');
      expect(b.userData.isGltfBus).toBe(true);
      seenBuses.add(String(b.userData.busVariant));
    }
    expect(seenBuses).toEqual(new Set(['vinbus', 'ecoline_green', 'irizar_i6']));

    pool.dispose();
  });

  it('rotates through GLB truck & heavy_truck templates and preserves per-vehicle hitboxes', () => {
    const pool = new TrafficVisualPool();

    const makeTruckTemplate = (
      variant: string,
      hitboxHalfW: number,
      hitboxHalfL: number,
      heavy = false
    ): THREE.Group => {
      const g = new THREE.Group();
      g.userData[heavy ? 'heavyTruckVariant' : 'truckVariant'] = variant;
      g.userData.hitboxHalfW = hitboxHalfW;
      g.userData.hitboxHalfL = hitboxHalfL;
      g.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial()));
      return g;
    };

    const t1 = makeTruckTemplate('canter', 1.1, 3.3);
    const t2 = makeTruckTemplate('pickup_blue', 1.0, 2.65);
    const t3 = makeTruckTemplate('van_teal', 1.04, 2.8);
    pool.setTruckTemplates([t1, t2]);
    pool.addTruckTemplates([t3]);
    expect(pool.hasTruckTemplate()).toBe(true);

    const seenTrucks = new Set<string>();
    for (let i = 0; i < 18; i++) {
      const tr = pool.acquire('truck');
      expect(tr.userData.isGltfTruck).toBe(true);
      expect(tr.userData.hitboxHalfW).toBeGreaterThan(0);
      expect(tr.userData.hitboxHalfL).toBeGreaterThan(0);
      seenTrucks.add(String(tr.userData.truckVariant));
    }
    expect(seenTrucks).toEqual(new Set(['canter', 'pickup_blue', 'van_teal']));

    const h1 = makeTruckTemplate('dump_truck', 1.24, 4.15, true);
    const h2 = makeTruckTemplate('semi_container45_blue', 1.32, 7.45, true);
    pool.setHeavyTruckTemplates([h1, h2]);
    expect(pool.hasHeavyTruckTemplate()).toBe(true);

    const seenHeavy = new Set<string>();
    for (let i = 0; i < 14; i++) {
      const h = pool.acquire('heavy_truck');
      expect(h.userData.isGltfHeavyTruck).toBe(true);
      if (h.userData.heavyTruckVariant === 'semi_container45_blue') {
        expect(h.userData.hitboxHalfL).toBeCloseTo(7.45, 5);
        expect(h.userData.hitboxHalfW).toBeCloseTo(1.32, 5);
      }
      seenHeavy.add(String(h.userData.heavyTruckVariant));
    }
    expect(seenHeavy).toEqual(new Set(['dump_truck', 'semi_container45_blue']));

    pool.dispose();
  });

  it('spawns heavy_truck GLBs with hitboxHalfL = 7.45 in TrafficSpawner without overlapping across 1500 frames', () => {
    const scene = new THREE.Scene();
    const pool = new TrafficVisualPool();

    const makeHeavy = (variant: string, halfW: number, halfL: number): THREE.Group => {
      const g = new THREE.Group();
      g.userData.heavyTruckVariant = variant;
      g.userData.hitboxHalfW = halfW;
      g.userData.hitboxHalfL = halfL;
      g.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial()));
      return g;
    };
    const makeLightTruck = (variant: string, halfW: number, halfL: number): THREE.Group => {
      const g = new THREE.Group();
      g.userData.truckVariant = variant;
      g.userData.hitboxHalfW = halfW;
      g.userData.hitboxHalfL = halfL;
      g.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial()));
      return g;
    };

    const spawner = new TrafficSpawner(scene, pool);
    spawner.setTruckTemplates([makeLightTruck('van_white', 1.04, 2.8)]);
    spawner.setHeavyTruckTemplates([makeHeavy('semi_container45_red', 1.32, 7.45)]);
    expect(spawner.getHeavyModelStats().hasHeavyTruckGltf).toBe(true);

    spawner.reset(1, 'hard');
    let sawHeavy745 = false;
    let dist = 0;
    let t = 0;
    const dt = 0.033;

    for (let frame = 0; frame < 1500; frame += 1) {
      spawner.update(dt, dist, t);
      const active = spawner.getActiveObstacles();
      for (let i = 0; i < active.length; i += 1) {
        const a = active[i];
        if (a.type === 'heavy_truck') {
          expect(a.halfL).toBeCloseTo(7.45, 5);
          expect(a.halfW).toBeCloseTo(1.32, 5);
          sawHeavy745 = true;
        }
        for (let j = i + 1; j < active.length; j += 1) {
          const b = active[j];
          const overlaps = checkEntitiesOverlap2D(
            { lateralOffset: a.lateralOffset, distance: a.distance, halfW: a.halfW, halfL: a.halfL },
            { lateralOffset: b.lateralOffset, distance: b.distance, halfW: b.halfW, halfL: b.halfL },
            -0.05,
            -0.05
          );
          expect(overlaps).toBe(false);
        }
      }
      dist += 22 * dt;
      t += dt;
    }

    expect(sawHeavy745).toBe(true);
    spawner.dispose();
  });
});
