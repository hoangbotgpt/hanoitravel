import * as THREE from 'three';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACO_DECODER_PATH, type DestinationKey } from '../config/gameConfig.ts';

export interface LandmarkGlbConfig {
  key: DestinationKey;
  path: string;
  targetWidth: number;
  offsetAhead: number;
  yawOffset: number;
  preserveGroundOriginY?: boolean;
  yOffset?: number;
}

export interface LoadedDestinationLandmark {
  group: THREE.Group;
  config: LandmarkGlbConfig;
}

export const DESTINATION_LANDMARK_MANIFEST: Partial<Record<DestinationKey, LandmarkGlbConfig>> = {
  my_dinh: {
    key: 'my_dinh',
    path: '/assets/landmarks/my_dinh_stadium.glb',
    targetWidth: 182,
    offsetAhead: 95,
    yawOffset: 0
  },
  quan_su: {
    key: 'quan_su',
    path: '/assets/landmarks/military_museum.glb',
    targetWidth: 220,
    offsetAhead: 64,
    yawOffset: 0
  },
  vinuni: {
    key: 'vinuni',
    path: '/assets/landmarks/vinuni_campus.glb',
    targetWidth: 170,
    offsetAhead: 97,
    yawOffset: 0
  },
  nha_hat_lon: {
    key: 'nha_hat_lon',
    path: '/assets/landmarks/nha_hat_lon.glb',
    targetWidth: 140,
    offsetAhead: 84,
    yawOffset: 0,
    preserveGroundOriginY: true,
    yOffset: 0.02
  },
  lang_bac: {
    key: 'lang_bac',
    path: '/assets/landmarks/lang_bac.glb',
    targetWidth: 96,
    offsetAhead: 46,
    yawOffset: 0,
    preserveGroundOriginY: true,
    yOffset: 0.02
  },
  cot_co: {
    key: 'cot_co',
    path: '/assets/landmarks/cot_co.glb',
    targetWidth: 90,
    offsetAhead: 57,
    yawOffset: 0,
    preserveGroundOriginY: true,
    yOffset: 0.02
  },
  nha_tho_lon: {
    key: 'nha_tho_lon',
    path: '/assets/landmarks/nha_tho_lon.glb',
    targetWidth: 120,
    offsetAhead: 78,
    yawOffset: 0,
    preserveGroundOriginY: true,
    yOffset: 0.02
  },
  ho_hoan_kiem: {
    key: 'ho_hoan_kiem',
    path: '/assets/landmarks/thap_rua.glb',
    targetWidth: 220,
    offsetAhead: 82,
    yawOffset: 0,
    preserveGroundOriginY: true,
    yOffset: -0.04
  },
  ga_ha_noi: {
    key: 'ga_ha_noi',
    path: '/assets/landmarks/ga_ha_noi.glb',
    targetWidth: 220,
    offsetAhead: 49,
    yawOffset: 0,
    preserveGroundOriginY: true,
    yOffset: 0.02
  }
};

const FLAT_SHADOW_EXCLUDE_PATTERN =
  /ground|plaza|field|track|water|surroundings|podium|mat_?ho|san_?gach|san_?da(?!_)|san_?dat|san_?do|nt_san|nt_duong|ga_duong|ga_ray|mat_duong|tr_dat/i;

let sharedLandmarkDracoLoader: DRACOLoader | null = null;
let sharedLandmarkGltfLoader: GLTFLoader | null = null;

function getSharedLandmarkGltfLoader(): GLTFLoader {
  if (!sharedLandmarkGltfLoader) {
    sharedLandmarkDracoLoader = new DRACOLoader();
    sharedLandmarkDracoLoader.setDecoderPath(DRACO_DECODER_PATH);
    sharedLandmarkGltfLoader = new GLTFLoader();
    sharedLandmarkGltfLoader.setDRACOLoader(sharedLandmarkDracoLoader);
    sharedLandmarkGltfLoader.setMeshoptDecoder(MeshoptDecoder);
  }
  return sharedLandmarkGltfLoader;
}

export function disposeLandmarkLoaderWorkers(): void {
  if (sharedLandmarkDracoLoader) {
    sharedLandmarkDracoLoader.dispose();
    sharedLandmarkDracoLoader = null;
  }
  sharedLandmarkGltfLoader = null;
}

