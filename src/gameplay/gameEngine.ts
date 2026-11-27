import * as THREE from 'three';
import {
  BIKES,
  STAGES,
  type BikeId,
  type DestinationKey,
  type DifficultyId,
  type ObstacleTypeId,
  type RoadClass,
  type StageId
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
  updateDistanceProgress,
  type GameScreen,
  type GameSessionState
} from '../core/gameState.ts';
import {
  loadProfile,
  purchaseBike,
  saveProfile,
  creditCareerEarnings,
  type PlayerProfile
} from '../core/profileStore.ts';
import {
  distanceToWorldZ,
  getRoadCenterX,
  getRoadElevationY
} from '../core/roadMath.ts';
import {
  getStageRouteFeatures,
  getTrafficLightState,
  getUpcomingCamera,
  getUpcomingIntersection,
  type StageRouteFeatures
} from '../core/routeFeatures.ts';
import {
  ColdFineTracker,
  type ColdFineSettlement,
  type ViolationType
} from '../core/violations.ts';
import { HudController } from '../ui/hudController.ts';
import {
  disposeBikeLoaderWorkers,
  loadPlayerBike
} from '../world/bikeLoader.ts';
import { CrashEffectsManager } from '../world/crashEffects.ts';
import { MenuShowroom } from '../world/menuShowroom.ts';
import { RetroPostPipeline } from '../world/retroPostProcessing.ts';
import {
  disposeTrafficLoaderWorkers,
  loadBusTrafficTemplates,
  loadCarTrafficTemplates,
  loadHeavyTruckTrafficTemplates,
  loadTaxiTrafficTemplate,
  loadTruckTrafficTemplates,
  streamExtraTrafficTemplates
} from '../world/taxiLoader.ts';
import { HanoiWorldManager, type WorldStreamingStats } from '../world/worldManager.ts';
import { AudioManager, type EngineProfile } from './audioManager.ts';
import { PlayerController, type PlayerInputState, type PlayerPose } from './playerController.ts';
import { TrafficSpawner } from './trafficSpawner.ts';

export interface HanoiDebugSnapshot {
  screen: GameScreen;
  stageId: StageId;
  chapter: 1 | 2 | 3;
  levelInChapter: 1 | 2 | 3;
  codeLabel: string;
  destinationKey: DestinationKey;
  speedLimitKmh: number;
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
  pendingColdFinesCount: number;
  pendingColdFinesTotal: number;
  lastColdFineSettlement: ColdFineSettlement | null;
  crossTrafficCount: number;
  streamingStats: WorldStreamingStats;
  fps: number;
  loadTimeMs: number;
  consoleErrors: number;
  activeObstacles: number;
  oncomingCount: number;
  sameDirCount: number;
  roadWidth: number;
  laneCount: RoadClass;
  vehicleCounts: Record<ObstacleTypeId, number>;
  taxiSpawnedInStage: number;
  taxiStageQuota: number;
  taxiGltfLoaded: boolean;
  busGltfLoaded: boolean;
  truckGltfLoaded: boolean;
  heavyTruckGltfLoaded: boolean;
  renderCalls: number;
  renderTriangles: number;
  crashPhase: CrashPhase;
  isRecovering: boolean;
  lateralOffset: number;
  isBraking: boolean;
  brakeLightLit: boolean;
  engineProfile: EngineProfile;
  engineGain: number;
  engineGear: number;
  careerWallet: number;
  shopOpen: boolean;
  muted: boolean;
  volume: number;
  retroEnabled: boolean;
  ready: boolean;
}

