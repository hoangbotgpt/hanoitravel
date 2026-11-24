import * as THREE from 'three';

interface SparkParticle {
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  active: boolean;
}

interface DustParticle {
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  baseScale: number;
  active: boolean;
}

/**
 * Pooled 3D impact VFX manager for Road Rash crash & asphalt slide feedback:
 * bright metallic sparks, skid dust clouds, and an expanding ground shockwave ring.
 */
export class CrashEffectsManager {
  private readonly scene: THREE.Scene;
  private readonly group = new THREE.Group();
  private readonly sparks: SparkParticle[] = [];
  private readonly dust: DustParticle[] = [];
  private readonly shockwaveRing: THREE.Mesh;
  private shockwaveLife = 0;
  private readonly shockwaveMaxLife = 0.28;

  private readonly sparkGeo: THREE.BufferGeometry;
  private readonly sparkMat: THREE.MeshBasicMaterial;
  private readonly dustGeo: THREE.BufferGeometry;
  private readonly dustMat: THREE.MeshBasicMaterial;
  private readonly ringGeo: THREE.BufferGeometry;
  private readonly ringMat: THREE.MeshBasicMaterial;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.group.name = 'CrashEffectsGroup';
    this.scene.add(this.group);

    this.sparkGeo = new THREE.BoxGeometry(0.032, 0.032, 0.28);
    this.sparkMat = new THREE.MeshBasicMaterial({ color: 0xffdf7a });

    this.dustGeo = new THREE.IcosahedronGeometry(0.16, 1);
    this.dustMat = new THREE.MeshBasicMaterial({
      color: 0xd6cab8,
      transparent: true,
      opacity: 0.22,
      depthWrite: false
    });

    for (let i = 0; i < 28; i++) {
      const m = new THREE.Mesh(this.sparkGeo, this.sparkMat);
      m.visible = false;
      this.group.add(m);
      this.sparks.push({
        mesh: m,
        vx: 0,
        vy: 0,
        vz: 0,
        life: 0,
        maxLife: 0.5,
        active: false
      });
    }

    for (let i = 0; i < 18; i++) {
      const m = new THREE.Mesh(this.dustGeo, this.dustMat);
      m.visible = false;
      this.group.add(m);
      this.dust.push({
        mesh: m,
        vx: 0,
        vy: 0,
        vz: 0,
        life: 0,
        maxLife: 0.7,
        baseScale: 1,
        active: false
      });
    }