export function disposeLandmarkObject(root: THREE.Object3D | null | undefined): void {
  if (!root) return;
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();

  root.traverse((child) => {
    if (!(child as THREE.Mesh).isMesh) return;
    const mesh = child as THREE.Mesh;
    if (mesh.geometry) geometries.add(mesh.geometry);
    const matList = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of matList) {
      if (!mat) continue;
      materials.add(mat);
      const std = mat as THREE.MeshStandardMaterial;
      for (const tex of [
        std.map,
        std.normalMap,
        std.roughnessMap,
        std.metalnessMap,
        std.emissiveMap,
        std.alphaMap,
        std.aoMap
      ]) {
        if (tex) textures.add(tex);
      }
    }
  });

  textures.forEach((t) => t.dispose());
  materials.forEach((m) => m.dispose());
  geometries.forEach((g) => g.dispose());
}

/**
 * Lazily loads, normalizes, and configures selective shadows & emissive accents
 * for a stage's hero destination GLB (returning null when no GLB is registered yet).
 */
export async function loadDestinationLandmarkGlb(
  key: DestinationKey
): Promise<LoadedDestinationLandmark | null> {
  const config = DESTINATION_LANDMARK_MANIFEST[key];
  if (!config) return null;

  const loader = getSharedLandmarkGltfLoader();
  try {
    const gltf = await loader.loadAsync(config.path);
    const modelRoot = gltf.scene;
    modelRoot.updateMatrixWorld(true);

    const meshBox = new THREE.Box3();
    const meshSize = new THREE.Vector3();

    modelRoot.traverse((child) => {
      if (!(child as THREE.Mesh).isMesh) return;
      const mesh = child as THREE.Mesh;
      meshBox.setFromObject(mesh);
      meshBox.getSize(meshSize);

      const mats = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).filter(
        (m): m is THREE.Material => Boolean(m)
      );

      const nameMatchesFlat =
        FLAT_SHADOW_EXCLUDE_PATTERN.test(mesh.name) ||
        mats.some((m) => FLAT_SHADOW_EXCLUDE_PATTERN.test(m.name));
      const isFlatSurface = nameMatchesFlat || meshSize.y < 1.5;

      mesh.receiveShadow = true;
      mesh.castShadow = !isFlatSurface;

      for (const mat of mats) {
        if (mat instanceof THREE.MeshStandardMaterial) {
          const lowerName = mat.name.toLowerCase();
          if (
            lowerName.includes('lamp') ||
            lowerName.includes('flame') ||
            lowerName.includes('bongden') ||
            lowerName.includes('denvang')
          ) {
            if (mat.emissive.getHex() === 0) {
              mat.emissive.setHex(lowerName.includes('flame') ? 0xff7b29 : 0xffe4a8);
            }
            mat.emissiveIntensity = Math.max(
              mat.emissiveIntensity ?? 1,
              lowerName.includes('flame') ? 1.85 : 1.45
            );
          }
          mat.envMapIntensity = Math.max(mat.envMapIntensity ?? 1, 1.15);
        }
      }
    });

    const rawBox = new THREE.Box3().setFromObject(modelRoot);
    const rawSize = rawBox.getSize(new THREE.Vector3());
    const scale = config.targetWidth / Math.max(0.01, rawSize.x);
    modelRoot.scale.setScalar(scale);
    modelRoot.updateMatrixWorld(true);

    const scaledBox = new THREE.Box3().setFromObject(modelRoot);
    const center = scaledBox.getCenter(new THREE.Vector3());
    const groundedY = config.preserveGroundOriginY
      ? (config.yOffset ?? 0)
      : -scaledBox.min.y + (config.yOffset ?? 0);
    modelRoot.position.set(-center.x, groundedY, -center.z);
    modelRoot.updateMatrixWorld(true);

    const group = new THREE.Group();
    group.name = `LandmarkGLB_${key}`;
    group.add(modelRoot);

    return { group, config };
  } catch (err) {
    console.warn(`[landmarkLoader] Failed to load ${config.path}, keeping procedural fallback:`, err);
    return null;
  }
}
