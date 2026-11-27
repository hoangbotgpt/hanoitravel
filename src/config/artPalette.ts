/**
 * Hanoi Shipper 3D Retro — Art Direction & Color Palette
 * Sourced directly from the 10 Hanoi reference photographs in `Scenes/`.
 * Shared by 3D world construction (`src/world/*`) and 720p Retro UI (`src/ui/*`).
 */

export interface HanoiPalette {
  // Sky & Golden-Hour Retro Lighting
  skyTop: number;
  skyHorizon: number;
  fogRetroGold: number;
  sunGold: number;
  sunbeamWarm: number;

  // Road, Curb & Concrete Overpass
  asphalt: number;
  asphaltWarm: number;
  roadLine: number;
  sidewalk: number;
  curbLight: number;
  curbRed: number;
  overpassConcrete: number;
  overpassGuardrail: number;

  // Old Quarter & Colonial Architecture
  oldQuarterYellow: number;
  oldQuarterCream: number;
  shutterTeal: number;
  shutterTealDark: number;
  terracottaRoof: number;
  operaSlateRoof: number;
  oQuanChuongStone: number;
  ironBalcony: number;
  signboardWood: number;
  signboardGold: number;
  clockTowerWhite: number;
  clockFaceDark: number;

  // Foliage, Trees & Bougainvillea
  foliageGreen: number;
  foliageSunlit: number;
  foliageAutumn: number;
  treeTrunk: number;
  treeLimeBase: number;
  bougainvilleaPink: number;
  bougainvilleaMagenta: number;
  bougainvilleaLeaf: number;

  // Hanoi Vehicles, Flags & Street Culture
  busBlue: number;
  busWhite: number;
  busStripeYellow: number;
  busLedRed: number;
  taxiYellow: number;
  taxiSilver: number;
  taxiRoofLight: number;
  flagRed: number;
  flagStarYellow: number;
  khueVanCacBlue: number;
  conicalHatStraw: number;
  basketBamboo: number;
  flowerLotusPink: number;
  flowerSunYellow: number;
  flowerWhite: number;
  shipperGreen: number;
  shipperAmber: number;
  shipperBoxBlue: number;

  // Retro UI CSS Tokens (Warm Old Quarter Signboard & Espresso Theme)
  uiBg: string;
  uiCard: string;
  uiBorder: string;
  uiText: string;
  uiAccent: string;
  uiTeal: string;
  uiDanger: string;
  uiWarning: string;
}

export const HANOI_PALETTE: HanoiPalette = {
  // Sky & Golden-Hour Retro Lighting
  skyTop: 0x6d9fb5,
  skyHorizon: 0xf4cf89,
  fogRetroGold: 0xecd09b,
  sunGold: 0xffe2a3,
  sunbeamWarm: 0xf9d88c,

  // Road, Curb & Concrete Overpass
  asphalt: 0x3b3f44,
  asphaltWarm: 0x4b463f,
  roadLine: 0xebe3cf,
  sidewalk: 0x9c9282,
  curbLight: 0xd9cfc1,
  curbRed: 0xb83a2d,
  overpassConcrete: 0xbcb5a6,
  overpassGuardrail: 0x8f887b,

  // Old Quarter & Colonial Architecture (Scenes/1731379313, 1731385082, cach-ly-xa-hoi-23, 30)
  oldQuarterYellow: 0xdca842,
  oldQuarterCream: 0xead9b5,
  shutterTeal: 0x0f6b70,
  shutterTealDark: 0x0a4b4f,
  terracottaRoof: 0xa64b34,
  operaSlateRoof: 0x323b45,
  oQuanChuongStone: 0x7d6e58,
  ironBalcony: 0x22272a,
  signboardWood: 0x5b3a22,
  signboardGold: 0xe3a837,
  clockTowerWhite: 0xeceae2,
  clockFaceDark: 0x232629,

  // Foliage, Trees & Bougainvillea (Scenes/1731378206, IMG_1690, Cong-dien-so-15)
  foliageGreen: 0x3b6e34,
  foliageSunlit: 0x7da43b,
  foliageAutumn: 0xc88a32,
  treeTrunk: 0x463a2e,
  treeLimeBase: 0xdcd7ca,
  bougainvilleaPink: 0xf25ca2,
  bougainvilleaMagenta: 0xff7cb8,
  bougainvilleaLeaf: 0x4a7b3b,

  // Hanoi Vehicles, Flags & Street Culture (Scenes/1731378206, 1731379013, 1731383914, duong-pho-vang-ve-25)
  busBlue: 0x1c7ed6,
  busWhite: 0xf2f4f7,
  busStripeYellow: 0xf59f00,
  busLedRed: 0xe03131,
  taxiYellow: 0xe5a922,
  taxiSilver: 0xc5c9ce,
  taxiRoofLight: 0xfff3bf,
  flagRed: 0xda251d,
  flagStarYellow: 0xffcd00,
  khueVanCacBlue: 0x155b94,
  conicalHatStraw: 0xdcc58c,
  basketBamboo: 0x9c723e,
  flowerLotusPink: 0xf075a0,
  flowerSunYellow: 0xf5c527,
  flowerWhite: 0xf7f2e7,
  shipperGreen: 0x16804b,
  shipperAmber: 0xe68a1e,
  shipperBoxBlue: 0x1f6fb2,

  // Retro UI CSS Tokens (Warm Old Quarter Signboard & Espresso Theme)
  uiBg: '#1e1915',
  uiCard: 'rgba(39, 31, 24, 0.88)',
  uiBorder: '#d9a441',
  uiText: '#f6eedc',
  uiAccent: '#e8a838',
  uiTeal: '#1f8a8c',
  uiDanger: '#d94e3b',
  uiWarning: '#e07b2e'
};

