import {
  BIKES,
  DIFFICULTIES,
  OBSTACLE_TYPES,
  STAGES,
  type BikeId,
  type DifficultyId,
  type ObstacleTypeId
} from '../config/gameConfig.ts';
import { formatVND } from '../core/economy.ts';
import type { CrashPhase } from '../core/crashSequence.ts';
import type { GameScreen, GameSessionState } from '../core/gameState.ts';
import { isOncomingLane } from '../core/trafficRules.ts';
import type { PlayerInputState } from '../gameplay/playerController.ts';

export interface HudCallbacks {
  onSelectBike: (bikeId: BikeId) => void;
  onSelectDifficulty: (difficultyId: DifficultyId) => void;
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
}

export interface HudFrameView {
  state: GameSessionState;
  displayKmh: number;
  invulnRemaining: number;
  crashPhase?: CrashPhase;
  lateralOffset?: number;
}

const OBSTACLE_TOAST_NAME: Record<ObstacleTypeId, string> = {
  motorbike: 'xe máy',
  flower_bike: 'xe đạp hoa',
  vendor: 'gánh hàng rong',
  car: 'ô tô',
  bus: 'xe buýt 14',
  truck: 'xe tải'
};

function getRequiredEl<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) {
    throw new Error(`Missing required HUD element #${id}`);
  }
  return el as T;
}

function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function formatMeters(meters: number): string {
  return Math.max(0, Math.round(meters)).toLocaleString('vi-VN');
}

function formatDecimalComma(num: number): string {
  return num.toFixed(1).replace('.', ',');
}

