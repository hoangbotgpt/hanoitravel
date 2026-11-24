/**
 * Pure (three.js-free) joint pose description for the articulated rider, plus a small
 * library of key poses and blending helpers used by the crash / recovery sequence.
 *
 * Angles are radians. Rig space: +Y up, -Z forward, +X rider's right.
 */

export interface RiderArmPose {
  /** Lower the arm from the T-pose in the frontal plane (PI/2 = hanging straight down). */
  down: number;
  /** Swing forward (+) / backward (-) about the shoulder's left-right axis. */
  swing: number;
  /** Rotate the arm forward around the vertical axis (used for reaching to handlebars). */
  yaw: number;
  /** Elbow bend, forearm folds forward. */
  elbow: number;
}

export interface RiderLegPose {
  /** Hip flexion, thigh lifts forward. */
  flex: number;
  /** Abduction, leg spreads outward. */
  spread: number;
  /** Knee bend, shin folds backward. */
  knee: number;
}

export interface RiderJointPose {
  /** Pelvis joint height above the ground (rig-local). */
  y: number;
  /** Whole-body pitch about the pelvis (-: forward/face down, +: backward). */
  pitch: number;
  /** Whole-body roll around the spine (log roll). */
  twist: number;
  /** Whole-body side tilt. */
  side: number;
  chest: number;
  chestTwist: number;
  head: number;
  headTurn: number;
  armL: RiderArmPose;
  armR: RiderArmPose;
  legL: RiderLegPose;
  legR: RiderLegPose;
  /** Finger curl (0 = flat open hand, ~1.6 = fist / wrapped round a grip). */
  gripL: number;
  gripR: number;
}

export interface RiderBodyDims {
  hipHeight: number;
  thighLength: number;
  shinLength: number;
}

export const DEFAULT_RIDER_DIMS: RiderBodyDims = {
  hipHeight: 0.8,
  thighLength: 0.31,
  shinLength: 0.45
};

const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

function lerpArm(a: RiderArmPose, b: RiderArmPose, t: number): RiderArmPose {
  return {
    down: mix(a.down, b.down, t),
    swing: mix(a.swing, b.swing, t),
    yaw: mix(a.yaw, b.yaw, t),
    elbow: mix(a.elbow, b.elbow, t)
  };
}

function lerpLeg(a: RiderLegPose, b: RiderLegPose, t: number): RiderLegPose {
  return {
    flex: mix(a.flex, b.flex, t),
    spread: mix(a.spread, b.spread, t),
    knee: mix(a.knee, b.knee, t)
  };
}

export function lerpRiderPose(a: RiderJointPose, b: RiderJointPose, tRaw: number): RiderJointPose {
  const t = clamp01(tRaw);
  return {
    y: mix(a.y, b.y, t),
    pitch: mix(a.pitch, b.pitch, t),
    twist: mix(a.twist, b.twist, t),
    side: mix(a.side, b.side, t),
    chest: mix(a.chest, b.chest, t),
    chestTwist: mix(a.chestTwist, b.chestTwist, t),
    head: mix(a.head, b.head, t),
    headTurn: mix(a.headTurn, b.headTurn, t),
    armL: lerpArm(a.armL, b.armL, t),
    armR: lerpArm(a.armR, b.armR, t),
    legL: lerpLeg(a.legL, b.legL, t),
    legR: lerpLeg(a.legR, b.legR, t),
    gripL: mix(a.gripL, b.gripL, t),
    gripR: mix(a.gripR, b.gripR, t)
  };
}

/** Samples a keyframed pose track; keys must be sorted by t in [0, 1]. */
export function sampleRiderTrack(
  keys: ReadonlyArray<{ t: number; pose: RiderJointPose }>,
  u: number
): RiderJointPose {
  if (u <= keys[0].t) return keys[0].pose;
  for (let i = 1; i < keys.length; i++) {
    const k1 = keys[i];
    if (u <= k1.t) {
      const k0 = keys[i - 1];
      const local = (u - k0.t) / Math.max(1e-6, k1.t - k0.t);
      const eased = local * local * (3 - 2 * local);
      return lerpRiderPose(k0.pose, k1.pose, eased);
    }
  }
  return keys[keys.length - 1].pose;
}

