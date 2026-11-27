import { describe, expect, it } from 'vitest';
import {
  BIKES,
  DIFFICULTIES,
  INVULNERABILITY_SECONDS,
  OBSTACLE_TYPES,
  PLAYER_HALF_L,
  PLAYER_HALF_W,
  STAGES
} from '../config/gameConfig';
import { CollisionCooldown, checkAABBCollision } from '../core/collision';
import {
  advanceToNextStage,
  applySessionCollision,
  completeCurrentStage,
  createInitialGameState,
  pauseGame,
  resetSession,
  resumeGame,
  startNewGame,
  togglePause,
  updateDistanceProgress
} from '../core/gameState';

describe('collision & gameState lifecycle', () => {
  it('detects 2D AABB overlap accurately and respects overpass vertical separation', () => {
    const car = OBSTACLE_TYPES.car;

    // Exact center overlap
    expect(
      checkAABBCollision(0, -100, PLAYER_HALF_W, PLAYER_HALF_L, 0, -100, car.halfW, car.halfL)
    ).toBe(true);

    // Separated laterally beyond combined half-widths
    const safeLateralGap = PLAYER_HALF_W + car.halfW + 0.05;
    expect(
      checkAABBCollision(
        safeLateralGap,
        -100,
        PLAYER_HALF_W,
        PLAYER_HALF_L,
        0,
        -100,
        car.halfW,
        car.halfL
      )
    ).toBe(false);

    // Separated longitudinally beyond combined half-lengths
    const safeLongitudinalGap = PLAYER_HALF_L + car.halfL + 0.05;
    expect(
      checkAABBCollision(
        0,
        -100 + safeLongitudinalGap,
        PLAYER_HALF_W,
        PLAYER_HALF_L,
        0,
        -100,
        car.halfW,
        car.halfL
      )
    ).toBe(false);

    // Stage 3 overpass vertical separation (> 2.2m gap) does not collide
    expect(
      checkAABBCollision(
        0,
        -900,
        PLAYER_HALF_W,
        PLAYER_HALF_L,
        0,
        -900,
        car.halfW,
        car.halfL,
        5.6,
        0
      )
    ).toBe(false);

    // Invalid inputs return false safely
    expect(
      checkAABBCollision(
        Number.NaN,
        -100,
        PLAYER_HALF_W,
        PLAYER_HALF_L,
        0,
        -100,
        car.halfW,
        car.halfL
      )
    ).toBe(false);
  });

  it('enforces 1.2s invulnerability window so one hit does not drain wallet across consecutive frames', () => {
    const cooldown = new CollisionCooldown();
    expect(cooldown.getDuration()).toBe(INVULNERABILITY_SECONDS);
    expect(cooldown.canCollide()).toBe(true);
    expect(cooldown.isInvulnerable()).toBe(false);

    let session = startNewGame('honda', 'medium');
    const startingWallet = session.wallet;
    let hitsApplied = 0;

    // Simulate 60fps frames over 1.0s while continuously overlapping a bus
    for (let frame = 0; frame < 60; frame += 1) {
      const dt = 1 / 60;
      const overlapped = checkAABBCollision(
        0,
        -50,
        PLAYER_HALF_W,
        PLAYER_HALF_L,
        0,
        -50,
        OBSTACLE_TYPES.bus.halfW,
        OBSTACLE_TYPES.bus.halfL
      );

      if (overlapped && cooldown.canCollide()) {
        const outcome = applySessionCollision(session, 'bus');
        session = outcome.state;
        cooldown.trigger();
        hitsApplied += 1;
      }
      cooldown.update(dt);
    }

    expect(hitsApplied).toBe(1);
    expect(session.hitsInStage).toBe(1);
    expect(session.wallet).toBe(startingWallet - OBSTACLE_TYPES.bus.penalty);
    expect(cooldown.isInvulnerable()).toBe(true);

    // Advance remaining 0.25s -> invulnerability expires and next hit is allowed
    cooldown.update(0.25);
    expect(cooldown.isInvulnerable()).toBe(false);
    expect(cooldown.canCollide()).toBe(true);
  });

  it('transitions through 9 stages A->B to Victory and resets cleanly on Restart after Game Over', () => {
    const initial = createInitialGameState('vinfast', 'hard');
    expect(initial.screen).toBe('menu');

    let state = startNewGame('vinfast', 'hard');
    expect(state.screen).toBe('playing');
    expect(state.stageId).toBe(1);
    expect(state.wallet).toBe(DIFFICULTIES.hard.startingWallet);
    expect(state.speed).toBe(BIKES.vinfast.minCruiseSpeed);

    // Pause and resume round-trip
    state = togglePause(state);
    expect(state.screen).toBe('paused');
    state = resumeGame(state);
    expect(state.screen).toBe('playing');
    state = pauseGame(state);
    expect(state.screen).toBe('paused');
    state = togglePause(state);
    expect(state.screen).toBe('playing');

    // Progress through Stage 1 -> Stage 2 -> Stage 3 -> Victory
    for (const [idx, stage] of STAGES.entries()) {
      expect(state.stageId).toBe(stage.id);
      state = updateDistanceProgress(state, stage.length, BIKES.vinfast.maxSpeed, 25);
      expect(state.progress).toBe(1);

      const cleared = completeCurrentStage(state);
      expect(cleared.completed).toBe(true);
      expect(cleared.perfectBonus).toBe(DIFFICULTIES.hard.perfectBonus);
      state = cleared.state;

      if (idx < STAGES.length - 1) {
        expect(state.screen).toBe('stage_clear');
        state = advanceToNextStage(state);
        expect(state.screen).toBe('playing');
        expect(state.distance).toBe(0);
        expect(state.hitsInStage).toBe(0);
      } else {
        expect(state.screen).toBe('victory');
      }
    }

    // Now test Game Over at 0 VND and clean Restart
    let doomed = startNewGame('honda', 'hard'); // 250,000đ
    const busHardPenalty = Math.round(OBSTACLE_TYPES.bus.penalty * DIFFICULTIES.hard.penaltyMultiplier); // 130,000đ
    doomed = updateDistanceProgress(doomed, 320, 45, 8);

    const hit1 = applySessionCollision(doomed, 'bus');
    expect(hit1.bankrupt).toBe(false);
    expect(hit1.state.wallet).toBe(250_000 - busHardPenalty);
    expect(hit1.state.screen).toBe('playing');

    const hit2 = applySessionCollision(hit1.state, 'bus');
    expect(hit2.bankrupt).toBe(true);
    expect(hit2.state.wallet).toBe(0);
    expect(hit2.state.screen).toBe('game_over');
    expect(hit2.state.speed).toBe(0);

    // Extra collision while already in game_over is ignored
    const ignored = applySessionCollision(hit2.state, 'car');
    expect(ignored.applied).toBe(false);
    expect(ignored.state.wallet).toBe(0);

    // Restart produces spotless initial state
    const restarted = resetSession('honda', 'easy', 'playing');
    expect(restarted.screen).toBe('playing');
    expect(restarted.bikeId).toBe('honda');
    expect(restarted.difficultyId).toBe('easy');
    expect(restarted.stageId).toBe(1);
    expect(restarted.stageIndex).toBe(0);
    expect(restarted.wallet).toBe(DIFFICULTIES.easy.startingWallet);
    expect(restarted.distance).toBe(0);
    expect(restarted.progress).toBe(0);
    expect(restarted.hitsInStage).toBe(0);
    expect(restarted.totalHits).toBe(0);
    expect(restarted.comboSeconds).toBe(0);
    expect(restarted.lastPenalty).toBe(0);
    expect(restarted.lastObstacleHit).toBeNull();
    expect(restarted.elapsedStageTime).toBe(0);
    expect(restarted.totalRunTime).toBe(0);
  });
});
