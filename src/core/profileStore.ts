import { BIKES, type BikeId } from '../config/gameConfig.ts';

export const PROFILE_STORAGE_KEY = 'hanoi_shipper_profile_v2';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface ShopBikeItem {
  id: string;
  name: string;
  engineType: 'gasoline' | 'electric' | 'two_stroke';
  priceVnd: number;
  status: 'owned' | 'available' | 'coming_soon';
  statusMessage: string;
  tagline: string;
  stats: {
    topSpeedKmh: number;
    accel10: number;
    handling10: number;
  };
}

export interface PlayerProfile {
  version: 2;
  careerWallet: number;
  totalDeliveries: number;
  totalDistanceMeters: number;
  ownedBikes: BikeId[];
  selectedBikeId: BikeId;
}

export const COMING_SOON_MESSAGE =
  'Xe chưa về kho — Vui lòng quay lại ở bản cập nhật sau';

const DEFAULT_OWNED_BIKES: BikeId[] = ['honda', 'vinfast'];

function toScore10(value: number, scaleMax: number): number {
  return Math.min(10, Math.round((value / scaleMax) * 100) / 10);
}

export const SHOP_CATALOG: readonly ShopBikeItem[] = [
  {
    id: 'honda',
    name: BIKES.honda.name,
    engineType: 'gasoline',
    priceVnd: 0,
    status: 'owned',
    statusMessage: 'Đã sở hữu · Xe mặc định',
    tagline: BIKES.honda.tagline,
    stats: {
      topSpeedKmh: BIKES.honda.displayMaxKmh,
      accel10: toScore10(BIKES.honda.accel, 45),
      handling10: toScore10(BIKES.honda.handling, 16)
    }
  },
  {
    id: 'vinfast',
    name: BIKES.vinfast.name,
    engineType: 'electric',
    priceVnd: 0,
    status: 'owned',
    statusMessage: 'Đã sở hữu · Xe mặc định',
    tagline: BIKES.vinfast.tagline,
    stats: {
      topSpeedKmh: BIKES.vinfast.displayMaxKmh,
      accel10: toScore10(BIKES.vinfast.accel, 45),
      handling10: toScore10(BIKES.vinfast.handling, 16)
    }
  },
  {
    id: 'suzuki_rgv',
    name: BIKES.suzuki_rgv.name,
    engineType: 'two_stroke',
    priceVnd: 500_000,
    status: 'available',
    statusMessage: 'Động cơ 2 thì 120cc · Có thể mua hoặc chạy thử ngay',
    tagline: BIKES.suzuki_rgv.tagline,
    stats: {
      topSpeedKmh: BIKES.suzuki_rgv.displayMaxKmh,
      accel10: toScore10(BIKES.suzuki_rgv.accel, 45),
      handling10: toScore10(BIKES.suzuki_rgv.handling, 16)
    }
  },
  {
    id: 'suzuki_gsxs',
    name: BIKES.suzuki_gsxs.name,
    engineType: 'gasoline',
    priceVnd: 950_000,
    status: 'available',
    statusMessage: 'Naked Sport 4 kỳ · Có thể mua hoặc chạy thử ngay',
    tagline: BIKES.suzuki_gsxs.tagline,
    stats: {
      topSpeedKmh: BIKES.suzuki_gsxs.displayMaxKmh,
      accel10: toScore10(BIKES.suzuki_gsxs.accel, 45),
      handling10: toScore10(BIKES.suzuki_gsxs.handling, 16)
    }
  },
  {
    id: 'classic_scooter_150',
    name: 'Xe Tay Ga Cổ Điển 150cc',
    engineType: 'gasoline',
    priceVnd: 1_200_000,
    status: 'coming_soon',
    statusMessage: COMING_SOON_MESSAGE,
    tagline: 'Dáng cổ điển thanh lịch, đầm chắc khi chở đơn đường dài',
    stats: {
      topSpeedKmh: 82,
      accel10: 8.4,
      handling10: 8.8
    }
  },
  {
    id: 'vinfast_evo_sport',
    name: 'Xe Điện Thể Thao Evo S',
    engineType: 'electric',
    priceVnd: 1_850_000,
    status: 'coming_soon',
    statusMessage: COMING_SOON_MESSAGE,
    tagline: 'Mô-men xoắn tức thì, tăng tốc êm và tái tạo phanh mượt',
    stats: {
      topSpeedKmh: 90,
      accel10: 9.5,
      handling10: 8.6
    }
  },
  {
    id: 'touring_400',
    name: 'PKL Touring Phố Cổ 400cc',
    engineType: 'gasoline',
    priceVnd: 2_900_000,
    status: 'coming_soon',
    statusMessage: COMING_SOON_MESSAGE,
    tagline: 'Động cơ đôi uy lực chuyên trị đại lộ 6 làn 10 km',
    stats: {
      topSpeedKmh: 105,
      accel10: 9.2,
      handling10: 7.4
    }
  }
];

