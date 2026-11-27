import { OBSTACLE_TYPES, type ObstacleTypeId } from '../config/gameConfig.ts';
import {
  getTrafficLightState,
  type IntersectionZone,
  type TrafficLightColor
} from './routeFeatures.ts';
import type { TrafficDirection } from './trafficRules.ts';

/** Matches the white stop-line stripe offset rendered in `src/world/hanoiRoad.ts`. */
export const STOP_LINE_VISUAL_OFFSET = 11.6;

export interface RedLightCapParams {
  distance: number;
  direction: TrafficDirection;
  halfL: number;
  desiredSpeed: number;
  intersections: readonly IntersectionZone[];
  elapsedTime: number;
  boxBlockedByCrossTraffic?: (zoneId: number) => boolean;
}

export interface RedLightCapResult {
  maxSpeed: number;
  stopClampDist: number | null;
}

export interface EntityBox2D {
  lateralOffset: number;
  distance: number;
  halfW: number;
  halfL: number;
}

export interface PhysicsObstacleEntity {
  id: number;
  type: ObstacleTypeId;
  laneIndex: number;
  direction: TrafficDirection;
  distance: number;
  lateralOffset: number;
  crossDir: 1 | -1;
  speed: number;
  currentSpeed: number;
  halfW?: number;
  halfL?: number;
}

export interface PhysicsCrossEntity {
  id: number;
  type: ObstacleTypeId;
  intersectionId: number;
  distance: number;
  lateralOffset: number;
  crossDir: 1 | -1;
  speed: number;
  currentSpeed: number;
}

function isPedType(type: ObstacleTypeId): boolean {
  return Boolean(OBSTACLE_TYPES[type].isPedestrian);
}

function getObsHalfW(obs: PhysicsObstacleEntity): number {
  return obs.halfW ?? OBSTACLE_TYPES[obs.type].halfW;
}

function getObsHalfL(obs: PhysicsObstacleEntity): number {
  return obs.halfL ?? OBSTACLE_TYPES[obs.type].halfL;
}

/**
 * Computes comfortable braking speed cap & stop-line clamp distance for a vehicle
 * approaching an intersection on red, yellow, or when cross-traffic occupies the box.
 */
export function computeRedLightCapSpeed(params: RedLightCapParams): RedLightCapResult {
  const {
    distance,
    direction,
    halfL,
    desiredSpeed,
    intersections,
    elapsedTime,
    boxBlockedByCrossTraffic
  } = params;

  let maxSpeed = Math.max(0, desiredSpeed);
  let stopClampDist: number | null = null;
  let bestDistToStop = Infinity;

  for (const zone of intersections) {
    const stopDist =
      direction === 1
        ? zone.distance - STOP_LINE_VISUAL_OFFSET
        : zone.distance + STOP_LINE_VISUAL_OFFSET;
    const distToStop =
      direction === 1
        ? stopDist - (distance + halfL)
        : (distance - halfL) - stopDist;

    // Already past the stop line -> let vehicle clear the intersection cleanly
    if (distToStop < -0.35 || distToStop >= 42) {
      continue;
    }

    const light = getTrafficLightState(zone, elapsedTime);
    const boxBlocked = boxBlockedByCrossTraffic?.(zone.id) ?? false;
    if (light !== 'red' && light !== 'yellow' && !boxBlocked) {
      continue;
    }

    const cap =
      distToStop <= 0.45
        ? 0
        : Math.min(
            desiredSpeed,
            Math.sqrt(Math.max(0, 2 * 18 * (distToStop - 0.35)))
          );
    const clampDist =
      direction === 1
        ? stopDist - halfL - 0.25
        : stopDist + halfL + 0.25;

    if (cap < maxSpeed || (cap === maxSpeed && distToStop < bestDistToStop)) {
      maxSpeed = cap;
      stopClampDist = clampDist;
      bestDistToStop = distToStop;
    }
  }

  return { maxSpeed, stopClampDist };
}

/**
 * Intersection pedestrians wait at the curb during green/yellow and cross on red
 * (or finish crossing if already stepped onto the carriageway).
 */
export function canIntersectionPedestrianCross(
  light: TrafficLightColor,
  lateralOffset: number,
  roadHalfW: number
): boolean {
  if (light === 'red') return true;
  return Math.abs(lateralOffset) < roadHalfW - 0.35;
}

export function checkEntitiesOverlap2D(
  a: EntityBox2D,
  b: EntityBox2D,
  padX = 0,
  padZ = 0
): boolean {
  return (
    Math.abs(a.lateralOffset - b.lateralOffset) < a.halfW + b.halfW + padX &&
    Math.abs(a.distance - b.distance) < a.halfL + b.halfL + padZ
  );
}

