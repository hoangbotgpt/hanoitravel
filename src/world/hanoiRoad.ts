import * as THREE from 'three';
import { HANOI_PALETTE } from '../config/artPalette.ts';
import { getStageSpec, type RoadClass, type StageId, type StageTheme } from '../config/gameConfig.ts';
import {
  distanceToWorldZ,
  getRoadCenterX,
  getRoadElevationY,
  getRoadTangentYaw
} from '../core/roadMath.ts';
import {
  getStageRouteFeatures,
  getTrafficLightState,
  type IntersectionZone,
  type TrafficLightColor
} from '../core/routeFeatures.ts';
import { createGroundTerrainTexture } from './hanoiTextures.ts';

export interface RoadStreamingStats {
  windowStart: number;
  windowEnd: number;
  activeRoadChunks: number;
  visibleIntersections: number;
  visibleCrosswalks: number;
  visibleCameras: number;
}

export interface RoadBuildResult {
  group: THREE.Group;
  update: (playerDistance: number, elapsedTime: number, flashDt?: number) => void;
  triggerCameraFlash: (cameraId: number) => void;
  getStreamingStats: () => RoadStreamingStats;
  dispose: () => void;
}

const CURB_WIDTH = 0.42;
const INTERSECTION_ROAD_HALF_Z = 7.5;
const INTERSECTION_CUT_HALF_Z = INTERSECTION_ROAD_HALF_Z + CURB_WIDTH;
const START_BUFFER = 30;
const END_BUFFER = 12;
const STREAM_BACK = 60;
const STREAM_AHEAD = 360;
const CHUNK_STEPS = 16;
const CHUNK_LEN = 56; // 16 * 3.5m
const CHUNK_POOL_SIZE = 10;
const BASE_ROWS_PER_CHUNK = CHUNK_STEPS + 1;
const MAX_ROWS_PER_CHUNK = 24;

interface RibbonSample {
  d: number;
  cx: number;
  y: number;
  z: number;
}

