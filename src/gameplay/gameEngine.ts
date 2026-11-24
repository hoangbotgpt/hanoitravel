import * as THREE from 'three';
import {
  BIKES,
  type BikeId,
  type DifficultyId,
  type ObstacleTypeId
} from '../config/gameConfig.ts';
import { CollisionCooldown } from '../core/collision.ts';
import type { CrashPhase } from '../core/crashSequence.ts';
import {
  advanceToNextStage,
  applySessionCollision,
  completeCurrentStage,
  createInitialGameState,
  getCurrentStageSpec,
  pauseGame,
  resetSession,
  resumeGame,
  returnToMenu,
  updateDistanceProgress,
  type GameScreen,
  type GameSessionState
} from '../core/gameState.ts';
import {
  distanceToWorldZ,
  getRoadCenterX,
  getRoadElevationY
} from '../core/roadMath.ts';
import { HudController } from '../ui/hudController.ts';
import { loadPlayerBike } from '../world/bikeLoader.ts';
import { CrashEffectsManager } from '../world/crashEffects.ts';
import { MenuShowroom } from '../world/menuShowroom.ts';
import { RetroPostPipeline } from '../world/retroPostProcessing.ts';
import { HanoiWorldManager } from '../world/worldManager.ts';
import { AudioManager } from './audioManager.ts';
import { PlayerController } from './playerController.ts';
import { TrafficSpawner } from './trafficSpawner.ts';

export interface HanoiDebugSnapshot {
  screen: GameScreen;
  stageId: 1 | 2 | 3;
  progress: number;
  distance: number;
  stageLength: number;
  wallet: number;
  speed: number;
  displayKmh: number;
  bikeId: BikeId;
  difficultyId: DifficultyId;
  hitsInStage: number;
  totalHits: number;
  invulnerableRemaining: number;
  fps: number;
  loadTimeMs: number;
  consoleErrors: number;
  activeObstacles: number;
  oncomingCount: number;
  sameDirCount: number;
  roadWidth: number;
  laneCount: 2 | 4 | 6;
  vehicleCounts: Record<ObstacleTypeId, number>;
  crashPhase: CrashPhase;
  isRecovering: boolean;
  lateralOffset: number;
  muted: boolean;
  volume: number;
  retroEnabled: boolean;
  ready: boolean;
}

export interface HanoiDebugApi {
  readonly screen: GameScreen;
  readonly stageId: 1 | 2 | 3;
  readonly progress: number;
  readonly wallet: number;
  readonly speed: number;
  readonly bikeId: BikeId;
  readonly difficultyId: DifficultyId;
  readonly fps: number;
  readonly loadTimeMs: number;
  readonly consoleErrors: number;
  readonly activeObstacles: number;
  readonly oncomingCount: number;
  readonly sameDirCount: number;
  readonly roadWidth: number;
  readonly laneCount: 2 | 4 | 6;
  readonly vehicleCounts: Record<ObstacleTypeId, number>;
  readonly crashPhase: CrashPhase;
  readonly isRecovering: boolean;
  advanceToStageEnd: (offsetMetersFromEnd?: number) => HanoiDebugSnapshot;
  forceCollision: (
    obstacleType?: ObstacleTypeId,
    obstacleLateralOffset?: number
  ) => { applied: boolean; penalty: number; wallet: number; screen: GameScreen };
  getState: () => HanoiDebugSnapshot;
}

declare global {
  interface Window {
    __HANOI_DEBUG__?: HanoiDebugApi;
  }
}

/** Menu turntable yaw: 3/4 front view of bike + rider facing toward the camera's left. */
const MENU_YAW_BASE = 2.25;

export class GameEngine {
  private readonly canvas: HTMLCanvasElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly postPipeline: RetroPostPipeline;

