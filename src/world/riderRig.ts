import * as THREE from 'three';
import type { RiderArmPose, RiderJointPose, RiderLegPose } from '../core/riderPose.ts';

/**
 * Turns the single static mesh in Models/driver.glb (chibi T-pose, faces +X, 1 unit tall)
 * into a skinned, articulated low-poly rider with 11 procedural bones, so the crash
 * sequence can animate real limb motion: flailing through the air, log-rolling on the
 * asphalt, sitting up, getting up and running back to the bike.
 *
 * Rig space (what poses are authored in): metres, +Y up, -Z forward, +X rider's right,
 * feet on y = 0 in the bind pose, pelvis joint at (0, hipHeight, 0).
 */

const HIP_Y = -0.09; // raw driver.glb hip height
const NECK_Y = 0.2;
const LEG_STRETCH = 1.48;
const TORSO_STRETCH = 1.38;
const HEAD_SCALE = 0.6;
const ARM_STRETCH = 1.02;

export type RiderBoneName =
  | 'pelvis'
  | 'chest'
  | 'head'
  | 'upperArmL'
  | 'foreArmL'
  | 'upperArmR'
  | 'foreArmR'
  | 'fingersL'
  | 'fingersR'
  | 'thumbL'
  | 'thumbR'
  | 'thighL'
  | 'shinL'
  | 'thighR'
  | 'shinR';

const BONE_ORDER: RiderBoneName[] = [
  'pelvis',
  'chest',
  'head',
  'upperArmL',
  'foreArmL',
  'upperArmR',
  'foreArmR',
  'fingersL',
  'fingersR',
  'thumbL',
  'thumbR',
  'thighL',
  'shinL',
  'thighR',
  'shinR'
];

const BONE_PARENT: Record<RiderBoneName, RiderBoneName | null> = {
  pelvis: null,
  chest: 'pelvis',
  head: 'chest',
  upperArmL: 'chest',
  foreArmL: 'upperArmL',
  upperArmR: 'chest',
  foreArmR: 'upperArmR',
  fingersL: 'foreArmL',
  fingersR: 'foreArmR',
  thumbL: 'foreArmL',
  thumbR: 'foreArmR',
  thighL: 'pelvis',
  shinL: 'thighL',
  thighR: 'pelvis',
  shinR: 'thighR'
};

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Same adult de-chibi proportion remap the seated rider uses, without joint rotations. */
function remapProportions(ox: number, oy: number, oz: number): [number, number, number] {
  let x = ox;
  let z = oz;
  let y: number;
  const newNeckY = HIP_Y + (NECK_Y - HIP_Y) * TORSO_STRETCH;
  if (oy < HIP_Y) y = HIP_Y + (oy - HIP_Y) * LEG_STRETCH;
  else if (oy <= NECK_Y) y = HIP_Y + (oy - HIP_Y) * TORSO_STRETCH;
  else y = newNeckY + (oy - NECK_Y) * HEAD_SCALE;

  const headW = smoothstep(0.18, 0.23, oy);
  if (headW > 0) {
    const s = 1 - (1 - HEAD_SCALE) * headW;
    x *= s;
    z *= s;
  }
  const legSlimW = smoothstep(-0.07, -0.14, oy);
  if (legSlimW > 0) {
    x *= 1 - 0.06 * legSlimW;
    z *= 1 - 0.04 * legSlimW;
  }
  const shoulderW = smoothstep(-0.05, 0.04, oy) * (1 - headW);
  if (shoulderW > 0) z *= 1 + 0.08 * shoulderW;

  const armMask = smoothstep(0.135, 0.19, Math.abs(oz)) * smoothstep(-0.04, 0.05, oy);
  if (armMask > 0) {
    const sign = z >= 0 ? 1 : -1;
    const absZ = Math.abs(z);
    if (absZ > 0.14) z = sign * (0.14 + (absZ - 0.14) * (1 + (ARM_STRETCH - 1) * armMask));
  }
  return [x, y, z];
}

function remapY(oy: number): number {
  return remapProportions(0, oy, 0)[1];
}

