import * as THREE from 'three';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  BUS_MODEL_PATH,
  DRACO_DECODER_PATH,
  TAXI_MODEL_PATH,
  TRUCK_MODEL_PATH
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
): void {
  gltfScene.rotation.y = yaw;
  gltfScene.scale.setScalar(scale);
  gltfScene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(gltfScene);
  const center = box.getCenter(new THREE.Vector3());
  gltfScene.position.set(-center.x, -box.min.y, -center.z);
  gltfScene.updateMatrixWorld(true);
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

    centerAndGroundScene(gltf.scene, Math.PI / 2, TRUCK_MODEL_SCALE);

    gltf.scene.traverse((child) => {
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
          mat.envMapIntensity = 1.15;
        }
      }
    });

    root.add(gltf.scene);
    return root;
  } catch (err) {
    console.warn('[taxiLoader] Failed to load xe_tai_canter.glb, using fallback:', err);
    return null;
  }
}
