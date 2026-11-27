import * as THREE from 'three';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  applyShipperOutfit,
  bindRiderRig,
  buildRiderRig,
  patchOutfitMaterial,
  type RiderRig
} from './riderRig.ts';
import { seatedPose } from '../core/riderPose.ts';
import { HANOI_PALETTE } from '../config/artPalette.ts';
import {
  BIKES,
  DRACO_DECODER_PATH,
  PLAYER_HALF_L,
  type BikeId
} from '../config/gameConfig.ts';

const DRIVER_MODEL_PATH = '/assets/models/driver.glb';
const DRIVER_HIP_RAW_Y = -0.09;

interface DriverPoseProfile {
  scale: number;
  /** Pelvis-joint height of the seated rider above the ground (bike upright). */
  seatY: number;
  seatZ: number;
  /** Right handlebar grip centre (left is mirrored), bike-local metres. */
  grip: [number, number, number];
  /** Right foot rest / floorboard contact (left is mirrored). */
  foot: [number, number, number];
  boxCenterY: number;
  boxZ: number;
  strutBottomY: number;
  /** Phone holder on the handlebar (bike-local, metres). */
  phonePos: [number, number, number];
  /** Rear Vietnamese licence plate. */
  platePos: [number, number, number];
  plateTilt: number;
  plateNumber: [string, string];
}

// Grip / seat / foot positions were measured from the normalized GLB geometry.
const DRIVER_PROFILES: Record<BikeId, DriverPoseProfile> = {
  honda: {
    scale: 1.32,
    seatY: 0.84,
    seatZ: 0.14,
    grip: [0.285, 0.955, -0.26],
    foot: [0.19, 0.31, 0.04],
    boxCenterY: 0.9,
    boxZ: 0.78,
    strutBottomY: 0.68,
    phonePos: [0.1, 1.08, -0.29],
    platePos: [0, 0.5, 0.975],
    plateTilt: -0.12,
    plateNumber: ['29-B1', '386.68']
  },
  vinfast: {
    scale: 1.34,
    seatY: 0.87,
    seatZ: 0.07,
    grip: [0.34, 0.99, -0.325],
    foot: [0.13, 0.3, -0.19],
    boxCenterY: 1.1,
    boxZ: 0.7,
    strutBottomY: 0.86,
    phonePos: [0.1, 1.13, -0.32],
    platePos: [0, 0.42, 0.93],
    plateTilt: -0.3,
    plateNumber: ['30-MĐ1', '579.39']
  },
  suzuki_rgv: {
    scale: 1.32,
    seatY: 0.8,
    seatZ: 0.14,
    grip: [0.27, 0.92, -0.34],
    foot: [0.18, 0.3, 0.05],
    boxCenterY: 0.88,
    boxZ: 0.76,
    strutBottomY: 0.66,
    phonePos: [0.09, 1.02, -0.34],
    platePos: [0, 0.48, 0.94],
    plateTilt: -0.18,
    plateNumber: ['29-S1', '120.98']
  },
  suzuki_gsxs: {
    scale: 1.32,
    seatY: 0.83,
    seatZ: 0.14,
    grip: [0.31, 0.94, -0.35],
    foot: [0.19, 0.34, 0.12],
    boxCenterY: 0.94,
    boxZ: 0.74,
    strutBottomY: 0.72,
    phonePos: [0.09, 1.03, -0.36],
    platePos: [0, 0.56, 0.96],
    plateTilt: -0.22,
    plateNumber: ['29-A1', '999.68']
  }
};

const GRIP_PALM_LIFT = 0.025;

let sharedBikeDracoLoader: DRACOLoader | null = null;
let sharedBikeGltfLoader: GLTFLoader | null = null;

function getSharedBikeGltfLoader(): GLTFLoader {
  if (!sharedBikeGltfLoader) {
    sharedBikeDracoLoader = new DRACOLoader();
    sharedBikeDracoLoader.setDecoderPath(DRACO_DECODER_PATH);
    sharedBikeGltfLoader = new GLTFLoader();
    sharedBikeGltfLoader.setDRACOLoader(sharedBikeDracoLoader);
    sharedBikeGltfLoader.setMeshoptDecoder(MeshoptDecoder);
  }
  return sharedBikeGltfLoader;
}

/** Disposes shared Draco web workers after bike GLB loading completes. */
export function disposeBikeLoaderWorkers(): void {
  if (sharedBikeDracoLoader) {
    sharedBikeDracoLoader.dispose();
    sharedBikeDracoLoader = null;
  }
  sharedBikeGltfLoader = null;
}

const bikeTemplateCache = new Map<BikeId, Promise<THREE.Group>>();
const standingDriverTemplateCache = new Map<BikeId, Promise<THREE.Group | null>>();
let rawDriverGltfPromise: Promise<THREE.Group | null> | null = null;

const BRAKE_LIGHT_POS: Record<BikeId, [number, number, number]> = {
  honda: [0, 0.65, 0.94],
  vinfast: [0, 0.62, 0.91],
  suzuki_rgv: [0, 0.64, 0.92],
  suzuki_gsxs: [0, 0.78, 0.92]
};

const isolatedBrakeMeshes = new WeakSet<THREE.Mesh>();
const cachedSeatedRigMap = new WeakMap<THREE.Object3D, RiderRig | null>();
const savedSeatedLegPoses = new WeakMap<
  THREE.Object3D,
  { thighL: THREE.Quaternion; shinL: THREE.Quaternion }
>();
const stoppedPoseState = new WeakMap<THREE.Object3D, boolean>();

export interface BrakeLightHandle {
  group: THREE.Group;
  lensMaterial: THREE.MeshStandardMaterial;
  glowMesh: THREE.Mesh;
  glowMaterial: THREE.MeshBasicMaterial;
  setBraking: (braking: boolean) => void;
}

