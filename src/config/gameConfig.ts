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
export const CAR_MODEL_PATHS: readonly string[] = [
  '/assets/traffic/cars/coupe_red.glb'
];
export const EXTRA_CAR_MODEL_PATHS: readonly string[] = [
  '/assets/traffic/cars/hatch_yellow.glb',
  '/assets/traffic/cars/suv_blue.glb',
  '/assets/traffic/cars/coupe_black.glb',
  '/assets/traffic/cars/coupe_grey.glb',
  '/assets/traffic/cars/coupe_white.glb',
  '/assets/traffic/cars/hatch_black.glb',
  '/assets/traffic/cars/hatch_white.glb',
  '/assets/traffic/cars/suv_black.glb',
  '/assets/traffic/cars/suv_white.glb'
];
export const BUS_MODEL_PATHS: readonly string[] = [
  BUS_MODEL_PATH
];
export const EXTRA_BUS_MODEL_PATHS: readonly string[] = [
  '/assets/traffic/buses/ecoline_blue.glb',
  '/assets/traffic/buses/ecoline_green.glb',
  '/assets/traffic/buses/ecoline_red.glb',
  '/assets/traffic/buses/ecoline_white.glb',
  '/assets/traffic/buses/irizar_i6.glb'
];
export const TRUCK_MODEL_PATHS: readonly string[] = [
  TRUCK_MODEL_PATH
];
export const EXTRA_TRUCK_MODEL_PATHS: readonly string[] = [
  '/assets/traffic/trucks/pickup_blue.glb',
  '/assets/traffic/trucks/van_white.glb',
  '/assets/traffic/trucks/pickup_strada_white.glb',
  '/assets/traffic/trucks/pickup_grey.glb',
  '/assets/traffic/trucks/pickup_red.glb',
  '/assets/traffic/trucks/pickup_white.glb',
  '/assets/traffic/trucks/pickup_strada_black.glb',
  '/assets/traffic/trucks/pickup_strada_red.glb',
  '/assets/traffic/trucks/pickup_strada_silver.glb',
  '/assets/traffic/trucks/van_beige.glb',
  '/assets/traffic/trucks/van_blue.glb',
  '/assets/traffic/trucks/van_silver.glb',
  '/assets/traffic/trucks/van_teal.glb'
];
export const HEAVY_TRUCK_MODEL_PATHS: readonly string[] = [
  '/assets/traffic/trucks/dump_truck.glb'
];
export const EXTRA_HEAVY_TRUCK_MODEL_PATHS: readonly string[] = [
  '/assets/traffic/trucks/semi_container45_blue.glb',
  '/assets/traffic/trucks/semi_tractor.glb',
  '/assets/traffic/trucks/semi_container45_green.glb',
  '/assets/traffic/trucks/semi_container45_grey.glb',
  '/assets/traffic/trucks/semi_container45_red.glb'
];
export const DRACO_DECODER_PATH = '/assets/draco/';

export type BikeId = 'honda' | 'vinfast' | 'suzuki_rgv' | 'suzuki_gsxs';
export type DifficultyId = 'easy' | 'medium' | 'hard';
export type StageId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export type RoadClass = 6 | 4 | 2;
export type ObstacleTypeId =
  | 'motorbike'
  | 'reckless_moto'
  | 'flower_bike'
  | 'vendor'
  | 'tourist'
  | 'office_worker'
  | 'car'
  | 'taxi'
  | 'bus'
  | 'truck'
  | 'heavy_truck';
export type StageTheme = 'old_quarter' | 'tree_boulevard' | 'overpass_avenue';
export type DestinationKey =
  | 'my_dinh'
  | 'quan_su'
  | 'vinuni'
  | 'nha_hat_lon'
  | 'lang_bac'
  | 'cot_co'
  | 'nha_tho_lon'
  | 'ho_hoan_kiem'
  | 'ga_ha_noi';