export interface HanoiDebugApi {
  readonly screen: GameScreen;
  readonly stageId: StageId;
  readonly chapter: 1 | 2 | 3;
  readonly levelInChapter: 1 | 2 | 3;
  readonly codeLabel: string;
  readonly destinationKey: DestinationKey;
  readonly speedLimitKmh: number;
  readonly progress: number;
  readonly wallet: number;
  readonly speed: number;
  readonly bikeId: BikeId;
  readonly difficultyId: DifficultyId;
  readonly pendingColdFinesCount: number;
  readonly pendingColdFinesTotal: number;
  readonly lastColdFineSettlement: ColdFineSettlement | null;
  readonly crossTrafficCount: number;
  readonly streamingStats: WorldStreamingStats;
  readonly fps: number;
  readonly loadTimeMs: number;
  readonly consoleErrors: number;
  readonly activeObstacles: number;
  readonly oncomingCount: number;
  readonly sameDirCount: number;
  readonly roadWidth: number;
  readonly laneCount: RoadClass;
  readonly vehicleCounts: Record<ObstacleTypeId, number>;
  readonly taxiSpawnedInStage: number;
  readonly taxiStageQuota: number;
  readonly taxiGltfLoaded: boolean;
  readonly busGltfLoaded: boolean;
  readonly truckGltfLoaded: boolean;
  readonly heavyTruckGltfLoaded: boolean;
  readonly renderCalls: number;
  readonly renderTriangles: number;
  readonly crashPhase: CrashPhase;
  readonly isRecovering: boolean;
  readonly isBraking: boolean;
  readonly brakeLightLit: boolean;
  readonly engineProfile: EngineProfile;
  readonly engineGain: number;
  readonly engineGear: number;
  readonly careerWallet: number;
  readonly shopOpen: boolean;
  setInputForDebug: (partial: Partial<PlayerInputState>) => HanoiDebugSnapshot;
  setStageForDebug: (stageId: StageId) => HanoiDebugSnapshot;
  setDistanceForDebug: (dist: number) => HanoiDebugSnapshot;
  triggerViolationForDebug: (type: ViolationType) => HanoiDebugSnapshot;
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

  // Real-time 3D Rearview Mirror render resources
  private readonly rearCamera: THREE.PerspectiveCamera;
  private readonly mirrorTarget: THREE.WebGLRenderTarget;
  private readonly mirrorScene: THREE.Scene;
  private readonly mirrorQuadCamera: THREE.OrthographicCamera;
  private readonly mirrorQuadMesh: THREE.Mesh;
  private mirrorViewportEl: HTMLElement | null = null;
  private cachedMirrorRect: {
    left: number;
    top: number;
    bottom: number;
    width: number;
    height: number;
  } | null = null;
  private cachedCanvasRect: {
    left: number;
    top: number;
    width: number;
    height: number;
  } | null = null;

  private readonly worldManager: HanoiWorldManager;
  private readonly playerController: PlayerController;
  private readonly trafficSpawner: TrafficSpawner;
  private readonly crashEffects: CrashEffectsManager;
  private readonly showroom: MenuShowroom;
  private readonly audioManager: AudioManager;
  private readonly cooldown: CollisionCooldown;
  private readonly coldFineTracker = new ColdFineTracker();
  private readonly hud: HudController;

  private state: GameSessionState;
  private profile: PlayerProfile;
  private selectedMenuStageId: StageId = 1;
  private currentRouteFeatures: StageRouteFeatures = getStageRouteFeatures(1);
  private prevPlayerDistance = 0;
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
  private disposed = false;

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

    this.rearCamera = new THREE.PerspectiveCamera(62, 3.2, 0.25, 165);
    this.mirrorTarget = new THREE.WebGLRenderTarget(256, 84, {
      depthBuffer: true,
      stencilBuffer: false
    });
    this.mirrorScene = new THREE.Scene();
    this.mirrorQuadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const mirrorGeo = new THREE.PlaneGeometry(2, 2);
    const mirrorMat = new THREE.MeshBasicMaterial({
      map: this.mirrorTarget.texture,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    this.mirrorQuadMesh = new THREE.Mesh(mirrorGeo, mirrorMat);
    // Horizontal flip for true rearview mirror reflection
    this.mirrorQuadMesh.scale.x = -1;
    this.mirrorScene.add(this.mirrorQuadMesh);

    this.profile = loadProfile();
    const initialStage = this.parseStageParamFromUrl() ?? 1;
    this.selectedMenuStageId = initialStage;
    this.currentRouteFeatures = getStageRouteFeatures(initialStage);
    this.state = createInitialGameState(
      this.profile.selectedBikeId,
      'medium',
      initialStage
    );
    this.worldManager = new HanoiWorldManager(this.scene, this.renderer);
    this.playerController = new PlayerController(this.state.bikeId);
    this.trafficSpawner = new TrafficSpawner(this.scene);
    this.crashEffects = new CrashEffectsManager(this.scene);
    this.showroom = new MenuShowroom(this.scene);
    this.audioManager = new AudioManager();
    this.syncEngineAudioProfile(this.state.bikeId);
    this.trafficSpawner.setRecklessWarningCallback(() => {
      if (this.state.screen === 'playing') {
        this.audioManager.playWarningBeep();
      }
    });
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
      onSelectStage: (stageId) => {
        this.audioManager.unlock();
        this.selectMenuStage(stageId);
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
      },
      onOpenShop: () => {
        this.audioManager.unlock();
        this.hud.setCareerProfile(this.profile);
      },
      onCloseShop: () => {
        this.renderHud();
      },
      onPurchaseBike: (bikeId, priceVnd) => {
        this.audioManager.unlock();
        const res = purchaseBike(this.profile, bikeId, priceVnd);
        this.profile = res.profile;
        this.hud.setCareerProfile(this.profile);
        if (res.purchased) {
          this.selectBike(bikeId);
        }
        return res.purchased;
      },
      onTestRideBike: (bikeId) => {
        this.audioManager.unlock();
        if (this.state.screen !== 'menu') return;
        this.state = { ...this.state, bikeId };
        this.syncEngineAudioProfile(bikeId);
        this.attachActiveBike(bikeId);
        this.hud.setSelectedBike(bikeId);
        this.renderHud();
      }
    });