export interface BikeRigHandles {
  root: THREE.Group;
  bikeAssembly: THREE.Group;
  seatedRider: THREE.Group | null;
  standingRider: THREE.Group | null;
  deliveryBox: THREE.Group | null;
  brakeLight: BrakeLightHandle | null;
}

function bindBrakeLightHandle(root: THREE.Object3D): BrakeLightHandle | null {
  const group = root.getObjectByName('BrakeLight') as THREE.Group | undefined;
  if (!group) return null;
  const lensMesh = group.getObjectByName('BrakeLens') as THREE.Mesh | undefined;
  const glowMesh = group.getObjectByName('BrakeGlow') as THREE.Mesh | undefined;
  if (!lensMesh || !glowMesh) return null;

  if (!isolatedBrakeMeshes.has(lensMesh)) {
    lensMesh.material = (lensMesh.material as THREE.MeshStandardMaterial).clone();
    isolatedBrakeMeshes.add(lensMesh);
  }
  if (!isolatedBrakeMeshes.has(glowMesh)) {
    glowMesh.material = (glowMesh.material as THREE.MeshBasicMaterial).clone();
    isolatedBrakeMeshes.add(glowMesh);
  }

  const lensMaterial = lensMesh.material as THREE.MeshStandardMaterial;
  const glowMaterial = glowMesh.material as THREE.MeshBasicMaterial;

  const setBraking = (braking: boolean) => {
    lensMaterial.emissiveIntensity = braking ? 3.4 : 0.45;
    glowMesh.visible = braking;
    glowMaterial.opacity = braking ? 0.72 : 0;
  };

  return {
    group,
    lensMaterial,
    glowMesh,
    glowMaterial,
    setBraking
  };
}

export function extractBikeRig(root: THREE.Object3D): BikeRigHandles {
  const r = root as THREE.Group;
  const bikeAssembly =
    (root.getObjectByName('BikeAssembly') as THREE.Group | undefined) ?? r;
  const seatedRider =
    (root.getObjectByName('SeatedRider') as THREE.Group | undefined) ?? null;
  const standingRider =
    (root.getObjectByName('StandingRider') as THREE.Group | undefined) ?? null;
  const deliveryBox =
    (root.getObjectByName('DeliveryBox') as THREE.Group | undefined) ?? null;
  const brakeLight = bindBrakeLightHandle(root);
  return { root: r, bikeAssembly, seatedRider, standingRider, deliveryBox, brakeLight };
}

export function setBikeBrakeLight(
  handles: BikeRigHandles | null,
  braking: boolean
): void {
  handles?.brakeLight?.setBraking(braking);
}

const STOP_POSE_AXIS_X = new THREE.Vector3(1, 0, 0);
const STOP_POSE_AXIS_Z = new THREE.Vector3(0, 0, 1);
const _stopQuatA = new THREE.Quaternion();
const _stopQuatB = new THREE.Quaternion();

export function setBikeStoppedPose(
  handles: BikeRigHandles | null,
  stopped: boolean
): void {
  if (!handles) return;
  const wasStopped = stoppedPoseState.get(handles.root) ?? false;
  if (wasStopped === stopped) return;
  stoppedPoseState.set(handles.root, stopped);

  const rider = handles.seatedRider;
  let rig = rider ? cachedSeatedRigMap.get(rider) : undefined;
  if (rider && rig === undefined) {
    rig = bindRiderRig(rider);
    cachedSeatedRigMap.set(rider, rig);
  }

  if (stopped) {
    handles.bikeAssembly.rotation.z = 0.032;
    if (rider && rig) {
      if (!savedSeatedLegPoses.has(rider)) {
        savedSeatedLegPoses.set(rider, {
          thighL: rig.bones.thighL.quaternion.clone(),
          shinL: rig.bones.shinL.quaternion.clone()
        });
      }
      // Drop left foot down and slightly outward to prop the bike at 0 km/h
      _stopQuatA.setFromAxisAngle(STOP_POSE_AXIS_Z, -0.34);
      _stopQuatB.setFromAxisAngle(STOP_POSE_AXIS_X, 0.36);
      rig.bones.thighL.quaternion.copy(_stopQuatA).multiply(_stopQuatB);
      rig.bones.shinL.quaternion.setFromAxisAngle(STOP_POSE_AXIS_X, -0.38);
    }
  } else {
    handles.bikeAssembly.rotation.z = 0;
    if (rider && rig) {
      const saved = savedSeatedLegPoses.get(rider);
      if (saved) {
        rig.bones.thighL.quaternion.copy(saved.thighL);
        rig.bones.shinL.quaternion.copy(saved.shinL);
      }
    }
  }
}

let cachedBoxLabelTexture: THREE.Texture | null = null;

