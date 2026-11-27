import * as THREE from 'three';
import {
  DIFFICULTIES,
  OBSTACLE_TYPES,
  PLAYER_HALF_L,
  PLAYER_HALF_W,
  STAGES,
  getStageSpec,
  type DifficultyId,
  type ObstacleTypeId,
  type StageId,
  type StageSpec
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
  getStageRouteFeatures,
  getTrafficLightState,
  type CrosswalkZone,
  type StageRouteFeatures
} from '../core/routeFeatures.ts';
import {
  canIntersectionPedestrianCross,
  checkEntitiesOverlap2D,
  computeRedLightCapSpeed,
  resolveTrafficNonPenetration
} from '../core/trafficPhysics.ts';
import {
  advanceObstacleDistance,
  buildStageTaxiSchedule,
  computeOncomingSpeed,
  getLaneDirection,
  isObstacleAllowedOnStage,
  type TaxiEncounterSlot,
  type TrafficDirection
} from '../core/trafficRules.ts';
import { TAXI_WHEEL_RADIUS } from '../world/taxiLoader.ts';
import { TrafficVisualPool } from '../world/trafficModels.ts';
import type { PlayerPose } from './playerController.ts';

export type RecklessPhase = 'cruise' | 'warning' | 'weaving' | 'done';

export interface ActiveObstacle {
  id: number;
  type: ObstacleTypeId;
  laneIndex: number;
  direction: TrafficDirection;
  distance: number;
  lateralOffset: number;
  crossDir: 1 | -1;
  speed: number;
  currentSpeed: number;
  halfW: number;
  halfL: number;
  worldX: number;
  worldY: number;
  worldZ: number;
  mesh: THREE.Group;
  crosswalkId?: number | null;
  intersectionId?: number | null;
  recklessPhase?: RecklessPhase;
  recklessTimer?: number;
  targetLaneIndex?: number;
  startLateral?: number;
  targetLateral?: number;
}

export interface CrossTrafficVehicle {
  id: number;
  type: 'car' | 'motorbike' | 'flower_bike';
  intersectionId: number;
  distance: number;
  lateralOffset: number;
  crossDir: 1 | -1;
  speed: number;
  currentSpeed: number;
  worldX: number;
  worldY: number;
  worldZ: number;
  mesh: THREE.Group;
}

export interface RearThreatInfo {
  active: boolean;
  distanceMeters: number;
  lateralDelta: number;
  isReckless: boolean;
}

const SLICE_HALF_WINDOW = 14;
const SAME_LANE_BUFFER = 10;
const RECKLESS_WARNING_DURATION = 0.55;
const RECKLESS_WEAVE_DURATION = 0.65;

const PEDESTRIAN_SET: ReadonlySet<ObstacleTypeId> = new Set([
  'vendor',
  'tourist',
  'office_worker'
]);

export function isPedestrianObstacle(type: ObstacleTypeId): boolean {
  return PEDESTRIAN_SET.has(type) || Boolean(OBSTACLE_TYPES[type].isPedestrian);
}

export class TrafficSpawner {
  private readonly scene: THREE.Scene;
  private readonly pool: TrafficVisualPool;

  private active: ActiveObstacle[] = [];
  private crossTraffic: CrossTrafficVehicle[] = [];
  private nextId = 1;
  private spawnTimer = 0;
  private crossSpawnCooldowns = new Map<number, number>();
  private onRecklessWarning?: () => void;

  private stageId: StageId = 1;
  private stageSpec: StageSpec = STAGES[0];
  private stageLength: number = STAGES[0].length;
  private lanes: readonly number[] = STAGES[0].lanes;
  private roadWidth: number = STAGES[0].roadWidth;
  private trafficDensityScale: number = STAGES[0].trafficDensityScale;
  private allowedTypes: ObstacleTypeId[] = STAGES[0].allowedObstacles;
  private obstacleWeights: Partial<Record<ObstacleTypeId, number>> = STAGES[0].obstacleWeights;
  private difficultyId: DifficultyId = 'medium';
  private stageTaxiQuota: 2 | 3 = STAGES[0].taxiCountPerStage;
  private taxisSpawnedInStage = 0;
  private taxiSchedule: TaxiEncounterSlot[] = [];
  private routeFeatures: StageRouteFeatures = getStageRouteFeatures(1);

  constructor(scene: THREE.Scene, pool?: TrafficVisualPool) {
    this.scene = scene;
    this.pool = pool ?? new TrafficVisualPool();
  }

  public setRecklessWarningCallback(cb?: () => void): void {
    this.onRecklessWarning = cb;
  }

  public setTaxiTemplate(template: THREE.Group): void {
    this.pool.setTaxiTemplate(template);
  }

  public setCarTemplates(templates: THREE.Group[]): void {
    this.pool.setCarTemplates(templates);
  }

  public addCarTemplates(templates: THREE.Group[]): void {
    this.pool.addCarTemplates(templates);
  }

  public setBusTemplate(template: THREE.Group): void {
    this.pool.setBusTemplate(template);
  }

  public setBusTemplates(templates: THREE.Group[]): void {
    this.pool.setBusTemplates(templates);
  }

  public addBusTemplates(templates: THREE.Group[]): void {
    this.pool.addBusTemplates(templates);
  }

  public setTruckTemplate(template: THREE.Group): void {
    this.pool.setTruckTemplate(template);
  }

  public setTruckTemplates(templates: THREE.Group[]): void {
    this.pool.setTruckTemplates(templates);
  }

  public addTruckTemplates(templates: THREE.Group[]): void {
    this.pool.addTruckTemplates(templates);
  }

  public setHeavyTruckTemplates(templates: THREE.Group[]): void {
    this.pool.setHeavyTruckTemplates(templates);
  }

