import * as THREE from 'three';
import type { StageAtmosphere } from '../config/artPalette.ts';

/**
 * Generates an offline golden-hour Hanoi PMREM environment map for crisp
 * chrome, paint, windshield, and asphalt reflections with zero external HDR files.
 */
export function createHanoiEnvMap(
  renderer: THREE.WebGLRenderer,
  atmo: StageAtmosphere
): THREE.Texture {
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();

  const envScene = new THREE.Scene();
  const disposables: Array<{ dispose: () => void }> = [];
  const track = <T extends { dispose: () => void }>(res: T): T => {
    disposables.push(res);
    return res;
  };

  // Procedural sky dome inside PMREM capture scene
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const topHex = `#${atmo.skyTop.toString(16).padStart(6, '0')}`;
    const horizHex = `#${atmo.skyHorizon.toString(16).padStart(6, '0')}`;
    const grad = ctx.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0.0, topHex);
    grad.addColorStop(0.46, horizHex);
    grad.addColorStop(0.55, '#6a5948');
    grad.addColorStop(1.0, '#2c241d');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 128);
  }
  const skyTex = track(new THREE.CanvasTexture(canvas));
  skyTex.colorSpace = THREE.SRGBColorSpace;

  const skyDome = new THREE.Mesh(
    track(new THREE.SphereGeometry(28, 18, 12)),
    track(new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide }))
  );
  envScene.add(skyDome);

  // Warm golden-hour low sun card
  const sunDisc = new THREE.Mesh(
    track(new THREE.PlaneGeometry(14, 10)),
    track(new THREE.MeshBasicMaterial({ color: 0xffecc2, side: THREE.DoubleSide }))
  );
  sunDisc.position.set(-14, 7.5, -15);
  sunDisc.lookAt(0, 0, 0);
  envScene.add(sunDisc);

  // Warm Old Quarter shopfront bounce panels (left & right)
  const bounceMat = track(
    new THREE.MeshBasicMaterial({ color: 0xdba04c, side: THREE.DoubleSide })
  );
  for (const sx of [-1, 1]) {
    const panel = new THREE.Mesh(track(new THREE.PlaneGeometry(16, 6)), bounceMat);
    panel.position.set(sx * 16, 2.2, 0);
    panel.lookAt(0, 1.5, 0);
    envScene.add(panel);
  }

  // Cool azure zenith reflection strip so chrome highlights separate cleanly from warm sides
  const zenithCard = new THREE.Mesh(
    track(new THREE.PlaneGeometry(18, 18)),
    track(new THREE.MeshBasicMaterial({ color: 0x8bbad8, side: THREE.DoubleSide }))
  );
  zenithCard.position.set(0, 18, 0);
  zenithCard.rotation.x = Math.PI / 2;
  envScene.add(zenithCard);

  const renderTarget = pmrem.fromScene(envScene, 0.035);
  for (const item of disposables) {
    item.dispose();
  }
  pmrem.dispose();

  return renderTarget.texture;
}
