import * as THREE from 'three';

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D | null] {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return [canvas, canvas.getContext('2d')];
}

function finalizeTexture(
  canvas: HTMLCanvasElement,
  repeatX = 1,
  repeatY = 1
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  if (repeatX !== 1 || repeatY !== 1) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatX, repeatY);
  }
  tex.needsUpdate = true;
  return tex;
}

/**
 * Detailed Hanoi Old Quarter shophouse facade texture:
 * ground-floor warm-lit shopfront + folding wooden doors + mid-floor teal shutters
 * + balcony moldings + moss patina + subtle AC unit details.
 */
export function createOldQuarterFacadeTexture(variant: 0 | 1 | 2): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(512, 512);
  if (ctx) {
    const wallPalette = ['#d8a94e', '#e3cfa0', '#c78c47'];
    const baseWall = wallPalette[variant];
    ctx.fillStyle = baseWall;
    ctx.fillRect(0, 0, 512, 512);

    // Subtle weathered lime-plaster & Hanoi rain moss near cornices
    for (let y = 0; y < 512; y += 8) {
      const alpha = y < 48 || (y > 235 && y < 260) ? 0.14 : 0.04;
      ctx.fillStyle = `rgba(68, 56, 36, ${alpha})`;
      ctx.fillRect(0, y, 512, 4);
    }
    ctx.fillStyle = 'rgba(72, 82, 52, 0.16)';
    for (let i = 0; i < 18; i++) {
      const px = (i * 73 + variant * 41) % 480;
      const py = (i * 59) % 320;
      ctx.fillRect(px, py, 26, 18);
    }

    // Horizontal cream architectural cornice bands separating floors
    const drawCornice = (y: number, h: number) => {
      ctx.fillStyle = '#efe5ca';
      ctx.fillRect(0, y, 512, h);
      ctx.fillStyle = 'rgba(54, 41, 24, 0.25)';
      ctx.fillRect(0, y + h, 512, 4);
    };
    drawCornice(8, 18);
    drawCornice(170, 14);
    drawCornice(326, 14);

    // Upper floor (3rd floor) tall French-colonial louvered teal shutters & fanlight
    const drawLouveredWindow = (wx: number, wy: number, ww: number, wh: number) => {
      // Frame recess shadow
      ctx.fillStyle = '#2d2318';
      ctx.fillRect(wx - 4, wy - 4, ww + 8, wh + 8);
      // Warm cream frame
      ctx.fillStyle = '#efe3c5';
      ctx.fillRect(wx, wy, ww, wh);
      // Interior warm room / glass panes
      ctx.fillStyle = variant === 1 ? '#d49d46' : '#263438';
      ctx.fillRect(wx + 12, wy + 12, ww - 24, wh - 24);
      // Open teal shutters flanking left & right
      ctx.fillStyle = '#0e6a6f';
      ctx.fillRect(wx - 24, wy + 4, 24, wh - 8);
      ctx.fillRect(wx + ww, wy + 4, 24, wh - 8);
      // Horizontal louver slats
      ctx.fillStyle = '#074347';
      for (let sy = wy + 10; sy < wy + wh - 10; sy += 9) {
        ctx.fillRect(wx - 21, sy, 18, 3);
        ctx.fillRect(wx + ww + 3, sy, 18, 3);
      }
      // Window pane grid
      ctx.fillStyle = '#efe3c5';
      ctx.fillRect(wx + ww / 2 - 2, wy + 10, 4, wh - 20);
      ctx.fillRect(wx + 10, wy + wh / 2 - 2, ww - 20, 4);
    };

    drawLouveredWindow(82, 52, 92, 98);
    drawLouveredWindow(338, 52, 92, 98);
    if (variant !== 2) {
      drawLouveredWindow(210, 52, 92, 98);
    }

    // 2nd floor windows + AC unit + wrought-iron balcony railing silhouette
    drawLouveredWindow(84, 206, 98, 102);
    drawLouveredWindow(330, 206, 98, 102);

    // Outdoor AC condenser box on facade (iconic Scenes/1731379313)
    ctx.fillStyle = '#ddd7c8';
    ctx.fillRect(222, 224, 68, 44);
    ctx.strokeStyle = '#666055';
    ctx.lineWidth = 3;
    ctx.strokeRect(222, 224, 68, 44);
    ctx.fillStyle = '#2d3236';
    ctx.beginPath();
    ctx.arc(248, 246, 15, 0, Math.PI * 2);
    ctx.fill();

    // Ground floor (Street level): Warm glowing Vietnamese cafe / craft storefront
    ctx.fillStyle = '#3c2a1b';
    ctx.fillRect(28, 352, 456, 160);
    // Warm shop interior glow
    const shopGrad = ctx.createLinearGradient(0, 358, 0, 512);
    shopGrad.addColorStop(0, '#f5c26b');
    shopGrad.addColorStop(0.65, '#c77a32');
    shopGrad.addColorStop(1, '#5d341a');
    ctx.fillStyle = shopGrad;
    ctx.fillRect(54, 366, 404, 146);

    // Shop wooden counter, shelves & warm hanging lanterns
    ctx.fillStyle = '#472b16';
    ctx.fillRect(54, 448, 404, 18);
    ctx.fillStyle = '#2b1b0f';
    ctx.fillRect(54, 466, 404, 46);
    for (const lx of [128, 256, 384]) {
      ctx.fillStyle = '#332215';
      ctx.fillRect(lx - 2, 366, 4, 22);
      ctx.fillStyle = '#ffe596';
      ctx.beginPath();
      ctx.arc(lx, 396, 12, 0, Math.PI * 2);
      ctx.fill();
    }

    // Folding accordion metal/wooden shop side pillars
    ctx.fillStyle = '#0d5e63';
    ctx.fillRect(36, 358, 26, 154);
    ctx.fillRect(450, 358, 26, 154);
    ctx.fillStyle = '#8b5e34';
    for (let px = 64; px < 92; px += 8) {
      ctx.fillRect(px, 362, 4, 150);
    }
    for (let px = 420; px < 448; px += 8) {
      ctx.fillRect(px, 362, 4, 150);
    }
  }
  return finalizeTexture(canvas);
}