export interface StageAtmosphere {
  skyTop: number;
  skyHorizon: number;
  fogColor: number;
  fogNear: number;
  fogFar: number;
  sunColor: number;
  sunIntensity: number;
  sunElevation: number;
  ambientIntensity: number;
}

export const STAGE_ATMOSPHERES: Record<1 | 2 | 3, StageAtmosphere> = {
  // Bài 1: Phố Cổ & Ô Quan Chưởng — Crisp morning sun with golden shadows & soft mist depth
  1: {
    skyTop: 0x4e82a8,
    skyHorizon: 0xf4c87a,
    fogColor: 0xc9c3b6,
    fogNear: 65,
    fogFar: 260,
    sunColor: 0xffd590,
    sunIntensity: 2.75,
    sunElevation: 22,
    ambientIntensity: 0.45
  },
  // Bài 2: Phố Cây Xanh & Nhà Hát Lớn — Low slanted afternoon beams through green canopy
  2: {
    skyTop: 0x457c9c,
    skyHorizon: 0xf0be6e,
    fogColor: 0xc4bfa8,
    fogNear: 70,
    fogFar: 285,
    sunColor: 0xffcc7a,
    sunIntensity: 2.85,
    sunElevation: 19,
    ambientIntensity: 0.44
  },
  // Bài 3: Đại Lộ Hoa Giấy & Cầu Vượt — Rich sunset amber over modern capital boulevard
  3: {
    skyTop: 0x3e6796,
    skyHorizon: 0xf2a566,
    fogColor: 0xc7b3a0,
    fogNear: 75,
    fogFar: 320,
    sunColor: 0xffb86b,
    sunIntensity: 2.95,
    sunElevation: 16,
    ambientIntensity: 0.42
  }
};

export const THEME_ATMOSPHERES: Record<
  'overpass_avenue' | 'tree_boulevard' | 'old_quarter',
  StageAtmosphere
> = {
  // Stages 1..3 (Bài 1 · 6 làn): Crisp sunny modern avenue & clear urban horizon
  overpass_avenue: {
    skyTop: 0x457fa8,
    skyHorizon: 0xf4cf89,
    fogColor: 0xc9c4b8,
    fogNear: 75,
    fogFar: 320,
    sunColor: 0xffd590,
    sunIntensity: 2.85,
    sunElevation: 24,
    ambientIntensity: 0.46
  },
  // Stages 4..6 (Bài 2 · 4 làn): Lush ancient tree canopy with warm slanted afternoon shade
  tree_boulevard: {
    skyTop: 0x3d738f,
    skyHorizon: 0xedd085,
    fogColor: 0xbec4ab,
    fogNear: 68,
    fogFar: 280,
    sunColor: 0xffcc7a,
    sunIntensity: 2.75,
    sunElevation: 20,
    ambientIntensity: 0.48
  },
  // Stages 7..9 (Bài 3 · 2 làn): Golden Old Quarter sunset warmth & intimate misty alley depth
  old_quarter: {
    skyTop: 0x42668e,
    skyHorizon: 0xf2ae6b,
    fogColor: 0xcab69e,
    fogNear: 62,
    fogFar: 250,
    sunColor: 0xffbe73,
    sunIntensity: 2.95,
    sunElevation: 16,
    ambientIntensity: 0.44
  }
};

export function getStageAtmosphere(stageId: number): StageAtmosphere {
  if (stageId <= 3) return THEME_ATMOSPHERES.overpass_avenue;
  if (stageId <= 6) return THEME_ATMOSPHERES.tree_boulevard;
  return THEME_ATMOSPHERES.old_quarter;
}

export interface RetroUiTokens {
  bg: string;
  card: string;
  cardElevated: string;
  border: string;
  text: string;
  textMuted: string;
  accent: string;
  teal: string;
  danger: string;
  success: string;
  shadow: string;
}

export const RETRO_UI_TOKENS: RetroUiTokens = {
  bg: HANOI_PALETTE.uiBg,
  card: HANOI_PALETTE.uiCard,
  cardElevated: 'rgba(49, 39, 30, 0.94)',
  border: HANOI_PALETTE.uiBorder,
  text: HANOI_PALETTE.uiText,
  textMuted: '#c8bba0',
  accent: HANOI_PALETTE.uiAccent,
  teal: HANOI_PALETTE.uiTeal,
  danger: HANOI_PALETTE.uiDanger,
  success: '#4ca66b',
  shadow: '0 10px 28px rgba(14, 10, 7, 0.55)'
};
