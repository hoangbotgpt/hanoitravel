import { ROAD_WIDTH } from '../config/gameConfig.ts';
import {
  DEFAULT_RIDER_DIMS,
  flailPose,
  getUpKeys,
  lerpRiderPose,
  runPose,
  sampleRiderTrack,
  seatedPose,
  sprawledPose,
  standingPose,
  tuckedRollPose,
  type RiderBodyDims,
  type RiderJointPose
} from './riderPose.ts';

export type CrashPhase =
  | 'riding'
  | 'impact_tumble'
  | 'stand_up'
  | 'run_to_bike'
  | 'remount';

export const IMPACT_TUMBLE_DURATION = 1.05;
export const STAND_UP_DURATION = 0.95;
export const RUN_TO_BIKE_DURATION = 0.85;
export const REMOUNT_DURATION = 0.5;
export const TOTAL_CRASH_DURATION =
  IMPACT_TUMBLE_DURATION +
  STAND_UP_DURATION +
  RUN_TO_BIKE_DURATION +
  REMOUNT_DURATION;

/** Fraction of the tumble spent airborne before hitting the asphalt. */
const FLIGHT_FRACTION = 0.48;
/** Rider touches down this far before the final resting spot, then slides/rolls. */
const SLIDE_BACK_Z = 1.25;
const SLIDE_SIDE_X = 0.35;

export interface CrashRiderOptions {
  /** Pelvis height of the seated rider above the ground (bike upright). */
  seatY: number;
  /** Pelvis Z of the seated rider in bike-local space. */
  seatZ: number;
  dims: RiderBodyDims;
}

export const DEFAULT_CRASH_RIDER: CrashRiderOptions = {
  seatY: 0.76,
  seatZ: 0.2,
  dims: DEFAULT_RIDER_DIMS
};

export interface CrashRecoveryState {
  phase: CrashPhase;
  phaseElapsed: number;
  totalElapsed: number;
  startDistance: number;
  startLateralOffset: number;
  impactSpeed: number;
  /** Which side of the bike topples (+1 falls right, -1 falls left) */
  fallSide: 1 | -1;
  /** Which side relative to fallen bike the rider ejects & runs back from */
  riderSide: 1 | -1;
  slideLength: number;
  bikeFinalLat: number;
  riderLandRelX: number;
  riderLandRelZ: number;
  rider: CrashRiderOptions;
}

