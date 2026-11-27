import * as THREE from 'three';
import {
  BIKES,
  getStageSpec,
  type BikeId,
  type BikeSpec,
  type StageId
} from '../config/gameConfig.ts';
import {
  type CrashPhase,
  type CrashRecoveryState,
  type CrashRiderOptions,
  type CrashVisualSample,
  DEFAULT_CRASH_RIDER,
  IMPACT_TUMBLE_DURATION,
  createIdleCrashState,
  sampleCrashVisuals,
  startCrashSequence,
  stepCrashSequence
} from '../core/crashSequence.ts';
import {
  distanceToWorldZ,
  getRoadCenterX,
  getRoadElevationY,
  getRoadSlope,
  getRoadTangentYaw
} from '../core/roadMath.ts';
import {
  extractBikeRig,
  setBikeBrakeLight,
  setBikeStoppedPose,
  type BikeRigHandles
} from '../world/bikeLoader.ts';
import { findRiderRig, type RiderRig } from '../world/riderRig.ts';

export interface PlayerInputState {
  left: boolean;
  right: boolean;
  accelerate: boolean;
  brake: boolean;
}

export interface PlayerPose {
  distance: number;
  lateralOffset: number;
  worldX: number;
  worldY: number;
  worldZ: number;
  speed: number;
  displayKmh: number;
  leanAngle: number;
  yaw: number;
  pitch: number;
  isBraking: boolean;
}

const LATERAL_MARGIN = 0.9;
const BASE_CAMERA_FOV = 60;

export class PlayerController {
  private bikeId: BikeId;
  private bikeSpec: BikeSpec;
  private stageId: StageId = 1;

  private distance = 0;
  private lateralOffset = 1.4;
  private lateralVelocity = 0;
  private speed: number;
  private leanAngle = 0;

  private shakeTimer = 0;
  private shakeDuration = 0.26;
  private shakeStrength = 0;

  private camX = 0;
  private camY = 1.92;
  private camZ = 4.15;
  private camLookX = 0;
  private camLookY = 1.18;
  private camLookZ = -16.5;
  private camRoll = 0;
  private speedRumbleTime = 0;
  private currentFov = BASE_CAMERA_FOV;

  private bikeGroup: THREE.Object3D | null = null;
  private rigHandles: BikeRigHandles | null = null;
  private crashState: CrashRecoveryState = createIdleCrashState();
  private crashRiderOptions: CrashRiderOptions = DEFAULT_CRASH_RIDER;
  private riderRig: RiderRig | null = null;
  private seatedRig: RiderRig | null = null;
  private crashHoldOnGameOver = false;
  private brakeLightLit = false;
  private input: PlayerInputState = {
    left: false,
    right: false,
    accelerate: false,
    brake: false
  };

  constructor(bikeId: BikeId = 'honda') {
    this.bikeId = bikeId;
    this.bikeSpec = BIKES[bikeId];
    this.speed = this.bikeSpec.minCruiseSpeed;
  }

  private resetRigVisuals(): void {
    if (!this.rigHandles) return;
    this.rigHandles.bikeAssembly.rotation.order = 'YXZ';
    this.rigHandles.bikeAssembly.position.set(0, 0, 0);
    this.rigHandles.bikeAssembly.rotation.set(0, 0, 0);
    if (this.rigHandles.seatedRider) {
      this.rigHandles.seatedRider.visible = true;
    }
    if (this.rigHandles.standingRider) {
      this.rigHandles.standingRider.rotation.order = 'YXZ';
      this.rigHandles.standingRider.visible = false;
      this.rigHandles.standingRider.position.set(0, 0, 0);
      this.rigHandles.standingRider.rotation.set(0, 0, 0);
    }
    setBikeStoppedPose(this.rigHandles, false);
    setBikeBrakeLight(this.rigHandles, false);
    this.brakeLightLit = false;
  }