/**
 * French-colonial Hanoi boulevard villa facade texture for Stage 2 (Tràng Tiền / Hàng Khay style).
 */
export function createColonialFacadeTexture(variant: 0 | 1): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(512, 512);
  if (ctx) {
    ctx.fillStyle = variant === 0 ? '#e5d3a7' : '#d8b566';
    ctx.fillRect(0, 0, 512, 512);

    // Stone base plinth
    ctx.fillStyle = '#9d9381';
    ctx.fillRect(0, 456, 512, 56);

    // White classical cornice & stringcourse
    ctx.fillStyle = '#f5ecd4';
    ctx.fillRect(0, 12, 512, 22);
    ctx.fillRect(0, 246, 512, 16);

    // Classical vertical pilasters
    for (const px of [12, 164, 336, 480]) {
      ctx.fillStyle = '#f2e8cd';
      ctx.fillRect(px, 34, 20, 422);
      ctx.fillStyle = 'rgba(70, 58, 40, 0.2)';
      ctx.fillRect(px + 20, 34, 5, 422);
    }

    // Arched colonial windows on 2 levels
    const drawArchBay = (cx: number, topY: number, w: number, h: number) => {
      ctx.fillStyle = '#f5ecd4';
      ctx.beginPath();
      ctx.arc(cx, topY + w * 0.5, w * 0.5 + 8, Math.PI, 0);
      ctx.lineTo(cx + w * 0.5 + 8, topY + h);
      ctx.lineTo(cx - w * 0.5 - 8, topY + h);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#0d5e63';
      ctx.beginPath();
      ctx.arc(cx, topY + w * 0.5, w * 0.5, Math.PI, 0);
      ctx.lineTo(cx + w * 0.5, topY + h - 6);
      ctx.lineTo(cx - w * 0.5, topY + h - 6);
      ctx.closePath();
      ctx.fill();

      // Warm lit window panes inside shutter arch
      ctx.fillStyle = topY > 250 ? '#efb964' : '#2a3a3d';
      ctx.fillRect(cx - w * 0.34, topY + w * 0.48, w * 0.68, h - w * 0.55);
      ctx.fillStyle = '#f5ecd4';
      ctx.fillRect(cx - 2, topY + w * 0.45, 4, h - w * 0.5);
    };

    for (const cx of [98, 256, 414]) {
      drawArchBay(cx, 62, 68, 152);
      drawArchBay(cx, 286, 74, 164);
    }
  }
  return finalizeTexture(canvas);
}

