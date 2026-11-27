import * as THREE from 'three';
import {
  getStageAtmosphere,
  type StageAtmosphere
} from '../config/artPalette.ts';
import { getStageSpec, type StageId } from '../config/gameConfig.ts';
import {
  distanceToWorldZ,
  getRoadCenterX,
  getRoadElevationY
} from '../core/roadMath.ts';
import { buildHanoiLandmarks, type LandmarksBuildResult } from './hanoiLandmarks.ts';
import {
  buildHanoiRoad,
  type RoadBuildResult,
  type RoadStreamingStats
} from './hanoiRoad.ts';
import { createHanoiEnvMap } from './environmentMap.ts';
import {
  disposeLandmarkLoaderWorkers,
  disposeLandmarkObject,
  loadDestinationLandmarkGlb
} from './landmarkLoader.ts';

function createRetroSkyTexture(atmo: StageAtmosphere): THREE.Texture {
  if (typeof document === 'undefined') {
    const tex = new THREE.DataTexture(new Uint8Array([180, 175, 165, 255]), 1, 1, THREE.RGBAFormat);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  }
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const topCol = `#${atmo.skyTop.toString(16).padStart(6, '0')}`;
    const horizonCol = `#${atmo.skyHorizon.toString(16).padStart(6, '0')}`;
    const fogCol = `#${atmo.fogColor.toString(16).padStart(6, '0')}`;

    const grad = ctx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0.0, topCol);
    grad.addColorStop(0.28, topCol);
    grad.addColorStop(0.47, horizonCol);
    grad.addColorStop(0.57, fogCol);
    grad.addColorStop(1.0, fogCol);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 256);

    // Layered late-afternoon Hanoi clouds with warm undersides
    ctx.fillStyle = 'rgba(255, 246, 228, 0.24)';
    for (const [cx, cy, rx, ry] of [
      [76, 54, 58, 11],
      [198, 42, 74, 14],
      [338, 62, 62, 12],
      [446, 48, 52, 10],
      [140, 82, 46, 9],
      [392, 84, 54, 9]
    ]) {
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Glowing afternoon sun halo near upper-left horizon
    const sunGrad = ctx.createRadialGradient(176, 106, 6, 176, 106, 92);
    sunGrad.addColorStop(0.0, 'rgba(255, 248, 218, 0.96)');
    sunGrad.addColorStop(0.22, 'rgba(255, 224, 158, 0.58)');
    sunGrad.addColorStop(1.0, 'rgba(255, 224, 158, 0.0)');
    ctx.fillStyle = sunGrad;
    ctx.fillRect(0, 0, 512, 256);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export interface WorldStreamingStats {
  stageId: StageId | null;
  road: RoadStreamingStats | null;
  landmarks: {
    activeSceneryChunks: number;
    drawCallObjects: number;
    heroGlbLoaded: boolean;
  } | null;
}

/**
 * Facade managing stage scenery, streaming road geometry, landmarks, golden-hour lighting,
 * PMREM environment map, sky dome, and tight shadow tracking for Hanoi Shipper 3D Retro.
 */
export class HanoiWorldManager {
  private readonly scene: THREE.Scene;
  private readonly renderer?: THREE.WebGLRenderer;
  private stageId: StageId | null = null;
  private stageBuildToken = 0;
  private elapsedTime = 0;
  private lastPlayerDistance = 0;

  private roadBuild: RoadBuildResult | null = null;
  private landmarksBuild: LandmarksBuildResult | null = null;

  private skyDome: THREE.Mesh | null = null;
  private skyTex: THREE.Texture | null = null;
  private envMap: THREE.Texture | null = null;

  private hemiLight: THREE.HemisphereLight | null = null;
  private sunLight: THREE.DirectionalLight | null = null;
  private fillLight: THREE.DirectionalLight | null = null;
  private sunOffset = new THREE.Vector3(-28, 24, -24);

  constructor(scene: THREE.Scene, renderer?: THREE.WebGLRenderer) {
    this.scene = scene;
    this.renderer = renderer;
  }

  public getStageId(): StageId | null {
    return this.stageId;
  }

  public setMenuLighting(isMenu: boolean): void {
    if (!this.fillLight) return;
    if (isMenu) {
      this.fillLight.color.setHex(0xffe6bd);
      this.fillLight.intensity = 0.95;
    } else {
      this.fillLight.color.setHex(0xc8d9e8);
      this.fillLight.intensity = 0.34;
    }
  }

  public triggerCameraFlash(cameraId: number): void {
    this.roadBuild?.triggerCameraFlash(cameraId);
  }

  public getStreamingStats(): WorldStreamingStats {
    return {
      stageId: this.stageId,
      road: this.roadBuild?.getStreamingStats() ?? null,
      landmarks: this.landmarksBuild?.getStreamingStats?.() ?? null
    };
  }

  public buildStage(stageId: StageId): void {
    this.disposeStage();

    this.stageId = stageId;
    this.elapsedTime = 0;
    this.lastPlayerDistance = 0;
    const buildToken = this.stageBuildToken;

    const stage = getStageSpec(stageId);
    const atmo = getStageAtmosphere(stageId);
    this.scene.background = new THREE.Color(atmo.skyHorizon);
    const fogDensity =
      stage.theme === 'tree_boulevard'
        ? 0.0049
        : stage.theme === 'old_quarter'
          ? 0.0048
          : 0.0042;
    this.scene.fog = new THREE.FogExp2(atmo.fogColor, fogDensity);

    if (this.renderer) {
      this.envMap = createHanoiEnvMap(this.renderer, atmo);
      this.scene.environment = this.envMap;
    }

    // 1. Sky Dome
    this.skyTex = createRetroSkyTexture(atmo);
    const skyGeo = new THREE.SphereGeometry(310, 24, 14);
    const skyMat = new THREE.MeshBasicMaterial({
      map: this.skyTex,
      side: THREE.BackSide,
      fog: false,
      depthWrite: false
    });
    this.skyDome = new THREE.Mesh(skyGeo, skyMat);
    this.skyDome.rotation.y = Math.PI * 0.45;
    this.scene.add(this.skyDome);

    // 2. Contrast-Rich Golden-Hour Lighting (balanced ambient so shadows stay crisp)
    this.hemiLight = new THREE.HemisphereLight(
      atmo.skyTop,
      stage.theme === 'tree_boulevard' ? 0x3b4d31 : 0x594a3c,
      atmo.ambientIntensity
    );
    this.scene.add(this.hemiLight);

    const elevRad = THREE.MathUtils.degToRad(atmo.sunElevation);
    const dist = 48;
    this.sunOffset.set(
      -Math.cos(elevRad) * dist * 0.72,
      Math.sin(elevRad) * dist,
      -Math.cos(elevRad) * dist * 0.68
    );

    this.sunLight = new THREE.DirectionalLight(atmo.sunColor, atmo.sunIntensity);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(2048, 2048);
    this.sunLight.shadow.camera.near = 4;
    this.sunLight.shadow.camera.far = 125;
    const d = stage.laneCount === 6 ? 28 : 22;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = -0.0004;
    this.sunLight.shadow.normalBias = 0.035;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    // Subtle cool sky bounce during gameplay (never washes out key shadows)
    this.fillLight = new THREE.DirectionalLight(0xc8d9e8, 0.34);
    this.fillLight.position.set(18, 16, 28);
    this.scene.add(this.fillLight);
    this.scene.add(this.fillLight.target);

    // 3. Streaming Road & Landmarks
    this.roadBuild = buildHanoiRoad(stageId);
    this.scene.add(this.roadBuild.group);

    this.landmarksBuild = buildHanoiLandmarks(stageId);
    this.scene.add(this.landmarksBuild.group);

    this.update(0, 0);

    void loadDestinationLandmarkGlb(stage.destinationKey)
      .then((loaded) => {
        if (!loaded) return;
        if (
          buildToken !== this.stageBuildToken ||
          this.stageId !== stageId ||
          !this.landmarksBuild
        ) {
          disposeLandmarkObject(loaded.group);
          return;
        }
        this.landmarksBuild.setHeroGlb(loaded.group, loaded.config);
        this.landmarksBuild.update(this.lastPlayerDistance, this.elapsedTime);
      })
      .catch((err) => {
        console.warn(`[worldManager] Hero GLB attach failed for ${stage.destinationKey}:`, err);
      });
  }

  public update(playerDistance: number, dt: number, trafficElapsedTime?: number): void {
    if (this.stageId === null) return;
    this.elapsedTime += Math.max(0, dt);
    const signalTime = trafficElapsedTime ?? this.elapsedTime;

    const safeDist = Math.max(0, playerDistance);
    this.lastPlayerDistance = safeDist;
    const focusDist = safeDist + 16;
    const fx = getRoadCenterX(this.stageId, focusDist);
    const fy = getRoadElevationY(this.stageId, focusDist);
    const fz = distanceToWorldZ(focusDist);

    if (this.sunLight) {
      this.sunLight.target.position.set(fx, fy, fz);
      this.sunLight.target.updateMatrixWorld();
      this.sunLight.position.set(
        fx + this.sunOffset.x,
        fy + this.sunOffset.y,
        fz + this.sunOffset.z
      );
    }

    if (this.fillLight) {
      this.fillLight.target.position.set(fx, fy, fz);
      this.fillLight.target.updateMatrixWorld();
      this.fillLight.position.set(fx + 16, fy + 14, fz + 28);
    }

    if (this.skyDome) {
      this.skyDome.position.set(fx, fy, fz);
    }

    if (this.roadBuild) {
      this.roadBuild.update(safeDist, signalTime, dt);
    }

    if (this.landmarksBuild) {
      this.landmarksBuild.update(safeDist, this.elapsedTime);
    }
  }

  public disposeStage(): void {
    this.stageBuildToken += 1;

    if (this.roadBuild) {
      this.scene.remove(this.roadBuild.group);
      this.roadBuild.dispose();
      this.roadBuild = null;
    }

    if (this.landmarksBuild) {
      this.scene.remove(this.landmarksBuild.group);
      this.landmarksBuild.dispose();
      this.landmarksBuild = null;
    }

    if (this.skyDome) {
      this.scene.remove(this.skyDome);
      this.skyDome.geometry.dispose();
      (this.skyDome.material as THREE.Material).dispose();
      this.skyDome = null;
    }
    if (this.skyTex) {
      this.skyTex.dispose();
      this.skyTex = null;
    }
    if (this.envMap) {
      this.scene.environment = null;
      this.envMap.dispose();
      this.envMap = null;
    }

    if (this.hemiLight) {
      this.scene.remove(this.hemiLight);
      this.hemiLight.dispose();
      this.hemiLight = null;
    }
    if (this.sunLight) {
      this.scene.remove(this.sunLight.target);
      this.scene.remove(this.sunLight);
      this.sunLight.dispose();
      this.sunLight = null;
    }
    if (this.fillLight) {
      this.scene.remove(this.fillLight.target);
      this.scene.remove(this.fillLight);
      this.fillLight.dispose();
      this.fillLight = null;
    }

    this.stageId = null;
  }

  public dispose(): void {
    this.disposeStage();
    disposeLandmarkLoaderWorkers();
  }
}