  public addHeavyTruckTemplates(templates: THREE.Group[]): void {
    this.pool.addHeavyTruckTemplates(templates);
  }

  public reset(stageId: StageId, difficultyId: DifficultyId): void {
    this.clearAll();
    const stage = getStageSpec(stageId);
    this.stageId = stage.id;
    this.stageSpec = stage;
    this.stageLength = stage.length;
    this.lanes = stage.lanes;
    this.roadWidth = stage.roadWidth;
    this.trafficDensityScale = stage.trafficDensityScale;
    this.allowedTypes = stage.allowedObstacles.filter((t) =>
      isObstacleAllowedOnStage(t, stage)
    );
    this.obstacleWeights = { ...stage.obstacleWeights };
    this.difficultyId = difficultyId;
    this.stageTaxiQuota = stage.taxiCountPerStage;
    this.taxisSpawnedInStage = 0;
    this.taxiSchedule = buildStageTaxiSchedule(
      this.stageLength,
      this.stageTaxiQuota
    );
    this.routeFeatures = getStageRouteFeatures(stage.id);
    this.crossSpawnCooldowns.clear();
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
    // Let Encounter 0 claim a clean opening lane before regular traffic fills nearby slices
    this.trySpawnScheduledTaxis(0);
    this.seedAroundDistance(0);
  }

  public clearAll(): void {
    for (const obs of this.active) {
      this.setBlinkersVisible(obs.mesh, false);
      this.scene.remove(obs.mesh);
      this.pool.release(obs.type, obs.mesh);
    }
    this.active = [];

    for (const ct of this.crossTraffic) {
      this.scene.remove(ct.mesh);
      this.pool.release(ct.type, ct.mesh);
    }
    this.crossTraffic = [];
    this.crossSpawnCooldowns.clear();
    this.spawnTimer = 0;
  }

