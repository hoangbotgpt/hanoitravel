import { describe, expect, it } from 'vitest';
import { DIFFICULTIES, OBSTACLE_TYPES } from '../config/gameConfig';
import {
  applyCollisionPenalty,
  applyStageReward,
  calculateCollisionPenalty,
  createWallet,
  formatVND,
  isBankrupt
} from '../core/economy';

describe('economy', () => {
  it('initializes distinct starting wallets for Easy, Medium, and Hard', () => {
    expect(createWallet('easy')).toBe(DIFFICULTIES.easy.startingWallet);
    expect(createWallet('medium')).toBe(DIFFICULTIES.medium.startingWallet);
    expect(createWallet('hard')).toBe(DIFFICULTIES.hard.startingWallet);

    expect(createWallet('easy')).toBe(500_000);
    expect(createWallet('medium')).toBe(350_000);
    expect(createWallet('hard')).toBe(250_000);
  });

  it('scales collision penalties by difficulty and clamps wallet at 0 VND', () => {
    const busEasy = calculateCollisionPenalty('bus', 'easy');
    const busMed = calculateCollisionPenalty('bus', 'medium');
    const busHard = calculateCollisionPenalty('bus', 'hard');

    expect(busEasy).toBe(Math.round(OBSTACLE_TYPES.bus.penalty * DIFFICULTIES.easy.penaltyMultiplier));
    expect(busMed).toBe(OBSTACLE_TYPES.bus.penalty);
    expect(busHard).toBe(Math.round(OBSTACLE_TYPES.bus.penalty * DIFFICULTIES.hard.penaltyMultiplier));
    expect(busEasy).toBeLessThan(busMed);
    expect(busMed).toBeLessThan(busHard);

    // Partial deduction without bankruptcy
    const partial = applyCollisionPenalty(200_000, 'car', 'medium');
    expect(partial.penalty).toBe(75_000);
    expect(partial.deducted).toBe(75_000);
    expect(partial.wallet).toBe(125_000);
    expect(partial.bankrupt).toBe(false);

    // Non-negative clamp & bankruptcy detection when penalty exceeds wallet
    const drained = applyCollisionPenalty(50_000, 'bus', 'hard');
    expect(drained.penalty).toBe(130_000);
    expect(drained.deducted).toBe(50_000);
    expect(drained.wallet).toBe(0);
    expect(drained.bankrupt).toBe(true);
  });

  it('detects bankruptcy strictly at <= 0 or non-finite values', () => {
    expect(isBankrupt(1)).toBe(false);
    expect(isBankrupt(0)).toBe(true);
    expect(isBankrupt(-10_000)).toBe(true);
    expect(isBankrupt(Number.NaN)).toBe(true);
    expect(isBankrupt(Number.POSITIVE_INFINITY)).toBe(true);
  });

  it('grants stage completion reward and perfect-run bonus only when hitsInStage === 0', () => {
    const perfectEasy = applyStageReward(400_000, 1, 'easy', 0);
    expect(perfectEasy.baseReward).toBe(DIFFICULTIES.easy.stageReward);
    expect(perfectEasy.perfectBonus).toBe(DIFFICULTIES.easy.perfectBonus);
    expect(perfectEasy.totalReward).toBe(170_000);
    expect(perfectEasy.wallet).toBe(570_000);

    const hitMedium = applyStageReward(275_000, 2, 'medium', 2);
    expect(hitMedium.baseReward).toBe(DIFFICULTIES.medium.stageReward);
    expect(hitMedium.perfectBonus).toBe(0);
    expect(hitMedium.totalReward).toBe(150_000);
    expect(hitMedium.wallet).toBe(425_000);

    const perfectHard = applyStageReward(100_000, 3, 'hard', 0);
    expect(perfectHard.baseReward).toBe(DIFFICULTIES.hard.stageReward);
    expect(perfectHard.perfectBonus).toBe(DIFFICULTIES.hard.perfectBonus);
    expect(perfectHard.totalReward).toBe(300_000);
    expect(perfectHard.wallet).toBe(400_000);
  });

  it('formats VND amounts cleanly with dot thousands separators', () => {
    expect(formatVND(0)).toBe('0 đ');
    expect(formatVND(-5000)).toBe('0 đ');
    expect(formatVND(350_000)).toBe('350.000 đ');
    expect(formatVND(1_250_000)).toBe('1.250.000 đ');
  });
});
