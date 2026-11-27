import * as THREE from 'three';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  BUS_MODEL_PATH,
  BUS_MODEL_PATHS,
  CAR_MODEL_PATHS,
  DRACO_DECODER_PATH,
  EXTRA_BUS_MODEL_PATHS,
  EXTRA_CAR_MODEL_PATHS,
  EXTRA_HEAVY_TRUCK_MODEL_PATHS,
  EXTRA_TRUCK_MODEL_PATHS,
  HEAVY_TRUCK_MODEL_PATHS,
  TAXI_MODEL_PATH,
  TRUCK_MODEL_PATH,
  TRUCK_MODEL_PATHS
} from '../config/gameConfig.ts';

/** Exact wheel radius measured from Wheel_FL..RR local geometry in VF_e34_Taxi.glb, scaled to 5-seat taxi. */
export const TAXI_MODEL_SCALE = 0.86;
export const TAXI_WHEEL_RADIUS = 0.33 * TAXI_MODEL_SCALE;
export const BUS_MODEL_SCALE = 1.06;
export const TRUCK_MODEL_SCALE = 0.88;

let sharedDracoLoader: DRACOLoader | null = null;
let sharedTrafficGltfLoader: GLTFLoader | null = null;

function getSharedTrafficGltfLoader(): GLTFLoader {
  if (!sharedTrafficGltfLoader) {
    sharedDracoLoader = new DRACOLoader();
    sharedDracoLoader.setDecoderPath(DRACO_DECODER_PATH);
    sharedTrafficGltfLoader = new GLTFLoader();
    sharedTrafficGltfLoader.setDRACOLoader(sharedDracoLoader);
    sharedTrafficGltfLoader.setMeshoptDecoder(MeshoptDecoder);
  }
  return sharedTrafficGltfLoader;
}

/** Disposes shared Draco web workers after startup GLB loading completes. */
export function disposeTrafficLoaderWorkers(): void {
  if (sharedDracoLoader) {
    sharedDracoLoader.dispose();
    sharedDracoLoader = null;
  }
  sharedTrafficGltfLoader = null;
}

/**
 * Loads the Draco-compressed VinFast VF e34 Xanh SM taxi GLB once as a reusable
 * template Group grounded at y = 0, centered in X/Z, and facing -Z.
 */
export async function loadTaxiTrafficTemplate(): Promise<THREE.Group | null> {
  const gltfLoader = getSharedTrafficGltfLoader();

  try {
    const gltf = await gltfLoader.loadAsync(TAXI_MODEL_PATH);
    const root = new THREE.Group();
    root.name = 'VF_e34_Taxi_Template';

    centerAndGroundScene(gltf.scene, 0, TAXI_MODEL_SCALE);

    gltf.scene.traverse((child) => {
      if (!(child as THREE.Mesh).isMesh) return;
      const mesh = child as THREE.Mesh;
      const mats = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).filter(
        (m): m is THREE.Material => Boolean(m)
      );

      const isDecalOrGlass = mats.some(
        (m) => m.name.startsWith('M_DC_') || m.transparent || m.name.includes('Glass')
      );
      mesh.castShadow = !isDecalOrGlass;
      mesh.receiveShadow = true;

      for (const mat of mats) {
        if (mat.name.startsWith('M_DC_')) {
          mat.depthWrite = false;
          mat.polygonOffset = true;
          mat.polygonOffsetFactor = -1;
          mat.polygonOffsetUnits = -1;
          mat.needsUpdate = true;
        }
        if (mat instanceof THREE.MeshStandardMaterial && !mat.name.includes('LED')) {
          mat.envMapIntensity = 1.25;
        }
      }
    });

    root.add(gltf.scene);
    return root;
  } catch (err) {
    console.warn('[taxiLoader] Failed to load VF_e34_Taxi.glb, using fallback:', err);
    return null;
  }
}