  public setBike(bikeId: BikeId, bikeMesh: THREE.Object3D | null): void {
    this.bikeId = bikeId;
    this.bikeSpec = BIKES[bikeId];
    this.bikeGroup = bikeMesh;
    this.rigHandles = bikeMesh ? extractBikeRig(bikeMesh) : null;
    this.riderRig = findRiderRig(this.rigHandles?.standingRider);
    this.seatedRig = findRiderRig(this.rigHandles?.seatedRider);
    this.crashRiderOptions =
      (bikeMesh?.userData.crashRider as CrashRiderOptions | undefined) ?? DEFAULT_CRASH_RIDER;
    if (this.bikeGroup) {
      this.bikeGroup.rotation.order = 'YXZ';
      this.bikeGroup.visible = true;
    }
    this.resetRigVisuals();
  }

  public setStage(stageId: StageId): void {
    this.stageId = stageId;
  }

  private getMaxLateralOffset(): number {
    const roadWidth = getStageSpec(this.stageId).roadWidth;
    const margin = roadWidth <= 8.5 ? 0.72 : LATERAL_MARGIN;
    return roadWidth * 0.5 - margin;
  }

  private getStageCameraProfile(): {
    backDist: number;
    camY: number;
    aheadDist: number;
    baseFov: number;
    maxFov: number;
    latFollow: number;
  } {
    const laneCount = getStageSpec(this.stageId).laneCount;
    if (laneCount === 2) {
      return {
        backDist: 4.05,
        camY: 1.88,
        aheadDist: 16.0,
        baseFov: 58,
        maxFov: 70,
        latFollow: 0.76
      };
    }
    if (laneCount === 6) {
      return {
        backDist: 4.65,
        camY: 2.28,
        aheadDist: 19.0,
        baseFov: 65,
        maxFov: 76,
        latFollow: 0.82
      };
    }
    return {
      backDist: 4.15,
      camY: 1.92,
      aheadDist: 16.5,
      baseFov: 60,
      maxFov: 72,
      latFollow: 0.72
    };
  }

  public resetForStage(
    stageId: StageId,
    camera?: THREE.PerspectiveCamera
  ): void {
    const stageSpec = getStageSpec(stageId);
    this.stageId = stageId;
    this.distance = 0;
    this.lateralOffset = stageSpec.defaultPlayerLane;
    this.lateralVelocity = 0;
    this.speed = this.bikeSpec.minCruiseSpeed + 4;
    this.leanAngle = 0;
    this.shakeTimer = 0;
    this.shakeStrength = 0;
    this.crashState = createIdleCrashState();
    this.crashHoldOnGameOver = false;
    this.clearInput();

    if (this.bikeGroup) {
      this.bikeGroup.visible = true;
    }
    this.resetRigVisuals();
    this.syncBikeTransform();
    if (camera) {
      this.snapCamera(camera);
    }
  }

  public clearInput(): void {
    this.input.left = false;
    this.input.right = false;
    this.input.accelerate = false;
    this.input.brake = false;
    this.setBrakeLightLit(false);
  }

  public isBraking(): boolean {
    return this.crashState.phase === 'riding' && this.input.brake;
  }

  public isBrakeLightLit(): boolean {
    return this.brakeLightLit;
  }

  public setBrakeLightLit(lit: boolean): void {
    this.brakeLightLit = lit;
    setBikeBrakeLight(this.rigHandles, lit);
  }

  public handleKeyDown(code: string): boolean {
    switch (code) {
      case 'ArrowLeft':
      case 'KeyA':
        this.input.left = true;
        return true;
      case 'ArrowRight':
      case 'KeyD':
        this.input.right = true;
        return true;
      case 'ArrowUp':
      case 'KeyW':
        this.input.accelerate = true;
        return true;
      case 'ArrowDown':
      case 'KeyS':
        this.input.brake = true;
        return true;
      default:
        return false;
    }
  }

  public handleKeyUp(code: string): boolean {
    switch (code) {
      case 'ArrowLeft':
      case 'KeyA':
        this.input.left = false;
        return true;
      case 'ArrowRight':
      case 'KeyD':
        this.input.right = false;
        return true;
      case 'ArrowUp':
      case 'KeyW':
        this.input.accelerate = false;
        return true;
      case 'ArrowDown':
      case 'KeyS':
        this.input.brake = false;
        return true;
      default:
        return false;
    }
  }

  public setInputState(partial: Partial<PlayerInputState>): void {
    Object.assign(this.input, partial);
  }

