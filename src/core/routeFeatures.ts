import { getStageSpec, type StageId } from '../config/gameConfig.ts';

export type TrafficLightColor = 'green' | 'yellow' | 'red';

export interface IntersectionZone {
  id: number;
  distance: number;
  stopLineDistance: number;
  halfLength: number;
  greenDuration: number;
  yellowDuration: number;
  redDuration: number;
  phaseOffset: number;
}

export interface CrosswalkZone {
  id: number;
  distance: number;
  halfLength: number;
  intersectionId: number | null;
}

export interface SpeedCameraZone {
  id: number;
  distance: number;
  speedLimitKmh: number;
  monitorsWrongLane: boolean;
  intersectionId: number | null;
}

export interface StageRouteFeatures {
  stageId: StageId;
  intersections: IntersectionZone[];
  crosswalks: CrosswalkZone[];
  cameras: SpeedCameraZone[];
}

const GREEN_DURATION = 7.0;
const YELLOW_DURATION = 2.5;
const RED_DURATION = 4.5;
const FULL_CYCLE = GREEN_DURATION + YELLOW_DURATION + RED_DURATION; // 14.0s

const ROUTE_FEATURES_CACHE = new Map<StageId, StageRouteFeatures>();

export function getStageRouteFeatures(stageId: StageId): StageRouteFeatures {
  const cached = ROUTE_FEATURES_CACHE.get(stageId);
  if (cached) return cached;

  const stage = getStageSpec(stageId);
  const intersections: IntersectionZone[] = [];
  const crosswalks: CrosswalkZone[] = [];
  const cameras: SpeedCameraZone[] = [];

  let nextIntersectionId = 1;
  let nextCrosswalkId = 1;
  let nextCameraId = 1;

  if (!stage.hasIntersections) {
    // 6-lane avenues (Stages 1..3): no intersections/crosswalks; speed & wrong-lane cameras every ~650m
    for (let d = 450; d <= stage.length - 250; d += 650) {
      cameras.push({
        id: nextCameraId++,
        distance: d,
        speedLimitKmh: stage.speedLimitKmh,
        monitorsWrongLane: true,
        intersectionId: null
      });
    }
  } else {
    // 4-lane & 2-lane streets (Stages 4..9): intersections starting at 420m every 520m
    const firstIntersectionDist = 420;
    const spacing = 520;
    const maxIntersectionDist = stage.length - 300;

    for (
      let d = firstIntersectionDist, idx = 0;
      d <= maxIntersectionDist;
      d += spacing, idx += 1
    ) {
      const zone: IntersectionZone = {
        id: nextIntersectionId++,
        distance: d,
        stopLineDistance: d - 10,
        halfLength: 7.5,
        greenDuration: GREEN_DURATION,
        yellowDuration: YELLOW_DURATION,
        redDuration: RED_DURATION,
        phaseOffset: (idx * 3.5) % FULL_CYCLE
      };
      intersections.push(zone);

      // Zebra crosswalk just before the stop line at every intersection
      crosswalks.push({
        id: nextCrosswalkId++,
        distance: zone.distance - 9.5,
        halfLength: 2.4,
        intersectionId: zone.id
      });

      // Red-light + speed/wrong-lane camera mounted ahead of intersection
      cameras.push({
        id: nextCameraId++,
        distance: zone.distance - 6,
        speedLimitKmh: stage.speedLimitKmh,
        monitorsWrongLane: true,
        intersectionId: zone.id
      });
    }

    // Mid-block crosswalks between intersections (first at ~210m)
    if (stage.length > 500) {
      crosswalks.push({
        id: nextCrosswalkId++,
        distance: 210,
        halfLength: 2.4,
        intersectionId: null
      });
    }
    for (let i = 0; i < intersections.length - 1; i++) {
      const midDist = Math.round(
        (intersections[i].distance + intersections[i + 1].distance) * 0.5
      );
      crosswalks.push({
        id: nextCrosswalkId++,
        distance: midDist,
        halfLength: 2.4,
        intersectionId: null
      });
    }
    if (intersections.length > 0) {
      const tailMid = intersections[intersections.length - 1].distance + 240;
      if (tailMid <= stage.length - 180) {
        crosswalks.push({
          id: nextCrosswalkId++,
          distance: tailMid,
          halfLength: 2.4,
          intersectionId: null
        });
      }
    }

    // Mid-block speed & wrong-lane cameras between intersections
    for (let i = 0; i < intersections.length; i++) {
      const midCamDist = intersections[i].distance + 260;
      if (midCamDist <= stage.length - 220) {
        cameras.push({
          id: nextCameraId++,
          distance: midCamDist,
          speedLimitKmh: stage.speedLimitKmh,
          monitorsWrongLane: true,
          intersectionId: null
        });
      }
    }

    crosswalks.sort((a, b) => a.distance - b.distance);
    cameras.sort((a, b) => a.distance - b.distance);
  }

  const features: StageRouteFeatures = {
    stageId: stage.id,
    intersections,
    crosswalks,
    cameras
  };
  ROUTE_FEATURES_CACHE.set(stageId, features);
  return features;
}

export function getTrafficLightState(
  zone: IntersectionZone,
  elapsedTime: number
): TrafficLightColor {
  const cycle = zone.greenDuration + zone.yellowDuration + zone.redDuration;
  if (cycle <= 0) return 'green';
  const raw = elapsedTime + zone.phaseOffset;
  const t = ((raw % cycle) + cycle) % cycle;
  if (t < zone.greenDuration) {
    return 'green';
  }
  if (t < zone.greenDuration + zone.yellowDuration) {
    return 'yellow';
  }
  return 'red';
}

export function getUpcomingIntersection(
  features: StageRouteFeatures,
  distance: number
): IntersectionZone | null {
  for (const zone of features.intersections) {
    if (zone.distance + zone.halfLength >= distance) {
      return zone;
    }
  }
  return null;
}

export function getUpcomingCamera(
  features: StageRouteFeatures,
  distance: number
): SpeedCameraZone | null {
  for (const cam of features.cameras) {
    if (cam.distance >= distance - 2) {
      return cam;
    }
  }
  return null;
}