/** Per-vertex bone weights from the ORIGINAL raw coordinates (stable region masks). */
function computeWeights(_ox: number, oy: number, oz: number): Map<RiderBoneName, number> {
  const w = new Map<RiderBoneName, number>();
  const add = (b: RiderBoneName, v: number) => {
    if (v > 1e-4) w.set(b, (w.get(b) ?? 0) + v);
  };
  const right = oz >= 0; // raw +Z becomes rig +X (rider's right)

  // Far out along the arm (hands) everything belongs to the arm, whatever the height
  const armW =
    smoothstep(0.125, 0.19, Math.abs(oz)) *
    Math.max(smoothstep(-0.04, 0.05, oy), smoothstep(0.2, 0.24, Math.abs(oz)));
  const foreW = smoothstep(0.26, 0.32, Math.abs(oz));
  // Four fingers beyond the knuckles (the thumb sticks up near |z| 0.39-0.41 and stays put)
  const fingerW = smoothstep(0.405, 0.425, Math.abs(oz)) * (1 - smoothstep(0.12, 0.135, oy));
  add(right ? 'upperArmR' : 'upperArmL', armW * (1 - foreW));
  const thumbW =
    smoothstep(0.372, 0.388, Math.abs(oz)) *
    (1 - smoothstep(0.414, 0.426, Math.abs(oz))) *
    smoothstep(0.112, 0.128, oy);
  add(right ? 'foreArmR' : 'foreArmL', armW * foreW * (1 - fingerW) * (1 - thumbW));
  add(right ? 'fingersR' : 'fingersL', armW * foreW * fingerW * (1 - thumbW));
  add(right ? 'thumbR' : 'thumbL', armW * foreW * thumbW);
  let rest = 1 - armW;

  const legW = smoothstep(-0.06, -0.13, oy) * rest;
  const shinW = smoothstep(-0.235, -0.3, oy);
  const sideR = smoothstep(-0.025, 0.025, oz);
  add('thighR', legW * (1 - shinW) * sideR);
  add('shinR', legW * shinW * sideR);
  add('thighL', legW * (1 - shinW) * (1 - sideR));
  add('shinL', legW * shinW * (1 - sideR));
  rest -= legW;

  const headW = smoothstep(0.175, 0.215, oy);
  add('head', rest * headW);
  rest *= 1 - headW;
  const chestW = smoothstep(-0.07, 0.0, oy);
  add('chest', rest * chestW);
  add('pelvis', rest * (1 - chestW));
  return w;
}

export interface RiderRig {
  root: THREE.Group;
  mesh: THREE.SkinnedMesh;
  bones: Record<RiderBoneName, THREE.Bone>;
  /** Head bone attachment group for helmet / mask (origin at head centre). */
  headSocket: THREE.Group;
  hipHeight: number;
  thighLength: number;
  shinLength: number;
  /** Shoulder-to-palm length with a straight arm. */
  armReach: number;
  applyPose(pose: RiderJointPose): void;
  /**
   * Analytic two-bone IK: places the hand (arms) or sole (legs) on a world-space target,
   * bending the elbow/knee toward a world-space pole direction. Call after applyPose.
   */
  solveLimbIK(limb: 'armL' | 'armR' | 'legL' | 'legR', target: THREE.Vector3, pole: THREE.Vector3): void;
  /**
   * Twists the forearm around its own axis so the palm faces `palmDir` (world), e.g. down
   * onto a handlebar grip so the curled fingers wrap around it.
   */
  orientPalm(side: 'L' | 'R', palmDir: THREE.Vector3): void;
}

const _s = new THREE.Vector3();
const _n = new THREE.Vector3();
const _m = new THREE.Vector3();
const _e = new THREE.Vector3();
const _d = new THREE.Vector3();
const _q = new THREE.Quaternion();