function centerAndGroundScene(
  gltfScene: THREE.Group,
  yaw: number,
  scale: number
): THREE.Vector3 {
  gltfScene.rotation.y = yaw;
  gltfScene.scale.setScalar(scale);
  gltfScene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(gltfScene);
  const center = box.getCenter(new THREE.Vector3());
  gltfScene.position.set(-center.x, -box.min.y, -center.z);
  gltfScene.updateMatrixWorld(true);
  return box.getSize(new THREE.Vector3());
}

function normalizeByTargetLength(
  gltfScene: THREE.Group,
  yaw: number,
  targetLength: number
): THREE.Vector3 {
  gltfScene.rotation.y = yaw;
  gltfScene.scale.setScalar(1);
  gltfScene.updateMatrixWorld(true);
  const rawBox = new THREE.Box3().setFromObject(gltfScene);
  const rawSize = rawBox.getSize(new THREE.Vector3());
  const scale = targetLength / Math.max(0.01, rawSize.z);
  gltfScene.scale.setScalar(scale);
  gltfScene.updateMatrixWorld(true);
  const scaledBox = new THREE.Box3().setFromObject(gltfScene);
  const center = scaledBox.getCenter(new THREE.Vector3());
  gltfScene.position.set(-center.x, -scaledBox.min.y, -center.z);
  gltfScene.updateMatrixWorld(true);
  return scaledBox.getSize(new THREE.Vector3());
}

function getVariantNameFromPath(modelPath: string): string {
  const file = modelPath.split('/').pop() ?? modelPath;
  return file.replace(/\.glb$/i, '');
}

function getCarTargetLength(variantName: string): number {
  const lower = variantName.toLowerCase();
  if (lower.includes('hatch')) return 4.08;
  if (lower.includes('suv')) return 4.38;
  return 4.42;
}

function buildCarTemplate(variantName: string, gltfScene: THREE.Group): THREE.Group {
  const root = new THREE.Group();
  root.name = `Car_${variantName}_Template`;

  normalizeByTargetLength(gltfScene, -Math.PI / 2, getCarTargetLength(variantName));

  gltfScene.traverse((child) => {
    if (!(child as THREE.Mesh).isMesh) return;
    const mesh = child as THREE.Mesh;
    const mats = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).filter(
      (m): m is THREE.Material => Boolean(m)
    );
    const isGlass = mats.some(
      (m) => m.transparent || /glass|window|windshield|windscreen/i.test(m.name)
    );
    mesh.castShadow = !isGlass;
    mesh.receiveShadow = true;

    for (const mat of mats) {
      if (mat instanceof THREE.MeshStandardMaterial) {
        const lowerMat = mat.name.toLowerCase();
        if (lowerMat.includes('light')) {
          if (mat.emissive.getHex() === 0) {
            const isRear =
              lowerMat.includes('tail') ||
              lowerMat.includes('rear') ||
              lowerMat.includes('brake');
            mat.emissive.setHex(isRear ? 0xd92626 : 0xfff4d6);
          }
          mat.emissiveIntensity = Math.max(mat.emissiveIntensity ?? 0, 0.72);
        }
        mat.envMapIntensity = 1.35;
      }
    }
  });

  root.userData.isGltfCar = true;
  root.userData.carVariant = variantName;
  root.add(gltfScene);
  return root;
}

/**
 * Loads starter car GLB templates in parallel (-X -> -Z rotation, exact real-world length).
 */
export async function loadCarTrafficTemplates(): Promise<THREE.Group[]> {
  const gltfLoader = getSharedTrafficGltfLoader();
  const results = await Promise.allSettled(
    CAR_MODEL_PATHS.map(async (modelPath) => {
      const variantName = getVariantNameFromPath(modelPath);
      const gltf = await gltfLoader.loadAsync(modelPath);
      return buildCarTemplate(variantName, gltf.scene);
    })
  );

  const loaded: THREE.Group[] = [];
  results.forEach((res, idx) => {
    if (res.status === 'fulfilled') {
      loaded.push(res.value);
    } else {
      console.warn(`[taxiLoader] Failed to load ${CAR_MODEL_PATHS[idx]}:`, res.reason);
    }
  });
  return loaded;
}