function createHeadlessFallbackTexture(r: number, g: number, b: number): THREE.DataTexture {
  const tex = new THREE.DataTexture(new Uint8Array([r, g, b, 255]), 1, 1, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function getDeliveryBoxLabelTexture(): THREE.Texture {
  if (cachedBoxLabelTexture) return cachedBoxLabelTexture;
  if (typeof document === 'undefined') {
    cachedBoxLabelTexture = createHeadlessFallbackTexture(22, 128, 75);
    return cachedBoxLabelTexture;
  }

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#16804b';
    ctx.fillRect(0, 0, 256, 128);

    // Retro amber signboard border & stripe
    ctx.strokeStyle = '#e8a838';
    ctx.lineWidth = 8;
    ctx.strokeRect(8, 8, 240, 112);

    ctx.fillStyle = '#f6eedc';
    ctx.font = 'bold 28px "Be Vietnam Pro", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('HANOI', 128, 46);

    ctx.fillStyle = '#ffcd00';
    ctx.font = 'bold 24px "Be Vietnam Pro", sans-serif';
    ctx.fillText('SHIPPER', 128, 84);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  cachedBoxLabelTexture = tex;
  return tex;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function rotatePointAroundPivot(
  px: number,
  py: number,
  pz: number,
  ox: number,
  oy: number,
  oz: number,
  axis: 'x' | 'y' | 'z',
  angle: number
): [number, number, number] {
  const dx = px - ox;
  const dy = py - oy;
  const dz = pz - oz;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  if (axis === 'y') {
    return [ox + dx * c + dz * s, oy + dy, oz - dx * s + dz * c];
  }
  if (axis === 'z') {
    return [ox + dx * c - dy * s, oy + dx * s + dy * c, oz + dz];
  }
  return [ox + dx, oy + dy * c - dz * s, oz + dy * s + dz * c];
}

function createRiderHelmet(leanPitch: number): THREE.Group {
  const helmet = new THREE.Group();
  helmet.name = 'RiderHelmet';

  const shellMat = new THREE.MeshStandardMaterial({
    color: 0xd98a2b, // Classic Hanoi retro warm-amber helmet
    roughness: 0.34,
    metalness: 0.18,
    envMapIntensity: 1.35
  });
  const stripeMat = new THREE.MeshStandardMaterial({
    color: 0xf6eedc,
    roughness: 0.38
  });
  const visorMat = new THREE.MeshStandardMaterial({
    color: 0x182028,
    roughness: 0.16,
    metalness: 0.65,
    envMapIntensity: 1.5
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: 0x201d1a,
    roughness: 0.72
  });

  // Main 3/4 outer shell covering crown, back, and ears cleanly
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(0.156, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.72),
    shellMat
  );
  dome.rotation.x = -0.14;
  dome.scale.set(1.06, 1.04, 1.15);
  helmet.add(dome);

  // Chin strap with a little buckle
  const strapMat = new THREE.MeshStandardMaterial({ color: 0x2b2a28, roughness: 0.85 });
  for (const sx of [-1, 1]) {
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.11, 0.016), strapMat);
    strap.position.set(sx * 0.118, -0.115, -0.03);
    strap.rotation.z = sx * 0.32;
    strap.rotation.x = 0.25;
    helmet.add(strap);
  }
  const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.012, 0.02), visorMat);
  buckle.position.set(0, -0.165, -0.06);
  helmet.add(buckle);

  // Tiny vent slots on the crown - retro detail
  for (const sx of [-0.035, 0.035]) {
    const vent = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.008, 0.05), trimMat);
    vent.position.set(sx, 0.158, -0.02);
    vent.rotation.x = -0.25;
    helmet.add(vent);
  }

  // Subtle flush cream center racing stripe
  const stripe = new THREE.Mesh(
    new THREE.SphereGeometry(0.158, 12, 10, -Math.PI * 0.08 + Math.PI * 0.5, Math.PI * 0.16, 0, Math.PI * 0.65),
    stripeMat
  );
  stripe.rotation.y = Math.PI / 2;
  stripe.rotation.x = -0.14;
  stripe.scale.set(1.06, 1.04, 1.15);
  helmet.add(stripe);

  // Black rubber rim trim & smoked sun peak/visor
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.148, 0.014, 8, 22), trimMat);
  rim.rotation.x = Math.PI / 2 - 0.14;
  rim.scale.set(1.05, 1.14, 1);
  rim.position.set(0, -0.045, 0.005);
  helmet.add(rim);

  // Short sun peak at the front, the classic Hanoi 3/4 "non bao hiem" look
  const peak = new THREE.Mesh(
    new THREE.CylinderGeometry(0.168, 0.172, 0.012, 18, 1, false, Math.PI - 0.62, 1.24),
    shellMat
  );
  peak.scale.set(1.05, 1, 1.16);
  peak.position.set(0, -0.05, 0.004);
  peak.rotation.x = -0.14;
  helmet.add(peak);

  helmet.scale.setScalar(1.07);
  helmet.rotation.x = -leanPitch * 0.85;
  helmet.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
  return helmet;
}

/**
 * Poses the adult de-chibi driver into a natural standing/running athletic posture
 * with boots grounded at local y = 0 and arms lowered cleanly along the sides.
 */
function poseStandingDriverGeometry(geometry: THREE.BufferGeometry): {
  headX: number;
  headY: number;
  minY: number;
} {
  const posAttr = geometry.getAttribute('POSITION') ?? geometry.getAttribute('position');
  if (!posAttr) return { headX: 0, headY: 0.42, minY: -0.7 };

  const H = DRIVER_HIP_RAW_Y; // -0.09
  const NECK_Y = 0.20;
  const LEG_STRETCH = 1.48;
  const TORSO_STRETCH = 1.38;
  const HEAD_SCALE = 0.6;
  const ARM_STRETCH = 1.02;

  const NEW_NECK_Y = H + (NECK_Y - H) * TORSO_STRETCH;
  const NEW_SH_Y = H + (0.12 - H) * TORSO_STRETCH;

  let headSumX = 0;
  let headSumY = 0;
  let headCount = 0;
  let minY = Infinity;

  for (let i = 0; i < posAttr.count; i++) {
    const origX = posAttr.getX(i);
    const origY = posAttr.getY(i);
    const origZ = posAttr.getZ(i);

    let x = origX;
    let z = origZ;
    let y: number;

    if (origY < H) {
      y = H + (origY - H) * LEG_STRETCH;
    } else if (origY <= NECK_Y) {
      y = H + (origY - H) * TORSO_STRETCH;
    } else {
      y = NEW_NECK_Y + (origY - NECK_Y) * HEAD_SCALE;
    }

    const headW = smoothstep(0.18, 0.23, origY);
    if (headW > 0) {
      const s = 1 - (1 - HEAD_SCALE) * headW;
      x *= s;
      z *= s;
    }

    const legSlimW = smoothstep(-0.07, -0.14, origY);
    if (legSlimW > 0) {
      x *= 1 - 0.06 * legSlimW;
      z *= 1 - 0.04 * legSlimW;
    }

    const shoulderW = smoothstep(-0.05, 0.04, origY) * (1 - headW);
    if (shoulderW > 0) {
      z *= 1 + 0.08 * shoulderW;
    }

    const armW = smoothstep(0.125, 0.19, Math.abs(origZ)) * smoothstep(-0.04, 0.05, origY);
    if (armW > 0) {
      const sign = origZ >= 0 ? 1 : -1;
      const absZ = Math.abs(z);
      if (absZ > 0.14) {
        z = sign * (0.14 + (absZ - 0.14) * (1 + (ARM_STRETCH - 1) * armW));
      }
      const shZ = sign * 0.15;
      // Lower arms cleanly toward torso sides so standing & running silhouette feels natural
      [x, y, z] = rotatePointAroundPivot(x, y, z, 0, NEW_SH_Y, shZ, 'x', sign * 1.42 * armW);
      [x, y, z] = rotatePointAroundPivot(x, y, z, 0, NEW_SH_Y, shZ, 'z', 0.14 * armW);
    }

    if (origY > 0.25 && origY < 0.47 && Math.abs(origZ) < 0.14) {
      headSumX += x;
      headSumY += y;
      headCount += 1;
    }
    if (y < minY) minY = y;

    posAttr.setXYZ(i, x, y, z);
  }

  posAttr.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  return {
    headX: headCount > 0 ? headSumX / headCount : 0,
    headY: headCount > 0 ? headSumY / headCount : 0.42,
    minY: Number.isFinite(minY) ? minY : -0.7
  };
}