function createHeadlessTexture(r: number, g: number, b: number): THREE.Texture {
  const tex = new THREE.DataTexture(new Uint8Array([r, g, b, 255]), 1, 1, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function createAsphaltTexture(
  stageId: StageId,
  theme: StageTheme,
  laneCount: RoadClass
): THREE.Texture {
  if (typeof document === 'undefined') {
    return createHeadlessTexture(60, 62, 66);
  }
  const w = laneCount === 6 ? 1024 : 512;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle =
      theme === 'old_quarter' ? '#45413b' : theme === 'tree_boulevard' ? '#3c4045' : '#353b42';
    ctx.fillRect(0, 0, w, 512);

    let seed = stageId * 1337 + laneCount * 97;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const grainCount = laneCount === 6 ? 5600 : 3200;
    for (let i = 0; i < grainCount; i++) {
      const x = rand() * w;
      const y = rand() * 512;
      const shade = 48 + Math.floor(rand() * 34);
      ctx.fillStyle = `rgb(${shade},${shade - 2},${shade - 5})`;
      ctx.fillRect(x, y, 2, 2);
    }

    const stage = getStageSpec(stageId);
    const laneNorms = stage.lanes.map((lx) => lx / stage.roadWidth + 0.5);

    ctx.fillStyle = 'rgba(24, 22, 20, 0.22)';
    const trackHalfPx = laneCount === 6 ? 26 : laneCount === 2 ? 22 : 18;
    for (const u of laneNorms) {
      ctx.fillRect(u * w - trackHalfPx, 0, trackHalfPx * 2, 512);
    }

    const shoulderOffsetPx = laneCount === 2 ? 24 : 30;
    const shoulderWidthPx = laneCount === 6 ? 12 : 9;
    ctx.fillStyle = '#ebe3cf';
    ctx.fillRect(shoulderOffsetPx, 0, shoulderWidthPx, 512);
    ctx.fillRect(w - shoulderOffsetPx - shoulderWidthPx, 0, shoulderWidthPx, 512);

    const dividerNorms =
      laneCount === 6
        ? [0.186, 0.343, 0.657, 0.814]
        : laneCount === 4
          ? [0.293, 0.707]
          : [];
    const divWidth = laneCount === 6 ? 10 : 8;
    for (const u of dividerNorms) {
      const px = u * w;
      for (let y = 16; y < 512; y += 128) {
        ctx.fillRect(px - divWidth * 0.5, y, divWidth, 72);
      }
    }

    const centerPx = w * 0.5;
    const yellowW = laneCount === 6 ? 7 : 5;
    const yellowGap = laneCount === 6 ? 6 : 4;
    ctx.fillStyle = '#e8ad28';
    ctx.fillRect(centerPx - yellowGap * 0.5 - yellowW, 0, yellowW, 512);
    ctx.fillRect(centerPx + yellowGap * 0.5, 0, yellowW, 512);

    ctx.fillStyle = 'rgba(235, 227, 207, 0.36)';
    const arrowScale = laneCount === 6 ? 1.18 : 1.0;
    const drawArrow = (cx: number, cy: number, pointAhead: boolean) => {
      const dir = pointAhead ? -1 : 1;
      ctx.beginPath();
      ctx.moveTo(cx, cy + dir * 24 * arrowScale);
      ctx.lineTo(cx - 11 * arrowScale, cy + dir * 4 * arrowScale);
      ctx.lineTo(cx - 4 * arrowScale, cy + dir * 4 * arrowScale);
      ctx.lineTo(cx - 4 * arrowScale, cy - dir * 20 * arrowScale);
      ctx.lineTo(cx + 4 * arrowScale, cy - dir * 20 * arrowScale);
      ctx.lineTo(cx + 4 * arrowScale, cy + dir * 4 * arrowScale);
      ctx.lineTo(cx + 11 * arrowScale, cy + dir * 4 * arrowScale);
      ctx.closePath();
      ctx.fill();
    };

    const half = laneNorms.length / 2;
    laneNorms.forEach((u, idx) => {
      const pointAhead = idx >= half;
      const yOffset = idx % 2 === 0 ? 185 : 385;
      drawArrow(u * w, yOffset, pointAhead);
    });
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function createSidewalkTexture(theme: StageTheme): THREE.Texture {
  if (typeof document === 'undefined') {
    return createHeadlessTexture(156, 146, 130);
  }
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = theme === 'old_quarter' ? '#a4947f' : '#968f84';
    ctx.fillRect(0, 0, 256, 256);

    ctx.strokeStyle = 'rgba(55, 48, 40, 0.28)';
    ctx.lineWidth = 3;
    const step = 64;
    for (let x = 0; x <= 256; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 256);
      ctx.stroke();
    }
    for (let y = 0; y <= 256; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(256, y);
      ctx.stroke();
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createCurbTexture(redWhite: boolean): THREE.Texture {
  if (typeof document === 'undefined') {
    return createHeadlessTexture(200, 190, 175);
  }
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    if (redWhite) {
      ctx.fillStyle = '#b83a2d';
      ctx.fillRect(0, 0, 64, 128);
      ctx.fillStyle = '#e6ded0';
      ctx.fillRect(0, 128, 64, 128);
    } else {
      ctx.fillStyle = '#cfc5b4';
      ctx.fillRect(0, 0, 64, 126);
      ctx.fillStyle = '#9c9282';
      ctx.fillRect(0, 126, 64, 4);
      ctx.fillStyle = '#c5baa8';
      ctx.fillRect(0, 130, 64, 126);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createSpeedSignTexture(speedLimitKmh: number): THREE.Texture {
  if (typeof document === 'undefined') {
    return createHeadlessTexture(240, 240, 240);
  }
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, 128, 128);
    ctx.fillStyle = '#f8f5ee';
    ctx.beginPath();
    ctx.arc(64, 64, 58, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#d92626';
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.arc(64, 64, 52, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = '#181a1d';
    ctx.font = '800 50px "Be Vietnam Pro", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(speedLimitKmh), 64, 67);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createCameraPlateTexture(): THREE.Texture {
  if (typeof document === 'undefined') {
    return createHeadlessTexture(20, 90, 150);
  }
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#155b94';
    ctx.fillRect(0, 0, 256, 96);
    ctx.strokeStyle = '#f6eedc';
    ctx.lineWidth = 5;
    ctx.strokeRect(5, 5, 246, 86);
    ctx.fillStyle = '#f6eedc';
    ctx.font = '700 22px "Be Vietnam Pro", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('CAMERA PHẠT NGUỘI', 128, 34);
    ctx.fillStyle = '#ffcd00';
    ctx.font = '700 18px "Be Vietnam Pro", sans-serif';
    ctx.fillText('GIÁM SÁT TỐC ĐỘ · LÀN ĐƯỜNG', 128, 66);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createPedestrianSignTexture(): THREE.Texture {
  if (typeof document === 'undefined') {
    return createHeadlessTexture(25, 100, 175);
  }
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#1560a8';
    ctx.fillRect(6, 6, 116, 116);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 6;
    ctx.strokeRect(10, 10, 108, 108);

    // White triangle + stylized walker icon
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(64, 22);
    ctx.lineTo(106, 102);
    ctx.lineTo(22, 102);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#1c1f24';
    ctx.beginPath();
    ctx.arc(64, 52, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(60, 59, 8, 22);
    ctx.fillRect(52, 78, 7, 16);
    ctx.fillRect(69, 78, 7, 16);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Allocates a reusable multi-strip indexed BufferGeometry for `stripCount` parallel
 * quad ribbons of up to `MAX_ROWS_PER_CHUNK` rows each (keeps left/right curbs & sidewalks in 1 draw call).
 */
function createMultiStripGeometry(stripCount: number): THREE.BufferGeometry {
  const vertsPerStrip = MAX_ROWS_PER_CHUNK * 2;
  const totalVerts = stripCount * vertsPerStrip;
  const positions = new Float32Array(totalVerts * 3);
  const uvs = new Float32Array(totalVerts * 2);
  const indexArray = new Uint16Array(stripCount * (MAX_ROWS_PER_CHUNK - 1) * 6);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(new THREE.BufferAttribute(indexArray, 1));
  return geo;
}

function writeStripIntoGeometry(
  geo: THREE.BufferGeometry,
  stripIndex: number,
  samples: RibbonSample[],
  rowCount: number,
  getRow: (s: RibbonSample) => {
    lx: number;
    ly: number;
    rx: number;
    ry: number;
    uLeft?: number;
    uRight?: number;
    v: number;
  }
): void {
  const posAttr = geo.getAttribute('position') as THREE.BufferAttribute;
  const uvAttr = geo.getAttribute('uv') as THREE.BufferAttribute;
  const posArr = posAttr.array as Float32Array;
  const uvArr = uvAttr.array as Float32Array;
  const baseVertex = stripIndex * MAX_ROWS_PER_CHUNK * 2;

  for (let i = 0; i < rowCount; i++) {
    const s = samples[i];
    const row = getRow(s);
    const vIdx = baseVertex + i * 2;
    const pIdx = vIdx * 3;
    posArr[pIdx] = row.lx;
    posArr[pIdx + 1] = row.ly;
    posArr[pIdx + 2] = s.z;
    posArr[pIdx + 3] = row.rx;
    posArr[pIdx + 4] = row.ry;
    posArr[pIdx + 5] = s.z;

    const uIdx = vIdx * 2;
    uvArr[uIdx] = row.uLeft ?? 0;
    uvArr[uIdx + 1] = row.v;
    uvArr[uIdx + 2] = row.uRight ?? 1;
    uvArr[uIdx + 3] = row.v;
  }

  posAttr.needsUpdate = true;
  uvAttr.needsUpdate = true;
}

function updateMultiStripIndices(
  geo: THREE.BufferGeometry,
  stripCount: number,
  rowCount: number,
  skipSegment?: (segIdx: number) => boolean
): void {
  const indexAttr = geo.getIndex() as THREE.BufferAttribute;
  const indexArr = indexAttr.array as Uint16Array;
  const vertsPerStrip = MAX_ROWS_PER_CHUNK * 2;
  let writeIdx = 0;

  for (let s = 0; s < stripCount; s++) {
    const baseV = s * vertsPerStrip;
    for (let i = 0; i < rowCount - 1; i++) {
      if (skipSegment?.(i)) continue;
      const a = baseV + i * 2;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      indexArr[writeIdx++] = a;
      indexArr[writeIdx++] = b;
      indexArr[writeIdx++] = c;
      indexArr[writeIdx++] = b;
      indexArr[writeIdx++] = d;
      indexArr[writeIdx++] = c;
    }
  }

  for (let k = writeIdx; k < indexArr.length; k++) {
    indexArr[k] = 0;
  }
  indexAttr.needsUpdate = true;
  geo.setDrawRange(0, writeIdx);
}

function finalizeGeometryNormals(geo: THREE.BufferGeometry): void {
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
}

interface RoadChunkSlot {
  chunkIndex: number;
  group: THREE.Group;
  asphaltGeo: THREE.BufferGeometry;
  curbsGeo: THREE.BufferGeometry;
  sidewalkGeo: THREE.BufferGeometry;
  groundGeo: THREE.BufferGeometry;
  medianGeo: THREE.BufferGeometry | null;
  serviceGeo: THREE.BufferGeometry | null;
  overpassGroup: THREE.Group | null;
  overpassWallGeo: THREE.BufferGeometry | null;
  overpassCapGeo: THREE.BufferGeometry | null;
  overpassGuardGeo: THREE.BufferGeometry | null;
}

interface TrafficLightHandle {
  zone: IntersectionZone;
  group: THREE.Group;
  redMat: THREE.MeshBasicMaterial;
  yellowMat: THREE.MeshBasicMaterial;
  greenMat: THREE.MeshBasicMaterial;
  lastState: TrafficLightColor | null;
}

interface CameraPoleHandle {
  id: number;
  distance: number;
  group: THREE.Group;
  flashMesh: THREE.Mesh;
  flashMat: THREE.MeshBasicMaterial;
  flashTimer: number;
}

/**
 * Streaming Road Rash road builder supporting 2 km, 5 km, and 10 km routes at >= 55 FPS.
 * Streams road chunks inside [-60m, +360m], plus IntersectionZones (4/2 lanes),
 * CrosswalkZones, and Camera Phạt Nguội overhead gantries.
 */
export function buildHanoiRoad(stageId: StageId): RoadBuildResult {
  const stage = getStageSpec(stageId);
  const roadWidth = stage.roadWidth;
  const roadHalfW = roadWidth * 0.5;
  const isOverpassAvenue = stage.theme === 'overpass_avenue';
  const hasBridgeElevation = stageId === 3;
  const sidewalkWidth = stage.theme === 'old_quarter' ? 4.2 : 6.2;
  const routeFeatures = getStageRouteFeatures(stageId);

  const group = new THREE.Group();
  group.name = `HanoiRoad_Stage${stageId}`;

  const disposables: Array<{ dispose: () => void }> = [];
  const track = <T extends { dispose: () => void }>(res: T): T => {
    disposables.push(res);
    return res;
  };

  // Shared Road Materials
  const asphaltTex = track(createAsphaltTexture(stageId, stage.theme, stage.laneCount));
  const asphaltMat = track(
    new THREE.MeshStandardMaterial({
      map: asphaltTex,
      roughness: 0.88,
      metalness: 0.04
    })
  );

  const curbTex = track(createCurbTexture(isOverpassAvenue));
  const curbMat = track(
    new THREE.MeshStandardMaterial({
      map: curbTex,
      roughness: 0.78,
      side: THREE.DoubleSide
    })
  );

  const sidewalkTex = track(createSidewalkTexture(stage.theme));
  const sidewalkMat = track(
    new THREE.MeshStandardMaterial({
      map: sidewalkTex,
      roughness: 0.9
    })
  );

  const terrainStageArg: 1 | 2 | 3 =
    stage.theme === 'old_quarter' ? 1 : stage.theme === 'tree_boulevard' ? 2 : 3;
  const groundTex = track(createGroundTerrainTexture(terrainStageArg));
  const groundMat = track(
    new THREE.MeshStandardMaterial({
      map: groundTex,
      roughness: 0.94
    })
  );

  const medianSoilMat = isOverpassAvenue
    ? track(
        new THREE.MeshStandardMaterial({
          color: HANOI_PALETTE.bougainvilleaLeaf,
          roughness: 0.92
        })
      )
    : null;
  const serviceRoadMat = isOverpassAvenue
    ? track(
        new THREE.MeshStandardMaterial({
          color: 0x3b4046,
          roughness: 0.9
        })
      )
    : null;

  const concreteMat = hasBridgeElevation
    ? track(
        new THREE.MeshStandardMaterial({
          color: HANOI_PALETTE.overpassConcrete,
          roughness: 0.85
        })
      )
    : null;
  const concreteWallMat = hasBridgeElevation
    ? track(
        new THREE.MeshStandardMaterial({
          color: 0xa49c8d,
          roughness: 0.88,
          side: THREE.DoubleSide
        })
      )
    : null;
  const railMat = hasBridgeElevation
    ? track(
        new THREE.MeshStandardMaterial({
          color: HANOI_PALETTE.overpassGuardrail,
          roughness: 0.45,
          metalness: 0.5,
          side: THREE.DoubleSide
        })
      )
    : null;

  // Allocate pooled streaming road chunk slots
  const chunkPool: RoadChunkSlot[] = [];
  const samplesScratch: RibbonSample[] = Array.from({ length: MAX_ROWS_PER_CHUNK }, () => ({
    d: 0,
    cx: 0,
    y: 0,
    z: 0
  }));
  const rowDistancesScratch: number[] = [];

  for (let p = 0; p < CHUNK_POOL_SIZE; p++) {
    const chunkGroup = new THREE.Group();
    chunkGroup.visible = false;

    const asphaltGeo = track(createMultiStripGeometry(1));
    const asphaltMesh = new THREE.Mesh(asphaltGeo, asphaltMat);
    asphaltMesh.receiveShadow = true;
    asphaltMesh.frustumCulled = false;
    chunkGroup.add(asphaltMesh);

    const curbsGeo = track(createMultiStripGeometry(4));
    const curbsMesh = new THREE.Mesh(curbsGeo, curbMat);
    curbsMesh.receiveShadow = true;
    curbsMesh.frustumCulled = false;
    chunkGroup.add(curbsMesh);

    const sidewalkGeo = track(createMultiStripGeometry(2));
    const sidewalkMesh = new THREE.Mesh(sidewalkGeo, sidewalkMat);
    sidewalkMesh.receiveShadow = true;
    sidewalkMesh.frustumCulled = false;
    chunkGroup.add(sidewalkMesh);

    const groundGeo = track(createMultiStripGeometry(1));
    const groundMesh = new THREE.Mesh(groundGeo, groundMat);
    groundMesh.receiveShadow = true;
    groundMesh.frustumCulled = false;
    chunkGroup.add(groundMesh);

    let medianGeo: THREE.BufferGeometry | null = null;
    let serviceGeo: THREE.BufferGeometry | null = null;
    if (isOverpassAvenue && medianSoilMat && serviceRoadMat) {
      medianGeo = track(createMultiStripGeometry(2));
      const medMesh = new THREE.Mesh(medianGeo, medianSoilMat);
      medMesh.receiveShadow = true;
      medMesh.frustumCulled = false;
      chunkGroup.add(medMesh);

      serviceGeo = track(createMultiStripGeometry(2));
      const svcMesh = new THREE.Mesh(serviceGeo, serviceRoadMat);
      svcMesh.receiveShadow = true;
      svcMesh.frustumCulled = false;
      chunkGroup.add(svcMesh);
    }

    let overpassGroup: THREE.Group | null = null;
    let overpassWallGeo: THREE.BufferGeometry | null = null;
    let overpassCapGeo: THREE.BufferGeometry | null = null;
    let overpassGuardGeo: THREE.BufferGeometry | null = null;
    if (hasBridgeElevation && concreteWallMat && concreteMat && railMat) {
      overpassGroup = new THREE.Group();
      overpassGroup.visible = false;

      overpassWallGeo = track(createMultiStripGeometry(3)); // left skirt, right skirt, soffit
      const wallMesh = new THREE.Mesh(overpassWallGeo, concreteWallMat);
      wallMesh.castShadow = true;
      wallMesh.receiveShadow = true;
      wallMesh.frustumCulled = false;
      overpassGroup.add(wallMesh);

      overpassCapGeo = track(createMultiStripGeometry(2));
      const capMesh = new THREE.Mesh(overpassCapGeo, concreteMat);
      capMesh.frustumCulled = false;
      overpassGroup.add(capMesh);

      overpassGuardGeo = track(createMultiStripGeometry(4)); // 2 rails x 2 sides
      const guardMesh = new THREE.Mesh(overpassGuardGeo, railMat);
      guardMesh.frustumCulled = false;
      overpassGroup.add(guardMesh);

      chunkGroup.add(overpassGroup);
    }

    group.add(chunkGroup);
    chunkPool.push({
      chunkIndex: Number.NaN,
      group: chunkGroup,
      asphaltGeo,
      curbsGeo,
      sidewalkGeo,
      groundGeo,
      medianGeo,
      serviceGeo,
      overpassGroup,
      overpassWallGeo,
      overpassCapGeo,
      overpassGuardGeo
    });
  }

  const skipIntersectionSegment = (segIdx: number): boolean => {
    const dMid = 0.5 * (samplesScratch[segIdx].d + samplesScratch[segIdx + 1].d);
    for (let i = 0; i < routeFeatures.intersections.length; i++) {
      if (Math.abs(dMid - routeFeatures.intersections[i].distance) < INTERSECTION_CUT_HALF_Z - 0.02) {
        return true;
      }
    }
    return false;
  };

  const updateChunkSlot = (slot: RoadChunkSlot, chunkIdx: number): boolean => {
    const rawStart = chunkIdx * CHUNK_LEN;
    const rawEnd = rawStart + CHUNK_LEN;
    const dStart = Math.max(-START_BUFFER, rawStart);
    const dEnd = Math.min(stage.length + END_BUFFER, rawEnd);

    if (dEnd <= dStart + 0.1) {
      slot.chunkIndex = chunkIdx;
      slot.group.visible = false;
      return false;
    }

    rowDistancesScratch.length = 0;
    const splitPoints: number[] = [];
    for (let i = 0; i < routeFeatures.intersections.length; i++) {
      const zone = routeFeatures.intersections[i];
      for (const splitD of [
        zone.distance - INTERSECTION_CUT_HALF_Z,
        zone.distance + INTERSECTION_CUT_HALF_Z
      ]) {
        if (splitD > dStart + 0.05 && splitD < dEnd - 0.05) {
          splitPoints.push(splitD);
          rowDistancesScratch.push(splitD);
        }
      }
    }

    for (let i = 0; i < BASE_ROWS_PER_CHUNK; i++) {
      const t = i / CHUNK_STEPS;
      const d = dStart + t * (dEnd - dStart);
      let nearSplit = false;
      for (let j = 0; j < splitPoints.length; j++) {
        if (Math.abs(d - splitPoints[j]) < 0.05) {
          nearSplit = true;
          break;
        }
      }
      if (!nearSplit) {
        rowDistancesScratch.push(d);
      }
    }

    rowDistancesScratch.sort((a, b) => a - b);
    let rowCount = 0;
    for (let i = 0; i < rowDistancesScratch.length && rowCount < MAX_ROWS_PER_CHUNK; i++) {
      const d = rowDistancesScratch[i];
      if (rowCount > 0 && Math.abs(d - samplesScratch[rowCount - 1].d) < 0.05) {
        continue;
      }
      const s = samplesScratch[rowCount++];
      s.d = d;
      s.cx = getRoadCenterX(stageId, d);
      s.y = getRoadElevationY(stageId, d);
      s.z = distanceToWorldZ(d);
    }

    writeStripIntoGeometry(slot.asphaltGeo, 0, samplesScratch, rowCount, (s) => ({
      lx: s.cx - roadHalfW,
      ly: s.y,
      rx: s.cx + roadHalfW,
      ry: s.y,
      v: s.d / 14
    }));
    updateMultiStripIndices(slot.asphaltGeo, 1, rowCount);
    finalizeGeometryNormals(slot.asphaltGeo);

    const sides: readonly (-1 | 1)[] = [-1, 1];
    sides.forEach((side, sIdx) => {
      const inner = side * roadHalfW;
      const outer = side * (roadHalfW + CURB_WIDTH);
      writeStripIntoGeometry(slot.curbsGeo, sIdx * 2, samplesScratch, rowCount, (s) => ({
        lx: s.cx + Math.min(inner, outer),
        ly: s.y + 0.16,
        rx: s.cx + Math.max(inner, outer),
        ry: s.y + 0.16,
        v: s.d / 2.2
      }));
      writeStripIntoGeometry(slot.curbsGeo, sIdx * 2 + 1, samplesScratch, rowCount, (s) => ({
        lx: s.cx + inner,
        ly: s.y,
        rx: s.cx + inner,
        ry: s.y + 0.16,
        v: s.d / 2.2
      }));

      const swStart = isOverpassAvenue ? roadHalfW + 3.2 : roadHalfW + CURB_WIDTH;
      const swEnd = swStart + sidewalkWidth;
      writeStripIntoGeometry(slot.sidewalkGeo, sIdx, samplesScratch, rowCount, (s) => {
        const baseY = hasBridgeElevation ? 0.12 : s.y + 0.16;
        return {
          lx: s.cx + side * (side < 0 ? swEnd : swStart),
          ly: baseY,
          rx: s.cx + side * (side < 0 ? swStart : swEnd),
          ry: baseY,
          uLeft: 0,
          uRight: 2.5,
          v: s.d / 5.5
        };
      });
    });
    updateMultiStripIndices(slot.curbsGeo, 4, rowCount, skipIntersectionSegment);
    finalizeGeometryNormals(slot.curbsGeo);
    updateMultiStripIndices(slot.sidewalkGeo, 2, rowCount, skipIntersectionSegment);
    finalizeGeometryNormals(slot.sidewalkGeo);

    writeStripIntoGeometry(slot.groundGeo, 0, samplesScratch, rowCount, (s) => ({
      lx: s.cx - 150,
      ly: -0.05,
      rx: s.cx + 150,
      ry: -0.05,
      uLeft: 0,
      uRight: 1,
      v: s.d / 20
    }));
    updateMultiStripIndices(slot.groundGeo, 1, rowCount);
    finalizeGeometryNormals(slot.groundGeo);

    if (slot.medianGeo && slot.serviceGeo) {
      sides.forEach((side, sIdx) => {
        const medInner = roadHalfW + CURB_WIDTH;
        const medOuter = roadHalfW + 3.2;
        writeStripIntoGeometry(slot.medianGeo!, sIdx, samplesScratch, rowCount, (s) => ({
          lx: s.cx + side * (side < 0 ? medOuter : medInner),
          ly: 0.15,
          rx: s.cx + side * (side < 0 ? medInner : medOuter),
          ry: 0.15,
          v: s.d / 6
        }));

        const svcInner = roadHalfW + 9.4;
        const svcOuter = roadHalfW + 15.0;
        writeStripIntoGeometry(slot.serviceGeo!, sIdx, samplesScratch, rowCount, (s) => ({
          lx: s.cx + side * (side < 0 ? svcOuter : svcInner),
          ly: 0.02,
          rx: s.cx + side * (side < 0 ? svcInner : svcOuter),
          ry: 0.02,
          v: s.d / 10
        }));
      });
      updateMultiStripIndices(slot.medianGeo, 2, rowCount);
      finalizeGeometryNormals(slot.medianGeo);
      updateMultiStripIndices(slot.serviceGeo, 2, rowCount);
      finalizeGeometryNormals(slot.serviceGeo);
    }

    if (
      slot.overpassGroup &&
      slot.overpassWallGeo &&
      slot.overpassCapGeo &&
      slot.overpassGuardGeo
    ) {
      const overlapsBridge = dEnd >= 680 && dStart <= 1408;
      slot.overpassGroup.visible = overlapsBridge;
      if (overlapsBridge) {
        sides.forEach((side, sIdx) => {
          const wallX = side * (roadHalfW + CURB_WIDTH);
          writeStripIntoGeometry(slot.overpassWallGeo!, sIdx, samplesScratch, rowCount, (s) => ({
            lx: s.cx + wallX,
            ly: Math.max(0, s.y - 0.95),
            rx: s.cx + wallX,
            ry: s.y + 0.52,
            v: s.d / 6
          }));
          writeStripIntoGeometry(slot.overpassCapGeo!, sIdx, samplesScratch, rowCount, (s) => ({
            lx: s.cx + wallX - 0.16,
            ly: s.y + 0.52,
            rx: s.cx + wallX + 0.16,
            ry: s.y + 0.52,
            v: s.d / 6
          }));
          writeStripIntoGeometry(slot.overpassGuardGeo!, sIdx * 2, samplesScratch, rowCount, (s) => ({
            lx: s.cx + wallX,
            ly: s.y + 0.78,
            rx: s.cx + wallX,
            ry: s.y + 0.87,
            v: s.d / 4
          }));
          writeStripIntoGeometry(slot.overpassGuardGeo!, sIdx * 2 + 1, samplesScratch, rowCount, (s) => ({
            lx: s.cx + wallX,
            ly: s.y + 1.0,
            rx: s.cx + wallX,
            ry: s.y + 1.1,
            v: s.d / 4
          }));
        });
        writeStripIntoGeometry(slot.overpassWallGeo, 2, samplesScratch, rowCount, (s) => ({
          lx: s.cx - (roadHalfW + CURB_WIDTH),
          ly: Math.max(0, s.y - 0.95),
          rx: s.cx + (roadHalfW + CURB_WIDTH),
          ry: Math.max(0, s.y - 0.95),
          v: s.d / 8
        }));
        updateMultiStripIndices(slot.overpassWallGeo, 3, rowCount);
        finalizeGeometryNormals(slot.overpassWallGeo);
        updateMultiStripIndices(slot.overpassCapGeo, 2, rowCount);
        finalizeGeometryNormals(slot.overpassCapGeo);
        updateMultiStripIndices(slot.overpassGuardGeo, 4, rowCount);
        finalizeGeometryNormals(slot.overpassGuardGeo);
      }
    }

    slot.chunkIndex = chunkIdx;
    slot.group.visible = true;
    return true;
  };

  // Start (A) and Finish (B) Painted Strips
  const lineMat = track(
    new THREE.MeshStandardMaterial({
      color: HANOI_PALETTE.roadLine,
      roughness: 0.75,
      polygonOffset: true,
      polygonOffsetFactor: -1
    })
  );
  const markerGeo = track(new THREE.PlaneGeometry(roadWidth - 1.0, 1.4));
  markerGeo.rotateX(-Math.PI / 2);

  const markerItems: Array<{ distance: number; mesh: THREE.Mesh }> = [];
  for (const dist of [2, stage.length]) {
    const line = new THREE.Mesh(markerGeo, lineMat);
    line.position.set(
      getRoadCenterX(stageId, dist),
      getRoadElevationY(stageId, dist) + 0.025,
      distanceToWorldZ(dist)
    );
    line.receiveShadow = true;
    group.add(line);
    markerItems.push({ distance: dist, mesh: line });
  }

  // Shared Zebra Crosswalk resources (hoisted for 4-way intersection crosswalks + mid-block crosswalks)
  const zebraMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xf4eee0,
      roughness: 0.72,
      polygonOffset: true,
      polygonOffsetFactor: -3
    })
  );
  const stripeGeo = track(new THREE.PlaneGeometry(0.62, 3.0));
  stripeGeo.rotateX(-Math.PI / 2);

  // ============================================================================
  // INTERSECTIONS & 3-COLOR TRAFFIC LIGHT GANTRIES (4-lane & 2-lane)
  // ============================================================================
  const intersectionHandles: TrafficLightHandle[] = [];
  if (routeFeatures.intersections.length > 0) {
    const crossAsphaltMat = track(
      new THREE.MeshStandardMaterial({
        color: stage.theme === 'old_quarter' ? 0x45413b : 0x3b3f44,
        roughness: 0.88,
        polygonOffset: true,
        polygonOffsetFactor: -1
      })
    );
    const crossDashMat = track(
      new THREE.MeshStandardMaterial({
        color: 0xe8ad28,
        roughness: 0.75,
        polygonOffset: true,
        polygonOffsetFactor: -2
      })
    );
    const gantrySteelMat = track(
      new THREE.MeshStandardMaterial({
        color: 0x262b30,
        roughness: 0.48,
        metalness: 0.55
      })
    );
    const signalBoxMat = track(
      new THREE.MeshStandardMaterial({
        color: 0x16181c,
        roughness: 0.62
      })
    );

    const crossRoadWidth = roadWidth + 114;
    const crossRoadGeo = track(new THREE.PlaneGeometry(crossRoadWidth, INTERSECTION_ROAD_HALF_Z * 2));
    crossRoadGeo.rotateX(-Math.PI / 2);

    const crossCurbGeo = track(new THREE.BoxGeometry(54, 0.16, CURB_WIDTH));
    const crossSidewalkGeo = track(new THREE.PlaneGeometry(54, 4.4));
    crossSidewalkGeo.rotateX(-Math.PI / 2);

    const crossDashGeo = track(new THREE.PlaneGeometry(4.2, 0.24));
    crossDashGeo.rotateX(-Math.PI / 2);

    const stopLineGeo = track(new THREE.PlaneGeometry(roadHalfW - 0.55, 0.55));
    stopLineGeo.rotateX(-Math.PI / 2);

    const crossStopLineGeo = track(new THREE.PlaneGeometry(0.5, 6.4));
    crossStopLineGeo.rotateX(-Math.PI / 2);

    const pillarGeo = track(new THREE.CylinderGeometry(0.14, 0.18, 5.8, 8));
    const beamGeo = track(new THREE.BoxGeometry(roadWidth + 2.0, 0.28, 0.28));
    const housingGeo = track(new THREE.BoxGeometry(1.65, 0.56, 0.36));
    const lampGeo = track(new THREE.CircleGeometry(0.16, 12));
    const ixDummy = new THREE.Object3D();

    for (const zone of routeFeatures.intersections) {
      const ixGroup = new THREE.Group();
      ixGroup.name = `Intersection_${zone.id}`;
      const cx = getRoadCenterX(stageId, zone.distance);
      const cy = getRoadElevationY(stageId, zone.distance);
      const cz = distanceToWorldZ(zone.distance);
      const yaw = getRoadTangentYaw(stageId, zone.distance);
      ixGroup.position.set(cx, cy, cz);
      ixGroup.rotation.y = yaw;

      // Cross-street asphalt slab (covers main centerline cleanly inside [-7.5, +7.5])
      const slab = new THREE.Mesh(crossRoadGeo, crossAsphaltMat);
      slab.position.set(0, 0.022, 0);
      slab.receiveShadow = true;
      ixGroup.add(slab);

      // Cross-street yellow dashes (outside West/East zebra crosswalks, batched in 1 InstancedMesh)
      const dashOffsets: number[] = [];
      for (const side of [-1, 1] as const) {
        for (let offset = roadHalfW + 6.5; offset <= roadHalfW + 52; offset += 7.0) {
          dashOffsets.push(side * offset);
        }
      }
      if (dashOffsets.length > 0) {
        const dashInst = new THREE.InstancedMesh(crossDashGeo, crossDashMat, dashOffsets.length);
        for (let i = 0; i < dashOffsets.length; i++) {
          ixDummy.position.set(dashOffsets[i], 0.03, 0);
          ixDummy.rotation.set(0, 0, 0);
          ixDummy.scale.set(1, 1, 1);
          ixDummy.updateMatrix();
          dashInst.setMatrixAt(i, ixDummy.matrix);
        }
        dashInst.instanceMatrix.needsUpdate = true;
        ixGroup.add(dashInst);
      }

      // 4-Corner Cross-Street Curbs & Sidewalks (zero corner overlap / z-fighting)
      for (const side of [-1, 1] as const) {
        for (const swSide of [-1, 1] as const) {
          const crossCurb = new THREE.Mesh(crossCurbGeo, curbMat);
          crossCurb.position.set(
            side * (roadHalfW + 27),
            0.08,
            swSide * (INTERSECTION_ROAD_HALF_Z + CURB_WIDTH * 0.5)
          );
          crossCurb.receiveShadow = true;
          ixGroup.add(crossCurb);

          const crossSw = new THREE.Mesh(crossSidewalkGeo, sidewalkMat);
          crossSw.position.set(
            side * (roadHalfW + CURB_WIDTH + sidewalkWidth + 27),
            0.16,
            swSide * (INTERSECTION_CUT_HALF_Z + 2.2)
          );
          crossSw.receiveShadow = true;
          ixGroup.add(crossSw);
        }
      }

      // 4-Way Zebra Crosswalks (North, South, East, West) in ONE InstancedMesh
      const xSpan = roadWidth - 1.2;
      const mainCount = Math.max(5, Math.floor(xSpan / 1.35));
      const crossCount = 10;
      const totalStripes = mainCount * 2 + crossCount * 2;
      const zebraInst = new THREE.InstancedMesh(stripeGeo, zebraMat, totalStripes);
      let zWrite = 0;

      for (const zPos of [9.4, -9.4]) {
        for (let i = 0; i < mainCount; i++) {
          const u = mainCount === 1 ? 0 : i / (mainCount - 1) - 0.5;
          ixDummy.position.set(u * (xSpan - 0.7), 0.036, zPos);
          ixDummy.rotation.set(0, 0, 0);
          ixDummy.scale.set(1, 1, 1);
          ixDummy.updateMatrix();
          zebraInst.setMatrixAt(zWrite++, ixDummy.matrix);
        }
      }

      for (const xPos of [-(roadHalfW + 2.2), roadHalfW + 2.2]) {
        for (let i = 0; i < crossCount; i++) {
          const u = i / (crossCount - 1) - 0.5;
          ixDummy.position.set(xPos, 0.036, u * 12.4);
          ixDummy.rotation.set(0, Math.PI / 2, 0);
          ixDummy.scale.set(1, 1, 1);
          ixDummy.updateMatrix();
          zebraInst.setMatrixAt(zWrite++, ixDummy.matrix);
        }
      }
      zebraInst.instanceMatrix.needsUpdate = true;
      ixGroup.add(zebraInst);

      // Clean Stop Lines outside zebra crosswalks
      const forwardStop = new THREE.Mesh(stopLineGeo, lineMat);
      forwardStop.position.set(roadHalfW * 0.5, 0.034, 11.6);
      ixGroup.add(forwardStop);

      const oncomingStop = new THREE.Mesh(stopLineGeo, lineMat);
      oncomingStop.position.set(-roadHalfW * 0.5, 0.034, -11.6);
      ixGroup.add(oncomingStop);

      const westStop = new THREE.Mesh(crossStopLineGeo, lineMat);
      westStop.position.set(-(roadHalfW + 4.4), 0.034, 3.5);
      ixGroup.add(westStop);

      const eastStop = new THREE.Mesh(crossStopLineGeo, lineMat);
      eastStop.position.set(roadHalfW + 4.4, 0.034, -3.5);
      ixGroup.add(eastStop);

      // Overhead 3-color traffic light gantry behind North zebra (localZ = -11.5) facing +Z
      const gantryZ = -11.5;
      for (const side of [-1, 1] as const) {
        const pillar = new THREE.Mesh(pillarGeo, gantrySteelMat);
        pillar.position.set(side * (roadHalfW + 0.85), 2.9, gantryZ);
        pillar.castShadow = true;
        ixGroup.add(pillar);
      }
      const beam = new THREE.Mesh(beamGeo, gantrySteelMat);
      beam.position.set(0, 5.65, gantryZ);
      ixGroup.add(beam);

      const housing = new THREE.Mesh(housingGeo, signalBoxMat);
      housing.position.set(roadHalfW * 0.45, 5.55, gantryZ + 0.24);
      ixGroup.add(housing);

      const redMat = track(new THREE.MeshBasicMaterial({ color: 0x381010, toneMapped: false }));
      const yellowMat = track(new THREE.MeshBasicMaterial({ color: 0x382c0a, toneMapped: false }));
      const greenMat = track(new THREE.MeshBasicMaterial({ color: 0x0e381c, toneMapped: false }));

      const redLamp = new THREE.Mesh(lampGeo, redMat);
      redLamp.name = 'RedLamp';
      redLamp.position.set(roadHalfW * 0.45 - 0.46, 5.55, gantryZ + 0.43);
      ixGroup.add(redLamp);

      const yellowLamp = new THREE.Mesh(lampGeo, yellowMat);
      yellowLamp.name = 'YellowLamp';
      yellowLamp.position.set(roadHalfW * 0.45, 5.55, gantryZ + 0.43);
      ixGroup.add(yellowLamp);

      const greenLamp = new THREE.Mesh(lampGeo, greenMat);
      greenLamp.name = 'GreenLamp';
      greenLamp.position.set(roadHalfW * 0.45 + 0.46, 5.55, gantryZ + 0.43);
      ixGroup.add(greenLamp);

      ixGroup.visible = false;
      group.add(ixGroup);
      intersectionHandles.push({
        zone,
        group: ixGroup,
        redMat,
        yellowMat,
        greenMat,
        lastState: null
      });
    }
  }

  // ============================================================================
  // ZEBRA CROSSWALKS (Mid-block only; intersection 4-way crosswalks built above)
  // ============================================================================
  const crosswalkItems: Array<{ distance: number; group: THREE.Group }> = [];
  if (routeFeatures.crosswalks.length > 0) {
    const pedSignTex = track(createPedestrianSignTexture());
    const pedSignMat = track(new THREE.MeshBasicMaterial({ map: pedSignTex, side: THREE.DoubleSide }));
    const signPoleGeo = track(new THREE.CylinderGeometry(0.05, 0.06, 3.1, 6));
    const signPoleMat = track(
      new THREE.MeshStandardMaterial({ color: 0x4b5259, roughness: 0.55, metalness: 0.4 })
    );
    const signBoardGeo = track(new THREE.PlaneGeometry(0.75, 0.75));

    for (const cw of routeFeatures.crosswalks) {
      if (cw.intersectionId !== null) continue;
      const cwGroup = new THREE.Group();
      cwGroup.name = `Crosswalk_${cw.id}`;
      cwGroup.position.set(
        getRoadCenterX(stageId, cw.distance),
        getRoadElevationY(stageId, cw.distance),
        distanceToWorldZ(cw.distance)
      );
      cwGroup.rotation.y = getRoadTangentYaw(stageId, cw.distance);

      const span = roadWidth - 1.2;
      const stripeCount = Math.max(5, Math.floor(span / 1.35));
      for (let i = 0; i < stripeCount; i++) {
        const u = stripeCount === 1 ? 0 : i / (stripeCount - 1) - 0.5;
        const sx = u * (span - 0.7);
        const stripe = new THREE.Mesh(stripeGeo, zebraMat);
        stripe.position.set(sx, 0.036, 0);
        cwGroup.add(stripe);
      }

      // Pedestrian warning signs on both curbs for mid-block crosswalks
      if (cw.intersectionId === null) {
        for (const side of [-1, 1] as const) {
          const pole = new THREE.Mesh(signPoleGeo, signPoleMat);
          pole.position.set(side * (roadHalfW + 0.65), 1.55, 0.8);
          cwGroup.add(pole);

          const board = new THREE.Mesh(signBoardGeo, pedSignMat);
          board.position.set(side * (roadHalfW + 0.65), 2.95, 0.83);
          cwGroup.add(board);
        }
      }

      cwGroup.visible = false;
      group.add(cwGroup);
      crosswalkItems.push({ distance: cw.distance, group: cwGroup });
    }
  }

  // ============================================================================
  // CAMERA PHẠT NGUỘI OVERHEAD POLES (Stages 1..9)
  // ============================================================================
  const cameraHandles: CameraPoleHandle[] = [];
  if (routeFeatures.cameras.length > 0) {
    const camPoleMat = track(
      new THREE.MeshStandardMaterial({ color: 0x2a3138, roughness: 0.45, metalness: 0.55 })
    );
    const camBodyMat = track(
      new THREE.MeshStandardMaterial({ color: 0xeceae2, roughness: 0.36, metalness: 0.2 })
    );
    const camLensMat = track(
      new THREE.MeshStandardMaterial({ color: 0x101820, roughness: 0.14, metalness: 0.85 })
    );
    const speedSignTex = track(createSpeedSignTexture(stage.speedLimitKmh));
    const speedSignMat = track(
      new THREE.MeshBasicMaterial({ map: speedSignTex, transparent: true, alphaTest: 0.2 })
    );
    const plateTex = track(createCameraPlateTexture());
    const plateMat = track(new THREE.MeshBasicMaterial({ map: plateTex }));

    const mastGeo = track(new THREE.CylinderGeometry(0.12, 0.16, 6.2, 8));
    const armLen = Math.min(7.5, roadHalfW * 0.72);
    const armGeo = track(new THREE.BoxGeometry(armLen, 0.18, 0.18));
    const housingGeo = track(new THREE.BoxGeometry(0.46, 0.34, 0.62));
    const lensGeo = track(new THREE.CylinderGeometry(0.1, 0.1, 0.12, 10));
    lensGeo.rotateX(Math.PI / 2);
    const signGeo = track(new THREE.CircleGeometry(0.56, 18));
    const plateGeo = track(new THREE.PlaneGeometry(1.75, 0.65));
    const flashGeo = track(new THREE.SphereGeometry(0.32, 10, 8));

    for (const cam of routeFeatures.cameras) {
      const camGroup = new THREE.Group();
      camGroup.name = `SpeedCamera_${cam.id}`;
      camGroup.position.set(
        getRoadCenterX(stageId, cam.distance),
        getRoadElevationY(stageId, cam.distance),
        distanceToWorldZ(cam.distance)
      );
      camGroup.rotation.y = getRoadTangentYaw(stageId, cam.distance);

      const poleX = roadHalfW + 0.72;
      const mast = new THREE.Mesh(mastGeo, camPoleMat);
      mast.position.set(poleX, 3.1, 0);
      mast.castShadow = true;
      camGroup.add(mast);

      const arm = new THREE.Mesh(armGeo, camPoleMat);
      arm.position.set(poleX - armLen * 0.5, 5.95, 0);
      camGroup.add(arm);

      const headX = poleX - armLen * 0.75;
      const housing = new THREE.Mesh(housingGeo, camBodyMat);
      housing.position.set(headX, 5.75, 0.15);
      camGroup.add(housing);

      const lens = new THREE.Mesh(lensGeo, camLensMat);
      lens.position.set(headX, 5.72, 0.48);
      camGroup.add(lens);

      const plate = new THREE.Mesh(plateGeo, plateMat);
      plate.position.set(poleX - armLen * 0.32, 5.45, 0.12);
      camGroup.add(plate);

      const speedSign = new THREE.Mesh(signGeo, speedSignMat);
      speedSign.position.set(poleX - 0.12, 3.05, 0.2);
      camGroup.add(speedSign);

      const flashMat = track(
        new THREE.MeshBasicMaterial({
          color: 0xfff5c0,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          toneMapped: false
        })
      );
      const flashMesh = new THREE.Mesh(flashGeo, flashMat);
      flashMesh.position.set(headX + 0.28, 5.78, 0.48);
      flashMesh.visible = false;
      camGroup.add(flashMesh);

      camGroup.visible = false;
      group.add(camGroup);
      cameraHandles.push({
        id: cam.id,
        distance: cam.distance,
        group: camGroup,
        flashMesh,
        flashMat,
        flashTimer: 0
      });
    }
  }

  let lastWindowStartChunk = Number.NaN;
  let lastWindowEndChunk = Number.NaN;
  let lastElapsedTime = 0;
  let activeRoadChunks = 0;
  let visibleIntersections = 0;
  let visibleCrosswalks = 0;
  let visibleCameras = 0;

  const update = (playerDistance: number, elapsedTime: number, flashDt?: number): void => {
    const dt =
      flashDt !== undefined
        ? Math.max(0, Math.min(0.1, flashDt))
        : Math.max(0, Math.min(0.1, elapsedTime - lastElapsedTime));
    lastElapsedTime = elapsedTime;

    const minDist = Math.max(-START_BUFFER, playerDistance - STREAM_BACK);
    const maxDist = Math.min(stage.length + END_BUFFER, playerDistance + STREAM_AHEAD);
    const minChunkIdx = Math.floor(minDist / CHUNK_LEN);
    const maxChunkIdx = Math.floor(maxDist / CHUNK_LEN);

    if (minChunkIdx !== lastWindowStartChunk || maxChunkIdx !== lastWindowEndChunk) {
      lastWindowStartChunk = minChunkIdx;
      lastWindowEndChunk = maxChunkIdx;

      const needed = new Set<number>();
      for (let c = minChunkIdx; c <= maxChunkIdx; c++) {
        needed.add(c);
      }

      const freeSlots: RoadChunkSlot[] = [];
      const present = new Set<number>();

      for (const slot of chunkPool) {
        if (Number.isFinite(slot.chunkIndex) && needed.has(slot.chunkIndex)) {
          present.add(slot.chunkIndex);
        } else {
          freeSlots.push(slot);
        }
      }

      for (const c of needed) {
        if (present.has(c)) continue;
        const slot = freeSlots.pop();
        if (slot) {
          updateChunkSlot(slot, c);
        }
      }

      activeRoadChunks = 0;
      for (const slot of chunkPool) {
        if (!needed.has(slot.chunkIndex)) {
          slot.chunkIndex = Number.NaN;
          slot.group.visible = false;
        } else if (slot.group.visible) {
          activeRoadChunks += 1;
        }
      }
    }

    for (const m of markerItems) {
      m.mesh.visible = m.distance >= minDist && m.distance <= maxDist;
    }

    // Update visible intersections & traffic light lamp colors
    visibleIntersections = 0;
    for (const ix of intersectionHandles) {
      const inWin =
        ix.zone.distance + ix.zone.halfLength >= minDist &&
        ix.zone.distance - ix.zone.halfLength <= maxDist;
      ix.group.visible = inWin;
      if (!inWin) continue;
      visibleIntersections += 1;

      const state = getTrafficLightState(ix.zone, elapsedTime);
      if (state !== ix.lastState) {
        ix.lastState = state;
        ix.redMat.color.setHex(state === 'red' ? 0xff2b2b : 0x381010);
        ix.yellowMat.color.setHex(state === 'yellow' ? 0xffcc1a : 0x382c0a);
        ix.greenMat.color.setHex(state === 'green' ? 0x22eb6e : 0x0e381c);
      }
    }

    visibleCrosswalks = 0;
    for (const cw of crosswalkItems) {
      const inWin = cw.distance >= minDist && cw.distance <= maxDist;
      cw.group.visible = inWin;
      if (inWin) visibleCrosswalks += 1;
    }

    visibleCameras = 0;
    for (const cam of cameraHandles) {
      const inWin = cam.distance >= minDist && cam.distance <= maxDist;
      cam.group.visible = inWin;
      if (inWin) visibleCameras += 1;

      if (cam.flashTimer > 0) {
        cam.flashTimer = Math.max(0, cam.flashTimer - dt);
        if (cam.flashTimer <= 0.001) {
          cam.flashMesh.visible = false;
          cam.flashMat.opacity = 0;
        } else {
          const t = cam.flashTimer / 0.5;
          cam.flashMesh.visible = true;
          cam.flashMat.opacity = Math.min(1, t * 1.15);
          cam.flashMesh.scale.setScalar(1 + (1 - t) * 2.2);
        }
      }
    }
  };

  const triggerCameraFlash = (cameraId: number): void => {
    const cam = cameraHandles.find((c) => c.id === cameraId);
    if (!cam) return;
    cam.flashTimer = 0.5;
    cam.flashMesh.visible = true;
    cam.flashMat.opacity = 1;
    cam.flashMesh.scale.setScalar(1.2);
  };

  // Wide horizon-sealing terrain apron beyond the finish line (avoids Z-fighting at y = 0)
  const apronGeo = track(new THREE.PlaneGeometry(520, 320));
  apronGeo.rotateX(-Math.PI / 2);
  const finishTerrainApron = new THREE.Mesh(apronGeo, groundMat);
  finishTerrainApron.name = 'FinishTerrainApron';
  finishTerrainApron.position.set(
    getRoadCenterX(stageId, stage.length + 165),
    -0.35,
    distanceToWorldZ(stage.length + 165)
  );
  finishTerrainApron.receiveShadow = true;
  group.add(finishTerrainApron);

  // Initialize window at distance 0
  update(0, 0);

  return {
    group,
    update,
    triggerCameraFlash,
    getStreamingStats: () => ({
      windowStart: Math.max(-START_BUFFER, (lastWindowStartChunk || 0) * CHUNK_LEN),
      windowEnd: Math.min(stage.length + END_BUFFER, ((lastWindowEndChunk || 0) + 1) * CHUNK_LEN),
      activeRoadChunks,
      visibleIntersections,
      visibleCrosswalks,
      visibleCameras
    }),
    dispose: () => {
      for (const item of disposables) {
        item.dispose();
      }
    }
  };
}