export interface CrashVisualSample {
  phase: CrashPhase;
  bikeDistance: number;
  bikeLateral: number;
  bikeHeightY: number;
  /** Roll in radians around forward axis (Z rotation: -fallSide * angle tilts top toward fallSide) */
  bikeRoll: number;
  bikeYawOffset: number;
  /** Rider ground position relative to the bike root (pelvis is directly above it). */
  riderRelX: number;
  riderRelY: number;
  riderRelZ: number;
  /** Whole-body pitch / yaw / roll (also present inside riderPose). */
  riderPitch: number;
  riderYaw: number;
  riderRoll: number;
  useStandingRider: boolean;
  /** Full articulated pose for the skinned rider (pelvis height in riderPose.y). */
  riderPose: RiderJointPose;
  /**
   * 0..1 weight to blend the crash rider's joints toward the seated rider's exact
   * (IK-solved) riding posture, so swapping riders at launch / remount is seamless.
   */
  seatedBlend: number;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp(t, 0, 1);
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function createIdleCrashState(
  rider: CrashRiderOptions = DEFAULT_CRASH_RIDER
): CrashRecoveryState {
  return {
    phase: 'riding',
    phaseElapsed: 0,
    totalElapsed: 0,
    startDistance: 0,
    startLateralOffset: 1.4,
    impactSpeed: 0,
    fallSide: 1,
    riderSide: 1,
    slideLength: 0,
    bikeFinalLat: 1.4,
    riderLandRelX: 0,
    riderLandRelZ: 0,
    rider
  };
}

export function startCrashSequence(
  startDistance: number,
  startLateralOffset: number,
  impactSpeed: number,
  obstacleLateralOffset: number,
  stageLength: number,
  rider: CrashRiderOptions = DEFAULT_CRASH_RIDER,
  roadWidth = ROAD_WIDTH
): CrashRecoveryState {
  const roadEdgeSafe = Math.max(1.2, roadWidth * 0.5 - 1.15);
  // Topple away from the colliding obstacle's side
  const fallSide: 1 | -1 = obstacleLateralOffset <= startLateralOffset ? 1 : -1;
  const maxSlide = Math.max(0.5, stageLength - startDistance - 1.0);
  const slideLength = Math.min(maxSlide, clamp(2.8 + impactSpeed * 0.045, 2.8, 5.2));
  const bikeFinalLat = clamp(
    startLateralOffset - fallSide * 0.45,
    -roadEdgeSafe,
    roadEdgeSafe
  );

  // Pick rider landing side on asphalt without ejecting off-road through shophouses
  const riderCheckOffset = Math.min(2.0, Math.max(1.3, roadWidth * 0.22));
  let riderSide: 1 | -1 = fallSide;
  if (Math.abs(bikeFinalLat + riderSide * riderCheckOffset) > roadEdgeSafe + 0.35) {
    riderSide = (fallSide * -1) as 1 | -1;
  }
  // Thrown over the handlebars: lands ahead of the fallen bike, drifting to one side inside road bounds
  const riderLandOffsetX = Math.min(1.7, Math.max(1.25, roadWidth * 0.19));
  const riderLandRelX = riderSide * riderLandOffsetX;
  const riderLandRelZ = -3.3; // -Z = ahead along road from fallen bike

  return {
    phase: 'impact_tumble',
    phaseElapsed: 0,
    totalElapsed: 0,
    startDistance,
    startLateralOffset,
    impactSpeed,
    fallSide,
    riderSide,
    slideLength,
    bikeFinalLat,
    riderLandRelX,
    riderLandRelZ,
    rider
  };
}

export function stepCrashSequence(
  state: CrashRecoveryState,
  dt: number
): { state: CrashRecoveryState; completedRemount: boolean } {
  if (state.phase === 'riding') {
    return { state, completedRemount: false };
  }

  const safeDt = Math.max(0, dt);
  let phase: CrashPhase = state.phase;
  let phaseElapsed = state.phaseElapsed + safeDt;
  const totalElapsed = state.totalElapsed + safeDt;
  let completedRemount = false;

  while (phase !== 'riding') {
    const dur =
      phase === 'impact_tumble'
        ? IMPACT_TUMBLE_DURATION
        : phase === 'stand_up'
          ? STAND_UP_DURATION
          : phase === 'run_to_bike'
            ? RUN_TO_BIKE_DURATION
            : REMOUNT_DURATION;

    if (phaseElapsed < dur) break;
    phaseElapsed -= dur;

    if (phase === 'impact_tumble') phase = 'stand_up';
    else if (phase === 'stand_up') phase = 'run_to_bike';
    else if (phase === 'run_to_bike') phase = 'remount';
    else {
      phase = 'riding';
      phaseElapsed = 0;
      completedRemount = true;
    }
  }

  return {
    state: {
      ...state,
      phase,
      phaseElapsed,
      totalElapsed
    },
    completedRemount
  };
}

interface BikeSample {
  bikeDistance: number;
  bikeLateral: number;
  bikeHeightY: number;
  bikeRoll: number;
  bikeYawOffset: number;
}

function makeSample(
  phase: CrashPhase,
  bike: BikeSample,
  relX: number,
  relZ: number,
  yaw: number,
  pose: RiderJointPose,
  useStandingRider = true,
  seatedBlend = 0
): CrashVisualSample {
  return {
    seatedBlend,
    phase,
    ...bike,
    riderRelX: relX,
    riderRelY: 0,
    riderRelZ: relZ,
    riderPitch: pose.pitch,
    riderYaw: yaw,
    riderRoll: pose.twist,
    useStandingRider,
    riderPose: pose
  };
}

export function sampleCrashVisuals(state: CrashRecoveryState): CrashVisualSample {
  const { seatY, seatZ, dims } = state.rider;

  if (state.phase === 'riding') {
    return makeSample(
      'riding',
      {
        bikeDistance: state.startDistance,
        bikeLateral: state.startLateralOffset,
        bikeHeightY: 0,
        bikeRoll: 0,
        bikeYawOffset: 0
      },
      0,
      seatZ,
      0,
      seatedPose(seatY),
      false
    );
  }

  const fallRoll = -state.fallSide * 1.42; // ~81 deg side topple on asphalt
  const fallYaw = -state.fallSide * 0.42;
  const sideStopX = state.riderSide * 0.62;
  const sideStopZ = 0.1;
  // Yaw so local -Z faces back toward fallen bike from landing spot
  const runFaceBikeYaw = Math.atan2(
    state.riderLandRelX - sideStopX,
    state.riderLandRelZ - sideStopZ
  );
  const restBike: BikeSample = {
    bikeDistance: state.startDistance + state.slideLength,
    bikeLateral: state.bikeFinalLat,
    bikeHeightY: 0.24,
    bikeRoll: fallRoll,
    bikeYawOffset: fallYaw
  };
  const landedYaw = state.riderSide * 0.25;

  if (state.phase === 'impact_tumble') {
    const u = clamp(state.phaseElapsed / IMPACT_TUMBLE_DURATION, 0, 1);
    const slideEase = 1 - Math.pow(1 - u, 3);
    const fallFactor = smoothstep(0, 0.7, u);
    const bike: BikeSample = {
      bikeDistance: state.startDistance + state.slideLength * slideEase,
      bikeLateral: lerp(state.startLateralOffset, state.bikeFinalLat, slideEase),
      bikeHeightY: 0.24 * fallFactor,
      bikeRoll: fallRoll * fallFactor,
      bikeYawOffset: fallYaw * slideEase
    };
    const touchX = state.riderLandRelX - state.riderSide * SLIDE_SIDE_X;
    const touchZ = state.riderLandRelZ + SLIDE_BACK_Z;
    const flipTarget = -1.5 * Math.PI; // forward somersault, lands on the back

    if (u < FLIGHT_FRACTION) {
      // Launched over the handlebars, windmilling arms and kicking legs mid-air
      const f = u / FLIGHT_FRACTION;
      const horiz = 1 - Math.pow(1 - f, 1.6);
      const arc =
        Math.sin(f * Math.PI) * (0.95 + Math.min(0.35, state.impactSpeed * 0.008));
      const y = lerp(seatY, 0.16, f) + arc;
      const pitch = flipTarget * smoothstep(0.04, 1, f);
      const flail = flailPose(f * 11, y, pitch);
      flail.side = state.riderSide * 0.35 * Math.sin(f * Math.PI);
      // Blend out of the riding posture in the first instant so the swap is seamless
      const seated = seatedPose(seatY);
      seated.y = y;
      seated.pitch = pitch;
      const pose = lerpRiderPose(seated, flail, smoothstep(0, 0.22, f));
      return makeSample(
        'impact_tumble',
        bike,
        lerp(0, touchX, horiz),
        lerp(seatZ, touchZ, horiz),
        landedYaw * f,
        pose,
        true,
        1 - smoothstep(0, 0.22, f)
      );
    }

    // Hit the asphalt on the back, bounce, log-roll once and come to a sprawled stop
    const g = (u - FLIGHT_FRACTION) / (1 - FLIGHT_FRACTION);
    const slide = 1 - Math.pow(1 - g, 2.4);
    const bounce = 0.2 * Math.abs(Math.sin(g * Math.PI * 2.2)) * Math.pow(1 - g, 1.6);
    const twist = state.riderSide * 2 * Math.PI * smoothstep(0.05, 0.8, g);
    const rolling = tuckedRollPose(0.14 + bounce, flipTarget, twist);
    const sprawl = sprawledPose();
    sprawl.pitch = flipTarget;
    sprawl.twist = state.riderSide * 2 * Math.PI;
    const pose = lerpRiderPose(rolling, sprawl, smoothstep(0.62, 1, g));
    return makeSample(
      'impact_tumble',
      bike,
      lerp(touchX, state.riderLandRelX, slide),
      lerp(touchZ, state.riderLandRelZ, slide),
      landedYaw,
      pose
    );
  }

  if (state.phase === 'stand_up') {
    const u = clamp(state.phaseElapsed / STAND_UP_DURATION, 0, 1);
    const pose = sampleRiderTrack(getUpKeys(dims), u);
    // Shake off the daze while sitting up
    pose.headTurn +=
      Math.sin(u * Math.PI * 7) *
      0.32 *
      smoothstep(0.22, 0.36, u) *
      (1 - smoothstep(0.52, 0.66, u));
    const yaw = lerp(landedYaw, runFaceBikeYaw, smoothstep(0.62, 1, u));
    return makeSample('stand_up', restBike, state.riderLandRelX, state.riderLandRelZ, yaw, pose);
  }

  if (state.phase === 'run_to_bike') {
    const u = clamp(state.phaseElapsed / RUN_TO_BIKE_DURATION, 0, 1);
    const travel = smoothstep(0, 1, u) * 0.35 + u * 0.65;
    const intensity = smoothstep(0, 0.18, u) * (1 - 0.45 * smoothstep(0.8, 1, u));
    const pose = runPose(u * Math.PI * 2 * 2.6, dims, intensity);
    return makeSample(
      'run_to_bike',
      restBike,
      lerp(state.riderLandRelX, sideStopX, travel),
      lerp(state.riderLandRelZ, sideStopZ, travel),
      runFaceBikeYaw,
      pose
    );
  }

  // phase === 'remount': heave the bike upright, swing a leg over and sit back down
  const u = clamp(state.phaseElapsed / REMOUNT_DURATION, 0, 1);
  const liftEase = smoothstep(0, 0.6, u);
  const hopT = clamp(u / 0.65, 0, 1);
  const bike: BikeSample = {
    ...restBike,
    bikeHeightY: lerp(0.24, 0, liftEase),
    bikeRoll: lerp(fallRoll, 0, liftEase),
    bikeYawOffset: lerp(fallYaw, 0, liftEase)
  };

  const stand = standingPose(dims);
  const grab: RiderJointPose = {
    ...stand,
    pitch: -0.3,
    chest: 0.35,
    armL: { down: 0.9, swing: 0.2, yaw: 0.9, elbow: 0.5 },
    armR: { down: 0.9, swing: 0.2, yaw: 0.9, elbow: 0.5 },
    legL: { flex: 0.45, spread: 0.05, knee: 0.55 },
    legR: { flex: 0.2, spread: 0.05, knee: 0.3 }
  };
  grab.y = dims.hipHeight - 0.08;
  const swingOver: RiderJointPose = { ...seatedPose(seatY) };
  // The leg on the far side of the bike swings high over the seat
  if (state.riderSide > 0) swingOver.legL = { flex: 1.15, spread: 0.85, knee: 1.1 };
  else swingOver.legR = { flex: 1.15, spread: 0.85, knee: 1.1 };
  const seated = seatedPose(seatY);

  let pose: RiderJointPose;
  if (hopT < 0.35) pose = lerpRiderPose(stand, grab, smoothstep(0, 0.35, hopT));
  else if (hopT < 0.72) pose = lerpRiderPose(grab, swingOver, smoothstep(0.35, 0.72, hopT));
  else pose = lerpRiderPose(swingOver, seated, smoothstep(0.72, 1, hopT));

  if (hopT >= 0.35) {
    const hop = Math.sin(smoothstep(0.35, 1, hopT) * Math.PI) * 0.22;
    pose.y = lerp(grab.y, seatY + bike.bikeHeightY, smoothstep(0.35, 1, hopT)) + hop;
  }
  const move = smoothstep(0.2, 0.95, hopT);
  return makeSample(
    'remount',
    bike,
    lerp(sideStopX, 0, move),
    lerp(sideStopZ, seatZ, move),
    lerp(runFaceBikeYaw, 0, smoothstep(0, 0.6, hopT)),
    pose,
    u < 0.65,
    smoothstep(0.72, 1, hopT)
  );
}
