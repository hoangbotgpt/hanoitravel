import * as THREE from 'three';
import {
  DIFFICULTIES,
  OBSTACLE_TYPES,
  PLAYER_HALF_L,
  PLAYER_HALF_W,
  STAGES,
  getStageSpec,
  type DifficultyId,
  type ObstacleTypeId
} from '../config/gameConfig.ts';
import { checkAABBCollision } from '../core/collision.ts';
import {
  distanceToWorldZ,
  getRoadCenterX,
  getRoadElevationY,
  getRoadSlope,
  getRoadTangentYaw
} from '../core/roadMath.ts';
import {
  advanceObstacleDistance,
  computeOncomingSpeed,
  getLaneDirection,
  type TrafficDirection
} from '../core/trafficRules.ts';
import { TrafficVisualPool } from '../world/trafficModels.ts';
import type { PlayerPose } from './playerController.ts';

export interface ActiveObstacle {
  id: number;
  type: ObstacleTypeId;
  laneIndex: number;
  direction: TrafficDirection;
  distance: number;
  lateralOffset: number;
  crossDir: 1 | -1;
  speed: number;
  worldX: number;
  worldY: number;
  worldZ: number;
  mesh: THREE.Group;
}

const SLICE_HALF_WINDOW = 14;
const SAME_LANE_BUFFER = 10;

export class TrafficSpawner {
  private readonly scene: THREE.Scene;
  private readonly pool: TrafficVisualPool;

  private active: ActiveObstacle[] = [];
  private nextId = 1;
  private spawnTimer = 0;

  private stageId: 1 | 2 | 3 = 1;
  private stageLength: number = STAGES[0].length;
  private lanes: readonly number[] = STAGES[0].lanes;
  private roadWidth: number = STAGES[0].roadWidth;
  private trafficDensityScale: number = STAGES[0].trafficDensityScale;
  private allowedTypes: ObstacleTypeId[] = STAGES[0].allowedObstacles;
  private obstacleWeights: Partial<Record<ObstacleTypeId, number>> = STAGES[0].obstacleWeights;
  private difficultyId: DifficultyId = 'medium';

  constructor(scene: THREE.Scene, pool?: TrafficVisualPool) {
    this.scene = scene;
    this.pool = pool ?? new TrafficVisualPool();
  }

  public reset(stageId: 1 | 2 | 3, difficultyId: DifficultyId): void {
    this.clearAll();
    const stage = getStageSpec(stageId);
    this.stageId = stage.id;
    this.stageLength = stage.length;
    this.lanes = stage.lanes;
    this.roadWidth = stage.roadWidth;
    this.trafficDensityScale = stage.trafficDensityScale;
    this.allowedTypes = [...stage.allowedObstacles];
    this.obstacleWeights = { ...stage.obstacleWeights };
    this.difficultyId = difficultyId;
    this.spawnTimer = 0.35 / Math.sqrt(Math.max(0.5, this.trafficDensityScale));

    // Seed gentle opening traffic well ahead so stage starts lively yet safe
    this.seedInitialTraffic();
  }

  public seedAroundDistance(baseDist: number): void {
    const seeds: Array<{ dist: number; preferOncoming: boolean }> =
      this.lanes.length >= 6
        ? [
            { dist: baseDist + 52, preferOncoming: false },
            { dist: baseDist + 68, preferOncoming: true },
            { dist: baseDist + 86, preferOncoming: false },
            { dist: baseDist + 104, preferOncoming: true },
            { dist: baseDist + 122, preferOncoming: false },
            { dist: baseDist + 140, preferOncoming: true },
            { dist: baseDist + 158, preferOncoming: false },
            { dist: baseDist + 178, preferOncoming: true }
          ]
        : this.lanes.length === 2
          ? [
              { dist: baseDist + 54, preferOncoming: false },
              { dist: baseDist + 86, preferOncoming: true },
              { dist: baseDist + 116, preferOncoming: false },
              { dist: baseDist + 148, preferOncoming: true }
            ]
          : [
              { dist: baseDist + 64, preferOncoming: false },
              { dist: baseDist + 96, preferOncoming: true },
              { dist: baseDist + 120, preferOncoming: false },
              { dist: baseDist + 150, preferOncoming: true }
            ];

    for (const s of seeds) {
      if (s.dist > 15 && s.dist < this.stageLength - 35) {
        this.trySpawnAtDistance(s.dist, s.preferOncoming);
      }
    }
  }

