import type { BikeId } from '../config/gameConfig.ts';
import { formatVND } from '../core/economy.ts';
import {
  SHOP_CATALOG,
  createDefaultProfile,
  type PlayerProfile,
  type ShopBikeItem
} from '../core/profileStore.ts';

export interface ShopModalCallbacks {
  onSelectOwnedBike: (bikeId: BikeId) => void;
  onPurchaseBike?: (bikeId: BikeId, priceVnd: number) => boolean;
  onTestRideBike?: (bikeId: BikeId) => void;
  onClose: () => void;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDecimalComma(num: number): string {
  return num.toFixed(1).replace('.', ',');
}

export class ShopModal {
  private readonly backdrop: HTMLElement;
  private readonly walletEl: HTMLElement;
  private readonly deliveriesEl: HTMLElement;
  private readonly gridEl: HTMLElement;
  private readonly closeBtn: HTMLButtonElement;
  private readonly callbacks: ShopModalCallbacks;

  private profile: PlayerProfile = createDefaultProfile();
  private open = false;
  private readonly onKeyDownBound = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' && this.open) {
      e.preventDefault();
      e.stopPropagation();
      this.setOpen(false);
    }
  };

  constructor(callbacks: ShopModalCallbacks) {
    this.callbacks = callbacks;

    const backdrop = document.getElementById('screen-shop');
    const walletEl = document.getElementById('shop-wallet-value');
    const deliveriesEl = document.getElementById('shop-deliveries-value');
    const gridEl = document.getElementById('shop-bike-grid');
    const closeBtn = document.getElementById('btn-close-shop');

    if (
      !backdrop ||
      !walletEl ||
      !deliveriesEl ||
      !gridEl ||
      !(closeBtn instanceof HTMLButtonElement)
    ) {
      throw new Error('Missing required Bike Shop DOM elements');
    }

    this.backdrop = backdrop;
    this.walletEl = walletEl;
    this.deliveriesEl = deliveriesEl;
    this.gridEl = gridEl;
    this.closeBtn = closeBtn;

    this.bindEvents();
    this.render();
  }

  private bindEvents(): void {
    this.closeBtn.addEventListener('click', () => {
      this.setOpen(false);
    });

    this.backdrop.addEventListener('click', (e) => {
      if (e.target === this.backdrop) {
        this.setOpen(false);
      }
    });

    window.addEventListener('keydown', this.onKeyDownBound);

    this.gridEl.addEventListener('click', (e) => {
      const target = e.target as HTMLElement | null;

      const selectBtn = target?.closest<HTMLButtonElement>('[data-shop-select-bike]');
      if (selectBtn && !selectBtn.disabled) {
        const bikeId = selectBtn.dataset.shopSelectBike as BikeId | undefined;
        if (!bikeId) return;
        this.profile = { ...this.profile, selectedBikeId: bikeId };
        this.callbacks.onSelectOwnedBike(bikeId);
        this.render();
        return;
      }

      const buyBtn = target?.closest<HTMLButtonElement>('[data-shop-buy-bike]');
      if (buyBtn && !buyBtn.disabled) {
        const bikeId = buyBtn.dataset.shopBuyBike as BikeId | undefined;
        const priceVnd = Number(buyBtn.dataset.shopPrice ?? 0);
        if (!bikeId) return;
        const purchased = this.callbacks.onPurchaseBike?.(bikeId, priceVnd) ?? false;
        if (purchased) {
          this.render();
        }
        return;
      }

      const testBtn = target?.closest<HTMLButtonElement>('[data-shop-test-bike]');
      if (testBtn && !testBtn.disabled) {
        const bikeId = testBtn.dataset.shopTestBike as BikeId | undefined;
        if (!bikeId) return;
        this.callbacks.onTestRideBike?.(bikeId);
        this.setOpen(false);
      }
    });
  }

  public isOpen(): boolean {
    return this.open;
  }

  public setOpen(open: boolean): void {
    if (this.open === open) return;
    this.open = open;
    this.backdrop.classList.toggle('hidden', !open);
    if (open) {
      this.render();
      this.closeBtn.focus();
    } else {
      this.callbacks.onClose();
    }
  }

  public setProfile(profile: PlayerProfile): void {
    this.profile = profile;
    this.render();
  }

  private renderCard(item: ShopBikeItem): string {
    const isOwned =
      item.status === 'owned' ||
      this.profile.ownedBikes.includes(item.id as BikeId);
    const isAvailable = !isOwned && item.status === 'available';
    const isSelected = this.profile.selectedBikeId === item.id;

    const engineLabel =
      item.id === 'suzuki_gsxs'
        ? 'Naked Sport · 4 Kỳ'
        : item.engineType === 'two_stroke'
          ? '2 Thì · 120cc'
          : item.engineType === 'electric'
            ? 'Xe điện'
            : 'Xe xăng';
    const engineBadgeClass =
      item.id === 'suzuki_gsxs'
        ? 'gas'
        : item.engineType === 'two_stroke'
          ? 'two-stroke'
          : item.engineType === 'electric'
            ? 'teal'
            : 'gas';

    const speedPct = Math.min(100, Math.round((item.stats.topSpeedKmh / 110) * 100));
    const accelPct = Math.min(100, Math.round(item.stats.accel10 * 10));
    const handPct = Math.min(100, Math.round(item.stats.handling10 * 10));

    const statusBadge = isSelected && isOwned
      ? '<span class="shop-status-chip selected">Đang chọn</span>'
      : isOwned
        ? '<span class="shop-status-chip owned">Đã sở hữu</span>'
        : isAvailable
          ? '<span class="shop-status-chip available">Mở bán</span>'
          : '<span class="shop-status-chip soon">Sắp mở bán</span>';

    const priceLine = isOwned
      ? '<span class="shop-price owned">Đã sở hữu · Sẵn sàng</span>'
      : `<span class="shop-price">${formatVND(item.priceVnd)}</span>`;

    let actionHtml = '';
    if (isOwned) {
      actionHtml = `<button
          type="button"
          class="retro-btn shop-card-btn${isSelected ? ' selected' : ''}"
          data-shop-select-bike="${escapeHtml(item.id)}"
          ${isSelected ? 'disabled' : ''}
        >${isSelected ? 'ĐANG SỬ DỤNG' : 'CHỌN XE NÀY'}</button>`;
    } else if (isAvailable) {
      const canAfford = this.profile.careerWallet >= item.priceVnd;
      const missing = Math.max(0, item.priceVnd - this.profile.careerWallet);
      const noteText = canAfford
        ? 'Sẵn sàng mua!'
        : `Thiếu ${formatVND(missing)} — hoàn thành thêm chuyến để mở khóa`;
      actionHtml = `
        <div class="shop-ready-note${canAfford ? ' ready' : ''}">${escapeHtml(noteText)}</div>
        <div class="shop-card-actions">
          <button
            type="button"
            class="retro-cta shop-card-btn"
            data-shop-buy-bike="${escapeHtml(item.id)}"
            data-shop-price="${item.priceVnd}"
            ${canAfford ? '' : 'disabled'}
          >MUA XE · ${formatVND(item.priceVnd)}</button>
          <button
            type="button"
            class="retro-btn shop-card-btn shop-test-btn"
            data-shop-test-bike="${escapeHtml(item.id)}"
          >CHẠY THỬ NGAY</button>
        </div>
      `;
    } else {
      actionHtml = `<div class="shop-coming-notice">${escapeHtml(item.statusMessage)}</div>
         <button type="button" class="retro-btn ghost shop-card-btn" disabled>
           Xe chưa về
         </button>`;
    }

    return `
      <article class="shop-card${isSelected ? ' active' : ''}${!isOwned && !isAvailable ? ' coming-soon' : ''}" data-shop-bike="${escapeHtml(item.id)}">
        <div class="shop-card-head">
          <div class="shop-card-badges">
            <span class="bike-badge ${engineBadgeClass}">${engineLabel}</span>
            ${statusBadge}
          </div>
          <h3 class="shop-bike-name">${escapeHtml(item.name)}</h3>
          ${priceLine}
        </div>
        <p class="shop-bike-tagline">${escapeHtml(item.tagline)}</p>
        <div class="stat-rows">
          <div class="stat-row">
            <span class="stat-label">Tốc độ</span>
            <div class="stat-track"><div class="stat-fill" style="width:${speedPct}%"></div></div>
            <span class="stat-num">${item.stats.topSpeedKmh} km/h</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Gia tốc</span>
            <div class="stat-track"><div class="stat-fill" style="width:${accelPct}%"></div></div>
            <span class="stat-num">${formatDecimalComma(item.stats.accel10)}/10</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Linh hoạt</span>
            <div class="stat-track"><div class="stat-fill" style="width:${handPct}%"></div></div>
            <span class="stat-num">${formatDecimalComma(item.stats.handling10)}/10</span>
          </div>
        </div>
        <div class="shop-card-footer">
          ${actionHtml}
        </div>
      </article>
    `;
  }

  public render(): void {
    this.walletEl.textContent = formatVND(this.profile.careerWallet);
    this.deliveriesEl.textContent = `${this.profile.totalDeliveries} chuyến`;
    this.gridEl.innerHTML = SHOP_CATALOG.map((item) => this.renderCard(item)).join('');
  }

  public dispose(): void {
    window.removeEventListener('keydown', this.onKeyDownBound);
  }
}