function setupBusTemplateMaterials(scene: THREE.Group, envMapIntensity: number): void {
  scene.traverse((child) => {
    if (!(child as THREE.Mesh).isMesh) return;
    const mesh = child as THREE.Mesh;
    const mats = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).filter(
      (m): m is THREE.Material => Boolean(m)
    );
    const isGlass = mats.some(
      (m) => m.transparent || /glass|window|windshield|windscreen/i.test(m.name)
    );
    mesh.castShadow = !isGlass;
    mesh.receiveShadow = true;
    for (const mat of mats) {
      if (mat instanceof THREE.MeshStandardMaterial) {
        mat.envMapIntensity = envMapIntensity;
      }
    }
  });
}

function buildBusVariantTemplate(modelPath: string, gltfScene: THREE.Group): THREE.Group {
  const variantName = getVariantNameFromPath(modelPath);
  const root = new THREE.Group();
  if (modelPath === BUS_MODEL_PATH) {
    root.name = 'VinBus_Template';
    centerAndGroundScene(gltfScene, Math.PI, BUS_MODEL_SCALE);
    gltfScene.traverse((child) => {
      if (!(child as THREE.Mesh).isMesh) return;
      const mesh = child as THREE.Mesh;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of mats) {
        if (mat instanceof THREE.MeshStandardMaterial) {
          mat.envMapIntensity = 1.1;
        }
      }
    });
    root.userData.busVariant = 'vinbus';
  } else {
    root.name = `Bus_${variantName}_Template`;
    const targetLen = variantName.includes('irizar') ? 12.0 : 11.8;
    normalizeByTargetLength(gltfScene, Math.PI, targetLen);
    setupBusTemplateMaterials(gltfScene, 1.15);
    root.userData.busVariant = variantName;
  }
  root.userData.isGltfBus = true;
  root.add(gltfScene);
  return root;
}

/**
 * Loads the primary bus fleet in parallel.
 */
export async function loadBusTrafficTemplates(): Promise<THREE.Group[]> {
  const gltfLoader = getSharedTrafficGltfLoader();
  const results = await Promise.allSettled(
    BUS_MODEL_PATHS.map(async (modelPath) => {
      const gltf = await gltfLoader.loadAsync(modelPath);
      return buildBusVariantTemplate(modelPath, gltf.scene);
    })
  );

  const loaded: THREE.Group[] = [];
  results.forEach((res, idx) => {
    if (res.status === 'fulfilled') {
      loaded.push(res.value);
    } else {
      console.warn(`[taxiLoader] Failed to load ${BUS_MODEL_PATHS[idx]}:`, res.reason);
    }
  });
  return loaded;
}

/**
 * Background-loads extra coach templates without blocking startup.
 */
export async function loadExtraBusTrafficTemplates(): Promise<THREE.Group[]> {
  const gltfLoader = getSharedTrafficGltfLoader();
  const results = await Promise.allSettled(
    EXTRA_BUS_MODEL_PATHS.map(async (modelPath) => {
      const gltf = await gltfLoader.loadAsync(modelPath);
      return buildBusVariantTemplate(modelPath, gltf.scene);
    })
  );

  const loaded: THREE.Group[] = [];
  results.forEach((res, idx) => {
    if (res.status === 'fulfilled') {
      loaded.push(res.value);
    } else {
      console.warn(`[taxiLoader] Failed to load ${EXTRA_BUS_MODEL_PATHS[idx]}:`, res.reason);
    }
  });
  return loaded;
}

/**
 * Loads the optimized VinBus electric bus GLB centered at X/Z=0, grounded at y=0,
 * rotated PI around Y so its raw +Z front faces game forward -Z.
 */