  public clearNearPlayer(playerDistance: number, radius = 15): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const obs = this.active[i];
      if (Math.abs(obs.distance - playerDistance) <= radius) {
        this.setBlinkersVisible(obs.mesh, false);
        this.scene.remove(obs.mesh);
        this.pool.release(obs.type, obs.mesh);
        this.active.splice(i, 1);
      }
    }
    for (let i = this.crossTraffic.length - 1; i >= 0; i--) {
      const ct = this.crossTraffic[i];
      if (Math.abs(ct.distance - playerDistance) <= radius) {
        this.scene.remove(ct.mesh);
        this.pool.release(ct.type, ct.mesh);
        this.crossTraffic.splice(i, 1);
      }
    }
  }

  public update(dt: number, playerDistance: number, elapsedTime = 0): void {
    const safeDt = Math.min(0.05, Math.max(0, dt));
    const diff = DIFFICULTIES[this.difficultyId];
    const halfRoad = this.roadWidth * 0.5;
    const sidewalkWaitX = halfRoad + 0.65;

    const isBoxBlocked = (zoneId: number): boolean =>
      this.crossTraffic.some(
        (ct) =>
          ct.intersectionId === zoneId &&
          Math.abs(ct.lateralOffset) < halfRoad + 2.5
      );

    // 1. Move existing obstacles with red-light compliance & yielding
    for (let i = this.active.length - 1; i >= 0; i--) {
      const obs = this.active[i];
      const spec = OBSTACLE_TYPES[obs.type];

      if (isPedestrianObstacle(obs.type)) {
        let canWalk = true;
        if (obs.intersectionId !== null && obs.intersectionId !== undefined) {
          const zone = this.routeFeatures.intersections.find(
            (z) => z.id === obs.intersectionId
          );
          if (zone) {
            const light = getTrafficLightState(zone, elapsedTime);
            canWalk = canIntersectionPedestrianCross(
              light,
              obs.lateralOffset,
              halfRoad
            );
          }
        } else {
          // Mid-block crosswalk pedestrian pauses briefly at curb/lane edge when a vehicle is close
          for (const veh of this.active) {
            if (veh.id === obs.id || isPedestrianObstacle(veh.type)) continue;
            if (
              Math.abs(veh.distance - obs.distance) < 16 &&
              Math.abs(veh.lateralOffset - obs.lateralOffset) < 2.2
            ) {
              canWalk = false;
              break;
            }
          }
        }

        if (canWalk) {
          const walkSpeed =
            spec.crossSpeed * (0.75 + 0.25 * diff.trafficSpeedScale);
          obs.currentSpeed = walkSpeed;
          obs.lateralOffset += obs.crossDir * walkSpeed * safeDt;
          if (obs.lateralOffset >= sidewalkWaitX) {
            obs.lateralOffset = sidewalkWaitX;
            obs.crossDir = -1;
          } else if (obs.lateralOffset <= -sidewalkWaitX) {
            obs.lateralOffset = -sidewalkWaitX;
            obs.crossDir = 1;
          }
        } else {
          obs.currentSpeed = 0;
        }
        obs.laneIndex = this.nearestLaneIndex(obs.lateralOffset);
      } else {
        if (obs.type === 'reckless_moto') {
          this.updateRecklessMotoBehavior(obs, playerDistance, safeDt);
        }

        let targetSpeed = obs.speed;

        // 1a. Red/yellow light & blocked-box compliance
        const redCap = computeRedLightCapSpeed({
          distance: obs.distance,
          direction: obs.direction,
          halfL: obs.halfL,
          desiredSpeed: obs.speed,
          intersections: this.routeFeatures.intersections,
          elapsedTime,
          boxBlockedByCrossTraffic: isBoxBlocked
        });
        targetSpeed = Math.min(targetSpeed, redCap.maxSpeed);

        // 1b. Yield to pedestrians crossing ahead in the same lateral corridor
        for (const other of this.active) {
          if (other.id === obs.id) continue;

          if (isPedestrianObstacle(other.type)) {
            if (Math.abs(other.lateralOffset) >= halfRoad + 0.15) {
              continue;
            }
            const aheadGap =
              obs.direction === 1
                ? other.distance - other.halfL - (obs.distance + obs.halfL)
                : obs.distance - obs.halfL - (other.distance + other.halfL);
            if (
              aheadGap > -0.3 &&
              aheadGap < 14 &&
              Math.abs(other.lateralOffset - obs.lateralOffset) <
                other.halfW + obs.halfW + 0.45
            ) {
              targetSpeed =
                aheadGap <= 2.2
                  ? 0
                  : Math.min(targetSpeed, Math.sqrt(Math.max(0, 2 * 18 * (aheadGap - 1.4))));
            }
            continue;
          }

          // 1c. Yield to leading vehicle in same/overlapping lateral corridor
          if (
            other.direction === obs.direction &&
            Math.abs(other.lateralOffset - obs.lateralOffset) <
              obs.halfW + other.halfW + 0.35
          ) {
            const aheadGap =
              obs.direction === 1
                ? other.distance - obs.distance
                : obs.distance - other.distance;
            if (aheadGap > 0) {
              const stopGap = obs.halfL + other.halfL + 2.8;
              const slowGap = obs.halfL + other.halfL + 14;
              if (aheadGap <= stopGap) {
                targetSpeed = Math.min(targetSpeed, other.currentSpeed * 0.5);
                if (aheadGap <= obs.halfL + other.halfL + 1.4) {
                  targetSpeed = Math.min(targetSpeed, 0);
                }
              } else if (aheadGap < slowGap) {
                const t = (aheadGap - stopGap) / Math.max(0.1, slowGap - stopGap);
                const followCap =
                  other.currentSpeed + (obs.speed - other.currentSpeed) * t;
                targetSpeed = Math.min(targetSpeed, Math.max(0, followCap));
              }
            }
          }
        }

        // 1d. Yield to active perpendicular cross-traffic ahead in an upcoming intersection
        for (const ct of this.crossTraffic) {
          const ctSpec = OBSTACLE_TYPES[ct.type];
          const aheadGap =
            obs.direction === 1
              ? ct.distance - ctSpec.halfW - (obs.distance + obs.halfL)
              : obs.distance - obs.halfL - (ct.distance + ctSpec.halfW);
          if (
            aheadGap > -0.25 &&
            aheadGap < 16 &&
            Math.abs(ct.lateralOffset - obs.lateralOffset) <
              ctSpec.halfL + obs.halfW + 1.2
          ) {
            targetSpeed =
              aheadGap <= 2.4
                ? 0
                : Math.min(targetSpeed, Math.sqrt(Math.max(0, 2 * 18 * (aheadGap - 1.5))));
          }
        }

        // Smooth acceleration & braking ramp
        if (obs.currentSpeed < targetSpeed) {
          obs.currentSpeed = Math.min(targetSpeed, obs.currentSpeed + 12 * safeDt);
        } else if (obs.currentSpeed > targetSpeed) {
          obs.currentSpeed = Math.max(targetSpeed, obs.currentSpeed - 26 * safeDt);
        }

        obs.distance = advanceObstacleDistance(
          obs.distance,
          obs.currentSpeed,
          obs.direction,
          safeDt
        );

        if (redCap.stopClampDist !== null) {
          if (obs.direction === 1 && obs.distance > redCap.stopClampDist) {
            obs.distance = redCap.stopClampDist;
            obs.currentSpeed = 0;
          } else if (obs.direction === -1 && obs.distance < redCap.stopClampDist) {
            obs.distance = redCap.stopClampDist;
            obs.currentSpeed = 0;
          }
        }

        if (obs.type === 'taxi' && Array.isArray(obs.mesh.userData.taxiWheels)) {
          const wheelSpin = (obs.currentSpeed / TAXI_WHEEL_RADIUS) * safeDt;
          for (const wheel of obs.mesh.userData.taxiWheels as THREE.Object3D[]) {
            wheel.rotation.x -= wheelSpin;
          }
        }
      }

      const rearRecycleBuffer =
        obs.type === 'reckless_moto' ? obs.halfL + 65 : obs.halfL + 48;

      // Recycle shortly after the vehicle exits the rearview mirror & chase window
      if (
        obs.distance < playerDistance - rearRecycleBuffer ||
        obs.distance > this.stageLength - 10 ||
        obs.distance < -55
      ) {
        this.setBlinkersVisible(obs.mesh, false);
        this.scene.remove(obs.mesh);
        this.pool.release(obs.type, obs.mesh);
        this.active.splice(i, 1);
      }
    }

    // 2. Update & spawn perpendicular cross-traffic at 4-lane & 2-lane intersections (FR-02)
    this.updateCrossTraffic(safeDt, playerDistance, elapsedTime);

    // 3. Enforce 2D non-penetration across all main-road vehicles, peds & cross-traffic before syncing meshes
    resolveTrafficNonPenetration(this.active, this.crossTraffic, this.roadWidth);

    for (const obs of this.active) {
      this.syncObstacleTransform(obs);
    }
    for (const ct of this.crossTraffic) {
      this.syncCrossVehicleTransform(ct);
    }

    // 4. Spawn scheduled VF e34 taxis (strictly 2-3 per stage) & regular 2-way traffic
    this.trySpawnScheduledTaxis(playerDistance);

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
          this.trySpawnAtDistance(spawnDist, preferOncoming, undefined, playerDistance);
        }
      }
    }
  }

  private setBlinkersVisible(mesh: THREE.Group, visible: boolean): void {
    const blinkers = mesh.userData.warningBlinkers;
    if (!Array.isArray(blinkers)) return;
    for (const b of blinkers as THREE.Object3D[]) {
      b.visible = visible;
    }
  }

  private updateRecklessMotoBehavior(
    obs: ActiveObstacle,
    playerDistance: number,
    dt: number
  ): void {
    if (obs.direction !== 1 || !obs.recklessPhase || obs.recklessPhase === 'done') {
      return;
    }

    if (obs.recklessPhase === 'cruise') {
      const distAhead = obs.distance - playerDistance;
      // Trigger lane weave warning when near or overtaking player
      if (distAhead > -12 && distAhead < 85) {
        const nextLane = this.findSafeWeaveTargetLane(obs);
        if (nextLane !== null) {
          obs.recklessPhase = 'warning';
          obs.recklessTimer = RECKLESS_WARNING_DURATION;
          obs.targetLaneIndex = nextLane;
          obs.startLateral = obs.lateralOffset;
          obs.targetLateral = this.lanes[nextLane];
          this.onRecklessWarning?.();
        }
      }
      return;
    }

    if (obs.recklessPhase === 'warning') {
      obs.recklessTimer = (obs.recklessTimer ?? RECKLESS_WARNING_DURATION) - dt;
      // Pulse amber warning blinker (~12 Hz) for 0.55s before cutting lanes
      const blinkOn = Math.floor(Math.max(0, obs.recklessTimer) * 12) % 2 === 0;
      this.setBlinkersVisible(obs.mesh, blinkOn);

      if ((obs.recklessTimer ?? 0) <= 0) {
        if (
          obs.targetLaneIndex !== undefined &&
          this.isWeaveCorridorClear(obs, this.lanes[obs.targetLaneIndex])
        ) {
          obs.recklessPhase = 'weaving';
          obs.recklessTimer = RECKLESS_WEAVE_DURATION;
          this.setBlinkersVisible(obs.mesh, true);
        } else {
          // Abort cleanly if target lane became occupied during warning
          obs.recklessPhase = 'cruise';
          obs.targetLaneIndex = undefined;
          this.setBlinkersVisible(obs.mesh, false);
        }
      }
      return;
    }

    if (obs.recklessPhase === 'weaving') {
      const targetLat = obs.targetLateral ?? obs.lateralOffset;
      if (!this.isWeaveCorridorClear(obs, targetLat)) {
        // Abort cleanly back to start lateral corridor if blocked mid-weave
        obs.recklessPhase = 'done';
        this.setBlinkersVisible(obs.mesh, false);
        return;
      }

      obs.recklessTimer = (obs.recklessTimer ?? RECKLESS_WEAVE_DURATION) - dt;
      const t = Math.max(
        0,
        Math.min(1, 1 - (obs.recklessTimer ?? 0) / RECKLESS_WEAVE_DURATION)
      );
      const eased = t * t * (3 - 2 * t);
      const startX = obs.startLateral ?? obs.lateralOffset;
      obs.lateralOffset = startX + (targetLat - startX) * eased;
      obs.laneIndex = this.nearestLaneIndex(obs.lateralOffset);

      if ((obs.recklessTimer ?? 0) <= 0) {
        obs.lateralOffset = targetLat;
        obs.laneIndex = obs.targetLaneIndex ?? obs.laneIndex;
        obs.recklessPhase = 'done';
        this.setBlinkersVisible(obs.mesh, false);
      }
    }
  }

  private isWeaveCorridorClear(
    obs: ActiveObstacle,
    targetLat: number
  ): boolean {
    const spec = OBSTACLE_TYPES[obs.type];
    const minLat = Math.min(obs.lateralOffset, targetLat);
    const maxLat = Math.max(obs.lateralOffset, targetLat);
    const sweepCenter = 0.5 * (minLat + maxLat);
    const sweepHalfW = 0.5 * (maxLat - minLat) + spec.halfW;

    for (const other of this.active) {
      if (other.id === obs.id) continue;
      const otherSpec = OBSTACLE_TYPES[other.type];
      if (
        checkEntitiesOverlap2D(
          {
            lateralOffset: sweepCenter,
            distance: obs.distance,
            halfW: sweepHalfW,
            halfL: spec.halfL + 14
          },
          {
            lateralOffset: other.lateralOffset,
            distance: other.distance,
            halfW: otherSpec.halfW,
            halfL: otherSpec.halfL
          },
          0.25,
          0
        )
      ) {
        return false;
      }
    }
    return true;
  }

  private findSafeWeaveTargetLane(obs: ActiveObstacle): number | null {
    const laneCount = this.lanes.length;
    const half = laneCount / 2;
    const candidates: number[] = [];
    for (const delta of [-1, 1]) {
      const idx = obs.laneIndex + delta;
      // Keep reckless moto weaving within forward half (and keep >=1 open lane)
      if (idx >= half && idx < laneCount) {
        candidates.push(idx);
      }
    }
    if (candidates.length === 0) return null;

    const spec = OBSTACLE_TYPES[obs.type];
    const blocked = this.getBlockedLanesInSlice(obs.distance, spec.halfL);
    for (const cand of candidates) {
      if (blocked.has(cand)) continue;
      if (!this.isWeaveCorridorClear(obs, this.lanes[cand])) continue;
      const nextBlocked = new Set(blocked);
      nextBlocked.add(cand);
      const minOpen = laneCount >= 6 ? 2 : 1;
      if (laneCount - nextBlocked.size >= minOpen) {
        return cand;
      }
    }
    return null;
  }

  private updateCrossTraffic(
    dt: number,
    playerDistance: number,
    elapsedTime: number
  ): void {
    const halfRoad = this.roadWidth * 0.5;
    const curbEdge = halfRoad + 11.5;
    const crossStopX = halfRoad + 4.4;

    // 1. Update existing cross-traffic with green/yellow stop-line braking & following distance
    for (let i = this.crossTraffic.length - 1; i >= 0; i--) {
      const ct = this.crossTraffic[i];
      const spec = OBSTACLE_TYPES[ct.type];
      const zone = this.routeFeatures.intersections.find(
        (z) => z.id === ct.intersectionId
      );
      const light = zone ? getTrafficLightState(zone, elapsedTime) : 'red';

      let targetSpeed = ct.speed;
      let clampedStopX: number | null = null;

      // Stop behind cross-street stop line when player's light is green/yellow and ct hasn't entered box
      if (
        (light === 'green' || light === 'yellow') &&
        Math.abs(ct.lateralOffset) > halfRoad + 2.2
      ) {
        const stopLineX = ct.crossDir === 1 ? -crossStopX : crossStopX;
        const distToStop =
          ct.crossDir === 1
            ? stopLineX - (ct.lateralOffset + spec.halfL)
            : (ct.lateralOffset - spec.halfL) - stopLineX;

        if (distToStop >= -0.3 && distToStop < 14) {
          targetSpeed =
            distToStop <= 0.4
              ? 0
              : Math.min(ct.speed, Math.sqrt(Math.max(0, 2 * 14 * distToStop)));
          clampedStopX =
            ct.crossDir === 1
              ? stopLineX - spec.halfL - 0.15
              : stopLineX + spec.halfL + 0.15;
        }
      }

      // Yield to preceding cross-traffic vehicle in same lane/direction
      for (const other of this.crossTraffic) {
        if (
          other.id === ct.id ||
          other.intersectionId !== ct.intersectionId ||
          other.crossDir !== ct.crossDir
        ) {
          continue;
        }
        const otherSpec = OBSTACLE_TYPES[other.type];
        const gap =
          ct.crossDir === 1
            ? other.lateralOffset - ct.lateralOffset
            : ct.lateralOffset - other.lateralOffset;
        const minGap = spec.halfL + otherSpec.halfL + 4.5;
        if (gap > 0 && gap < minGap) {
          targetSpeed = Math.min(
            targetSpeed,
            gap <= spec.halfL + otherSpec.halfL + 1.5 ? 0 : other.currentSpeed
          );
        }
      }

      if (ct.currentSpeed < targetSpeed) {
        ct.currentSpeed = Math.min(targetSpeed, ct.currentSpeed + 12 * dt);
      } else if (ct.currentSpeed > targetSpeed) {
        ct.currentSpeed = Math.max(targetSpeed, ct.currentSpeed - 18 * dt);
      }

      ct.lateralOffset += ct.crossDir * ct.currentSpeed * dt;

      if (clampedStopX !== null) {
        if (ct.crossDir === 1 && ct.lateralOffset > clampedStopX) {
          ct.lateralOffset = clampedStopX;
          ct.currentSpeed = 0;
        } else if (ct.crossDir === -1 && ct.lateralOffset < clampedStopX) {
          ct.lateralOffset = clampedStopX;
          ct.currentSpeed = 0;
        }
      }

      const outOfBounds =
        (ct.crossDir > 0 && ct.lateralOffset > curbEdge) ||
        (ct.crossDir < 0 && ct.lateralOffset < -curbEdge) ||
        ct.distance < playerDistance - 48 ||
        ct.distance > playerDistance + 290;

      if (outOfBounds) {
        this.scene.remove(ct.mesh);
        this.pool.release(ct.type, ct.mesh);
        this.crossTraffic.splice(i, 1);
      }
    }

    if (this.routeFeatures.intersections.length === 0) return;

    // 2. Spawn perpendicular cross-traffic ONLY during red phase
    const diff = DIFFICULTIES[this.difficultyId];
    for (const zone of this.routeFeatures.intersections) {
      if (zone.distance < playerDistance - 10 || zone.distance > playerDistance + 240) {
        continue;
      }

      const light = getTrafficLightState(zone, elapsedTime);
      const cooldown = Math.max(0, (this.crossSpawnCooldowns.get(zone.id) ?? 0) - dt);
      this.crossSpawnCooldowns.set(zone.id, cooldown);

      if (light !== 'red' || cooldown > 0) continue;

      const activeInZone = this.crossTraffic.filter(
        (c) => c.intersectionId === zone.id
      ).length;
      if (activeInZone >= 2) continue;

      const crossDir: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
      const laneOffsetZ = crossDir === 1 ? 2.1 : -2.1;
      const spawnDist = zone.distance + laneOffsetZ;
      const types: Array<'car' | 'motorbike' | 'flower_bike'> =
        this.stageSpec.laneCount === 2
          ? ['motorbike', 'flower_bike', 'car']
          : ['car', 'motorbike'];
      const chosenType = types[Math.floor(Math.random() * types.length)];
      const spec = OBSTACLE_TYPES[chosenType];
      const crossSpeed =
        (chosenType === 'flower_bike' ? 5.8 : chosenType === 'motorbike' ? 9.8 : 11.2) *
        (0.85 + 0.15 * diff.trafficSpeedScale);

      const startX = -crossDir * (halfRoad + spec.halfL + 4.5);
      const candBox = {
        lateralOffset: startX,
        distance: spawnDist,
        halfW: spec.halfL,
        halfL: spec.halfW
      };

      const overlapsCross = this.crossTraffic.some((other) => {
        const oSpec = OBSTACLE_TYPES[other.type];
        return checkEntitiesOverlap2D(
          candBox,
          {
            lateralOffset: other.lateralOffset,
            distance: other.distance,
            halfW: oSpec.halfL,
            halfL: oSpec.halfW
          },
          1.2,
          0.35
        );
      });
      if (overlapsCross) continue;

      const overlapsMain = this.active.some((obs) => {
        const oSpec = OBSTACLE_TYPES[obs.type];
        return checkEntitiesOverlap2D(
          candBox,
          {
            lateralOffset: obs.lateralOffset,
            distance: obs.distance,
            halfW: oSpec.halfW,
            halfL: oSpec.halfL
          },
          0.5,
          0.5
        );
      });
      if (overlapsMain) continue;

      const mesh = this.pool.acquire(chosenType);
      mesh.rotation.order = 'YXZ';

      const vehicle: CrossTrafficVehicle = {
        id: this.nextId++,
        type: chosenType,
        intersectionId: zone.id,
        distance: spawnDist,
        lateralOffset: startX,
        crossDir,
        speed: crossSpeed,
        currentSpeed: crossSpeed,
        worldX: 0,
        worldY: 0,
        worldZ: 0,
        mesh
      };

      this.syncCrossVehicleTransform(vehicle);
      this.scene.add(mesh);
      this.crossTraffic.push(vehicle);
      this.crossSpawnCooldowns.set(zone.id, 1.35 + Math.random() * 0.75);
    }
  }

  private syncCrossVehicleTransform(ct: CrossTrafficVehicle): void {
    const centerX = getRoadCenterX(this.stageId, ct.distance);
    ct.worldX = centerX + ct.lateralOffset;
    ct.worldY = getRoadElevationY(this.stageId, ct.distance);
    ct.worldZ = distanceToWorldZ(ct.distance);

    const tangentYaw = getRoadTangentYaw(this.stageId, ct.distance);
    const crossYaw = ct.crossDir > 0 ? -Math.PI / 2 : Math.PI / 2;
    ct.mesh.position.set(ct.worldX, ct.worldY, ct.worldZ);
    ct.mesh.rotation.set(0, tangentYaw + crossYaw, 0);
  }

  private findCrosswalkNear(
    targetDist: number,
    playerDistance?: number
  ): CrosswalkZone | null {
    if (this.routeFeatures.crosswalks.length === 0) return null;

    const minAhead = playerDistance !== undefined ? playerDistance + 26 : 12;
    const maxAhead =
      playerDistance !== undefined
        ? Math.min(this.stageLength - 22, playerDistance + 175)
        : this.stageLength - 22;

    let best: CrosswalkZone | null = null;
    let bestDelta = Infinity;
    for (const cw of this.routeFeatures.crosswalks) {
      if (cw.distance < minAhead || cw.distance > maxAhead) continue;
      const d = Math.abs(cw.distance - targetDist);
      if (d < bestDelta) {
        bestDelta = d;
        best = cw;
      }
    }
    return best;
  }

  private pickObstacleType(excludePedestrians = false): ObstacleTypeId {
    // Scheduled taxi quota strictly governs VF e34 appearances; random spawner excludes 'taxi'
    const pool = this.allowedTypes.filter(
      (t) =>
        t !== 'taxi' &&
        isObstacleAllowedOnStage(t, this.stageSpec) &&
        (!excludePedestrians || !isPedestrianObstacle(t))
    );
    if (pool.length === 0) return 'motorbike';

    const fallbackWeights: Record<ObstacleTypeId, number> = {
      motorbike: 36,
      reckless_moto: 12,
      flower_bike: 14,
      vendor: 8,
      tourist: 8,
      office_worker: 8,
      car: 16,
      taxi: 0,
      bus: 12,
      truck: 10,
      heavy_truck: 8
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

  private trySpawnScheduledTaxis(playerDistance: number): void {
    if (this.taxisSpawnedInStage >= this.stageTaxiQuota) return;
    if (!isObstacleAllowedOnStage('taxi', this.stageSpec)) return;

    for (const slot of this.taxiSchedule) {
      if (slot.spawned) continue;
      if (playerDistance < slot.triggerPlayerDist) continue;

      const minAhead = slot.preferOncoming ? 115 : 88;
      const baseSpawnDist = Math.max(slot.targetSpawnDist, playerDistance + minAhead);
      if (playerDistance + minAhead >= this.stageLength - 28) {
        slot.spawned = true;
        continue;
      }

      const offsets = [0, 16, -12, 32];
      let spawnedThisTick = false;
      for (const offset of offsets) {
        const candidateDist = baseSpawnDist + offset;
        if (
          candidateDist < playerDistance + 76 ||
          candidateDist >= this.stageLength - 28
        ) {
          continue;
        }
        if (this.trySpawnAtDistance(candidateDist, slot.preferOncoming, 'taxi')) {
          slot.spawned = true;
          this.taxisSpawnedInStage += 1;
          spawnedThisTick = true;
          break;
        }
      }

      if (spawnedThisTick) {
        return;
      }

      // Retry smoothly within [minAhead, minAhead + 45] ahead of the player on next tick
      const nextStep = ((baseSpawnDist - (playerDistance + minAhead)) + 15) % 45;
      slot.targetSpawnDist = Math.min(
        this.stageLength - 32,
        playerDistance + minAhead + nextStep
      );
    }
  }

  private trySpawnAtDistance(
    spawnDist: number,
    preferOncoming?: boolean,
    forcedType?: ObstacleTypeId,
    playerDistance?: number
  ): boolean {
    let type = forcedType ?? this.pickObstacleType();
    if (!isObstacleAllowedOnStage(type, this.stageSpec)) {
      return false;
    }

    let resolvedSpawnDist = spawnDist;
    let crosswalkId: number | null = null;
    let intersectionId: number | null = null;

    // FR-20: Pedestrians may ONLY spawn at a CrosswalkZone (4-lane & 2-lane roads)
    if (isPedestrianObstacle(type)) {
      const cw = this.findCrosswalkNear(spawnDist, playerDistance);
      if (!cw) {
        if (forcedType) return false;
        type = this.pickObstacleType(true);
        if (!isObstacleAllowedOnStage(type, this.stageSpec) || isPedestrianObstacle(type)) {
          return false;
        }
      } else {
        resolvedSpawnDist = Math.min(
          this.stageLength - 22,
          Math.max(15, cw.distance + (Math.random() - 0.5) * 1.8)
        );
        crosswalkId = cw.id;
        intersectionId = cw.intersectionId;
      }
    }

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

    // Reckless motorbikes spawn in forward lanes; rear-overtakers start at playerDistance - 44 for rearview mirror visibility
    let overtakeFromBehind = false;
    let candidateLanes: number[];
    if (type === 'reckless_moto') {
      candidateLanes = shuffle([...rightLanes]);
      if (playerDistance !== undefined && playerDistance > 55 && Math.random() < 0.6) {
        const behindDist = playerDistance - 44;
        if (behindDist > 5) {
          resolvedSpawnDist = behindDist;
          overtakeFromBehind = true;
        }
      }
    } else if (type === 'flower_bike') {
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

    const spawnCheckHalfL =
      type === 'heavy_truck' ? Math.max(spec.halfL, 8.0) : spec.halfL;

    // Never spawn a vehicle inside an intersection box (stop-line/crosswalk zone)
    if (!isPedestrianObstacle(type)) {
      const boxHalfSpan = 15 + spawnCheckHalfL;
      for (const zone of this.routeFeatures.intersections) {
        if (Math.abs(resolvedSpawnDist - zone.distance) < boxHalfSpan) {
          return false;
        }
      }
    } else {
      // Never spawn a pedestrian on top of a crowded crosswalk slice
      const existingPedAtCw = this.active.some(
        (o) => isPedestrianObstacle(o.type) && o.crosswalkId === crosswalkId
      );
      if (existingPedAtCw) return false;

      const blockedCount = this.getBlockedLanesInSlice(
        resolvedSpawnDist,
        spawnCheckHalfL + 10
      ).size;
      if (laneCount === 2 ? blockedCount >= 1 : blockedCount > 1) {
        return false;
      }
    }

    const chosenLane = candidateLanes.find((laneIdx) =>
      this.isLaneSafeToSpawn(laneIdx, resolvedSpawnDist, spawnCheckHalfL, type)
    );

    if (chosenLane === undefined) {
      return false;
    }

    const sidewalkWaitX = this.roadWidth * 0.5 + 0.65;
    const pedCurbLimit = this.roadWidth * 0.5 - 1.05;
    const direction = getLaneDirection(chosenLane, laneCount);
    const crossDir: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
    const lateralOffset = isPedestrianObstacle(type)
      ? intersectionId !== null
        ? crossDir === 1
          ? -sidewalkWaitX
          : sidewalkWaitX
        : crossDir === 1
          ? -pedCurbLimit + 0.3
          : pedCurbLimit - 0.3
      : this.lanes[chosenLane];

    const speed = isPedestrianObstacle(type)
      ? 0
      : type === 'reckless_moto'
        ? overtakeFromBehind
          ? spec.baseSpeed * 1.45 * diff.trafficSpeedScale
          : spec.baseSpeed * 1.15 * diff.trafficSpeedScale
        : direction === -1
          ? computeOncomingSpeed(spec.baseSpeed, diff.trafficSpeedScale)
          : spec.baseSpeed * diff.trafficSpeedScale;

    const mesh = this.pool.acquire(type);
    mesh.rotation.order = 'YXZ';
    this.setBlinkersVisible(mesh, false);

    const halfW =
      typeof mesh.userData.hitboxHalfW === 'number'
        ? mesh.userData.hitboxHalfW
        : spec.halfW;
    const halfL =
      typeof mesh.userData.hitboxHalfL === 'number'
        ? mesh.userData.hitboxHalfL
        : spec.halfL;

    const obs: ActiveObstacle = {
      id: this.nextId++,
      type,
      laneIndex: chosenLane,
      direction,
      distance: resolvedSpawnDist,
      lateralOffset,
      crossDir,
      speed,
      currentSpeed: speed,
      halfW,
      halfL,
      worldX: 0,
      worldY: 0,
      worldZ: 0,
      mesh,
      crosswalkId,
      intersectionId,
      recklessPhase: type === 'reckless_moto' ? 'cruise' : undefined
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
      if (Math.abs(obs.distance - targetDist) <= windowRadius + obs.halfL) {
        blocked.add(obs.laneIndex);
        if (isPedestrianObstacle(obs.type)) {
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
    const spec = OBSTACLE_TYPES[type];
    const candLat = this.lanes[laneIdx];
    const isHeavy = type === 'bus' || type === 'truck' || type === 'heavy_truck';

    // 1. Longitudinal & 2D AABB clearance so spawned entities never overlap existing traffic or cross-traffic
    for (const obs of this.active) {
      if (
        checkEntitiesOverlap2D(
          {
            lateralOffset: candLat,
            distance: spawnDist,
            halfW: spec.halfW,
            halfL: candHalfL
          },
          {
            lateralOffset: obs.lateralOffset,
            distance: obs.distance,
            halfW: obs.halfW,
            halfL: obs.halfL
          },
          0.25,
          SAME_LANE_BUFFER
        )
      ) {
        return false;
      }

      const minGap = candHalfL + obs.halfL + SAME_LANE_BUFFER;
      if (
        obs.laneIndex === laneIdx &&
        Math.abs(obs.distance - spawnDist) < minGap
      ) {
        return false;
      }

      if (
        isHeavy &&
        (obs.type === 'bus' || obs.type === 'truck' || obs.type === 'heavy_truck')
      ) {
        if (obs.laneIndex === laneIdx && Math.abs(obs.distance - spawnDist) < 26) {
          return false;
        }
        if (Math.abs(obs.laneIndex - laneIdx) <= 1 && Math.abs(obs.distance - spawnDist) < 12) {
          return false;
        }
      }
    }

    for (const ct of this.crossTraffic) {
      const ctSpec = OBSTACLE_TYPES[ct.type];
      if (
        checkEntitiesOverlap2D(
          {
            lateralOffset: candLat,
            distance: spawnDist,
            halfW: spec.halfW,
            halfL: candHalfL
          },
          {
            lateralOffset: ct.lateralOffset,
            distance: ct.distance,
            halfW: ctSpec.halfL,
            halfL: ctSpec.halfW
          },
          0.5,
          2.0
        )
      ) {
        return false;
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
    if (isPedestrianObstacle(obs.type)) {
      const crossYaw = obs.crossDir > 0 ? -Math.PI / 2 : Math.PI / 2;
      obs.mesh.rotation.set(0, tangentYaw + crossYaw, 0);
    } else if (obs.direction === -1) {
      obs.mesh.rotation.set(-Math.atan(slope), tangentYaw + Math.PI, 0);
    } else {
      obs.mesh.rotation.set(Math.atan(slope), tangentYaw, 0);
    }
  }

  public getRearThreatInfo(
    playerDistance: number,
    playerLateral: number
  ): RearThreatInfo {
    let closest: ActiveObstacle | null = null;
    let closestGap = Infinity;

    for (const obs of this.active) {
      if (obs.direction !== 1 || isPedestrianObstacle(obs.type)) continue;
      if (
        obs.distance >= playerDistance - 55 &&
        obs.distance <= playerDistance - 1.5
      ) {
        const gap = playerDistance - obs.distance;
        if (gap < closestGap) {
          closestGap = gap;
          closest = obs;
        }
      }
    }

    if (!closest) {
      return {
        active: false,
        distanceMeters: 0,
        lateralDelta: 0,
        isReckless: false
      };
    }

    return {
      active: true,
      distanceMeters: Math.max(0, closestGap),
      lateralDelta: closest.lateralOffset - playerLateral,
      isReckless: closest.type === 'reckless_moto'
    };
  }

  public getDirectionCounts(): { oncoming: number; sameDir: number } {
    let oncoming = 0;
    let sameDir = 0;
    for (const obs of this.active) {
      if (isPedestrianObstacle(obs.type)) continue;
      if (obs.direction === -1) oncoming += 1;
      else sameDir += 1;
    }
    return { oncoming, sameDir };
  }

  public getVehicleTypeCounts(): Record<ObstacleTypeId, number> {
    const counts: Record<ObstacleTypeId, number> = {
      motorbike: 0,
      reckless_moto: 0,
      flower_bike: 0,
      vendor: 0,
      tourist: 0,
      office_worker: 0,
      car: 0,
      taxi: 0,
      bus: 0,
      truck: 0,
      heavy_truck: 0
    };
    for (const obs of this.active) {
      counts[obs.type] += 1;
    }
    return counts;
  }

  public getCrossTrafficCount(): number {
    return this.crossTraffic.length;
  }

  public getTaxiStageStats(): {
    spawnedInStage: number;
    quota: number;
    activeNow: number;
    hasGltfModel: boolean;
  } {
    let activeNow = 0;
    for (const obs of this.active) {
      if (obs.type === 'taxi') activeNow += 1;
    }
    return {
      spawnedInStage: this.taxisSpawnedInStage,
      quota: this.stageTaxiQuota,
      activeNow,
      hasGltfModel: this.pool.hasTaxiTemplate()
    };
  }

  public getHeavyModelStats(): {
    hasBusGltf: boolean;
    hasTruckGltf: boolean;
    hasHeavyTruckGltf: boolean;
  } {
    return {
      hasBusGltf: this.pool.hasBusTemplate(),
      hasTruckGltf: this.pool.hasTruckTemplate(),
      hasHeavyTruckGltf: this.pool.hasHeavyTruckTemplate()
    };
  }

  public checkPlayerCollision(
    playerPose: PlayerPose
  ): { type: ObstacleTypeId; lateralOffset: number } | null {
    for (const obs of this.active) {
      const hit = checkAABBCollision(
        playerPose.worldX,
        playerPose.worldZ,
        PLAYER_HALF_W,
        PLAYER_HALF_L,
        obs.worldX,
        obs.worldZ,
        obs.halfW,
        obs.halfL,
        playerPose.worldY,
        obs.worldY
      );
      if (hit) {
        return { type: obs.type, lateralOffset: obs.lateralOffset };
      }
    }

    // Also check perpendicular cross-traffic at intersections (rotated 90 deg: swap halfW/halfL)
    for (const ct of this.crossTraffic) {
      const spec = OBSTACLE_TYPES[ct.type];
      const hit = checkAABBCollision(
        playerPose.worldX,
        playerPose.worldZ,
        PLAYER_HALF_W,
        PLAYER_HALF_L,
        ct.worldX,
        ct.worldZ,
        spec.halfL,
        spec.halfW,
        playerPose.worldY,
        ct.worldY
      );
      if (hit) {
        return { type: ct.type, lateralOffset: ct.lateralOffset };
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