/**
 * Builds the articulated (skinned, 11-bone) crash rider used for the thrown-off /
 * get-up / run-back sequence. Falls back to the rigid standing pose if skinning fails.
 */
function buildArticulatedRider(rawDriver: THREE.Group, bikeId: BikeId): THREE.Group {
  const p = DRIVER_PROFILES[bikeId];
  const rig = buildRiderRig(rawDriver, p.scale);
  if (!rig) return normalizeStandingDriverScene(rawDriver, bikeId);

  const helmet = createRiderHelmet(0);
  // Sized to the adult (de-chibi) head so the face stays visible under the rim
  helmet.scale.setScalar(0.8);
  helmet.position.set(0, 0.03, 0.006);
  rig.headSocket.add(helmet);

  const driverRoot = rig.root;
  driverRoot.name = 'StandingRider';
  driverRoot.visible = false;
  driverRoot.updateMatrixWorld(true);
  return driverRoot;
}

function normalizeStandingDriverScene(rawDriver: THREE.Group, bikeId: BikeId): THREE.Group {
  const p = DRIVER_PROFILES[bikeId];
  const driverRoot = new THREE.Group();
  driverRoot.name = 'StandingRider';

  const pivot = new THREE.Group();
  pivot.add(rawDriver);
  driverRoot.add(pivot);

  let posed = { headX: 0, headY: 0.42, minY: -0.7 };
  rawDriver.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.geometry = mesh.geometry.clone();
    applyShipperOutfit(mesh.geometry);
    posed = poseStandingDriverGeometry(mesh.geometry);
    mesh.material = (mesh.material as THREE.Material).clone();
    patchOutfitMaterial(mesh.material as THREE.Material);

    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of materials) {
      if (mat && 'metalness' in mat) {
        const stdMat = mat as THREE.MeshStandardMaterial;
        stdMat.metalness = Math.min(stdMat.metalness, 0.08);
        stdMat.roughness = Math.max(stdMat.roughness, 0.58);
        stdMat.envMapIntensity = 0.85;
      }
    }
  });

  // Ground boots cleanly at y = 0 in StandingRider local space
  pivot.rotation.y = Math.PI / 2;
  pivot.scale.setScalar(p.scale);
  pivot.position.set(0, -posed.minY * p.scale, 0);

  const helmet = createRiderHelmet(0);
  helmet.position.set(
    0,
    (posed.headY - posed.minY) * p.scale - 0.008,
    -posed.headX * p.scale + 0.01
  );
  driverRoot.add(helmet);

  driverRoot.visible = false;
  driverRoot.updateMatrixWorld(true);
  return driverRoot;
}

async function fetchRawDriverGltf(): Promise<THREE.Group | null> {
  try {
    const gltf = await getSharedBikeGltfLoader().loadAsync(DRIVER_MODEL_PATH);
    return gltf.scene;
  } catch (err) {
    console.warn('[bikeLoader] Could not load driver.glb, using fallback rider:', err);
    return null;
  }
}

async function getStandingDriverInstance(bikeId: BikeId): Promise<THREE.Group | null> {
  let pending = standingDriverTemplateCache.get(bikeId);
  if (!pending) {
    pending = (async () => {
      if (!rawDriverGltfPromise) {
        rawDriverGltfPromise = fetchRawDriverGltf();
      }
      const raw = await rawDriverGltfPromise;
      if (!raw) return null;
      return buildArticulatedRider(raw.clone(true), bikeId);
    })();
    standingDriverTemplateCache.set(bikeId, pending);
  }
  const template = await pending;
  return template ? (SkeletonUtils.clone(template) as THREE.Group) : null;
}

/**
 * Fallback procedural rider used only if /assets/models/driver.glb cannot be loaded.
 */
function createFallbackProceduralRider(): THREE.Group {
  const group = new THREE.Group();
  const jacketMat = new THREE.MeshStandardMaterial({ color: HANOI_PALETTE.shipperGreen, roughness: 0.75 });
  const pantsMat = new THREE.MeshStandardMaterial({ color: 0x262d38, roughness: 0.85 });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xe3b18a, roughness: 0.75 });
  const helmetMat = new THREE.MeshStandardMaterial({ color: HANOI_PALETTE.shipperAmber, roughness: 0.4 });

  const hips = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.14, 0.24), pantsMat);
  hips.position.set(0, 0.05, 0);
  group.add(hips);

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.44, 0.22), jacketMat);
  torso.position.set(0, 0.3, -0.05);
  torso.rotation.x = -0.24;
  group.add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.115, 10, 8), skinMat);
  head.position.set(0, 0.62, -0.1);
  group.add(head);

  const helmet = new THREE.Mesh(
    new THREE.SphereGeometry(0.135, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.62),
    helmetMat
  );
  helmet.position.set(0, 0.63, -0.1);
  group.add(helmet);

  return group;
}