  private readonly worldManager: HanoiWorldManager;
  private readonly playerController: PlayerController;
  private readonly trafficSpawner: TrafficSpawner;
  private readonly crashEffects: CrashEffectsManager;
  private readonly showroom: MenuShowroom;
  private readonly audioManager: AudioManager;
  private readonly cooldown: CollisionCooldown;
  private readonly hud: HudController;

  private state: GameSessionState;
  private bikeModels: Partial<Record<BikeId, THREE.Group>> = {};
  private activeBikeGroup: THREE.Group | null = null;
  private ready = false;
  private loadTimeMs = 0;
  private readonly bootTime = performance.now();

  private rafId: number | null = null;
  private lastFrameTime = 0;
  private menuSpinAngle = MENU_YAW_BASE;
  private menuSpinElapsed = 0;
  private displayKmh = 0;
  private skidSparkAccum = 0;

  private lastViewportW = 0;
  private lastViewportH = 0;
  private lastDpr = 1;

  // FPS sampling
  private fps = 60;
  private fpsFrames = 0;
  private fpsWindowStart = performance.now();

  // Console/runtime error tracking
  private consoleErrors = 0;
  private originalConsoleError: typeof console.error | null = null;

  private readonly onResizeBound = (): void => this.resizeViewport();
  private readonly onKeyDownBound = (e: KeyboardEvent): void =>
    this.handleKeyDown(e);
  private readonly onKeyUpBound = (e: KeyboardEvent): void =>
    this.handleKeyUp(e);
  private readonly onBlurBound = (): void => {
    this.playerController.clearInput();
  };
  private readonly onPointerUnlockBound = (): void => {
    this.audioManager.unlock();
  };
  private readonly onWindowErrorBound = (): void => {
    this.consoleErrors += 1;
  };

  constructor(canvasId = 'game-canvas') {
    const canvasEl = document.getElementById(canvasId);
    if (!(canvasEl instanceof HTMLCanvasElement)) {
      throw new Error(`Canvas #${canvasId} not found`);
    }
    this.canvas = canvasEl;

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.2, 360);
    this.postPipeline = new RetroPostPipeline(this.renderer, this.scene, this.camera);

    this.state = createInitialGameState('honda', 'medium');
    this.worldManager = new HanoiWorldManager(this.scene, this.renderer);
    this.playerController = new PlayerController(this.state.bikeId);
    this.trafficSpawner = new TrafficSpawner(this.scene);
    this.crashEffects = new CrashEffectsManager(this.scene);
    this.showroom = new MenuShowroom(this.scene);
    this.audioManager = new AudioManager();
    this.cooldown = new CollisionCooldown();

    this.hud = new HudController({
      onSelectBike: (bikeId) => {
        this.audioManager.unlock();
        this.selectBike(bikeId);
      },
      onSelectDifficulty: (diffId) => {
        this.audioManager.unlock();
        this.selectDifficulty(diffId);
      },
      onStartGame: () => {
        this.audioManager.unlock();
        this.startDeliveryRun();
      },
      onTogglePause: () => {
        this.audioManager.unlock();
        this.togglePauseState();
      },
      onNextStage: () => {
        this.audioManager.unlock();
        this.goToNextStage();
      },
      onRestart: () => {
        this.audioManager.unlock();
        this.restartCleanRun();
      },
      onReturnToMenu: () => {
        this.audioManager.unlock();
        this.backToMenu();
      },
      onToggleMute: () => {
        this.audioManager.unlock();
        const muted = this.audioManager.toggleMute();
        this.hud.syncAudioUI(muted, this.audioManager.getVolume());
      },
      onVolumeChange: (volume) => {
        this.audioManager.unlock();
        this.audioManager.setVolume(volume);
        if (volume > 0 && this.audioManager.isMuted()) {
          this.audioManager.setMuted(false);
        }
        this.hud.syncAudioUI(
          this.audioManager.isMuted(),
          this.audioManager.getVolume()
        );
      },
      onToggleRetroEffect: () => {
        const next = !this.postPipeline.isEnabled();
        this.postPipeline.setEnabled(next);
        return next;
      },
      onTouchInput: (partial) => {
        this.audioManager.unlock();
        this.playerController.setInputState(partial);
      },
      onHorn: () => {
        this.audioManager.unlock();
        if (this.state.screen === 'playing') {
          this.audioManager.playHorn();
        }
      }
    });