function twoBoneIK(
  upper: THREE.Bone,
  lower: THREE.Bone,
  endDirLocal: THREE.Vector3,
  lenB: number,
  target: THREE.Vector3,
  pole: THREE.Vector3
): void {
  upper.updateWorldMatrix(true, false);
  const lenA = lower.position.length();
  upper.getWorldPosition(_s);
  _d.copy(target).sub(_s);
  const dist = THREE.MathUtils.clamp(_d.length(), Math.abs(lenA - lenB) + 1e-3, lenA + lenB - 1e-3);
  _n.copy(_d).normalize();
  const x = (lenA * lenA - lenB * lenB + dist * dist) / (2 * dist);
  const h = Math.sqrt(Math.max(0, lenA * lenA - x * x));
  _m.copy(pole).addScaledVector(_n, -pole.dot(_n));
  if (_m.lengthSq() < 1e-8) _m.set(0, -1, 0);
  _m.normalize();
  _e.copy(_s).addScaledVector(_n, x).addScaledVector(_m, h);

  // Upper bone: bind child offset -> elbow direction (expressed in the parent's frame)
  (upper.parent as THREE.Object3D).getWorldQuaternion(_q).invert();
  _d.copy(_e).sub(_s).normalize().applyQuaternion(_q);
  upper.quaternion.setFromUnitVectors(lower.position.clone().normalize(), _d);
  upper.updateWorldMatrix(false, false);

  // Lower bone: bind end direction -> target direction
  upper.getWorldQuaternion(_q).invert();
  const reach = _s.copy(_n).multiplyScalar(dist).add(upper.getWorldPosition(new THREE.Vector3()));
  _d.copy(reach).sub(_e).normalize().applyQuaternion(_q);
  lower.quaternion.setFromUnitVectors(endDirLocal, _d);
  lower.updateWorldMatrix(false, true);
}

const qa = new THREE.Quaternion();
const qb = new THREE.Quaternion();
const qc = new THREE.Quaternion();
const AX = new THREE.Vector3(1, 0, 0);
const AY = new THREE.Vector3(0, 1, 0);
const AZ = new THREE.Vector3(0, 0, 1);

function setArm(upper: THREE.Bone, fore: THREE.Bone, a: RiderArmPose, side: 1 | -1): void {
  // Bind pose: arm points along side*X (T-pose). Lower in the frontal plane, swing about X,
  // then yaw forward around the vertical axis.
  qa.setFromAxisAngle(AY, side * a.yaw);
  qb.setFromAxisAngle(AX, a.swing);
  qc.setFromAxisAngle(AZ, -side * a.down);
  upper.quaternion.copy(qa).multiply(qb).multiply(qc);
  fore.quaternion.setFromAxisAngle(AY, side * a.elbow);
}

function setLeg(thigh: THREE.Bone, shin: THREE.Bone, l: RiderLegPose, side: 1 | -1): void {
  qa.setFromAxisAngle(AZ, side * l.spread);
  qb.setFromAxisAngle(AX, l.flex);
  thigh.quaternion.copy(qa).multiply(qb);
  shin.quaternion.setFromAxisAngle(AX, -l.knee);
}

/**
 * Outfit painting: per-vertex override colour + mask computed from the ORIGINAL raw
 * driver.glb positions (before posing). The material blends toward the override colour
 * (keeping a little of the texture's shading) instead of multiplying, so the hoodie's
 * busy print and the patchy shoe texture are cleanly covered:
 *  - shipper-green vest over the torso (hoodie sleeves untouched)
 *  - dark brown sneakers with cream soles
 */
export function applyShipperOutfit(geometry: THREE.BufferGeometry): void {
  const pos = geometry.getAttribute('position');
  if (!pos) return;
  const colors = new Float32Array(pos.count * 3);
  const mask = new Float32Array(pos.count);
  const vest = [0.13, 0.55, 0.32];
  const shoe = [0.26, 0.19, 0.15];
  const sole = [0.92, 0.88, 0.8];
  for (let i = 0; i < pos.count; i++) {
    const oy = pos.getY(i);
    const az = Math.abs(pos.getZ(i));
    const torso =
      smoothstep(-0.095, -0.075, oy) *
      (1 - smoothstep(0.16, 0.185, oy)) *
      (1 - smoothstep(0.13, 0.15, az));
    const shoeW = smoothstep(-0.39, -0.405, oy);
    const soleW = smoothstep(-0.478, -0.49, oy);
    let c = vest.slice();
    let m = torso;
    if (shoeW > 0) {
      c = shoe.map((v, k) => v + (sole[k] - v) * soleW);
      m = shoeW * 0.96;
    }
    colors[i * 3] = c[0];
    colors[i * 3 + 1] = c[1];
    colors[i * 3 + 2] = c[2];
    mask[i] = m;
  }
  geometry.setAttribute('outfitColor', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('outfitMask', new THREE.Float32BufferAttribute(mask, 1));
}

/** Patches a standard material to blend in the outfit override colour. */
export function patchOutfitMaterial(mat: THREE.Material): void {
  if (mat.userData.outfitPatched) return;
  mat.userData.outfitPatched = true;
  const NL = String.fromCharCode(10);
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        [
          '#include <common>',
          'attribute vec3 outfitColor;',
          'attribute float outfitMask;',
          'varying vec3 vOutfitColor;',
          'varying float vOutfitMask;'
        ].join(NL)
      )
      .replace(
        '#include <begin_vertex>',
        ['#include <begin_vertex>', 'vOutfitColor = outfitColor;', 'vOutfitMask = outfitMask;'].join(NL)
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        ['#include <common>', 'varying vec3 vOutfitColor;', 'varying float vOutfitMask;'].join(NL)
      )
      .replace(
        '#include <map_fragment>',
        [
          '#include <map_fragment>',
          'float outfitLum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));',
          'diffuseColor.rgb = mix(diffuseColor.rgb, vOutfitColor * (0.9 + 0.16 * outfitLum), vOutfitMask);'
        ].join(NL)
      );
  };
  mat.customProgramCacheKey = () => 'hanoi-outfit-v1';
  mat.needsUpdate = true;
}

