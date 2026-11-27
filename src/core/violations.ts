import type { StageSpec } from '../config/gameConfig.ts';
import {
  getTrafficLightState,
  type StageRouteFeatures
} from './routeFeatures.ts';
import { isOncomingLane } from './trafficRules.ts';

export type ViolationType = 'speeding' | 'wrong_lane' | 'red_light';

export const COLD_FINE_AMOUNTS: Record<ViolationType, number> = {
  speeding: 100_000,
  wrong_lane: 120_000,
  red_light: 150_000
};

export const VIOLATION_LABELS: Record<ViolationType, string> = {
  speeding: 'Quá tốc độ',
  wrong_lane: 'Sai làn đường',
  red_light: 'Vượt đèn đỏ'
};

export interface RecordedViolation {
  id: number;
  type: ViolationType;
  label: string;
  amount: number;
  distanceMeters: number;
  cameraId: number | null;
  intersectionId: number | null;
  timestampSec: number;
  detail: string;
}

export interface ColdFineSettlement {
  currentWallet: number;
  grossReward: number;
  totalColdFines: number;
  netChange: number;
  rawBalance: number;
  finalWallet: number;
  bankruptByColdFines: boolean;
  violations: RecordedViolation[];
}

export interface ViolationEvalInput {
  prevDistance: number;
  distance: number;
  displayKmh: number;
  lateralOffset: number;
  elapsedTime: number;
  stage: StageSpec;
  features: StageRouteFeatures;
}

export class ColdFineTracker {
  private violations: RecordedViolation[] = [];
  private nextId = 1;
  private triggeredCameraKeys = new Set<string>();
  private triggeredIntersectionIds = new Set<number>();

  public reset(): void {
    this.violations = [];
    this.nextId = 1;
    this.triggeredCameraKeys.clear();
    this.triggeredIntersectionIds.clear();
  }

  public recordViolation(params: {
    type: ViolationType;
    distanceMeters: number;
    cameraId?: number | null;
    intersectionId?: number | null;
    timestampSec: number;
    detail?: string;
  }): RecordedViolation {
    const amount = COLD_FINE_AMOUNTS[params.type];
    const label = VIOLATION_LABELS[params.type];
    const v: RecordedViolation = {
      id: this.nextId++,
      type: params.type,
      label,
      amount,
      distanceMeters: Math.max(0, Math.round(params.distanceMeters)),
      cameraId: params.cameraId ?? null,
      intersectionId: params.intersectionId ?? null,
      timestampSec: Math.max(0, params.timestampSec),
      detail: params.detail ?? label
    };
    this.violations.push(v);
    return v;
  }

  public evaluateFrame(input: ViolationEvalInput): RecordedViolation[] {
    const {
      prevDistance,
      distance,
      displayKmh,
      lateralOffset,
      elapsedTime,
      features
    } = input;

    if (distance <= prevDistance) {
      return [];
    }

    const newlyRecorded: RecordedViolation[] = [];

    // 1. Speeding & wrong-lane checks at SpeedCameraZone gates
    for (const cam of features.cameras) {
      const crossed = prevDistance < cam.distance && distance >= cam.distance;
      if (!crossed) continue;

      if (displayKmh > cam.speedLimitKmh) {
        const key = `${cam.id}:speeding`;
        if (!this.triggeredCameraKeys.has(key)) {
          this.triggeredCameraKeys.add(key);
          newlyRecorded.push(
            this.recordViolation({
              type: 'speeding',
              distanceMeters: cam.distance,
              cameraId: cam.id,
              intersectionId: cam.intersectionId,
              timestampSec: elapsedTime,
              detail: `${Math.round(displayKmh)}/${cam.speedLimitKmh} km/h`
            })
          );
        }
      }

      if (cam.monitorsWrongLane && isOncomingLane(lateralOffset)) {
        const key = `${cam.id}:wrong_lane`;
        if (!this.triggeredCameraKeys.has(key)) {
          this.triggeredCameraKeys.add(key);
          newlyRecorded.push(
            this.recordViolation({
              type: 'wrong_lane',
              distanceMeters: cam.distance,
              cameraId: cam.id,
              intersectionId: cam.intersectionId,
              timestampSec: elapsedTime,
              detail: 'Đi ngược chiều qua camera'
            })
          );
        }
      }
    }

    // 2. Red-light violation when crossing stop line during red phase
    // Note: yellowDuration = 2.5s always precedes red to provide >=28m stopping warning.
    for (const zone of features.intersections) {
      if (this.triggeredIntersectionIds.has(zone.id)) continue;
      const crossedStop =
        prevDistance < zone.stopLineDistance && distance >= zone.stopLineDistance;
      if (!crossedStop) continue;

      const light = getTrafficLightState(zone, elapsedTime);
      if (light === 'red') {
        this.triggeredIntersectionIds.add(zone.id);
        newlyRecorded.push(
          this.recordViolation({
            type: 'red_light',
            distanceMeters: zone.stopLineDistance,
            intersectionId: zone.id,
            timestampSec: elapsedTime,
            detail: 'Vượt vạch dừng khi đèn đỏ'
          })
        );
      }
    }

    return newlyRecorded;
  }

  public getViolations(): RecordedViolation[] {
    return [...this.violations];
  }

  public getCount(): number {
    return this.violations.length;
  }

  public getTotalAmount(): number {
    return this.violations.reduce((sum, v) => sum + v.amount, 0);
  }
}

export function settleColdFinesAtFinish(
  currentWallet: number,
  grossReward: number,
  violations: ReadonlyArray<RecordedViolation>
): ColdFineSettlement {
  const safeWallet = Number.isFinite(currentWallet)
    ? Math.max(0, Math.round(currentWallet))
    : 0;
  const safeReward = Number.isFinite(grossReward)
    ? Math.max(0, Math.round(grossReward))
    : 0;
  const totalColdFines = violations.reduce(
    (sum, v) => sum + (Number.isFinite(v.amount) ? Math.max(0, Math.round(v.amount)) : 0),
    0
  );
  const netChange = safeReward - totalColdFines;
  const rawBalance = safeWallet + netChange;
  const bankruptByColdFines = rawBalance <= 0;
  const finalWallet = bankruptByColdFines ? 0 : rawBalance;

  return {
    currentWallet: safeWallet,
    grossReward: safeReward,
    totalColdFines,
    netChange,
    rawBalance,
    finalWallet,
    bankruptByColdFines,
    violations: [...violations]
  };
}