    this.hud.syncAudioUI(
      this.audioManager.isMuted(),
      this.audioManager.getVolume()
    );

    this.resizeViewport();
    window.addEventListener('resize', this.onResizeBound);
    this.installErrorListeners();
    this.exposeDebugApi();
  }

  public resizeViewport(): void {
    const w = Math.max(320, window.innerWidth || 1280);
    const h = Math.max(240, window.innerHeight || 720);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    if (w === this.lastViewportW && h === this.lastViewportH && dpr === this.lastDpr) {
      return;
    }
    this.lastViewportW = w;
    this.lastViewportH = h;
    this.lastDpr = dpr;

    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.postPipeline.setSize(w, h, dpr);

    const aspect = w / h;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();

    if (this.state.screen === 'menu') {
      this.positionMenuCamera();
    }
  }

  public async init(): Promise<void> {
    // Build Stage 1 Old Quarter backdrop immediately for the menu showroom
    this.worldManager.buildStage(1);
    this.worldManager.setMenuLighting(true);
    this.positionMenuCamera();

    // Load both motorbikes + driver in parallel
    const [hondaGroup, vinfastGroup] = await Promise.all([
      loadPlayerBike('honda'),
      loadPlayerBike('vinfast')
    ]);
    this.bikeModels.honda = hondaGroup;
    this.bikeModels.vinfast = vinfastGroup;

    this.attachActiveBike(this.state.bikeId);
    if (this.state.screen === 'menu') {
      this.positionMenuCamera();
    } else {
      this.playerController.syncBikeTransform();
    }
    this.ready = true;
    this.loadTimeMs = Math.round(performance.now() - this.bootTime);

    window.addEventListener('keydown', this.onKeyDownBound);
    window.addEventListener('keyup', this.onKeyUpBound);
    window.addEventListener('blur', this.onBlurBound);
    window.addEventListener('pointerdown', this.onPointerUnlockBound, {
      passive: true
    });

    this.renderHud();
    this.lastFrameTime = performance.now();
    this.fpsWindowStart = this.lastFrameTime;
    this.loop(this.lastFrameTime);
  }

  private installErrorListeners(): void {
    window.addEventListener('error', this.onWindowErrorBound);
    window.addEventListener('unhandledrejection', this.onWindowErrorBound);
    this.originalConsoleError = console.error.bind(console);
    console.error = (...args: unknown[]): void => {
      this.consoleErrors += 1;
      this.originalConsoleError?.(...args);
    };
  }

  private attachActiveBike(bikeId: BikeId): void {
    if (this.activeBikeGroup) {
      this.scene.remove(this.activeBikeGroup);
    }
    const model = this.bikeModels[bikeId] ?? null;
    this.activeBikeGroup = model;
    if (model) {
      model.visible = true;
      this.scene.add(model);
    }
    this.playerController.setBike(bikeId, model);
  }

  private selectBike(bikeId: BikeId): void {
    if (this.state.screen !== 'menu') return;
    this.state = { ...this.state, bikeId };
    this.attachActiveBike(bikeId);
    this.renderHud();
  }

  private selectDifficulty(difficultyId: DifficultyId): void {
    if (this.state.screen !== 'menu') return;
    this.state = createInitialGameState(this.state.bikeId, difficultyId);
    this.renderHud();
  }

  private startDeliveryRun(): void {
    this.restartCleanRun();
  }

  private restartCleanRun(): void {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    const { bikeId, difficultyId } = this.state;
    this.state = resetSession(bikeId, difficultyId, 'playing');
    this.cooldown.reset();
    this.crashEffects.clear();
    this.skidSparkAccum = 0;
    this.hud.hidePenaltyToast();

    this.worldManager.buildStage(1);
    this.worldManager.setMenuLighting(false);
    this.showroom.setVisible(false);
    this.attachActiveBike(bikeId);
    this.playerController.resetForStage(1, this.camera);
    this.trafficSpawner.reset(1, difficultyId);
    this.displayKmh = Math.round(
      (this.playerController.getPose().speed / BIKES[bikeId].maxSpeed) *
        BIKES[bikeId].displayMaxKmh
    );
    this.renderHud();
  }

  private goToNextStage(): void {
    if (this.state.screen !== 'stage_clear') return;
    this.state = advanceToNextStage(this.state);
    if (this.state.screen !== 'playing') {
      this.renderHud();
      return;
    }

    const stage = getCurrentStageSpec(this.state);
    this.cooldown.reset();
    this.crashEffects.clear();
    this.skidSparkAccum = 0;
    this.hud.hidePenaltyToast();
    this.worldManager.buildStage(stage.id);
    this.worldManager.setMenuLighting(false);
    this.showroom.setVisible(false);
    this.attachActiveBike(this.state.bikeId);
    this.playerController.resetForStage(stage.id, this.camera);
    this.trafficSpawner.reset(stage.id, this.state.difficultyId);
    this.renderHud();
  }

  private backToMenu(): void {
    this.state = returnToMenu(this.state);
    this.displayKmh = 0;
    this.cooldown.reset();
    this.crashEffects.clear();
    this.skidSparkAccum = 0;
    this.hud.hidePenaltyToast();
    this.trafficSpawner.clearAll();
    this.playerController.clearInput();
    this.audioManager.updateEngine(0, false);

    this.worldManager.buildStage(1);
    this.worldManager.setMenuLighting(true);
    this.attachActiveBike(this.state.bikeId);
    this.positionMenuCamera();
    this.renderHud();
  }

  private togglePauseState(): void {
    if (this.state.screen === 'playing') {
      this.state = pauseGame(this.state);
      this.playerController.clearInput();
      this.audioManager.updateEngine(0, false);
      this.renderHud();
    } else if (this.state.screen === 'paused') {
      this.state = resumeGame(this.state);
      this.lastFrameTime = performance.now();
      this.renderHud();
    }
  }

  private positionMenuCamera(): void {
    const centerX = getRoadCenterX(1, 0);
    const groundY = getRoadElevationY(1, 0);
    const bikeZ = distanceToWorldZ(4);

    this.showroom.setVisible(this.state.screen === 'menu');
    this.showroom.place(this.activeBikeGroup, centerX, groundY, bikeZ, this.menuSpinAngle);
    if (this.activeBikeGroup) {
      this.activeBikeGroup.visible = true;
    }

    const aspect = Math.max(1.1, this.camera.aspect || 16 / 9);
    // Keep the bike framed right of the menu panel, slightly above eye level of the rider
    const camOffsetX = aspect < 1.55 ? 0.2 : 0.35;
    const lookOffsetX = aspect < 1.55 ? -1.0 : -1.25;

    this.camera.fov = 40;
    this.camera.updateProjectionMatrix();
    this.camera.up.set(0, 1, 0);
    this.camera.position.set(centerX + camOffsetX, groundY + 1.72, bikeZ + 4.6);
    this.camera.lookAt(centerX + lookOffsetX, groundY + 0.78, bikeZ - 0.1);
  }

  private handleKeyDown(e: KeyboardEvent): void {
    this.audioManager.unlock();

    if (e.code === 'Escape' || e.code === 'KeyP') {
      if (this.state.screen === 'playing' || this.state.screen === 'paused') {
        e.preventDefault();
        this.togglePauseState();
        return;
      }
    }

    // Enter / Space shortcut on Stage Clear modal
    if (
      this.state.screen === 'stage_clear' &&
      (e.code === 'Enter' || e.code === 'Space')
    ) {
      e.preventDefault();
      this.goToNextStage();
      return;
    }

    if (this.state.screen !== 'playing') return;

    if (e.code === 'Space') {
      e.preventDefault();
      if (!e.repeat) {
        this.audioManager.playHorn();
      }
      return;
    }

    if (this.playerController.handleKeyDown(e.code)) {
      if (e.code.startsWith('Arrow')) {
        e.preventDefault();
      }
    }
  }

  private handleKeyUp(e: KeyboardEvent): void {
    this.playerController.handleKeyUp(e.code);
  }

  private handleCollision(
    obstacleType: ObstacleTypeId,
    obstacleLateralOffset = 0
  ): {
    applied: boolean;
    penalty: number;
    wallet: number;
    screen: GameScreen;
  } {
    if (
      this.state.screen !== 'playing' ||
      !this.cooldown.canCollide() ||
      this.playerController.isCrashRecovering()
    ) {
      return {
        applied: false,
        penalty: 0,
        wallet: this.state.wallet,
        screen: this.state.screen
      };
    }

    const outcome = applySessionCollision(this.state, obstacleType);
    this.state = outcome.state;
    if (!outcome.applied) {
      return {
        applied: false,
        penalty: 0,
        wallet: this.state.wallet,
        screen: this.state.screen
      };
    }

    const stage = getCurrentStageSpec(this.state);
    const impact = this.playerController.triggerRoadRashCrash(
      obstacleLateralOffset,
      stage.length,
      outcome.bankrupt
    );
    this.crashEffects.spawnImpactBurst(
      impact.worldX,
      impact.worldY,
      impact.worldZ,
      impact.fallSide
    );
    this.skidSparkAccum = 0;
    this.displayKmh = 0;
    this.postPipeline.triggerDamageFlash(1.0);
    this.hud.showPenaltyToast(obstacleType, outcome.penalty);

    if (outcome.bankrupt) {
      this.audioManager.updateEngine(0, false);
      this.audioManager.playCrash();
      this.audioManager.playGameOver();
      this.playerController.clearInput();
      if (this.activeBikeGroup) {
        this.activeBikeGroup.visible = true;
      }
    } else {
      this.audioManager.playCrash();
    }

    this.renderHud();
    return {
      applied: true,
      penalty: outcome.penalty,
      wallet: this.state.wallet,
      screen: this.state.screen
    };
  }

  private finishCurrentStage(): void {
    const outcome = completeCurrentStage(this.state);
    if (!outcome.completed) return;

    this.state = outcome.state;
    this.displayKmh = 0;
    this.playerController.clearInput();
    this.audioManager.updateEngine(0, false);
    this.audioManager.playReward();
    if (this.activeBikeGroup) {
      this.activeBikeGroup.visible = true;
    }
    this.renderHud();
  }

  private loop = (now: number): void => {
    this.rafId = window.requestAnimationFrame(this.loop);
    this.resizeViewport();

    const rawDt = (now - this.lastFrameTime) / 1000;
    this.lastFrameTime = now;
    const dt = Math.min(0.05, Math.max(0.001, rawDt));

    // Rolling FPS meter
    this.fpsFrames += 1;
    const fpsElapsed = (now - this.fpsWindowStart) / 1000;
    if (fpsElapsed >= 0.35) {
      this.fps = Math.round(this.fpsFrames / fpsElapsed);
      this.fpsFrames = 0;
      this.fpsWindowStart = now;
    }

    if (this.state.screen === 'menu') {
      this.menuSpinElapsed += dt;
      this.menuSpinAngle = MENU_YAW_BASE + Math.sin(this.menuSpinElapsed * 0.32) * 0.55;
      this.positionMenuCamera();
      this.showroom.update(dt);
      this.worldManager.update(0, dt);
      this.audioManager.updateEngine(0, false);
    } else if (this.state.screen === 'playing') {
      const stage = getCurrentStageSpec(this.state);
      this.cooldown.update(dt);

      const pose = this.playerController.update(
        dt,
        stage.length,
        this.camera,
        this.cooldown.getRemaining(),
        () => {
          this.cooldown.trigger();
          this.trafficSpawner.clearNearPlayer(
            this.playerController.getDistance(),
            15
          );
          this.audioManager.playRemount();
        }
      );
      this.displayKmh = pose.displayKmh;

      const recovering = this.playerController.isCrashRecovering();
      this.state = updateDistanceProgress(
        this.state,
        pose.distance,
        pose.speed,
        recovering ? 0 : dt
      );

      this.worldManager.update(pose.distance, dt);
      this.trafficSpawner.update(dt, pose.distance);

      if (this.playerController.getCrashPhase() === 'impact_tumble') {
        this.skidSparkAccum += dt;
        if (this.skidSparkAccum >= 0.048) {
          this.skidSparkAccum = 0;
          this.crashEffects.spawnSkidSpark(
            pose.worldX,
            pose.worldY,
            pose.worldZ,
            this.playerController.getFallSide()
          );
        }
      }
      this.crashEffects.update(dt);

      const speedRatio =
        (pose.speed - BIKES[this.state.bikeId].minCruiseSpeed) /
        Math.max(
          1,
          BIKES[this.state.bikeId].maxSpeed -
            BIKES[this.state.bikeId].minCruiseSpeed
        );
      this.audioManager.updateEngine(speedRatio, !recovering);

      if (!recovering && this.cooldown.canCollide()) {
        const hitObs = this.trafficSpawner.checkPlayerCollision(pose);
        if (hitObs) {
          this.handleCollision(hitObs.type, hitObs.lateralOffset);
        }
      }

      if (
        this.state.screen === 'playing' &&
        !this.playerController.isCrashRecovering() &&
        pose.distance >= stage.length - 0.5
      ) {
        this.finishCurrentStage();
      }

      this.renderHud();
    } else if (this.state.screen === 'game_over') {
      this.audioManager.updateEngine(0, false);
      this.playerController.updateGameOverCrash(dt, this.camera);
      this.crashEffects.update(dt);
    } else {
      this.audioManager.updateEngine(0, false);
    }

    this.postPipeline.render(dt);
  };

  private renderHud(): void {
    this.hud.render({
      state: this.state,
      displayKmh: this.displayKmh,
      invulnRemaining: this.cooldown.getRemaining(),
      crashPhase: this.playerController.getCrashPhase(),
      lateralOffset: this.playerController.getLateralOffset()
    });
  }

  public getDebugSnapshot(): HanoiDebugSnapshot {
    const stage = getCurrentStageSpec(this.state);
    const dirCounts = this.trafficSpawner.getDirectionCounts();
    return {
      screen: this.state.screen,
      stageId: this.state.stageId,
      progress: this.state.progress,
      distance: this.state.distance,
      stageLength: stage.length,
      wallet: this.state.wallet,
      speed: this.state.speed,
      displayKmh: this.displayKmh,
      bikeId: this.state.bikeId,
      difficultyId: this.state.difficultyId,
      hitsInStage: this.state.hitsInStage,
      totalHits: this.state.totalHits,
      invulnerableRemaining: this.cooldown.getRemaining(),
      fps: this.fps,
      loadTimeMs: this.loadTimeMs,
      consoleErrors: this.consoleErrors,
      activeObstacles: this.trafficSpawner.getActiveCount(),
      oncomingCount: dirCounts.oncoming,
      sameDirCount: dirCounts.sameDir,
      roadWidth: stage.roadWidth,
      laneCount: stage.laneCount,
      vehicleCounts: this.trafficSpawner.getVehicleTypeCounts(),
      crashPhase: this.playerController.getCrashPhase(),
      isRecovering: this.playerController.isCrashRecovering(),
      lateralOffset: this.playerController.getLateralOffset(),
      muted: this.audioManager.isMuted(),
      volume: this.audioManager.getVolume(),
      retroEnabled: this.postPipeline.isEnabled(),
      ready: this.ready
    };
  }

  private exposeDebugApi(): void {
    const engine = this;
    window.__HANOI_DEBUG__ = {
      get screen() {
        return engine.state.screen;
      },
      get stageId() {
        return engine.state.stageId;
      },
      get progress() {
        return engine.state.progress;
      },
      get wallet() {
        return engine.state.wallet;
      },
      get speed() {
        return engine.state.speed;
      },
      get bikeId() {
        return engine.state.bikeId;
      },
      get difficultyId() {
        return engine.state.difficultyId;
      },
      get fps() {
        return engine.fps;
      },
      get loadTimeMs() {
        return engine.loadTimeMs;
      },
      get consoleErrors() {
        return engine.consoleErrors;
      },
      get activeObstacles() {
        return engine.trafficSpawner.getActiveCount();
      },
      get oncomingCount() {
        return engine.trafficSpawner.getDirectionCounts().oncoming;
      },
      get sameDirCount() {
        return engine.trafficSpawner.getDirectionCounts().sameDir;
      },
      get roadWidth() {
        return getCurrentStageSpec(engine.state).roadWidth;
      },
      get laneCount() {
        return getCurrentStageSpec(engine.state).laneCount;
      },
      get vehicleCounts() {
        return engine.trafficSpawner.getVehicleTypeCounts();
      },
      get crashPhase() {
        return engine.playerController.getCrashPhase();
      },
      get isRecovering() {
        return engine.playerController.isCrashRecovering();
      },
      advanceToStageEnd: (offsetMetersFromEnd = 0) => {
        if (engine.state.screen === 'playing') {
          const stage = getCurrentStageSpec(engine.state);
          const targetDist = Math.max(0, stage.length - offsetMetersFromEnd);
          const pose = engine.playerController.setDistanceForDebug(
            targetDist,
            stage.length,
            engine.camera
          );
          engine.state = updateDistanceProgress(
            engine.state,
            pose.distance,
            pose.speed,
            0
          );
          engine.worldManager.update(pose.distance, 0);
          if (offsetMetersFromEnd <= 0.5) {
            engine.finishCurrentStage();
          } else {
            if (offsetMetersFromEnd > 5) {
              engine.trafficSpawner.clearAll();
              engine.trafficSpawner.seedAroundDistance(pose.distance);
            }
            engine.renderHud();
          }
        }
        return engine.getDebugSnapshot();
      },
      forceCollision: (
        obstacleType: ObstacleTypeId = 'motorbike',
        obstacleLateralOffset = 0
      ) => {
        return engine.handleCollision(obstacleType, obstacleLateralOffset);
      },
      getState: () => engine.getDebugSnapshot()
    };
  }

  public dispose(): void {
    if (this.rafId !== null) {
      window.cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    window.removeEventListener('resize', this.onResizeBound);
    window.removeEventListener('keydown', this.onKeyDownBound);
    window.removeEventListener('keyup', this.onKeyUpBound);
    window.removeEventListener('blur', this.onBlurBound);
    window.removeEventListener('pointerdown', this.onPointerUnlockBound);
    window.removeEventListener('error', this.onWindowErrorBound);
    window.removeEventListener('unhandledrejection', this.onWindowErrorBound);
    if (this.originalConsoleError) {
      console.error = this.originalConsoleError;
      this.originalConsoleError = null;
    }
    this.trafficSpawner.dispose();
    this.crashEffects.dispose();
    this.showroom.dispose();
    this.worldManager.disposeStage();
    this.postPipeline.dispose();
    this.audioManager.dispose();
    this.hud.dispose();
    this.renderer.dispose();
  }
}
