export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;
export const ROAD_WIDTH = 13.5;
export const LANES = [-4.2, -1.4, 1.4, 4.2] as const;

export const INVULNERABILITY_SECONDS = 1.2;
export const PLAYER_HALF_W = 0.48;
export const PLAYER_HALF_L = 1.05;
export const TAXI_MODEL_PATH = '/assets/models/vf_e34_taxi.glb';
export const BUS_MODEL_PATH = '/assets/models/xe_buyt.glb';
export const TRUCK_MODEL_PATH = '/assets/models/xe_tai_canter.glb';
export const DRACO_DECODER_PATH = '/assets/draco/';

export type BikeId = 'honda' | 'vinfast';
export type DifficultyId = 'easy' | 'medium' | 'hard';
export type ObstacleTypeId =
  | 'motorbike'
  | 'flower_bike'
  | 'vendor'
  | 'car'
  | 'taxi'
  | 'bus'
  | 'truck';
export type StageTheme = 'old_quarter' | 'tree_boulevard' | 'overpass_avenue';

export interface BikeSpec {
  id: BikeId;
  name: string;
  shortName: string;
  modelPath: string;
  maxSpeed: number;
  minCruiseSpeed: number;
  accel: number;
  brakeDecel: number;
  handling: number;
  leanMax: number;
  displayMaxKmh: number;
  tagline: string;
}

export const BIKES: Record<BikeId, BikeSpec> = {
  honda: {
    id: 'honda',
    name: 'Xe Côn Cổ Điển',
    shortName: 'Xe Cổ',
    modelPath: '/assets/models/honda.glb',
    maxSpeed: 64,
    minCruiseSpeed: 18,
    accel: 34,
    brakeDecel: 46,
    handling: 14.5,
    leanMax: 0.36,
    displayMaxKmh: 72,
    tagline: 'Luồn lách phố cổ linh hoạt, vào cua gọn gàng'
  },
  vinfast: {
    id: 'vinfast',
    name: 'Xe Máy Điện Evo',
    shortName: 'Xe Điện',
    modelPath: '/assets/models/vinfast.glb',
    maxSpeed: 68,
    minCruiseSpeed: 18,
    accel: 40,
    brakeDecel: 44,
    handling: 13.2,
    leanMax: 0.32,
    displayMaxKmh: 78,
    tagline: 'Bứt tốc êm ái, tốc độ tối đa vượt trội'
  }
};

export interface DifficultySpec {
  id: DifficultyId;
  label: string;
  shortLabel: string;
  startingWallet: number;
  stageReward: number;
  perfectBonus: number;
  spawnInterval: number;
  maxActiveObstacles: number;
  trafficSpeedScale: number;
  penaltyMultiplier: number;
  description: string;
}

export const DIFFICULTIES: Record<DifficultyId, DifficultySpec> = {
  easy: {
    id: 'easy',
    label: 'Sáng Sớm',
    shortLabel: 'Sáng Sớm',
    startingWallet: 500_000,
    stageReward: 120_000,
    perfectBonus: 50_000,
    spawnInterval: 1.45,
    maxActiveObstacles: 10,
    trafficSpeedScale: 0.78,
    penaltyMultiplier: 0.75,
    description: 'Đường thoáng · Phạt nhẹ'
  },
  medium: {
    id: 'medium',
    label: 'Tan Tầm',
    shortLabel: 'Tan Tầm',
    startingWallet: 350_000,
    stageReward: 150_000,
    perfectBonus: 70_000,
    spawnInterval: 1.05,
    maxActiveObstacles: 15,
    trafficSpeedScale: 1.0,
    penaltyMultiplier: 1.0,
    description: 'Cân bằng · Phạt vừa'
  },
  hard: {
    id: 'hard',
    label: 'Cao Điểm',
    shortLabel: 'Cao Điểm',
    startingWallet: 250_000,
    stageReward: 200_000,
    perfectBonus: 100_000,
    spawnInterval: 0.72,
    maxActiveObstacles: 22,
    trafficSpeedScale: 1.24,
    penaltyMultiplier: 1.3,
    description: 'Đông đúc · Phạt nặng'
  }
};

export interface ObstacleTypeSpec {
  id: ObstacleTypeId;
  label: string;
  penalty: number;
  halfW: number;
  halfL: number;
  baseSpeed: number;
  crossSpeed: number;
}

