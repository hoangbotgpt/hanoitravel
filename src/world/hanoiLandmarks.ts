import * as THREE from 'three';
import { HANOI_PALETTE } from '../config/artPalette.ts';
import {
  getStageSpec,
  type DestinationKey,
  type StageId
} from '../config/gameConfig.ts';
import {
  distanceToWorldZ,
  getRoadCenterX,
  getRoadElevationY,
  getRoadTangentYaw
} from '../core/roadMath.ts';
import { getStageRouteFeatures } from '../core/routeFeatures.ts';
import {
  createClockTowerShaftTexture,
  createColonialFacadeTexture,
  createLeafFoliageTexture,
  createModernTowerTexture,
  createOQuanChuongStoneTexture,
  createOldQuarterFacadeTexture,
  createOperaFacadeTexture,
  createSoftSunbeamTexture,
  createTerracottaRoofTexture,
  createTreeBarkTexture
} from './hanoiTextures.ts';
import {
  disposeLandmarkObject,
  type LandmarkGlbConfig
} from './landmarkLoader.ts';

export interface AnimatedFlagRecord {
  x: number;
  y: number;
  z: number;
  baseYaw: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
  phase: number;
}

export interface LandmarksBuildResult {
  group: THREE.Group;
  update: (playerDistance: number, elapsedTime: number) => void;
  setHeroGlb: (glb: THREE.Group, config: LandmarkGlbConfig) => void;
  getStreamingStats: () => {
    activeSceneryChunks: number;
    drawCallObjects: number;
    heroGlbLoaded: boolean;
  };
  dispose: () => void;
}

const SCENERY_CHUNK_LEN = 60;
const STREAM_BACK = 60;
const STREAM_AHEAD = 360;