/**
 * 2-iteration 2D non-penetration solver ensuring traffic vehicles, pedestrians,
 * and perpendicular cross-traffic never overlap or drive through each other.
 */
export function resolveTrafficNonPenetration(
  obstacles: PhysicsObstacleEntity[],
  crossTraffic: PhysicsCrossEntity[],
  roadWidth: number
): void {
  const roadHalfW = roadWidth * 0.5;
  const sidewalkClamp = roadHalfW + 0.9;

  for (let iter = 0; iter < 2; iter += 1) {
    // 1. Keep non-pedestrian vehicles strictly on their carriageway half
    for (const obs of obstacles) {
      if (isPedType(obs.type)) continue;
      const obsHalfW = getObsHalfW(obs);
      const maxEdge = Math.max(obsHalfW + 0.15, roadHalfW - obsHalfW - 0.12);
      if (obs.direction === 1) {
        obs.lateralOffset = Math.max(
          obsHalfW + 0.1,
          Math.min(maxEdge, obs.lateralOffset)
        );
      } else {
        obs.lateralOffset = Math.min(
          -(obsHalfW + 0.1),
          Math.max(-maxEdge, obs.lateralOffset)
        );
      }
    }

    // 2. Resolve longitudinal/lateral pairs among main-road obstacles
    for (let i = 0; i < obstacles.length; i += 1) {
      const a = obstacles[i];
      const halfWA = getObsHalfW(a);
      const halfLA = getObsHalfL(a);
      const pedA = isPedType(a.type);

      for (let j = i + 1; j < obstacles.length; j += 1) {
        const b = obstacles[j];
        const halfWB = getObsHalfW(b);
        const halfLB = getObsHalfL(b);
        const pedB = isPedType(b.type);

        if (!pedA && !pedB) {
          if (a.direction === b.direction) {
            if (Math.abs(a.lateralOffset - b.lateralOffset) < halfWA + halfWB + 0.15) {
              const dir = a.direction;
              const aAhead = dir === 1 ? a.distance >= b.distance : a.distance <= b.distance;
              const lead = aAhead ? a : b;
              const trail = aAhead ? b : a;
              const minGap = halfLA + halfLB + 0.45;
              const gap =
                dir === 1
                  ? lead.distance - trail.distance
                  : trail.distance - lead.distance;
              if (gap < minGap) {
                trail.distance =
                  dir === 1 ? lead.distance - minGap : lead.distance + minGap;
                trail.currentSpeed = Math.min(trail.currentSpeed, lead.currentSpeed);
              }
            }
          } else if (
            checkEntitiesOverlap2D(
              {
                lateralOffset: a.lateralOffset,
                distance: a.distance,
                halfW: halfWA,
                halfL: halfLA
              },
              {
                lateralOffset: b.lateralOffset,
                distance: b.distance,
                halfW: halfWB,
                halfL: halfLB
              },
              0.05,
              0.05
            )
          ) {
            const minX = halfWA + halfWB + 0.12;
            const dx = a.lateralOffset - b.lateralOffset;
            const pushX = (minX - Math.abs(dx)) * 0.5 + 0.02;
            const signA = a.direction === 1 ? 1 : -1;
            a.lateralOffset = Math.min(
              roadHalfW - halfWA,
              Math.max(-roadHalfW + halfWA, a.lateralOffset + signA * pushX)
            );
            b.lateralOffset = Math.min(
              roadHalfW - halfWB,
              Math.max(-roadHalfW + halfWB, b.lateralOffset - signA * pushX)
            );
          }
          continue;
        }

        if (pedA && pedB) {
          if (
            checkEntitiesOverlap2D(
              {
                lateralOffset: a.lateralOffset,
                distance: a.distance,
                halfW: halfWA,
                halfL: halfLA
              },
              {
                lateralOffset: b.lateralOffset,
                distance: b.distance,
                halfW: halfWB,
                halfL: halfLB
              },
              0.1,
              0.1
            )
          ) {
            const minX = halfWA + halfWB + 0.14;
            const dx = a.lateralOffset - b.lateralOffset;
            const sign = dx >= 0 ? 1 : -1;
            const push = (minX - Math.abs(dx)) * 0.5;
            a.lateralOffset = Math.max(
              -sidewalkClamp,
              Math.min(sidewalkClamp, a.lateralOffset + sign * push)
            );
            b.lateralOffset = Math.max(
              -sidewalkClamp,
              Math.min(sidewalkClamp, b.lateralOffset - sign * push)
            );
          }
          continue;
        }

        // Vehicle vs Pedestrian
        const veh = pedA ? b : a;
        const ped = pedA ? a : b;
        const vehHalfW = pedA ? halfWB : halfWA;
        const vehHalfL = pedA ? halfLB : halfLA;
        const pedHalfW = pedA ? halfWA : halfWB;
        const pedHalfL = pedA ? halfLA : halfLB;

        if (
          checkEntitiesOverlap2D(
            {
              lateralOffset: veh.lateralOffset,
              distance: veh.distance,
              halfW: vehHalfW,
              halfL: vehHalfL
            },
            {
              lateralOffset: ped.lateralOffset,
              distance: ped.distance,
              halfW: pedHalfW,
              halfL: pedHalfL
            },
            0.15,
            0.15
          )
        ) {
          veh.currentSpeed = 0;
          const clearanceX = vehHalfW + pedHalfW + 0.18;
          const pushDir =
            ped.lateralOffset === veh.lateralOffset
              ? -ped.crossDir
              : ped.lateralOffset > veh.lateralOffset
                ? 1
                : -1;
          ped.lateralOffset = Math.max(
            -sidewalkClamp,
            Math.min(sidewalkClamp, veh.lateralOffset + pushDir * clearanceX)
          );
        }
      }
    }

    // 3. CrossTraffic vs CrossTraffic (rotated 90 deg: halfX = halfL, halfZ = halfW)
    for (let i = 0; i < crossTraffic.length; i += 1) {
      const a = crossTraffic[i];
      const specA = OBSTACLE_TYPES[a.type];
      for (let j = i + 1; j < crossTraffic.length; j += 1) {
        const b = crossTraffic[j];
        const specB = OBSTACLE_TYPES[b.type];
        if (Math.abs(a.distance - b.distance) >= specA.halfW + specB.halfW + 0.35) {
          continue;
        }
        if (a.crossDir === b.crossDir) {
          const aAhead =
            a.crossDir === 1
              ? a.lateralOffset >= b.lateralOffset
              : a.lateralOffset <= b.lateralOffset;
          const lead = aAhead ? a : b;
          const trail = aAhead ? b : a;
          const minGap = specA.halfL + specB.halfL + 1.2;
          const gap =
            a.crossDir === 1
              ? lead.lateralOffset - trail.lateralOffset
              : trail.lateralOffset - lead.lateralOffset;
          if (gap < minGap) {
            trail.lateralOffset =
              trail.crossDir === 1
                ? lead.lateralOffset - minGap
                : lead.lateralOffset + minGap;
            trail.currentSpeed = Math.min(trail.currentSpeed, lead.currentSpeed);
          }
        } else if (
          checkEntitiesOverlap2D(
            {
              lateralOffset: a.lateralOffset,
              distance: a.distance,
              halfW: specA.halfL,
              halfL: specA.halfW
            },
            {
              lateralOffset: b.lateralOffset,
              distance: b.distance,
              halfW: specB.halfL,
              halfL: specB.halfW
            },
            0.1,
            0.1
          )
        ) {
          const minZ = specA.halfW + specB.halfW + 0.25;
          const dz = a.distance - b.distance;
          const signZ = dz >= 0 ? 1 : -1;
          const pushZ = (minZ - Math.abs(dz)) * 0.5;
          a.distance += signZ * pushZ;
          b.distance -= signZ * pushZ;
        }
      }
    }

    // 4. CrossTraffic vs Main-road vehicles & pedestrians
    for (const ct of crossTraffic) {
      const ctSpec = OBSTACLE_TYPES[ct.type];
      for (const obs of obstacles) {
        const obsHalfW = getObsHalfW(obs);
        const obsHalfL = getObsHalfL(obs);
        const overlap = checkEntitiesOverlap2D(
          {
            lateralOffset: ct.lateralOffset,
            distance: ct.distance,
            halfW: ctSpec.halfL,
            halfL: ctSpec.halfW
          },
          {
            lateralOffset: obs.lateralOffset,
            distance: obs.distance,
            halfW: obsHalfW,
            halfL: obsHalfL
          },
          0.15,
          0.15
        );
        if (!overlap) continue;

        if (isPedType(obs.type)) {
          obs.currentSpeed = 0;
          const clearZ = ctSpec.halfW + obsHalfL + 0.2;
          obs.distance =
            obs.distance >= ct.distance
              ? ct.distance + clearZ
              : ct.distance - clearZ;
          continue;
        }

        const ctOutsideCore = Math.abs(ct.lateralOffset) > roadHalfW - ctSpec.halfL * 0.35;
        if (ctOutsideCore) {
          const clearX = ctSpec.halfL + obsHalfW + 0.22;
          ct.lateralOffset = obs.lateralOffset - ct.crossDir * clearX;
          ct.currentSpeed = 0;
        } else {
          const clearZ = ctSpec.halfW + obsHalfL + 0.22;
          obs.distance = ct.distance - obs.direction * clearZ;
          obs.currentSpeed = 0;
        }
      }
    }
  }
}
