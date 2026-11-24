import * as THREE from 'three';
import { HANOI_PALETTE } from '../config/artPalette.ts';
import { getStageSpec } from '../config/gameConfig.ts';
import {
  distanceToWorldZ,
  getRoadCenterX,
  getRoadElevationY
} from '../core/roadMath.ts';
import { createGroundTerrainTexture } from './hanoiTextures.ts';

export interface RoadBuildResult {
  group: THREE.Group;
  dispose: () => void;
}

const CURB_WIDTH = 0.42;
const START_BUFFER = 30;
const END_BUFFER = 70;
const SEGMENT_STEP = 3.5;

function createAsphaltTexture(stageId: 1 | 2 | 3, laneCount: 2 | 4 | 6): THREE.CanvasTexture {
  const w = laneCount === 6 ? 1024 : 512;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    // Base warm retro asphalt
    ctx.fillStyle = stageId === 1 ? '#45413b' : stageId === 2 ? '#3c4045' : '#353b42';
    ctx.fillRect(0, 0, w, 512);

    // Subtle asphalt grain
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

    // Subtle wheel wear tracks in each active lane
    ctx.fillStyle = 'rgba(24, 22, 20, 0.22)';
    const trackHalfPx = laneCount === 6 ? 26 : laneCount === 2 ? 22 : 18;
    for (const u of laneNorms) {
      ctx.fillRect(u * w - trackHalfPx, 0, trackHalfPx * 2, 512);
    }

    // Solid outer shoulder lines (tighter margin on narrow 2-lane Old Quarter street)
    const shoulderOffsetPx = laneCount === 2 ? 24 : 30;
    const shoulderWidthPx = laneCount === 6 ? 12 : 9;
    ctx.fillStyle = '#ebe3cf';
    ctx.fillRect(shoulderOffsetPx, 0, shoulderWidthPx, 512);
    ctx.fillRect(w - shoulderOffsetPx - shoulderWidthPx, 0, shoulderWidthPx, 512);

    // Dashed white lane dividers within each carriageway (none for 2-lane, 2 for 4-lane, 4 for 6-lane)
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

    // Double-yellow two-way centerline across ALL 3 stages separating oncoming (left) vs forward (right)
    const centerPx = w * 0.5;
    const yellowW = laneCount === 6 ? 7 : 5;
    const yellowGap = laneCount === 6 ? 6 : 4;
    ctx.fillStyle = '#e8ad28';
    ctx.fillRect(centerPx - yellowGap * 0.5 - yellowW, 0, yellowW, 512);
    ctx.fillRect(centerPx + yellowGap * 0.5, 0, yellowW, 512);

    // Worn directional lane arrows (flipY=true -> top y=0 points ahead -Z)
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

function createSidewalkTexture(stageId: 1 | 2 | 3): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = stageId === 1 ? '#a4947f' : '#968f84';
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

function createCurbTexture(redWhite: boolean): THREE.CanvasTexture {
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

interface RibbonSample {
  d: number;
  cx: number;
  y: number;
  z: number;
}

function sampleRoadSpline(stageId: 1 | 2 | 3, stageLength: number): RibbonSample[] {
  const samples: RibbonSample[] = [];
  const totalStart = -START_BUFFER;
  const totalEnd = stageLength + END_BUFFER;
  for (let d = totalStart; d < totalEnd; d += SEGMENT_STEP) {
    samples.push({
      d,
      cx: getRoadCenterX(stageId, d),
      y: getRoadElevationY(stageId, d),
      z: distanceToWorldZ(d)
    });
  }
  samples.push({
    d: totalEnd,
    cx: getRoadCenterX(stageId, totalEnd),
    y: getRoadElevationY(stageId, totalEnd),
    z: distanceToWorldZ(totalEnd)
  });
  return samples;
}

function buildQuadStripGeometry(
  samples: RibbonSample[],
  getRow: (s: RibbonSample) => {
    lx: number;
    ly: number;
    rx: number;
    ry: number;
    uLeft?: number;
    uRight?: number;
    v: number;
  }
): THREE.BufferGeometry {
  const n = samples.length;
  const positions = new Float32Array(n * 2 * 3);
  const uvs = new Float32Array(n * 2 * 2);
  const indices: number[] = [];

  for (let i = 0; i < n; i++) {
    const s = samples[i];
    const row = getRow(s);
    const pIdx = i * 6;
    positions[pIdx] = row.lx;
    positions[pIdx + 1] = row.ly;
    positions[pIdx + 2] = s.z;
    positions[pIdx + 3] = row.rx;
    positions[pIdx + 4] = row.ry;
    positions[pIdx + 5] = s.z;

    const uIdx = i * 4;
    uvs[uIdx] = row.uLeft ?? 0;
    uvs[uIdx + 1] = row.v;
    uvs[uIdx + 2] = row.uRight ?? 1;
    uvs[uIdx + 3] = row.v;

    if (i < n - 1) {
      const a = i * 2;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      indices.push(a, b, c, b, d, c);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Builds the continuous curving Road Rash road, sidewalks, curbs, and Stage 3
 * elevated concrete overpass + ground-level bougainvillea median strip.
 */
export function buildHanoiRoad(stageId: 1 | 2 | 3): RoadBuildResult {
  const stage = getStageSpec(stageId);
  const roadWidth = stage.roadWidth;
  const roadHalfW = roadWidth * 0.5;
  const sidewalkWidth = stageId === 1 ? 4.2 : 6.2;

  const group = new THREE.Group();
  group.name = `HanoiRoad_Stage${stageId}`;

  const disposables: Array<{ dispose: () => void }> = [];
  const track = <T extends { dispose: () => void }>(res: T): T => {
    disposables.push(res);
    return res;
  };

  const samples = sampleRoadSpline(stageId, stage.length);

  // 1. Main Asphalt Surface (follows exact getRoadCenterX & getRoadElevationY)
  const asphaltTex = track(createAsphaltTexture(stageId, stage.laneCount));
  const asphaltGeo = track(
    buildQuadStripGeometry(samples, (s) => ({
      lx: s.cx - roadHalfW,
      ly: s.y,
      rx: s.cx + roadHalfW,
      ry: s.y,
      v: s.d / 14
    }))
  );
  const asphaltMat = track(
    new THREE.MeshStandardMaterial({
      map: asphaltTex,
      roughness: 0.88,
      metalness: 0.04
    })
  );
  const asphaltMesh = new THREE.Mesh(asphaltGeo, asphaltMat);
  asphaltMesh.receiveShadow = true;
  group.add(asphaltMesh);

  // 2. Curbs (red-and-white in Stage 3, weathered stone in Stage 1-2)
  const curbTex = track(createCurbTexture(stageId === 3));
  const curbMat = track(
    new THREE.MeshStandardMaterial({
      map: curbTex,
      roughness: 0.78,
      side: THREE.DoubleSide
    })
  );

  for (const side of [-1, 1] as const) {
    const inner = side * roadHalfW;
    const outer = side * (roadHalfW + CURB_WIDTH);

    const curbTopGeo = track(
      buildQuadStripGeometry(samples, (s) => ({
        lx: s.cx + Math.min(inner, outer),
        ly: s.y + 0.16,
        rx: s.cx + Math.max(inner, outer),
        ry: s.y + 0.16,
        v: s.d / 2.2
      }))
    );
    const curbTop = new THREE.Mesh(curbTopGeo, curbMat);
    curbTop.receiveShadow = true;
    group.add(curbTop);

    // Vertical inner curb face facing road
    const curbFaceGeo = track(
      buildQuadStripGeometry(samples, (s) => ({
        lx: s.cx + inner,
        ly: s.y,
        rx: s.cx + inner,
        ry: s.y + 0.16,
        v: s.d / 2.2
      }))
    );
    const curbFace = new THREE.Mesh(curbFaceGeo, curbMat);
    curbFace.receiveShadow = true;
    group.add(curbFace);
  }

  // 3. Sidewalks (on ground level y = 0; for Stage 3, flanking ground-level sidewalks continue at y = 0!)
  const sidewalkTex = track(createSidewalkTexture(stageId));
  const sidewalkMat = track(
    new THREE.MeshStandardMaterial({
      map: sidewalkTex,
      roughness: 0.9
    })
  );

  for (const side of [-1, 1] as const) {
    const startOffset =
      stageId === 3 ? roadHalfW + 3.2 : roadHalfW + CURB_WIDTH;
    const endOffset = startOffset + sidewalkWidth;

    const swGeo = track(
      buildQuadStripGeometry(samples, (s) => {
        const baseY = stageId === 3 ? 0.12 : s.y + 0.16;
        return {
          lx: s.cx + side * (side < 0 ? endOffset : startOffset),
          ly: baseY,
          rx: s.cx + side * (side < 0 ? startOffset : endOffset),
          ry: baseY,
          uLeft: 0,
          uRight: 2.5,
          v: s.d / 5.5
        };
      })
    );
    const swMesh = new THREE.Mesh(swGeo, sidewalkMat);
    swMesh.receiveShadow = true;
    group.add(swMesh);
  }

  // 4. Wide Textured Ground Terrain underneath everything (no muddy flat plane)
  const groundTex = track(createGroundTerrainTexture(stageId));
  const groundMat = track(
    new THREE.MeshStandardMaterial({
      map: groundTex,
      roughness: 0.94
    })
  );
  const groundGeo = track(
    buildQuadStripGeometry(samples, (s) => ({
      lx: s.cx - 150,
      ly: -0.05,
      rx: s.cx + 150,
      ry: -0.05,
      uLeft: 0,
      uRight: 1,
      v: s.d / 20
    }))
  );
  const groundMesh = new THREE.Mesh(groundGeo, groundMat);
  groundMesh.receiveShadow = true;
  group.add(groundMesh);

  // 5. Stage 3 Concrete Overpass Structure + Ground Service Lanes + Bougainvillea Median
  if (stageId === 3) {
    buildStage3OverpassAndMedians(group, samples, roadHalfW, track);
  }

  // 6. Start (A) and Finish (B) Painted Crosswalk Strips
  const lineMat = track(
    new THREE.MeshStandardMaterial({
      color: HANOI_PALETTE.roadLine,
      roughness: 0.75
    })
  );
  const markerGeo = track(new THREE.PlaneGeometry(roadWidth - 1.0, 1.4));
  markerGeo.rotateX(-Math.PI / 2);

  for (const dist of [2, stage.length]) {
    const line = new THREE.Mesh(markerGeo, lineMat);
    line.position.set(
      getRoadCenterX(stageId, dist),
      getRoadElevationY(stageId, dist) + 0.025,
      distanceToWorldZ(dist)
    );
    line.receiveShadow = true;
    group.add(line);
  }

  return {
    group,
    dispose: () => {
      for (const item of disposables) {
        item.dispose();
      }
    }
  };
}

function buildStage3OverpassAndMedians(
  group: THREE.Group,
  samples: RibbonSample[],
  roadHalfW: number,
  track: <T extends { dispose: () => void }>(res: T) => T
): void {
  const bridgeSamples = samples.filter((s) => s.d >= 680 && s.d <= 1408);

  const concreteMat = track(
    new THREE.MeshStandardMaterial({
      color: HANOI_PALETTE.overpassConcrete,
      roughness: 0.85
    })
  );
  const concreteWallMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xa49c8d,
      roughness: 0.88,
      side: THREE.DoubleSide
    })
  );
  const railMat = track(
    new THREE.MeshStandardMaterial({
      color: HANOI_PALETTE.overpassGuardrail,
      roughness: 0.45,
      metalness: 0.5,
      side: THREE.DoubleSide
    })
  );

  // Wide airy 6-lane overpass concrete deck side parapets + underside + sleek twin guardrails
  for (const side of [-1, 1] as const) {
    const wallX = side * (roadHalfW + CURB_WIDTH);

    const skirtGeo = track(
      buildQuadStripGeometry(bridgeSamples, (s) => ({
        lx: s.cx + wallX,
        ly: Math.max(0, s.y - 0.95),
        rx: s.cx + wallX,
        ry: s.y + 0.52,
        v: s.d / 6
      }))
    );
    const skirt = new THREE.Mesh(skirtGeo, concreteWallMat);
    skirt.castShadow = true;
    skirt.receiveShadow = true;
    group.add(skirt);

    const capGeo = track(
      buildQuadStripGeometry(bridgeSamples, (s) => ({
        lx: s.cx + wallX - 0.16,
        ly: s.y + 0.52,
        rx: s.cx + wallX + 0.16,
        ry: s.y + 0.52,
        v: s.d / 6
      }))
    );
    const cap = new THREE.Mesh(capGeo, concreteMat);
    group.add(cap);

    // Dual tubular steel guardrails leaving open airy sky view from elevated 6-lane deck
    for (const [ry0, ry1] of [
      [0.78, 0.87],
      [1.0, 1.1]
    ] as const) {
      const guardGeo = track(
        buildQuadStripGeometry(bridgeSamples, (s) => ({
          lx: s.cx + wallX,
          ly: s.y + ry0,
          rx: s.cx + wallX,
          ry: s.y + ry1,
          v: s.d / 4
        }))
      );
      const guard = new THREE.Mesh(guardGeo, railMat);
      group.add(guard);
    }
  }

  // Solid underside soffit slab beneath elevated 6-lane overpass deck
  const soffitGeo = track(
    buildQuadStripGeometry(bridgeSamples, (s) => ({
      lx: s.cx - (roadHalfW + CURB_WIDTH),
      ly: Math.max(0, s.y - 0.95),
      rx: s.cx + (roadHalfW + CURB_WIDTH),
      ry: Math.max(0, s.y - 0.95),
      v: s.d / 8
    }))
  );
  const soffit = new THREE.Mesh(soffitGeo, concreteWallMat);
  group.add(soffit);

  // Ground-level flanking bougainvillea planter strips & service road beside 6-lane avenue
  const serviceRoadMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x3b4046,
      roughness: 0.9
    })
  );
  const medianSoilMat = track(
    new THREE.MeshStandardMaterial({
      color: HANOI_PALETTE.bougainvilleaLeaf,
      roughness: 0.92
    })
  );

  for (const side of [-1, 1] as const) {
    const medInner = roadHalfW + CURB_WIDTH;
    const medOuter = roadHalfW + 3.2;
    const medGeo = track(
      buildQuadStripGeometry(samples, (s) => ({
        lx: s.cx + side * (side < 0 ? medOuter : medInner),
        ly: 0.15,
        rx: s.cx + side * (side < 0 ? medInner : medOuter),
        ry: 0.15,
        v: s.d / 6
      }))
    );
    const medMesh = new THREE.Mesh(medGeo, medianSoilMat);
    medMesh.receiveShadow = true;
    group.add(medMesh);

    const svcInner = roadHalfW + 9.4;
    const svcOuter = roadHalfW + 15.0;
    const svcGeo = track(
      buildQuadStripGeometry(samples, (s) => ({
        lx: s.cx + side * (side < 0 ? svcOuter : svcInner),
        ly: 0.02,
        rx: s.cx + side * (side < 0 ? svcInner : svcOuter),
        ry: 0.02,
        v: s.d / 10
      }))
    );
    const svcMesh = new THREE.Mesh(svcGeo, serviceRoadMat);
    svcMesh.receiveShadow = true;
    group.add(svcMesh);
  }
}
