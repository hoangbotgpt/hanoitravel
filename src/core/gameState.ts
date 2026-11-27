import {
  BIKES,
  STAGES,
  type BikeId,
  type DifficultyId,
  type ObstacleTypeId,
  type StageId,
  type StageSpec
} from '../config/gameConfig.ts';
import { applyCollisionPenalty, applyStageReward, createWallet } from './economy.ts';
import { getRoadProgress } from './roadMath.ts';
import type { ColdFineSettlement, RecordedViolation } from './violations.ts';
import { settleColdFinesAtFinish } from './violations.ts';

export type GameScreen =
  | 'menu'
  | 'playing'
  | 'paused'
  | 'stage_clear'
  | 'game_over'
  | 'victory';

export interface GameSessionState {
  screen: GameScreen;
  bikeId: BikeId;
  difficultyId: DifficultyId;
  stageIndex: number;
  stageId: StageId;
  wallet: number;
  distance: number;
  progress: number;
  speed: number;
  hitsInStage: number;
  totalHits: number;
  comboSeconds: number;
  lastPenalty: number;
  lastObstacleHit: ObstacleTypeId | null;
  lastStageReward: number;
  lastPerfectBonus: number;
  lastColdFineSettlement: ColdFineSettlement | null;
  elapsedStageTime: number;
  totalRunTime: number;
}

export interface SessionCollisionOutcome {
  state: GameSessionState;
  applied: boolean;
  penalty: number;
  bankrupt: boolean;
}

export interface StageCompletionOutcome {
  state: GameSessionState;
  completed: boolean;
  baseReward: number;
  perfectBonus: number;
  totalReward: number;
  settlement: ColdFineSettlement | null;
  bankrupt: boolean;
  isFinalStage: boolean;
}

/**
 * Creates a completely clean session state with zero leftover timers, hits, or progress.
 */
export function resetSession(
  bikeId: BikeId,
  difficultyId: DifficultyId,
  initialScreen: GameScreen = 'playing',
  initialStageId: StageId = 1
): GameSessionState {
  const stageIdx = Math.max(
    0,
    STAGES.findIndex((s) => s.id === initialStageId)
  );
  const startStage = STAGES[stageIdx] ?? STAGES[0];
  const initialSpeed = initialScreen === 'playing' ? BIKES[bikeId].minCruiseSpeed : 0;

  return {
    screen: initialScreen,
    bikeId,
    difficultyId,
    stageIndex: stageIdx,
    stageId: startStage.id,
    wallet: createWallet(difficultyId),
    distance: 0,
    progress: 0,
    speed: initialSpeed,
    hitsInStage: 0,
    totalHits: 0,
    comboSeconds: 0,
    lastPenalty: 0,
    lastObstacleHit: null,
    lastStageReward: 0,
    lastPerfectBonus: 0,
    lastColdFineSettlement: null,
    elapsedStageTime: 0,
    totalRunTime: 0
  };
}

/**
 * Creates initial menu state before a delivery run starts.
 */
export function createInitialGameState(
  bikeId: BikeId = 'honda',
  difficultyId: DifficultyId = 'medium',
  initialStageId: StageId = 1
): GameSessionState {
  return resetSession(bikeId, difficultyId, 'menu', initialStageId);
}

export function getCurrentStageSpec(state: GameSessionState): StageSpec {
  const safeIdx = Math.max(0, Math.min(STAGES.length - 1, state.stageIndex));
  return STAGES[safeIdx];
}

export function startNewGame(
  bikeId: BikeId,
  difficultyId: DifficultyId,
  initialStageId: StageId = 1
): GameSessionState {
  return resetSession(bikeId, difficultyId, 'playing', initialStageId);
}

export function returnToMenu(state: GameSessionState): GameSessionState {
  return resetSession(state.bikeId, state.difficultyId, 'menu', state.stageId);
}

export function pauseGame(state: GameSessionState): GameSessionState {
  if (state.screen !== 'playing') return state;
  return { ...state, screen: 'paused' };
}

export function resumeGame(state: GameSessionState): GameSessionState {
  if (state.screen !== 'paused') return state;
  return { ...state, screen: 'playing' };
}