export async function loadBusTrafficTemplate(): Promise<THREE.Group | null> {
  const gltfLoader = getSharedTrafficGltfLoader();
  try {
    const gltf = await gltfLoader.loadAsync(BUS_MODEL_PATH);
    const root = new THREE.Group();
    root.name = 'VinBus_Template';

    centerAndGroundScene(gltf.scene, Math.PI, BUS_MODEL_SCALE);

    gltf.scene.traverse((child) => {
      if (!(child as THREE.Mesh).isMesh) return;
      const mesh = child as THREE.Mesh;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of mats) {
        if (mat instanceof THREE.MeshStandardMaterial) {
          mat.envMapIntensity = 1.1;
        }
      }
    });

    root.add(gltf.scene);
    return root;
  } catch (err) {
    console.warn('[taxiLoader] Failed to load xe_buyt.glb, using fallback:', err);
    return null;
  }
}

function setupCanterMaterials(scene: THREE.Group): void {
  scene.traverse((child) => {
    if (!(child as THREE.Mesh).isMesh) return;
    const mesh = child as THREE.Mesh;
    const mats = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).filter(
      (m): m is THREE.Material => Boolean(m)
    );

    const isDecalOrGlass = mats.some(
      (m) =>
        m.name.startsWith('stripe_') ||
        m.name === 'lettering' ||
        m.name === 'glass_tinted' ||
        m.transparent
    );
    mesh.castShadow = !isDecalOrGlass;
    mesh.receiveShadow = true;

    for (const mat of mats) {
      if (mat.name.startsWith('stripe_') || mat.name === 'lettering') {
        mat.polygonOffset = true;
        mat.polygonOffsetFactor = -1;
        mat.polygonOffsetUnits = -1;
        mat.needsUpdate = true;
      } else if (mat.name === 'glass_tinted' || mat.transparent) {
        mat.transparent = true;
        mat.depthWrite = false;
        mat.needsUpdate = true;
      }

      if (mat instanceof THREE.MeshStandardMaterial) {
        if (mat.name === 'headlight') {
          mat.emissive.setHex(0xfff4d6);
          mat.emissiveIntensity = 0.75;
        } else if (mat.name === 'taillight_red') {
          mat.emissive.setHex(0xd91c1c);
          mat.emissiveIntensity = 0.85;
        }
        mat.envMapIntensity = 1.25;
      }
    }
  });
}

function setupTruckTemplateMaterials(scene: THREE.Group): void {
  scene.traverse((child) => {
    if (!(child as THREE.Mesh).isMesh) return;
    const mesh = child as THREE.Mesh;
    const mats = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).filter(
      (m): m is THREE.Material => Boolean(m)
    );
    const isGlass = mats.some(
      (m) => m.transparent || /glass|gla|window|windshield|transparent/i.test(m.name)
    );
    mesh.castShadow = !isGlass;
    mesh.receiveShadow = true;

    for (const mat of mats) {
      if (!(mat instanceof THREE.MeshStandardMaterial)) continue;
      mat.envMapIntensity = 1.25;
      if (/tail_light|glass_red|glass red/i.test(mat.name)) {
        if (mat.emissive.getHex() === 0) {
          mat.emissive.setHex(0xd92626);
        }
        mat.emissiveIntensity = Math.max(mat.emissiveIntensity ?? 0, 0.72);
      } else if (/front_lights|lights|emision/i.test(mat.name)) {
        if (mat.emissive.getHex() === 0) {
          mat.emissive.setHex(0xfff4d6);
        }
        mat.emissiveIntensity = Math.max(mat.emissiveIntensity ?? 0, 0.72);
      }
    }
  });
}

function assignTruckHitbox(root: THREE.Group, size: THREE.Vector3): void {
  root.userData.hitboxHalfW = Math.max(0.85, Math.min(1.38, size.x * 0.48));
  root.userData.hitboxHalfL = Math.max(2.2, size.z * 0.48);
}

function getLightTruckTargetLength(variantName: string): number {
  const lower = variantName.toLowerCase();
  if (lower.startsWith('pickup_strada')) return 5.6;
  if (lower.startsWith('pickup_')) return 5.5;
  if (lower.startsWith('van_')) return 5.8;
  return 5.6;
}