/**
 * Builds the rear insulated HANOI SHIPPER delivery box positioned cleanly above
 * the rear rack so zero geometry from Honda or VinFast clips through the box.
 */
function createDeliveryBox(bikeId: BikeId): THREE.Group {
  const p = DRIVER_PROFILES[bikeId];

  const boxGroup = new THREE.Group();
  boxGroup.name = 'DeliveryBox';
  boxGroup.position.set(0, p.boxCenterY, p.boxZ);

  const steelMat = new THREE.MeshStandardMaterial({
    color: HANOI_PALETTE.ironBalcony,
    roughness: 0.45,
    metalness: 0.62
  });

  const rackBase = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.035, 0.3), steelMat);
  rackBase.position.y = -0.16;
  boxGroup.add(rackBase);

  // Support struts connecting base rack down to bike frame/grab-rail
  const strutHeight = Math.max(0.06, p.boxCenterY - 0.16 - p.strutBottomY);
  const strutGeo = new THREE.BoxGeometry(0.035, strutHeight, 0.035);
  for (const sx of [-0.12, 0.12]) {
    const strut = new THREE.Mesh(strutGeo, steelMat);
    strut.position.set(sx, -0.16 - strutHeight * 0.5, -0.04);
    boxGroup.add(strut);
  }

  const boxBody = new THREE.Mesh(
    new THREE.BoxGeometry(0.35, 0.29, 0.32),
    new THREE.MeshStandardMaterial({
      color: HANOI_PALETTE.shipperGreen,
      roughness: 0.48,
      metalness: 0.08
    })
  );
  boxGroup.add(boxBody);

  const boxLid = new THREE.Mesh(
    new THREE.BoxGeometry(0.375, 0.05, 0.345),
    new THREE.MeshStandardMaterial({ color: HANOI_PALETTE.shipperAmber, roughness: 0.42 })
  );
  boxLid.position.y = 0.155;
  boxGroup.add(boxLid);

  // Protective black rubber corner piping & elasticated bungee tie straps
  const strapMat = new THREE.MeshStandardMaterial({ color: 0x1e2024, roughness: 0.78 });
  for (const sz of [-0.09, 0.09]) {
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.39, 0.35, 0.026), strapMat);
    strap.position.set(0, 0.01, sz);
    boxGroup.add(strap);
  }
  const latchGeo = new THREE.BoxGeometry(0.05, 0.065, 0.035);
  for (const sx of [-0.11, 0.11]) {
    const latch = new THREE.Mesh(latchGeo, steelMat);
    latch.position.set(sx, 0.125, 0.168);
    boxGroup.add(latch);
  }

  const labelPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(0.3, 0.18),
    new THREE.MeshBasicMaterial({ map: getDeliveryBoxLabelTexture() })
  );
  labelPlane.position.set(0, 0.005, 0.162);
  boxGroup.add(labelPlane);

  boxGroup.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  return boxGroup;
}

const plateTextureCache = new Map<string, THREE.Texture>();

function getPlateTexture(lines: [string, string]): THREE.Texture {
  const key = lines.join('|');
  const cached = plateTextureCache.get(key);
  if (cached) return cached;
  if (typeof document === 'undefined') {
    const tex = createHeadlessFallbackTexture(244, 241, 232);
    plateTextureCache.set(key, tex);
    return tex;
  }
  const canvas = document.createElement('canvas');
  canvas.width = 192;
  canvas.height = 144;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#f4f1e8';
    ctx.fillRect(0, 0, 192, 144);
    ctx.strokeStyle = '#1b1b1b';
    ctx.lineWidth = 7;
    ctx.strokeRect(6, 6, 180, 132);
    ctx.fillStyle = '#1b1b1b';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 50px "Be Vietnam Pro", sans-serif';
    ctx.fillText(lines[0], 96, 44);
    ctx.fillText(lines[1], 96, 104);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  plateTextureCache.set(key, tex);
  return tex;
}

let phoneScreenTexture: THREE.Texture | null = null;

/** Little delivery-app map on the phone screen: route line from A to B. */
function getPhoneScreenTexture(): THREE.Texture {
  if (phoneScreenTexture) return phoneScreenTexture;
  if (typeof document === 'undefined') {
    phoneScreenTexture = createHeadlessFallbackTexture(223, 233, 210);
    return phoneScreenTexture;
  }
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#dfe9d2';
    ctx.fillRect(0, 0, 64, 128);
    ctx.strokeStyle = '#f7f3e6';
    ctx.lineWidth = 7;
    for (const y of [30, 70, 104]) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(64, y - 10);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(22, 0);
    ctx.lineTo(30, 128);
    ctx.stroke();
    ctx.strokeStyle = '#16804b';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(14, 112);
    ctx.lineTo(28, 66);
    ctx.lineTo(48, 62);
    ctx.lineTo(50, 18);
    ctx.stroke();
    ctx.fillStyle = '#e8a838';
    ctx.beginPath();
    ctx.arc(50, 18, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#16804b';
    ctx.fillRect(0, 0, 64, 12);
  }
  phoneScreenTexture = new THREE.CanvasTexture(canvas);
  phoneScreenTexture.colorSpace = THREE.SRGBColorSpace;
  return phoneScreenTexture;
}