    this.ringGeo = new THREE.RingGeometry(0.82, 0.94, 32);
    this.ringMat = new THREE.MeshBasicMaterial({
      color: 0xffb454,
      transparent: true,
      opacity: 0.44,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    this.shockwaveRing = new THREE.Mesh(this.ringGeo, this.ringMat);
    this.shockwaveRing.rotation.x = -Math.PI / 2;
    this.shockwaveRing.visible = false;
    this.group.add(this.shockwaveRing);
  }

  public spawnImpactBurst(x: number, y: number, z: number, fallSide: 1 | -1): void {
    // 1. Expanding asphalt shockwave ring
    this.shockwaveRing.position.set(x, y + 0.06, z);
    this.shockwaveRing.scale.setScalar(0.5);
    this.shockwaveRing.visible = true;
    this.shockwaveLife = this.shockwaveMaxLife;

    // 2. Burst of fiery orange/gold sparks shooting outward & forward
    let spawnedSparks = 0;
    for (const s of this.sparks) {
      if (s.active && spawnedSparks >= 20) continue;
      if (!s.active) {
        s.active = true;
        s.maxLife = 0.36 + Math.random() * 0.28;
        s.life = s.maxLife;
        s.mesh.position.set(
          x + (Math.random() - 0.5) * 0.5,
          y + 0.35 + Math.random() * 0.35,
          z + (Math.random() - 0.5) * 0.6
        );
        s.vx = fallSide * (1.8 + Math.random() * 3.4) + (Math.random() - 0.5) * 2.2;
        s.vy = 2.6 + Math.random() * 4.4;
        s.vz = -4.2 - Math.random() * 5.2;
        s.mesh.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
        s.mesh.scale.setScalar(0.85 + Math.random() * 0.65);
        s.mesh.visible = true;
        spawnedSparks += 1;
        if (spawnedSparks >= 22) break;
      }
    }

    // 3. Low radial road dust puffs (kept low & airy so fallen bike remains clear)
    let spawnedDust = 0;
    for (const d of this.dust) {
      if (!d.active) {
        d.active = true;
        d.maxLife = 0.45 + Math.random() * 0.28;
        d.life = d.maxLife;
        d.baseScale = 0.5 + Math.random() * 0.35;
        d.mesh.position.set(
          x + (Math.random() - 0.5) * 1.1,
          y + 0.14 + Math.random() * 0.14,
          z + (Math.random() - 0.5) * 0.9
        );
        d.vx = (Math.random() - 0.5) * 3.2;
        d.vy = 0.35 + Math.random() * 0.55;
        d.vz = -1.2 - Math.random() * 2.0;
        d.mesh.scale.setScalar(d.baseScale);
        d.mesh.visible = true;
        spawnedDust += 1;
        if (spawnedDust >= 8) break;
      }
    }
  }

  public spawnSkidSpark(x: number, y: number, z: number, fallSide: 1 | -1): void {
    let emitted = 0;
    for (const s of this.sparks) {
      if (!s.active) {
        s.active = true;
        s.maxLife = 0.22 + Math.random() * 0.16;
        s.life = s.maxLife;
        s.mesh.position.set(x + (Math.random() - 0.5) * 0.3, y + 0.14, z + (Math.random() - 0.5) * 0.4);
        s.vx = -fallSide * (1.2 + Math.random() * 2.2) + (Math.random() - 0.5) * 1.4;
        s.vy = 1.6 + Math.random() * 2.4;
        s.vz = 1.2 + Math.random() * 2.5;
        s.mesh.rotation.set(Math.random() * 3, Math.random() * 3, 0);
        s.mesh.scale.setScalar(0.8);
        s.mesh.visible = true;
        emitted += 1;
        if (emitted >= 2) break;
      }
    }

    for (const d of this.dust) {
      if (!d.active) {
        d.active = true;
        d.maxLife = 0.45 + Math.random() * 0.2;
        d.life = d.maxLife;
        d.baseScale = 0.55;
        d.mesh.position.set(x, y + 0.2, z);
        d.vx = (Math.random() - 0.5) * 1.2;
        d.vy = 0.7 + Math.random() * 0.8;
        d.vz = 0.8;
        d.mesh.scale.setScalar(d.baseScale);
        d.mesh.visible = true;
        break;
      }
    }
  }

  public update(dt: number): void {
    const safeDt = Math.min(0.05, Math.max(0, dt));
    if (safeDt <= 0) return;

    if (this.shockwaveLife > 0) {
      this.shockwaveLife = Math.max(0, this.shockwaveLife - safeDt);
      const t = 1 - this.shockwaveLife / this.shockwaveMaxLife;
      const scale = 0.45 + t * 2.1;
      this.shockwaveRing.scale.setScalar(scale);
      this.ringMat.opacity = Math.max(0, 0.44 * (1 - t));
      if (this.shockwaveLife === 0) {
        this.shockwaveRing.visible = false;
      }
    }

    for (const s of this.sparks) {
      if (!s.active) continue;
      s.life -= safeDt;
      if (s.life <= 0) {
        s.active = false;
        s.mesh.visible = false;
        continue;
      }
      s.vy -= 14.5 * safeDt;
      s.mesh.position.x += s.vx * safeDt;
      s.mesh.position.y += s.vy * safeDt;
      s.mesh.position.z += s.vz * safeDt;
      if (s.mesh.position.y < 0.05 && s.vy < 0) {
        s.vy *= -0.45;
        s.mesh.position.y = 0.05;
      }
      const ratio = s.life / s.maxLife;
      s.mesh.scale.set(ratio, ratio, 0.6 + ratio * 0.8);
    }

    for (const d of this.dust) {
      if (!d.active) continue;
      d.life -= safeDt;
      if (d.life <= 0) {
        d.active = false;
        d.mesh.visible = false;
        continue;
      }
      const prog = 1 - d.life / d.maxLife;
      d.mesh.position.x += d.vx * safeDt;
      d.mesh.position.y += d.vy * safeDt;
      d.mesh.position.z += d.vz * safeDt;
      d.mesh.scale.setScalar(d.baseScale * (1 + prog * 1.45));
      d.mesh.rotation.y += safeDt * 1.5;
    }
  }

  public clear(): void {
    this.shockwaveLife = 0;
    this.shockwaveRing.visible = false;
    for (const s of this.sparks) {
      s.active = false;
      s.mesh.visible = false;
    }
    for (const d of this.dust) {
      d.active = false;
      d.mesh.visible = false;
    }
  }

  public dispose(): void {
    this.clear();
    this.scene.remove(this.group);
    this.sparkGeo.dispose();
    this.sparkMat.dispose();
    this.dustGeo.dispose();
    this.dustMat.dispose();
    this.ringGeo.dispose();
    this.ringMat.dispose();
  }
}