  public getCrashPhase(): CrashPhase {
    return this.crashState.phase;
  }

  public isCrashRecovering(): boolean {
    return this.crashState.phase !== 'riding';
  }

  public getLateralOffset(): number {
    return this.lateralOffset;
  }

  public getFallSide(): 1 | -1 {
    return this.crashState.fallSide;
  }

  public triggerRoadRashCrash(
    obstacleLateralOffset: number,
    stageLength: number,
    bankrupt: boolean
  ): { fallSide: 1 | -1; worldX: number; worldY: number; worldZ: number } {
    this.crashState = startCrashSequence(
      this.distance,
      this.lateralOffset,
      this.speed,
      obstacleLateralOffset,
      stageLength,
      this.crashRiderOptions,
      getStageSpec(this.stageId).roadWidth
    );
    this.crashHoldOnGameOver = bankrupt;
    this.lateralVelocity = 0;
    this.leanAngle = 0;
    this.speed = 0;
    this.clearInput();
    this.shakeTimer = 0.34;
    this.shakeStrength = 0.56;

    const worldX = getRoadCenterX(this.stageId, this.distance) + this.lateralOffset;
    const worldY = getRoadElevationY(this.stageId, this.distance);
    const worldZ = distanceToWorldZ(this.distance);
    return {
      fallSide: this.crashState.fallSide,
      worldX,
      worldY,
      worldZ
    };
  }

  public updateGameOverCrash(dt: number, camera: THREE.PerspectiveCamera): void {
    if (!this.crashHoldOnGameOver || this.crashState.phase === 'riding') return;
    const safeDt = Math.min(0.05, Math.max(0.0001, dt));
    const maxHoldElapsed = IMPACT_TUMBLE_DURATION - 0.001;
    this.crashState = {
      ...this.crashState,
      phase: 'impact_tumble',
      phaseElapsed: Math.min(maxHoldElapsed, this.crashState.phaseElapsed + safeDt),
      totalElapsed: Math.min(maxHoldElapsed, this.crashState.totalElapsed + safeDt)
    };
    const visual = sampleCrashVisuals(this.crashState);
    this.applyCrashRigVisuals(visual, visual.bikeDistance);
    this.updateCrashCamera(safeDt, camera, visual, visual.bikeDistance);
  }

  public triggerCollisionFeedback(): void {
    this.speed = Math.max(this.bikeSpec.minCruiseSpeed * 0.72, this.speed * 0.56);
    this.shakeTimer = this.shakeDuration;
    this.shakeStrength = 0.42;
  }