/**
 * Small low-poly details that make the bikes read as a working Hanoi shipper ride:
 * phone holder with a delivery map, a pink plastic bag on the grip, and a proper
 * two-line Hanoi licence plate.
 */
function createBikeAccessories(bikeId: BikeId): THREE.Group {
  const p = DRIVER_PROFILES[bikeId];
  const group = new THREE.Group();
  group.name = 'BikeAccessories';

  const blackMat = new THREE.MeshStandardMaterial({ color: 0x1d1f22, roughness: 0.6 });

  // Phone holder: clamp arm + cradle + phone tilted toward the rider
  const phone = new THREE.Group();
  phone.name = 'PhoneHolder';
  phone.position.set(...p.phonePos);
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.07, 6), blackMat);
  arm.position.y = -0.035;
  phone.add(arm);
  const cradle = new THREE.Group();
  cradle.rotation.x = -0.75; // screen faces up & back toward the rider
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.14, 0.012), blackMat);
  cradle.add(body);
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.064, 0.126),
    new THREE.MeshBasicMaterial({ map: getPhoneScreenTexture() })
  );
  screen.position.z = 0.0065;
  cradle.add(screen);
  for (const sx of [-1, 1]) {
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.03, 0.022), blackMat);
    grip.position.set(sx * 0.042, 0, 0.002);
    cradle.add(grip);
  }
  phone.add(cradle);
  group.add(phone);

  // Pink plastic bag (tui nilon) knotted to the left grip
  const bagMat = new THREE.MeshStandardMaterial({
    color: 0xf08aa6,
    roughness: 0.5,
    transparent: true,
    opacity: 0.92
  });
  const bag = new THREE.Group();
  bag.name = 'PlasticBag';
  bag.position.set(-(p.grip[0] - 0.085), p.grip[1] - 0.005, p.grip[2]);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.006, 5, 10), bagMat);
  handle.rotation.y = Math.PI / 2;
  bag.add(handle);
  const sack = new THREE.Mesh(new THREE.IcosahedronGeometry(0.085, 0), bagMat);
  sack.scale.set(0.85, 1.15, 0.75);
  sack.position.y = -0.12;
  sack.rotation.set(0.2, 0.4, 0.1);
  bag.add(sack);
  const produce = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.03, 0),
    new THREE.MeshStandardMaterial({ color: 0x6fae3b, roughness: 0.8 })
  );
  produce.position.set(0.01, -0.05, 0.0);
  bag.add(produce); // a bunch of herbs peeking out of the top
  group.add(bag);

  // Rear licence plate with bracket
  const plate = new THREE.Group();
  plate.name = 'LicencePlate';
  plate.position.set(...p.platePos);
  plate.rotation.x = p.plateTilt;
  const backing = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.15, 0.008), blackMat);
  plate.add(backing);
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(0.19, 0.142),
    new THREE.MeshStandardMaterial({ map: getPlateTexture(p.plateNumber), roughness: 0.45 })
  );
  face.position.z = 0.0045;
  plate.add(face);
  group.add(plate);

  group.traverse((c) => {
    if ((c as THREE.Mesh).isMesh) c.castShadow = true;
  });
  return group;
}

let cachedBrakeGlowTexture: THREE.DataTexture | null = null;

function getBrakeGlowTexture(): THREE.DataTexture {
  if (cachedBrakeGlowTexture) return cachedBrakeGlowTexture;
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = ((x + 0.5) / size) * 2 - 1;
      const dy = ((y + 0.5) / size) * 2 - 1;
      const r = Math.sqrt(dx * dx + dy * dy);
      const falloff = Math.max(0, 1 - r);
      const alpha = Math.pow(falloff, 2.0);
      const idx = (y * size + x) * 4;
      data[idx] = 255;
      data[idx + 1] = Math.round(50 + 170 * Math.pow(falloff, 3.0));
      data[idx + 2] = Math.round(35 + 120 * Math.pow(falloff, 3.8));
      data[idx + 3] = Math.round(alpha * 255);
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  cachedBrakeGlowTexture = tex;
  return tex;
}

function createBrakeLightGroup(bikeId: BikeId): THREE.Group {
  const pos = BRAKE_LIGHT_POS[bikeId];
  const group = new THREE.Group();
  group.name = 'BrakeLight';
  group.position.set(pos[0], pos[1], pos[2]);

  const housingMat = new THREE.MeshStandardMaterial({
    color: 0x1d1f22,
    roughness: 0.52,
    metalness: 0.35
  });
  const housing = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.068, 0.04), housingMat);
  housing.name = 'BrakeHousing';
  housing.position.z = -0.008;
  housing.castShadow = true;
  group.add(housing);

  const lensMat = new THREE.MeshStandardMaterial({
    color: 0x8f1010,
    emissive: new THREE.Color(0xff1e1e),
    emissiveIntensity: 0.45,
    roughness: 0.2,
    metalness: 0.08
  });
  const lens = new THREE.Mesh(new THREE.BoxGeometry(0.132, 0.048, 0.024), lensMat);
  lens.name = 'BrakeLens';
  lens.position.z = 0.014;
  group.add(lens);

  const glowMat = new THREE.MeshBasicMaterial({
    map: getBrakeGlowTexture(),
    color: 0xff2424,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false
  });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.25), glowMat);
  glow.name = 'BrakeGlow';
  glow.position.z = 0.032;
  glow.renderOrder = 4;
  glow.visible = false;
  group.add(glow);

  return group;
}