export interface BikeSpec {
  id: BikeId;
  name: string;
  shortName: string;
  modelPath: string;
  engineProfile: 'gasoline' | 'electric' | 'two_stroke';
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
    engineProfile: 'gasoline',
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
    engineProfile: 'electric',
    maxSpeed: 68,
    minCruiseSpeed: 18,
    accel: 40,
    brakeDecel: 44,
    handling: 13.2,
    leanMax: 0.32,
    displayMaxKmh: 78,
    tagline: 'Bứt tốc êm ái, tốc độ tối đa vượt trội'
  },
  suzuki_rgv: {
    id: 'suzuki_rgv',
    name: 'Suzuki RGV 120 (Xì Po)',
    shortName: 'RGV 120',
    modelPath: '/assets/models/suzuki_rgv.glb',
    engineProfile: 'two_stroke',
    maxSpeed: 74,
    minCruiseSpeed: 19,
    accel: 44,
    brakeDecel: 48,
    handling: 15.2,
    leanMax: 0.38,
    displayMaxKmh: 92,
    tagline: 'Huyền thoại 2 thì Xì Po 120cc — tiếng máy giòn rít, bứt tốc cực gắt'
  },
  suzuki_gsxs: {
    id: 'suzuki_gsxs',
    name: 'Suzuki GSX-S (Naked Sport)',
    shortName: 'GSX-S',
    modelPath: '/assets/models/suzuki_gsxs.glb',
    engineProfile: 'gasoline',
    maxSpeed: 78,
    minCruiseSpeed: 20,
    accel: 46,
    brakeDecel: 52,
    handling: 15.6,
    leanMax: 0.42,
    displayMaxKmh: 108,
    tagline: 'Naked Sport phân khối lớn — thiết kế góc cạnh hầm hố, tăng tốc & ôm cua cực sắc'
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
  allowedRoadClasses: readonly RoadClass[];
  isPedestrian?: boolean;
  minLevelInChapter?: 1 | 2 | 3;
}

export const OBSTACLE_TYPES: Record<ObstacleTypeId, ObstacleTypeSpec> = {
  motorbike: {
    id: 'motorbike',
    label: 'Xe máy đi đường',
    penalty: 40_000,
    halfW: 0.55,
    halfL: 1.15,
    baseSpeed: 22,
    crossSpeed: 0,
    allowedRoadClasses: [6, 4, 2]
  },
  reckless_moto: {
    id: 'reckless_moto',
    label: 'Xe máy phóng nhanh vượt ẩu',
    penalty: 55_000,
    halfW: 0.55,
    halfL: 1.18,
    baseSpeed: 33,
    crossSpeed: 0,
    allowedRoadClasses: [6, 4, 2],
    minLevelInChapter: 3
  },
  flower_bike: {
    id: 'flower_bike',
    label: 'Xe đạp chở hoa',
    penalty: 35_000,
    halfW: 0.65,
    halfL: 1.05,
    baseSpeed: 10,
    crossSpeed: 0,
    allowedRoadClasses: [4, 2]
  },
  vendor: {
    id: 'vendor',
    label: 'Gánh hàng rong',
    penalty: 50_000,
    halfW: 0.85,
    halfL: 0.75,
    baseSpeed: 0,
    crossSpeed: 1.65,
    allowedRoadClasses: [4, 2],
    isPedestrian: true
  },
  tourist: {
    id: 'tourist',
    label: 'Khách du lịch',
    penalty: 55_000,
    halfW: 0.58,
    halfL: 0.55,
    baseSpeed: 0,
    crossSpeed: 1.55,
    allowedRoadClasses: [4, 2],
    isPedestrian: true
  },
  office_worker: {
    id: 'office_worker',
    label: 'Dân công sở',
    penalty: 55_000,
    halfW: 0.52,
    halfL: 0.52,
    baseSpeed: 0,
    crossSpeed: 1.9,
    allowedRoadClasses: [4, 2],
    isPedestrian: true
  },
  car: {
    id: 'car',
    label: 'Ô tô / Taxi Hà Nội',
    penalty: 75_000,
    halfW: 1.05,
    halfL: 2.25,
    baseSpeed: 26,
    crossSpeed: 0,
    allowedRoadClasses: [6, 4, 2]
  },
  taxi: {
    id: 'taxi',
    label: 'Taxi điện Xanh SM (VF e34)',
    penalty: 80_000,
    halfW: 0.86,
    halfL: 1.78,
    baseSpeed: 27,
    crossSpeed: 0,
    allowedRoadClasses: [6, 4, 2]
  },
  bus: {
    id: 'bus',
    label: 'Xe buýt 45 chỗ VinBus',
    penalty: 100_000,
    halfW: 1.34,
    halfL: 5.95,
    baseSpeed: 20,
    crossSpeed: 0,
    allowedRoadClasses: [6, 4]
  },
  truck: {
    id: 'truck',
    label: 'Xe tải 1,9 tấn Canter',
    penalty: 95_000,
    halfW: 1.1,
    halfL: 3.3,
    baseSpeed: 21,
    crossSpeed: 0,
    allowedRoadClasses: [6, 4]
  },
  heavy_truck: {
    id: 'heavy_truck',
    label: 'Xe tải hạng nặng',
    penalty: 120_000,
    halfW: 1.26,
    halfL: 4.5,
    baseSpeed: 18,
    crossSpeed: 0,
    allowedRoadClasses: [6]
  }
};