  public update(
    dt: number,
    stageLength: number,
    camera: THREE.PerspectiveCamera,
    invulnRemaining = 0,
    onRemountComplete?: () => void
  ): PlayerPose {
    const safeDt = Math.min(0.05, Math.max(0.0001, dt));

    if (this.crashState.phase !== 'riding') {
      const stepped = stepCrashSequence(this.crashState, safeDt);
      const finalDistance = Math.min(
        stageLength,
        stepped.state.startDistance + stepped.state.slideLength
      );
      const finalLateral = stepped.state.bikeFinalLat;
      this.crashState = stepped.state;

      if (stepped.completedRemount) {
        this.distance = finalDistance;
        this.lateralOffset = finalLateral;
        this.lateralVelocity = 0;
        this.leanAngle = 0;
        this.speed = this.bikeSpec.minCruiseSpeed * 0.85;
        this.crashState = createIdleCrashState();
        this.resetRigVisuals();
        if (this.bikeGroup) {
          this.bikeGroup.visible = true;
        }
        onRemountComplete?.();
        const pose = this.syncBikeTransform();
        this.updateCamera(safeDt, camera, pose);
        return pose;
      }

      const visual = sampleCrashVisuals(this.crashState);
      const clampedDist = Math.min(stageLength, visual.bikeDistance);
      this.distance = clampedDist;
      this.lateralOffset = visual.bikeLateral;
      this.speed = 0;
      this.leanAngle = 0;
      const pose = this.applyCrashRigVisuals(visual, clampedDist);
      if (this.bikeGroup) {
        this.bikeGroup.visible = true;
      }
      this.updateCrashCamera(safeDt, camera, visual, clampedDist);
      return pose;
    }

    const spec = this.bikeSpec;

    // 1. Longitudinal speed physics (W/Up accelerates, S/Down brakes smoothly to 0 km/h, otherwise coast)
    const cruiseTarget = spec.minCruiseSpeed + 6;
    const slope = getRoadSlope(this.stageId, this.distance);

    if (this.input.accelerate && !this.input.brake) {
      this.speed += spec.accel * safeDt;
      this.speed -= slope * 9.0 * safeDt;
    } else if (this.input.brake) {
      this.speed -= spec.brakeDecel * safeDt;
      // Ignore downhill/slope rollback when stopped or nearly stopped under brake
      if (this.speed > 0.5) {
        this.speed -= slope * 9.0 * safeDt;
      }
      if (this.speed < 0.05) {
        this.speed = 0;
      }
    } else {
      // Gentle coasting toward relaxed cruise speed (accelerates smoothly from 0 after releasing brake)
      const coastRate = this.speed > cruiseTarget ? 10 : 16;
      const diff = cruiseTarget - this.speed;
      this.speed += Math.sign(diff) * Math.min(Math.abs(diff), coastRate * safeDt);
      if (this.speed > 0.5) {
        this.speed -= slope * 9.0 * safeDt;
      }
    }

    this.speed = Math.max(0, Math.min(spec.maxSpeed, this.speed));

    // 2. Advance linearly along spline distance (A -> B)
    this.distance = Math.min(stageLength, this.distance + this.speed * safeDt);

    // 3. Lateral lane-weaving physics with speed-sensitive steering & smooth motorbike lean
    const maxLat = this.getMaxLateralOffset();
    if (this.speed < 0.5) {
      // Stopped at red light / obstacle: stabilize steering & upright balance
      const stopDamp = 1 - Math.exp(-14 * safeDt);
      this.lateralVelocity += (0 - this.lateralVelocity) * stopDamp;
      if (Math.abs(this.lateralVelocity) < 0.01) this.lateralVelocity = 0;
      this.leanAngle += (0 - this.leanAngle) * stopDamp;
      if (Math.abs(this.leanAngle) < 0.002) this.leanAngle = 0;
    } else {
      const steerDir = (this.input.right ? 1 : 0) - (this.input.left ? 1 : 0);
      const speedRatio = Math.max(0.25, Math.min(1, this.speed / spec.maxSpeed));
      const targetLateralVel = steerDir * spec.handling * (0.55 + 0.45 * speedRatio);
      const lateralLerp = 1 - Math.exp(-11 * safeDt);
      this.lateralVelocity += (targetLateralVel - this.lateralVelocity) * lateralLerp;

      // Lean into turn: steering right (+X) tilts bike right (negative Z rotation)
      const targetLean = -steerDir * spec.leanMax * (0.6 + 0.4 * speedRatio);
      const leanLerp = 1 - Math.exp(-10 * safeDt);
      this.leanAngle += (targetLean - this.leanAngle) * leanLerp;
    }

    this.lateralOffset += this.lateralVelocity * safeDt;
    if (this.lateralOffset > maxLat) {
      this.lateralOffset = maxLat;
      this.lateralVelocity = Math.min(0, this.lateralVelocity);
    } else if (this.lateralOffset < -maxLat) {
      this.lateralOffset = -maxLat;
      this.lateralVelocity = Math.max(0, this.lateralVelocity);
    }

    // 4. Sync 3D bike transform, stopped pose, brake light & invulnerability blink feedback
    const pose = this.syncBikeTransform();

    if (this.bikeGroup) {
      if (invulnRemaining > 0) {
        // ~14 Hz gentle blink during 1.2s post-hit invulnerability
        this.bikeGroup.visible = Math.floor(invulnRemaining * 14) % 2 === 0;
      } else {
        this.bikeGroup.visible = true;
      }
    }

    // 5. Update chase camera + collision shake
    this.updateCamera(safeDt, camera, pose);

    return pose;
  }

