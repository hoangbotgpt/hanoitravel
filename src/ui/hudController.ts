import {
  BIKES,
  DIFFICULTIES,
  OBSTACLE_TYPES,
  STAGES,
  type BikeId,
  type DifficultyId,
  type ObstacleTypeId,
  type StageId
} from '../config/gameConfig.ts';
import { formatVND } from '../core/economy.ts';
import type { CrashPhase } from '../core/crashSequence.ts';
import type { GameScreen, GameSessionState } from '../core/gameState.ts';
import { createDefaultProfile, type PlayerProfile } from '../core/profileStore.ts';
import { getRoadCenterX } from '../core/roadMath.ts';
import {
  getStageRouteFeatures,
  getTrafficLightState,
  type SpeedCameraZone,
  type StageRouteFeatures,
  type TrafficLightColor
} from '../core/routeFeatures.ts';
import { isOncomingLane } from '../core/trafficRules.ts';
import type { ColdFineSettlement, RecordedViolation } from '../core/violations.ts';
import type { PlayerInputState } from '../gameplay/playerController.ts';
import { ShopModal } from './shopModal.ts';

export interface RearThreatView {
  active: boolean;
  distanceMeters: number;
  lateralDelta: number;
  isReckless: boolean;
}

export interface HudCallbacks {
  onSelectBike: (bikeId: BikeId) => void;
  onSelectDifficulty: (difficultyId: DifficultyId) => void;
  onSelectStage?: (stageId: StageId) => void;
  onStartGame: () => void;
  onTogglePause: () => void;
  onNextStage: () => void;
  onRestart: () => void;
  onReturnToMenu: () => void;
  onToggleMute: () => void;
  onVolumeChange: (volume: number) => void;
  onToggleRetroEffect: () => boolean;
  onTouchInput: (partial: Partial<PlayerInputState>) => void;
  onHorn: () => void;
  onOpenShop?: () => void;
  onCloseShop?: () => void;
  onPurchaseBike?: (bikeId: BikeId, priceVnd: number) => boolean;
  onTestRideBike?: (bikeId: BikeId) => void;
}

export interface HudFrameView {
  state: GameSessionState;
  displayKmh: number;
  invulnRemaining: number;
  crashPhase?: CrashPhase;
  lateralOffset?: number;
  isBraking?: boolean;
  careerWallet?: number;
  totalDeliveries?: number;
  pendingFineCount?: number;
  pendingFineTotal?: number;
  routeFeatures?: StageRouteFeatures | null;
  elapsedStageTime?: number;
  upcomingLight?: TrafficLightColor | null;
  upcomingCamera?: SpeedCameraZone | null;
  speedLimitKmh?: number;
  rearThreat?: RearThreatView | null;
}

const OBSTACLE_TOAST_NAME: Record<ObstacleTypeId, string> = {
  motorbike: 'xe máy',
  reckless_moto: 'xe máy vượt ẩu',
  flower_bike: 'xe đạp hoa',
  vendor: 'gánh hàng rong',
  tourist: 'khách du lịch',
  office_worker: 'dân công sở',
  car: 'ô tô',
  taxi: 'taxi điện Xanh SM',
  bus: 'xe buýt VinBus',
  truck: 'xe tải Canter 1,9T',
  heavy_truck: 'xe tải hạng nặng'
};

function getRequiredEl<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) {
    throw new Error(`Missing required HUD element #${id}`);
  }
  return el as T;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatMeters(meters: number): string {
  return Math.max(0, Math.round(meters)).toLocaleString('vi-VN');
}

function formatDecimalComma(num: number): string {
  return num.toFixed(1).replace('.', ',');
}

function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function formatRemainingDistance(remainingMeters: number): string {
  const clamped = Math.max(0, remainingMeters);
  if (clamped >= 1000) {
    const km = Math.round((clamped / 1000) * 100) / 100;
    return `Còn ${km.toFixed(2).replace('.', ',')} km`;
  }
  return `Còn ${formatMeters(clamped)} m`;
}