    this.hud.setCareerProfile(this.profile);
    this.hud.setSelectedStage(this.selectedMenuStageId);
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
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);

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
    this.cachedMirrorRect = null;
    this.cachedCanvasRect = null;
  }

  private refreshMirrorRectCache(): void {
    if (!this.mirrorViewportEl) {
      this.mirrorViewportEl = document.getElementById('hud-rearview-viewport');
    }
    if (!this.mirrorViewportEl) return;
    const rect = this.mirrorViewportEl.getBoundingClientRect();
    const canvasRect = this.canvas.getBoundingClientRect();
    if (rect.width > 8 && rect.height > 8 && canvasRect.width > 0 && canvasRect.height > 0) {
      this.cachedMirrorRect = {
        left: rect.left,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height
      };
      this.cachedCanvasRect = {
        left: canvasRect.left,
        top: canvasRect.top,
        width: canvasRect.width,
        height: canvasRect.height
      };
    }
  }

  public async init(): Promise<void> {
    // Build selected stage backdrop immediately for the menu showroom
    this.worldManager.buildStage(this.selectedMenuStageId);
    this.worldManager.setMenuLighting(true);
    this.positionMenuCamera();

    // Load all motorbikes + driver and traffic GLBs in parallel
    try {
      const [
        hondaGroup,
        vinfastGroup,
        suzukiGroup,
        gsxsGroup,
        taxiTemplate,
        carTemplates,
        busTemplates,
        truckTemplates,
        heavyTruckTemplates
      ] = await Promise.all([
        loadPlayerBike('honda'),
        loadPlayerBike('vinfast'),
        loadPlayerBike('suzuki_rgv'),
        loadPlayerBike('suzuki_gsxs'),
        loadTaxiTrafficTemplate(),
        loadCarTrafficTemplates(),
        loadBusTrafficTemplates(),
        loadTruckTrafficTemplates(),
        loadHeavyTruckTrafficTemplates()
      ]);
      this.bikeModels.honda = hondaGroup;
      this.bikeModels.vinfast = vinfastGroup;
      this.bikeModels.suzuki_rgv = suzukiGroup;
      this.bikeModels.suzuki_gsxs = gsxsGroup;
      if (taxiTemplate) {
        this.trafficSpawner.setTaxiTemplate(taxiTemplate);
      }
      if (carTemplates.length > 0) {
        this.trafficSpawner.setCarTemplates(carTemplates);
      }
      if (busTemplates.length > 0) {
        this.trafficSpawner.setBusTemplates(busTemplates);
      }
      if (truckTemplates.length > 0) {
        this.trafficSpawner.setTruckTemplates(truckTemplates);
      }
      if (heavyTruckTemplates.length > 0) {
        this.trafficSpawner.setHeavyTruckTemplates(heavyTruckTemplates);
      }
    } finally {
      disposeBikeLoaderWorkers();
      void streamExtraTrafficTemplates({
        onCar: (tpl) => this.trafficSpawner.addCarTemplates([tpl]),
        onBus: (tpl) => this.trafficSpawner.addBusTemplates([tpl]),
        onTruck: (tpl) => this.trafficSpawner.addTruckTemplates([tpl]),
        onHeavyTruck: (tpl) => this.trafficSpawner.addHeavyTruckTemplates([tpl]),
        shouldCancel: () => this.disposed
      }).finally(() => disposeTrafficLoaderWorkers());
    }

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

  private syncEngineAudioProfile(bikeId: BikeId): void {
    this.audioManager.setEngineProfile(BIKES[bikeId].engineProfile);
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
    if (this.profile.ownedBikes.includes(bikeId)) {
      this.profile = { ...this.profile, selectedBikeId: bikeId };
      saveProfile(this.profile);
    }
    this.syncEngineAudioProfile(bikeId);
    this.attachActiveBike(bikeId);
    this.hud.setSelectedBike(bikeId);
    this.hud.setCareerProfile(this.profile);
    this.renderHud();
  }

  private parseStageParamFromUrl(): StageId | null {
    const raw = Number(new URLSearchParams(window.location.search).get('stage'));
    if (Number.isInteger(raw) && raw >= 1 && raw <= STAGES.length) {
      return raw as StageId;
    }
    return null;
  }

  private selectMenuStage(stageId: StageId): void {
    if (this.state.screen !== 'menu') return;
    this.selectedMenuStageId = stageId;
    this.currentRouteFeatures = getStageRouteFeatures(stageId);
    this.state = createInitialGameState(
      this.state.bikeId,
      this.state.difficultyId,
      stageId
    );
    this.worldManager.buildStage(stageId);
    this.worldManager.setMenuLighting(true);
    this.positionMenuCamera();
    this.hud.setSelectedStage(stageId);
    this.renderHud();
  }

  private selectDifficulty(difficultyId: DifficultyId): void {
    if (this.state.screen !== 'menu') return;
    this.state = createInitialGameState(
      this.state.bikeId,
      difficultyId,
      this.selectedMenuStageId
    );
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
    const initialStageId = this.parseStageParamFromUrl() ?? this.selectedMenuStageId;
    this.state = resetSession(bikeId, difficultyId, 'playing', initialStageId);
    this.currentRouteFeatures = getStageRouteFeatures(initialStageId);
    this.coldFineTracker.reset();
    this.prevPlayerDistance = 0;
    this.cooldown.reset();
    this.crashEffects.clear();
    this.skidSparkAccum = 0;
    this.hud.hidePenaltyToast();

    this.worldManager.buildStage(initialStageId);
    this.worldManager.setMenuLighting(false);
    this.showroom.setVisible(false);
    this.syncEngineAudioProfile(bikeId);
    this.attachActiveBike(bikeId);
    this.playerController.resetForStage(initialStageId, this.camera);
    this.trafficSpawner.reset(initialStageId, difficultyId);
    this.displayKmh = Math.round(
      (this.playerController.getPose().speed / BIKES[bikeId].maxSpeed) *
        BIKES[bikeId].displayMaxKmh
    );
    this.cachedMirrorRect = null;
    this.renderHud();
  }

  private goToNextStage(): void {
    if (this.state.screen !== 'stage_clear') return;
    this.state = advanceToNextStage(this.state);
    if (this.state.screen !== 'playing') {
      this.playerController.clearInput();
      this.renderHud();
      return;
    }

    const stage = getCurrentStageSpec(this.state);
    this.currentRouteFeatures = getStageRouteFeatures(stage.id);
    this.coldFineTracker.reset();
    this.prevPlayerDistance = 0;
    this.cooldown.reset();
    this.crashEffects.clear();
    this.skidSparkAccum = 0;
    this.hud.hidePenaltyToast();
    this.worldManager.buildStage(stage.id);
    this.worldManager.setMenuLighting(false);
    this.showroom.setVisible(false);
    this.syncEngineAudioProfile(this.state.bikeId);
    this.attachActiveBike(this.state.bikeId);
    this.playerController.resetForStage(stage.id, this.camera);
    this.trafficSpawner.reset(stage.id, this.state.difficultyId);
    this.renderHud();
  }

  private backToMenu(): void {
    this.state = resetSession(
      this.state.bikeId,
      this.state.difficultyId,
      'menu',
      this.selectedMenuStageId
    );
    this.currentRouteFeatures = getStageRouteFeatures(this.selectedMenuStageId);
    this.coldFineTracker.reset();
    this.prevPlayerDistance = 0;
    this.displayKmh = 0;
    this.cooldown.reset();
    this.crashEffects.clear();
    this.skidSparkAccum = 0;
    this.hud.hidePenaltyToast();
    this.trafficSpawner.clearAll();
    this.playerController.clearInput();
    this.audioManager.updateEngine(0, false, { isBraking: false, speed: 0 });

    this.worldManager.buildStage(this.selectedMenuStageId);
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
    const stageId = this.selectedMenuStageId;
    const centerX = getRoadCenterX(stageId, 0);
    const groundY = getRoadElevationY(stageId, 0);
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
    const stage = getCurrentStageSpec(this.state);
    const violations = this.coldFineTracker.getViolations();
    const outcome = completeCurrentStage(this.state, violations);
    if (!outcome.completed) return;

    this.state = outcome.state;
    this.displayKmh = 0;
    this.playerController.clearInput();
    this.audioManager.updateEngine(0, false, { isBraking: false, speed: 0 });

    if (outcome.bankrupt) {
      this.audioManager.playCrash();
      this.audioManager.playGameOver();
    } else {
      const netEarned = outcome.settlement
        ? Math.max(0, outcome.settlement.netChange)
        : outcome.baseReward + outcome.perfectBonus;
      if (netEarned > 0) {
        this.profile = creditCareerEarnings(this.profile, netEarned, stage.length);
        this.hud.setCareerProfile(this.profile);
      }
      this.audioManager.playReward();
    }

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

    let activePose: PlayerPose | null = null;

    if (this.state.screen === 'menu') {
      this.menuSpinElapsed += dt;
      this.menuSpinAngle = MENU_YAW_BASE + Math.sin(this.menuSpinElapsed * 0.32) * 0.55;
      this.positionMenuCamera();
      this.showroom.update(dt);
      this.worldManager.update(0, dt);
      this.playerController.setBrakeLightLit(false);
      this.audioManager.updateEngine(0, false, { isBraking: false, speed: 0 });
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
      activePose = pose;
      this.displayKmh = pose.displayKmh;

      const recovering = this.playerController.isCrashRecovering();
      this.state = updateDistanceProgress(
        this.state,
        pose.distance,
        pose.speed,
        recovering ? 0 : dt
      );

      this.worldManager.update(pose.distance, dt, this.state.elapsedStageTime);
      this.trafficSpawner.update(dt, pose.distance, this.state.elapsedStageTime);

      if (!recovering) {
        const newViolations = this.coldFineTracker.evaluateFrame({
          prevDistance: this.prevPlayerDistance,
          distance: pose.distance,
          displayKmh: pose.displayKmh,
          lateralOffset: pose.lateralOffset,
          elapsedTime: this.state.elapsedStageTime,
          stage,
          features: this.currentRouteFeatures
        });
        for (const violation of newViolations) {
          if (violation.cameraId !== null) {
            this.worldManager.triggerCameraFlash(violation.cameraId);
          }
          this.audioManager.playCameraShutter();
          this.hud.triggerCameraFlash();
          this.hud.showViolationToast(violation);
        }
      }
      this.prevPlayerDistance = pose.distance;

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

      const speedRatio = pose.speed / Math.max(1, BIKES[this.state.bikeId].maxSpeed);
      this.audioManager.updateEngine(speedRatio, !recovering, {
        isBraking: pose.isBraking,
        speed: pose.speed
      });

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
      this.playerController.setBrakeLightLit(false);
      this.audioManager.updateEngine(0, false, { isBraking: false, speed: 0 });
      this.playerController.updateGameOverCrash(dt, this.camera);
      this.crashEffects.update(dt);
    } else {
      this.playerController.setBrakeLightLit(false);
      this.audioManager.updateEngine(0, false, { isBraking: false, speed: 0 });
    }

    this.postPipeline.render(dt);

    if (this.state.screen === 'playing' && activePose) {
      this.renderRearviewMirrorPass(activePose);
    }
  };

  private renderRearviewMirrorPass(pose: PlayerPose): void {
    if (!this.cachedMirrorRect || !this.cachedCanvasRect) {
      this.refreshMirrorRectCache();
    }
    if (!this.cachedMirrorRect || !this.cachedCanvasRect) return;

    const mirrorRect = this.cachedMirrorRect;
    const canvasRect = this.cachedCanvasRect;
    if (mirrorRect.width <= 8 || mirrorRect.height <= 8) return;

    const lookDist = Math.max(0, pose.distance - 26);
    this.rearCamera.aspect = Math.max(1, mirrorRect.width / mirrorRect.height);
    this.rearCamera.updateProjectionMatrix();
    this.rearCamera.position.set(pose.worldX, pose.worldY + 1.55, pose.worldZ + 0.5);
    this.rearCamera.lookAt(
      getRoadCenterX(this.state.stageId, lookDist),
      getRoadElevationY(this.state.stageId, lookDist) + 1.05,
      distanceToWorldZ(lookDist)
    );

    const wasVisible = this.activeBikeGroup?.visible ?? false;
    if (this.activeBikeGroup) {
      this.activeBikeGroup.visible = false;
    }

    this.renderer.setRenderTarget(this.mirrorTarget);
    this.renderer.clear();
    this.renderer.render(this.scene, this.rearCamera);
    this.renderer.setRenderTarget(null);

    if (this.activeBikeGroup) {
      this.activeBikeGroup.visible = wasVisible;
    }

    const canvasW = Math.max(1, Math.round(canvasRect.width));
    const canvasH = Math.max(1, Math.round(canvasRect.height));
    const vpX = Math.round(mirrorRect.left - canvasRect.left);
    const vpY = Math.round(canvasH - (mirrorRect.bottom - canvasRect.top));
    const vpW = Math.round(mirrorRect.width);
    const vpH = Math.round(mirrorRect.height);

    if (vpW <= 8 || vpH <= 8) return;

    const prevAutoClear = this.renderer.autoClear;
    this.renderer.setScissorTest(true);
    this.renderer.setViewport(vpX, vpY, vpW, vpH);
    this.renderer.setScissor(vpX, vpY, vpW, vpH);
    this.renderer.autoClear = false;
    this.renderer.clearDepth();
    this.renderer.render(this.mirrorScene, this.mirrorQuadCamera);
    this.renderer.setScissorTest(false);
    this.renderer.setViewport(0, 0, canvasW, canvasH);
    this.renderer.autoClear = prevAutoClear;
  }

  private renderHud(): void {
    const stage = getCurrentStageSpec(this.state);
    const dist = this.state.distance;
    const lateral = this.playerController.getLateralOffset();
    const upcomingZone = getUpcomingIntersection(this.currentRouteFeatures, dist);
    const upcomingLight = upcomingZone
      ? getTrafficLightState(upcomingZone, this.state.elapsedStageTime)
      : null;
    const upcomingCamera = getUpcomingCamera(this.currentRouteFeatures, dist);
    const rearThreat =
      this.state.screen === 'playing'
        ? this.trafficSpawner.getRearThreatInfo(dist, lateral)
        : null;

    this.hud.render({
      state: this.state,
      displayKmh: this.displayKmh,
      invulnRemaining: this.cooldown.getRemaining(),
      crashPhase: this.playerController.getCrashPhase(),
      lateralOffset: lateral,
      isBraking: this.state.screen === 'playing' ? this.playerController.isBraking() : false,
      careerWallet: this.profile.careerWallet,
      totalDeliveries: this.profile.totalDeliveries,
      pendingFineCount: this.coldFineTracker.getCount(),
      pendingFineTotal: this.coldFineTracker.getTotalAmount(),
      routeFeatures: this.currentRouteFeatures,
      elapsedStageTime: this.state.elapsedStageTime,
      upcomingLight,
      upcomingCamera,
      speedLimitKmh: stage.speedLimitKmh,
      rearThreat
    });
  }

  public getDebugSnapshot(): HanoiDebugSnapshot {
    const stage = getCurrentStageSpec(this.state);
    const dirCounts = this.trafficSpawner.getDirectionCounts();
    const taxiStats = this.trafficSpawner.getTaxiStageStats();
    const heavyStats = this.trafficSpawner.getHeavyModelStats();
    const audioTelemetry = this.audioManager.getEngineTelemetry();
    return {
      screen: this.state.screen,
      stageId: this.state.stageId,
      chapter: stage.chapter,
      levelInChapter: stage.levelInChapter,
      codeLabel: stage.codeLabel,
      destinationKey: stage.destinationKey,
      speedLimitKmh: stage.speedLimitKmh,
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
      pendingColdFinesCount: this.coldFineTracker.getCount(),
      pendingColdFinesTotal: this.coldFineTracker.getTotalAmount(),
      lastColdFineSettlement: this.state.lastColdFineSettlement,
      crossTrafficCount: this.trafficSpawner.getCrossTrafficCount(),
      streamingStats: this.worldManager.getStreamingStats(),
      fps: this.fps,
      loadTimeMs: this.loadTimeMs,
      consoleErrors: this.consoleErrors,
      activeObstacles: this.trafficSpawner.getActiveCount(),
      oncomingCount: dirCounts.oncoming,
      sameDirCount: dirCounts.sameDir,
      roadWidth: stage.roadWidth,
      laneCount: stage.laneCount,
      vehicleCounts: this.trafficSpawner.getVehicleTypeCounts(),
      taxiSpawnedInStage: taxiStats.spawnedInStage,
      taxiStageQuota: taxiStats.quota,
      taxiGltfLoaded: taxiStats.hasGltfModel,
      busGltfLoaded: heavyStats.hasBusGltf,
      truckGltfLoaded: heavyStats.hasTruckGltf,
      heavyTruckGltfLoaded: heavyStats.hasHeavyTruckGltf,
      renderCalls: this.renderer.info.render.calls,
      renderTriangles: this.renderer.info.render.triangles,
      crashPhase: this.playerController.getCrashPhase(),
      isRecovering: this.playerController.isCrashRecovering(),
      lateralOffset: this.playerController.getLateralOffset(),
      isBraking: this.state.screen === 'playing' ? this.playerController.isBraking() : false,
      brakeLightLit: this.playerController.isBrakeLightLit(),
      engineProfile: audioTelemetry.profile,
      engineGain: audioTelemetry.estimatedGain,
      engineGear: audioTelemetry.gear,
      careerWallet: this.profile.careerWallet,
      shopOpen: this.hud.isShopOpen(),
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
      get chapter() {
        return getCurrentStageSpec(engine.state).chapter;
      },
      get levelInChapter() {
        return getCurrentStageSpec(engine.state).levelInChapter;
      },
      get codeLabel() {
        return getCurrentStageSpec(engine.state).codeLabel;
      },
      get destinationKey() {
        return getCurrentStageSpec(engine.state).destinationKey;
      },
      get speedLimitKmh() {
        return getCurrentStageSpec(engine.state).speedLimitKmh;
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
      get pendingColdFinesCount() {
        return engine.coldFineTracker.getCount();
      },
      get pendingColdFinesTotal() {
        return engine.coldFineTracker.getTotalAmount();
      },
      get lastColdFineSettlement() {
        return engine.state.lastColdFineSettlement;
      },
      get crossTrafficCount() {
        return engine.trafficSpawner.getCrossTrafficCount();
      },
      get streamingStats() {
        return engine.worldManager.getStreamingStats();
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
      get taxiSpawnedInStage() {
        return engine.trafficSpawner.getTaxiStageStats().spawnedInStage;
      },
      get taxiStageQuota() {
        return engine.trafficSpawner.getTaxiStageStats().quota;
      },
      get taxiGltfLoaded() {
        return engine.trafficSpawner.getTaxiStageStats().hasGltfModel;
      },
      get busGltfLoaded() {
        return engine.trafficSpawner.getHeavyModelStats().hasBusGltf;
      },
      get truckGltfLoaded() {
        return engine.trafficSpawner.getHeavyModelStats().hasTruckGltf;
      },
      get heavyTruckGltfLoaded() {
        return engine.trafficSpawner.getHeavyModelStats().hasHeavyTruckGltf;
      },
      get renderCalls() {
        return engine.renderer.info.render.calls;
      },
      get renderTriangles() {
        return engine.renderer.info.render.triangles;
      },
      get crashPhase() {
        return engine.playerController.getCrashPhase();
      },
      get isRecovering() {
        return engine.playerController.isCrashRecovering();
      },
      get isBraking() {
        return engine.state.screen === 'playing' ? engine.playerController.isBraking() : false;
      },
      get brakeLightLit() {
        return engine.playerController.isBrakeLightLit();
      },
      get engineProfile() {
        return engine.audioManager.getEngineProfile();
      },
      get engineGain() {
        return engine.audioManager.getEngineTelemetry().estimatedGain;
      },
      get engineGear() {
        return engine.audioManager.getEngineTelemetry().gear;
      },
      get careerWallet() {
        return engine.profile.careerWallet;
      },
      get shopOpen() {
        return engine.hud.isShopOpen();
      },
      setInputForDebug: (partial: Partial<PlayerInputState>) => {
        engine.playerController.setInputState(partial);
        return engine.getDebugSnapshot();
      },
      setStageForDebug: (stageId: StageId) => {
        if (engine.state.screen === 'menu') {
          engine.selectMenuStage(stageId);
          return engine.getDebugSnapshot();
        }
        const stage = getCurrentStageSpec({
          ...engine.state,
          stageIndex: Math.max(0, STAGES.findIndex((s) => s.id === stageId)),
          stageId
        });
        engine.selectedMenuStageId = stage.id;
        engine.state = {
          ...resetSession(
            engine.state.bikeId,
            engine.state.difficultyId,
            'playing',
            stage.id
          ),
          wallet: engine.state.wallet
        };
        engine.currentRouteFeatures = getStageRouteFeatures(stage.id);
        engine.coldFineTracker.reset();
        engine.prevPlayerDistance = 0;
        engine.cooldown.reset();
        engine.crashEffects.clear();
        engine.skidSparkAccum = 0;
        engine.hud.hidePenaltyToast();
        engine.worldManager.buildStage(stage.id);
        engine.worldManager.setMenuLighting(false);
        engine.showroom.setVisible(false);
        engine.attachActiveBike(engine.state.bikeId);
        engine.playerController.resetForStage(stage.id, engine.camera);
        engine.trafficSpawner.reset(stage.id, engine.state.difficultyId);
        engine.displayKmh = engine.playerController.getPose().displayKmh;
        engine.renderHud();
        return engine.getDebugSnapshot();
      },
      setDistanceForDebug: (dist: number) => {
        if (engine.state.screen === 'playing') {
          const stage = getCurrentStageSpec(engine.state);
          const pose = engine.playerController.setDistanceForDebug(
            dist,
            stage.length,
            engine.camera
          );
          engine.prevPlayerDistance = pose.distance;
          engine.state = updateDistanceProgress(
            engine.state,
            pose.distance,
            pose.speed,
            0
          );
          engine.worldManager.update(pose.distance, 0, engine.state.elapsedStageTime);
          engine.trafficSpawner.clearAll();
          engine.trafficSpawner.seedAroundDistance(pose.distance);
          engine.renderHud();
        }
        return engine.getDebugSnapshot();
      },
      triggerViolationForDebug: (type: ViolationType) => {
        if (engine.state.screen === 'playing') {
          const cam = getUpcomingCamera(
            engine.currentRouteFeatures,
            engine.state.distance
          );
          const violation = engine.coldFineTracker.recordViolation({
            type,
            distanceMeters: engine.state.distance,
            cameraId: cam?.id ?? null,
            intersectionId: cam?.intersectionId ?? null,
            timestampSec: engine.state.elapsedStageTime
          });
          if (violation.cameraId !== null) {
            engine.worldManager.triggerCameraFlash(violation.cameraId);
          }
          engine.audioManager.playCameraShutter();
          engine.hud.triggerCameraFlash();
          engine.hud.showViolationToast(violation);
          engine.renderHud();
        }
        return engine.getDebugSnapshot();
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
          engine.prevPlayerDistance = pose.distance;
          engine.state = updateDistanceProgress(
            engine.state,
            pose.distance,
            pose.speed,
            0
          );
          engine.worldManager.update(pose.distance, 0, engine.state.elapsedStageTime);
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
    this.disposed = true;
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
    this.mirrorTarget.dispose();
    this.mirrorQuadMesh.geometry.dispose();
    (this.mirrorQuadMesh.material as THREE.Material).dispose();
    this.audioManager.dispose();
    this.hud.dispose();
    this.renderer.dispose();
  }
}