/**
 * Modern Hanoi high-rise glass & concrete tower facade texture for Stage 3 skyline.
 */
export function createModernTowerTexture(variant: 0 | 1 | 2): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(512, 512);
  if (ctx) {
    const concretePalette = ['#b8b3a6', '#9da5ad', '#c8bba4'];
    ctx.fillStyle = concretePalette[variant];
    ctx.fillRect(0, 0, 512, 512);

    const cols = 6;
    const rows = 10;
    const padX = 16;
    const padY = 12;
    const cellW = (512 - padX * 2) / cols;
    const cellH = (512 - padY * 2) / rows;

    let seed = (variant + 1) * 7919;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };

    for (let r = 0; r < rows; r++) {
      // Concrete floor slab band
      ctx.fillStyle = 'rgba(255, 250, 240, 0.25)';
      ctx.fillRect(0, padY + r * cellH - 4, 512, 4);

      for (let c = 0; c < cols; c++) {
        const x = padX + c * cellW + 6;
        const y = padY + r * cellH + 6;
        const w = cellW - 12;
        const h = cellH - 12;

        const lit = rand() > 0.68;
        ctx.fillStyle = lit ? '#f2ca78' : variant === 1 ? '#36586e' : '#3d5159';
        ctx.fillRect(x, y, w, h);

        // Glass mullion & reflection diagonal
        ctx.fillStyle = 'rgba(220, 238, 248, 0.22)';
        ctx.fillRect(x + 2, y + 2, w * 0.42, h - 4);
      }
    }

    // Rooftop mechanical crown band
    ctx.fillStyle = '#53595f';
    ctx.fillRect(0, 0, 512, 16);
  }
  return finalizeTexture(canvas);
}

/**
 * Weathered terracotta yin-yang roof tiles texture.
 */
export function createTerracottaRoofTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(256, 256);
  if (ctx) {
    ctx.fillStyle = '#9e432b';
    ctx.fillRect(0, 0, 256, 256);

    for (let y = 0; y < 256; y += 24) {
      ctx.fillStyle = '#6f2918';
      ctx.fillRect(0, y, 256, 4);
      for (let x = 0; x < 256; x += 24) {
        const offset = (y / 24) % 2 === 0 ? 0 : 12;
        ctx.fillStyle = (x + y) % 48 === 0 ? '#b24f35' : '#8d3924';
        ctx.fillRect((x + offset) % 256, y + 4, 18, 18);
      }
    }
  }
  return finalizeTexture(canvas, 2, 2);
}

/**
 * Ancient weathered stone & moss texture for Ô Quan Chưởng gate.
 */