export interface StageSpec {
  id: StageId;
  chapter: 1 | 2 | 3;
  levelInChapter: 1 | 2 | 3;
  codeLabel: string;
  name: string;
  shortName: string;
  fromLabel: string;
  toLabel: string;
  length: number;
  theme: StageTheme;
  roadWidth: number;
  laneCount: RoadClass;
  lanes: readonly number[];
  defaultPlayerLane: number;
  roadClassLabel: string;
  trafficDensityScale: number;
  taxiCountPerStage: 2 | 3;
  speedLimitKmh: number;
  hasIntersections: boolean;
  hasRecklessMoto: boolean;
  destinationKey: DestinationKey;
  rewardScale: number;
  allowedObstacles: ObstacleTypeId[];
  obstacleWeights: Partial<Record<ObstacleTypeId, number>>;
  ambientHint: string;
}

const LANES_6 = [-8.0, -4.8, -1.6, 1.6, 4.8, 8.0] as const;
const LANES_4 = [-4.2, -1.4, 1.4, 4.2] as const;
const LANES_2 = [-1.8, 1.8] as const;

export const STAGES: StageSpec[] = [
  {
    id: 1,
    chapter: 1,
    levelInChapter: 1,
    codeLabel: '1-1',
    name: 'Bài 1-1: Đại lộ Lê Quang Đạo → SVĐ Mỹ Đình',
    shortName: 'SVĐ Mỹ Đình',
    fromLabel: 'Đại lộ Lê Quang Đạo (A)',
    toLabel: 'SVĐ Quốc gia Mỹ Đình (B)',
    length: 2000,
    theme: 'overpass_avenue',
    roadWidth: 20.4,
    laneCount: 6,
    lanes: LANES_6,
    defaultPlayerLane: 4.8,
    roadClassLabel: 'Đại lộ Đô thị · 6 làn',
    trafficDensityScale: 1.0,
    taxiCountPerStage: 3,
    speedLimitKmh: 70,
    hasIntersections: false,
    hasRecklessMoto: false,
    destinationKey: 'my_dinh',
    rewardScale: 1.0,
    allowedObstacles: ['car', 'taxi', 'bus', 'truck', 'heavy_truck', 'motorbike'],
    obstacleWeights: {
      car: 30,
      truck: 22,
      heavy_truck: 12,
      bus: 18,
      motorbike: 18
    },
    ambientHint: 'Đại lộ 6 làn rộng thoáng hướng về SVĐ Quốc gia Mỹ Đình, nhiều ô tô, xe buýt & xe tải'
  },
  {
    id: 2,
    chapter: 1,
    levelInChapter: 2,
    codeLabel: '1-2',
    name: 'Bài 1-2: Đại lộ Thăng Long → Bảo tàng Quân sự',
    shortName: 'Bảo tàng Quân sự',
    fromLabel: 'Đại lộ Thăng Long (A)',
    toLabel: 'Bảo tàng Lịch sử Quân sự (B)',
    length: 5000,
    theme: 'overpass_avenue',
    roadWidth: 20.4,
    laneCount: 6,
    lanes: LANES_6,
    defaultPlayerLane: 4.8,
    roadClassLabel: 'Đại lộ Đô thị · 6 làn',
    trafficDensityScale: 1.25,
    taxiCountPerStage: 3,
    speedLimitKmh: 70,
    hasIntersections: false,
    hasRecklessMoto: false,
    destinationKey: 'quan_su',
    rewardScale: 1.4,
    allowedObstacles: ['car', 'taxi', 'bus', 'truck', 'heavy_truck', 'motorbike'],
    obstacleWeights: {
      car: 28,
      truck: 22,
      heavy_truck: 16,
      bus: 18,
      motorbike: 16
    },
    ambientHint: 'Chặng 5 km dọc Đại lộ Thăng Long với mật độ xe tải, xe buýt VinBus 45 chỗ tăng cao'
  },
  {
    id: 3,
    chapter: 1,
    levelInChapter: 3,
    codeLabel: '1-3',
    name: 'Bài 1-3: Cầu vượt Cổ Linh → Đại học VinUni',
    shortName: 'ĐH VinUni',
    fromLabel: 'Cầu vượt Cổ Linh (A)',
    toLabel: 'Đại học VinUni (B)',
    length: 10000,
    theme: 'overpass_avenue',
    roadWidth: 20.4,
    laneCount: 6,
    lanes: LANES_6,
    defaultPlayerLane: 4.8,
    roadClassLabel: 'Đại lộ Đô thị · 6 làn',
    trafficDensityScale: 1.5,
    taxiCountPerStage: 3,
    speedLimitKmh: 70,
    hasIntersections: false,
    hasRecklessMoto: true,
    destinationKey: 'vinuni',
    rewardScale: 2.0,
    allowedObstacles: ['car', 'taxi', 'bus', 'truck', 'heavy_truck', 'motorbike', 'reckless_moto'],
    obstacleWeights: {
      car: 24,
      truck: 20,
      heavy_truck: 14,
      bus: 16,
      motorbike: 14,
      reckless_moto: 12
    },
    ambientHint: 'Chặng đường dài 10 km tới ĐH VinUni, xuất hiện xe máy phóng nhanh vượt ẩu'
  },
  {
    id: 4,
    chapter: 2,
    levelInChapter: 1,
    codeLabel: '2-1',
    name: 'Bài 2-1: Phố Tràng Tiền → Nhà Hát Lớn',
    shortName: 'Nhà Hát Lớn',
    fromLabel: 'Phố Tràng Tiền (A)',
    toLabel: 'Nhà Hát Lớn Hà Nội (B)',
    length: 2000,
    theme: 'tree_boulevard',
    roadWidth: 13.5,
    laneCount: 4,
    lanes: LANES_4,
    defaultPlayerLane: 1.4,
    roadClassLabel: 'Phố Cây Cổ Thụ · 4 làn',
    trafficDensityScale: 1.0,
    taxiCountPerStage: 3,
    speedLimitKmh: 60,
    hasIntersections: true,
    hasRecklessMoto: false,
    destinationKey: 'nha_hat_lon',
    rewardScale: 1.15,
    allowedObstacles: [
      'motorbike',
      'flower_bike',
      'vendor',
      'tourist',
      'office_worker',
      'car',
      'taxi',
      'bus',
      'truck'
    ],
    obstacleWeights: {
      motorbike: 30,
      flower_bike: 12,
      vendor: 6,
      tourist: 6,
      office_worker: 6,
      car: 18,
      bus: 12,
      truck: 10
    },
    ambientHint: 'Vòm cây cổ thụ xanh rợp kín phố 4 làn, ngã tư đèn đỏ & người đi bộ qua vạch'
  },
  {
    id: 5,
    chapter: 2,
    levelInChapter: 2,
    codeLabel: '2-2',
    name: 'Bài 2-2: Phan Đình Phùng → Lăng Bác',
    shortName: 'Lăng Bác',
    fromLabel: 'Đường Phan Đình Phùng (A)',
    toLabel: 'Lăng Chủ tịch Hồ Chí Minh (B)',
    length: 5000,
    theme: 'tree_boulevard',
    roadWidth: 13.5,
    laneCount: 4,
    lanes: LANES_4,
    defaultPlayerLane: 1.4,
    roadClassLabel: 'Phố Cây Cổ Thụ · 4 làn',
    trafficDensityScale: 1.25,
    taxiCountPerStage: 3,
    speedLimitKmh: 60,
    hasIntersections: true,
    hasRecklessMoto: false,
    destinationKey: 'lang_bac',
    rewardScale: 1.6,
    allowedObstacles: [
      'motorbike',
      'flower_bike',
      'vendor',
      'tourist',
      'office_worker',
      'car',
      'taxi',
      'bus',
      'truck'
    ],
    obstacleWeights: {
      motorbike: 28,
      flower_bike: 10,
      vendor: 6,
      tourist: 7,
      office_worker: 7,
      car: 18,
      bus: 12,
      truck: 12
    },
    ambientHint: 'Tuyến 5 km dưới tán sấu cổ thụ Phan Đình Phùng hướng về Quảng trường Ba Đình'
  },
  {
    id: 6,
    chapter: 2,
    levelInChapter: 3,
    codeLabel: '2-3',
    name: 'Bài 2-3: Đường Hoàng Diệu → Cột Cờ Hà Nội',
    shortName: 'Cột Cờ Hà Nội',
    fromLabel: 'Đường Hoàng Diệu (A)',
    toLabel: 'Cột Cờ Hà Nội (B)',
    length: 10000,
    theme: 'tree_boulevard',
    roadWidth: 13.5,
    laneCount: 4,
    lanes: LANES_4,
    defaultPlayerLane: 1.4,
    roadClassLabel: 'Phố Cây Cổ Thụ · 4 làn',
    trafficDensityScale: 1.5,
    taxiCountPerStage: 3,
    speedLimitKmh: 60,
    hasIntersections: true,
    hasRecklessMoto: true,
    destinationKey: 'cot_co',
    rewardScale: 2.2,
    allowedObstacles: [
      'motorbike',
      'flower_bike',
      'vendor',
      'tourist',
      'office_worker',
      'car',
      'taxi',
      'bus',
      'truck',
      'reckless_moto'
    ],
    obstacleWeights: {
      motorbike: 22,
      reckless_moto: 12,
      flower_bike: 10,
      vendor: 6,
      tourist: 6,
      office_worker: 6,
      car: 16,
      bus: 11,
      truck: 11
    },
    ambientHint: 'Chặng 10 km qua Hoàng Thành Thăng Long tới Cột Cờ Hà Nội, nhiều ngã tư & xe vượt ẩu'
  },
  {
    id: 7,
    chapter: 3,
    levelInChapter: 1,
    codeLabel: '3-1',
    name: 'Bài 3-1: Phố Hàng Trống → Nhà Thờ Lớn',
    shortName: 'Nhà Thờ Lớn',
    fromLabel: 'Phố Hàng Trống (A)',
    toLabel: 'Nhà Thờ Lớn Hà Nội (B)',
    length: 2000,
    theme: 'old_quarter',
    roadWidth: 7.4,
    laneCount: 2,
    lanes: LANES_2,
    defaultPlayerLane: 1.8,
    roadClassLabel: 'Phố Cổ · 2 làn',
    trafficDensityScale: 0.9,
    taxiCountPerStage: 2,
    speedLimitKmh: 45,
    hasIntersections: true,
    hasRecklessMoto: false,
    destinationKey: 'nha_tho_lon',
    rewardScale: 1.3,
    allowedObstacles: [
      'motorbike',
      'flower_bike',
      'vendor',
      'tourist',
      'office_worker',
      'car',
      'taxi'
    ],
    obstacleWeights: {
      motorbike: 40,
      flower_bike: 20,
      vendor: 12,
      tourist: 12,
      office_worker: 8,
      car: 8
    },
    ambientHint: 'Phố cổ 2 làn hẹp san sát (cấm xe tải & xe buýt), nhiều người đi bộ sang đường ở vạch'
  },
  {
    id: 8,
    chapter: 3,
    levelInChapter: 2,
    codeLabel: '3-2',
    name: 'Bài 3-2: Phố Hàng Đào → Hồ Hoàn Kiếm',
    shortName: 'Hồ Hoàn Kiếm',
    fromLabel: 'Phố Hàng Đào & Ô Quan Chưởng (A)',
    toLabel: 'Hồ Hoàn Kiếm (B)',
    length: 5000,
    theme: 'old_quarter',
    roadWidth: 7.4,
    laneCount: 2,
    lanes: LANES_2,
    defaultPlayerLane: 1.8,
    roadClassLabel: 'Phố Cổ · 2 làn',
    trafficDensityScale: 1.15,
    taxiCountPerStage: 2,
    speedLimitKmh: 45,
    hasIntersections: true,
    hasRecklessMoto: false,
    destinationKey: 'ho_hoan_kiem',
    rewardScale: 1.8,
    allowedObstacles: [
      'motorbike',
      'flower_bike',
      'vendor',
      'tourist',
      'office_worker',
      'car',
      'taxi'
    ],
    obstacleWeights: {
      motorbike: 38,
      flower_bike: 20,
      vendor: 12,
      tourist: 12,
      office_worker: 10,
      car: 8
    },
    ambientHint: 'Qua cổng Ô Quan Chưởng vào tuyến 5 km hướng Hồ Gươm, thận trọng xe cắt ngang ngã tư'
  },
  {
    id: 9,
    chapter: 3,
    levelInChapter: 3,
    codeLabel: '3-3',
    name: 'Bài 3-3: Phố Hàng Bông → Ga Hà Nội',
    shortName: 'Ga Hà Nội',
    fromLabel: 'Phố Hàng Bông · Cửa Nam (A)',
    toLabel: 'Ga Hà Nội (B)',
    length: 10000,
    theme: 'old_quarter',
    roadWidth: 7.4,
    laneCount: 2,
    lanes: LANES_2,
    defaultPlayerLane: 1.8,
    roadClassLabel: 'Phố Cổ · 2 làn',
    trafficDensityScale: 1.35,
    taxiCountPerStage: 3,
    speedLimitKmh: 45,
    hasIntersections: true,
    hasRecklessMoto: true,
    destinationKey: 'ga_ha_noi',
    rewardScale: 2.6,
    allowedObstacles: [
      'motorbike',
      'flower_bike',
      'vendor',
      'tourist',
      'office_worker',
      'car',
      'taxi',
      'reckless_moto'
    ],
    obstacleWeights: {
      motorbike: 30,
      reckless_moto: 14,
      flower_bike: 18,
      vendor: 12,
      tourist: 10,
      office_worker: 8,
      car: 8
    },
    ambientHint: 'Chặng cuối phá đảo 10 km xuyên Phố Cổ tới Ga Hà Nội lịch sử, đông xe cắt ngang & xe vượt ẩu'
  }
];

export function getObstacleAllowedClasses(type: ObstacleTypeId): readonly RoadClass[] {
  return OBSTACLE_TYPES[type].allowedRoadClasses;
}

export function isObstacleAllowedInStage(type: ObstacleTypeId, stage: StageSpec): boolean {
  const spec = OBSTACLE_TYPES[type];
  if (!spec.allowedRoadClasses.includes(stage.laneCount)) return false;
  if (spec.minLevelInChapter && stage.levelInChapter < spec.minLevelInChapter) return false;
  return true;
}

export function getStageSpec(stageId: number): StageSpec {
  return STAGES.find((s) => s.id === stageId) ?? STAGES[0];
}