function createPrng(seedInit: number): () => number {
  let seed = seedInit >>> 0;
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function createHeadlessTexture(r: number, g: number, b: number): THREE.Texture {
  const tex = new THREE.DataTexture(new Uint8Array([r, g, b, 255]), 1, 1, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function createFlagTexture(): THREE.Texture {
  if (typeof document === 'undefined') {
    return createHeadlessTexture(218, 37, 29);
  }
  const canvas = document.createElement('canvas');
  canvas.width = 192;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#da251d';
    ctx.fillRect(0, 0, 192, 128);

    ctx.fillStyle = '#ffcd00';
    ctx.beginPath();
    const cx = 96;
    const cy = 64;
    const outerR = 34;
    const innerR = 13.5;
    for (let i = 0; i < 10; i++) {
      const angle = -Math.PI / 2 + (i * Math.PI) / 5;
      const r = i % 2 === 0 ? outerR : innerR;
      const x = cx + Math.cos(angle) * r;
      const y = cy + Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createBannerTexture(
  title: string,
  subtitle: string,
  bgHex: string,
  borderHex: string,
  titleHex = '#f6eedc',
  width = 1280,
  height = 176
): THREE.Texture {
  if (typeof document === 'undefined') {
    return createHeadlessTexture(91, 58, 34);
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = bgHex;
    ctx.fillRect(0, 0, width, height);

    const pad = Math.round(height * 0.08);
    ctx.strokeStyle = borderHex;
    ctx.lineWidth = Math.max(6, Math.round(height * 0.05));
    ctx.strokeRect(pad, pad, width - pad * 2, height - pad * 2);

    const maxTextWidth = width - pad * 6;
    const titleSize = Math.round(height * 0.34);
    const subSize = Math.round(height * 0.18);

    ctx.fillStyle = titleHex;
    ctx.font = `700 ${titleSize}px "Be Vietnam Pro", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(title, width / 2, height * 0.38, maxTextWidth);

    ctx.fillStyle = borderHex;
    ctx.font = `700 ${subSize}px "Be Vietnam Pro", sans-serif`;
    ctx.fillText(subtitle, width / 2, height * 0.72, maxTextWidth);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function createKhueVanCacBannerTexture(): THREE.Texture {
  if (typeof document === 'undefined') {
    return createHeadlessTexture(246, 238, 220);
  }
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, 128, 128);
    ctx.fillStyle = '#f6eedc';
    ctx.beginPath();
    ctx.arc(64, 64, 58, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#155b94';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(64, 64, 50, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = '#155b94';
    ctx.fillRect(36, 76, 56, 12);
    ctx.fillRect(42, 54, 10, 22);
    ctx.fillRect(76, 54, 10, 22);
    ctx.beginPath();
    ctx.arc(64, 54, 11, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(30, 52);
    ctx.lineTo(98, 52);
    ctx.lineTo(86, 42);
    ctx.lineTo(42, 42);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(38, 40);
    ctx.lineTo(90, 40);
    ctx.lineTo(64, 24);
    ctx.closePath();
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createClockFaceTexture(): THREE.Texture {
  if (typeof document === 'undefined') {
    return createHeadlessTexture(35, 38, 41);
  }
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#232629';
    ctx.fillRect(0, 0, 256, 256);

    ctx.strokeStyle = '#eceae2';
    ctx.lineWidth = 8;
    ctx.strokeRect(12, 12, 232, 232);

    ctx.strokeStyle = '#d9cfc1';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(128, 128, 92, 0, Math.PI * 2);
    ctx.stroke();

    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const r1 = i % 3 === 0 ? 74 : 82;
      const r2 = 90;
      ctx.strokeStyle = '#f6eedc';
      ctx.lineWidth = i % 3 === 0 ? 6 : 3;
      ctx.beginPath();
      ctx.moveTo(128 + Math.cos(a) * r1, 128 + Math.sin(a) * r1);
      ctx.lineTo(128 + Math.cos(a) * r2, 128 + Math.sin(a) * r2);
      ctx.stroke();
    }

    ctx.fillStyle = '#f6eedc';
    ctx.font = '700 24px "Be Vietnam Pro", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('12', 128, 56);
    ctx.fillText('3', 200, 128);
    ctx.fillText('6', 128, 200);
    ctx.fillText('9', 56, 128);

    ctx.strokeStyle = '#ffe2a3';
    ctx.lineCap = 'round';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(128, 128);
    ctx.lineTo(174, 152);
    ctx.stroke();

    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(128, 128);
    ctx.lineTo(182, 92);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createGateArch(
  roadWidth: number,
  title: string,
  subtitle: string,
  bgHex: string,
  borderHex: string,
  pillarColor: number,
  track: <T extends { dispose: () => void }>(res: T) => T
): THREE.Group {
  const roadHalfW = roadWidth * 0.5;
  const arch = new THREE.Group();
  const pillarGeo = track(new THREE.BoxGeometry(0.75, 6.4, 0.75));
  const pillarMat = track(new THREE.MeshStandardMaterial({ color: pillarColor, roughness: 0.7 }));

  for (const side of [-1, 1] as const) {
    const pillar = new THREE.Mesh(pillarGeo, pillarMat);
    pillar.position.set(side * (roadHalfW + 0.8), 3.2, 0);
    pillar.castShadow = true;
    arch.add(pillar);
  }

  const headerGeo = track(new THREE.BoxGeometry(roadWidth + 2.4, 2.05, 0.55));
  const headerMat = track(new THREE.MeshStandardMaterial({ color: pillarColor, roughness: 0.65 }));
  const header = new THREE.Mesh(headerGeo, headerMat);
  header.position.set(0, 6.25, 0);
  header.castShadow = true;
  arch.add(header);

  const bannerTex = track(
    createBannerTexture(title, subtitle, bgHex, borderHex, '#f6eedc', 1280, 176)
  );
  const bannerGeo = track(new THREE.PlaneGeometry(roadWidth + 1.5, 1.85));
  const bannerMat = track(
    new THREE.MeshBasicMaterial({ map: bannerTex, side: THREE.DoubleSide })
  );
  const frontBanner = new THREE.Mesh(bannerGeo, bannerMat);
  frontBanner.position.set(0, 6.25, 0.3);
  arch.add(frontBanner);

  return arch;
}

interface FinishHologramHandle {
  group: THREE.Group;
  textMesh: THREE.Mesh;
  textMat: THREE.MeshBasicMaterial;
  baseY: number;
  beamMats: THREE.MeshBasicMaterial[];
}

function createHologramBannerTexture(
  badgeLabel: string,
  title: string,
  subtitle: string,
  accentHex: string
): THREE.Texture {
  if (typeof document === 'undefined') {
    return createHeadlessTexture(232, 168, 56);
  }
  const width = 1280;
  const height = 256;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, width, height);

    // Subtle horizontal holographic scanlines (transparent background lets destination GLB shine through)
    ctx.fillStyle = 'rgba(255, 232, 160, 0.08)';
    for (let y = 14; y < height - 14; y += 12) {
      ctx.fillRect(42, y, width - 84, 2);
    }

    // Glowing HUD corner brackets
    const padX = 28;
    const padY = 20;
    const arm = 48;
    ctx.strokeStyle = accentHex;
    ctx.lineWidth = 6;
    ctx.shadowColor = accentHex;
    ctx.shadowBlur = 16;

    const corners: Array<[number, number, number, number]> = [
      [padX, padY, 1, 1],
      [width - padX, padY, -1, 1],
      [padX, height - padY, 1, -1],
      [width - padX, height - padY, -1, -1]
    ];
    for (const [cx, cy, dx, dy] of corners) {
      ctx.beginPath();
      ctx.moveTo(cx + dx * arm, cy);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx, cy + dy * arm);
      ctx.stroke();
    }

    // Top badge pill text
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(10, 14, 18, 0.88)';
    ctx.shadowBlur = 12;

    ctx.font = '800 28px "Be Vietnam Pro", sans-serif';
    ctx.fillStyle = accentHex;
    ctx.strokeStyle = 'rgba(12, 16, 22, 0.88)';
    ctx.lineWidth = 5;
    ctx.strokeText(badgeLabel, width / 2, 46, width - 160);
    ctx.fillText(badgeLabel, width / 2, 46, width - 160);

    // Main translucent glowing hologram title
    ctx.font = '800 72px "Be Vietnam Pro", sans-serif';
    ctx.lineWidth = 9;
    ctx.strokeStyle = 'rgba(10, 14, 20, 0.9)';
    ctx.strokeText(title, width / 2, 128, width - 120);
    ctx.shadowColor = accentHex;
    ctx.shadowBlur = 20;
    ctx.fillStyle = 'rgba(255, 248, 228, 0.94)';
    ctx.fillText(title, width / 2, 128, width - 120);

    // Subtitle
    ctx.shadowColor = 'rgba(10, 14, 20, 0.88)';
    ctx.shadowBlur = 10;
    ctx.font = '700 30px "Be Vietnam Pro", sans-serif';
    ctx.lineWidth = 5;
    ctx.strokeText(subtitle, width / 2, 204, width - 140);
    ctx.fillStyle = accentHex;
    ctx.fillText(subtitle, width / 2, 204, width - 140);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function createFinishHologram(
  roadWidth: number,
  badgeLabel: string,
  title: string,
  subtitle: string,
  accentHex: string,
  track: <T extends { dispose: () => void }>(res: T) => T
): FinishHologramHandle {
  const roadHalfW = roadWidth * 0.5;
  const group = new THREE.Group();
  group.name = 'FinishHologram';
  group.userData.isFinishHologram = true;

  const baseY = Math.min(8.2, Math.max(6.2, roadWidth * 0.42));
  const bannerWidth = Math.min(18.5, Math.max(9.6, roadWidth * 0.94));
  const holoTex = track(createHologramBannerTexture(badgeLabel, title, subtitle, accentHex));
  const textMat = track(
    new THREE.MeshBasicMaterial({
      map: holoTex,
      transparent: true,
      opacity: 0.84,
      depthWrite: false,
      side: THREE.DoubleSide
    })
  );
  const textMesh = new THREE.Mesh(track(new THREE.PlaneGeometry(bannerWidth, 2.25)), textMat);
  textMesh.position.set(0, baseY, 0);
  textMesh.renderOrder = 6;
  group.add(textMesh);

  // Two translucent holographic light-beam pillars flanking the road edge (no solid obstruction)
  const accentColor = new THREE.Color(accentHex);
  const beamMat = track(
    new THREE.MeshBasicMaterial({
      color: accentColor,
      transparent: true,
      opacity: 0.22,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    })
  );
  const beamGeo = track(new THREE.PlaneGeometry(0.45, 5.4));
  for (const side of [-1, 1] as const) {
    const xPos = side * (roadHalfW + 0.65);
    const beamA = new THREE.Mesh(beamGeo, beamMat);
    beamA.position.set(xPos, 2.7, 0);
    beamA.renderOrder = 5;
    group.add(beamA);

    const beamB = new THREE.Mesh(beamGeo, beamMat);
    beamB.position.set(xPos, 2.7, 0);
    beamB.rotation.y = Math.PI / 2;
    beamB.renderOrder = 5;
    group.add(beamB);
  }

  // Thin additive floor light strip at the finish line
  const floorMat = track(
    new THREE.MeshBasicMaterial({
      color: accentColor,
      transparent: true,
      opacity: 0.28,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    })
  );
  const floorGeo = track(new THREE.PlaneGeometry(roadWidth - 0.6, 1.35));
  floorGeo.rotateX(-Math.PI / 2);
  const floorStrip = new THREE.Mesh(floorGeo, floorMat);
  floorStrip.position.set(0, 0.06, 0);
  floorStrip.renderOrder = 5;
  group.add(floorStrip);

  return {
    group,
    textMesh,
    textMat,
    baseY,
    beamMats: [beamMat, floorMat]
  };
}

function buildOQuanChuongGate(
  roadWidth: number,
  stoneTex: THREE.Texture,
  roofTex: THREE.Texture,
  flagTex: THREE.Texture,
  track: <T extends { dispose: () => void }>(res: T) => T
): THREE.Group {
  const roadHalfW = roadWidth * 0.5;
  const gate = new THREE.Group();
  gate.name = 'Landmark_OQuanChuong';

  const stoneMat = track(new THREE.MeshStandardMaterial({ map: stoneTex, roughness: 0.9 }));
  const darkArchMat = track(new THREE.MeshStandardMaterial({ color: 0x3b3126, roughness: 0.95 }));
  const roofMat = track(new THREE.MeshStandardMaterial({ map: roofTex, roughness: 0.78 }));

  const pierGeo = track(new THREE.BoxGeometry(2.6, 7.6, 3.6));
  for (const side of [-1, 1] as const) {
    const pier = new THREE.Mesh(pierGeo, stoneMat);
    pier.position.set(side * (roadHalfW + 1.7), 3.8, 0);
    pier.castShadow = true;
    pier.receiveShadow = true;
    gate.add(pier);

    const wing = new THREE.Mesh(track(new THREE.BoxGeometry(4.6, 6.4, 2.9)), stoneMat);
    wing.position.set(side * (roadHalfW + 5.1), 3.2, 0);
    wing.castShadow = true;
    gate.add(wing);

    const sidePortal = new THREE.Mesh(track(new THREE.BoxGeometry(1.8, 3.0, 3.04)), darkArchMat);
    sidePortal.position.set(side * (roadHalfW + 5.0), 1.5, 0);
    gate.add(sidePortal);

    const sideArchTop = new THREE.Mesh(
      track(new THREE.CylinderGeometry(0.9, 0.9, 3.04, 14, 1, false, 0, Math.PI)),
      darkArchMat
    );
    sideArchTop.rotation.x = Math.PI / 2;
    sideArchTop.rotation.z = Math.PI / 2;
    sideArchTop.position.set(side * (roadHalfW + 5.0), 3.0, 0);
    gate.add(sideArchTop);

    const curtainWall = new THREE.Mesh(track(new THREE.BoxGeometry(10.5, 5.6, 2.5)), stoneMat);
    curtainWall.position.set(side * (roadHalfW + 12.2), 2.8, 0);
    curtainWall.castShadow = true;
    curtainWall.receiveShadow = true;
    gate.add(curtainWall);

    const wallCoping = new THREE.Mesh(track(new THREE.BoxGeometry(10.7, 0.35, 2.8)), roofMat);
    wallCoping.position.set(side * (roadHalfW + 12.2), 5.75, 0);
    gate.add(wallCoping);
  }

  const archSpanR = roadHalfW + 0.85;
  const archSpringY = 4.35;
  const archSegs = 12;
  const voussoirGeo = track(new THREE.BoxGeometry(1.55, 1.32, 3.55));
  for (let i = 0; i <= archSegs; i++) {
    const theta = (i / archSegs) * Math.PI;
    const vx = Math.cos(theta) * archSpanR;
    const vy = archSpringY + Math.sin(theta) * 2.35;
    const vBlock = new THREE.Mesh(voussoirGeo, stoneMat);
    vBlock.position.set(-vx, vy, 0);
    vBlock.rotation.z = -(theta - Math.PI / 2) * 0.48;
    vBlock.castShadow = true;
    gate.add(vBlock);
  }

  const lintelWidth = roadWidth + 7.2;
  const lintel = new THREE.Mesh(track(new THREE.BoxGeometry(lintelWidth, 1.65, 3.5)), stoneMat);
  lintel.position.set(0, 7.25, 0);
  lintel.castShadow = true;
  gate.add(lintel);

  const parapetHalf = roadHalfW + 4.8;
  const parapetPostGeo = track(new THREE.BoxGeometry(0.5, 0.9, 0.48));
  for (let x = -parapetHalf; x <= parapetHalf; x += 1.45) {
    const post = new THREE.Mesh(parapetPostGeo, stoneMat);
    post.position.set(x, 8.5, 1.5);
    gate.add(post);
  }
  const rail = new THREE.Mesh(
    track(new THREE.BoxGeometry(parapetHalf * 2 + 1.0, 0.28, 0.58)),
    stoneMat
  );
  rail.position.set(0, 9.0, 1.5);
  gate.add(rail);

  const towerPierGeo = track(new THREE.BoxGeometry(1.9, 3.0, 3.2));
  for (const side of [-1, 1] as const) {
    const tPier = new THREE.Mesh(towerPierGeo, stoneMat);
    tPier.position.set(side * 2.15, 9.9, 0);
    tPier.castShadow = true;
    gate.add(tPier);
  }

  const towerSill = new THREE.Mesh(track(new THREE.BoxGeometry(2.4, 0.75, 3.2)), stoneMat);
  towerSill.position.set(0, 8.78, 0);
  gate.add(towerSill);

  const towerLintel = new THREE.Mesh(track(new THREE.BoxGeometry(2.4, 0.75, 3.2)), stoneMat);
  towerLintel.position.set(0, 11.02, 0);
  gate.add(towerLintel);

  const lowerRoof = new THREE.Mesh(track(new THREE.ConeGeometry(5.1, 1.45, 4)), roofMat);
  lowerRoof.rotation.y = Math.PI / 4;
  lowerRoof.scale.set(1.18, 1, 0.78);
  lowerRoof.position.set(0, 12.0, 0);
  gate.add(lowerRoof);

  const upperRoof = new THREE.Mesh(track(new THREE.ConeGeometry(3.4, 1.25, 4)), roofMat);
  upperRoof.rotation.y = Math.PI / 4;
  upperRoof.scale.set(1.15, 1, 0.78);
  upperRoof.position.set(0, 13.1, 0);
  gate.add(upperRoof);

  const oqcPole = new THREE.Mesh(
    track(new THREE.CylinderGeometry(0.055, 0.075, 1.6, 8)),
    track(new THREE.MeshStandardMaterial({ color: HANOI_PALETTE.clockTowerWhite, roughness: 0.5 }))
  );
  oqcPole.position.set(0, 13.35, 0.8);
  gate.add(oqcPole);

  const oqcFlag = new THREE.Mesh(
    track(new THREE.PlaneGeometry(1.9, 1.2)),
    track(new THREE.MeshBasicMaterial({ map: flagTex, side: THREE.DoubleSide }))
  );
  oqcFlag.position.set(0.95, 13.85, 0.8);
  gate.add(oqcFlag);

  const plaqueTex = track(
    createBannerTexture(
      'Ô QUAN CHƯỞNG',
      'DI TÍCH THĂNG LONG · HÀ NỘI',
      '#5d5141',
      '#ead9b5',
      '#f6eedc',
      1024,
      256
    )
  );
  const plaque = new THREE.Mesh(
    track(new THREE.PlaneGeometry(5.8, 1.45)),
    track(new THREE.MeshBasicMaterial({ map: plaqueTex }))
  );
  plaque.position.set(0, 7.65, 1.84);
  gate.add(plaque);

  return gate;
}

function buildOperaHouseLandmark(
  operaFacadeTex: THREE.Texture,
  colonialTex: THREE.Texture,
  flagTex: THREE.Texture,
  track: <T extends { dispose: () => void }>(res: T) => T
): THREE.Group {
  const opera = new THREE.Group();
  opera.name = 'Landmark_NhaHatLon';

  const facadeMat = track(new THREE.MeshStandardMaterial({ map: operaFacadeTex, roughness: 0.72 }));
  const wingMat = track(new THREE.MeshStandardMaterial({ map: colonialTex, roughness: 0.78 }));
  const slateMat = track(
    new THREE.MeshStandardMaterial({ color: HANOI_PALETTE.operaSlateRoof, roughness: 0.62 })
  );
  const whiteMat = track(
    new THREE.MeshStandardMaterial({ color: HANOI_PALETTE.clockTowerWhite, roughness: 0.68 })
  );

  const plinth = new THREE.Mesh(track(new THREE.BoxGeometry(38, 1.6, 18)), whiteMat);
  plinth.position.set(0, 0.8, 0);
  plinth.receiveShadow = true;
  opera.add(plinth);

  for (let s = 0; s < 3; s++) {
    const step = new THREE.Mesh(
      track(new THREE.BoxGeometry(18 - s * 1.4, 0.4, 5.5 - s * 1.2)),
      whiteMat
    );
    step.position.set(0, 0.2 + s * 0.4, 10.6 - s * 0.6);
    opera.add(step);
  }

  const mainBody = new THREE.Mesh(track(new THREE.BoxGeometry(25, 11.4, 14)), facadeMat);
  mainBody.position.set(0, 7.3, 0);
  mainBody.castShadow = true;
  opera.add(mainBody);

  for (const side of [-1, 1] as const) {
    const wing = new THREE.Mesh(track(new THREE.BoxGeometry(7.2, 10.2, 13)), wingMat);
    wing.position.set(side * 16.0, 6.7, 0.4);
    wing.castShadow = true;
    opera.add(wing);

    const wingRoof = new THREE.Mesh(track(new THREE.CylinderGeometry(3.4, 4.7, 2.4, 4)), slateMat);
    wingRoof.rotation.y = Math.PI / 4;
    wingRoof.scale.set(1.12, 1, 1.85);
    wingRoof.position.set(side * 16.0, 13.0, 0.4);
    opera.add(wingRoof);

    const wingCap = new THREE.Mesh(track(new THREE.BoxGeometry(3.8, 0.45, 7.6)), whiteMat);
    wingCap.position.set(side * 16.0, 14.3, 0.4);
    opera.add(wingCap);
  }

  const colGeo = track(new THREE.CylinderGeometry(0.32, 0.38, 6.6, 10));
  for (let i = -3; i <= 3; i++) {
    const col = new THREE.Mesh(colGeo, whiteMat);
    col.position.set(i * 2.6, 5.0, 7.5);
    opera.add(col);
  }

  const cornice = new THREE.Mesh(track(new THREE.BoxGeometry(26.4, 1.15, 15.2)), whiteMat);
  cornice.position.set(0, 13.2, 0);
  opera.add(cornice);

  const pedimentShape = new THREE.Shape();
  pedimentShape.moveTo(-6.2, 0);
  pedimentShape.lineTo(6.2, 0);
  pedimentShape.lineTo(0, 2.8);
  pedimentShape.closePath();
  const pediment = new THREE.Mesh(
    track(new THREE.ExtrudeGeometry(pedimentShape, { depth: 1.4, bevelEnabled: false })),
    whiteMat
  );
  pediment.position.set(0, 13.7, 6.4);
  opera.add(pediment);

  const lowerMansard = new THREE.Mesh(
    track(new THREE.CylinderGeometry(11.4, 14.2, 3.2, 4)),
    slateMat
  );
  lowerMansard.rotation.y = Math.PI / 4;
  lowerMansard.scale.set(1.22, 1, 0.68);
  lowerMansard.position.set(0, 15.3, 0);
  opera.add(lowerMansard);

  const midCornice = new THREE.Mesh(track(new THREE.BoxGeometry(19.8, 0.45, 11.2)), whiteMat);
  midCornice.position.set(0, 17.0, 0);
  opera.add(midCornice);

  const upperMansard = new THREE.Mesh(
    track(new THREE.CylinderGeometry(8.4, 10.6, 2.8, 4)),
    slateMat
  );
  upperMansard.rotation.y = Math.PI / 4;
  upperMansard.scale.set(1.24, 1, 0.66);
  upperMansard.position.set(0, 18.6, 0);
  opera.add(upperMansard);

  const crestBar = new THREE.Mesh(track(new THREE.BoxGeometry(13.6, 0.65, 0.8)), whiteMat);
  crestBar.position.set(0, 20.2, 0);
  opera.add(crestBar);

  const dormerGeo = track(new THREE.BoxGeometry(1.35, 1.75, 0.95));
  for (let i = -3; i <= 3; i++) {
    if (i === 0) continue;
    const dormer = new THREE.Mesh(dormerGeo, whiteMat);
    dormer.position.set(i * 2.85, 15.1, 6.15);
    dormer.rotation.x = -0.22;
    opera.add(dormer);
  }

  const pole = new THREE.Mesh(track(new THREE.CylinderGeometry(0.08, 0.1, 5.2, 8)), whiteMat);
  pole.position.set(0, 18.2, 6.6);
  opera.add(pole);

  const flag = new THREE.Mesh(
    track(new THREE.PlaneGeometry(3.3, 2.15)),
    track(new THREE.MeshBasicMaterial({ map: flagTex, side: THREE.DoubleSide }))
  );
  flag.position.set(1.65, 19.7, 6.6);
  opera.add(flag);

  return opera;
}

/**
 * Stylized procedural fallback hero landmarks for all 9 Ver 2.0 iconic destinations
 * (to be swapped seamlessly with user-supplied GLBs in Phase 2.0C).
 */
function buildDestinationLandmark(
  dest: DestinationKey,
  deps: {
    colonialTex0: THREE.Texture;
    colonialTex1: THREE.Texture;
    roofTex: THREE.Texture;
    shaftTex: THREE.Texture;
    stoneTex: THREE.Texture;
    operaFacadeTex: THREE.Texture;
    flagTex: THREE.Texture;
  },
  track: <T extends { dispose: () => void }>(res: T) => T
): THREE.Group {
  if (dest === 'nha_hat_lon') {
    const opera = buildOperaHouseLandmark(
      deps.operaFacadeTex,
      deps.colonialTex1,
      deps.flagTex,
      track
    );
    opera.scale.setScalar(1.12);
    return opera;
  }

  const g = new THREE.Group();
  g.name = `DestinationHero_${dest}`;

  const whiteMat = track(
    new THREE.MeshStandardMaterial({ color: HANOI_PALETTE.clockTowerWhite, roughness: 0.65 })
  );
  const stoneMat = track(new THREE.MeshStandardMaterial({ map: deps.shaftTex, roughness: 0.72 }));
  const brickMat = track(
    new THREE.MeshStandardMaterial({ color: HANOI_PALETTE.terracottaRoof, roughness: 0.78 })
  );
  const goldMat = track(
    new THREE.MeshStandardMaterial({
      color: HANOI_PALETTE.flagStarYellow,
      roughness: 0.35,
      metalness: 0.38
    })
  );
  const glassMat = track(
    new THREE.MeshStandardMaterial({ color: 0x3b6982, roughness: 0.2, metalness: 0.55 })
  );
  const grassMat = track(
    new THREE.MeshStandardMaterial({ color: HANOI_PALETTE.bougainvilleaLeaf, roughness: 0.9 })
  );
  const flagMat = track(
    new THREE.MeshBasicMaterial({ map: deps.flagTex, side: THREE.DoubleSide })
  );

  if (dest === 'my_dinh') {
    // Sân vận động Quốc gia Mỹ Đình: wide white bowl + sweeping arched roof canopy + floodlight towers
    const bowl = new THREE.Mesh(track(new THREE.CylinderGeometry(24, 21, 9.5, 24, 1, true)), whiteMat);
    bowl.position.set(0, 4.75, 0);
    g.add(bowl);

    const roofArch = new THREE.Mesh(
      track(new THREE.TorusGeometry(21, 3.2, 10, 28, Math.PI)),
      whiteMat
    );
    roofArch.scale.set(1.15, 0.55, 1.0);
    roofArch.position.set(0, 10.5, 2);
    g.add(roofArch);

    const pitch = new THREE.Mesh(track(new THREE.CylinderGeometry(19, 19, 0.4, 24)), grassMat);
    pitch.position.set(0, 0.2, 0);
    g.add(pitch);

    const lightMat = track(new THREE.MeshBasicMaterial({ color: 0xfff8d8 }));
    for (const sx of [-18, 18]) {
      const mast = new THREE.Mesh(track(new THREE.CylinderGeometry(0.45, 0.65, 24, 8)), whiteMat);
      mast.position.set(sx, 12, 6);
      g.add(mast);
      const bank = new THREE.Mesh(track(new THREE.BoxGeometry(5.5, 2.2, 0.8)), lightMat);
      bank.position.set(sx, 23.2, 6.4);
      g.add(bank);
    }
    return g;
  }

  if (dest === 'quan_su') {
    // Bảo tàng Lịch sử Quân sự: modern stepped white exhibition hall + tall Victory Tower
    const hall = new THREE.Mesh(track(new THREE.BoxGeometry(36, 9.5, 16)), whiteMat);
    hall.position.set(0, 4.75, -4);
    hall.castShadow = true;
    g.add(hall);

    const glassBand = new THREE.Mesh(track(new THREE.BoxGeometry(30, 3.8, 16.3)), glassMat);
    glassBand.position.set(0, 5.2, -4);
    g.add(glassBand);

    const tower = new THREE.Mesh(track(new THREE.CylinderGeometry(1.5, 2.6, 26, 4)), whiteMat);
    tower.rotation.y = Math.PI / 4;
    tower.position.set(0, 13, 6);
    tower.castShadow = true;
    g.add(tower);

    const star = new THREE.Mesh(track(new THREE.OctahedronGeometry(1.6, 0)), goldMat);
    star.position.set(0, 27.2, 6);
    g.add(star);
    return g;
  }

  if (dest === 'vinuni') {
    // Đại học VinUni: gothic-white arched main pavilion + central clock/bell spire + front lawn
    const lawn = new THREE.Mesh(track(new THREE.BoxGeometry(40, 0.4, 14)), grassMat);
    lawn.position.set(0, 0.2, 8);
    g.add(lawn);

    const body = new THREE.Mesh(track(new THREE.BoxGeometry(34, 11.5, 13)), whiteMat);
    body.position.set(0, 5.75, -2);
    body.castShadow = true;
    g.add(body);

    const roof = new THREE.Mesh(track(new THREE.BoxGeometry(35.2, 1.4, 13.8)), brickMat);
    roof.position.set(0, 12.2, -2);
    g.add(roof);

    for (let i = -3; i <= 3; i++) {
      const col = new THREE.Mesh(track(new THREE.CylinderGeometry(0.4, 0.45, 9.5, 8)), whiteMat);
      col.position.set(i * 4.2, 4.75, 4.8);
      g.add(col);
    }

    const spireBase = new THREE.Mesh(track(new THREE.BoxGeometry(6.5, 17, 6.5)), whiteMat);
    spireBase.position.set(0, 8.5, -1);
    g.add(spireBase);

    const spireTop = new THREE.Mesh(track(new THREE.ConeGeometry(3.8, 8.5, 4)), glassMat);
    spireTop.rotation.y = Math.PI / 4;
    spireTop.position.set(0, 21.2, -1);
    g.add(spireTop);
    return g;
  }

  if (dest === 'lang_bac') {
    // Lăng Chủ tịch Hồ Chí Minh: solemn stepped granite colonnade + Ba Đình lawn
    const lawn = new THREE.Mesh(track(new THREE.BoxGeometry(42, 0.35, 16)), grassMat);
    lawn.position.set(0, 0.18, 9);
    g.add(lawn);

    const graniteMat = track(
      new THREE.MeshStandardMaterial({ color: 0x6f6c66, roughness: 0.78 })
    );
    const darkStoneMat = track(
      new THREE.MeshStandardMaterial({ color: 0x3b3834, roughness: 0.85 })
    );

    const base = new THREE.Mesh(track(new THREE.BoxGeometry(34, 3.2, 18)), graniteMat);
    base.position.set(0, 1.6, -2);
    g.add(base);

    const innerHall = new THREE.Mesh(track(new THREE.BoxGeometry(24, 9.5, 12)), darkStoneMat);
    innerHall.position.set(0, 7.8, -2);
    g.add(innerHall);

    const colGeo = track(new THREE.BoxGeometry(1.3, 9.6, 1.3));
    for (let i = -5; i <= 5; i++) {
      const col = new THREE.Mesh(colGeo, graniteMat);
      col.position.set(i * 2.7, 7.9, 5.2);
      g.add(col);
    }

    const roof1 = new THREE.Mesh(track(new THREE.BoxGeometry(31, 2.2, 17)), graniteMat);
    roof1.position.set(0, 13.6, -2);
    g.add(roof1);

    const roof2 = new THREE.Mesh(track(new THREE.BoxGeometry(25, 1.8, 13.5)), graniteMat);
    roof2.position.set(0, 15.6, -2);
    g.add(roof2);

    const crest = new THREE.Mesh(track(new THREE.BoxGeometry(14, 0.9, 0.4)), brickMat);
    crest.position.set(0, 13.8, 6.7);
    g.add(crest);
    return g;
  }

  if (dest === 'cot_co') {
    // Cột Cờ Hà Nội: 3-tier brick bastion + octagonal tower + flying Vietnamese flag
    const bastionMat = track(
      new THREE.MeshStandardMaterial({ color: 0xa56946, roughness: 0.85 })
    );
    const tiers: Array<[number, number, number]> = [
      [22, 3.4, 1.7],
      [16.5, 3.2, 5.0],
      [11.5, 3.0, 8.1]
    ];
    for (const [w, h, y] of tiers) {
      const t = new THREE.Mesh(track(new THREE.BoxGeometry(w, h, w * 0.72)), bastionMat);
      t.position.set(0, y, 0);
      t.castShadow = true;
      g.add(t);
    }

    const shaft = new THREE.Mesh(
      track(new THREE.CylinderGeometry(2.3, 2.9, 13.5, 8)),
      bastionMat
    );
    shaft.position.set(0, 16.2, 0);
    shaft.castShadow = true;
    g.add(shaft);

    const crown = new THREE.Mesh(track(new THREE.CylinderGeometry(2.7, 2.7, 1.6, 8)), whiteMat);
    crown.position.set(0, 23.4, 0);
    g.add(crown);

    const pole = new THREE.Mesh(track(new THREE.CylinderGeometry(0.12, 0.16, 7.5, 8)), whiteMat);
    pole.position.set(0, 27.6, 0);
    g.add(pole);

    const flag = new THREE.Mesh(track(new THREE.PlaneGeometry(5.6, 3.6)), flagMat);
    flag.position.set(2.8, 29.4, 0);
    g.add(flag);
    return g;
  }

  if (dest === 'nha_tho_lon') {
    // Nhà Thờ Lớn Hà Nội: weathered gothic stone facade + twin bell towers + rose window
    const cathedralMat = track(
      new THREE.MeshStandardMaterial({ map: deps.stoneTex, color: 0x999286, roughness: 0.9 })
    );
    const body = new THREE.Mesh(track(new THREE.BoxGeometry(18, 14, 18)), cathedralMat);
    body.position.set(0, 7, -2);
    body.castShadow = true;
    g.add(body);

    for (const side of [-1, 1] as const) {
      const belfry = new THREE.Mesh(track(new THREE.BoxGeometry(4.6, 23, 5.0)), cathedralMat);
      belfry.position.set(side * 6.8, 11.5, 5.2);
      belfry.castShadow = true;
      g.add(belfry);

      const spire = new THREE.Mesh(track(new THREE.ConeGeometry(2.6, 6.2, 4)), cathedralMat);
      spire.rotation.y = Math.PI / 4;
      spire.position.set(side * 6.8, 26.0, 5.2);
      g.add(spire);
    }

    const rose = new THREE.Mesh(track(new THREE.CircleGeometry(2.4, 18)), goldMat);
    rose.position.set(0, 10.6, 7.15);
    g.add(rose);

    const clockTex = track(createClockFaceTexture());
    const clock = new THREE.Mesh(
      track(new THREE.CircleGeometry(1.4, 16)),
      track(new THREE.MeshBasicMaterial({ map: clockTex }))
    );
    clock.position.set(0, 14.5, 7.15);
    g.add(clock);
    return g;
  }

  if (dest === 'ho_hoan_kiem') {
    // Hồ Hoàn Kiếm: jade-green lake + curved red Thê Húc bridge + Tháp Rùa island pavilion
    const lakeMat = track(
      new THREE.MeshStandardMaterial({ color: 0x1e6b5c, roughness: 0.22, metalness: 0.25 })
    );
    const lake = new THREE.Mesh(track(new THREE.CylinderGeometry(28, 28, 0.3, 28)), lakeMat);
    lake.position.set(0, 0.15, -4);
    g.add(lake);

    const island = new THREE.Mesh(track(new THREE.CylinderGeometry(6.4, 7.2, 0.9, 16)), grassMat);
    island.position.set(0, 0.55, -8);
    g.add(island);

    const tower1 = new THREE.Mesh(track(new THREE.BoxGeometry(4.8, 3.6, 4.8)), whiteMat);
    tower1.position.set(0, 2.7, -8);
    g.add(tower1);

    const tower2 = new THREE.Mesh(track(new THREE.BoxGeometry(3.6, 2.8, 3.6)), whiteMat);
    tower2.position.set(0, 5.9, -8);
    g.add(tower2);

    const roof = new THREE.Mesh(track(new THREE.ConeGeometry(3.4, 2.2, 4)), brickMat);
    roof.rotation.y = Math.PI / 4;
    roof.position.set(0, 8.4, -8);
    g.add(roof);

    // Curved red Cầu Thê Húc leading toward the side shore
    const redBridgeMat = track(
      new THREE.MeshStandardMaterial({ color: HANOI_PALETTE.flagRed, roughness: 0.55 })
    );
    const bridge = new THREE.Mesh(track(new THREE.BoxGeometry(14, 0.55, 2.6)), redBridgeMat);
    bridge.position.set(11, 1.4, 4);
    bridge.rotation.y = 0.28;
    g.add(bridge);
    return g;
  }

  // 'ga_ha_noi': Ga Hà Nội French-colonial station facade fallback
  const stationWallMat = track(
    new THREE.MeshStandardMaterial({ color: 0xd9b56c, roughness: 0.72 })
  );
  const mainHall = new THREE.Mesh(track(new THREE.BoxGeometry(44, 11.5, 14)), stationWallMat);
  mainHall.position.set(0, 5.75, -2);
  mainHall.castShadow = true;
  g.add(mainHall);

  const centralPavilion = new THREE.Mesh(
    track(new THREE.BoxGeometry(15, 15.5, 16)),
    stationWallMat
  );
  centralPavilion.position.set(0, 7.75, -1);
  centralPavilion.castShadow = true;
  g.add(centralPavilion);

  const roofCap = new THREE.Mesh(track(new THREE.BoxGeometry(46, 1.6, 15)), brickMat);
  roofCap.position.set(0, 12.2, -2);
  g.add(roofCap);

  const domeRoof = new THREE.Mesh(track(new THREE.ConeGeometry(8.5, 4.2, 4)), brickMat);
  domeRoof.rotation.y = Math.PI / 4;
  domeRoof.position.set(0, 17.6, -1);
  g.add(domeRoof);

  const clockTex = track(createClockFaceTexture());
  const stationClock = new THREE.Mesh(
    track(new THREE.CircleGeometry(1.75, 16)),
    track(new THREE.MeshBasicMaterial({ map: clockTex }))
  );
  stationClock.position.set(0, 13.4, 7.1);
  g.add(stationClock);

  const canopy = new THREE.Mesh(track(new THREE.BoxGeometry(18, 0.45, 4.5)), stoneMat);
  canopy.position.set(0, 4.4, 8.8);
  g.add(canopy);
  return g;
}

interface SceneryChunkData {
  trunk: THREE.Matrix4[];
  branch: THREE.Matrix4[];
  limeBase: THREE.Matrix4[];
  canopy: THREE.Matrix4[];
  canopyColor: THREE.Color[];
  pole: THREE.Matrix4[];
  lampHead: THREE.Matrix4[];
  flags: AnimatedFlagRecord[];
  // Theme-specific
  house: [THREE.Matrix4[], THREE.Matrix4[], THREE.Matrix4[]];
  roof: THREE.Matrix4[];
  waterTank: THREE.Matrix4[];
  awning: THREE.Matrix4[];
  balcony: THREE.Matrix4[];
  signs: THREE.Matrix4[][];
  stool: THREE.Matrix4[];
  pot: THREE.Matrix4[];
  potFlower: THREE.Matrix4[];
  wires: number[];
  villa: [THREE.Matrix4[], THREE.Matrix4[]];
  villaRoof: THREE.Matrix4[];
  banner: THREE.Matrix4[];
  sunbeam: THREE.Matrix4[];
  shrub: THREE.Matrix4[];
  blossom: THREE.Matrix4[];
  blossomColor: THREE.Color[];
  pier: THREE.Matrix4[];
  pierCap: THREE.Matrix4[];
  midRise: [THREE.Matrix4[], THREE.Matrix4[]];
  tower: [THREE.Matrix4[], THREE.Matrix4[], THREE.Matrix4[]];
  towerCrown: THREE.Matrix4[];
}

function createEmptyChunkData(): SceneryChunkData {
  return {
    trunk: [],
    branch: [],
    limeBase: [],
    canopy: [],
    canopyColor: [],
    pole: [],
    lampHead: [],
    flags: [],
    house: [[], [], []],
    roof: [],
    waterTank: [],
    awning: [],
    balcony: [],
    signs: Array.from({ length: 8 }, () => []),
    stool: [],
    pot: [],
    potFlower: [],
    wires: [],
    villa: [[], []],
    villaRoof: [],
    banner: [],
    sunbeam: [],
    shrub: [],
    blossom: [],
    blossomColor: [],
    pier: [],
    pierCap: [],
    midRise: [[], []],
    tower: [[], [], []],
    towerCrown: []
  };
}

function createStreamingInstancedMesh(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  maxCount: number,
  hasColor: boolean,
  castShadow: boolean,
  receiveShadow: boolean,
  track: <T extends { dispose: () => void }>(res: T) => T
): THREE.InstancedMesh {
  track(geometry);
  track(material);
  const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, maxCount));
  mesh.count = 0;
  mesh.castShadow = castShadow;
  mesh.receiveShadow = receiveShadow;
  mesh.frustumCulled = false;
  if (hasColor) {
    // Initialize instanceColor buffer upfront
    const c = new THREE.Color(0xffffff);
    for (let i = 0; i < Math.max(1, maxCount); i++) {
      mesh.setColorAt(i, c);
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }
  return mesh;
}

/**
 * Streaming Hanoi scenery builder supporting 2 km, 5 km, and 10 km stages
 * within bounded InstancedMesh budgets (drawCalls <= 120, FPS >= 55).
 * Includes full 4-lane green ancient tree canopy tunnel (FR-13) and 9 hero destination landmarks.
 */
export function buildHanoiLandmarks(stageId: StageId): LandmarksBuildResult {
  const stage = getStageSpec(stageId);
  const roadWidth = stage.roadWidth;
  const roadHalfW = roadWidth * 0.5;
  const routeFeatures = getStageRouteFeatures(stageId);

  const group = new THREE.Group();
  group.name = `HanoiLandmarks_Stage${stageId}`;

  const disposables: Array<{ dispose: () => void }> = [];
  const track = <T extends { dispose: () => void }>(res: T): T => {
    disposables.push(res);
    return res;
  };

  // Shared procedural textures
  const roofTex = track(createTerracottaRoofTexture());
  const foliageTex = track(createLeafFoliageTexture());
  const barkTex = track(createTreeBarkTexture());
  const colonialTex0 = track(createColonialFacadeTexture(0));
  const colonialTex1 = track(createColonialFacadeTexture(1));
  const shaftTex = track(createClockTowerShaftTexture());
  const stoneTex = track(createOQuanChuongStoneTexture());
  const operaFacadeTex = track(createOperaFacadeTexture());
  const flagTex = track(createFlagTexture());

  const greenCol = new THREE.Color(HANOI_PALETTE.foliageGreen);
  const deepGreenCol = new THREE.Color(0x265928);
  const sunlitCol = new THREE.Color(HANOI_PALETTE.foliageSunlit);
  const autumnCol = new THREE.Color(HANOI_PALETTE.foliageAutumn);
  const pinkCol = new THREE.Color(HANOI_PALETTE.bougainvilleaPink);
  const magentaCol = new THREE.Color(HANOI_PALETTE.bougainvilleaMagenta);

  const dummy = new THREE.Object3D();
  const makeMat = (
    x: number,
    y: number,
    z: number,
    rx = 0,
    ry = 0,
    rz = 0,
    sx = 1,
    sy = 1,
    sz = 1
  ): THREE.Matrix4 => {
    dummy.position.set(x, y, z);
    dummy.rotation.set(rx, ry, rz);
    dummy.scale.set(sx, sy, sz);
    dummy.updateMatrix();
    return dummy.matrix.clone();
  };

  const isNearIntersection = (d: number, pad = 12.5): boolean => {
    for (const ix of routeFeatures.intersections) {
      if (Math.abs(d - ix.distance) <= ix.halfLength + pad) {
        return true;
      }
    }
    return false;
  };

  const pushTreeIntoChunk = (
    chunk: SceneryChunkData,
    rand: () => number,
    tx: number,
    z: number,
    hScale: number,
    withLimeBase: boolean,
    leanInwardDir: number,
    isAutumnStyle: boolean,
    withCanopyArch = false,
    cxCenter = 0
  ): void => {
    const trunkH = 5.2 * hScale;
    chunk.trunk.push(
      makeMat(tx, trunkH * 0.5, z, 0, rand() * Math.PI, leanInwardDir * 0.08, 0.95, hScale, 0.95)
    );
    if (withLimeBase) {
      chunk.limeBase.push(makeMat(tx, 0.72, z, 0, 0, 0, 1, 1, 1));
    }

    chunk.branch.push(
      makeMat(
        tx + leanInwardDir * 0.65,
        trunkH + 0.45,
        z - 0.35,
        0.22,
        0,
        -leanInwardDir * 0.52,
        1,
        hScale * 0.85,
        1
      )
    );
    chunk.branch.push(
      makeMat(
        tx - leanInwardDir * 0.45,
        trunkH + 0.35,
        z + 0.45,
        -0.25,
        0,
        leanInwardDir * 0.48,
        1,
        hScale * 0.8,
        1
      )
    );

    const pickColor = () => {
      if (isAutumnStyle) return rand() > 0.38 ? autumnCol : sunlitCol;
      const r = rand();
      return r > 0.62 ? sunlitCol : r > 0.25 ? greenCol : deepGreenCol;
    };

    const crownY = trunkH + 1.65 * hScale;
    const crownX = tx + leanInwardDir * 0.95;
    const puffs: Array<[number, number, number, number, number, number]> = [
      [0, 0.3, 0, 2.7, 1.65, 2.7],
      [leanInwardDir * 1.35, -0.1, -0.95, 2.25, 1.35, 2.15],
      [-leanInwardDir * 1.05, 0.15, 1.05, 2.1, 1.4, 2.2],
      [leanInwardDir * 0.35, 1.05, 0.25, 1.95, 1.25, 1.95]
    ];
    for (const [ox, oy, oz, sx, sy, sz] of puffs) {
      chunk.canopy.push(
        makeMat(
          crownX + ox,
          crownY + oy,
          z + oz,
          rand() * 0.4,
          rand() * Math.PI * 2,
          rand() * 0.4,
          sx * hScale,
          sy * hScale,
          sz * hScale
        )
      );
      chunk.canopyColor.push(pickColor());
    }

    // Lush overarching green canopy tunnel across the 4-lane boulevard (FR-13)
    if (withCanopyArch) {
      chunk.branch.push(
        makeMat(
          tx + leanInwardDir * 2.2,
          trunkH + 1.55,
          z,
          0,
          0,
          -leanInwardDir * 0.98,
          0.95,
          hScale * 1.25,
          0.95
        )
      );
      const archX = THREE.MathUtils.lerp(tx, cxCenter, 0.62);
      const archPuffs: Array<[number, number, number, number, number, number]> = [
        [archX, 9.2 + rand() * 0.8, z, 3.6, 1.75, 3.8],
        [cxCenter + leanInwardDir * 1.1, 9.8 + rand() * 0.8, z - 2.2, 3.8, 1.7, 3.6],
        [cxCenter - leanInwardDir * 0.8, 10.1 + rand() * 0.7, z + 2.2, 3.5, 1.6, 3.5]
      ];
      for (const [ax, ay, az, sx, sy, sz] of archPuffs) {
        chunk.canopy.push(
          makeMat(ax, ay, az, rand() * 0.25, rand() * Math.PI * 2, rand() * 0.25, sx, sy, sz)
        );
        chunk.canopyColor.push(pickColor());
      }
    }
  };

  // ============================================================================
  // DETERMINISTIC PER-CHUNK SCENERY GENERATOR (CACHED WINDOW)
  // ============================================================================
  const chunkCache = new Map<number, SceneryChunkData>();

  const generateChunkData = (chunkIdx: number): SceneryChunkData => {
    const cached = chunkCache.get(chunkIdx);
    if (cached) return cached;

    const data = createEmptyChunkData();
    const d0 = chunkIdx * SCENERY_CHUNK_LEN;
    const d1 = d0 + SCENERY_CHUNK_LEN;
    if (d1 <= 10 || d0 >= stage.length - 8) {
      chunkCache.set(chunkIdx, data);
      return data;
    }

    const rand = createPrng(stageId * 9173 + chunkIdx * 7919 + 42);

    if (stage.theme === 'old_quarter') {
      const step = 11.0;
      const firstIdx = Math.max(2, Math.ceil(d0 / step));
      const lastIdx = Math.min(Math.floor((stage.length - 15) / step), Math.floor((d1 - 0.01) / step));

      for (let seq = firstIdx; seq <= lastIdx; seq++) {
        const d = seq * step;
        if (stageId === 8 && d > 632 && d < 668) continue;
        if (isNearIntersection(d, 10.5)) continue;

        const cx = getRoadCenterX(stageId, d);
        const z = distanceToWorldZ(d);
        const yaw = getRoadTangentYaw(stageId, d);

        for (const side of [-1, 1] as const) {
          const frontage = 4.6 + rand() * 2.8;
          const h = 7.4 + rand() * 8.2;
          const depth = 8.0 + rand() * 2.2;
          const setback = (rand() - 0.5) * 1.1;
          const xOff = cx + side * (roadHalfW + 4.4 + depth * 0.5 + setback);
          const faceOffset = -side * (depth * 0.5 + 0.06);
          const variant = ((seq * 2 + (side > 0 ? 1 : 0)) % 3) as 0 | 1 | 2;

          data.house[variant].push(makeMat(xOff, h * 0.5, z, 0, yaw, 0, depth, h, frontage));
          data.roof.push(
            makeMat(xOff, h + 0.72, z, 0, yaw, side * 0.08, depth + 0.65, 1.45, frontage + 0.45)
          );

          if (rand() > 0.62) {
            data.waterTank.push(
              makeMat(xOff + side * 1.1, h + 2.05, z + (rand() - 0.5) * 1.2, 0, 0, Math.PI / 2, 0.72, 1.65, 0.72)
            );
          }

          data.awning.push(
            makeMat(xOff + faceOffset - side * 0.9, 3.15, z, 0, yaw, side * 0.28, 2.0, 0.14, frontage * 0.92)
          );
          data.balcony.push(
            makeMat(xOff + faceOffset - side * 0.45, 4.25, z, 0, yaw, 0, 0.9, 0.35, frontage * 0.8)
          );

          if (rand() > 0.14) {
            const signIdx = (seq * 3 + (side > 0 ? 4 : 0)) % 8;
            data.signs[signIdx].push(
              makeMat(
                xOff + faceOffset - side * 0.96,
                4.55,
                z,
                0,
                yaw,
                0,
                0.12,
                0.94,
                Math.min(5.2, frontage * 0.72)
              )
            );
          }

          const curbWalkX = cx + side * (roadHalfW + 2.55);
          if (rand() > 0.35) {
            data.stool.push(makeMat(curbWalkX, 0.34, z - 0.9, 0, 0, 0, 0.42, 0.34, 0.42));
            data.stool.push(makeMat(curbWalkX - side * 0.55, 0.34, z - 0.5, 0, 0, 0, 0.42, 0.34, 0.42));
          }
          if (rand() > 0.4) {
            data.pot.push(makeMat(curbWalkX + side * 0.55, 0.42, z + 1.4, 0, 0, 0, 0.5, 0.55, 0.5));
            data.potFlower.push(
              makeMat(curbWalkX + side * 0.55, 0.85, z + 1.4, 0, 0, 0, 0.65, 0.55, 0.65)
            );
          }

          if (seq % 2 === 0) {
            const poleX = cx + side * (roadHalfW + 1.05);
            data.pole.push(makeMat(poleX, 3.8, z, 0, 0, 0, 1, 1, 1));
            if (rand() > 0.3) {
              data.flags.push({
                x: poleX - side * 0.5,
                y: 4.5,
                z,
                baseYaw: yaw + (side > 0 ? 0.3 : -0.3),
                scaleX: 1.0,
                scaleY: 0.7,
                scaleZ: 1,
                phase: d * 0.17
              });
            }
          } else if (rand() > 0.36) {
            const tx = cx + side * (roadHalfW + 2.05);
            pushTreeIntoChunk(data, rand, tx, z, 0.88 + rand() * 0.22, true, -side, false);
          }
        }

        if (d < stage.length - 58 && seq % 3 === 0) {
          const lx = cx - (roadHalfW + 1.05);
          const rx = cx + (roadHalfW + 1.05);
          for (let wIdx = 0; wIdx < 2; wIdx++) {
            const hStart = 7.6 + wIdx * 0.35;
            const sag = 0.55 + wIdx * 0.25;
            const zShift = z + wIdx * 0.6;
            const segs = 6;
            for (let s = 0; s < segs; s++) {
              const t0 = s / segs;
              const t1 = (s + 1) / segs;
              data.wires.push(
                THREE.MathUtils.lerp(lx, rx, t0),
                hStart - Math.sin(t0 * Math.PI) * sag,
                zShift,
                THREE.MathUtils.lerp(lx, rx, t1),
                hStart - Math.sin(t1 * Math.PI) * sag,
                zShift
              );
            }
          }
        }
      }

      // Seal flanks of Ô Quan Chưởng on Stage 8 (Hoàn Kiếm)
      if (stageId === 8 && d0 <= 670 && d1 >= 630) {
        for (const dFlank of [634, 645, 656, 667]) {
          if (dFlank < d0 || dFlank >= d1) continue;
          const cxF = getRoadCenterX(stageId, dFlank);
          const zF = distanceToWorldZ(dFlank);
          const yawF = getRoadTangentYaw(stageId, dFlank);
          for (const side of [-1, 1] as const) {
            for (const [ringDist, ringH, ringW] of [
              [roadHalfW + 19.5, 9.8 + rand() * 3.2, 13.0],
              [roadHalfW + 33.0, 11.5 + rand() * 3.8, 14.5]
            ] as const) {
              const v = Math.floor(rand() * 3) as 0 | 1 | 2;
              const xf = cxF + side * ringDist;
              data.house[v].push(makeMat(xf, ringH * 0.5, zF, 0, yawF, 0, ringW, ringH, 12.0));
              data.roof.push(
                makeMat(xf, ringH + 0.72, zF, 0, yawF, side * 0.06, ringW + 0.6, 1.45, 12.2)
              );
            }
            pushTreeIntoChunk(data, rand, cxF + side * (roadHalfW + 12.8), zF, 1.08, true, -side, false);
          }
        }
      }
    } else if (stage.theme === 'tree_boulevard') {
      const step = 8.5;
      const firstIdx = Math.max(2, Math.ceil(d0 / step));
      const lastIdx = Math.min(Math.floor((stage.length - 16) / step), Math.floor((d1 - 0.01) / step));

      for (let seq = firstIdx; seq <= lastIdx; seq++) {
        const d = seq * step;
        const nearIx = isNearIntersection(d, 10.0);
        const cx = getRoadCenterX(stageId, d);
        const z = distanceToWorldZ(d);
        const yaw = getRoadTangentYaw(stageId, d);

        if (!nearIx) {
          for (const side of [-1, 1] as const) {
            const tx = cx + side * (roadHalfW + 1.9);
            const hScale = 1.2 + rand() * 0.34;
            // Full overarching green tree canopy tunnel across the 4-lane avenue (FR-13)
            pushTreeIntoChunk(data, rand, tx, z, hScale, true, -side, false, true, cx);

            if (seq % 2 === 0) {
              const vx = cx + side * (roadHalfW + 12.4);
              const vh = 8.6 + rand() * 3.4;
              const vIdx = ((seq / 2) % 2 === 0 ? 0 : 1) as 0 | 1;
              data.villa[vIdx].push(makeMat(vx, vh * 0.5, z, 0, yaw, 0, 10.5, vh, 13.5));
              data.villaRoof.push(
                makeMat(vx, vh + 0.85, z, 0, yaw, side * 0.08, 11.2, 1.7, 14.0)
              );
            }

            if (seq % 3 === 0) {
              const lx = cx + side * (roadHalfW + 0.95);
              data.pole.push(makeMat(lx, 3.6, z, 0, 0, 0, 0.9, 1.0, 0.9));
              data.lampHead.push(makeMat(lx - side * 0.35, 6.9, z, 0, 0, 0, 1, 1, 1));
              data.banner.push(makeMat(lx - side * 0.65, 5.0, z, 0, yaw, 0, 1.1, 1.1, 1.1));
              if (seq % 6 === 0) {
                data.flags.push({
                  x: lx - side * 0.55,
                  y: 3.9,
                  z: z + 0.3,
                  baseYaw: yaw + (side > 0 ? 0.25 : -0.25),
                  scaleX: 1.15,
                  scaleY: 0.78,
                  scaleZ: 1,
                  phase: d * 0.13
                });
              }
            }
          }
        }

        if (seq % 4 === 0) {
          data.sunbeam.push(makeMat(cx - 1.8, 5.4, z, 0.22, 0.15, -0.48, 4.4, 14.0, 1.0));
        }
      }
    }

    // Frame perpendicular +-X cross-streets at any IntersectionZone inside this chunk (FR-02 polish)
    if (stage.theme === 'old_quarter' || stage.theme === 'tree_boulevard') {
      for (const ix of routeFeatures.intersections) {
        if (ix.distance < d0 || ix.distance >= d1) continue;
        const cx = getRoadCenterX(stageId, ix.distance);
        const cz = distanceToWorldZ(ix.distance);
        const yaw = getRoadTangentYaw(stageId, ix.distance);
        const cosY = Math.cos(yaw);
        const sinY = Math.sin(yaw);

        const toWorld = (lx: number, lz: number): [number, number] => [
          cx + lx * cosY + lz * sinY,
          cz - lx * sinY + lz * cosY
        ];

        for (const sideX of [-1, 1] as const) {
          for (const sideZ of [-1, 1] as const) {
            for (let k = 0; k < 4; k++) {
              const lx = sideX * (roadHalfW + 10.5 + k * 12.0);
              const depth = 9.0 + rand() * 2.5;
              const frontage = 9.5 + rand() * 2.2;
              const lz = sideZ * (11.6 + depth * 0.5);
              const [wx, wz] = toWorld(lx, lz);
              const rotY = yaw + Math.PI * 0.5;

              if (stage.theme === 'old_quarter') {
                const h = 8.2 + rand() * 6.5;
                const v = (k + (sideX > 0 ? 1 : 0)) % 3 as 0 | 1 | 2;
                data.house[v].push(makeMat(wx, h * 0.5, wz, 0, rotY, 0, depth, h, frontage));
                data.roof.push(
                  makeMat(wx, h + 0.72, wz, 0, rotY, sideZ * 0.06, depth + 0.5, 1.45, frontage + 0.4)
                );
              } else {
                const h = 9.0 + rand() * 3.8;
                const v = (k + (sideZ > 0 ? 1 : 0)) % 2 as 0 | 1;
                data.villa[v].push(makeMat(wx, h * 0.5, wz, 0, rotY, 0, depth, h, frontage));
                data.villaRoof.push(
                  makeMat(wx, h + 0.85, wz, 0, rotY, sideZ * 0.06, depth + 0.6, 1.7, frontage + 0.4)
                );
              }
            }

            // Cross-street sidewalk trees framing the +/-X view
            for (let t = 0; t < 3; t++) {
              const txLocal = sideX * (roadHalfW + 8.5 + t * 16.0);
              const tzLocal = sideZ * 9.3;
              const [tx, tz] = toWorld(txLocal, tzLocal);
              pushTreeIntoChunk(data, rand, tx, tz, 0.98 + rand() * 0.2, true, -sideZ, false);
            }
          }
        }
      }
    }

    if (stage.theme === 'overpass_avenue') {
      // Chapter 1: overpass_avenue (Stages 1..3 — 6 lanes)
      const step = 4.5;
      const firstIdx = Math.max(3, Math.ceil(d0 / step));
      const lastIdx = Math.min(Math.floor((stage.length - 12) / step), Math.floor((d1 - 0.01) / step));

      for (let seq = firstIdx; seq <= lastIdx; seq++) {
        const d = seq * step;
        const cx = getRoadCenterX(stageId, d);
        const z = distanceToWorldZ(d);
        const yaw = getRoadTangentYaw(stageId, d);
        const roadY = getRoadElevationY(stageId, d);

        for (const side of [-1, 1] as const) {
          const mx = cx + side * (roadHalfW + 1.85);
          data.shrub.push(makeMat(mx, 0.52, z, 0, rand() * 3, 0, 1.38, 0.86, 1.38));
          data.blossom.push(
            makeMat(
              mx + (rand() - 0.5) * 0.45,
              0.86 + rand() * 0.25,
              z + (rand() - 0.5) * 0.45,
              0,
              rand() * 3,
              0,
              1.2,
              0.78,
              1.2
            )
          );
          data.blossomColor.push(rand() > 0.45 ? pinkCol : magentaCol);

          if (roadY > 0.2) {
            const px = cx + side * (roadHalfW + 0.54);
            data.shrub.push(makeMat(px, roadY + 0.7, z, 0, rand() * 3, 0, 0.85, 0.56, 1.35));
            for (const dz of [-1.05, 1.05]) {
              data.blossom.push(
                makeMat(
                  px + (rand() - 0.5) * 0.22,
                  roadY + 0.94 + rand() * 0.18,
                  z + dz + (rand() - 0.5) * 0.35,
                  0,
                  rand() * 3,
                  0,
                  0.84 + rand() * 0.22,
                  0.55 + rand() * 0.16,
                  1.12 + rand() * 0.25
                )
              );
              data.blossomColor.push(rand() > 0.42 ? pinkCol : magentaCol);
            }
          }
        }

        if (seq % 4 === 0) {
          for (const side of [-1, 1] as const) {
            pushTreeIntoChunk(
              data,
              rand,
              cx + side * (roadHalfW + 11.4),
              z,
              0.92 + rand() * 0.25,
              false,
              -side,
              true
            );
          }
        }

        if (seq % 5 === 0) {
          for (const side of [-1, 1] as const) {
            const px = cx + side * (roadHalfW + 0.72);
            data.pole.push(makeMat(px, roadY + 3.4, z, 0, 0, 0, 0.78, 0.95, 0.78));
            data.lampHead.push(makeMat(px - side * 0.5, roadY + 6.9, z, 0, 0, 0, 1.2, 0.8, 1.2));
          }
        }

        if (seq % 3 === 0) {
          for (const side of [-1, 1] as const) {
            const bx = cx + side * (roadHalfW + 25.0);
            const bh = 11.5 + rand() * 7.0;
            const mVariant = ((seq + (side > 0 ? 1 : 0)) % 2) as 0 | 1;
            data.midRise[mVariant].push(makeMat(bx, bh * 0.5, z, 0, yaw, 0, 12.5, bh, 14.2));
            data.towerCrown.push(makeMat(bx, bh + 0.65, z, 0, yaw, 0, 11.4, 1.3, 13.0));
          }
        }

        if (seq % 6 === 0) {
          for (const side of [-1, 1] as const) {
            const bx = cx + side * (roadHalfW + 39 + rand() * 14);
            const bh = 24 + rand() * 24;
            const bw = 13 + rand() * 6;
            const variant = Math.floor(rand() * 3) as 0 | 1 | 2;
            data.tower[variant].push(makeMat(bx, bh * 0.5, z, 0, yaw, 0, bw, bh, 16));
            const crownH = 3.2 + rand() * 3.4;
            data.towerCrown.push(
              makeMat(bx, bh + crownH * 0.5, z, 0, yaw, 0, bw * 0.66, crownH, 10.5)
            );
          }
        }

        if (seq % 8 === 0) {
          for (const side of [-1, 1] as const) {
            const bx = cx + side * (roadHalfW + 64 + rand() * 14);
            const bh = 28 + rand() * 24;
            const variant = Math.floor(rand() * 3) as 0 | 1 | 2;
            data.tower[variant].push(makeMat(bx, bh * 0.5, z, 0, 0, 0, 19, bh, 22));
          }
        }

        // Overpass concrete piers on Stage 1-3 (d = 840..1246m)
        if (stageId === 3 && seq % 6 === 0 && d >= 840 && d <= 1246) {
          const yDeck = getRoadElevationY(stageId, d);
          if (yDeck >= 2.2) {
            const pierH = yDeck - 0.85;
            for (const pxOff of [-6.8, 0, 6.8]) {
              data.pier.push(makeMat(cx + pxOff, pierH * 0.5, z, 0, 0, 0, 1, pierH, 1));
            }
            data.pierCap.push(makeMat(cx, pierH - 0.35, z, 0, 0, 0, roadWidth + 0.8, 0.85, 1.9));
          }
        }
      }
    }

    chunkCache.set(chunkIdx, data);
    if (chunkCache.size > 18) {
      const firstKey = chunkCache.keys().next().value;
      if (firstKey !== undefined) chunkCache.delete(firstKey);
    }
    return data;
  };

  // ============================================================================
  // BOUNDED STREAMING INSTANCED MESHES (MAX ~480M WINDOW)
  // ============================================================================
  const trunkMesh = createStreamingInstancedMesh(
    new THREE.CylinderGeometry(0.24, 0.42, 5.2, 8),
    new THREE.MeshStandardMaterial({ map: barkTex, roughness: 0.92 }),
    260,
    false,
    true,
    true,
    track
  );
  const branchMesh = createStreamingInstancedMesh(
    new THREE.CylinderGeometry(0.11, 0.2, 2.5, 6),
    new THREE.MeshStandardMaterial({ map: barkTex, roughness: 0.92 }),
    680,
    false,
    true,
    true,
    track
  );
  const limeMesh = createStreamingInstancedMesh(
    new THREE.CylinderGeometry(0.4, 0.46, 1.45, 8),
    new THREE.MeshStandardMaterial({ color: HANOI_PALETTE.treeLimeBase, roughness: 0.9 }),
    260,
    false,
    false,
    true,
    track
  );
  const canopyMesh = createStreamingInstancedMesh(
    new THREE.IcosahedronGeometry(1.0, 1),
    new THREE.MeshStandardMaterial({ map: foliageTex, color: 0xffffff, roughness: 0.85 }),
    1800,
    true,
    true,
    true,
    track
  );
  const poleMesh = createStreamingInstancedMesh(
    new THREE.CylinderGeometry(0.08, 0.11, 7.2, 8),
    new THREE.MeshStandardMaterial({
      color: HANOI_PALETTE.shutterTealDark,
      roughness: 0.55,
      metalness: 0.35
    }),
    160,
    false,
    false,
    false,
    track
  );
  const lampMesh = createStreamingInstancedMesh(
    new THREE.SphereGeometry(0.24, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xfff0c2 }),
    160,
    false,
    false,
    false,
    track
  );

  const flagInst = createStreamingInstancedMesh(
    new THREE.PlaneGeometry(1.4, 0.95),
    new THREE.MeshBasicMaterial({ map: flagTex, side: THREE.DoubleSide }),
    120,
    false,
    false,
    false,
    track
  );

  group.add(trunkMesh, branchMesh, limeMesh, canopyMesh, poleMesh, lampMesh, flagInst);

  // Theme-specific streaming batches
  let houseMeshes: [THREE.InstancedMesh, THREE.InstancedMesh, THREE.InstancedMesh] | null = null;
  let roofMesh: THREE.InstancedMesh | null = null;
  let waterTankMesh: THREE.InstancedMesh | null = null;
  let awningMesh: THREE.InstancedMesh | null = null;
  let balconyMesh: THREE.InstancedMesh | null = null;
  let signMeshes: THREE.InstancedMesh[] = [];
  let stoolMesh: THREE.InstancedMesh | null = null;
  let potMesh: THREE.InstancedMesh | null = null;
  let potFlowerMesh: THREE.InstancedMesh | null = null;
  let wireGeo: THREE.BufferGeometry | null = null;
  let wireLines: THREE.LineSegments | null = null;
  const MAX_WIRE_VERTS = 1200;

  let villaMeshes: [THREE.InstancedMesh, THREE.InstancedMesh] | null = null;
  let villaRoofMesh: THREE.InstancedMesh | null = null;
  let bannerMesh: THREE.InstancedMesh | null = null;
  let sunbeamMesh: THREE.InstancedMesh | null = null;

  let shrubMesh: THREE.InstancedMesh | null = null;
  let blossomMesh: THREE.InstancedMesh | null = null;
  let pierMesh: THREE.InstancedMesh | null = null;
  let pierCapMesh: THREE.InstancedMesh | null = null;
  let midRiseMeshes: [THREE.InstancedMesh, THREE.InstancedMesh] | null = null;
  let towerMeshes: [THREE.InstancedMesh, THREE.InstancedMesh, THREE.InstancedMesh] | null = null;
  let towerCrownMesh: THREE.InstancedMesh | null = null;

  if (stage.theme === 'old_quarter') {
    houseMeshes = ([0, 1, 2] as const).map((v) => {
      const fTex = track(createOldQuarterFacadeTexture(v));
      const m = createStreamingInstancedMesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshStandardMaterial({ map: fTex, roughness: 0.82 }),
        104,
        false,
        true,
        true,
        track
      );
      group.add(m);
      return m;
    }) as [THREE.InstancedMesh, THREE.InstancedMesh, THREE.InstancedMesh];

    roofMesh = createStreamingInstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ map: roofTex, roughness: 0.78 }),
      170,
      false,
      true,
      true,
      track
    );
    waterTankMesh = createStreamingInstancedMesh(
      new THREE.CylinderGeometry(0.5, 0.5, 1, 10),
      new THREE.MeshStandardMaterial({
        color: 0xd8dee4,
        metalness: 0.88,
        roughness: 0.22,
        envMapIntensity: 1.5
      }),
      60,
      false,
      true,
      true,
      track
    );
    awningMesh = createStreamingInstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: HANOI_PALETTE.shutterTealDark, roughness: 0.68 }),
      120,
      false,
      true,
      true,
      track
    );
    balconyMesh = createStreamingInstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({
        color: HANOI_PALETTE.ironBalcony,
        roughness: 0.5,
        metalness: 0.45
      }),
      120,
      false,
      false,
      true,
      track
    );
    group.add(roofMesh, waterTankMesh, awningMesh, balconyMesh);

    const signSpecs: Array<[string, string, string, string]> = [
      ['PHỞ GIA TRUYỀN · BÚN BÒ', 'HƯƠNG VỊ HÀ THÀNH · MỞ CỬA', '#7b241c', '#f6d167'],
      ['CÀ PHÊ TRỨNG · TRÀ ĐÁ', 'NGÕ NHỎ PHỐ CỔ · THƯ GIÃN', '#0f5c5f', '#f6eedc'],
      ['BÚN CHẢ HÀNG QUẠT', 'NƯỚNG THAN HOA · TRUYỀN THỐNG', '#4e342e', '#f3c668'],
      ['TẠP HÓA PHỐ CỔ · 24H', 'BÁNH KẸO · NƯỚC MÁT · SIM THẺ', '#1d4e6b', '#f6eedc'],
      ['SỬA XE MÁY · VÁ LỐP', 'BẢO DƯỠNG NHANH · UY TÍN', '#3b4248', '#f59f00'],
      ['BÁNH MÌ CHẢO · PA-TÊ', 'NÓNG GIÒN MỖI SÁNG', '#8c3b19', '#ffe8a8'],
      ['CẮT TÓC NAM · CỔ ĐIỂN', 'GỘI ĐẦU · RÁY TAI · THƯ GIÃN', '#22382e', '#e3a837'],
      ["L'ÉTAGE CAFÉ · MỸ NGHỆ", 'PHỐ CỔ HÀ NỘI · GÓC NHÌN CỔ', '#5b3a22', '#e3a837']
    ];
    signMeshes = signSpecs.map(([title, sub, bg, border]) => {
      const sTex = track(createBannerTexture(title, sub, bg, border, '#f6eedc', 1024, 224));
      const sm = createStreamingInstancedMesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshStandardMaterial({
          map: sTex,
          emissiveMap: sTex,
          emissive: new THREE.Color(0x6b4b1e),
          emissiveIntensity: 0.65,
          roughness: 0.55
        }),
        32,
        false,
        false,
        true,
        track
      );
      group.add(sm);
      return sm;
    });

    stoolMesh = createStreamingInstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0x1b6ca8, roughness: 0.55 }),
      140,
      false,
      false,
      true,
      track
    );
    potMesh = createStreamingInstancedMesh(
      new THREE.CylinderGeometry(0.45, 0.35, 1, 8),
      new THREE.MeshStandardMaterial({ color: HANOI_PALETTE.terracottaRoof, roughness: 0.85 }),
      100,
      false,
      false,
      true,
      track
    );
    potFlowerMesh = createStreamingInstancedMesh(
      new THREE.DodecahedronGeometry(0.65, 0),
      new THREE.MeshStandardMaterial({ color: HANOI_PALETTE.foliageGreen, roughness: 0.82 }),
      100,
      false,
      false,
      true,
      track
    );
    group.add(stoolMesh, potMesh, potFlowerMesh);

    wireGeo = track(new THREE.BufferGeometry());
    wireGeo.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(new Float32Array(MAX_WIRE_VERTS * 3), 3)
    );
    wireGeo.setDrawRange(0, 0);
    const wireMat = track(
      new THREE.LineBasicMaterial({ color: 0x1e1d1c, transparent: true, opacity: 0.82 })
    );
    wireLines = new THREE.LineSegments(wireGeo, wireMat);
    wireLines.frustumCulled = false;
    group.add(wireLines);
  } else if (stage.theme === 'tree_boulevard') {
    villaMeshes = ([0, 1] as const).map((v) => {
      const m = createStreamingInstancedMesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshStandardMaterial({ map: v === 0 ? colonialTex0 : colonialTex1, roughness: 0.8 }),
        104,
        false,
        true,
        true,
        track
      );
      group.add(m);
      return m;
    }) as [THREE.InstancedMesh, THREE.InstancedMesh];

    villaRoofMesh = createStreamingInstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ map: roofTex, roughness: 0.78 }),
      150,
      false,
      true,
      true,
      track
    );
    const kvcTex = track(createKhueVanCacBannerTexture());
    bannerMesh = createStreamingInstancedMesh(
      new THREE.CircleGeometry(0.62, 18),
      new THREE.MeshBasicMaterial({
        map: kvcTex,
        transparent: true,
        alphaTest: 0.2,
        side: THREE.DoubleSide
      }),
      80,
      false,
      false,
      false,
      track
    );
    const sunbeamTex = track(createSoftSunbeamTexture());
    sunbeamMesh = createStreamingInstancedMesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: sunbeamTex,
        color: HANOI_PALETTE.sunbeamWarm,
        transparent: true,
        opacity: 0.32,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide
      }),
      40,
      false,
      false,
      false,
      track
    );
    group.add(villaRoofMesh, bannerMesh, sunbeamMesh);
  } else {
    shrubMesh = createStreamingInstancedMesh(
      new THREE.IcosahedronGeometry(0.62, 1),
      new THREE.MeshStandardMaterial({
        map: foliageTex,
        color: HANOI_PALETTE.bougainvilleaLeaf,
        roughness: 0.9
      }),
      460,
      false,
      true,
      true,
      track
    );
    blossomMesh = createStreamingInstancedMesh(
      new THREE.IcosahedronGeometry(0.54, 1),
      new THREE.MeshStandardMaterial({
        map: foliageTex,
        color: 0xffffff,
        emissive: 0x3a0f24,
        emissiveIntensity: 0.22,
        roughness: 0.72
      }),
      760,
      true,
      false,
      false,
      track
    );
    pierMesh = createStreamingInstancedMesh(
      new THREE.CylinderGeometry(0.72, 0.82, 1, 12),
      new THREE.MeshStandardMaterial({ color: HANOI_PALETTE.overpassConcrete, roughness: 0.85 }),
      48,
      false,
      true,
      true,
      track
    );
    pierCapMesh = createStreamingInstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0xa69e90, roughness: 0.85 }),
      20,
      false,
      true,
      true,
      track
    );
    group.add(shrubMesh, blossomMesh, pierMesh, pierCapMesh);

    const modernTextures = ([0, 1, 2] as const).map((v) => track(createModernTowerTexture(v)));
    midRiseMeshes = ([0, 1] as const).map((mIdx) => {
      const m = createStreamingInstancedMesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshStandardMaterial({ map: modernTextures[mIdx + 1], roughness: 0.72 }),
        60,
        false,
        false,
        true,
        track
      );
      group.add(m);
      return m;
    }) as [THREE.InstancedMesh, THREE.InstancedMesh];

    towerMeshes = ([0, 1, 2] as const).map((v) => {
      const m = createStreamingInstancedMesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshStandardMaterial({ map: modernTextures[v], roughness: 0.65 }),
        60,
        false,
        false,
        true,
        track
      );
      group.add(m);
      return m;
    }) as [THREE.InstancedMesh, THREE.InstancedMesh, THREE.InstancedMesh];

    towerCrownMesh = createStreamingInstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0xc9c2b6, roughness: 0.74 }),
      140,
      false,
      false,
      true,
      track
    );
    group.add(towerCrownMesh);
  }

  // ============================================================================
  // START (A), Ô QUAN CHƯỞNG (STAGE 8), & FINISH (B) + HERO DESTINATION LANDMARK
  // ============================================================================
  const archColors: Record<1 | 2 | 3, { bg: string; border: string; pillar: number }> = {
    1: { bg: '#155b94', border: '#ffcd00', pillar: HANOI_PALETTE.overpassConcrete },
    2: { bg: '#0f6b70', border: '#f6eedc', pillar: HANOI_PALETTE.shutterTealDark },
    3: { bg: '#5b3a22', border: '#e3a837', pillar: HANOI_PALETTE.oldQuarterYellow }
  };
  const ac = archColors[stage.chapter];

  const startArch = createGateArch(
    roadWidth,
    stage.fromLabel.toUpperCase(),
    `CHẶNG ${stage.codeLabel} · ${stage.shortName.toUpperCase()} · ${stage.laneCount} LÀN (${(stage.length / 1000).toFixed(0)} KM)`,
    ac.bg,
    ac.border,
    ac.pillar,
    track
  );
  startArch.position.set(
    getRoadCenterX(stageId, 16),
    getRoadElevationY(stageId, 16),
    distanceToWorldZ(16)
  );
  startArch.rotation.y = getRoadTangentYaw(stageId, 16);
  group.add(startArch);

  let oqcGate: THREE.Group | null = null;
  if (stageId === 8) {
    oqcGate = buildOQuanChuongGate(roadWidth, stoneTex, roofTex, flagTex, track);
    oqcGate.position.set(getRoadCenterX(stageId, 650), 0, distanceToWorldZ(650));
    oqcGate.rotation.y = getRoadTangentYaw(stageId, 650);
    oqcGate.visible = false;
    group.add(oqcGate);
  }

  const finishHologram = createFinishHologram(
    roadWidth,
    `ĐÍCH ĐẾN · CHẶNG ${stage.codeLabel} · ${(stage.length / 1000).toFixed(0)} KM`,
    stage.toLabel.toUpperCase(),
    `HOÀN THÀNH CHẶNG ${stage.codeLabel} · ${stage.shortName.toUpperCase()}`,
    '#ffcd00',
    track
  );
  finishHologram.group.position.set(
    getRoadCenterX(stageId, stage.length),
    getRoadElevationY(stageId, stage.length),
    distanceToWorldZ(stage.length)
  );
  finishHologram.group.rotation.y = getRoadTangentYaw(stageId, stage.length);
  finishHologram.group.visible = false;
  group.add(finishHologram.group);

  const heroGroup = new THREE.Group();
  const heroLandmark = buildDestinationLandmark(
    stage.destinationKey,
    {
      colonialTex0,
      colonialTex1,
      roofTex,
      shaftTex,
      stoneTex,
      operaFacadeTex,
      flagTex
    },
    track
  );
  heroLandmark.position.set(
    getRoadCenterX(stageId, stage.length + 38),
    0,
    distanceToWorldZ(stage.length + 38)
  );
  heroLandmark.rotation.y = getRoadTangentYaw(stageId, stage.length) * 0.4;
  heroGroup.add(heroLandmark);

  // Horizon-sealing backdrop behind Finish Destination
  const cxEnd = getRoadCenterX(stageId, stage.length);
  const bgMat = track(
    new THREE.MeshStandardMaterial({
      map: stage.theme === 'overpass_avenue' ? track(createModernTowerTexture(0)) : colonialTex0,
      roughness: 0.85
    })
  );
  const bgGeo = track(new THREE.BoxGeometry(1, 1, 1));
  const bgMats: THREE.Matrix4[] = [];
  for (let i = -4; i <= 4; i++) {
    if (Math.abs(i) < 2) continue;
    const bh = stage.theme === 'overpass_avenue' ? 24 + (Math.abs(i) % 3) * 7 : 12 + (Math.abs(i) % 3) * 3;
    bgMats.push(
      makeMat(
        cxEnd + i * 21,
        bh * 0.5,
        distanceToWorldZ(stage.length + 58 + Math.abs(i) * 4),
        0,
        0,
        0,
        20,
        bh,
        14
      )
    );
  }
  let bgInst: THREE.InstancedMesh | null = null;
  if (bgMats.length > 0) {
    bgInst = new THREE.InstancedMesh(bgGeo, bgMat, bgMats.length);
    bgMats.forEach((m, idx) => bgInst!.setMatrixAt(idx, m));
    bgInst.instanceMatrix.needsUpdate = true;
    heroGroup.add(bgInst);
  }
  heroGroup.visible = false;
  group.add(heroGroup);

  let attachedHeroGlb: THREE.Group | null = null;
  let heroGlbLoaded = false;

  const setHeroGlb = (glb: THREE.Group, config: LandmarkGlbConfig): void => {
    if (attachedHeroGlb) {
      heroGroup.remove(attachedHeroGlb);
      disposeLandmarkObject(attachedHeroGlb);
      attachedHeroGlb = null;
    }
    heroLandmark.visible = false;
    if (bgInst) bgInst.visible = false;

    const targetDist = stage.length + config.offsetAhead;
    glb.position.set(
      getRoadCenterX(stageId, targetDist),
      getRoadElevationY(stageId, targetDist),
      distanceToWorldZ(targetDist)
    );
    glb.rotation.y = getRoadTangentYaw(stageId, stage.length) * 0.4 + config.yawOffset;
    heroGroup.add(glb);
    attachedHeroGlb = glb;
    heroGlbLoaded = true;
  };

  // ============================================================================
  // STREAMING UPDATE LOOP
  // ============================================================================
  const writeMatrices = (
    mesh: THREE.InstancedMesh | null,
    matrices: THREE.Matrix4[],
    colors?: THREE.Color[]
  ): void => {
    if (!mesh) return;
    const n = Math.min(matrices.length, mesh.instanceMatrix.count);
    for (let i = 0; i < n; i++) {
      mesh.setMatrixAt(i, matrices[i]);
      if (colors && colors[i] && mesh.instanceColor) {
        mesh.setColorAt(i, colors[i]);
      }
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    if (colors && mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  };

  let lastMinChunk = Number.NaN;
  let lastMaxChunk = Number.NaN;
  let activeSceneryChunks = 0;
  let visibleFlags: AnimatedFlagRecord[] = [];

  // Reusable flat scratch buffers to collect matrices across visible chunks
  const scratch = createEmptyChunkData();

  const clearScratch = (): void => {
    scratch.trunk.length = 0;
    scratch.branch.length = 0;
    scratch.limeBase.length = 0;
    scratch.canopy.length = 0;
    scratch.canopyColor.length = 0;
    scratch.pole.length = 0;
    scratch.lampHead.length = 0;
    scratch.flags.length = 0;
    scratch.house[0].length = 0;
    scratch.house[1].length = 0;
    scratch.house[2].length = 0;
    scratch.roof.length = 0;
    scratch.waterTank.length = 0;
    scratch.awning.length = 0;
    scratch.balcony.length = 0;
    for (const s of scratch.signs) s.length = 0;
    scratch.stool.length = 0;
    scratch.pot.length = 0;
    scratch.potFlower.length = 0;
    scratch.wires.length = 0;
    scratch.villa[0].length = 0;
    scratch.villa[1].length = 0;
    scratch.villaRoof.length = 0;
    scratch.banner.length = 0;
    scratch.sunbeam.length = 0;
    scratch.shrub.length = 0;
    scratch.blossom.length = 0;
    scratch.blossomColor.length = 0;
    scratch.pier.length = 0;
    scratch.pierCap.length = 0;
    scratch.midRise[0].length = 0;
    scratch.midRise[1].length = 0;
    scratch.tower[0].length = 0;
    scratch.tower[1].length = 0;
    scratch.tower[2].length = 0;
    scratch.towerCrown.length = 0;
  };

  const appendArr = <T>(dst: T[], src: T[]): void => {
    for (let i = 0; i < src.length; i++) dst.push(src[i]);
  };

  const update = (playerDistance: number, elapsedTime: number): void => {
    const safeDist = Math.max(0, playerDistance);
    const minDist = Math.max(0, safeDist - STREAM_BACK);
    const maxDist = Math.min(stage.length + 60, safeDist + STREAM_AHEAD);
    const minChunk = Math.floor(minDist / SCENERY_CHUNK_LEN);
    const maxChunk = Math.floor(maxDist / SCENERY_CHUNK_LEN);

    if (minChunk !== lastMinChunk || maxChunk !== lastMaxChunk) {
      lastMinChunk = minChunk;
      lastMaxChunk = maxChunk;
      clearScratch();
      activeSceneryChunks = 0;

      for (let c = minChunk; c <= maxChunk; c++) {
        const ch = generateChunkData(c);
        activeSceneryChunks += 1;
        appendArr(scratch.trunk, ch.trunk);
        appendArr(scratch.branch, ch.branch);
        appendArr(scratch.limeBase, ch.limeBase);
        appendArr(scratch.canopy, ch.canopy);
        appendArr(scratch.canopyColor, ch.canopyColor);
        appendArr(scratch.pole, ch.pole);
        appendArr(scratch.lampHead, ch.lampHead);
        appendArr(scratch.flags, ch.flags);

        if (stage.theme === 'old_quarter') {
          appendArr(scratch.house[0], ch.house[0]);
          appendArr(scratch.house[1], ch.house[1]);
          appendArr(scratch.house[2], ch.house[2]);
          appendArr(scratch.roof, ch.roof);
          appendArr(scratch.waterTank, ch.waterTank);
          appendArr(scratch.awning, ch.awning);
          appendArr(scratch.balcony, ch.balcony);
          for (let s = 0; s < 8; s++) appendArr(scratch.signs[s], ch.signs[s]);
          appendArr(scratch.stool, ch.stool);
          appendArr(scratch.pot, ch.pot);
          appendArr(scratch.potFlower, ch.potFlower);
          appendArr(scratch.wires, ch.wires);
        } else if (stage.theme === 'tree_boulevard') {
          appendArr(scratch.villa[0], ch.villa[0]);
          appendArr(scratch.villa[1], ch.villa[1]);
          appendArr(scratch.villaRoof, ch.villaRoof);
          appendArr(scratch.banner, ch.banner);
          appendArr(scratch.sunbeam, ch.sunbeam);
        } else {
          appendArr(scratch.shrub, ch.shrub);
          appendArr(scratch.blossom, ch.blossom);
          appendArr(scratch.blossomColor, ch.blossomColor);
          appendArr(scratch.pier, ch.pier);
          appendArr(scratch.pierCap, ch.pierCap);
          appendArr(scratch.midRise[0], ch.midRise[0]);
          appendArr(scratch.midRise[1], ch.midRise[1]);
          appendArr(scratch.tower[0], ch.tower[0]);
          appendArr(scratch.tower[1], ch.tower[1]);
          appendArr(scratch.tower[2], ch.tower[2]);
          appendArr(scratch.towerCrown, ch.towerCrown);
        }
      }

      writeMatrices(trunkMesh, scratch.trunk);
      writeMatrices(branchMesh, scratch.branch);
      writeMatrices(limeMesh, scratch.limeBase);
      writeMatrices(canopyMesh, scratch.canopy, scratch.canopyColor);
      writeMatrices(poleMesh, scratch.pole);
      writeMatrices(lampMesh, scratch.lampHead);
      visibleFlags = scratch.flags;

      if (stage.theme === 'old_quarter') {
        if (houseMeshes) {
          writeMatrices(houseMeshes[0], scratch.house[0]);
          writeMatrices(houseMeshes[1], scratch.house[1]);
          writeMatrices(houseMeshes[2], scratch.house[2]);
        }
        writeMatrices(roofMesh, scratch.roof);
        writeMatrices(waterTankMesh, scratch.waterTank);
        writeMatrices(awningMesh, scratch.awning);
        writeMatrices(balconyMesh, scratch.balcony);
        for (let s = 0; s < signMeshes.length; s++) {
          writeMatrices(signMeshes[s], scratch.signs[s]);
        }
        writeMatrices(stoolMesh, scratch.stool);
        writeMatrices(potMesh, scratch.pot);
        writeMatrices(potFlowerMesh, scratch.potFlower);
        if (wireGeo) {
          const posAttr = wireGeo.getAttribute('position') as THREE.BufferAttribute;
          const arr = posAttr.array as Float32Array;
          const numFloats = Math.min(scratch.wires.length, MAX_WIRE_VERTS * 3);
          for (let i = 0; i < numFloats; i++) {
            arr[i] = scratch.wires[i];
          }
          posAttr.needsUpdate = true;
          wireGeo.setDrawRange(0, Math.floor(numFloats / 3));
        }
      } else if (stage.theme === 'tree_boulevard') {
        if (villaMeshes) {
          writeMatrices(villaMeshes[0], scratch.villa[0]);
          writeMatrices(villaMeshes[1], scratch.villa[1]);
        }
        writeMatrices(villaRoofMesh, scratch.villaRoof);
        writeMatrices(bannerMesh, scratch.banner);
        writeMatrices(sunbeamMesh, scratch.sunbeam);
      } else {
        writeMatrices(shrubMesh, scratch.shrub);
        writeMatrices(blossomMesh, scratch.blossom, scratch.blossomColor);
        writeMatrices(pierMesh, scratch.pier);
        writeMatrices(pierCapMesh, scratch.pierCap);
        if (midRiseMeshes) {
          writeMatrices(midRiseMeshes[0], scratch.midRise[0]);
          writeMatrices(midRiseMeshes[1], scratch.midRise[1]);
        }
        if (towerMeshes) {
          writeMatrices(towerMeshes[0], scratch.tower[0]);
          writeMatrices(towerMeshes[1], scratch.tower[1]);
          writeMatrices(towerMeshes[2], scratch.tower[2]);
        }
        writeMatrices(towerCrownMesh, scratch.towerCrown);
      }
    }

    // Animate visible flags smoothly
    const flagCount = Math.min(visibleFlags.length, flagInst.instanceMatrix.count);
    for (let i = 0; i < flagCount; i++) {
      const f = visibleFlags[i];
      dummy.position.set(f.x, f.y, f.z);
      dummy.rotation.set(
        Math.sin(elapsedTime * 3.4 + f.phase) * 0.08,
        f.baseYaw + Math.sin(elapsedTime * 4.2 + f.phase) * 0.18,
        0
      );
      dummy.scale.set(f.scaleX, f.scaleY, f.scaleZ);
      dummy.updateMatrix();
      flagInst.setMatrixAt(i, dummy.matrix);
    }
    flagInst.count = flagCount;
    if (flagCount > 0) flagInst.instanceMatrix.needsUpdate = true;

    // Toggle Start / Ô Quan Chưởng / Finish hero visibility
    startArch.visible = safeDist <= 420;
    if (oqcGate) {
      oqcGate.visible = safeDist >= 260 && safeDist <= 760;
    }
    const nearFinish = safeDist >= stage.length - 460;
    finishHologram.group.visible = nearFinish;
    if (nearFinish) {
      finishHologram.textMesh.position.y =
        finishHologram.baseY + Math.sin(elapsedTime * 2.1) * 0.22;
      finishHologram.textMat.opacity = 0.78 + Math.sin(elapsedTime * 3.8) * 0.08;
    }
    heroGroup.visible = nearFinish;
  };

  update(0, 0);

  return {
    group,
    update,
    setHeroGlb,
    getStreamingStats: () => ({
      activeSceneryChunks,
      drawCallObjects: group.children.filter((c) => c.visible).length,
      heroGlbLoaded
    }),
    dispose: () => {
      if (attachedHeroGlb) {
        heroGroup.remove(attachedHeroGlb);
        disposeLandmarkObject(attachedHeroGlb);
        attachedHeroGlb = null;
      }
      for (const item of disposables) {
        item.dispose();
      }
    }
  };
}