  public syncBikeTransform(): PlayerPose {
    const centerX = getRoadCenterX(this.stageId, this.distance);
    const worldX = centerX + this.lateralOffset;
    const worldY = getRoadElevationY(this.stageId, this.distance);
    const worldZ = distanceToWorldZ(this.distance);
    const slope = getRoadSlope(this.stageId, this.distance);
    const tangentYaw = getRoadTangentYaw(this.stageId, this.distance);

    const yaw = tangentYaw + (this.leanAngle / Math.max(0.1, this.bikeSpec.leanMax)) * 0.14;
    const pitch = Math.atan(slope);

    if (this.bikeGroup) {
      this.bikeGroup.position.set(worldX, worldY, worldZ);
      this.bikeGroup.rotation.set(pitch, yaw, this.leanAngle);
    }

    const brakingActive = this.crashState.phase === 'riding' && this.input.brake;
    const stoppedActive = this.crashState.phase === 'riding' && this.speed < 0.5;
    this.brakeLightLit = brakingActive;
    setBikeBrakeLight(this.rigHandles, brakingActive);
    setBikeStoppedPose(this.rigHandles, stoppedActive);

    const displayKmh =
      this.speed < 0.05
        ? 0
        : Math.round((this.speed / this.bikeSpec.maxSpeed) * this.bikeSpec.displayMaxKmh);

    return {
      distance: this.distance,
      lateralOffset: this.lateralOffset,
      worldX,
      worldY,
      worldZ,
      speed: this.speed,
      displayKmh,
      leanAngle: this.leanAngle,
      yaw,
      pitch,
      isBraking: brakingActive
    };
  }

  public snapCamera(camera: THREE.PerspectiveCamera): void {
    const pose = this.syncBikeTransform();
    const prof = this.getStageCameraProfile();
    const backDist = Math.max(0, this.distance - prof.backDist);
    const aheadDist = this.distance + prof.aheadDist;

    this.camX = getRoadCenterX(this.stageId, backDist) + this.lateralOffset * prof.latFollow;
    this.camY = getRoadElevationY(this.stageId, backDist) + prof.camY;
    this.camZ = pose.worldZ + prof.backDist;

    this.camLookX = getRoadCenterX(this.stageId, aheadDist) + this.lateralOffset * (prof.latFollow * 0.58);
    this.camLookY = getRoadElevationY(this.stageId, aheadDist) + 1.18;
    this.camLookZ = distanceToWorldZ(aheadDist);
    this.camRoll = 0;

    this.currentFov = prof.baseFov;
    camera.fov = this.currentFov;
    camera.updateProjectionMatrix();
    camera.up.set(0, 1, 0);
    camera.position.set(this.camX, this.camY, this.camZ);
    camera.lookAt(this.camLookX, this.camLookY, this.camLookZ);
  }