/**
 * Builds the skinned rider. `rawDriver` is a fresh clone of the driver.glb scene.
 */
export function buildRiderRig(rawDriver: THREE.Object3D, scale: number): RiderRig | null {
  let srcMesh: THREE.Mesh | null = null;
  rawDriver.updateMatrixWorld(true);
  rawDriver.traverse((c) => {
    if (!srcMesh && (c as THREE.Mesh).isMesh) srcMesh = c as THREE.Mesh;
  });
  if (!srcMesh) return null;
  const src = srcMesh as THREE.Mesh;

  const geometry = src.geometry.clone();
  geometry.applyMatrix4(src.matrixWorld);
  applyShipperOutfit(geometry);
  const pos = geometry.getAttribute('position') as THREE.BufferAttribute;
  const count = pos.count;

  // Foot floor in remapped raw space
  let minY = Infinity;
  for (let i = 0; i < count; i++) {
    const y = remapProportions(pos.getX(i), pos.getY(i), pos.getZ(i))[1];
    if (y < minY) minY = y;
  }

  // raw (remapped) -> rig space: rotate +90deg about Y (raw +X -> -Z), scale, feet on y = 0
  const toRig = (x: number, y: number, z: number): THREE.Vector3 =>
    new THREE.Vector3(z * scale, (y - minY) * scale, -x * scale);

  const skinIndex = new Uint16Array(count * 4);
  const skinWeight = new Float32Array(count * 4);
  const headSum = new THREE.Vector3();
  const handSamples: Record<'fingersL' | 'fingersR' | 'thumbL' | 'thumbR', THREE.Vector3[]> = {
    fingersL: [],
    fingersR: [],
    thumbL: [],
    thumbR: []
  };
  let headCount = 0;

  for (let i = 0; i < count; i++) {
    const ox = pos.getX(i);
    const oy = pos.getY(i);
    const oz = pos.getZ(i);
    const [rx, ry, rz] = remapProportions(ox, oy, oz);
    const v = toRig(rx, ry, rz);
    pos.setXYZ(i, v.x, v.y, v.z);

    if (oy > 0.25 && oy < 0.47 && Math.abs(oz) < 0.14) {
      headSum.add(v);
      headCount += 1;
    }

    const weights = [...computeWeights(ox, oy, oz).entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4);
    const total = weights.reduce((s, e) => s + e[1], 0) || 1;
    weights.forEach(([bone, wv], k) => {
      skinIndex[i * 4 + k] = BONE_ORDER.indexOf(bone);
      skinWeight[i * 4 + k] = wv / total;
    });
    const topBone = weights[0]?.[0];
    if (topBone === 'fingersR' || topBone === 'fingersL' || topBone === 'thumbR' || topBone === 'thumbL') {
      handSamples[topBone].push(v.clone());
    }
  }
  pos.needsUpdate = true;
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  // Joint pivots (raw -> remapped -> rig)
  const shoulderZ = 0.162;
  const elbowZ = 0.315;
  const knuckleZ = 0.454;
  const thumbZ = 0.432;
  const hipZ = 0.054;
  const jointRaw: Record<RiderBoneName, [number, number, number]> = {
    pelvis: [0, HIP_Y, 0],
    chest: [0, remapY(-0.02), 0],
    head: [0, remapY(NECK_Y), 0],
    upperArmL: [0, remapY(0.095), -shoulderZ],
    foreArmL: [0, remapY(0.095), -elbowZ],
    upperArmR: [0, remapY(0.095), shoulderZ],
    foreArmR: [0, remapY(0.095), elbowZ],
    fingersL: [-0.045, remapY(0.08), -knuckleZ],
    fingersR: [-0.045, remapY(0.08), knuckleZ],
    thumbL: [-0.02, remapY(0.112), -thumbZ],
    thumbR: [-0.02, remapY(0.112), thumbZ],
    thighL: [0, remapY(-0.11), -hipZ],
    shinL: [0, remapY(-0.27), -hipZ],
    thighR: [0, remapY(-0.11), hipZ],
    shinR: [0, remapY(-0.27), hipZ]
  };
  const jointRig = {} as Record<RiderBoneName, THREE.Vector3>;
  for (const name of BONE_ORDER) jointRig[name] = toRig(...jointRaw[name]);
  // Finger / thumb pivots from the actual skinned vertices: the knuckle line sits at the
  // inner edge of the finger vertices, the thumb pivot at the thumb's root.
  for (const name of ['fingersL', 'fingersR', 'thumbL', 'thumbR'] as const) {
    const pts = handSamples[name];
    if (pts.length === 0) continue;
    const mean = pts.reduce((a, b) => a.add(b), new THREE.Vector3()).divideScalar(pts.length);
    const innerX = pts.reduce((m, q) => Math.min(m, Math.abs(q.x)), Infinity);
    const isThumb = name.startsWith('thumb');
    const minY = pts.reduce((m, q) => Math.min(m, q.y), Infinity);
    jointRig[name] = new THREE.Vector3(Math.sign(mean.x) * innerX, isThumb ? minY : mean.y, mean.z);
  }

  const bones = {} as Record<RiderBoneName, THREE.Bone>;
  for (const name of BONE_ORDER) {
    const b = new THREE.Bone();
    b.name = `rider_${name}`;
    bones[name] = b;
  }
  for (const name of BONE_ORDER) {
    const parent = BONE_PARENT[name];
    const b = bones[name];
    if (parent) {
      b.position.copy(jointRig[name]).sub(jointRig[parent]);
      bones[parent].add(b);
    } else {
      b.position.copy(jointRig[name]);
    }
  }

  const material = Array.isArray(src.material) ? src.material[0] : src.material;
  const mat = (material as THREE.MeshStandardMaterial).clone();
  patchOutfitMaterial(mat);
  if ('metalness' in mat) {
    mat.metalness = Math.min(mat.metalness, 0.08);
    mat.roughness = Math.max(mat.roughness, 0.58);
    mat.envMapIntensity = 0.85;
  }

  const mesh = new THREE.SkinnedMesh(geometry, mat);
  mesh.name = 'RiderSkin';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false; // bones move far from bind bounds while tumbling
  mesh.add(bones.pelvis);
  mesh.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(BONE_ORDER.map((n) => bones[n])));

  const root = new THREE.Group();
  root.name = 'RiderRig';
  root.add(mesh);

  const headCentre = headCount > 0 ? headSum.divideScalar(headCount) : jointRig.head.clone();
  const headSocket = new THREE.Group();
  headSocket.name = 'HeadSocket';
  headSocket.position.copy(headCentre).sub(jointRig.head);
  bones.head.add(headSocket);

  const hipHeight = jointRig.pelvis.y;
  const thighLength = jointRig.thighR.distanceTo(jointRig.shinR);
  const shinLength = jointRig.shinR.y; // knee to sole
  // Palm centre: just inside the knuckle line
  const handLength = Math.abs(jointRig.fingersR.x) - 0.03 - Math.abs(jointRig.foreArmR.x);

  root.userData.riderRigMeta = {
    hipHeight,
    thighLength,
    shinLength,
    handLength,
    restPelvis: [jointRig.pelvis.x, jointRig.pelvis.y, jointRig.pelvis.z]
  };
  return bindRiderRig(root);
}