function attachRiderAndDeliveryBox(
  rootContainer: THREE.Group,
  bikeAssembly: THREE.Group,
  bikeId: BikeId,
  seatedModel: THREE.Group | null,
  standingModel: THREE.Group | null
): void {
  const p = DRIVER_PROFILES[bikeId];
  const seatedRider = seatedModel ?? createFallbackProceduralRider();
  seatedRider.name = 'SeatedRider';
  bikeAssembly.add(seatedRider);
  bikeAssembly.add(createDeliveryBox(bikeId));
  bikeAssembly.add(createBikeAccessories(bikeId));
  bikeAssembly.add(createBrakeLightGroup(bikeId));

  const seatedRig = bindRiderRig(seatedRider);
  if (seatedRig) {
    // Articulated rider: sit on the seat, then IK hands onto the grips & feet onto the rests
    seatedRider.visible = true;
    seatedRider.position.set(0, 0, p.seatZ);
    rootContainer.updateMatrixWorld(true);
    const toWorld = (x: number, y: number, z: number) =>
      bikeAssembly.localToWorld(new THREE.Vector3(x, y, z));
    // Lean the torso forward just enough that both hands comfortably reach the grips
    const pose = seatedPose(p.seatY);
    const reach = seatedRig.armReach * 0.97;
    const gripTarget = toWorld(p.grip[0], p.grip[1] + GRIP_PALM_LIFT, p.grip[2]);
    const shoulder = new THREE.Vector3();
    for (let i = 0; i < 24; i++) {
      seatedRig.applyPose(pose);
      seatedRig.root.updateMatrixWorld(true);
      seatedRig.bones.upperArmR.getWorldPosition(shoulder);
      if (shoulder.distanceTo(gripTarget) <= reach) break;
      pose.chest += 0.035;
      pose.head -= 0.03; // keep eyes on the road while leaning in
    }
    const dirWorld = (x: number, y: number, z: number) =>
      new THREE.Vector3(x, y, z).transformDirection(bikeAssembly.matrixWorld);
    for (const side of [-1, 1] as const) {
      const [gx, gy, gz] = p.grip;
      const [fx, fy, fz] = p.foot;
      seatedRig.solveLimbIK(
        side < 0 ? 'legL' : 'legR',
        toWorld(side * fx, fy, fz),
        dirWorld(side * 0.35, 0.15, -1)
      );
      // Palm rests on top of the grip (bar radius + hand half-thickness above its axis)
      seatedRig.solveLimbIK(
        side < 0 ? 'armL' : 'armR',
        toWorld(side * gx, gy + GRIP_PALM_LIFT, gz),
        dirWorld(side * 0.5, -0.9, 0.3)
      );
      // Palm faces down onto the grip so the curled fingers wrap round it
      seatedRig.orientPalm(side < 0 ? 'L' : 'R', dirWorld(0, -1, 0.15));
    }
  } else {
    seatedRider.position.set(0, p.seatY - 0.12, p.seatZ);
  }

  const standingRider = standingModel ?? createFallbackProceduralRider();
  standingRider.name = 'StandingRider';
  standingRider.visible = false;
  rootContainer.add(standingRider);

  const meta = standingRider.userData.riderRigMeta as
    | { hipHeight: number; thighLength: number; shinLength: number }
    | undefined;
  rootContainer.userData.crashRider = {
    seatY: p.seatY,
    seatZ: p.seatZ,
    dims: meta
      ? { hipHeight: meta.hipHeight, thighLength: meta.thighLength, shinLength: meta.shinLength }
      : { hipHeight: 0.8, thighLength: 0.31, shinLength: 0.45 }
  };
}

/**
 * Stylized low-poly fallback bike used only if GLB fetch is unavailable in tests.
 */
export function createFallbackBike(bikeId: BikeId): THREE.Group {
  const root = new THREE.Group();
  root.name = `FallbackBike_${bikeId}`;
  const bikeAssembly = new THREE.Group();
  bikeAssembly.name = 'BikeAssembly';
  root.add(bikeAssembly);

  const bodyColor =
    bikeId === 'honda'
      ? HANOI_PALETTE.terracottaRoof
      : bikeId === 'suzuki_rgv'
        ? 0xc92a2a
        : bikeId === 'suzuki_gsxs'
          ? 0x0e4da4
          : HANOI_PALETTE.busBlue;
  const bodyMat = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.45 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x202428, roughness: 0.7 });
  const chromeMat = new THREE.MeshStandardMaterial({ color: 0xd0d4d8, metalness: 0.6, roughness: 0.3 });

  const wheelGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.11, 14);
  wheelGeo.rotateZ(Math.PI / 2);

  const frontWheel = new THREE.Mesh(wheelGeo, darkMat);
  frontWheel.position.set(0, 0.28, -0.72);
  bikeAssembly.add(frontWheel);

  const rearWheel = new THREE.Mesh(wheelGeo, darkMat);
  rearWheel.position.set(0, 0.28, 0.72);
  bikeAssembly.add(rearWheel);

  const chassis = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.4, 1.35), bodyMat);
  chassis.position.set(0, 0.56, 0.05);
  bikeAssembly.add(chassis);

  const frontShield = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.65, 0.24), bodyMat);
  frontShield.position.set(0, 0.72, -0.52);
  frontShield.rotation.x = 0.22;
  bikeAssembly.add(frontShield);

  const handlebar = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.68, 8), chromeMat);
  handlebar.rotation.z = Math.PI / 2;
  handlebar.position.set(0, 1.06, -0.45);
  bikeAssembly.add(handlebar);

  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.64), darkMat);
  seat.position.set(0, 0.76, 0.22);
  bikeAssembly.add(seat);

  if (bikeId === 'suzuki_rgv') {
    const exhaust = new THREE.Mesh(
      new THREE.CylinderGeometry(0.042, 0.062, 0.92, 10),
      darkMat
    );
    exhaust.position.set(0.21, 0.34, 0.32);
    exhaust.rotation.x = Math.PI / 2 - 0.22;
    bikeAssembly.add(exhaust);

    const silencer = new THREE.Mesh(
      new THREE.CylinderGeometry(0.036, 0.04, 0.22, 10),
      chromeMat
    );
    silencer.position.set(0.21, 0.45, 0.8);
    silencer.rotation.x = Math.PI / 2 - 0.22;
    bikeAssembly.add(silencer);
  } else if (bikeId === 'suzuki_gsxs') {
    const tank = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.28, 0.56), bodyMat);
    tank.position.set(0, 0.84, -0.14);
    bikeAssembly.add(tank);

    const cowl = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.28, 0.26), darkMat);
    cowl.position.set(0, 0.92, -0.54);
    cowl.rotation.x = 0.28;
    bikeAssembly.add(cowl);

    const bellyPan = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.22, 0.58), bodyMat);
    bellyPan.position.set(0, 0.34, -0.08);
    bikeAssembly.add(bellyPan);

    const sportPipe = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.06, 0.52, 10),
      chromeMat
    );
    sportPipe.position.set(0.22, 0.38, 0.42);
    sportPipe.rotation.x = Math.PI / 2 - 0.32;
    bikeAssembly.add(sportPipe);
  }

  attachRiderAndDeliveryBox(root, bikeAssembly, bikeId, null, null);
  return root;
}

