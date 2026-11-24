import * as THREE from 'three';
import { HANOI_PALETTE } from '../config/artPalette.ts';
import { OBSTACLE_TYPES, type ObstacleTypeId } from '../config/gameConfig.ts';

function createBusSignTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#181a1d';
    ctx.fillRect(0, 0, 128, 64);
    ctx.strokeStyle = '#f59f00';
    ctx.lineWidth = 4;
    ctx.strokeRect(4, 4, 120, 56);
    ctx.fillStyle = '#ff3b30';
    ctx.font = 'bold 42px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('14', 64, 34);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createTaxiRoofTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#fff3bf';
    ctx.fillRect(0, 0, 128, 64);
    ctx.fillStyle = '#22272a';
    ctx.font = 'bold 34px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('TAXI', 64, 34);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Shared geometry/material pool for all 5 Hanoi traffic & obstacle types:
 * motorbike, flower_bike, vendor, car, bus.
 * Every mesh is grounded at y = 0, centered in X/Z, facing -Z.
 */
export class TrafficVisualPool {
  private readonly pools: Record<ObstacleTypeId, THREE.Group[]> = {
    motorbike: [],
    flower_bike: [],
    vendor: [],
    car: [],
    bus: [],
    truck: []
  };

  private readonly disposables: Array<{ dispose: () => void }> = [];
  private readonly mats: Record<string, THREE.Material>;
  private readonly geos: Record<string, THREE.BufferGeometry>;
  private motorbikeColorVariant = 0;
  private carColorVariant = 0;
  private truckVariant = 0;