function getHeavyTruckTargetLength(variantName: string): number {
  const lower = variantName.toLowerCase();
  if (lower === 'dump_truck') return 8.6;
  if (lower === 'semi_tractor') return 6.8;
  if (lower.startsWith('semi_container45')) return 15.5;
  return 8.6;
}

async function loadTruckTemplateGroup(
  paths: readonly string[],
  buildTemplate: (modelPath: string, variantName: string, gltfScene: THREE.Group) => THREE.Group
): Promise<THREE.Group[]> {
  const gltfLoader = getSharedTrafficGltfLoader();
  const results = await Promise.allSettled(
    paths.map(async (modelPath) => {
      const variantName = getVariantNameFromPath(modelPath);
      const gltf = await gltfLoader.loadAsync(modelPath);
      return buildTemplate(modelPath, variantName, gltf.scene);
    })
  );

  const loaded: THREE.Group[] = [];
  results.forEach((res, idx) => {
    if (res.status === 'fulfilled') {
      loaded.push(res.value);
    } else {
      console.warn(`[taxiLoader] Failed to load ${paths[idx]}:`, res.reason);
    }
  });
  return loaded;
}

function buildLightTruckTemplate(
  modelPath: string,
  variantName: string,
  gltfScene: THREE.Group
): THREE.Group {
  const root = new THREE.Group();
  if (modelPath === TRUCK_MODEL_PATH) {
    root.name = 'Canter_Truck_Template';
    const size = centerAndGroundScene(gltfScene, Math.PI / 2, TRUCK_MODEL_SCALE);
    setupCanterMaterials(gltfScene);
    assignTruckHitbox(root, size);
    root.userData.truckVariant = 'canter';
  } else {
    root.name = `Truck_${variantName}_Template`;
    const size = normalizeByTargetLength(gltfScene, Math.PI, getLightTruckTargetLength(variantName));
    setupTruckTemplateMaterials(gltfScene);
    assignTruckHitbox(root, size);
    root.userData.truckVariant = variantName;
  }
  root.userData.isGltfTruck = true;
  root.add(gltfScene);
  return root;
}

/**
 * Loads primary light truck templates (Canter + key pickup/van variants) in parallel.
 */
export async function loadTruckTrafficTemplates(): Promise<THREE.Group[]> {
  return loadTruckTemplateGroup(TRUCK_MODEL_PATHS, buildLightTruckTemplate);
}

/**
 * Background-loads the remaining light truck (pickup/strada/van) GLB variants.
 */
export async function loadExtraTruckTrafficTemplates(): Promise<THREE.Group[]> {
  return loadTruckTemplateGroup(EXTRA_TRUCK_MODEL_PATHS, buildLightTruckTemplate);
}

function buildHeavyTruckTemplate(
  _modelPath: string,
  variantName: string,
  gltfScene: THREE.Group
): THREE.Group {
  const root = new THREE.Group();
  root.name = `HeavyTruck_${variantName}_Template`;
  const size = normalizeByTargetLength(gltfScene, Math.PI, getHeavyTruckTargetLength(variantName));
  setupTruckTemplateMaterials(gltfScene);
  assignTruckHitbox(root, size);
  root.userData.isGltfHeavyTruck = true;
  root.userData.heavyTruckVariant = variantName;
  root.add(gltfScene);
  return root;
}

/**
 * Loads heavy truck templates (dump truck, semi tractor, primary 45ft container) in parallel.
 */
export async function loadHeavyTruckTrafficTemplates(): Promise<THREE.Group[]> {
  return loadTruckTemplateGroup(HEAVY_TRUCK_MODEL_PATHS, buildHeavyTruckTemplate);
}

/**
 * Background-loads additional 45ft container color variants without delaying startup.
 */
export async function loadExtraHeavyTruckTrafficTemplates(): Promise<THREE.Group[]> {
  return loadTruckTemplateGroup(EXTRA_HEAVY_TRUCK_MODEL_PATHS, buildHeavyTruckTemplate);
}