interface RiderRigMeta {
  hipHeight: number;
  thighLength: number;
  shinLength: number;
  handLength: number;
  restPelvis: [number, number, number];
}

/**
 * Creates the pose API for a rider hierarchy. Works on SkeletonUtils clones because bones
 * are looked up by name and metadata lives in JSON-safe userData.
 */
export function bindRiderRig(root: THREE.Object3D): RiderRig | null {
  const meta = root.userData.riderRigMeta as RiderRigMeta | undefined;
  if (!meta) return null;
  const bones = {} as Record<RiderBoneName, THREE.Bone>;
  for (const name of BONE_ORDER) {
    const b = root.getObjectByName(`rider_${name}`) as THREE.Bone | undefined;
    if (!b) return null;
    bones[name] = b;
  }
  const mesh = root.getObjectByName('RiderSkin') as THREE.SkinnedMesh;
  const headSocket = root.getObjectByName('HeadSocket') as THREE.Group;
  const [rpx, , rpz] = meta.restPelvis;

  return {
    root: root as THREE.Group,
    mesh,
    bones,
    headSocket,
    hipHeight: meta.hipHeight,
    thighLength: meta.thighLength,
    shinLength: meta.shinLength,
    armReach: bones.foreArmR.position.length() + meta.handLength,
    applyPose(p: RiderJointPose) {
      bones.pelvis.position.set(rpx, p.y, rpz);
      qa.setFromAxisAngle(AX, p.pitch);
      qb.setFromAxisAngle(AY, p.twist);
      qc.setFromAxisAngle(AZ, p.side);
      bones.pelvis.quaternion.copy(qa).multiply(qb).multiply(qc);

      qa.setFromAxisAngle(AX, -p.chest);
      qb.setFromAxisAngle(AY, p.chestTwist);
      bones.chest.quaternion.copy(qa).multiply(qb);
      qa.setFromAxisAngle(AX, -p.head);
      qb.setFromAxisAngle(AY, p.headTurn);
      bones.head.quaternion.copy(qb).multiply(qa);

      setArm(bones.upperArmL, bones.foreArmL, p.armL, -1);
      setArm(bones.upperArmR, bones.foreArmR, p.armR, 1);
      // Palm faces forward in the bind pose: curling about the hand's vertical axis makes a fist
      bones.fingersL.quaternion.setFromAxisAngle(AY, -p.gripL);
      bones.fingersR.quaternion.setFromAxisAngle(AY, p.gripR);
      // Thumb folds across toward the palm to close the grip
      bones.thumbL.quaternion.setFromAxisAngle(AX, 0.75 * p.gripL);
      bones.thumbR.quaternion.setFromAxisAngle(AX, 0.75 * p.gripR);
      setLeg(bones.thighL, bones.shinL, p.legL, -1);
      setLeg(bones.thighR, bones.shinR, p.legR, 1);
    },
    orientPalm(side, palmDir) {
      const fore = side === 'L' ? bones.foreArmL : bones.foreArmR;
      fore.updateWorldMatrix(true, false);
      const inv = fore.getWorldQuaternion(new THREE.Quaternion()).invert();
      const d = palmDir.clone().normalize().applyQuaternion(inv);
      // rotation about local X by t maps the bind palm normal (0,0,-1) to (0, sin t, -cos t)
      const t = Math.atan2(d.y, -d.z);
      fore.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(AX, t));
      fore.updateWorldMatrix(false, true);
    },
    solveLimbIK(limb, target, pole) {
      if (limb === 'armL' || limb === 'armR') {
        const side = limb === 'armL' ? -1 : 1;
        const upper = side < 0 ? bones.upperArmL : bones.upperArmR;
        const lower = side < 0 ? bones.foreArmL : bones.foreArmR;
        twoBoneIK(upper, lower, new THREE.Vector3(side, 0, 0), meta.handLength, target, pole);
      } else {
        const upper = limb === 'legL' ? bones.thighL : bones.thighR;
        const lower = limb === 'legL' ? bones.shinL : bones.shinR;
        twoBoneIK(upper, lower, new THREE.Vector3(0, -1, 0), meta.shinLength, target, pole);
      }
    }
  };
}

export function findRiderRig(obj: THREE.Object3D | null | undefined): RiderRig | null {
  if (!obj) return null;
  let host: THREE.Object3D | null = null;
  obj.traverse((c) => {
    if (!host && c.userData.riderRigMeta) host = c;
  });
  return host ? bindRiderRig(host) : null;
}