function legDrop(pitch: number, leg: RiderLegPose, dims: RiderBodyDims): number {
  const thighAngle = pitch + leg.flex;
  const shinAngle = thighAngle - leg.knee;
  const spreadCos = Math.cos(leg.spread);
  return (
    (dims.thighLength * Math.cos(thighAngle) + dims.shinLength * Math.cos(shinAngle)) * spreadCos
  );
}

/**
 * Pelvis height that keeps the lowest foot planted on the ground for a given leg pose,
 * never lower than `minBodyY` (the body's own thickness when sitting / lying).
 */
export function groundedPelvisY(
  pose: RiderJointPose,
  dims: RiderBodyDims,
  minBodyY = 0.13
): number {
  const sole = 0.035;
  const drop = Math.max(legDrop(pose.pitch, pose.legL, dims), legDrop(pose.pitch, pose.legR, dims));
  return Math.max(minBodyY, drop + sole);
}

const arm = (down: number, swing = 0, yaw = 0, elbow = 0.15): RiderArmPose => ({
  down,
  swing,
  yaw,
  elbow
});
const leg = (flex: number, knee = 0, spread = 0): RiderLegPose => ({ flex, spread, knee });

function basePose(y: number): RiderJointPose {
  return {
    y,
    pitch: 0,
    twist: 0,
    side: 0,
    chest: 0,
    chestTwist: 0,
    head: 0,
    headTurn: 0,
    armL: arm(1.38),
    armR: arm(1.38),
    legL: leg(0),
    legR: leg(0),
    gripL: 0.55,
    gripR: 0.55
  };
}

/** Riding posture on the seat: hands on grips, knees bent onto the floorboard/pegs. */
export function seatedPose(seatY: number): RiderJointPose {
  return {
    ...basePose(seatY),
    chest: 0.26,
    head: -0.34,
    armL: arm(0.4, 0.05, 1.34, 0.22),
    armR: arm(0.4, 0.05, 1.34, 0.22),
    legL: leg(1.0, 1.38, 0.2),
    legR: leg(1.0, 1.38, 0.2),
    gripL: 1.65,
    gripR: 1.65
  };
}

export function standingPose(dims: RiderBodyDims): RiderJointPose {
  const p = basePose(dims.hipHeight);
  p.chest = 0.06;
  p.armL = arm(1.36, 0.05, 0, 0.2);
  p.armR = arm(1.36, 0.05, 0, 0.2);
  return p;
}

/** Sprawled on the back, head pointing back toward the bike (+Z), arms and legs splayed. */
export function sprawledPose(): RiderJointPose {
  return {
    ...basePose(0.13),
    pitch: Math.PI / 2,
    head: 0.1,
    armL: arm(0.85, 0.1, 0, 0.35),
    armR: arm(1.05, -0.05, 0, 0.2),
    legL: leg(0.12, 0.25, 0.22),
    legR: leg(0.0, 0.08, 0.14)
  };
}

/**
 * Flailing mid-air pose: windmilling arms and kicking legs, driven by a phase in radians.
 */
export function flailPose(phase: number, y: number, pitch: number): RiderJointPose {
  const s = Math.sin;
  return {
    ...basePose(y),
    pitch,
    chest: 0.15 + 0.15 * s(phase * 0.7),
    head: 0.25 * s(phase * 1.3),
    armL: arm(-0.35 + 0.95 * s(phase * 1.6), 1.1 * s(phase * 1.25 + 1.1), 0.35, 0.55 + 0.4 * s(phase * 2.1)),
    armR: arm(-0.25 + 0.95 * s(phase * 1.6 + 2.2), 1.1 * s(phase * 1.25 + 2.9), 0.35, 0.55 + 0.4 * s(phase * 1.9 + 1)),
    legL: leg(0.45 + 0.55 * s(phase * 1.4), 0.7 + 0.55 * s(phase * 2.0 + 0.5), 0.28),
    legR: leg(0.45 + 0.55 * s(phase * 1.4 + 2.6), 0.7 + 0.55 * s(phase * 2.0 + 2.1), 0.28),
    gripL: 0.15,
    gripR: 0.25
  };
}