export function togglePause(state: GameSessionState): GameSessionState {
  if (state.screen === 'playing') return pauseGame(state);
  if (state.screen === 'paused') return resumeGame(state);
  return state;
}

export function updateDistanceProgress(
  state: GameSessionState,
  distance: number,
  speed: number,
  dt: number
): GameSessionState {
  if (state.screen !== 'playing') return state;

  const stage = getCurrentStageSpec(state);
  const clampedDistance = Math.max(0, Math.min(stage.length, distance));
  const safeDt = Number.isFinite(dt) && dt > 0 ? dt : 0;

  return {
    ...state,
    distance: clampedDistance,
    progress: getRoadProgress(clampedDistance, stage.length),
    speed: Math.max(0, speed),
    comboSeconds: state.comboSeconds + safeDt,
    elapsedStageTime: state.elapsedStageTime + safeDt,
    totalRunTime: state.totalRunTime + safeDt
  };
}

export function applySessionCollision(
  state: GameSessionState,
  obstacleType: ObstacleTypeId
): SessionCollisionOutcome {
  if (state.screen !== 'playing') {
    return {
      state,
      applied: false,
      penalty: 0,
      bankrupt: state.screen === 'game_over'
    };
  }

  const result = applyCollisionPenalty(state.wallet, obstacleType, state.difficultyId);
  const nextScreen: GameScreen = result.bankrupt ? 'game_over' : 'playing';

  return {
    state: {
      ...state,
      screen: nextScreen,
      wallet: result.wallet,
      hitsInStage: state.hitsInStage + 1,
      totalHits: state.totalHits + 1,
      comboSeconds: 0,
      lastPenalty: result.penalty,
      lastObstacleHit: obstacleType,
      speed: result.bankrupt ? 0 : state.speed
    },
    applied: true,
    penalty: result.penalty,
    bankrupt: result.bankrupt
  };
}

export function completeCurrentStage(
  state: GameSessionState,
  violations: ReadonlyArray<RecordedViolation> = []
): StageCompletionOutcome {
  if (state.screen !== 'playing') {
    return {
      state,
      completed: false,
      baseReward: 0,
      perfectBonus: 0,
      totalReward: 0,
      settlement: null,
      bankrupt: state.screen === 'game_over',
      isFinalStage: false
    };
  }

  const stage = getCurrentStageSpec(state);
  const reward = applyStageReward(
    state.wallet,
    stage.id,
    state.difficultyId,
    state.hitsInStage
  );
  const settlement = settleColdFinesAtFinish(
    state.wallet,
    reward.totalReward,
    violations
  );
  const bankrupt = settlement.bankruptByColdFines;
  const isFinalStage = !bankrupt && state.stageIndex >= STAGES.length - 1;
  const nextScreen: GameScreen = bankrupt
    ? 'game_over'
    : isFinalStage
      ? 'victory'
      : 'stage_clear';

  return {
    state: {
      ...state,
      screen: nextScreen,
      wallet: settlement.finalWallet,
      distance: stage.length,
      progress: 1,
      speed: 0,
      lastStageReward: reward.baseReward,
      lastPerfectBonus: reward.perfectBonus,
      lastColdFineSettlement: settlement
    },
    completed: true,
    baseReward: reward.baseReward,
    perfectBonus: reward.perfectBonus,
    totalReward: reward.totalReward,
    settlement,
    bankrupt,
    isFinalStage
  };
}

export function advanceToNextStage(state: GameSessionState): GameSessionState {
  if (state.screen !== 'stage_clear') return state;
  const nextIndex = state.stageIndex + 1;
  if (nextIndex >= STAGES.length) {
    return { ...state, screen: 'victory' };
  }

  const nextStage = STAGES[nextIndex];
  return {
    ...state,
    screen: 'playing',
    stageIndex: nextIndex,
    stageId: nextStage.id,
    distance: 0,
    progress: 0,
    speed: BIKES[state.bikeId].minCruiseSpeed,
    hitsInStage: 0,
    comboSeconds: 0,
    lastPenalty: 0,
    lastObstacleHit: null,
    lastStageReward: 0,
    lastPerfectBonus: 0,
    lastColdFineSettlement: null,
    elapsedStageTime: 0
  };
}