export function createOQuanChuongStoneTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(512, 512);
  if (ctx) {
    ctx.fillStyle = '#736552';
    ctx.fillRect(0, 0, 512, 512);

    let seed = 4242;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };

    const rowH = 32;
    for (let y = 0; y < 512; y += rowH) {
      const stagger = (y / rowH) % 2 === 0 ? 0 : 32;
      for (let x = -32; x < 512; x += 64) {
        const shade = Math.floor((rand() - 0.5) * 28);
        const r = 115 + shade;
        const g = 101 + shade;
        const b = 82 + shade;
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(x + stagger + 2, y + 2, 60, rowH - 4);
      }
    }

    // Subtle green-brown age patina
    ctx.fillStyle = 'rgba(65, 76, 48, 0.22)';
    for (let i = 0; i < 36; i++) {
      ctx.beginPath();
      ctx.arc(rand() * 512, rand() * 512, 10 + rand() * 24, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  return finalizeTexture(canvas, 2, 2);
}

/**
 * Leafy foliage texture for multi-puff Hanoi street canopies (eliminates smooth plastic balls).
 */
export function createLeafFoliageTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(256, 256);
  if (ctx) {
    ctx.fillStyle = '#9aa87a';
    ctx.fillRect(0, 0, 256, 256);

    let seed = 8899;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };

    for (let i = 0; i < 420; i++) {
      const x = rand() * 256;
      const y = rand() * 256;
      const r = 6 + rand() * 14;
      const tone = rand();
      ctx.fillStyle =
        tone > 0.65
          ? 'rgba(245, 240, 195, 0.72)'
          : tone > 0.25
            ? 'rgba(130, 165, 102, 0.72)'
            : 'rgba(54, 82, 44, 0.68)';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  return finalizeTexture(canvas, 1, 1);
}

/**
 * Tree bark texture for ancient Hanoi street tree trunks & branches.
 */
export function createTreeBarkTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(128, 256);
  if (ctx) {
    ctx.fillStyle = '#4c3a29';
    ctx.fillRect(0, 0, 128, 256);
    for (let x = 0; x < 128; x += 8) {
      ctx.fillStyle = x % 16 === 0 ? '#37281b' : '#5e4935';
      ctx.fillRect(x, 0, 5, 256);
    }
  }
  return finalizeTexture(canvas, 1, 2);
}

/**
 * Textured grass/park lawn & urban ground texture so horizon edges never look like flat mud.
 */
export function createGroundTerrainTexture(stageId: 1 | 2 | 3): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(256, 256);
  if (ctx) {
    ctx.fillStyle = stageId === 1 ? '#645c4c' : stageId === 2 ? '#4d6639' : '#556343';
    ctx.fillRect(0, 0, 256, 256);

    let seed = stageId * 313;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };

    for (let i = 0; i < 650; i++) {
      const x = rand() * 256;
      const y = rand() * 256;
      const w = 4 + rand() * 10;
      ctx.fillStyle =
        stageId === 1
          ? rand() > 0.5
            ? 'rgba(85, 78, 66, 0.45)'
            : 'rgba(118, 108, 90, 0.35)'
          : rand() > 0.5
            ? 'rgba(104, 134, 62, 0.42)'
            : 'rgba(54, 78, 38, 0.45)';
      ctx.fillRect(x, y, w, w);
    }
  }
  return finalizeTexture(canvas, 18, 18);
}

/**
 * Classical Neo-Renaissance Hanoi Opera House arched arcade facade texture.
 */
export function createOperaFacadeTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(1024, 512);
  if (ctx) {
    ctx.fillStyle = '#d9b55c';
    ctx.fillRect(0, 0, 1024, 512);

    // Cream stone lower arcade & upper cornice
    ctx.fillStyle = '#efe3c5';
    ctx.fillRect(0, 0, 1024, 48);
    ctx.fillRect(0, 248, 1024, 24);
    ctx.fillRect(0, 272, 1024, 240);

    // 7 grand arched balconies (upper) & grand entrance arches (lower)
    for (let i = 0; i < 7; i++) {
      const cx = 104 + i * 136;

      // Upper grand arched window
      ctx.fillStyle = '#efe3c5';
      ctx.beginPath();
      ctx.arc(cx, 128, 38, Math.PI, 0);
      ctx.lineTo(cx + 38, 232);
      ctx.lineTo(cx - 38, 232);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = i >= 2 && i <= 4 ? '#f3ca79' : '#2a2824';
      ctx.beginPath();
      ctx.arc(cx, 132, 28, Math.PI, 0);
      ctx.lineTo(cx + 28, 224);
      ctx.lineTo(cx - 28, 224);
      ctx.closePath();
      ctx.fill();

      // Lower arcade archway
      ctx.fillStyle = '#241e18';
      ctx.beginPath();
      ctx.arc(cx, 358, 34, Math.PI, 0);
      ctx.lineTo(cx + 34, 512);
      ctx.lineTo(cx - 34, 512);
      ctx.closePath();
      ctx.fill();
    }
  }
  return finalizeTexture(canvas);
}