  private seedInitialTraffic(): void {
    this.seedAroundDistance(0);
  }

  public clearAll(): void {
    for (const obs of this.active) {
      this.scene.remove(obs.mesh);
      this.pool.release(obs.type, obs.mesh);
    }
    this.active = [];
    this.spawnTimer = 0;
  }

  public clearNearPlayer(playerDistance: number, radius = 15): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const obs = this.active[i];
      if (Math.abs(obs.distance - playerDistance) <= radius) {
        this.scene.remove(obs.mesh);
        this.pool.release(obs.type, obs.mesh);
        this.active.splice(i, 1);
      }
    }
  }

  public update(dt: number, playerDistance: number): void {
    const safeDt = Math.min(0.05, Math.max(0, dt));
    const diff = DIFFICULTIES[this.difficultyId];
    const vendorCurbLimit = this.roadWidth * 0.5 - 1.15;

    // 1. Move existing 2-way obstacles & recycle ones passed behind camera
    for (let i = this.active.length - 1; i >= 0; i--) {
      const obs = this.active[i];
      const spec = OBSTACLE_TYPES[obs.type];

      if (obs.type === 'vendor') {
        // Vendor walks laterally across the 2-way road slowly
        const crossSpeed =
          spec.crossSpeed * (0.75 + 0.25 * diff.trafficSpeedScale);
        obs.lateralOffset += obs.crossDir * crossSpeed * safeDt;
        if (obs.lateralOffset >= vendorCurbLimit) {
          obs.lateralOffset = vendorCurbLimit;
          obs.crossDir = -1;
        } else if (obs.lateralOffset <= -vendorCurbLimit) {
          obs.lateralOffset = -vendorCurbLimit;
          obs.crossDir = 1;
        }
        obs.laneIndex = this.nearestLaneIndex(obs.lateralOffset);
      } else {
        // Prevent faster vehicles from overlapping slower vehicles traveling the same direction in same lane
        let effectiveSpeed = obs.speed;
        for (const other of this.active) {
          if (
            other.id !== obs.id &&
            other.type !== 'vendor' &&
            other.direction === obs.direction &&
            other.laneIndex === obs.laneIndex
          ) {
            const aheadGap =
              obs.direction === 1
                ? other.distance - obs.distance
                : obs.distance - other.distance;
            if (aheadGap > 0) {
              const otherSpec = OBSTACLE_TYPES[other.type];
              const minSep = spec.halfL + otherSpec.halfL + 3.5;
              if (aheadGap < minSep) {
                effectiveSpeed = Math.min(effectiveSpeed, other.speed);
              }
            }
          }
        }
        obs.distance = advanceObstacleDistance(
          obs.distance,
          effectiveSpeed,
          obs.direction,
          safeDt
        );
      }

      // Recycle shortly after passing behind chase camera or reaching road bounds
      if (
        obs.distance < playerDistance - 7.5 ||
        obs.distance > this.stageLength - 10 ||
        obs.distance < -10
      ) {
        this.scene.remove(obs.mesh);
        this.pool.release(obs.type, obs.mesh);
        this.active.splice(i, 1);
        continue;
      }

      this.syncObstacleTransform(obs);
    }

    // 2. Spawn new 2-way obstacles ahead while honoring per-stage road density & Safe Gap Rule
    this.spawnTimer -= safeDt;
    if (this.spawnTimer <= 0) {
      const effectiveInterval =
        diff.spawnInterval / Math.sqrt(Math.max(0.5, this.trafficDensityScale));
      const effectiveMaxActive = Math.max(
        4,
        Math.round(diff.maxActiveObstacles * this.trafficDensityScale)
      );
      this.spawnTimer = effectiveInterval * (0.85 + Math.random() * 0.3);
      if (this.active.length < effectiveMaxActive) {
        const counts = this.getDirectionCounts();
        const preferOncoming =
          counts.oncoming <= counts.sameDir ? Math.random() < 0.72 : Math.random() < 0.35;
        const aheadMin = preferOncoming ? 118 : 95;
        const spawnDist = playerDistance + aheadMin + Math.random() * 48;
        if (spawnDist < this.stageLength - 22) {
          this.trySpawnAtDistance(spawnDist, preferOncoming);
        }
      }
    }
  }

  private pickObstacleType(): ObstacleTypeId {
    const pool = this.allowedTypes;
    if (pool.length === 0) return 'motorbike';

    const fallbackWeights: Record<ObstacleTypeId, number> = {
      motorbike: 42,
      flower_bike: 16,
      vendor: 10,
      car: 14,
      bus: 10,
      truck: 8
    };

    let totalWeight = 0;
    for (const type of pool) {
      totalWeight += this.obstacleWeights[type] ?? fallbackWeights[type] ?? 10;
    }

    let roll = Math.random() * totalWeight;
    for (const type of pool) {
      roll -= this.obstacleWeights[type] ?? fallbackWeights[type] ?? 10;
      if (roll <= 0) return type;
    }
    return pool[0];
  }

  private trySpawnAtDistance(
    spawnDist: number,
    preferOncoming?: boolean
  ): boolean {
    const type = this.pickObstacleType();
    const spec = OBSTACLE_TYPES[type];
    const diff = DIFFICULTIES[this.difficultyId];
    const laneCount = this.lanes.length;
    const half = laneCount / 2;

    const leftLanes: number[] = [];
    const rightLanes: number[] = [];
    for (let i = 0; i < half; i++) leftLanes.push(i);
    for (let i = half; i < laneCount; i++) rightLanes.push(i);

    const shuffle = (arr: number[]) => {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const t = arr[i];
        arr[i] = arr[j];
        arr[j] = t;
      }
      return arr;
    };

    let candidateLanes: number[];
    if (type === 'flower_bike') {
      const outerLeft = 0;
      const outerRight = laneCount - 1;
      candidateLanes = preferOncoming ? [outerLeft, outerRight] : [outerRight, outerLeft];
    } else if (preferOncoming === true) {
      candidateLanes = [...shuffle([...leftLanes]), ...shuffle([...rightLanes])];
    } else if (preferOncoming === false) {
      candidateLanes = [...shuffle([...rightLanes]), ...shuffle([...leftLanes])];
    } else {
      candidateLanes = shuffle([...leftLanes, ...rightLanes]);
    }

    // Never spawn a vendor on top of a crowded slice (extra conservative on narrow 2-lane road)
    if (type === 'vendor') {
      const blockedCount = this.getBlockedLanesInSlice(
        spawnDist,
        spec.halfL + 10
      ).size;
      if (laneCount === 2 ? blockedCount >= 1 : blockedCount > 1) {
        return false;
      }
    }

    const chosenLane = candidateLanes.find((laneIdx) =>
      this.isLaneSafeToSpawn(laneIdx, spawnDist, spec.halfL, type)
    );

    if (chosenLane === undefined) {
      return false;
    }

    const vendorCurbLimit = this.roadWidth * 0.5 - 1.15;
    const direction = getLaneDirection(chosenLane, laneCount);
    const crossDir: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
    const lateralOffset =
      type === 'vendor'
        ? crossDir === 1
          ? -vendorCurbLimit + 0.35
          : vendorCurbLimit - 0.35
        : this.lanes[chosenLane];

    const speed =
      type === 'vendor'
        ? 0
        : direction === -1
          ? computeOncomingSpeed(spec.baseSpeed, diff.trafficSpeedScale)
          : spec.baseSpeed * diff.trafficSpeedScale;

    const mesh = this.pool.acquire(type);
    mesh.rotation.order = 'YXZ';

    const obs: ActiveObstacle = {
      id: this.nextId++,
      type,
      laneIndex: chosenLane,
      direction,
      distance: spawnDist,
      lateralOffset,
      crossDir,
      speed,
      worldX: 0,
      worldY: 0,
      worldZ: 0,
      mesh
    };

    this.syncObstacleTransform(obs);
    this.scene.add(mesh);
    this.active.push(obs);
    return true;
  }

  private getBlockedLanesInSlice(
    targetDist: number,
    targetHalfL: number
  ): Set<number> {
    const blocked = new Set<number>();
    const windowRadius = SLICE_HALF_WINDOW + targetHalfL;

    for (const obs of this.active) {
      const obsSpec = OBSTACLE_TYPES[obs.type];
      if (Math.abs(obs.distance - targetDist) <= windowRadius + obsSpec.halfL) {
        blocked.add(obs.laneIndex);
        if (obs.type === 'vendor') {
          // Vendor crosses horizontally so treat adjacent lane as busy too
          const neighbor = obs.laneIndex + obs.crossDir;
          if (neighbor >= 0 && neighbor < this.lanes.length) {
            blocked.add(neighbor);
          }
        }
      }
    }
    return blocked;
  }

  private isLaneSafeToSpawn(
    laneIdx: number,
    spawnDist: number,
    candHalfL: number,
    type: ObstacleTypeId
  ): boolean {
    const isHeavy = type === 'bus' || type === 'truck';
    // 1. Longitudinal clearance in the same lane so vehicles never overlap
    for (const obs of this.active) {
      const obsSpec = OBSTACLE_TYPES[obs.type];
      const minGap = candHalfL + obsSpec.halfL + SAME_LANE_BUFFER;
      if (
        obs.laneIndex === laneIdx &&
        Math.abs(obs.distance - spawnDist) < minGap
      ) {
        return false;
      }
      // Prevent back-to-back or adjacent-lane shoulder-to-shoulder buses/trucks blocking corridors
      if (isHeavy && (obs.type === 'bus' || obs.type === 'truck')) {
        if (obs.laneIndex === laneIdx && Math.abs(obs.distance - spawnDist) < 26) {
          return false;
        }
        if (Math.abs(obs.laneIndex - laneIdx) <= 1 && Math.abs(obs.distance - spawnDist) < 12) {
          return false;
        }
      }
    }

    // 2. Safe Gap Guarantee: at least 1 lane (2 lanes on 6-lane avenues) stays open in this Z slice
    const blocked = this.getBlockedLanesInSlice(spawnDist, candHalfL);
    blocked.add(laneIdx);
    const minOpenLanes = this.lanes.length >= 6 ? 2 : 1;
    const openLanes = this.lanes.length - blocked.size;
    return openLanes >= minOpenLanes;
  }

  private nearestLaneIndex(lateralOffset: number): number {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < this.lanes.length; i++) {
      const d = Math.abs(lateralOffset - this.lanes[i]);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    return bestIdx;
  }

  private syncObstacleTransform(obs: ActiveObstacle): void {
    const centerX = getRoadCenterX(this.stageId, obs.distance);
    obs.worldX = centerX + obs.lateralOffset;
    obs.worldY = getRoadElevationY(this.stageId, obs.distance);
    obs.worldZ = distanceToWorldZ(obs.distance);

    const tangentYaw = getRoadTangentYaw(this.stageId, obs.distance);
    const slope = getRoadSlope(this.stageId, obs.distance);

    obs.mesh.position.set(obs.worldX, obs.worldY, obs.worldZ);
    if (obs.type === 'vendor') {
      // Face lateral crossing direction across the road
      const crossYaw = obs.crossDir > 0 ? -Math.PI / 2 : Math.PI / 2;
      obs.mesh.rotation.set(0, tangentYaw + crossYaw, 0);
    } else if (obs.direction === -1) {
      // Oncoming left-lane traffic turns 180 deg to face player & pitches along overpass slope
      obs.mesh.rotation.set(-Math.atan(slope), tangentYaw + Math.PI, 0);
    } else {
      obs.mesh.rotation.set(Math.atan(slope), tangentYaw, 0);
    }
  }

  public getDirectionCounts(): { oncoming: number; sameDir: number } {
    let oncoming = 0;
    let sameDir = 0;
    for (const obs of this.active) {
      if (obs.type === 'vendor') continue;
      if (obs.direction === -1) oncoming += 1;
      else sameDir += 1;
    }
    return { oncoming, sameDir };
  }

  public getVehicleTypeCounts(): Record<ObstacleTypeId, number> {
    const counts: Record<ObstacleTypeId, number> = {
      motorbike: 0,
      flower_bike: 0,
      vendor: 0,
      car: 0,
      bus: 0,
      truck: 0
    };
    for (const obs of this.active) {
      counts[obs.type] += 1;
    }
    return counts;
  }

  public checkPlayerCollision(playerPose: PlayerPose): ActiveObstacle | null {
    for (const obs of this.active) {
      const spec = OBSTACLE_TYPES[obs.type];
      const hit = checkAABBCollision(
        playerPose.worldX,
        playerPose.worldZ,
        PLAYER_HALF_W,
        PLAYER_HALF_L,
        obs.worldX,
        obs.worldZ,
        spec.halfW,
        spec.halfL,
        playerPose.worldY,
        obs.worldY
      );
      if (hit) {
        return obs;
      }
    }
    return null;
  }

  public getActiveObstacles(): ReadonlyArray<ActiveObstacle> {
    return this.active;
  }

  public getActiveCount(): number {
    return this.active.length;
  }

  public dispose(): void {
    this.clearAll();
    this.pool.dispose();
  }
}