  private updateCamera(
    dt: number,
    camera: THREE.PerspectiveCamera,
    pose: PlayerPose
  ): void {
    const prof = this.getStageCameraProfile();
    const backDist = Math.max(0, this.distance - prof.backDist);
    const aheadDist = this.distance + prof.aheadDist;

    const targetCamX =
      getRoadCenterX(this.stageId, backDist) + this.lateralOffset * prof.latFollow;
    const targetCamY = getRoadElevationY(this.stageId, backDist) + prof.camY;
    const targetCamZ = pose.worldZ + prof.backDist;

    const targetLookX =
      getRoadCenterX(this.stageId, aheadDist) + this.lateralOffset * (prof.latFollow * 0.58);
    const targetLookY = getRoadElevationY(this.stageId, aheadDist) + 1.18;
    const targetLookZ = distanceToWorldZ(aheadDist);

    const posLerp = 1 - Math.exp(-11 * dt);
    const lookLerp = 1 - Math.exp(-13 * dt);

    this.camX += (targetCamX - this.camX) * posLerp;
    this.camY += (targetCamY - this.camY) * posLerp;
    this.camZ += (targetCamZ - this.camZ) * (1 - Math.exp(-24 * dt));

    this.camLookX += (targetLookX - this.camLookX) * lookLerp;
    this.camLookY += (targetLookY - this.camLookY) * lookLerp;
    this.camLookZ += (targetLookZ - this.camLookZ) * (1 - Math.exp(-24 * dt));

    // Gentle FOV widening with speed & wider view on 6-lane avenue
    const speedRatio = Math.max(
      0,
      Math.min(
        1,
        (this.speed - this.bikeSpec.minCruiseSpeed) /
          (this.bikeSpec.maxSpeed - this.bikeSpec.minCruiseSpeed)
      )
    );
    const targetFov = prof.baseFov + (prof.maxFov - prof.baseFov) * speedRatio;
    this.currentFov += (targetFov - this.currentFov) * (1 - Math.exp(-6 * dt));
    if (Math.abs(camera.fov - this.currentFov) > 0.05) {
      camera.fov = this.currentFov;
      camera.updateProjectionMatrix();
    }

    const leanNormalized = this.leanAngle / Math.max(0.1, this.bikeSpec.leanMax);
    const targetRoll = -leanNormalized * 0.055;
    this.camRoll += (targetRoll - this.camRoll) * (1 - Math.exp(-9 * dt));

    // Subtle high-speed vibration & damped collision shake
    this.speedRumbleTime += dt;
    const highSpeedFactor = Math.max(0, (speedRatio - 0.72) / 0.28);
    const rumbleY = Math.sin(this.speedRumbleTime * 48) * 0.012 * highSpeedFactor;

    let shakeOffsetX = 0;
    let shakeOffsetY = 0;
    if (this.shakeTimer > 0) {
      this.shakeTimer = Math.max(0, this.shakeTimer - dt);
      const decay = this.shakeTimer / this.shakeDuration;
      const phase = (this.shakeDuration - this.shakeTimer) * 58;
      shakeOffsetX = Math.sin(phase) * this.shakeStrength * decay;
      shakeOffsetY = Math.cos(phase * 1.37) * this.shakeStrength * 0.65 * decay;
    }

    camera.up.set(Math.sin(this.camRoll), Math.cos(this.camRoll), 0);
    camera.position.set(
      this.camX + shakeOffsetX,
      this.camY + shakeOffsetY + rumbleY,
      this.camZ
    );
    camera.lookAt(
      this.camLookX + shakeOffsetX * 0.4,
      this.camLookY + shakeOffsetY * 0.4,
      this.camLookZ
    );
  }

  private applyCrashRigVisuals(
    visual: CrashVisualSample,
    clampedDist: number
  ): PlayerPose {
    const centerX = getRoadCenterX(this.stageId, clampedDist);
    const worldX = centerX + visual.bikeLateral;
    const worldY = getRoadElevationY(this.stageId, clampedDist);
    const worldZ = distanceToWorldZ(clampedDist);
    const slope = getRoadSlope(this.stageId, clampedDist);
    const tangentYaw = getRoadTangentYaw(this.stageId, clampedDist);
    const pitch = Math.atan(slope);

    if (this.bikeGroup) {
      this.bikeGroup.position.set(worldX, worldY, worldZ);
      this.bikeGroup.rotation.set(pitch, tangentYaw, 0);
    }

    if (this.rigHandles) {
      this.rigHandles.bikeAssembly.rotation.order = 'YXZ';
      this.rigHandles.bikeAssembly.position.set(0, visual.bikeHeightY, 0);
      this.rigHandles.bikeAssembly.rotation.set(0, visual.bikeYawOffset, visual.bikeRoll);

      if (this.rigHandles.seatedRider) {
        this.rigHandles.seatedRider.visible = !visual.useStandingRider;
      }
      if (this.rigHandles.standingRider) {
        this.rigHandles.standingRider.rotation.order = 'YXZ';
        this.rigHandles.standingRider.visible = visual.useStandingRider;
        this.rigHandles.standingRider.position.set(
          visual.riderRelX,
          visual.riderRelY,
          visual.riderRelZ
        );
        if (this.riderRig) {
          // Articulated rider: body orientation & limbs live in the skeleton
          this.rigHandles.standingRider.rotation.set(0, visual.riderYaw, 0);
          this.riderRig.applyPose(visual.riderPose);
          if (this.seatedRig && visual.seatedBlend > 0) {
            const w = visual.seatedBlend;
            const crashBones = this.riderRig.bones;
            const seatBones = this.seatedRig.bones;
            for (const name of Object.keys(crashBones) as Array<keyof typeof crashBones>) {
              if (name === 'pelvis') continue;
              crashBones[name].quaternion.slerp(seatBones[name].quaternion, w);
            }
          }
        } else {
          this.rigHandles.standingRider.rotation.set(
            visual.riderPitch,
            visual.riderYaw,
            visual.riderRoll
          );
        }
      }
    }

    this.brakeLightLit = false;
    setBikeBrakeLight(this.rigHandles, false);
    setBikeStoppedPose(this.rigHandles, false);

    return {
      distance: clampedDist,
      lateralOffset: visual.bikeLateral,
      worldX,
      worldY,
      worldZ,
      speed: 0,
      displayKmh: 0,
      leanAngle: visual.bikeRoll,
      yaw: tangentYaw + visual.bikeYawOffset,
      pitch,
      isBraking: false
    };
  }