function resolveStorage(storage?: StorageLike | null): StorageLike | null {
  if (storage !== undefined) {
    return storage;
  }
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
  } catch {
    return null;
  }
  return null;
}

function isBikeId(value: unknown): value is BikeId {
  return typeof value === 'string' && value in BIKES;
}

function clampNonNegativeInt(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.round(value));
}

function sanitizeProfile(raw: unknown): PlayerProfile | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const obj = raw as Record<string, unknown>;
  if (obj.version !== undefined && obj.version !== 2) {
    return null;
  }

  const ownedSet = new Set<BikeId>(DEFAULT_OWNED_BIKES);
  if (Array.isArray(obj.ownedBikes)) {
    for (const item of obj.ownedBikes) {
      if (isBikeId(item)) {
        ownedSet.add(item);
      }
    }
  }

  const selectedBikeId: BikeId =
    isBikeId(obj.selectedBikeId) && ownedSet.has(obj.selectedBikeId)
      ? obj.selectedBikeId
      : 'honda';

  return {
    version: 2,
    careerWallet: clampNonNegativeInt(obj.careerWallet),
    totalDeliveries: clampNonNegativeInt(obj.totalDeliveries),
    totalDistanceMeters: clampNonNegativeInt(obj.totalDistanceMeters),
    ownedBikes: Array.from(ownedSet),
    selectedBikeId
  };
}

export function createDefaultProfile(): PlayerProfile {
  return {
    version: 2,
    careerWallet: 0,
    totalDeliveries: 0,
    totalDistanceMeters: 0,
    ownedBikes: [...DEFAULT_OWNED_BIKES],
    selectedBikeId: 'honda'
  };
}

export function loadProfile(storage?: StorageLike | null): PlayerProfile {
  const target = resolveStorage(storage);
  if (!target) {
    return createDefaultProfile();
  }

  try {
    const raw = target.getItem(PROFILE_STORAGE_KEY);
    if (!raw) {
      return createDefaultProfile();
    }
    const parsed: unknown = JSON.parse(raw);
    return sanitizeProfile(parsed) ?? createDefaultProfile();
  } catch {
    return createDefaultProfile();
  }
}

export function saveProfile(
  profile: PlayerProfile,
  storage?: StorageLike | null
): boolean {
  const target = resolveStorage(storage);
  if (!target) {
    return false;
  }

  const normalized = sanitizeProfile(profile) ?? createDefaultProfile();
  try {
    target.setItem(PROFILE_STORAGE_KEY, JSON.stringify(normalized));
    return true;
  } catch {
    return false;
  }
}

export function creditCareerEarnings(
  profile: PlayerProfile,
  earnedVnd: number,
  distanceMeters: number,
  storage?: StorageLike | null
): PlayerProfile {
  const safeEarned = clampNonNegativeInt(earnedVnd);
  const safeDistance = clampNonNegativeInt(distanceMeters);

  const nextProfile: PlayerProfile = {
    version: 2,
    careerWallet: clampNonNegativeInt(profile.careerWallet) + safeEarned,
    totalDeliveries: clampNonNegativeInt(profile.totalDeliveries) + 1,
    totalDistanceMeters: clampNonNegativeInt(profile.totalDistanceMeters) + safeDistance,
    ownedBikes: Array.from(new Set([...DEFAULT_OWNED_BIKES, ...profile.ownedBikes.filter(isBikeId)])),
    selectedBikeId: isBikeId(profile.selectedBikeId) ? profile.selectedBikeId : 'honda'
  };

  saveProfile(nextProfile, storage);
  return nextProfile;
}

export function purchaseBike(
  profile: PlayerProfile,
  bikeId: BikeId,
  priceVnd: number,
  storage?: StorageLike | null
): {
  purchased: boolean;
  reason?: 'already_owned' | 'insufficient_funds';
  profile: PlayerProfile;
} {
  const safePrice =
    typeof priceVnd === 'number' && Number.isFinite(priceVnd) && priceVnd >= 0
      ? Math.round(priceVnd)
      : 0;
  const currentWallet = clampNonNegativeInt(profile.careerWallet);
  const ownedBikes = Array.from(
    new Set([...DEFAULT_OWNED_BIKES, ...profile.ownedBikes.filter(isBikeId)])
  );

  if (ownedBikes.includes(bikeId)) {
    return {
      purchased: false,
      reason: 'already_owned',
      profile
    };
  }

  if (currentWallet < safePrice) {
    return {
      purchased: false,
      reason: 'insufficient_funds',
      profile
    };
  }

  const nextProfile: PlayerProfile = {
    version: 2,
    careerWallet: currentWallet - safePrice,
    totalDeliveries: clampNonNegativeInt(profile.totalDeliveries),
    totalDistanceMeters: clampNonNegativeInt(profile.totalDistanceMeters),
    ownedBikes: [...ownedBikes, bikeId],
    selectedBikeId: bikeId
  };

  saveProfile(nextProfile, storage);
  return {
    purchased: true,
    profile: nextProfile
  };
}
