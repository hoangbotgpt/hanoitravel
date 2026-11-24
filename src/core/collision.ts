import { INVULNERABILITY_SECONDS } from '../config/gameConfig.ts';

/**
 * Checks 2D road-plane AABB overlap with optional vertical elevation tolerance
 * (useful on Stage 3's overpass so vehicles on different heights do not collide).
 */
export function checkAABBCollision(
  playerX: number,
  playerZ: number,
  playerHalfW: number,
  playerHalfL: number,
  obsX: number,
  obsZ: number,
  obsHalfW: number,
  obsHalfL: number,
  playerY = 0,
  obsY = 0,
  maxVerticalGap = 2.2
): boolean {
  if (
    !Number.isFinite(playerX) ||
    !Number.isFinite(playerZ) ||
    !Number.isFinite(obsX) ||
    !Number.isFinite(obsZ) ||
    !Number.isFinite(playerY) ||
    !Number.isFinite(obsY)
  ) {
    return false;
  }

  if (playerHalfW <= 0 || playerHalfL <= 0 || obsHalfW <= 0 || obsHalfL <= 0) {
    return false;
  }

  const overlapX = Math.abs(playerX - obsX) < playerHalfW + obsHalfW;
  const overlapZ = Math.abs(playerZ - obsZ) < playerHalfL + obsHalfL;
  const overlapY = Math.abs(playerY - obsY) <= maxVerticalGap;

  return overlapX && overlapZ && overlapY;
}

/**
 * Tracks post-hit invulnerability cooldown (default 1.2s) so a single contact
 * cannot drain the player's wallet across consecutive simulation frames.
 */
export class CollisionCooldown {
  private readonly duration: number;
  private remaining = 0;

  constructor(durationSeconds: number = INVULNERABILITY_SECONDS) {
    this.duration = Math.max(0, durationSeconds);
  }

  public isInvulnerable(): boolean {
    return this.remaining > 0;
  }

  public canCollide(): boolean {
    return this.remaining <= 0;
  }

  public getRemaining(): number {
    return this.remaining;
  }

  public getDuration(): number {
    return this.duration;
  }

  public getProgress(): number {
    if (this.duration <= 0) return 0;
    return Math.max(0, Math.min(1, this.remaining / this.duration));
  }

  public trigger(): void {
    this.remaining = this.duration;
  }

  public update(dt: number): void {
    if (!Number.isFinite(dt) || dt <= 0 || this.remaining <= 0) {
      return;
    }
    this.remaining = Math.max(0, this.remaining - dt);
  }

  public reset(): void {
    this.remaining = 0;
  }
}