  private updateCrashCamera(
    dt: number,
    camera: THREE.PerspectiveCamera,
    visual: CrashVisualSample,
    clampedDist: number
  ): void {
    const backDist = Math.max(0, clampedDist - 5.4);
    const midDist = Math.max(0, clampedDist - visual.riderRelZ * 0.45);
    const midLat = visual.bikeLateral + visual.riderRelX * 0.45;

    const targetCamX =
      getRoadCenterX(this.stageId, backDist) +
      visual.bikeLateral * 0.72 +
      visual.riderRelX * 0.28 +
      this.crashState.fallSide * 0.65;
    const targetCamY = getRoadElevationY(this.stageId, backDist) + 2.48;
    const targetCamZ = distanceToWorldZ(clampedDist) + 5.6;

    const targetLookX = getRoadCenterX(this.stageId, midDist) + midLat;
    const targetLookY =
      getRoadElevationY(this.stageId, midDist) + 0.78 + visual.riderRelY * 0.35;
    const targetLookZ = distanceToWorldZ(clampedDist) + visual.riderRelZ * 0.45;

    const posLerp = 1 - Math.exp(-8 * dt);
    const lookLerp = 1 - Math.exp(-10 * dt);

    this.camX += (targetCamX - this.camX) * posLerp;
    this.camY += (targetCamY - this.camY) * posLerp;
    this.camZ += (targetCamZ - this.camZ) * posLerp;

    this.camLookX += (targetLookX - this.camLookX) * lookLerp;
    this.camLookY += (targetLookY - this.camLookY) * lookLerp;
    this.camLookZ += (targetLookZ - this.camLookZ) * lookLerp;

    this.currentFov += (BASE_CAMERA_FOV - this.currentFov) * (1 - Math.exp(-6 * dt));
    if (Math.abs(camera.fov - this.currentFov) > 0.05) {
      camera.fov = this.currentFov;
      camera.updateProjectionMatrix();
    }

    this.camRoll += (0 - this.camRoll) * (1 - Math.exp(-8 * dt));

    let shakeOffsetX = 0;
    let shakeOffsetY = 0;
    if (this.shakeTimer > 0) {
      this.shakeTimer = Math.max(0, this.shakeTimer - dt);
      const decay = this.shakeTimer / Math.max(0.05, this.shakeDuration);
      const phase = (this.shakeDuration - this.shakeTimer) * 58;
      shakeOffsetX = Math.sin(phase) * this.shakeStrength * decay;
      shakeOffsetY = Math.cos(phase * 1.37) * this.shakeStrength * 0.65 * decay;
    }

    camera.up.set(Math.sin(this.camRoll), Math.cos(this.camRoll), 0);
    camera.position.set(this.camX + shakeOffsetX, this.camY + shakeOffsetY, this.camZ);
    camera.lookAt(
      this.camLookX + shakeOffsetX * 0.35,
      this.camLookY + shakeOffsetY * 0.35,
      this.camLookZ
    );
  }

  public getPose(): PlayerPose {
    return this.syncBikeTransform();
  }

  public getBikeId(): BikeId {
    return this.bikeId;
  }

  public getDistance(): number {
    return this.distance;
  }

  public setDistanceForDebug(
    distance: number,
    stageLength: number,
    camera: THREE.PerspectiveCamera
  ): PlayerPose {
    this.distance = Math.max(0, Math.min(stageLength, distance));
    const pose = this.syncBikeTransform();
    this.snapCamera(camera);
    return pose;
  }
}
