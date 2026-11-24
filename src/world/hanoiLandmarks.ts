import * as THREE from 'three';
import { HANOI_PALETTE } from '../config/artPalette.ts';
import { getStageSpec } from '../config/gameConfig.ts';
import {
  distanceToWorldZ,
  getRoadCenterX,
  getRoadElevationY,
  getRoadTangentYaw
} from '../core/roadMath.ts';
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

export interface AnimatedFlagInstance {
  mesh: THREE.InstancedMesh;
  index: number;
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
  dispose: () => void;
}

function createPrng(seedInit: number): () => number {
  let seed = seedInit >>> 0;
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function createFlagTexture(): THREE.CanvasTexture {
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
): THREE.CanvasTexture {
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
    ctx.font = `700 ${titleSize}px "Segoe UI", "Roboto", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(title, width / 2, height * 0.38, maxTextWidth);

    ctx.fillStyle = borderHex;
    ctx.font = `700 ${subSize}px "Segoe UI", "Roboto", system-ui, sans-serif`;
    ctx.fillText(subtitle, width / 2, height * 0.72, maxTextWidth);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function createKhueVanCacBannerTexture(): THREE.CanvasTexture {
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

function createClockFaceTexture(): THREE.CanvasTexture {
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
    ctx.font = 'bold 24px Georgia, serif';
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

/**
 * Builds Stage 1 Landmark: Ô Quan Chưởng historic arched gate with textured ancient stone,
 * curved semicircular voussoir arch ring, side pedestrian arches, and 2-tier roof watchtower.
 */
function buildOQuanChuongGate(
  roadWidth: number,
  stoneTex: THREE.CanvasTexture,
  roofTex: THREE.CanvasTexture,
  track: <T extends { dispose: () => void }>(res: T) => T
): THREE.Group {
  const roadHalfW = roadWidth * 0.5;
  const gate = new THREE.Group();
  gate.name = 'Landmark_OQuanChuong';

  const stoneMat = track(
    new THREE.MeshStandardMaterial({
      map: stoneTex,
      roughness: 0.9
    })
  );
  const darkArchMat = track(
    new THREE.MeshStandardMaterial({ color: 0x3b3126, roughness: 0.95 })
  );
  const roofMat = track(
    new THREE.MeshStandardMaterial({ map: roofTex, roughness: 0.78 })
  );

  // Massive outer gate piers flanking the narrow 7.4m carriageway
  const pierGeo = track(new THREE.BoxGeometry(2.6, 7.6, 3.6));
  for (const side of [-1, 1] as const) {
    const pier = new THREE.Mesh(pierGeo, stoneMat);
    pier.position.set(side * (roadHalfW + 1.7), 3.8, 0);
    pier.castShadow = true;
    pier.receiveShadow = true;
    gate.add(pier);

    // Side pedestrian bastion wings with arched passage openings
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

    // Extending ancient mossy stone curtain wall sealing left/right flanks into Old Quarter blocks
    const curtainWall = new THREE.Mesh(track(new THREE.BoxGeometry(10.5, 5.6, 2.5)), stoneMat);
    curtainWall.position.set(side * (roadHalfW + 12.2), 2.8, 0);
    curtainWall.castShadow = true;
    curtainWall.receiveShadow = true;
    gate.add(curtainWall);

    const wallCoping = new THREE.Mesh(track(new THREE.BoxGeometry(10.7, 0.35, 2.8)), roofMat);
    wallCoping.position.set(side * (roadHalfW + 12.2), 5.75, 0);
    gate.add(wallCoping);
  }

  // Semicircular Stone Vault Archway across the narrow carriageway (clear height >= 5.2m)
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

  // Upper masonry spandrel & cornice beam above the arch ring
  const lintelWidth = roadWidth + 7.2;
  const lintel = new THREE.Mesh(
    track(new THREE.BoxGeometry(lintelWidth, 1.65, 3.5)),
    stoneMat
  );
  lintel.position.set(0, 7.25, 0);
  lintel.castShadow = true;
  gate.add(lintel);

  // Perforated crenellated balustrade parapet across top
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

  // Upper Watchtower Pavilion (Vọng lâu) with genuine see-through sky archway & curved terracotta roofs
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

  const lowerRoof = new THREE.Mesh(
    track(new THREE.ConeGeometry(5.1, 1.45, 4)),
    roofMat
  );
  lowerRoof.rotation.y = Math.PI / 4;
  lowerRoof.scale.set(1.18, 1, 0.78);
  lowerRoof.position.set(0, 12.0, 0);
  gate.add(lowerRoof);

  const upperRoof = new THREE.Mesh(
    track(new THREE.ConeGeometry(3.4, 1.25, 4)),
    roofMat
  );
  upperRoof.rotation.y = Math.PI / 4;
  upperRoof.scale.set(1.15, 1, 0.78);
  upperRoof.position.set(0, 13.1, 0);
  gate.add(upperRoof);

  // Red flag with yellow star atop Ô Quan Chưởng watchtower (clear of top HUD bar)
  const oqcPole = new THREE.Mesh(
    track(new THREE.CylinderGeometry(0.055, 0.075, 1.6, 8)),
    track(new THREE.MeshStandardMaterial({ color: HANOI_PALETTE.clockTowerWhite, roughness: 0.5 }))
  );
  oqcPole.position.set(0, 13.35, 0.8);
  gate.add(oqcPole);

  const oqcFlagTex = track(createFlagTexture());
  const oqcFlag = new THREE.Mesh(
    track(new THREE.PlaneGeometry(1.9, 1.2)),
    track(new THREE.MeshBasicMaterial({ map: oqcFlagTex, side: THREE.DoubleSide }))
  );
  oqcFlag.position.set(0.95, 13.85, 0.8);
  gate.add(oqcFlag);

  // Historic Stone Plaque centered above arch
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

/**
 * Builds Stage 1 End Landmark: Tháp Đồng Hồ Bờ Hồ & textured Bưu Điện Hà Nội.
 */
function buildClockTowerLandmark(
  colonialTex: THREE.CanvasTexture,
  roofTex: THREE.CanvasTexture,
  shaftTex: THREE.CanvasTexture,
  track: <T extends { dispose: () => void }>(res: T) => T
): THREE.Group {
  const tower = new THREE.Group();
  tower.name = 'Landmark_ThapDongHo';

  const whiteMat = track(
    new THREE.MeshStandardMaterial({ color: HANOI_PALETTE.clockTowerWhite, roughness: 0.7 })
  );
  const shaftMat = track(
    new THREE.MeshStandardMaterial({ map: shaftTex, roughness: 0.74 })
  );
  const trimMat = track(
    new THREE.MeshStandardMaterial({ color: 0xc9c3b6, roughness: 0.78 })
  );
  const roofMat = track(
    new THREE.MeshStandardMaterial({ map: roofTex, roughness: 0.76 })
  );
  const clockTex = track(createClockFaceTexture());
  const clockMat = track(new THREE.MeshBasicMaterial({ map: clockTex }));

  // Textured Colonial Post Office wings & facade behind the clock tower
  const buildingMat = track(
    new THREE.MeshStandardMaterial({ map: colonialTex, roughness: 0.8 })
  );
  const baseBuilding = new THREE.Mesh(track(new THREE.BoxGeometry(38, 11.2, 11)), buildingMat);
  baseBuilding.position.set(0, 5.6, -4.5);
  baseBuilding.castShadow = true;
  tower.add(baseBuilding);

  const baseCornice = new THREE.Mesh(track(new THREE.BoxGeometry(39.2, 0.9, 11.8)), whiteMat);
  baseCornice.position.set(0, 11.5, -4.5);
  tower.add(baseCornice);

  const baseRoof = new THREE.Mesh(track(new THREE.BoxGeometry(37.6, 1.6, 10.6)), roofMat);
  baseRoof.position.set(0, 12.6, -4.5);
  tower.add(baseRoof);

  const postSignTex = track(
    createBannerTexture(
      'BƯU ĐIỆN HÀ NỘI',
      'HỒ HOÀN KIẾM · TRUNG TÂM THỦ ĐÔ',
      '#ead9b5',
      '#5b3a22',
      '#5b3a22',
      1024,
      192
    )
  );
  const postSign = new THREE.Mesh(
    track(new THREE.PlaneGeometry(8.4, 1.45)),
    track(new THREE.MeshBasicMaterial({ map: postSignTex }))
  );
  postSign.position.set(11.6, 9.2, 1.12);
  tower.add(postSign);

  // Tall 4-pillar textured clock shaft with recessed panels & base/collar cornices
  const towerPlinth = new THREE.Mesh(track(new THREE.BoxGeometry(5.4, 1.5, 5.4)), trimMat);
  towerPlinth.position.set(0, 0.75, 0);
  tower.add(towerPlinth);

  const shaft = new THREE.Mesh(track(new THREE.BoxGeometry(4.4, 16.5, 4.4)), shaftMat);
  shaft.position.set(0, 8.25, 0);
  shaft.castShadow = true;
  tower.add(shaft);

  const midCollar = new THREE.Mesh(track(new THREE.BoxGeometry(5.1, 0.55, 5.1)), trimMat);
  midCollar.position.set(0, 15.8, 0);
  tower.add(midCollar);

  const ribGeo = track(new THREE.BoxGeometry(0.6, 17.0, 0.6));
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const rib = new THREE.Mesh(ribGeo, trimMat);
      rib.position.set(sx * 2.15, 8.5, sz * 2.15);
      tower.add(rib);
    }
  }

  // Iconic square dark-faced clock housing
  const clockBox = new THREE.Mesh(track(new THREE.BoxGeometry(5.8, 5.5, 5.8)), whiteMat);
  clockBox.position.set(0, 18.8, 0);
  clockBox.castShadow = true;
  tower.add(clockBox);

  const faceGeo = track(new THREE.PlaneGeometry(4.6, 4.6));
  const frontFace = new THREE.Mesh(faceGeo, clockMat);
  frontFace.position.set(0, 18.8, 2.94);
  tower.add(frontFace);

  const leftFace = new THREE.Mesh(faceGeo, clockMat);
  leftFace.rotation.y = -Math.PI / 2;
  leftFace.position.set(-2.94, 18.8, 0);
  tower.add(leftFace);

  const rightFace = new THREE.Mesh(faceGeo, clockMat);
  rightFace.rotation.y = Math.PI / 2;
  rightFace.position.set(2.94, 18.8, 0);
  tower.add(rightFace);

  const lantern = new THREE.Mesh(track(new THREE.BoxGeometry(2.7, 2.0, 2.7)), whiteMat);
  lantern.position.set(0, 22.6, 0);
  tower.add(lantern);

  const spire = new THREE.Mesh(track(new THREE.CylinderGeometry(0.08, 0.14, 3.6, 8)), trimMat);
  spire.position.set(0, 25.4, 0);
  tower.add(spire);

  return tower;
}

/**
 * Builds Stage 2 End Landmark: Nhà Hát Lớn Hà Nội (Hanoi Opera House)
 * with textured Neo-Classical arched facade, pediment, and stepped slate Mansard roof + dormers.
 */
function buildOperaHouseLandmark(
  operaFacadeTex: THREE.CanvasTexture,
  colonialTex: THREE.CanvasTexture,
  track: <T extends { dispose: () => void }>(res: T) => T
): THREE.Group {
  const opera = new THREE.Group();
  opera.name = 'Landmark_NhaHatLon';

  const facadeMat = track(
    new THREE.MeshStandardMaterial({ map: operaFacadeTex, roughness: 0.72 })
  );
  const wingMat = track(
    new THREE.MeshStandardMaterial({ map: colonialTex, roughness: 0.78 })
  );
  const slateMat = track(
    new THREE.MeshStandardMaterial({ color: HANOI_PALETTE.operaSlateRoof, roughness: 0.62 })
  );
  const whiteMat = track(
    new THREE.MeshStandardMaterial({ color: HANOI_PALETTE.clockTowerWhite, roughness: 0.68 })
  );

  // Raised stone plinth & grand entry steps
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

  // Main Neo-Classical Arched Facade + Side Pavilions
  const mainBody = new THREE.Mesh(track(new THREE.BoxGeometry(25, 11.4, 14)), facadeMat);
  mainBody.position.set(0, 7.3, 0);
  mainBody.castShadow = true;
  opera.add(mainBody);

  for (const side of [-1, 1] as const) {
    const wing = new THREE.Mesh(track(new THREE.BoxGeometry(7.2, 10.2, 13)), wingMat);
    wing.position.set(side * 16.0, 6.7, 0.4);
    wing.castShadow = true;
    opera.add(wing);

    const wingRoof = new THREE.Mesh(
      track(new THREE.CylinderGeometry(3.4, 4.7, 2.4, 4)),
      slateMat
    );
    wingRoof.rotation.y = Math.PI / 4;
    wingRoof.scale.set(1.12, 1, 1.85);
    wingRoof.position.set(side * 16.0, 13.0, 0.4);
    opera.add(wingRoof);

    const wingCap = new THREE.Mesh(track(new THREE.BoxGeometry(3.8, 0.45, 7.6)), whiteMat);
    wingCap.position.set(side * 16.0, 14.3, 0.4);
    opera.add(wingCap);
  }

  // Classical Double Columns supporting Portico
  const colGeo = track(new THREE.CylinderGeometry(0.32, 0.38, 6.6, 10));
  for (let i = -3; i <= 3; i++) {
    const col = new THREE.Mesh(colGeo, whiteMat);
    col.position.set(i * 2.6, 5.0, 7.5);
    opera.add(col);
  }

  // Ornate White Cornice & Balustrade
  const cornice = new THREE.Mesh(track(new THREE.BoxGeometry(26.4, 1.15, 15.2)), whiteMat);
  cornice.position.set(0, 13.2, 0);
  opera.add(cornice);

  // Classical Triangular Pediment centered above entrance
  const pedimentShape = new THREE.Shape();
  pedimentShape.moveTo(-6.2, 0);
  pedimentShape.lineTo(6.2, 0);
  pedimentShape.lineTo(0, 2.8);
  pedimentShape.closePath();
  const pedimentGeo = track(
    new THREE.ExtrudeGeometry(pedimentShape, { depth: 1.4, bevelEnabled: false })
  );
  const pediment = new THREE.Mesh(pedimentGeo, whiteMat);
  pediment.position.set(0, 13.7, 6.4);
  opera.add(pediment);

  // Tapered trapezoidal French Mansard Slate Roof (frustum tiers + white crest + sloped dormer windows)
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

  // White arched dormer windows seated flush against the sloped front Mansard face
  const dormerGeo = track(new THREE.BoxGeometry(1.35, 1.75, 0.95));
  for (let i = -3; i <= 3; i++) {
    if (i === 0) continue;
    const dormer = new THREE.Mesh(dormerGeo, whiteMat);
    dormer.position.set(i * 2.85, 15.1, 6.15);
    dormer.rotation.x = -0.22;
    opera.add(dormer);
  }

  // Central Flagpole with Vietnamese Flag
  const pole = new THREE.Mesh(track(new THREE.CylinderGeometry(0.08, 0.1, 5.2, 8)), whiteMat);
  pole.position.set(0, 18.2, 6.6);
  opera.add(pole);

  const flagTex = track(createFlagTexture());
  const flag = new THREE.Mesh(
    track(new THREE.PlaneGeometry(3.3, 2.15)),
    track(new THREE.MeshBasicMaterial({ map: flagTex, side: THREE.DoubleSide }))
  );
  flag.position.set(1.65, 19.7, 6.6);
  opera.add(flag);

  // Multi-tiered Flower Roundabout Plaza in front
  const plazaCurb = new THREE.Mesh(track(new THREE.CylinderGeometry(6.2, 6.6, 0.55, 18)), whiteMat);
  plazaCurb.position.set(0, 0.28, 16.5);
  opera.add(plazaCurb);

  const plazaGreenery = new THREE.Mesh(
    track(new THREE.CylinderGeometry(5.5, 5.7, 0.68, 18)),
    track(new THREE.MeshStandardMaterial({ color: HANOI_PALETTE.bougainvilleaLeaf, roughness: 0.85 }))
  );
  plazaGreenery.position.set(0, 0.42, 16.5);
  opera.add(plazaGreenery);

  const plazaFlowers = new THREE.Mesh(
    track(new THREE.CylinderGeometry(3.8, 4.1, 0.9, 16)),
    track(new THREE.MeshStandardMaterial({ color: HANOI_PALETTE.bougainvilleaPink, roughness: 0.78 }))
  );
  plazaFlowers.position.set(0, 0.62, 16.5);
  opera.add(plazaFlowers);

  return opera;
}

function createInstancedBatch(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  matrices: THREE.Matrix4[],
  colors: THREE.Color[] | null,
  castShadow: boolean,
  receiveShadow: boolean,
  track: <T extends { dispose: () => void }>(res: T) => T
): THREE.InstancedMesh | null {
  if (matrices.length === 0) return null;
  track(geometry);
  track(material);
  const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
  mesh.castShadow = castShadow;
  mesh.receiveShadow = receiveShadow;
  for (let i = 0; i < matrices.length; i++) {
    mesh.setMatrixAt(i, matrices[i]);
    if (colors && colors[i]) {
      mesh.setColorAt(i, colors[i]);
    }
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return mesh;
}

/**
 * Builds rich textured Hanoi architecture, multi-cluster organic trees, street life,
 * and 360-degree horizon backdrops across all 3 stages while preserving >= 55 FPS.
 */
export function buildHanoiLandmarks(stageId: 1 | 2 | 3): LandmarksBuildResult {
  const stage = getStageSpec(stageId);
  const roadWidth = stage.roadWidth;
  const roadHalfW = roadWidth * 0.5;
  const group = new THREE.Group();
  group.name = `HanoiLandmarks_Stage${stageId}`;

  const disposables: Array<{ dispose: () => void }> = [];
  const track = <T extends { dispose: () => void }>(res: T): T => {
    disposables.push(res);
    return res;
  };
  const rand = createPrng(stageId * 9173 + 42);
  const dummy = new THREE.Object3D();

  // Shared procedural textures
  const roofTex = track(createTerracottaRoofTexture());
  const foliageTex = track(createLeafFoliageTexture());
  const barkTex = track(createTreeBarkTexture());
  const colonialTex0 = track(createColonialFacadeTexture(0));
  const colonialTex1 = track(createColonialFacadeTexture(1));
  const shaftTex = track(createClockTowerShaftTexture());

  const animatedFlags: AnimatedFlagInstance[] = [];
  const flagData: Array<{
    x: number;
    y: number;
    z: number;
    yaw: number;
    sx: number;
    sy: number;
    sz: number;
    phase: number;
  }> = [];

  // Shared multi-part organic tree & lamppost batches
  const trunkMatrices: THREE.Matrix4[] = [];
  const branchMatrices: THREE.Matrix4[] = [];
  const limeBaseMatrices: THREE.Matrix4[] = [];
  const canopyMatrices: THREE.Matrix4[] = [];
  const canopyColors: THREE.Color[] = [];
  const poleMatrices: THREE.Matrix4[] = [];
  const lampHeadMatrices: THREE.Matrix4[] = [];

  const greenCol = new THREE.Color(HANOI_PALETTE.foliageGreen);
  const deepGreenCol = new THREE.Color(0x28562b);
  const sunlitCol = new THREE.Color(HANOI_PALETTE.foliageSunlit);
  const autumnCol = new THREE.Color(HANOI_PALETTE.foliageAutumn);

  const pushMatrix = (
    arr: THREE.Matrix4[],
    x: number,
    y: number,
    z: number,
    rx = 0,
    ry = 0,
    rz = 0,
    sx = 1,
    sy = 1,
    sz = 1
  ) => {
    dummy.position.set(x, y, z);
    dummy.rotation.set(rx, ry, rz);
    dummy.scale.set(sx, sy, sz);
    dummy.updateMatrix();
    arr.push(dummy.matrix.clone());
  };

  /**
   * Builds a multi-branch, multi-puff organic Hanoi street tree (never a single sphere).
   */
  const addOrganicTree = (
    tx: number,
    z: number,
    hScale: number,
    withLimeBase: boolean,
    leanInwardDir: number,
    isAutumnStyle = false
  ) => {
    const trunkH = 5.2 * hScale;
    pushMatrix(
      trunkMatrices,
      tx,
      trunkH * 0.5,
      z,
      0,
      rand() * Math.PI,
      leanInwardDir * 0.08,
      0.95,
      hScale,
      0.95
    );
    if (withLimeBase) {
      pushMatrix(limeBaseMatrices, tx, 0.72, z, 0, 0, 0, 1.0, 1.0, 1.0);
    }

    // Two diverging upper branches supporting asymmetrical foliage clusters
    pushMatrix(
      branchMatrices,
      tx + leanInwardDir * 0.65,
      trunkH + 0.45,
      z - 0.35,
      0.22,
      0,
      -leanInwardDir * 0.52,
      1,
      hScale * 0.85,
      1
    );
    pushMatrix(
      branchMatrices,
      tx - leanInwardDir * 0.45,
      trunkH + 0.35,
      z + 0.45,
      -0.25,
      0,
      leanInwardDir * 0.48,
      1,
      hScale * 0.8,
      1
    );

    const pickColor = () => {
      if (isAutumnStyle) return rand() > 0.38 ? autumnCol : sunlitCol;
      const r = rand();
      return r > 0.65 ? sunlitCol : r > 0.25 ? greenCol : deepGreenCol;
    };

    const crownY = trunkH + 1.65 * hScale;
    const crownX = tx + leanInwardDir * 0.95;
    // 4 overlapping irregular leafy puffs per tree
    const puffs: Array<[number, number, number, number, number, number]> = [
      [0, 0.3, 0, 2.7, 1.65, 2.7],
      [leanInwardDir * 1.35, -0.1, -0.95, 2.25, 1.35, 2.15],
      [-leanInwardDir * 1.05, 0.15, 1.05, 2.1, 1.4, 2.2],
      [leanInwardDir * 0.35, 1.05, 0.25, 1.95, 1.25, 1.95]
    ];
    for (const [ox, oy, oz, sx, sy, sz] of puffs) {
      pushMatrix(
        canopyMatrices,
        crownX + ox,
        crownY + oy,
        z + oz,
        rand() * 0.4,
        rand() * Math.PI * 2,
        rand() * 0.4,
        sx * hScale,
        sy * hScale,
        sz * hScale
      );
      canopyColors.push(pickColor());
    }
  };

  // ============================================================================
  // START (A) ARCH FOR ALL STAGES
  // ============================================================================
  const startArchColors: Record<1 | 2 | 3, { bg: string; border: string; pillar: number }> = {
    1: { bg: '#5b3a22', border: '#e3a837', pillar: HANOI_PALETTE.oldQuarterYellow },
    2: { bg: '#0f6b70', border: '#f6eedc', pillar: HANOI_PALETTE.shutterTealDark },
    3: { bg: '#155b94', border: '#ffcd00', pillar: HANOI_PALETTE.overpassConcrete }
  };
  const sa = startArchColors[stageId];
  const startArch = createGateArch(
    roadWidth,
    stage.fromLabel.toUpperCase(),
    `XUẤT PHÁT · ${stage.shortName.toUpperCase()} · ${stage.laneCount} LÀN (${stage.length}M)`,
    sa.bg,
    sa.border,
    sa.pillar,
    track
  );
  startArch.position.set(
    getRoadCenterX(stageId, 16),
    getRoadElevationY(stageId, 16),
    distanceToWorldZ(16)
  );
  startArch.rotation.y = getRoadTangentYaw(stageId, 16);
  group.add(startArch);

  // ============================================================================
  // STAGE 1: PHỐ CỔ (TEXTURED SHOPHOUSES, 3 SIGNBOARDS, STOOLS/POTS, Ô QUAN CHƯỞNG)
  // ============================================================================
  if (stageId === 1) {
    const houseM: [THREE.Matrix4[], THREE.Matrix4[], THREE.Matrix4[]] = [[], [], []];
    const roofM: THREE.Matrix4[] = [];
    const waterTankM: THREE.Matrix4[] = [];
    const awningM: THREE.Matrix4[] = [];
    const balconyM: THREE.Matrix4[] = [];
    const signM: THREE.Matrix4[][] = Array.from({ length: 8 }, () => []);
    const stoolM: THREE.Matrix4[] = [];
    const potM: THREE.Matrix4[] = [];
    const potFlowerM: THREE.Matrix4[] = [];
    const wirePoints: number[] = [];

    let houseSeq = 0;
    for (let d = 18; d < stage.length - 15; d += 11.0) {
      if (d > 632 && d < 668) continue;

      const cx = getRoadCenterX(1, d);
      const z = distanceToWorldZ(d);
      const yaw = getRoadTangentYaw(1, d);

      for (const side of [-1, 1] as const) {
        const frontage = 4.6 + rand() * 2.8;
        const h = 7.4 + rand() * 8.2;
        const depth = 8.0 + rand() * 2.2;
        const setback = (rand() - 0.5) * 1.1;
        const xOff = cx + side * (roadHalfW + 4.4 + depth * 0.5 + setback);
        const faceOffset = -side * (depth * 0.5 + 0.06);
        const variant = ((houseSeq * 2 + (side > 0 ? 1 : 0)) % 3) as 0 | 1 | 2;

        // Varied Old Quarter "nhà ống" shophouse
        pushMatrix(houseM[variant], xOff, h * 0.5, z, 0, yaw, 0, depth, h, frontage);

        // Slanted textured terracotta roof
        pushMatrix(
          roofM,
          xOff,
          h + 0.72,
          z,
          0,
          yaw,
          side * 0.08,
          depth + 0.65,
          1.45,
          frontage + 0.45
        );

        // Signature Hanoi stainless-steel rooftop water tanks on ~38% of buildings
        if (rand() > 0.62) {
          pushMatrix(
            waterTankM,
            xOff + side * 1.1,
            h + 2.05,
            z + (rand() - 0.5) * 1.2,
            0,
            0,
            Math.PI / 2,
            0.72,
            1.65,
            0.72
          );
        }

        // Ground-floor corrugated teal awning
        pushMatrix(
          awningM,
          xOff + faceOffset - side * 0.9,
          3.15,
          z,
          0,
          yaw,
          side * 0.28,
          2.0,
          0.14,
          frontage * 0.92
        );

        // Wrought-iron 2nd floor balcony deck
        pushMatrix(
          balconyM,
          xOff + faceOffset - side * 0.45,
          4.25,
          z,
          0,
          yaw,
          0,
          0.9,
          0.35,
          frontage * 0.8
        );

        // 8 distinct Old Quarter shop signboards cycled so neighbors never duplicate
        if (rand() > 0.14) {
          const signIdx = (houseSeq * 3 + (side > 0 ? 4 : 0)) % 8;
          pushMatrix(
            signM[signIdx],
            xOff + faceOffset - side * 0.96,
            4.55,
            z,
            0,
            yaw,
            0,
            0.12,
            0.94,
            Math.min(5.2, frontage * 0.72)
          );
        }

        // Sidewalk street life: plastic trà đá stools & terracotta flower pots
        const curbWalkX = cx + side * (roadHalfW + 2.55);
        if (rand() > 0.35) {
          pushMatrix(stoolM, curbWalkX, 0.34, z - 0.9, 0, 0, 0, 0.42, 0.34, 0.42);
          pushMatrix(stoolM, curbWalkX - side * 0.55, 0.34, z - 0.5, 0, 0, 0, 0.42, 0.34, 0.42);
        }
        if (rand() > 0.4) {
          pushMatrix(potM, curbWalkX + side * 0.55, 0.42, z + 1.4, 0, 0, 0, 0.5, 0.55, 0.5);
          pushMatrix(potFlowerM, curbWalkX + side * 0.55, 0.85, z + 1.4, 0, 0, 0, 0.65, 0.55, 0.65);
        }

        // Utility pole & organic tree + flag
        if (Math.floor(d / 11.0) % 2 === 0) {
          const poleX = cx + side * (roadHalfW + 1.05);
          pushMatrix(poleMatrices, poleX, 3.8, z, 0, 0, 0, 1, 1, 1);

          if (rand() > 0.3) {
            flagData.push({
              x: poleX - side * 0.5,
              y: 4.5,
              z,
              yaw: yaw + (side > 0 ? 0.3 : -0.3),
              sx: 1.0,
              sy: 0.7,
              sz: 1,
              phase: d * 0.17
            });
          }
        } else if (rand() > 0.36) {
          const tx = cx + side * (roadHalfW + 2.05);
          addOrganicTree(tx, z, 0.88 + rand() * 0.22, true, -side, false);
        }
      }
      houseSeq += 1;

      // Tangled overhead catenary power wires crossing above street (stop clearly before Clock Tower)
      if (d < stage.length - 58 && Math.floor(d / 11.0) % 3 === 0) {
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
            wirePoints.push(
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

    // Seal both flanks of Ô Quan Chưởng (d = 632..668) with stepped Old Quarter blocks & trees
    for (const dFlank of [634, 645, 656, 667]) {
      const cxF = getRoadCenterX(1, dFlank);
      const zF = distanceToWorldZ(dFlank);
      const yawF = getRoadTangentYaw(1, dFlank);
      for (const side of [-1, 1] as const) {
        for (const [ringDist, ringH, ringW] of [
          [roadHalfW + 19.5, 9.8 + rand() * 3.2, 13.0],
          [roadHalfW + 33.0, 11.5 + rand() * 3.8, 14.5]
        ] as const) {
          const v = Math.floor(rand() * 3) as 0 | 1 | 2;
          const xf = cxF + side * ringDist;
          pushMatrix(houseM[v], xf, ringH * 0.5, zF, 0, yawF, 0, ringW, ringH, 12.0);
          pushMatrix(roofM, xf, ringH + 0.72, zF, 0, yawF, side * 0.06, ringW + 0.6, 1.45, 12.2);
        }
      }
    }

    // Extra corner Old Quarter blocks flanking Finish Plaza approach (Stage 1)
    for (const dEnd of [stage.length - 6, stage.length + 10, stage.length + 26]) {
      const cxE = getRoadCenterX(1, dEnd);
      const zE = distanceToWorldZ(dEnd);
      for (const side of [-1, 1] as const) {
        const xf = cxE + side * (roadHalfW + 19.5);
        const hf = 11.5 + rand() * 3.0;
        const v = Math.floor(rand() * 3) as 0 | 1 | 2;
        pushMatrix(houseM[v], xf, hf * 0.5, zE, 0, 0, 0, 16, hf, 14);
        pushMatrix(roofM, xf, hf + 0.72, zE, 0, 0, side * 0.06, 16.5, 1.45, 14.4);
      }
    }

    const addInst = (
      geo: THREE.BufferGeometry,
      mat: THREE.Material,
      m: THREE.Matrix4[],
      c: THREE.Color[] | null,
      cast = true
    ) => {
      const im = createInstancedBatch(geo, mat, m, c, cast, true, track);
      if (im) group.add(im);
    };

    ([0, 1, 2] as const).forEach((v) => {
      const fTex = track(createOldQuarterFacadeTexture(v));
      addInst(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshStandardMaterial({ map: fTex, roughness: 0.82 }),
        houseM[v],
        null,
        true
      );
    });

    addInst(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ map: roofTex, roughness: 0.78 }),
      roofM,
      null,
      true
    );
    addInst(
      new THREE.CylinderGeometry(0.5, 0.5, 1, 10),
      new THREE.MeshStandardMaterial({
        color: 0xd8dee4,
        metalness: 0.88,
        roughness: 0.22,
        envMapIntensity: 1.5
      }),
      waterTankM,
      null,
      true
    );
    addInst(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: HANOI_PALETTE.shutterTealDark, roughness: 0.68 }),
      awningM,
      null,
      true
    );
    addInst(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: HANOI_PALETTE.ironBalcony, roughness: 0.5, metalness: 0.45 }),
      balconyM,
      null,
      false
    );

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
    signSpecs.forEach(([title, sub, bg, border], idx) => {
      const sTex = track(createBannerTexture(title, sub, bg, border, '#f6eedc', 1024, 224));
      addInst(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshStandardMaterial({
          map: sTex,
          emissiveMap: sTex,
          emissive: new THREE.Color(0x6b4b1e),
          emissiveIntensity: 0.65,
          roughness: 0.55
        }),
        signM[idx],
        null,
        false
      );
    });

    addInst(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0x1b6ca8, roughness: 0.55 }),
      stoolM,
      null,
      false
    );
    addInst(
      new THREE.CylinderGeometry(0.45, 0.35, 1, 8),
      new THREE.MeshStandardMaterial({ color: HANOI_PALETTE.terracottaRoof, roughness: 0.85 }),
      potM,
      null,
      false
    );
    addInst(
      new THREE.DodecahedronGeometry(0.65, 0),
      new THREE.MeshStandardMaterial({ color: HANOI_PALETTE.foliageGreen, roughness: 0.82 }),
      potFlowerM,
      null,
      false
    );

    if (wirePoints.length > 0) {
      const wireGeo = track(new THREE.BufferGeometry());
      wireGeo.setAttribute('position', new THREE.Float32BufferAttribute(wirePoints, 3));
      const wireMat = track(
        new THREE.LineBasicMaterial({ color: 0x1e1d1c, transparent: true, opacity: 0.82 })
      );
      group.add(new THREE.LineSegments(wireGeo, wireMat));
    }

    // Ô Quan Chưởng Arched Gate at ~650m
    const stoneTex = track(createOQuanChuongStoneTexture());
    const oqc = buildOQuanChuongGate(roadWidth, stoneTex, roofTex, track);
    oqc.position.set(getRoadCenterX(1, 650), 0, distanceToWorldZ(650));
    oqc.rotation.y = getRoadTangentYaw(1, 650);
    group.add(oqc);

    for (const dTree of [638, 646, 656, 666]) {
      const cxTree = getRoadCenterX(1, dTree);
      const zTree = distanceToWorldZ(dTree);
      for (const side of [-1, 1] as const) {
        addOrganicTree(cxTree + side * (roadHalfW + 12.8), zTree, 1.08, true, -side, false);
        addOrganicTree(cxTree + side * (roadHalfW + 24.5), zTree - 2.0, 1.22, false, -side, false);
      }
    }

    // Finish Arch (B) + Tháp Đồng Hồ Bờ Hồ & Bưu Điện Hà Nội at 1450m
    const finishArch = createGateArch(
      roadWidth,
      'THÁP ĐỒNG HỒ BỜ HỒ (B)',
      'HOÀN THÀNH BÀI 1 · HỒ GƯƠM HÀ NỘI',
      '#0f6b70',
      '#e3a837',
      HANOI_PALETTE.oldQuarterCream,
      track
    );
    finishArch.position.set(
      getRoadCenterX(1, stage.length),
      0,
      distanceToWorldZ(stage.length)
    );
    finishArch.rotation.y = getRoadTangentYaw(1, stage.length);
    group.add(finishArch);

    const clockTower = buildClockTowerLandmark(colonialTex0, roofTex, shaftTex, track);
    clockTower.position.set(
      getRoadCenterX(1, stage.length + 28) + 4.5,
      0,
      distanceToWorldZ(stage.length + 28)
    );
    clockTower.rotation.y = -0.18;
    group.add(clockTower);

    // Lush Hoàn Kiếm Lakefront park trees & backdrop city buildings sealing horizon
    const bgM: THREE.Matrix4[] = [];
    const cxEnd1 = getRoadCenterX(1, stage.length);
    for (let i = -5; i <= 5; i++) {
      const distEnd = stage.length + 42 + Math.abs(i) * 5;
      const bx = cxEnd1 + i * 20;
      const bz = distanceToWorldZ(distEnd);
      const bh = 14 + (Math.abs(i) % 3) * 4;
      pushMatrix(bgM, bx, bh * 0.5, bz, 0, 0, 0, 22, bh, 14);
      if (Math.abs(i) >= 2) {
        addOrganicTree(
          cxEnd1 + i * 11.5,
          distanceToWorldZ(stage.length + 14 + (Math.abs(i) % 2) * 8),
          1.15,
          true,
          i > 0 ? -1 : 1,
          false
        );
      }
    }
    const bgIm = createInstancedBatch(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ map: colonialTex1, roughness: 0.85 }),
      bgM,
      null,
      false,
      true,
      track
    );
    if (bgIm) group.add(bgIm);
  }

  // ============================================================================
  // STAGE 2: PHỐ CÂY XANH & QUẢNG TRƯỜNG NHÀ HÁT LỚN
  // ============================================================================
  if (stageId === 2) {
    const villaM: [THREE.Matrix4[], THREE.Matrix4[]] = [[], []];
    const villaRoofM: THREE.Matrix4[] = [];
    const bannerM: THREE.Matrix4[] = [];
    const sunbeamM: THREE.Matrix4[] = [];

    for (let d = 22; d < stage.length - 18; d += 12) {
      const cx = getRoadCenterX(2, d);
      const z = distanceToWorldZ(d);
      const yaw = getRoadTangentYaw(2, d);

      for (const side of [-1, 1] as const) {
        // Multi-cluster ancient Hanoi street canopies arching over the avenue
        const tx = cx + side * (roadHalfW + 2.2);
        const hScale = 1.08 + rand() * 0.38;
        addOrganicTree(tx, z, hScale, true, -side, false);

        // Textured French-colonial streetfront villas with terracotta pitched roofs
        if (Math.floor(d / 12) % 2 === 0) {
          const vx = cx + side * (roadHalfW + 12.2);
          const vh = 8.6 + rand() * 3.4;
          const vIdx = (Math.floor(d / 12) / 2) % 2 === 0 ? 0 : 1;
          pushMatrix(villaM[vIdx], vx, vh * 0.5, z, 0, yaw, 0, 10.5, vh, 14.5);
          pushMatrix(
            villaRoofM,
            vx,
            vh + 0.85,
            z,
            0,
            yaw,
            side * 0.08,
            11.2,
            1.7,
            15.0
          );
        }

        // Vintage Khue Van Cac lamppost & upright medallion + red flag
        if (Math.floor(d / 12) % 2 === 0) {
          const lx = cx + side * (roadHalfW + 1.0);
          pushMatrix(poleMatrices, lx, 3.6, z, 0, 0, 0, 0.9, 1.0, 0.9);
          pushMatrix(lampHeadMatrices, lx - side * 0.35, 6.9, z, 0, 0, 0, 1, 1, 1);
          pushMatrix(bannerM, lx - side * 0.65, 5.0, z, 0, yaw, 0, 1.1, 1.1, 1.1);
          if (Math.floor(d / 24) % 2 === 0) {
            flagData.push({
              x: lx - side * 0.55,
              y: 3.9,
              z: z + 0.3,
              yaw: yaw + (side > 0 ? 0.25 : -0.25),
              sx: 1.15,
              sy: 0.78,
              sz: 1,
              phase: d * 0.13
            });
          }
        }
      }

      if (Math.floor(d / 12) % 4 === 0) {
        pushMatrix(sunbeamM, cx - 2.0, 5.5, z, 0.22, 0.15, -0.48, 4.6, 14.5, 1.0);
      }
    }

    // Flanking Colonial corner villas sealing Opera House plaza far left/right edges
    const cxEnd2 = getRoadCenterX(2, stage.length);
    for (const dSide of [stage.length - 4, stage.length + 14, stage.length + 32]) {
      const zS = distanceToWorldZ(dSide);
      for (const side of [-1, 1] as const) {
        for (const distX of [roadHalfW + 17.5, roadHalfW + 31.5]) {
          const vx = cxEnd2 + side * distX;
          const vh = 10.5 + rand() * 3.0;
          const vIdx = rand() > 0.5 ? 0 : 1;
          pushMatrix(villaM[vIdx], vx, vh * 0.5, zS, 0, 0, 0, 13.0, vh, 15.0);
          pushMatrix(villaRoofM, vx, vh + 0.85, zS, 0, 0, side * 0.06, 13.5, 1.7, 15.4);
        }
      }
    }

    const vIm0 = createInstancedBatch(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ map: colonialTex0, roughness: 0.8 }),
      villaM[0],
      null,
      true,
      true,
      track
    );
    if (vIm0) group.add(vIm0);

    const vIm1 = createInstancedBatch(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ map: colonialTex1, roughness: 0.8 }),
      villaM[1],
      null,
      true,
      true,
      track
    );
    if (vIm1) group.add(vIm1);

    const vRoofIm = createInstancedBatch(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ map: roofTex, roughness: 0.78 }),
      villaRoofM,
      null,
      true,
      true,
      track
    );
    if (vRoofIm) group.add(vRoofIm);

    const kvcTex = track(createKhueVanCacBannerTexture());
    const bannerMesh = createInstancedBatch(
      new THREE.CircleGeometry(0.62, 18),
      new THREE.MeshBasicMaterial({
        map: kvcTex,
        transparent: true,
        alphaTest: 0.2,
        side: THREE.DoubleSide
      }),
      bannerM,
      null,
      false,
      false,
      track
    );
    if (bannerMesh) group.add(bannerMesh);

    const sunbeamTex = track(createSoftSunbeamTexture());
    const sunbeamMesh = createInstancedBatch(
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
      sunbeamM,
      null,
      false,
      false,
      track
    );
    if (sunbeamMesh) group.add(sunbeamMesh);

    // Finish Arch (B) + Nhà Hát Lớn Hà Nội at 1700m
    const finishArch = createGateArch(
      roadWidth,
      'QUẢNG TRƯỜNG NHÀ HÁT LỚN (B)',
      'HOÀN THÀNH BÀI 2 · KIẾN TRÚC HÀ NỘI',
      '#323b45',
      '#e8a838',
      HANOI_PALETTE.oldQuarterCream,
      track
    );
    finishArch.position.set(
      getRoadCenterX(2, stage.length),
      0,
      distanceToWorldZ(stage.length)
    );
    finishArch.rotation.y = getRoadTangentYaw(2, stage.length);
    group.add(finishArch);

    // Dense plaza trees & textured cityscape flanking and behind Nhà Hát Lớn
    const operaBackdropM: THREE.Matrix4[] = [];
    for (let i = -5; i <= 5; i++) {
      if (Math.abs(i) >= 1) {
        addOrganicTree(
          cxEnd2 + i * 11.2,
          distanceToWorldZ(stage.length + 18 + (Math.abs(i) % 3) * 6),
          1.2,
          true,
          i > 0 ? -1 : 1,
          false
        );
      }
      if (Math.abs(i) >= 1) {
        pushMatrix(
          operaBackdropM,
          cxEnd2 + i * 21,
          8.5,
          distanceToWorldZ(stage.length + 54 + Math.abs(i) * 4),
          0,
          0,
          0,
          22,
          17,
          14
        );
      }
    }
    const opBgIm = createInstancedBatch(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ map: colonialTex0, roughness: 0.85 }),
      operaBackdropM,
      null,
      false,
      true,
      track
    );
    if (opBgIm) group.add(opBgIm);

    const operaTex = track(createOperaFacadeTexture());
    const opera = buildOperaHouseLandmark(operaTex, colonialTex1, track);
    opera.scale.setScalar(1.12);
    opera.position.set(
      getRoadCenterX(2, stage.length + 40),
      0,
      distanceToWorldZ(stage.length + 40)
    );
    group.add(opera);
  }

  // ============================================================================
  // STAGE 3: ĐẠI LỘ HOA GIẤY & CẦU VƯỢT (TEXTURED SKYLINE & LUSH TREES)
  // ============================================================================
  if (stageId === 3) {
    const shrubM: THREE.Matrix4[] = [];
    const blossomM: THREE.Matrix4[] = [];
    const blossomC: THREE.Color[] = [];
    const pierM: THREE.Matrix4[] = [];
    const pierCapM: THREE.Matrix4[] = [];
    const midRiseM: [THREE.Matrix4[], THREE.Matrix4[]] = [[], []];
    const towerM: [THREE.Matrix4[], THREE.Matrix4[], THREE.Matrix4[]] = [[], [], []];
    const towerCrownM: THREE.Matrix4[] = [];

    const pinkCol = new THREE.Color(HANOI_PALETTE.bougainvilleaPink);
    const magentaCol = new THREE.Color(HANOI_PALETTE.bougainvilleaMagenta);

    for (let d = 12; d < stage.length - 12; d += 4.5) {
      const cx = getRoadCenterX(3, d);
      const z = distanceToWorldZ(d);
      const yaw = getRoadTangentYaw(3, d);
      const roadY = getRoadElevationY(3, d);
      const stepIdx = Math.floor(d / 4.5);

      for (const side of [-1, 1] as const) {
        const mx = cx + side * (roadHalfW + 1.85);
        pushMatrix(shrubM, mx, 0.52, z, 0, rand() * 3, 0, 1.38, 0.86, 1.38);
        pushMatrix(
          blossomM,
          mx + (rand() - 0.5) * 0.45,
          0.86 + rand() * 0.25,
          z + (rand() - 0.5) * 0.45,
          0,
          rand() * 3,
          0,
          1.2,
          0.78,
          1.2
        );
        blossomC.push(rand() > 0.45 ? pinkCol : magentaCol);

        // Cascading lush bougainvillea planters along the wide 6-lane Overpass guardrails
        if (roadY > 0.2) {
          const px = cx + side * (roadHalfW + 0.54);
          pushMatrix(shrubM, px, roadY + 0.7, z, 0, rand() * 3, 0, 0.85, 0.56, 1.35);
          for (const dz of [-1.05, 1.05]) {
            pushMatrix(
              blossomM,
              px + (rand() - 0.5) * 0.22,
              roadY + 0.94 + rand() * 0.18,
              z + dz + (rand() - 0.5) * 0.35,
              0,
              rand() * 3,
              0,
              0.84 + rand() * 0.22,
              0.55 + rand() * 0.16,
              1.12 + rand() * 0.25
            );
            blossomC.push(rand() > 0.42 ? pinkCol : magentaCol);
          }
        }
      }

      // Slender autumn-gold Bàng Lá Nhỏ trees set wide beside the 6-lane avenue
      if (stepIdx % 4 === 0) {
        for (const side of [-1, 1] as const) {
          const tx = cx + side * (roadHalfW + 11.4);
          addOrganicTree(tx, z, 0.92 + rand() * 0.25, false, -side, true);
        }
      }

      // Tall highway streetlights along the wide avenue & overpass deck
      if (stepIdx % 5 === 0) {
        for (const side of [-1, 1] as const) {
          const px = cx + side * (roadHalfW + 0.72);
          pushMatrix(poleMatrices, px, roadY + 3.4, z, 0, 0, 0, 0.78, 0.95, 0.78);
          pushMatrix(lampHeadMatrices, px - side * 0.5, roadY + 6.9, z, 0, 0, 0, 1.2, 0.8, 1.2);
        }
      }

      // Wide-set mid-rise modern apartment/commercial buildings giving an airy New Urban Area vista
      if (stepIdx % 3 === 0) {
        for (const side of [-1, 1] as const) {
          const bx = cx + side * (roadHalfW + 25.0);
          const bh = 11.5 + rand() * 7.0;
          const mVariant = (stepIdx + (side > 0 ? 1 : 0)) % 2 as 0 | 1;
          pushMatrix(midRiseM[mVariant], bx, bh * 0.5, z, 0, yaw, 0, 12.5, bh, 14.2);
          pushMatrix(towerCrownM, bx, bh + 0.65, z, 0, yaw, 0, 11.4, 1.3, 13.0);
        }
      }

      // Varied modern Hanoi skyline towers set well back for an expansive 6-lane boulevard feel
      if (stepIdx % 6 === 0) {
        for (const side of [-1, 1] as const) {
          const bx = cx + side * (roadHalfW + 39 + rand() * 14);
          const bh = 24 + rand() * 24;
          const bw = 13 + rand() * 6;
          const variant = Math.floor(rand() * 3) as 0 | 1 | 2;
          pushMatrix(towerM[variant], bx, bh * 0.5, z, 0, yaw, 0, bw, bh, 16);
          const crownH = 3.2 + rand() * 3.4;
          pushMatrix(towerCrownM, bx, bh + crownH * 0.5, z, 0, yaw, 0, bw * 0.66, crownH, 10.5);
        }
      }

      // Distant outer skyline tier visible from the Overpass crest
      if (stepIdx % 8 === 0) {
        for (const side of [-1, 1] as const) {
          const bx = cx + side * (roadHalfW + 64 + rand() * 14);
          const bh = 28 + rand() * 24;
          const variant = Math.floor(rand() * 3) as 0 | 1 | 2;
          pushMatrix(towerM[variant], bx, bh * 0.5, z, 0, 0, 0, 19, bh, 22);
        }
      }
    }

    // Seal Stage 3 finish plaza wings & full 180-degree urban skyline horizon behind monument
    const cxEnd3 = getRoadCenterX(3, stage.length);
    for (const dEnd of [stage.length - 4, stage.length + 12, stage.length + 28, stage.length + 44]) {
      const zE = distanceToWorldZ(dEnd);
      for (const side of [-1, 1] as const) {
        const xm = cxEnd3 + side * (roadHalfW + 19.5);
        const hm = 14 + rand() * 5;
        pushMatrix(midRiseM[side > 0 ? 1 : 0], xm, hm * 0.5, zE, 0, 0, 0, 15, hm, 17);
        const xt = cxEnd3 + side * (roadHalfW + 35.5);
        const ht = 28 + rand() * 14;
        const vt = Math.floor(rand() * 3) as 0 | 1 | 2;
        pushMatrix(towerM[vt], xt, ht * 0.5, zE, 0, 0, 0, 18, ht, 17);
        pushMatrix(towerCrownM, xt, ht + 2.2, zE, 0, 0, 0, 12, 4.4, 11.5);
      }
    }
    for (let i = -6; i <= 6; i++) {
      const bx = cxEnd3 + i * 18;
      const bz = distanceToWorldZ(stage.length + 60 + Math.abs(i) * 4);
      const bh = 24 + ((i + 6) % 3) * 9;
      const variant = ((i + 6) % 3) as 0 | 1 | 2;
      pushMatrix(towerM[variant], bx, bh * 0.5, bz, 0, 0, 0, 22, bh, 16);
      pushMatrix(towerCrownM, bx, bh + 2.2, bz, 0, 0, 0, 14, 4.4, 10.5);
      if (Math.abs(i) >= 1) {
        addOrganicTree(
          cxEnd3 + i * 10.5,
          distanceToWorldZ(stage.length + 20 + (Math.abs(i) % 3) * 6),
          1.15,
          false,
          i > 0 ? -1 : 1,
          true
        );
      }
    }

    // Wide 6-lane Overpass Concrete Support Piers (3 sturdy columns under 20.4m deck)
    for (let d = 840; d <= 1246; d += 28) {
      const cx = getRoadCenterX(3, d);
      const yDeck = getRoadElevationY(3, d);
      if (yDeck < 2.2) continue;
      const z = distanceToWorldZ(d);
      const pierH = yDeck - 0.85;
      for (const pxOff of [-6.8, 0, 6.8]) {
        pushMatrix(pierM, cx + pxOff, pierH * 0.5, z, 0, 0, 0, 1, pierH, 1);
      }
      pushMatrix(pierCapM, cx, pierH - 0.35, z, 0, 0, 0, roadWidth + 0.8, 0.85, 1.9);
    }

    const shrubMesh = createInstancedBatch(
      new THREE.IcosahedronGeometry(0.62, 1),
      new THREE.MeshStandardMaterial({ map: foliageTex, color: HANOI_PALETTE.bougainvilleaLeaf, roughness: 0.9 }),
      shrubM,
      null,
      true,
      true,
      track
    );
    if (shrubMesh) group.add(shrubMesh);

    const blossomMesh = createInstancedBatch(
      new THREE.IcosahedronGeometry(0.54, 1),
      new THREE.MeshStandardMaterial({
        map: foliageTex,
        color: 0xffffff,
        emissive: 0x3a0f24,
        emissiveIntensity: 0.22,
        roughness: 0.72
      }),
      blossomM,
      blossomC,
      false,
      false,
      track
    );
    if (blossomMesh) group.add(blossomMesh);

    const pierMesh = createInstancedBatch(
      new THREE.CylinderGeometry(0.72, 0.82, 1, 12),
      new THREE.MeshStandardMaterial({ color: HANOI_PALETTE.overpassConcrete, roughness: 0.85 }),
      pierM,
      null,
      true,
      true,
      track
    );
    if (pierMesh) group.add(pierMesh);

    const pierCapMesh = createInstancedBatch(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0xa69e90, roughness: 0.85 }),
      pierCapM,
      null,
      true,
      true,
      track
    );
    if (pierCapMesh) group.add(pierCapMesh);

    const modernTextures = ([0, 1, 2] as const).map((v) => track(createModernTowerTexture(v)));

    ([0, 1] as const).forEach((mIdx) => {
      const mMesh = createInstancedBatch(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshStandardMaterial({
          map: modernTextures[mIdx + 1],
          roughness: 0.72
        }),
        midRiseM[mIdx],
        null,
        false,
        true,
        track
      );
      if (mMesh) group.add(mMesh);
    });

    ([0, 1, 2] as const).forEach((v) => {
      const tMesh = createInstancedBatch(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshStandardMaterial({ map: modernTextures[v], roughness: 0.65 }),
        towerM[v],
        null,
        false,
        true,
        track
      );
      if (tMesh) group.add(tMesh);
    });

    const crownMesh = createInstancedBatch(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0xc9c2b6, roughness: 0.74 }),
      towerCrownM,
      null,
      false,
      true,
      track
    );
    if (crownMesh) group.add(crownMesh);

    // Finish Arch (B) + Trung Tâm Thủ Đô Victory Plaza at 1950m
    const finishArch = createGateArch(
      roadWidth,
      'TRUNG TÂM THỦ ĐÔ (B)',
      'ĐÍCH CUỐI · HOÀN THÀNH TOÀN TUYẾN HÀ NỘI',
      '#da251d',
      '#ffcd00',
      HANOI_PALETTE.oldQuarterYellow,
      track
    );
    finishArch.position.set(
      getRoadCenterX(3, stage.length),
      0,
      distanceToWorldZ(stage.length)
    );
    finishArch.rotation.y = getRoadTangentYaw(3, stage.length);
    group.add(finishArch);

    const monument = new THREE.Group();
    const stoneMatMon = track(
      new THREE.MeshStandardMaterial({ map: shaftTex, roughness: 0.68 })
    );
    const graniteBaseMat = track(
      new THREE.MeshStandardMaterial({ color: 0x8f887d, roughness: 0.78 })
    );
    const goldMat = track(
      new THREE.MeshStandardMaterial({ color: HANOI_PALETTE.flagStarYellow, roughness: 0.35, metalness: 0.35 })
    );

    const step1 = new THREE.Mesh(track(new THREE.CylinderGeometry(8.2, 8.8, 0.9, 8)), graniteBaseMat);
    step1.position.y = 0.45;
    monument.add(step1);

    const step2 = new THREE.Mesh(track(new THREE.CylinderGeometry(6.0, 6.6, 1.0, 8)), stoneMatMon);
    step2.position.y = 1.4;
    monument.add(step2);

    const plinth = new THREE.Mesh(track(new THREE.CylinderGeometry(3.8, 4.4, 2.2, 8)), graniteBaseMat);
    plinth.position.y = 3.0;
    monument.add(plinth);

    const goldRing = new THREE.Mesh(track(new THREE.CylinderGeometry(3.2, 3.4, 0.45, 8)), goldMat);
    goldRing.position.y = 4.25;
    monument.add(goldRing);

    const obelisk = new THREE.Mesh(track(new THREE.CylinderGeometry(1.05, 2.1, 13.5, 4)), stoneMatMon);
    obelisk.rotation.y = Math.PI / 4;
    obelisk.position.y = 11.2;
    monument.add(obelisk);

    const lotusCollar = new THREE.Mesh(track(new THREE.CylinderGeometry(1.75, 1.1, 1.1, 8)), goldMat);
    lotusCollar.position.y = 18.2;
    monument.add(lotusCollar);

    const starTop = new THREE.Mesh(track(new THREE.OctahedronGeometry(1.35, 0)), goldMat);
    starTop.position.y = 19.7;
    monument.add(starTop);

    monument.position.set(
      getRoadCenterX(3, stage.length + 34),
      0,
      distanceToWorldZ(stage.length + 34)
    );
    group.add(monument);
  }

  // ============================================================================
  // SHARED INSTANCED BARK TRUNKS, BRANCHES, LEAFY CANOPIES, LAMPS & FLAGS
  // ============================================================================
  const trunkMesh = createInstancedBatch(
    new THREE.CylinderGeometry(0.24, 0.42, 5.2, 8),
    new THREE.MeshStandardMaterial({ map: barkTex, roughness: 0.92 }),
    trunkMatrices,
    null,
    true,
    true,
    track
  );
  if (trunkMesh) group.add(trunkMesh);

  const branchMesh = createInstancedBatch(
    new THREE.CylinderGeometry(0.11, 0.2, 2.5, 6),
    new THREE.MeshStandardMaterial({ map: barkTex, roughness: 0.92 }),
    branchMatrices,
    null,
    true,
    true,
    track
  );
  if (branchMesh) group.add(branchMesh);

  const limeMesh = createInstancedBatch(
    new THREE.CylinderGeometry(0.4, 0.46, 1.45, 8),
    new THREE.MeshStandardMaterial({ color: HANOI_PALETTE.treeLimeBase, roughness: 0.9 }),
    limeBaseMatrices,
    null,
    false,
    true,
    track
  );
  if (limeMesh) group.add(limeMesh);

  const canopyMesh = createInstancedBatch(
    new THREE.IcosahedronGeometry(1.0, 1),
    new THREE.MeshStandardMaterial({ map: foliageTex, color: 0xffffff, roughness: 0.85 }),
    canopyMatrices,
    canopyColors,
    true,
    true,
    track
  );
  if (canopyMesh) group.add(canopyMesh);

  const poleMesh = createInstancedBatch(
    new THREE.CylinderGeometry(0.08, 0.11, 7.2, 8),
    new THREE.MeshStandardMaterial({ color: HANOI_PALETTE.shutterTealDark, roughness: 0.55, metalness: 0.35 }),
    poleMatrices,
    null,
    false,
    false,
    track
  );
  if (poleMesh) group.add(poleMesh);

  const lampMesh = createInstancedBatch(
    new THREE.SphereGeometry(0.24, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xfff0c2 }),
    lampHeadMatrices,
    null,
    false,
    false,
    track
  );
  if (lampMesh) group.add(lampMesh);

  if (flagData.length > 0) {
    const flagGeo = track(new THREE.PlaneGeometry(1.4, 0.95));
    const flagTex = track(createFlagTexture());
    const flagMat = track(
      new THREE.MeshBasicMaterial({ map: flagTex, side: THREE.DoubleSide })
    );
    const flagInst = new THREE.InstancedMesh(flagGeo, flagMat, flagData.length);
    for (let i = 0; i < flagData.length; i++) {
      const f = flagData[i];
      dummy.position.set(f.x, f.y, f.z);
      dummy.rotation.set(0, f.yaw, 0);
      dummy.scale.set(f.sx, f.sy, f.sz);
      dummy.updateMatrix();
      flagInst.setMatrixAt(i, dummy.matrix);
      animatedFlags.push({
        mesh: flagInst,
        index: i,
        x: f.x,
        y: f.y,
        z: f.z,
        baseYaw: f.yaw,
        scaleX: f.sx,
        scaleY: f.sy,
        scaleZ: f.sz,
        phase: f.phase
      });
    }
    flagInst.instanceMatrix.needsUpdate = true;
    group.add(flagInst);
  }

  return {
    group,
    update: (playerDistance: number, elapsedTime: number) => {
      if (animatedFlags.length === 0) return;
      const minZ = distanceToWorldZ(playerDistance + 220);
      const maxZ = distanceToWorldZ(Math.max(0, playerDistance - 25));
      let touched = false;
      for (const f of animatedFlags) {
        if (f.z < minZ || f.z > maxZ) continue;
        dummy.position.set(f.x, f.y, f.z);
        dummy.rotation.set(
          Math.sin(elapsedTime * 3.4 + f.phase) * 0.08,
          f.baseYaw + Math.sin(elapsedTime * 4.2 + f.phase) * 0.18,
          0
        );
        dummy.scale.set(f.scaleX, f.scaleY, f.scaleZ);
        dummy.updateMatrix();
        f.mesh.setMatrixAt(f.index, dummy.matrix);
        touched = true;
      }
      if (touched) {
        animatedFlags[0].mesh.instanceMatrix.needsUpdate = true;
      }
    },
    dispose: () => {
      for (const item of disposables) {
        item.dispose();
      }
    }
  };
}