  constructor() {
    const track = <T extends { dispose: () => void }>(res: T): T => {
      this.disposables.push(res);
      return res;
    };

    const busLedTex = track(createBusSignTexture());
    const taxiSignTex = track(createTaxiRoofTexture());

    this.mats = {
      tire: track(new THREE.MeshStandardMaterial({ color: 0x1d2024, roughness: 0.85 })),
      chrome: track(
        new THREE.MeshStandardMaterial({
          color: 0xd8dce0,
          roughness: 0.2,
          metalness: 0.88,
          envMapIntensity: 1.4
        })
      ),
      glass: track(
        new THREE.MeshStandardMaterial({
          color: 0x243442,
          roughness: 0.14,
          metalness: 0.55,
          envMapIntensity: 1.5
        })
      ),
      tailRed: track(new THREE.MeshBasicMaterial({ color: HANOI_PALETTE.busLedRed })),
      headLight: track(new THREE.MeshBasicMaterial({ color: HANOI_PALETTE.taxiRoofLight })),
      skin: track(new THREE.MeshStandardMaterial({ color: 0xe3b18a, roughness: 0.78 })),
      pants: track(new THREE.MeshStandardMaterial({ color: 0x262d38, roughness: 0.85 })),
      // Motorbike variants
      motoRed: track(
        new THREE.MeshStandardMaterial({ color: 0xc93b2b, roughness: 0.34, metalness: 0.28, envMapIntensity: 1.2 })
      ),
      motoCream: track(
        new THREE.MeshStandardMaterial({
          color: HANOI_PALETTE.oldQuarterCream,
          roughness: 0.38,
          metalness: 0.2,
          envMapIntensity: 1.2
        })
      ),
      motoTeal: track(
        new THREE.MeshStandardMaterial({
          color: HANOI_PALETTE.shutterTeal,
          roughness: 0.36,
          metalness: 0.26,
          envMapIntensity: 1.2
        })
      ),
      helmetWhite: track(new THREE.MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.35 })),
      helmetBlue: track(new THREE.MeshStandardMaterial({ color: HANOI_PALETTE.busBlue, roughness: 0.35 })),
      shirtNavy: track(new THREE.MeshStandardMaterial({ color: 0x2d4868, roughness: 0.8 })),
      shirtCream: track(new THREE.MeshStandardMaterial({ color: 0xe8d9be, roughness: 0.8 })),
      // Flower bike
      bikeFrame: track(new THREE.MeshStandardMaterial({ color: HANOI_PALETTE.shutterTealDark, roughness: 0.5 })),
      newspaper: track(new THREE.MeshStandardMaterial({ color: HANOI_PALETTE.oldQuarterCream, roughness: 0.88 })),
      lotusPink: track(new THREE.MeshStandardMaterial({ color: HANOI_PALETTE.flowerLotusPink, roughness: 0.75 })),
      sunYellow: track(new THREE.MeshStandardMaterial({ color: HANOI_PALETTE.flowerSunYellow, roughness: 0.72 })),
      flowerWhite: track(new THREE.MeshStandardMaterial({ color: HANOI_PALETTE.flowerWhite, roughness: 0.72 })),
      foliage: track(new THREE.MeshStandardMaterial({ color: HANOI_PALETTE.foliageGreen, roughness: 0.85 })),
      // Vendor
      conicalHat: track(new THREE.MeshStandardMaterial({ color: HANOI_PALETTE.conicalHatStraw, roughness: 0.82 })),
      bamboo: track(new THREE.MeshStandardMaterial({ color: HANOI_PALETTE.basketBamboo, roughness: 0.85 })),
      vendorTunic: track(new THREE.MeshStandardMaterial({ color: 0x9e3e2d, roughness: 0.82 })),
      // Car / Taxi
      taxiYellow: track(
        new THREE.MeshStandardMaterial({
          color: HANOI_PALETTE.taxiYellow,
          roughness: 0.32,
          metalness: 0.3,
          envMapIntensity: 1.3
        })
      ),
      taxiSilver: track(
        new THREE.MeshStandardMaterial({
          color: HANOI_PALETTE.taxiSilver,
          roughness: 0.28,
          metalness: 0.45,
          envMapIntensity: 1.35
        })
      ),
      carNavy: track(
        new THREE.MeshStandardMaterial({
          color: 0x2b3e56,
          roughness: 0.3,
          metalness: 0.42,
          envMapIntensity: 1.35
        })
      ),
      carPearl: track(
        new THREE.MeshStandardMaterial({
          color: 0xeae7de,
          roughness: 0.28,
          metalness: 0.32,
          envMapIntensity: 1.35
        })
      ),
      taxiRoofSign: track(new THREE.MeshBasicMaterial({ map: taxiSignTex })),
      // Bus #14 & Cargo Truck
      busBlue: track(
        new THREE.MeshStandardMaterial({
          color: HANOI_PALETTE.busBlue,
          roughness: 0.38,
          metalness: 0.22,
          envMapIntensity: 1.1
        })
      ),
      busWhite: track(new THREE.MeshStandardMaterial({ color: HANOI_PALETTE.busWhite, roughness: 0.42 })),
      busStripe: track(new THREE.MeshStandardMaterial({ color: HANOI_PALETTE.busStripeYellow, roughness: 0.42 })),
      busLed: track(new THREE.MeshBasicMaterial({ map: busLedTex })),
      truckCabBlue: track(
        new THREE.MeshStandardMaterial({
          color: 0x1e5c94,
          roughness: 0.34,
          metalness: 0.32,
          envMapIntensity: 1.25
        })
      ),
      truckCabWhite: track(
        new THREE.MeshStandardMaterial({
          color: 0xece9e0,
          roughness: 0.36,
          metalness: 0.2,
          envMapIntensity: 1.2
        })
      ),
      truckCargoSilver: track(
        new THREE.MeshStandardMaterial({
          color: 0xd4d9de,
          roughness: 0.42,
          metalness: 0.48,
          envMapIntensity: 1.25
        })
      ),
      truckCargoCanvas: track(
        new THREE.MeshStandardMaterial({
          color: 0x2f6b55,
          roughness: 0.78,
          metalness: 0.08
        })
      ),
      truckStripeAmber: track(
        new THREE.MeshStandardMaterial({
          color: 0xe8ad28,
          roughness: 0.45
        })
      ),
      truckRib: track(
        new THREE.MeshStandardMaterial({
          color: 0x5c646d,
          roughness: 0.55,
          metalness: 0.35
        })
      )
    };

    const motoWheel = track(new THREE.CylinderGeometry(0.27, 0.27, 0.1, 12));
    motoWheel.rotateZ(Math.PI / 2);

    const bikeWheel = track(new THREE.TorusGeometry(0.32, 0.032, 6, 14));
    bikeWheel.rotateY(Math.PI / 2);

    const carWheel = track(new THREE.CylinderGeometry(0.34, 0.34, 0.22, 14));
    carWheel.rotateZ(Math.PI / 2);

    const busWheel = track(new THREE.CylinderGeometry(0.5, 0.5, 0.3, 14));
    busWheel.rotateZ(Math.PI / 2);

    this.geos = {
      box: track(new THREE.BoxGeometry(1, 1, 1)),
      sphere: track(new THREE.SphereGeometry(1, 10, 8)),
      cyl: track(new THREE.CylinderGeometry(1, 1, 1, 10)),
      cone: track(new THREE.ConeGeometry(1, 1, 12)),
      motoWheel,
      bikeWheel,
      carWheel,
      busWheel,
      plane: track(new THREE.PlaneGeometry(1, 1))
    };

    this.prewarm();
  }

  private prewarm(): void {
    const counts: Record<ObstacleTypeId, number> = {
      motorbike: 10,
      flower_bike: 5,
      vendor: 4,
      car: 12,
      bus: 8,
      truck: 8
    };
    (Object.keys(counts) as ObstacleTypeId[]).forEach((type) => {
      for (let i = 0; i < counts[type]; i++) {
        this.pools[type].push(this.createVisual(type));
      }
    });
  }

  public acquire(type: ObstacleTypeId): THREE.Group {
    const pool = this.pools[type];
    const obj = pool.pop() ?? this.createVisual(type);
    obj.visible = true;
    obj.rotation.set(0, 0, 0);
    return obj;
  }

  public release(type: ObstacleTypeId, obj: THREE.Group): void {
    obj.visible = false;
    this.pools[type].push(obj);
  }

  private createVisual(type: ObstacleTypeId): THREE.Group {
    switch (type) {
      case 'motorbike':
        return this.buildMotorbike();
      case 'flower_bike':
        return this.buildFlowerBike();
      case 'vendor':
        return this.buildVendor();
      case 'car':
        return this.buildCar();
      case 'bus':
        return this.buildBus();
      case 'truck':
        return this.buildTruck();
    }
  }

  private finalizeGroup(group: THREE.Group): THREE.Group {
    group.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    return group;
  }

  private buildMotorbike(): THREE.Group {
    const g = new THREE.Group();
    const spec = OBSTACLE_TYPES.motorbike; // halfW: 0.55, halfL: 1.15
    const bodyMats = [this.mats.motoRed, this.mats.motoCream, this.mats.motoTeal];
    const bodyMat = bodyMats[this.motorbikeColorVariant++ % bodyMats.length];
    const shirtMat = this.motorbikeColorVariant % 2 === 0 ? this.mats.shirtNavy : this.mats.shirtCream;
    const helmetMat = this.motorbikeColorVariant % 2 === 0 ? this.mats.helmetWhite : this.mats.helmetBlue;

    // Wheels
    for (const z of [-0.74, 0.74]) {
      const w = new THREE.Mesh(this.geos.motoWheel, this.mats.tire);
      w.position.set(0, 0.27, z);
      g.add(w);
    }

    // Chassis + front fairing + seat
    const body = new THREE.Mesh(this.geos.box, bodyMat);
    body.scale.set(0.36, 0.4, 1.38);
    body.position.set(0, 0.56, 0.04);
    g.add(body);

    const frontShield = new THREE.Mesh(this.geos.box, bodyMat);
    frontShield.scale.set(0.4, 0.64, 0.24);
    frontShield.position.set(0, 0.72, -0.56);
    frontShield.rotation.x = 0.2;
    g.add(frontShield);

    const bar = new THREE.Mesh(this.geos.box, this.mats.chrome);
    bar.scale.set(Math.min(0.76, spec.halfW * 1.4), 0.05, 0.06);
    bar.position.set(0, 1.05, -0.48);
    g.add(bar);

    const seat = new THREE.Mesh(this.geos.box, this.mats.tire);
    seat.scale.set(0.32, 0.12, 0.68);
    seat.position.set(0, 0.78, 0.22);
    g.add(seat);

    const taillight = new THREE.Mesh(this.geos.box, this.mats.tailRed);
    taillight.scale.set(0.16, 0.07, 0.05);
    taillight.position.set(0, 0.72, spec.halfL * 0.85);
    g.add(taillight);

    // Bright front headlight so oncoming motorbikes stand out sharply
    const headlight = new THREE.Mesh(this.geos.sphere, this.mats.headLight);
    headlight.scale.set(0.11, 0.09, 0.06);
    headlight.position.set(0, 0.88, -0.68);
    g.add(headlight);

    // Commuter Rider
    const torso = new THREE.Mesh(this.geos.box, shirtMat);
    torso.scale.set(0.38, 0.5, 0.24);
    torso.position.set(0, 1.08, 0.12);
    torso.rotation.x = -0.18;
    g.add(torso);

    const head = new THREE.Mesh(this.geos.sphere, this.mats.skin);
    head.scale.setScalar(0.12);
    head.position.set(0, 1.42, 0.04);
    g.add(head);

    const helmet = new THREE.Mesh(this.geos.sphere, helmetMat);
    helmet.scale.set(0.14, 0.12, 0.14);
    helmet.position.set(0, 1.46, 0.04);
    g.add(helmet);

    return this.finalizeGroup(g);
  }

  private buildFlowerBike(): THREE.Group {
    const g = new THREE.Group();
    const spec = OBSTACLE_TYPES.flower_bike; // halfW: 0.65, halfL: 1.05

    // Thin vintage bicycle wheels
    for (const z of [-0.66, 0.66]) {
      const w = new THREE.Mesh(this.geos.bikeWheel, this.mats.tire);
      w.position.set(0, 0.35, z);
      g.add(w);
    }

    // Frame & handlebars
    const frame = new THREE.Mesh(this.geos.box, this.mats.bikeFrame);
    frame.scale.set(0.08, 0.42, 1.18);
    frame.position.set(0, 0.58, 0);
    g.add(frame);

    const bar = new THREE.Mesh(this.geos.box, this.mats.chrome);
    bar.scale.set(0.58, 0.04, 0.05);
    bar.position.set(0, 1.04, -0.5);
    g.add(bar);

    // Rider with straw hat
    const legs = new THREE.Mesh(this.geos.box, this.mats.pants);
    legs.scale.set(0.28, 0.48, 0.22);
    legs.position.set(0, 0.66, -0.05);
    g.add(legs);

    const torso = new THREE.Mesh(this.geos.box, this.mats.shirtCream);
    torso.scale.set(0.36, 0.48, 0.22);
    torso.position.set(0, 1.1, -0.14);
    torso.rotation.x = -0.22;
    g.add(torso);

    const head = new THREE.Mesh(this.geos.sphere, this.mats.skin);
    head.scale.setScalar(0.115);
    head.position.set(0, 1.44, -0.2);
    g.add(head);

    const hat = new THREE.Mesh(this.geos.cone, this.mats.conicalHat);
    hat.scale.set(0.24, 0.14, 0.24);
    hat.position.set(0, 1.54, -0.2);
    g.add(hat);

    // Huge overflowing Hanoi flower basket on the rear rack (matching Scenes/1731379013)
    const basketWrap = new THREE.Mesh(this.geos.cyl, this.mats.newspaper);
    basketWrap.scale.set(spec.halfW * 0.85, 0.44, 0.42);
    basketWrap.position.set(0, 0.92, 0.56);
    g.add(basketWrap);

    const greenery = new THREE.Mesh(this.geos.sphere, this.mats.foliage);
    greenery.scale.set(spec.halfW * 0.92, 0.28, 0.48);
    greenery.position.set(0, 1.12, 0.56);
    g.add(greenery);

    const flowerClusters: Array<{ pos: [number, number, number]; r: number; mat: THREE.Material }> = [
      { pos: [-0.26, 1.24, 0.48], r: 0.22, mat: this.mats.lotusPink },
      { pos: [0.24, 1.26, 0.5], r: 0.22, mat: this.mats.sunYellow },
      { pos: [0, 1.32, 0.62], r: 0.24, mat: this.mats.flowerWhite },
      { pos: [-0.15, 1.18, 0.74], r: 0.18, mat: this.mats.sunYellow },
      { pos: [0.18, 1.18, 0.74], r: 0.18, mat: this.mats.lotusPink }
    ];
    for (const fl of flowerClusters) {
      const m = new THREE.Mesh(this.geos.sphere, fl.mat);
      m.scale.setScalar(fl.r);
      m.position.set(...fl.pos);
      g.add(m);
    }

    return this.finalizeGroup(g);
  }

  private buildVendor(): THREE.Group {
    const g = new THREE.Group();
    // trafficSpawner rotates vendor by ±90 deg so local -Z faces crossing direction (±X).
    // Shoulder pole runs front-to-back along Z within [-0.75, +0.75].

    // Legs & torso
    for (const sx of [-0.09, 0.09]) {
      const leg = new THREE.Mesh(this.geos.box, this.mats.pants);
      leg.scale.set(0.12, 0.76, 0.14);
      leg.position.set(sx, 0.38, 0);
      g.add(leg);
    }

    const tunic = new THREE.Mesh(this.geos.box, this.mats.vendorTunic);
    tunic.scale.set(0.34, 0.56, 0.22);
    tunic.position.set(0, 1.0, 0);
    g.add(tunic);

    const head = new THREE.Mesh(this.geos.sphere, this.mats.skin);
    head.scale.setScalar(0.115);
    head.position.set(0, 1.38, 0);
    g.add(head);

    // Iconic Vietnamese Nón Lá (conical hat)
    const nonLa = new THREE.Mesh(this.geos.cone, this.mats.conicalHat);
    nonLa.scale.set(0.28, 0.2, 0.28);
    nonLa.position.set(0, 1.5, 0);
    g.add(nonLa);

    // Shoulder pole (Đòn gánh) along Z + two suspended woven bamboo baskets (Thúng)
    const pole = new THREE.Mesh(this.geos.box, this.mats.bamboo);
    pole.scale.set(0.06, 0.05, 1.42);
    pole.position.set(0.14, 1.24, 0);
    g.add(pole);

    for (const bz of [-0.56, 0.56]) {
      const rope = new THREE.Mesh(this.geos.cyl, this.mats.bamboo);
      rope.scale.set(0.015, 0.62, 0.015);
      rope.position.set(0.14, 0.9, bz);
      g.add(rope);

      const basket = new THREE.Mesh(this.geos.cyl, this.mats.bamboo);
      basket.scale.set(0.28, 0.24, 0.28);
      basket.position.set(0.14, 0.48, bz);
      g.add(basket);

      const produce = new THREE.Mesh(
        this.geos.sphere,
        bz < 0 ? this.mats.sunYellow : this.mats.lotusPink
      );
      produce.scale.set(0.23, 0.14, 0.23);
      produce.position.set(0.14, 0.62, bz);
      g.add(produce);
    }

    return this.finalizeGroup(g);
  }

  private buildCar(): THREE.Group {
    const g = new THREE.Group();
    const spec = OBSTACLE_TYPES.car; // halfW: 1.05, halfL: 2.25
    const variant = this.carColorVariant++ % 4;
    const bodyMats = [
      this.mats.taxiYellow,
      this.mats.carNavy,
      this.mats.taxiSilver,
      this.mats.carPearl
    ];
    const bodyMat = bodyMats[variant];
    const isTaxi = variant === 0 || variant === 2;

    const width = spec.halfW * 1.66; // ~1.74m compact Hanoi sedan proportion
    const length = spec.halfL * 1.88; // ~4.23m

    // 4 wheels
    for (const sx of [-width * 0.48, width * 0.48]) {
      for (const sz of [-length * 0.31, length * 0.31]) {
        const w = new THREE.Mesh(this.geos.carWheel, this.mats.tire);
        w.position.set(sx, 0.32, sz);
        g.add(w);
      }
    }

    // Lower sedan chassis & bumpers
    const chassis = new THREE.Mesh(this.geos.box, bodyMat);
    chassis.scale.set(width, 0.48, length);
    chassis.position.set(0, 0.5, 0);
    g.add(chassis);

    const rearBumper = new THREE.Mesh(this.geos.box, this.mats.chrome);
    rearBumper.scale.set(width * 0.96, 0.12, 0.1);
    rearBumper.position.set(0, 0.36, length * 0.5 + 0.02);
    g.add(rearBumper);

    // Tapered green-tinted sedan cabin & sloped rear glass
    const cabin = new THREE.Mesh(this.geos.box, bodyMat);
    cabin.scale.set(width * 0.8, 0.46, length * 0.48);
    cabin.position.set(0, 0.96, 0.14);
    g.add(cabin);

    const glassBand = new THREE.Mesh(this.geos.box, this.mats.glass);
    glassBand.scale.set(width * 0.82, 0.34, length * 0.45);
    glassBand.position.set(0, 0.94, 0.14);
    g.add(glassBand);

    // Compact TAXI roof box only on Hanoi taxi variants
    if (isTaxi) {
      const roofBox = new THREE.Mesh(this.geos.box, this.mats.taxiRoofSign);
      roofBox.scale.set(0.48, 0.15, 0.22);
      roofBox.position.set(0, 1.26, -0.02);
      g.add(roofBox);
    }

    // Taillights (+Z) and Headlights (-Z)
    for (const sx of [-width * 0.36, width * 0.36]) {
      const tail = new THREE.Mesh(this.geos.box, this.mats.tailRed);
      tail.scale.set(0.28, 0.12, 0.06);
      tail.position.set(sx, 0.62, length * 0.5 + 0.01);
      g.add(tail);

      const head = new THREE.Mesh(this.geos.box, this.mats.headLight);
      head.scale.set(0.32, 0.15, 0.07);
      head.position.set(sx, 0.56, -length * 0.5 - 0.02);
      g.add(head);
    }

    const frontBumper = new THREE.Mesh(this.geos.box, this.mats.chrome);
    frontBumper.scale.set(width * 0.96, 0.12, 0.1);
    frontBumper.position.set(0, 0.36, -length * 0.5 - 0.02);
    g.add(frontBumper);

    return this.finalizeGroup(g);
  }

  private buildBus(): THREE.Group {
    const g = new THREE.Group();
    const spec = OBSTACLE_TYPES.bus; // halfW: 1.3, halfL: 4.3
    const width = spec.halfW * 1.9; // ~2.47m
    const length = spec.halfL * 1.94; // ~8.34m

    // Wheels
    for (const sx of [-width * 0.47, width * 0.47]) {
      for (const sz of [-length * 0.32, length * 0.32]) {
        const w = new THREE.Mesh(this.geos.busWheel, this.mats.tire);
        w.position.set(sx, 0.5, sz);
        g.add(w);
      }
    }

    // Hanoi Bus #14 Lower Blue Body + Upper White Cabin + Yellow Stripe
    const lowerBody = new THREE.Mesh(this.geos.box, this.mats.busBlue);
    lowerBody.scale.set(width, 1.25, length);
    lowerBody.position.set(0, 1.05, 0);
    g.add(lowerBody);

    const stripe = new THREE.Mesh(this.geos.box, this.mats.busStripe);
    stripe.scale.set(width + 0.03, 0.16, length + 0.02);
    stripe.position.set(0, 1.68, 0);
    g.add(stripe);

    const upperBody = new THREE.Mesh(this.geos.box, this.mats.busWhite);
    upperBody.scale.set(width * 0.98, 1.35, length * 0.98);
    upperBody.position.set(0, 2.38, 0);
    g.add(upperBody);

    const windowBand = new THREE.Mesh(this.geos.box, this.mats.glass);
    windowBand.scale.set(width * 0.995, 0.92, length * 0.94);
    windowBand.position.set(0, 2.36, 0);
    g.add(windowBand);

    // Roof AC pods
    for (const az of [-1.4, 1.4]) {
      const ac = new THREE.Mesh(this.geos.box, this.mats.busWhite);
      ac.scale.set(1.4, 0.24, 1.5);
      ac.position.set(0, 3.16, az);
      g.add(ac);
    }

    // Iconic red LED "14" route plate on back (+Z) & front (-Z)
    const rearLed = new THREE.Mesh(this.geos.plane, this.mats.busLed);
    rearLed.scale.set(0.86, 0.42, 1);
    rearLed.position.set(0, 2.86, length * 0.495);
    g.add(rearLed);

    const frontLed = new THREE.Mesh(this.geos.plane, this.mats.busLed);
    frontLed.scale.set(0.86, 0.42, 1);
    frontLed.rotation.y = Math.PI;
    frontLed.position.set(0, 2.86, -length * 0.495);
    g.add(frontLed);

    // Taillights (+Z) & bright Front Headlights (-Z) for oncoming visibility
    for (const sx of [-width * 0.38, width * 0.38]) {
      const tail = new THREE.Mesh(this.geos.box, this.mats.tailRed);
      tail.scale.set(0.32, 0.22, 0.06);
      tail.position.set(sx, 0.92, length * 0.5 + 0.02);
      g.add(tail);

      const head = new THREE.Mesh(this.geos.box, this.mats.headLight);
      head.scale.set(0.38, 0.22, 0.08);
      head.position.set(sx, 0.78, -length * 0.5 - 0.02);
      g.add(head);
    }

    return this.finalizeGroup(g);
  }

  private buildTruck(): THREE.Group {
    const g = new THREE.Group();
    const spec = OBSTACLE_TYPES.truck; // halfW: 1.32, halfL: 3.9
    const isSilverBox = this.truckVariant++ % 2 === 0;
    const cabMat = isSilverBox ? this.mats.truckCabBlue : this.mats.truckCabWhite;
    const cargoMat = isSilverBox ? this.mats.truckCargoSilver : this.mats.truckCargoCanvas;

    const width = spec.halfW * 1.86; // ~2.46m
    const length = spec.halfL * 1.9; // ~7.41m

    // 6 heavy tires: front steer axle + dual rear axles
    for (const sx of [-width * 0.44, width * 0.44]) {
      for (const sz of [-length * 0.34, length * 0.14, length * 0.37]) {
        const w = new THREE.Mesh(this.geos.busWheel, this.mats.tire);
        w.position.set(sx, 0.5, sz);
        g.add(w);
      }
    }

    // Heavy steel underframe
    const frame = new THREE.Mesh(this.geos.box, this.mats.tire);
    frame.scale.set(width * 0.72, 0.26, length * 0.94);
    frame.position.set(0, 0.62, 0.04);
    g.add(frame);

    // Forward cab (-Z)
    const cab = new THREE.Mesh(this.geos.box, cabMat);
    cab.scale.set(width * 0.9, 1.72, 1.84);
    cab.position.set(0, 1.54, -length * 0.34);
    g.add(cab);

    // Windshield & side cab glass
    const windshield = new THREE.Mesh(this.geos.box, this.mats.glass);
    windshield.scale.set(width * 0.84, 0.72, 1.76);
    windshield.position.set(0, 1.88, -length * 0.35);
    g.add(windshield);

    // Cab roof deflector & twin side mirrors
    const windDeflector = new THREE.Mesh(this.geos.box, cabMat);
    windDeflector.scale.set(width * 0.82, 0.34, 1.15);
    windDeflector.position.set(0, 2.54, -length * 0.28);
    windDeflector.rotation.x = 0.22;
    g.add(windDeflector);

    for (const sx of [-width * 0.52, width * 0.52]) {
      const mirror = new THREE.Mesh(this.geos.box, this.mats.chrome);
      mirror.scale.set(0.08, 0.32, 0.12);
      mirror.position.set(sx, 1.86, -length * 0.42);
      g.add(mirror);
    }

    // Front radiator grille, bumper & bright oncoming headlights (-Z)
    const grille = new THREE.Mesh(this.geos.box, this.mats.chrome);
    grille.scale.set(width * 0.62, 0.46, 0.06);
    grille.position.set(0, 1.14, -length * 0.465);
    g.add(grille);

    const frontBumper = new THREE.Mesh(this.geos.box, this.mats.chrome);
    frontBumper.scale.set(width * 0.94, 0.22, 0.14);
    frontBumper.position.set(0, 0.62, -length * 0.475);
    g.add(frontBumper);

    for (const sx of [-width * 0.35, width * 0.35]) {
      const head = new THREE.Mesh(this.geos.box, this.mats.headLight);
      head.scale.set(0.32, 0.2, 0.07);
      head.position.set(sx, 0.96, -length * 0.47);
      g.add(head);
    }

    // Tall rear cargo container (+Z)
    const cargoLen = length * 0.67;
    const cargoCenterZ = 0.94;
    const cargo = new THREE.Mesh(this.geos.box, cargoMat);
    cargo.scale.set(width, 2.26, cargoLen);
    cargo.position.set(0, 1.98, cargoCenterZ);
    g.add(cargo);

    // Side structural ribs & high-vis amber safety stripe
    const stripe = new THREE.Mesh(this.geos.box, this.mats.truckStripeAmber);
    stripe.scale.set(width + 0.03, 0.14, cargoLen + 0.02);
    stripe.position.set(0, 1.06, cargoCenterZ);
    g.add(stripe);

    for (let r = -2; r <= 2; r++) {
      const rib = new THREE.Mesh(this.geos.box, this.mats.truckRib);
      rib.scale.set(width + 0.04, 2.16, 0.1);
      rib.position.set(0, 1.98, cargoCenterZ + r * (cargoLen * 0.2));
      g.add(rib);
    }

    // Rear bumper bar & red taillights (+Z)
    const rearBumper = new THREE.Mesh(this.geos.box, this.mats.chrome);
    rearBumper.scale.set(width * 0.92, 0.16, 0.12);
    rearBumper.position.set(0, 0.56, length * 0.49);
    g.add(rearBumper);

    for (const sx of [-width * 0.38, width * 0.38]) {
      const tail = new THREE.Mesh(this.geos.box, this.mats.tailRed);
      tail.scale.set(0.34, 0.2, 0.06);
      tail.position.set(sx, 0.88, length * 0.5 + 0.01);
      g.add(tail);

      const topClearance = new THREE.Mesh(this.geos.box, this.mats.truckStripeAmber);
      topClearance.scale.set(0.16, 0.12, 0.06);
      topClearance.position.set(sx, 3.04, length * 0.5 + 0.01);
      g.add(topClearance);
    }

    return this.finalizeGroup(g);
  }

  public dispose(): void {
    for (const type of Object.keys(this.pools) as ObstacleTypeId[]) {
      this.pools[type] = [];
    }
    for (const item of this.disposables) {
      item.dispose();
    }
    this.disposables.length = 0;
  }
}