function createStarSvg(lit: boolean): string {
  return `<svg class="star-icon${lit ? ' lit' : ''}" viewBox="0 0 24 24" fill="${lit ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;
}

function renderColdFinesLedger(
  container: HTMLElement,
  settlement: ColdFineSettlement | null | undefined
): void {
  if (
    !settlement ||
    (settlement.violations.length === 0 && !settlement.bankruptByColdFines)
  ) {
    container.classList.add('hidden');
    container.innerHTML = '';
    return;
  }

  const netPrefix = settlement.netChange >= 0 ? '+' : '−';
  const netAbs = formatVND(Math.abs(settlement.netChange));
  const netClass = settlement.netChange >= 0 ? 'gold-text' : 'danger-text';

  const tagsHtml = settlement.violations
    .map(
      (v) =>
        `<span class="fine-tag">📷 ${escapeHtml(v.label)} (${formatMeters(v.distanceMeters)}m) · −${formatVND(v.amount)}</span>`
    )
    .join('');

  container.innerHTML = `
    <div class="fines-ledger-summary">
      <span>Tổng tiền thưởng</span>
      <strong>+${formatVND(settlement.grossReward)}</strong>
    </div>
    <div class="fines-ledger-summary">
      <span>Tổng Phạt Nguội (${settlement.violations.length} lỗi)</span>
      <strong class="danger-text">−${formatVND(settlement.totalColdFines)}</strong>
    </div>
    <div class="fines-ledger-summary net">
      <span>Thực nhận</span>
      <strong class="${netClass}">${netPrefix}${netAbs}</strong>
    </div>
    ${tagsHtml ? `<div class="fines-tag-list">${tagsHtml}</div>` : ''}
  `;
  container.classList.remove('hidden');
}

export class HudController {
  private readonly callbacks: HudCallbacks;

  private readonly screens: Record<GameScreen, HTMLElement>;
  private readonly damageVignette: HTMLElement;
  private readonly cameraFlash: HTMLElement;
  private readonly menuAudioPill: HTMLElement;
  private readonly btnPause: HTMLButtonElement;
  private readonly btnOpenShop: HTMLButtonElement;
  private readonly menuCareerWalletValue: HTMLElement;
  private readonly stageSelect: HTMLSelectElement;
  private readonly shopModal: ShopModal;

  private readonly btnMute: HTMLButtonElement;
  private readonly iconVolOn: HTMLElement;
  private readonly iconVolOff: HTMLElement;
  private readonly volumeSlider: HTMLInputElement;
  private readonly volumeLabel: HTMLElement;

  private readonly pauseBtnMute: HTMLButtonElement;
  private readonly pauseIconVolOn: HTMLElement;
  private readonly pauseIconVolOff: HTMLElement;
  private readonly pauseVolumeSlider: HTMLInputElement;
  private readonly pauseVolumeLabel: HTMLElement;
  private readonly btnToggleRetro: HTMLButtonElement;

  private readonly showroomBikeName: HTMLElement;
  private readonly showroomBikeDesc: HTMLElement;
  private readonly bikeCards: NodeListOf<HTMLButtonElement>;
  private readonly diffCards: NodeListOf<HTMLButtonElement>;

  // In-game HUD elements
  private readonly walletValue: HTMLElement;
  private readonly walletDelta: HTMLElement;
  private readonly comboBadge: HTMLElement;
  private readonly finePill: HTMLElement;
  private readonly invulnBadge: HTMLElement;
  private readonly stageBadge: HTMLElement;
  private readonly stageName: HTMLElement;
  private readonly distanceText: HTMLElement;
  private readonly speedLimitSign: HTMLElement;
  private readonly speedLimitValue: HTMLElement;
  private readonly rearviewMirror: HTMLElement;
  private readonly rearAlert: HTMLElement;
  private readonly minimapCanvas: HTMLCanvasElement;
  private readonly minimapCtx: CanvasRenderingContext2D | null;
  private readonly toastStack: HTMLElement;
  private readonly hornHint: HTMLElement;
  private readonly speedoCard: HTMLElement;
  private readonly speedValue: HTMLElement;
  private readonly speedFill: HTMLElement;
  private readonly brakeBadge: HTMLElement;

  // Modal summary elements
  private readonly pausedStageDesc: HTMLElement;
  private readonly btnRestartPaused: HTMLButtonElement;
  private readonly btnMenuPaused: HTMLButtonElement;
  private readonly clearStars: HTMLElement;
  private readonly clearRankBadge: HTMLElement;
  private readonly clearTitle: HTMLElement;
  private readonly clearSubtitle: HTMLElement;
  private readonly clearBaseReward: HTMLElement;
  private readonly clearPerfectBonus: HTMLElement;
  private readonly clearWallet: HTMLElement;
  private readonly clearFinesLedger: HTMLElement;
  private readonly gameoverStamp: HTMLElement;
  private readonly gameoverTitle: HTMLElement;
  private readonly gameoverDesc: HTMLElement;
  private readonly gameoverStage: HTMLElement;
  private readonly gameoverProgress: HTMLElement;
  private readonly gameoverHits: HTMLElement;
  private readonly gameoverFinesLedger: HTMLElement;
  private readonly victoryMeta: HTMLElement;
  private readonly victoryLastReward: HTMLElement;
  private readonly victoryHits: HTMLElement;
  private readonly victoryTime: HTMLElement;
  private readonly victoryWallet: HTMLElement;
  private readonly victoryFinesLedger: HTMLElement;

  private careerProfile: PlayerProfile = createDefaultProfile();
  private deltaTimerId: number | null = null;
  private damageTimerId: number | null = null;
  private cameraFlashTimerId: number | null = null;
  private hornHintHidden = false;
  private pauseArmedId: string | null = null;
  private pauseArmTimerId: number | null = null;

  // Dirty-check & throttle state (~14 Hz numeric + minimap DOM writes)
  private lastNumericSyncTime = 0;
  private lastScreen: GameScreen | null = null;
  private lastSpeedText = '';
  private lastSpeedPct = -1;
  private lastDistanceText = '';
  private lastWallet = -1;
  private lastCareerWallet = -1;
  private lastBraking = false;
  private lastFineCount = -1;
  private lastSpeedLimit = -1;
  private lastOverspeed = false;
  private lastRearThreatText = '';
  private lastRearReckless = false;
  private lastHitsBadgeText = '';
  private lastInvulnText = '';
  private lastInvulnVariant = '';
  private clearAnimRafId: number | null = null;

  constructor(callbacks: HudCallbacks) {
    this.callbacks = callbacks;

    this.screens = {
      menu: getRequiredEl('screen-menu'),
      playing: getRequiredEl('screen-playing'),
      paused: getRequiredEl('screen-paused'),
      stage_clear: getRequiredEl('screen-stage-clear'),
      game_over: getRequiredEl('screen-game-over'),
      victory: getRequiredEl('screen-victory')
    };

    this.damageVignette = getRequiredEl('hud-damage-vignette');
    this.cameraFlash = getRequiredEl('hud-camera-flash');
    this.menuAudioPill = getRequiredEl('menu-audio-pill');
    this.btnPause = getRequiredEl<HTMLButtonElement>('btn-pause');
    this.btnOpenShop = getRequiredEl<HTMLButtonElement>('btn-open-shop');
    this.menuCareerWalletValue = getRequiredEl('menu-career-wallet-value');
    this.stageSelect = getRequiredEl<HTMLSelectElement>('select-stage');

    this.shopModal = new ShopModal({
      onSelectOwnedBike: (bikeId) => {
        this.careerProfile = { ...this.careerProfile, selectedBikeId: bikeId };
        this.setSelectedBike(bikeId);
        this.callbacks.onSelectBike(bikeId);
      },
      onPurchaseBike: (bikeId, priceVnd) =>
        this.callbacks.onPurchaseBike?.(bikeId, priceVnd) ?? false,
      onTestRideBike: (bikeId) => {
        this.setSelectedBike(bikeId);
        this.callbacks.onTestRideBike?.(bikeId);
      },
      onClose: () => {
        this.syncMenuAudioPillVisibility();
        this.callbacks.onCloseShop?.();
      }
    });

    this.btnMute = getRequiredEl<HTMLButtonElement>('btn-mute');
    this.iconVolOn = getRequiredEl('icon-vol-on');
    this.iconVolOff = getRequiredEl('icon-vol-off');
    this.volumeSlider = getRequiredEl<HTMLInputElement>('volume-slider');
    this.volumeLabel = getRequiredEl('volume-label');

    this.pauseBtnMute = getRequiredEl<HTMLButtonElement>('pause-btn-mute');
    this.pauseIconVolOn = getRequiredEl('pause-icon-vol-on');
    this.pauseIconVolOff = getRequiredEl('pause-icon-vol-off');
    this.pauseVolumeSlider = getRequiredEl<HTMLInputElement>('pause-volume-slider');
    this.pauseVolumeLabel = getRequiredEl('pause-volume-label');
    this.btnToggleRetro = getRequiredEl<HTMLButtonElement>('btn-toggle-retro');

    this.showroomBikeName = getRequiredEl('showroom-bike-name');
    this.showroomBikeDesc = getRequiredEl('showroom-bike-desc');
    this.bikeCards = document.querySelectorAll<HTMLButtonElement>('[data-bike]');
    this.diffCards = document.querySelectorAll<HTMLButtonElement>('[data-difficulty]');

    this.walletValue = getRequiredEl('hud-wallet-value');
    this.walletDelta = getRequiredEl('hud-wallet-delta');
    this.comboBadge = getRequiredEl('hud-combo-badge');
    this.finePill = getRequiredEl('hud-fine-pill');
    this.invulnBadge = getRequiredEl('hud-invuln-badge');
    this.stageBadge = getRequiredEl('hud-stage-badge');
    this.stageName = getRequiredEl('hud-stage-name');
    this.distanceText = getRequiredEl('hud-distance-text');
    this.speedLimitSign = getRequiredEl('hud-speed-limit');
    this.speedLimitValue = getRequiredEl('hud-speed-limit-value');
    this.rearviewMirror = getRequiredEl('hud-rearview-mirror');
    this.rearAlert = getRequiredEl('hud-rear-alert');
    this.minimapCanvas = getRequiredEl<HTMLCanvasElement>('minimap-canvas');
    this.minimapCtx = this.minimapCanvas.getContext('2d');
    this.toastStack = getRequiredEl('hud-toast-stack');
    this.hornHint = getRequiredEl('hud-horn-hint');
    this.speedoCard = getRequiredEl('hud-speedo-card');
    this.speedValue = getRequiredEl('hud-speed-value');
    this.speedFill = getRequiredEl('hud-speed-fill');
    this.brakeBadge = getRequiredEl('hud-brake-badge');

    this.pausedStageDesc = getRequiredEl('paused-stage-desc');
    this.btnRestartPaused = getRequiredEl<HTMLButtonElement>('btn-restart-paused');
    this.btnMenuPaused = getRequiredEl<HTMLButtonElement>('btn-menu-paused');
    this.clearStars = getRequiredEl('clear-stars');
    this.clearRankBadge = getRequiredEl('clear-rank-badge');
    this.clearTitle = getRequiredEl('clear-title');
    this.clearSubtitle = getRequiredEl('clear-subtitle');
    this.clearBaseReward = getRequiredEl('clear-base-reward');
    this.clearPerfectBonus = getRequiredEl('clear-perfect-bonus');
    this.clearWallet = getRequiredEl('clear-wallet');
    this.clearFinesLedger = getRequiredEl('clear-fines-ledger');
    this.gameoverStamp = getRequiredEl('gameover-stamp');
    this.gameoverTitle = getRequiredEl('gameover-title');
    this.gameoverDesc = getRequiredEl('gameover-desc');
    this.gameoverStage = getRequiredEl('gameover-stage');
    this.gameoverProgress = getRequiredEl('gameover-progress');
    this.gameoverHits = getRequiredEl('gameover-hits');
    this.gameoverFinesLedger = getRequiredEl('gameover-fines-ledger');
    this.victoryMeta = getRequiredEl('victory-meta');
    this.victoryLastReward = getRequiredEl('victory-last-reward');
    this.victoryHits = getRequiredEl('victory-hits');
    this.victoryTime = getRequiredEl('victory-time');
    this.victoryWallet = getRequiredEl('victory-wallet');
    this.victoryFinesLedger = getRequiredEl('victory-fines-ledger');

    this.populateBikeStats();
    this.bindEvents();
  }

  private populateBikeStats(): void {
    const hondaAccel10 = Math.round((BIKES.honda.accel / 45) * 100) / 10;
    const vinfastAccel10 = Math.round((BIKES.vinfast.accel / 45) * 100) / 10;
    const hondaHand10 = Math.round((BIKES.honda.handling / 16) * 100) / 10;
    const vinfastHand10 = Math.round((BIKES.vinfast.handling / 16) * 100) / 10;

    (['honda', 'vinfast'] as const).forEach((bikeId) => {
      const container = document.getElementById(`stats-${bikeId}`);
      if (!container) return;
      const spec = BIKES[bikeId];
      const accel10 = bikeId === 'honda' ? hondaAccel10 : vinfastAccel10;
      const hand10 = bikeId === 'honda' ? hondaHand10 : vinfastHand10;

      const isFaster =
        bikeId === 'vinfast' && BIKES.vinfast.displayMaxKmh > BIKES.honda.displayMaxKmh;
      const isQuicker = bikeId === 'vinfast' && vinfastAccel10 > hondaAccel10;
      const isMoreAgile = bikeId === 'honda' && hondaHand10 > vinfastHand10;

      const rows = [
        {
          label: 'Tốc độ',
          pct: Math.round((spec.displayMaxKmh / 85) * 100),
          num: `${spec.displayMaxKmh} km/h`,
          edge: isFaster
        },
        {
          label: 'Gia tốc',
          pct: Math.round(accel10 * 10),
          num: `${formatDecimalComma(accel10)}/10`,
          edge: isQuicker
        },
        {
          label: 'Linh hoạt',
          pct: Math.round(hand10 * 10),
          num: `${formatDecimalComma(hand10)}/10`,
          edge: isMoreAgile
        }
      ];

      container.innerHTML = rows
        .map(
          (row) => `
          <div class="stat-row">
            <span class="stat-label">${row.label}</span>
            <div class="stat-track"><div class="stat-fill" style="width:${Math.min(100, row.pct)}%"></div></div>
            <span class="stat-num">${row.num}${row.edge ? '<span class="stat-edge" aria-label="Nhỉnh hơn">▲</span>' : ''}</span>
          </div>`
        )
        .join('');
    });
  }

  private bindEvents(): void {
    this.bikeCards.forEach((btn) => {
      btn.addEventListener('click', () => {
        const bikeId = btn.dataset.bike as BikeId | undefined;
        if (bikeId) {
          this.setSelectedBike(bikeId);
          this.callbacks.onSelectBike(bikeId);
        }
      });
    });

    this.diffCards.forEach((btn) => {
      btn.addEventListener('click', () => {
        const diffId = btn.dataset.difficulty as DifficultyId | undefined;
        if (diffId) {
          this.setSelectedDifficulty(diffId);
          this.callbacks.onSelectDifficulty(diffId);
        }
      });
    });

    this.stageSelect.addEventListener('change', () => {
      const parsed = Number(this.stageSelect.value);
      const valid = STAGES.find((s) => s.id === parsed)?.id ?? 1;
      this.callbacks.onSelectStage?.(valid);
      this.stageSelect.blur();
    });

    getRequiredEl('btn-start').addEventListener('click', () => {
      this.callbacks.onStartGame();
    });

    this.btnOpenShop.addEventListener('click', () => {
      this.setShopOpen(true);
    });

    this.btnPause.addEventListener('click', () => {
      this.btnPause.blur();
      this.callbacks.onTogglePause();
    });
    getRequiredEl('btn-resume').addEventListener('click', () => {
      this.callbacks.onTogglePause();
    });
    getRequiredEl('btn-next-stage').addEventListener('click', () => {
      this.callbacks.onNextStage();
    });

    // Two-click confirmation guards for destructive Pause actions
    this.bindConfirmButton(this.btnRestartPaused, 'CHƠI LẠI TỪ ĐẦU', () => {
      this.callbacks.onRestart();
    });
    this.bindConfirmButton(this.btnMenuPaused, 'VỀ MENU CHÍNH', () => {
      this.callbacks.onReturnToMenu();
    });

    getRequiredEl('btn-restart-gameover').addEventListener('click', () => {
      this.callbacks.onRestart();
    });
    getRequiredEl('btn-restart-victory').addEventListener('click', () => {
      this.callbacks.onRestart();
    });
    getRequiredEl('btn-menu-gameover').addEventListener('click', () => {
      this.callbacks.onReturnToMenu();
    });
    getRequiredEl('btn-menu-victory').addEventListener('click', () => {
      this.callbacks.onReturnToMenu();
    });

    const wireAudioControls = (btn: HTMLButtonElement, slider: HTMLInputElement) => {
      btn.addEventListener('click', () => {
        btn.blur();
        this.callbacks.onToggleMute();
      });
      slider.addEventListener('input', () => {
        const vol = Number(slider.value) / 100;
        this.callbacks.onVolumeChange(vol);
      });
      slider.addEventListener('change', () => {
        slider.blur();
      });
    };

    wireAudioControls(this.btnMute, this.volumeSlider);
    wireAudioControls(this.pauseBtnMute, this.pauseVolumeSlider);

    this.btnToggleRetro.addEventListener('click', () => {
      const enabled = this.callbacks.onToggleRetroEffect();
      this.btnToggleRetro.classList.toggle('active', enabled);
      this.btnToggleRetro.setAttribute('aria-pressed', String(enabled));
      this.btnToggleRetro.textContent = enabled ? 'Đang bật' : 'Đã tắt';
    });

    this.bindTouchControls();
  }

  private bindConfirmButton(
    btn: HTMLButtonElement,
    defaultLabel: string,
    onConfirmed: () => void
  ): void {
    btn.dataset.defaultLabel = defaultLabel;
    btn.addEventListener('click', () => {
      if (this.pauseArmedId === btn.id) {
        this.resetPauseConfirmations();
        onConfirmed();
        return;
      }
      this.resetPauseConfirmations();
      this.pauseArmedId = btn.id;
      btn.classList.add('confirm-armed');
      btn.textContent = `XÁC NHẬN: ${defaultLabel}?`;
      this.pauseArmTimerId = window.setTimeout(() => {
        this.resetPauseConfirmations();
      }, 3000);
    });
  }

  private resetPauseConfirmations(): void {
    if (this.pauseArmTimerId !== null) {
      window.clearTimeout(this.pauseArmTimerId);
      this.pauseArmTimerId = null;
    }
    this.pauseArmedId = null;
    for (const btn of [this.btnRestartPaused, this.btnMenuPaused]) {
      btn.classList.remove('confirm-armed');
      btn.textContent = btn.dataset.defaultLabel ?? btn.textContent ?? '';
    }
  }

  private bindTouchControls(): void {
    const bindHold = (id: string, key: keyof PlayerInputState) => {
      const el = document.getElementById(id);
      if (!el) return;
      const setPressed = (down: boolean) => {
        el.classList.toggle('pressed', down);
        this.callbacks.onTouchInput({ [key]: down });
      };
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        setPressed(true);
      });
      for (const ev of ['pointerup', 'pointercancel', 'pointerleave'] as const) {
        el.addEventListener(ev, () => setPressed(false));
      }
    };

    bindHold('touch-left', 'left');
    bindHold('touch-right', 'right');
    bindHold('touch-gas', 'accelerate');
    bindHold('touch-brake', 'brake');

    const hornBtn = document.getElementById('touch-horn');
    hornBtn?.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.callbacks.onHorn();
    });
  }

  public setCareerProfile(profile: PlayerProfile): void {
    this.careerProfile = profile;
    this.lastCareerWallet = profile.careerWallet;
    this.menuCareerWalletValue.textContent = formatVND(profile.careerWallet);
    this.shopModal.setProfile(profile);
  }

  public isShopOpen(): boolean {
    return this.shopModal.isOpen();
  }

  private syncMenuAudioPillVisibility(): void {
    const isPlayingOrPaused =
      this.lastScreen === 'playing' || this.lastScreen === 'paused';
    this.menuAudioPill.classList.toggle(
      'hidden',
      isPlayingOrPaused || this.shopModal.isOpen()
    );
  }

  public setShopOpen(open: boolean): void {
    const wasOpen = this.shopModal.isOpen();
    this.shopModal.setOpen(open);
    this.syncMenuAudioPillVisibility();
    if (open && !wasOpen) {
      this.callbacks.onOpenShop?.();
    }
  }

  public setSelectedBike(bikeId: BikeId): void {
    this.bikeCards.forEach((btn) => {
      const active = btn.dataset.bike === bikeId;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', String(active));
    });
    this.showroomBikeName.textContent = BIKES[bikeId].name;
    this.showroomBikeDesc.textContent = BIKES[bikeId].tagline;
    if (this.careerProfile.selectedBikeId !== bikeId) {
      this.careerProfile = { ...this.careerProfile, selectedBikeId: bikeId };
      this.shopModal.setProfile(this.careerProfile);
    }
  }

  public setSelectedDifficulty(difficultyId: DifficultyId): void {
    this.diffCards.forEach((btn) => {
      const active = btn.dataset.difficulty === difficultyId;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', String(active));
    });
  }

  public setSelectedStage(stageId: StageId): void {
    const targetValue = String(stageId);
    if (this.stageSelect.value !== targetValue) {
      this.stageSelect.value = targetValue;
    }
  }

  public syncAudioUI(muted: boolean, volume: number): void {
    const pct = Math.round(Math.max(0, Math.min(1, volume)) * 100);
    const isMuted = muted || pct === 0;

    this.volumeSlider.value = String(pct);
    this.volumeLabel.textContent = `${pct}%`;
    this.btnMute.classList.toggle('muted', isMuted);
    this.iconVolOn.classList.toggle('hidden', isMuted);
    this.iconVolOff.classList.toggle('hidden', !isMuted);

    this.pauseVolumeSlider.value = String(pct);
    this.pauseVolumeLabel.textContent = `${pct}%`;
    this.pauseBtnMute.classList.toggle('muted', isMuted);
    this.pauseIconVolOn.classList.toggle('hidden', isMuted);
    this.pauseIconVolOff.classList.toggle('hidden', !isMuted);
  }

  public triggerCameraFlash(): void {
    this.cameraFlash.classList.add('active');
    void this.cameraFlash.offsetWidth;
    if (this.cameraFlashTimerId !== null) {
      window.clearTimeout(this.cameraFlashTimerId);
    }
    this.cameraFlashTimerId = window.setTimeout(() => {
      this.cameraFlash.classList.remove('active');
      this.cameraFlashTimerId = null;
    }, 60);
  }

  public showViolationToast(violation: RecordedViolation): void {
    while (this.toastStack.children.length >= 2) {
      this.toastStack.firstElementChild?.remove();
    }

    const toast = document.createElement('div');
    toast.className = 'violation-toast';
    toast.textContent = `📷 Phạt nguội: ${violation.label} (+${formatVND(violation.amount)} — trừ tại đích)`;
    this.toastStack.appendChild(toast);

    window.setTimeout(() => {
      toast.remove();
    }, 2400);
  }

  public showPenaltyToast(obstacleType: ObstacleTypeId, penalty: number): void {
    const shortName = OBSTACLE_TOAST_NAME[obstacleType] ?? OBSTACLE_TYPES[obstacleType].label;

    while (this.toastStack.children.length >= 2) {
      this.toastStack.firstElementChild?.remove();
    }

    const toast = document.createElement('div');
    toast.className = 'penalty-toast';
    toast.textContent = `Đâm ${shortName}! −${formatVND(penalty)}`;
    this.toastStack.appendChild(toast);

    window.setTimeout(() => {
      toast.remove();
    }, 1800);

    this.walletDelta.textContent = `−${formatVND(penalty)}`;
    this.walletDelta.classList.remove('hidden');
    void this.walletDelta.offsetWidth;
    this.walletValue.classList.add('hit-flash');

    if (this.deltaTimerId !== null) window.clearTimeout(this.deltaTimerId);
    this.deltaTimerId = window.setTimeout(() => {
      this.walletDelta.classList.add('hidden');
      this.walletValue.classList.remove('hit-flash');
      this.deltaTimerId = null;
    }, 1100);

    this.damageVignette.classList.add('active');
    if (this.damageTimerId !== null) window.clearTimeout(this.damageTimerId);
    this.damageTimerId = window.setTimeout(() => {
      this.damageVignette.classList.remove('active');
      this.damageTimerId = null;
    }, 240);
  }

  public hidePenaltyToast(): void {
    this.toastStack.innerHTML = '';
    this.walletDelta.classList.add('hidden');
    this.walletValue.classList.remove('hit-flash');
    this.damageVignette.classList.remove('active');
    this.cameraFlash.classList.remove('active');
  }

  private drawGpsMinimap(
    stageId: StageId,
    distance: number,
    stageLength: number,
    roadWidth: number,
    lateralOffset: number,
    isBraking: boolean,
    features: StageRouteFeatures,
    elapsedTime: number
  ): void {
    const ctx = this.minimapCtx;
    if (!ctx) return;

    const w = this.minimapCanvas.width;
    const h = this.minimapCanvas.height;

    ctx.clearRect(0, 0, w, h);

    // Dark map surface
    ctx.fillStyle = '#121a21';
    ctx.fillRect(0, 0, w, h);

    // Subtle city block grid lines
    ctx.strokeStyle = 'rgba(124, 226, 228, 0.08)';
    ctx.lineWidth = 1;
    const gridSpacing = 22;
    const scrollPx = (distance * 1.1) % gridSpacing;
    for (let y = scrollPx; y < h; y += gridSpacing) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    for (let x = 22; x < w; x += gridSpacing) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }

    const lookAheadMeters = 320;
    const lookBehindMeters = 32;
    const playerY = h - 28;
    const topY = 14;
    const mapSpanY = playerY - topY;
    const baseRoadX = getRoadCenterX(stageId, distance);
    const scaleX = 2.0;

    const toCanvasPoint = (d: number): { x: number; y: number } => {
      const clampedD = Math.max(0, Math.min(stageLength, d));
      const relD = clampedD - distance;
      const xOffset = (getRoadCenterX(stageId, clampedD) - baseRoadX) * scaleX;
      const x = Math.max(16, Math.min(w - 16, w * 0.5 + xOffset));
      const y = playerY - (relD / lookAheadMeters) * mapSpanY;
      return { x, y };
    };

    const startD = Math.max(0, distance - lookBehindMeters);
    const endD = Math.min(stageLength, distance + lookAheadMeters);
    const steps = 22;

    // Road casing
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const d = startD + ((endD - startD) * i) / steps;
      const pt = toCanvasPoint(d);
      if (i === 0) ctx.moveTo(pt.x, pt.y);
      else ctx.lineTo(pt.x, pt.y);
    }
    ctx.strokeStyle = 'rgba(217, 164, 65, 0.42)';
    ctx.lineWidth = 18;
    ctx.stroke();

    // Inner road ribbon
    ctx.strokeStyle = '#253340';
    ctx.lineWidth = 13;
    ctx.stroke();

    // Upcoming intersection cross-streets & glowing traffic-light indicator (within 320m)
    for (const zone of features.intersections) {
      if (zone.distance < startD || zone.distance > endD) continue;
      const pt = toCanvasPoint(zone.distance);
      ctx.fillStyle = '#253340';
      ctx.fillRect(10, pt.y - 4, w - 20, 8);
      ctx.strokeStyle = 'rgba(246, 238, 220, 0.28)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(10, pt.y - 4);
      ctx.lineTo(w - 10, pt.y - 4);
      ctx.moveTo(10, pt.y + 4);
      ctx.lineTo(w - 10, pt.y + 4);
      ctx.stroke();

      const light = getTrafficLightState(zone, elapsedTime);
      const lightGlow =
        light === 'red'
          ? 'rgba(255, 90, 71, 0.42)'
          : light === 'yellow'
            ? 'rgba(243, 190, 89, 0.42)'
            : 'rgba(76, 166, 107, 0.42)';
      const lightColor =
        light === 'red' ? '#ff5a47' : light === 'yellow' ? '#f3be59' : '#57d484';

      ctx.fillStyle = lightGlow;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 7, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = lightColor;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 3.6, 0, Math.PI * 2);
      ctx.fill();
    }

    // Active GPS route path ahead of player
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const d = distance + ((endD - distance) * i) / steps;
      const pt = toCanvasPoint(d);
      if (i === 0) ctx.moveTo(pt.x, pt.y);
      else ctx.lineTo(pt.x, pt.y);
    }
    ctx.strokeStyle = '#48c9cb';
    ctx.lineWidth = 4;
    ctx.stroke();

    // Center dashed lane guide
    ctx.save();
    ctx.setLineDash([4, 5]);
    ctx.strokeStyle = 'rgba(246, 238, 220, 0.45)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();

    // Upcoming Speed Camera Phạt Nguội indicator within 320m ahead
    for (const cam of features.cameras) {
      if (cam.distance < distance - 5 || cam.distance > endD) continue;
      const camPt = toCanvasPoint(cam.distance);
      const badgeX = Math.min(w - 11, camPt.x + 14);
      const badgeY = camPt.y;

      ctx.fillStyle = 'rgba(217, 78, 59, 0.92)';
      ctx.beginPath();
      ctx.arc(badgeX, badgeY, 6.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff6f2';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // Tiny camera lens icon inside warning dot
      ctx.fillStyle = '#fff6f2';
      ctx.fillRect(badgeX - 3.2, badgeY - 2.2, 6.4, 4.4);
      ctx.fillStyle = '#1b1410';
      ctx.beginPath();
      ctx.arc(badgeX, badgeY, 1.4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Destination flag marker (on-route when close, or top-edge beacon)
    if (endD >= stageLength - 1) {
      const goalPt = toCanvasPoint(stageLength);
      ctx.fillStyle = '#4ca66b';
      ctx.beginPath();
      ctx.arc(goalPt.x, goalPt.y, 6.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#f6eedc';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = '#f6eedc';
      ctx.fillRect(goalPt.x - 1, goalPt.y - 10, 2, 10);
      ctx.fillStyle = '#e8a838';
      ctx.fillRect(goalPt.x + 1, goalPt.y - 10, 7, 5);
    } else {
      const topPt = toCanvasPoint(endD);
      ctx.fillStyle = '#e8a838';
      ctx.beginPath();
      ctx.arc(topPt.x, Math.max(8, topPt.y), 3.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Shipper bike pin (clamped inside ribbon width)
    const halfRoad = Math.max(3, roadWidth * 0.5);
    const normLateral = Math.max(-1, Math.min(1, lateralOffset / halfRoad));
    const pinX = w * 0.5 + normLateral * 4.5;
    const pinY = playerY;

    ctx.fillStyle = isBraking ? 'rgba(217, 78, 59, 0.35)' : 'rgba(232, 168, 56, 0.3)';
    ctx.beginPath();
    ctx.arc(pinX, pinY, 10, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = isBraking ? '#ff6b57' : '#e8a838';
    ctx.strokeStyle = '#fff8e8';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(pinX, pinY - 7);
    ctx.lineTo(pinX + 5.5, pinY + 5);
    ctx.lineTo(pinX, pinY + 2.2);
    ctx.lineTo(pinX - 5.5, pinY + 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Bottom progress strip inside phone display
    const pct = stageLength > 0 ? Math.max(0, Math.min(1, distance / stageLength)) : 0;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.fillRect(8, h - 7, w - 16, 3);
    ctx.fillStyle = '#e8a838';
    ctx.fillRect(8, h - 7, Math.max(4, (w - 16) * pct), 3);
  }

  private animateStageClearNumbers(
    baseReward: number,
    newWallet: number,
    perfectBonus: number,
    hits: number,
    prevWalletOverride?: number
  ): void {
    if (this.clearAnimRafId !== null) {
      window.cancelAnimationFrame(this.clearAnimRafId);
    }
    const prevWallet =
      prevWalletOverride ?? Math.max(0, newWallet - baseReward - perfectBonus);
    const startTime = performance.now();
    const duration = 450;

    const tick = (now: number) => {
      const t = Math.min(1, (now - startTime) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const curBase = Math.round(baseReward * eased);
      const curWallet = Math.round(prevWallet + (newWallet - prevWallet) * eased);

      this.clearBaseReward.textContent = `+${formatVND(curBase)}`;
      this.clearWallet.textContent = formatVND(curWallet);

      if (t >= 1) {
        if (hits === 0) {
          this.clearPerfectBonus.textContent = `+${formatVND(perfectBonus)} (0 lỗi)`;
        } else {
          this.clearPerfectBonus.textContent = `Không đạt (${hits} lần va chạm)`;
        }
        this.clearAnimRafId = null;
      } else {
        this.clearAnimRafId = window.requestAnimationFrame(tick);
      }
    };
    this.clearAnimRafId = window.requestAnimationFrame(tick);
  }

  public render(view: HudFrameView): void {
    const { state, displayKmh, invulnRemaining } = view;
    const stage = STAGES[state.stageIndex] ?? STAGES[0];
    const bike = BIKES[state.bikeId];
    const diff = DIFFICULTIES[state.difficultyId];
    const screenChanged = this.lastScreen !== state.screen;
    this.lastScreen = state.screen;

    if (
      view.careerWallet !== undefined &&
      view.careerWallet !== this.lastCareerWallet
    ) {
      this.setCareerProfile({
        ...this.careerProfile,
        careerWallet: view.careerWallet,
        totalDeliveries:
          view.totalDeliveries ?? this.careerProfile.totalDeliveries,
        selectedBikeId: state.bikeId
      });
    }

    if (screenChanged) {
      (Object.keys(this.screens) as GameScreen[]).forEach((key) => {
        const show =
          key === state.screen ||
          (key === 'playing' && state.screen === 'paused');
        this.screens[key].classList.toggle('hidden', !show);
      });

      const isPlayingOrPaused = state.screen === 'playing' || state.screen === 'paused';
      this.btnPause.classList.toggle('hidden', !isPlayingOrPaused);

      if (state.screen !== 'menu' && this.isShopOpen()) {
        this.setShopOpen(false);
      }
      this.syncMenuAudioPillVisibility();

      if (state.screen !== 'paused') {
        this.resetPauseConfirmations();
      }
      if (state.screen === 'playing') {
        this.lastNumericSyncTime = 0;
      }
    }

    if (state.screen === 'menu') {
      if (screenChanged) {
        this.hornHintHidden = false;
        this.hornHint.classList.remove('hidden');
        this.setSelectedBike(state.bikeId);
        this.setSelectedDifficulty(state.difficultyId);
        this.setSelectedStage(state.stageId);
        this.hidePenaltyToast();
      } else {
        this.setSelectedStage(state.stageId);
      }
      return;
    }

    // Transient horn hint auto-hides after 5s on Stage 1 (or any subsequent stage)
    const shouldHideHorn = state.stageId > 1 || state.elapsedStageTime > 5;
    if (shouldHideHorn !== this.hornHintHidden) {
      this.hornHintHidden = shouldHideHorn;
      this.hornHint.classList.toggle('hidden', shouldHideHorn);
    }

    // Brake indicator badge
    const braking = Boolean(view.isBraking) && state.screen === 'playing';
    if (braking !== this.lastBraking || screenChanged) {
      this.lastBraking = braking;
      this.brakeBadge.classList.toggle('hidden', !braking);
      this.speedoCard.classList.toggle('braking', braking);
    }

    // Speed limit sign & overspeed warning
    const limitKmh = view.speedLimitKmh ?? stage.speedLimitKmh;
    if (limitKmh !== this.lastSpeedLimit || screenChanged) {
      this.lastSpeedLimit = limitKmh;
      this.speedLimitValue.textContent = String(limitKmh);
    }
    const isOverspeed = state.screen === 'playing' && displayKmh > limitKmh;
    if (isOverspeed !== this.lastOverspeed || screenChanged) {
      this.lastOverspeed = isOverspeed;
      this.speedLimitSign.classList.toggle('overspeed', isOverspeed);
      this.speedoCard.classList.toggle('overspeed', isOverspeed);
    }

    // Rearview mirror threat indicator
    const threat = view.rearThreat;
    const rearActive = state.screen === 'playing' && Boolean(threat?.active);
    const rearReckless = rearActive && Boolean(threat?.isReckless);
    const rearText = rearActive
      ? `⚠ XE SAU ${Math.max(1, Math.round(threat?.distanceMeters ?? 0))}m`
      : '';
    if (
      rearText !== this.lastRearThreatText ||
      rearReckless !== this.lastRearReckless ||
      screenChanged
    ) {
      this.lastRearThreatText = rearText;
      this.lastRearReckless = rearReckless;
      this.rearviewMirror.classList.toggle('threat', rearActive);
      this.rearAlert.classList.toggle('hidden', !rearActive);
      this.rearAlert.classList.toggle('reckless', rearReckless);
      if (rearText) {
        this.rearAlert.textContent = rearText;
      }
    }

    // Wallet & semantic hit badge
    if (state.wallet !== this.lastWallet || screenChanged) {
      this.lastWallet = state.wallet;
      this.walletValue.textContent = formatVND(state.wallet);
      this.walletValue.classList.toggle('low', state.wallet <= diff.startingWallet * 0.28);
    }

    // Cold fine counter pill
    const fineCount = view.pendingFineCount ?? 0;
    const fineTotal = view.pendingFineTotal ?? 0;
    if (fineCount !== this.lastFineCount || screenChanged) {
      this.lastFineCount = fineCount;
      this.finePill.textContent = `📷 ${fineCount} lỗi`;
      this.finePill.title =
        fineCount > 0
          ? `Tạm ghi ${fineCount} lỗi phạt nguội (${formatVND(fineTotal)}) — trừ tại đích`
          : 'Chưa có lỗi phạt nguội';
      this.finePill.classList.remove('has-fines', 'heavy-fines');
      if (fineCount === 1) {
        this.finePill.classList.add('has-fines');
      } else if (fineCount >= 2) {
        this.finePill.classList.add('heavy-fines');
      }
    }

    const comboText =
      state.hitsInStage === 0
        ? state.comboSeconds >= 5
          ? `An toàn · ${Math.floor(state.comboSeconds)}s`
          : 'An toàn · 0 lỗi'
        : `Va chạm: ${state.hitsInStage} lần`;

    if (comboText !== this.lastHitsBadgeText || screenChanged) {
      this.lastHitsBadgeText = comboText;
      this.comboBadge.textContent = comboText;
      this.comboBadge.classList.remove('clean', 'warning', 'danger');
      if (state.hitsInStage === 0) {
        this.comboBadge.classList.add('clean');
      } else if (state.hitsInStage === 1) {
        this.comboBadge.classList.add('warning');
      } else {
        this.comboBadge.classList.add('danger');
      }
    }

    const crashPhase = view.crashPhase ?? 'riding';
    const isOncoming =
      state.screen === 'playing' &&
      crashPhase === 'riding' &&
      isOncomingLane(view.lateralOffset ?? 1.4);

    let invulnText = '';
    let invulnVariant = 'invuln';
    if (crashPhase !== 'riding') {
      if (crashPhase === 'impact_tumble') {
        invulnText = 'Ngã xe! Đang trượt...';
        invulnVariant = 'danger';
      } else if (crashPhase === 'stand_up') {
        invulnText = 'Đang đứng dậy...';
        invulnVariant = 'warning';
      } else if (crashPhase === 'run_to_bike') {
        invulnText = 'Chạy lại dựng xe...';
        invulnVariant = 'warning';
      } else {
        invulnText = 'Lên xe chuẩn bị chạy!';
        invulnVariant = 'teal';
      }
    } else if (invulnRemaining > 0) {
      invulnText = `Miễn thương ${formatDecimalComma(invulnRemaining)}s`;
      invulnVariant = 'invuln';
    } else if (isOncoming) {
      invulnText = 'Làn ngược chiều!';
      invulnVariant = 'warning';
    }

    if (
      invulnText !== this.lastInvulnText ||
      invulnVariant !== this.lastInvulnVariant ||
      screenChanged
    ) {
      this.lastInvulnText = invulnText;
      this.lastInvulnVariant = invulnVariant;
      this.invulnBadge.classList.remove('invuln', 'teal', 'warning', 'danger');
      if (invulnText) {
        this.invulnBadge.textContent = invulnText;
        this.invulnBadge.classList.add(invulnVariant);
        this.invulnBadge.classList.remove('hidden');
      } else {
        this.invulnBadge.classList.add('hidden');
      }
    }

    // Throttle rapidly updating distance/speed/minimap mutations to ~14 Hz
    const now = performance.now();
    if (screenChanged || now - this.lastNumericSyncTime >= 68) {
      this.lastNumericSyncTime = now;

      const stageBadgeText = `Chặng ${stage.id}/${STAGES.length}`;
      if (this.stageBadge.textContent !== stageBadgeText) {
        this.stageBadge.textContent = stageBadgeText;
      }
      const laneTag = `${stage.laneCount} làn`;
      if (this.stageName.textContent !== laneTag) {
        this.stageName.textContent = laneTag;
      }

      const remaining = Math.max(0, stage.length - state.distance);
      const distStr = `${formatRemainingDistance(remaining)} · Đích`;
      if (distStr !== this.lastDistanceText) {
        this.lastDistanceText = distStr;
        this.distanceText.textContent = distStr;
      }

      const features = view.routeFeatures ?? getStageRouteFeatures(stage.id);
      const elapsedTime = view.elapsedStageTime ?? state.elapsedStageTime;
      this.drawGpsMinimap(
        stage.id,
        state.distance,
        stage.length,
        stage.roadWidth,
        view.lateralOffset ?? 0,
        braking,
        features,
        elapsedTime
      );

      const kmhStr = String(Math.max(0, Math.round(displayKmh)));
      if (kmhStr !== this.lastSpeedText) {
        this.lastSpeedText = kmhStr;
        this.speedValue.textContent = kmhStr;
      }

      const speedPct = Math.max(
        0,
        Math.min(100, Math.round((displayKmh / bike.displayMaxKmh) * 100))
      );
      if (speedPct !== this.lastSpeedPct) {
        this.lastSpeedPct = speedPct;
        this.speedFill.style.width = `${speedPct}%`;
      }
    }

    if (screenChanged && state.screen === 'paused') {
      this.pausedStageDesc.textContent = `Đang giao hàng tại Chặng ${stage.id}/${STAGES.length} (${stage.codeLabel} · ${stage.laneCount} làn) — ${stage.shortName}`;
    }

    if (screenChanged && state.screen === 'stage_clear') {
      const hits = state.hitsInStage;
      const base = state.lastStageReward || diff.stageReward;
      const bonus = state.lastPerfectBonus;
      const settlement = state.lastColdFineSettlement;
      const fineCountClear = settlement?.violations.length ?? 0;
      const stars = hits === 0 && fineCountClear === 0 ? 3 : hits <= 2 ? 2 : 1;

      this.clearStars.innerHTML = [1, 2, 3].map((n) => createStarSvg(n <= stars)).join('');
      this.clearRankBadge.className = `retro-stamp ${
        hits === 0 && fineCountClear === 0 ? 'success' : 'warning'
      }`;
      this.clearRankBadge.textContent =
        hits === 0 && fineCountClear === 0
          ? 'GIAO SẠCH KHÔNG LỖI'
          : fineCountClear > 0
            ? `ĐÃ TRỪ ${fineCountClear} LỖI PHẠT NGUỘI`
            : 'GIAO HÀNG ĐÚNG HẸN';
      this.clearTitle.textContent = `QUA CHẶNG ${stage.id}/${STAGES.length}!`;
      this.clearSubtitle.textContent = `Bài ${stage.codeLabel} · Đã tới ${stage.toLabel}`;
      this.animateStageClearNumbers(
        base,
        state.wallet,
        bonus,
        hits,
        settlement?.currentWallet
      );
      renderColdFinesLedger(this.clearFinesLedger, settlement);
    }

    if (screenChanged && state.screen === 'game_over') {
      const pct = Math.max(0, Math.min(100, Math.round(state.progress * 100)));
      const settlement = state.lastColdFineSettlement;
      if (settlement?.bankruptByColdFines) {
        this.gameoverStamp.textContent = 'BIÊN BẢN PHẠT NGUỘI';
        this.gameoverTitle.textContent = 'CHÁY VÍ VÌ PHẠT NGUỘI!';
        this.gameoverDesc.textContent = `Tổng phạt nguội ${formatVND(settlement.totalColdFines)} (${settlement.violations.length} lỗi) đã trừ cạn ví tại đích ${stage.toLabel}.`;
      } else {
        this.gameoverStamp.textContent = 'VÍ TIỀN ĐÃ CẠN';
        this.gameoverTitle.textContent = 'HẾT TIỀN VÍ!';
        this.gameoverDesc.textContent =
          'Ví còn 0 đ sau quá nhiều va chạm trên phố. Hãy bình tĩnh luồn lách lại nhé!';
      }

      const lastLabel = state.lastObstacleHit
        ? OBSTACLE_TYPES[state.lastObstacleHit].label
        : 'vật cản trên phố';
      this.gameoverStage.textContent = `Chặng ${stage.id}/${STAGES.length} (${stage.shortName})`;
      this.gameoverProgress.textContent = `${pct}%`;
      this.gameoverHits.textContent = settlement?.bankruptByColdFines
        ? state.totalHits === 0
          ? '0 lần (Cháy ví vì Phạt Nguội)'
          : `${state.totalHits} lần (Cháy ví vì Phạt Nguội)`
        : `${state.totalHits} lần (cú cuối: ${lastLabel})`;
      renderColdFinesLedger(this.gameoverFinesLedger, settlement);
    }

    if (screenChanged && state.screen === 'victory') {
      const settlement = state.lastColdFineSettlement;
      const totalStageLast =
        (state.lastStageReward || diff.stageReward) + state.lastPerfectBonus;
      const netLast = settlement ? settlement.netChange : totalStageLast;
      const netPrefix = netLast >= 0 ? '+' : '−';

      this.victoryMeta.textContent = `${bike.name} · ${diff.label}`;
      this.victoryLastReward.textContent = `${netPrefix}${formatVND(Math.abs(netLast))}`;
      this.victoryHits.textContent = `${state.totalHits} lần`;
      this.victoryTime.textContent = formatDuration(state.totalRunTime);
      this.victoryWallet.textContent = formatVND(state.wallet);
      renderColdFinesLedger(this.victoryFinesLedger, settlement);
    }
  }

  public dispose(): void {
    if (this.deltaTimerId !== null) window.clearTimeout(this.deltaTimerId);
    if (this.damageTimerId !== null) window.clearTimeout(this.damageTimerId);
    if (this.cameraFlashTimerId !== null) window.clearTimeout(this.cameraFlashTimerId);
    if (this.clearAnimRafId !== null) window.cancelAnimationFrame(this.clearAnimRafId);
    this.shopModal.dispose();
    this.resetPauseConfirmations();
  }
}