export const OBSTACLE_TYPES: Record<ObstacleTypeId, ObstacleTypeSpec> = {
  motorbike: {
    id: 'motorbike',
    label: 'Xe máy đi đường',
    penalty: 40_000,
    halfW: 0.55,
    halfL: 1.15,
    baseSpeed: 22,
    crossSpeed: 0
  },
  flower_bike: {
    id: 'flower_bike',
    label: 'Xe đạp chở hoa',
    penalty: 35_000,
    halfW: 0.65,
    halfL: 1.05,
    baseSpeed: 10,
    crossSpeed: 0
  },
  vendor: {
    id: 'vendor',
    label: 'Gánh hàng rong',
    penalty: 50_000,
    halfW: 0.85,
    halfL: 0.75,
    baseSpeed: 0,
    crossSpeed: 1.65
  },
  car: {
    id: 'car',
    label: 'Ô tô / Taxi Hà Nội',
    penalty: 75_000,
    halfW: 1.05,
    halfL: 2.25,
    baseSpeed: 26,
    crossSpeed: 0
  },
  taxi: {
    id: 'taxi',
    label: 'Taxi điện Xanh SM (VF e34)',
    penalty: 80_000,
    halfW: 0.86,
    halfL: 1.78,
    baseSpeed: 27,
    crossSpeed: 0
  },
  bus: {
    id: 'bus',
    label: 'Xe buýt 45 chỗ VinBus',
    penalty: 100_000,
    halfW: 1.34,
    halfL: 5.95,
    baseSpeed: 20,
    crossSpeed: 0
  },
  truck: {
    id: 'truck',
    label: 'Xe tải 1,9 tấn Canter',
    penalty: 95_000,
    halfW: 1.1,
    halfL: 3.3,
    baseSpeed: 21,
    crossSpeed: 0
  }
};

export interface StageSpec {
  id: 1 | 2 | 3;
  name: string;
  shortName: string;
  fromLabel: string;
  toLabel: string;
  length: number;
  theme: StageTheme;
  roadWidth: number;
  laneCount: 2 | 4 | 6;
  lanes: readonly number[];
  defaultPlayerLane: number;
  roadClassLabel: string;
  trafficDensityScale: number;
  taxiCountPerStage: 2 | 3;
  allowedObstacles: ObstacleTypeId[];
  obstacleWeights: Partial<Record<ObstacleTypeId, number>>;
  ambientHint: string;
}

export const STAGES: StageSpec[] = [
  {
    id: 1,
    name: 'Bài 1: Phố Cổ & Ô Quan Chưởng',
    shortName: 'Phố Cổ',
    fromLabel: 'Quán Café Phố Cổ (A)',
    toLabel: 'Tháp Đồng Hồ Bờ Hồ (B)',
    length: 1450,
    theme: 'old_quarter',
    roadWidth: 7.4,
    laneCount: 2,
    lanes: [-1.8, 1.8],
    defaultPlayerLane: 1.8,
    roadClassLabel: 'Đường hẹp Phố Cổ · 2 làn',
    trafficDensityScale: 0.72,
    taxiCountPerStage: 2,
    allowedObstacles: ['motorbike', 'flower_bike', 'vendor', 'car', 'taxi'],
    obstacleWeights: {
      motorbike: 52,
      flower_bike: 24,
      vendor: 14,
      car: 10
    },
    ambientHint: 'Đường hẹp 2 làn phố cổ, dãy nhà tường vàng san sát & cổng Ô Quan Chưởng'
  },
  {
    id: 2,
    name: 'Bài 2: Phố Cây Xanh & Nhà Hát Lớn',
    shortName: 'Nhà Hát Lớn',
    fromLabel: 'Hàng Khay · Bờ Hồ (A)',
    toLabel: 'Quảng Trường Nhà Hát Lớn (B)',
    length: 1700,
    theme: 'tree_boulevard',
    roadWidth: 13.5,
    laneCount: 4,
    lanes: [-4.2, -1.4, 1.4, 4.2],
    defaultPlayerLane: 1.4,
    roadClassLabel: 'Phố Trung Tâm · 4 làn',
    trafficDensityScale: 1.0,
    taxiCountPerStage: 3,
    allowedObstacles: ['motorbike', 'flower_bike', 'vendor', 'car', 'taxi', 'bus'],
    obstacleWeights: {
      motorbike: 38,
      flower_bike: 14,
      vendor: 10,
      car: 24,
      bus: 14
    },
    ambientHint: 'Vòm cây cổ thụ nắng xiên vàng, cờ đỏ & xe buýt tuyến 14 trên phố 4 làn'
  },
  {
    id: 3,
    name: 'Bài 3: Khu Đô Thị Mới & Cầu Vượt',
    shortName: 'Cầu Vượt',
    fromLabel: 'Đại Lộ Khu Đô Thị Mới (A)',
    toLabel: 'Trung Tâm Thủ Đô (B)',
    length: 1950,
    theme: 'overpass_avenue',
    roadWidth: 20.4,
    laneCount: 6,
    lanes: [-8.0, -4.8, -1.6, 1.6, 4.8, 8.0],
    defaultPlayerLane: 4.8,
    roadClassLabel: 'Khu Đô Thị Mới · 6 làn',
    trafficDensityScale: 1.55,
    taxiCountPerStage: 3,
    allowedObstacles: ['car', 'taxi', 'bus', 'truck', 'motorbike'],
    obstacleWeights: {
      car: 34,
      truck: 26,
      bus: 22,
      motorbike: 18
    },
    ambientHint: 'Đại lộ khu đô thị mới 6 làn rộng thoáng, cầu vượt lớn đông ô tô, xe buýt & xe tải'
  }
];

export function getStageSpec(stageId: 1 | 2 | 3): StageSpec {
  return STAGES.find((s) => s.id === stageId) ?? STAGES[0];
}