function createStarSvg(lit: boolean): string {
  return `<svg class="star-icon${lit ? ' lit' : ''}" viewBox="0 0 24 24" fill="${lit ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;
}

export class HudController {
  private readonly callbacks: HudCallbacks;

  private readonly screens: Record<GameScreen, HTMLElement>;
  private readonly damageVignette: HTMLElement;
  private readonly menuAudioPill: HTMLElement;
  private readonly btnPause: HTMLButtonElement;

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

  // In-game 3-zone HUD elements
  private readonly walletValue: HTMLElement;
  private readonly walletDelta: HTMLElement;
  private readonly comboBadge: HTMLElement;
  private readonly invulnBadge: HTMLElement;
  private readonly stageBadge: HTMLElement;
  private readonly stageName: HTMLElement;
  private readonly distanceText: HTMLElement;
  private readonly progressFill: HTMLElement;
  private readonly progressMarker: HTMLElement;
  private readonly fromLabel: HTMLElement;
  private readonly toLabel: HTMLElement;
  private readonly toastStack: HTMLElement;
  private readonly hornHint: HTMLElement;
  private readonly speedValue: HTMLElement;
  private readonly speedFill: HTMLElement;

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
  private readonly gameoverStage: HTMLElement;
  private readonly gameoverProgress: HTMLElement;
  private readonly gameoverHits: HTMLElement;
  private readonly victoryMeta: HTMLElement;
  private readonly victoryLastReward: HTMLElement;
  private readonly victoryHits: HTMLElement;
  private readonly victoryTime: HTMLElement;
  private readonly victoryWallet: HTMLElement;

  private deltaTimerId: number | null = null;
  private damageTimerId: number | null = null;
  private hornHintHidden = false;
  private pauseArmedId: string | null = null;
  private pauseArmTimerId: number | null = null;

  // Dirty-check & throttle state (~14 Hz numeric DOM writes)
  private lastNumericSyncTime = 0;
  private lastScreen: GameScreen | null = null;
  private lastSpeedText = '';
  private lastSpeedPct = -1;
  private lastDistanceText = '';
  private lastProgressPct = -1;
  private lastWallet = -1;
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
    this.menuAudioPill = getRequiredEl('menu-audio-pill');
    this.btnPause = getRequiredEl<HTMLButtonElement>('btn-pause');

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
    this.invulnBadge = getRequiredEl('hud-invuln-badge');
    this.stageBadge = getRequiredEl('hud-stage-badge');
    this.stageName = getRequiredEl('hud-stage-name');
    this.distanceText = getRequiredEl('hud-distance-text');
    this.progressFill = getRequiredEl('hud-progress-fill');
    this.progressMarker = getRequiredEl('hud-progress-marker');
    this.fromLabel = getRequiredEl('hud-from-label');
    this.toLabel = getRequiredEl('hud-to-label');
    this.toastStack = getRequiredEl('hud-toast-stack');
    this.hornHint = getRequiredEl('hud-horn-hint');
    this.speedValue = getRequiredEl('hud-speed-value');
    this.speedFill = getRequiredEl('hud-speed-fill');

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
    this.gameoverStage = getRequiredEl('gameover-stage');
    this.gameoverProgress = getRequiredEl('gameover-progress');
    this.gameoverHits = getRequiredEl('gameover-hits');
    this.victoryMeta = getRequiredEl('victory-meta');
    this.victoryLastReward = getRequiredEl('victory-last-reward');
    this.victoryHits = getRequiredEl('victory-hits');
    this.victoryTime = getRequiredEl('victory-time');
    this.victoryWallet = getRequiredEl('victory-wallet');

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

    getRequiredEl('btn-start').addEventListener('click', () => {
      this.callbacks.onStartGame();
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

  public setSelectedBike(bikeId: BikeId): void {
    this.bikeCards.forEach((btn) => {
      const active = btn.dataset.bike === bikeId;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', String(active));
    });
    this.showroomBikeName.textContent = BIKES[bikeId].name;
    this.showroomBikeDesc.textContent = BIKES[bikeId].tagline;
  }

  public setSelectedDifficulty(difficultyId: DifficultyId): void {
    this.diffCards.forEach((btn) => {
      const active = btn.dataset.difficulty === difficultyId;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', String(active));
    });
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

  public showPenaltyToast(obstacleType: ObstacleTypeId, penalty: number): void {
    const shortName = OBSTACLE_TOAST_NAME[obstacleType] ?? OBSTACLE_TYPES[obstacleType].label;

    // Limit queue to 2 simultaneous top-band toasts
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

    // Trigger floating wallet deduction delta & red edge vignette pulse
    this.walletDelta.textContent = `−${formatVND(penalty)}`;
    this.walletDelta.classList.remove('hidden');
    // Restart animation cleanly
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
  }

  private animateStageClearNumbers(
    baseReward: number,
    newWallet: number,
    perfectBonus: number,
    hits: number
  ): void {
    if (this.clearAnimRafId !== null) {
      window.cancelAnimationFrame(this.clearAnimRafId);
    }
    const prevWallet = Math.max(0, newWallet - baseReward - perfectBonus);
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

    if (screenChanged) {
      (Object.keys(this.screens) as GameScreen[]).forEach((key) => {
        const show =
          key === state.screen ||
          (key === 'playing' && state.screen === 'paused');
        this.screens[key].classList.toggle('hidden', !show);
      });

      const isPlayingOrPaused = state.screen === 'playing' || state.screen === 'paused';
      this.btnPause.classList.toggle('hidden', !isPlayingOrPaused);
      // Audio pill lives on Menu only; during gameplay audio controls live inside Pause Modal
      this.menuAudioPill.classList.toggle('hidden', isPlayingOrPaused);

      if (state.screen !== 'paused') {
        this.resetPauseConfirmations();
      }
      if (state.screen === 'playing') {
        this.lastNumericSyncTime = 0; // force immediate HUD refresh on enter
      }
    }

    if (state.screen === 'menu') {
      if (screenChanged) {
        this.hornHintHidden = false;
        this.hornHint.classList.remove('hidden');
        this.setSelectedBike(state.bikeId);
        this.setSelectedDifficulty(state.difficultyId);
        this.hidePenaltyToast();
      }
      return;
    }

    // Transient horn hint auto-hides after 5s on Stage 1 (or any subsequent stage)
    const shouldHideHorn = state.stageId > 1 || state.elapsedStageTime > 5;
    if (shouldHideHorn !== this.hornHintHidden) {
      this.hornHintHidden = shouldHideHorn;
      this.hornHint.classList.toggle('hidden', shouldHideHorn);
    }

    // Wallet & semantic hit badge
    if (state.wallet !== this.lastWallet || screenChanged) {
      this.lastWallet = state.wallet;
      this.walletValue.textContent = formatVND(state.wallet);
      this.walletValue.classList.toggle('low', state.wallet <= diff.startingWallet * 0.28);
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

    // Throttle rapidly updating distance/speed DOM mutations to ~14 Hz
    const now = performance.now();
    if (screenChanged || now - this.lastNumericSyncTime >= 68) {
      this.lastNumericSyncTime = now;

      const fullStageTitle = `${stage.name.replace(/^Bài\s+\d+:\s*/i, '')} · ${stage.laneCount} làn`;
      if (this.stageName.textContent !== fullStageTitle) {
        this.stageName.textContent = fullStageTitle;
      }
      this.stageBadge.textContent = `Bài ${stage.id}/${STAGES.length}`;
      this.fromLabel.textContent = stage.fromLabel;
      this.toLabel.textContent = stage.toLabel;

      const distStr = `${formatMeters(state.distance)} / ${formatMeters(stage.length)} m`;
      if (distStr !== this.lastDistanceText) {
        this.lastDistanceText = distStr;
        this.distanceText.textContent = distStr;
      }

      const pct = Math.max(0, Math.min(100, Math.round(state.progress * 1000) / 10));
      if (pct !== this.lastProgressPct) {
        this.lastProgressPct = pct;
        this.progressFill.style.width = `${pct.toFixed(1)}%`;
        this.progressMarker.style.left = `${(2 + pct * 0.96).toFixed(1)}%`;
      }

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
      this.pausedStageDesc.textContent = `Đang giao hàng tại Bài ${stage.id}/${STAGES.length} — ${stage.name.replace(/^Bài\s+\d+:\s*/i, '')}`;
    }

    if (screenChanged && state.screen === 'stage_clear') {
      const hits = state.hitsInStage;
      const base = state.lastStageReward || diff.stageReward;
      const bonus = state.lastPerfectBonus;
      const stars = hits === 0 ? 3 : hits <= 2 ? 2 : 1;

      this.clearStars.innerHTML = [1, 2, 3].map((n) => createStarSvg(n <= stars)).join('');
      this.clearRankBadge.className = `retro-stamp ${hits === 0 ? 'success' : 'warning'}`;
      this.clearRankBadge.textContent =
        hits === 0 ? 'GIAO SẠCH KHÔNG LỖI' : 'GIAO HÀNG ĐÚNG HẸN';
      this.clearTitle.textContent = `QUA BÀI ${stage.id}/${STAGES.length}!`;
      this.clearSubtitle.textContent = `Đã tới ${stage.toLabel}`;
      this.animateStageClearNumbers(base, state.wallet, bonus, hits);
    }

    if (screenChanged && state.screen === 'game_over') {
      const pct = Math.max(0, Math.min(100, Math.round(state.progress * 100)));
      const lastLabel = state.lastObstacleHit
        ? OBSTACLE_TYPES[state.lastObstacleHit].label
        : 'vật cản trên phố';
      this.gameoverStage.textContent = `Bài ${stage.id}/${STAGES.length} (${stage.shortName})`;
      this.gameoverProgress.textContent = `${pct}%`;
      this.gameoverHits.textContent = `${state.totalHits} lần (cú cuối: ${lastLabel})`;
    }

    if (screenChanged && state.screen === 'victory') {
      const totalStage3 = (state.lastStageReward || diff.stageReward) + state.lastPerfectBonus;
      this.victoryMeta.textContent = `${bike.name} · ${diff.label}`;
      this.victoryLastReward.textContent = `+${formatVND(totalStage3)}`;
      this.victoryHits.textContent = `${state.totalHits} lần`;
      this.victoryTime.textContent = formatDuration(state.totalRunTime);
      this.victoryWallet.textContent = formatVND(state.wallet);
    }
  }

  public dispose(): void {
    if (this.deltaTimerId !== null) window.clearTimeout(this.deltaTimerId);
    if (this.damageTimerId !== null) window.clearTimeout(this.damageTimerId);
    if (this.clearAnimRafId !== null) window.cancelAnimationFrame(this.clearAnimRafId);
    this.resetPauseConfirmations();
  }
}