/**
 * Architectural fluted & recessed panel texture for Tháp Đồng Hồ Bờ Hồ shaft.
 */
export function createClockTowerShaftTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(256, 512);
  if (ctx) {
    ctx.fillStyle = '#dcd7cb';
    ctx.fillRect(0, 0, 256, 512);

    // Subtle limestone masonry courses
    for (let y = 0; y < 512; y += 32) {
      ctx.fillStyle = y % 64 === 0 ? 'rgba(90, 82, 70, 0.14)' : 'rgba(255, 252, 244, 0.16)';
      ctx.fillRect(0, y, 256, 3);
    }

    // Recessed vertical architectural panels & dark ventilation louvers
    for (const px of [44, 148]) {
      ctx.fillStyle = '#b9b2a4';
      ctx.fillRect(px, 34, 64, 430);
      ctx.fillStyle = '#ece6d8';
      ctx.fillRect(px + 6, 40, 52, 418);
      for (let vy = 64; vy < 420; vy += 44) {
        ctx.fillStyle = '#2a3336';
        ctx.fillRect(px + 14, vy, 36, 24);
        ctx.fillStyle = '#536166';
        ctx.fillRect(px + 16, vy + 10, 32, 4);
      }
    }

    // Base plinth band
    ctx.fillStyle = '#9b9384';
    ctx.fillRect(0, 470, 256, 42);
  }
  return finalizeTexture(canvas);
}

/**
 * Soft feathered alpha-gradient texture for diagonal golden sunbeams in Stage 2
 * (zero hard rectangular borders against the sky).
 */
export function createSoftSunbeamTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(128, 256);
  if (ctx) {
    ctx.clearRect(0, 0, 128, 256);

    // Vertical fade from top-soft -> warm mid -> ground fade
    const vGrad = ctx.createLinearGradient(0, 0, 0, 256);
    vGrad.addColorStop(0.0, 'rgba(255, 232, 165, 0.0)');
    vGrad.addColorStop(0.25, 'rgba(255, 232, 165, 0.72)');
    vGrad.addColorStop(0.72, 'rgba(255, 224, 150, 0.45)');
    vGrad.addColorStop(1.0, 'rgba(255, 224, 150, 0.0)');
    ctx.fillStyle = vGrad;
    ctx.fillRect(0, 0, 128, 256);

    // Multiply horizontal bell-curve fade so side edges vanish completely
    ctx.globalCompositeOperation = 'destination-in';
    const hGrad = ctx.createLinearGradient(0, 0, 128, 0);
    hGrad.addColorStop(0.0, 'rgba(255,255,255,0)');
    hGrad.addColorStop(0.28, 'rgba(255,255,255,0.85)');
    hGrad.addColorStop(0.5, 'rgba(255,255,255,1)');
    hGrad.addColorStop(0.72, 'rgba(255,255,255,0.85)');
    hGrad.addColorStop(1.0, 'rgba(255,255,255,0)');
    ctx.fillStyle = hGrad;
    ctx.fillRect(0, 0, 128, 256);
    ctx.globalCompositeOperation = 'source-over';
  }
  return finalizeTexture(canvas);
}