/**
 * Normalizes a raw loaded GLB bike scene with an articulated BikeAssembly
 * (bike + delivery box + seated rider) plus an independent StandingRider child
 * for Road Rash crash topple / stand-up / run-back sequences.
 */
function normalizeBikeScene(
  rawScene: THREE.Group,
  bikeId: BikeId,
  seatedDriver: THREE.Group | null,
  standingDriver: THREE.Group | null
): THREE.Group {
  const container = new THREE.Group();
  container.name = `PlayerBike_${bikeId}`;

  const bikeAssembly = new THREE.Group();
  bikeAssembly.name = 'BikeAssembly';
  container.add(bikeAssembly);

  const modelPivot = new THREE.Group();
  modelPivot.add(rawScene);
  bikeAssembly.add(modelPivot);

  rawScene.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    if (bikeId === 'vinfast') {
      // Decimated scooter: crisp creased normals instead of smoothed ones (no shading noise)
      mesh.geometry = toCreasedNormals(mesh.geometry, THREE.MathUtils.degToRad(38));
    }

    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of materials) {
      if (mat && 'metalness' in mat) {
        const stdMat = mat as THREE.MeshStandardMaterial;
        if (bikeId === 'vinfast') {
          stdMat.roughness = Math.min(stdMat.roughness, 0.36);
          stdMat.color.multiplyScalar(1.22);
          stdMat.emissive.setHex(0x000000);
          stdMat.emissiveIntensity = 0;
          stdMat.envMapIntensity = 1.65;
        } else if (bikeId === 'suzuki_gsxs') {
          const matName = stdMat.name.toLowerCase();
          if (matName.includes('kaca_lampu')) {
            stdMat.emissive.setHex(0xfff4d6);
            stdMat.emissiveIntensity = Math.max(stdMat.emissiveIntensity ?? 0, 0.95);
          } else if (matName.includes('kaca_lcd')) {
            stdMat.emissive.setHex(0x68d8ff);
            stdMat.emissiveIntensity = Math.max(stdMat.emissiveIntensity ?? 0, 0.75);
          }
          stdMat.envMapIntensity = 1.5;
        } else {
          // Preserve GLB chrome & retro gloss so PMREM golden-hour reflections pop cleanly
          stdMat.envMapIntensity = 1.45;
        }
      }
    }
  });

  modelPivot.updateMatrixWorld(true);
  const rawBox = new THREE.Box3().setFromObject(modelPivot);
  const rawSize = rawBox.getSize(new THREE.Vector3());

  // Both Models/honda.glb and Models/vinfast/model.glb are authored with front along -X.
  // Rotate -90 deg around +Y so -X becomes -Z (forward travel direction).
  if (rawSize.x > rawSize.z) {
    modelPivot.rotation.y = -Math.PI / 2;
  }
  modelPivot.updateMatrixWorld(true);

  const orientedBox = new THREE.Box3().setFromObject(modelPivot);
  const orientedSize = orientedBox.getSize(new THREE.Vector3());

  const targetLength = PLAYER_HALF_L * 1.84; // ~1.93m true motorcycle wheelbase scale
  const scaleFactor = targetLength / Math.max(0.01, orientedSize.z);
  modelPivot.scale.setScalar(scaleFactor);
  modelPivot.updateMatrixWorld(true);

  const scaledBox = new THREE.Box3().setFromObject(modelPivot);
  const center = scaledBox.getCenter(new THREE.Vector3());

  modelPivot.position.set(-center.x, -scaledBox.min.y, -center.z);
  modelPivot.updateMatrixWorld(true);

  attachRiderAndDeliveryBox(container, bikeAssembly, bikeId, seatedDriver, standingDriver);

  return container;
}

async function fetchBikeTemplate(bikeId: BikeId): Promise<THREE.Group> {
  const spec = BIKES[bikeId];
  try {
    const [gltf, seatedDriver, standingDriver] = await Promise.all([
      getSharedBikeGltfLoader().loadAsync(spec.modelPath),
      getStandingDriverInstance(bikeId),
      getStandingDriverInstance(bikeId)
    ]);
    return normalizeBikeScene(gltf.scene, bikeId, seatedDriver, standingDriver);
  } catch (err) {
    console.warn(`[bikeLoader] Falling back to procedural mesh for ${bikeId}:`, err);
    return createFallbackBike(bikeId);
  }
}

/**
 * Loads and returns a ready-to-ride 3D motorbike + Models/driver.glb rider
 * normalized to ~2.1m length, grounded at y = 0, facing -Z.
 */
export async function loadPlayerBike(bikeId: BikeId): Promise<THREE.Group> {
  let pending = bikeTemplateCache.get(bikeId);
  if (!pending) {
    pending = fetchBikeTemplate(bikeId);
    bikeTemplateCache.set(bikeId, pending);
  }
  const template = await pending;
  return SkeletonUtils.clone(template) as THREE.Group;
}
