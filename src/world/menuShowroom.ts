import * as THREE from 'three';

/**
 * Menu "showroom" dressing for the selected bike: a slowly turning retro turntable
 * with a cement-tile (gach bong) pattern, warm key / rim lights that only exist on the
 * menu, and a tiny idle animation for the seated rider (head looks around).
 */
export class MenuShowroom {
  private readonly group = new THREE.Group();
  private readonly turntable = new THREE.Group();
  private readonly lights: THREE.Light[] = [];
  private readonly rimLight: THREE.SpotLight;
  private readonly keyLight: THREE.SpotLight;
  private elapsed = 0;
  private headBone: THREE.Object3D | null = null;
  private headBase = new THREE.Quaternion();
  private trackedBike: THREE.Object3D | null = null;

  constructor(private readonly scene: THREE.Scene) {
    this.group.name = 'MenuShowroom';

    // Turntable: dark plinth + tiled top + brass ring
    const plinth = new THREE.Mesh(
      new THREE.CylinderGeometry(1.42, 1.5, 0.1, 40),
      new THREE.MeshStandardMaterial({ color: 0x2a2320, roughness: 0.7 })
    );
    plinth.position.y = 0.05;
    plinth.receiveShadow = true;
    this.turntable.add(plinth);

    const top = new THREE.Mesh(
      new THREE.CylinderGeometry(1.36, 1.36, 0.02, 40),
      new THREE.MeshStandardMaterial({ map: createTileTexture(), roughness: 0.55 })
    );
    top.position.y = 0.105;
    top.receiveShadow = true;
    this.turntable.add(top);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.39, 0.025, 6, 48),
      new THREE.MeshStandardMaterial({ color: 0xe0a640, metalness: 0.7, roughness: 0.3 })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.1;
    this.turntable.add(ring);
    this.group.add(this.turntable);

    // Warm key light from the front-right and a golden rim from behind for a silhouette glow
    this.keyLight = new THREE.SpotLight(0xffe2b8, 9, 12, 0.55, 0.6, 1.4);
    this.keyLight.position.set(2.6, 3.6, 3.2);
    this.rimLight = new THREE.SpotLight(0xffb45e, 14, 12, 0.6, 0.7, 1.4);
    this.rimLight.position.set(-2.4, 2.4, -2.8);
    for (const l of [this.keyLight, this.rimLight]) {
      l.target = this.turntable;
      this.group.add(l);
      this.lights.push(l);
    }
    this.group.visible = false;
    scene.add(this.group);
  }

  /** Lifts the bike onto the turntable and places the showroom under it. */
  public place(bike: THREE.Object3D | null, x: number, groundY: number, z: number, yaw: number): void {
    this.group.position.set(x, groundY, z);
    this.turntable.rotation.y = yaw;
    if (bike) {
      bike.position.set(x, groundY + 0.115, z);
      bike.rotation.set(0, yaw, 0);
      if (bike !== this.trackedBike) this.trackBike(bike);
    }
  }

  private trackBike(bike: THREE.Object3D): void {
    this.restoreHead();
    this.trackedBike = bike;
    const seated = bike.getObjectByName('SeatedRider');
    this.headBone = seated?.getObjectByName('rider_head') ?? null;
    if (this.headBone) this.headBase.copy(this.headBone.quaternion);
  }

  private restoreHead(): void {
    if (this.headBone) this.headBone.quaternion.copy(this.headBase);
    this.headBone = null;
    this.trackedBike = null;
  }

  public setVisible(visible: boolean): void {
    if (this.group.visible === visible) return;
    this.group.visible = visible;
    if (!visible) this.restoreHead();
  }

  public update(dt: number): void {
    if (!this.group.visible) return;
    this.elapsed += dt;
    if (this.headBone) {
      // Idle: glance left/right at the street, with a small nod
      const t = this.elapsed;
      const turn = Math.sin(t * 0.7) * 0.32 + Math.sin(t * 1.9) * 0.05;
      const nod = Math.sin(t * 1.3 + 1) * 0.05;
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(nod, turn, 0, 'YXZ'));
      this.headBone.quaternion.copy(q).multiply(this.headBase);
    }
  }

  public dispose(): void {
    this.restoreHead();
    this.scene.remove(this.group);
    this.group.traverse((c) => {
      const m = c as THREE.Mesh;
      if (m.isMesh) {
        m.geometry.dispose();
        const mat = m.material as THREE.MeshStandardMaterial;
        mat.map?.dispose();
        mat.dispose();
      }
    });
  }
}

/** Hanoi cement tile (gach bong) pattern for the turntable top. */
function createTileTexture(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const tiles = 12;
    const t = size / tiles;
    for (let i = 0; i < tiles; i++) {
      for (let j = 0; j < tiles; j++) {
        const x = i * t;
        const y = j * t;
        ctx.fillStyle = (i + j) % 2 === 0 ? '#efe3c8' : '#e6d6b4';
        ctx.fillRect(x, y, t, t);
        // quarter-circle petals at the corners join into four-petal flowers across tiles
        ctx.fillStyle = '#b9583f';
        for (const [cx, cy, a0] of [
          [x, y, 0],
          [x + t, y, Math.PI / 2],
          [x + t, y + t, Math.PI],
          [x, y + t, Math.PI * 1.5]
        ]) {
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.arc(cx, cy, t * 0.3, a0, a0 + Math.PI / 2);
          ctx.closePath();
          ctx.fill();
        }
        // small teal diamond in the middle
        ctx.fillStyle = '#3c7f6b';
        ctx.beginPath();
        ctx.moveTo(x + t / 2, y + t * 0.32);
        ctx.lineTo(x + t * 0.68, y + t / 2);
        ctx.lineTo(x + t / 2, y + t * 0.68);
        ctx.lineTo(x + t * 0.32, y + t / 2);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#e3a744';
        ctx.beginPath();
        ctx.arc(x + t / 2, y + t / 2, t * 0.06, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(70,45,30,0.28)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x + 0.75, y + 0.75, t - 1.5, t - 1.5);
      }
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