export interface TrafficStreamCallbacks {
  onCar?: (template: THREE.Group) => void;
  onBus?: (template: THREE.Group) => void;
  onTruck?: (template: THREE.Group) => void;
  onHeavyTruck?: (template: THREE.Group) => void;
  shouldCancel?: () => boolean;
}

/**
 * Streams additional car, bus, light truck, and heavy truck variants one by one
 * with a 120ms pause between uploads so WebGL never hits a frame hitch.
 */
export async function streamExtraTrafficTemplates(
  callbacks: TrafficStreamCallbacks
): Promise<void> {
  const queue: Array<{ kind: 'car' | 'bus' | 'truck' | 'heavy'; path: string }> = [];
  const streams: Array<{ kind: 'car' | 'bus' | 'truck' | 'heavy'; paths: readonly string[] }> = [
    { kind: 'heavy', paths: EXTRA_HEAVY_TRUCK_MODEL_PATHS },
    { kind: 'car', paths: EXTRA_CAR_MODEL_PATHS },
    { kind: 'truck', paths: EXTRA_TRUCK_MODEL_PATHS },
    { kind: 'bus', paths: EXTRA_BUS_MODEL_PATHS }
  ];

  // Round-robin interleave so key archetypes (container, hatch, suv, pickup, van, ecoline)
  // land early, while irizar_i6 (last in EXTRA_BUS_MODEL_PATHS) finishes near the tail.
  const maxLen = Math.max(...streams.map((s) => s.paths.length));
  for (let i = 0; i < maxLen; i++) {
    for (const s of streams) {
      if (i < s.paths.length) {
        queue.push({ kind: s.kind, path: s.paths[i] });
      }
    }
  }

  const gltfLoader = getSharedTrafficGltfLoader();
  for (const item of queue) {
    if (callbacks.shouldCancel?.()) break;
    try {
      const gltf = await gltfLoader.loadAsync(item.path);
      if (callbacks.shouldCancel?.()) break;
      const variantName = getVariantNameFromPath(item.path);
      if (item.kind === 'car') {
        callbacks.onCar?.(buildCarTemplate(variantName, gltf.scene));
      } else if (item.kind === 'bus') {
        callbacks.onBus?.(buildBusVariantTemplate(item.path, gltf.scene));
      } else if (item.kind === 'truck') {
        callbacks.onTruck?.(buildLightTruckTemplate(item.path, variantName, gltf.scene));
      } else {
        callbacks.onHeavyTruck?.(buildHeavyTruckTemplate(item.path, variantName, gltf.scene));
      }
    } catch (err) {
      console.warn(`[taxiLoader] Failed to stream ${item.path}:`, err);
    }
    if (callbacks.shouldCancel?.()) break;
    await new Promise<void>((resolve) => setTimeout(resolve, 120));
  }
}

/**
 * Loads the optimized Fuso Canter box truck GLB centered at X/Z=0, grounded at y=0,
 * rotated PI/2 around Y so its raw +X cab faces game forward -Z, and applies
 * polygonOffset + glass depthWrite fixes for distant visibility.
 */
export async function loadTruckTrafficTemplate(): Promise<THREE.Group | null> {
  const gltfLoader = getSharedTrafficGltfLoader();
  try {
    const gltf = await gltfLoader.loadAsync(TRUCK_MODEL_PATH);
    const root = new THREE.Group();
    root.name = 'Canter_Truck_Template';

    const size = centerAndGroundScene(gltf.scene, Math.PI / 2, TRUCK_MODEL_SCALE);
    setupCanterMaterials(gltf.scene);
    assignTruckHitbox(root, size);
    root.userData.isGltfTruck = true;
    root.userData.truckVariant = 'canter';

    root.add(gltf.scene);
    return root;
  } catch (err) {
    console.warn('[taxiLoader] Failed to load xe_tai_canter.glb, using fallback:', err);
    return null;
  }
}