/** Tucked shape used while log-rolling along the asphalt. */
export function tuckedRollPose(y: number, pitch: number, twist: number): RiderJointPose {
  return {
    ...basePose(y),
    pitch,
    twist,
    chest: 0.35,
    head: 0.35,
    armL: arm(1.25, 0.6, 0, 1.6),
    armR: arm(1.25, 0.6, 0, 1.6),
    legL: leg(0.55, 0.95, 0.06),
    legR: leg(0.65, 1.05, 0.06)
  };
}

/** Getting-up keyframes from sprawled-on-back to standing, facing -Z. */
export function getUpKeys(dims: RiderBodyDims): Array<{ t: number; pose: RiderJointPose }> {
  const lying = sprawledPose();

  const dazed: RiderJointPose = {
    ...lying,
    head: 0.55,
    armL: arm(1.2, 0.2, 0, 0.9),
    armR: arm(1.25, 0.3, 0, 1.2),
    legL: leg(0.35, 0.8, 0.18),
    legR: leg(0.1, 0.2, 0.14)
  };

  const sitting: RiderJointPose = {
    ...basePose(0.14),
    pitch: 0.22,
    chest: 0.32,
    head: 0.1,
    armL: arm(1.3, -0.55, 0, 0.1),
    armR: arm(1.3, -0.55, 0, 0.1),
    legL: leg(1.35, 0.35, 0.16),
    legR: leg(1.1, 0.9, 0.16)
  };

  const crouch: RiderJointPose = {
    ...basePose(0),
    pitch: -0.42,
    chest: 0.25,
    head: -0.25,
    armL: arm(1.15, 0.75, 0, 0.6),
    armR: arm(1.3, 0.35, 0, 0.4),
    legL: leg(1.95, 2.25, 0.18),
    legR: leg(1.55, 1.75, 0.18)
  };
  crouch.y = groundedPelvisY(crouch, dims);

  const stand = standingPose(dims);
  stand.chest = 0.14;
  stand.head = -0.08;

  return [
    { t: 0, pose: lying },
    { t: 0.16, pose: dazed },
    { t: 0.46, pose: sitting },
    { t: 0.74, pose: crouch },
    { t: 1, pose: stand }
  ];
}

/** Running stride; `phase` advances 2*PI per full stride cycle. */
export function runPose(phase: number, dims: RiderBodyDims, intensity = 1): RiderJointPose {
  const s = Math.sin(phase);
  const c = Math.cos(phase);
  const k = intensity;
  const p: RiderJointPose = {
    ...basePose(0),
    pitch: -0.2 * k,
    twist: 0.12 * s * k,
    chest: 0.08 * k,
    chestTwist: -0.2 * s * k,
    head: -0.12 * k,
    armL: arm(1.32, -0.85 * s * k, 0, 0.35 + 1.05 * k),
    armR: arm(1.32, 0.85 * s * k, 0, 0.35 + 1.05 * k),
    legL: leg(0.3 * k + 0.72 * s * k, 0.3 + 1.15 * Math.max(0, c) * k, 0.04),
    legR: leg(0.3 * k - 0.72 * s * k, 0.3 + 1.15 * Math.max(0, -c) * k, 0.04),
    gripL: 0.55 + 0.9 * k,
    gripR: 0.55 + 0.9 * k
  };
  p.y = groundedPelvisY(p, dims) + 0.05 * Math.abs(s) * k;
  return p;
}
