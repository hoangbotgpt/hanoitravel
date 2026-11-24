import {
  DIFFICULTIES,
  OBSTACLE_TYPES,
  STAGES,
  type DifficultyId,
  type ObstacleTypeId
} from '../config/gameConfig.ts';

export interface CollisionPenaltyResult {
  wallet: number;
  penalty: number;
  deducted: number;
  bankrupt: boolean;
}

export interface StageRewardResult {
  stageId: number;
  wallet: number;
  baseReward: number;
  perfectBonus: number;
  totalReward: number;
}

/**
 * Creates a fresh starting wallet in VND for the chosen difficulty.
 */
export function createWallet(difficultyId: DifficultyId): number {
  return DIFFICULTIES[difficultyId].startingWallet;
}

/**
 * Returns true when the wallet has hit 0 VND or below.
 */
export function isBankrupt(wallet: number): boolean {
  return !Number.isFinite(wallet) || wallet <= 0;
}

/**
 * Computes the VND penalty for colliding with a given obstacle at a difficulty.
 */
export function calculateCollisionPenalty(
  obstacleType: ObstacleTypeId,
  difficultyId: DifficultyId
): number {
  const basePenalty = OBSTACLE_TYPES[obstacleType].penalty;
  const multiplier = DIFFICULTIES[difficultyId].penaltyMultiplier;
  return Math.max(0, Math.round(basePenalty * multiplier));
}

/**
 * Deducts the collision penalty from the wallet, clamping at 0 VND.
 */
export function applyCollisionPenalty(
  wallet: number,
  obstacleType: ObstacleTypeId,
  difficultyId: DifficultyId
): CollisionPenaltyResult {
  const safeWallet = Number.isFinite(wallet) ? Math.max(0, Math.round(wallet)) : 0;
  const penalty = calculateCollisionPenalty(obstacleType, difficultyId);
  const nextWallet = Math.max(0, safeWallet - penalty);
  const deducted = safeWallet - nextWallet;

  return {
    wallet: nextWallet,
    penalty,
    deducted,
    bankrupt: isBankrupt(nextWallet)
  };
}

/**
 * Awards stage completion payout plus a no-hit perfect bonus when hitsInStage === 0.
 */
export function applyStageReward(
  wallet: number,
  stageId: number,
  difficultyId: DifficultyId,
  hitsInStage: number
): StageRewardResult {
  const safeWallet = Number.isFinite(wallet) ? Math.max(0, Math.round(wallet)) : 0;
  const diff = DIFFICULTIES[difficultyId];
  const validStage = STAGES.find((s) => s.id === stageId);
  const resolvedStageId = validStage ? validStage.id : stageId;

  const baseReward = diff.stageReward;
  const cleanHits = Math.max(0, Math.floor(hitsInStage));
  const perfectBonus = cleanHits === 0 ? diff.perfectBonus : 0;
  const totalReward = baseReward + perfectBonus;

  return {
    stageId: resolvedStageId,
    wallet: safeWallet + totalReward,
    baseReward,
    perfectBonus,
    totalReward
  };
}

/**
 * Formats an amount in VND using dot thousands separators (e.g., "350.000 đ").
 */
export function formatVND(amount: number): string {
  const clamped = Number.isFinite(amount) ? Math.max(0, Math.round(amount)) : 0;
  const formatted = clamped.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${formatted} đ`;
}
