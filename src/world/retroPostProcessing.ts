import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

const RetroHanoiFilmShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uGrainIntensity: { value: 0.024 },
    uVignetteStrength: { value: 0.34 },
    uWarmth: { value: 0.12 },
    uDamageFlash: { value: 0.0 }
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uGrainIntensity;
    uniform float uVignetteStrength;
    uniform float uWarmth;
    uniform float uDamageFlash;
    varying vec2 vUv;

    float rand2(vec2 co) {
      return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
      vec4 base = texture2D(tDiffuse, vUv);
      vec3 col = base.rgb;

      // Filmic postcard warm grading (subtle golden highlights & warm espresso lift in shadows)
      float luma = dot(col, vec3(0.299, 0.587, 0.114));
      vec3 warmTint = vec3(1.0 + uWarmth * 0.42, 1.0 + uWarmth * 0.16, 1.0 - uWarmth * 0.35);
      col = mix(col, col * warmTint, 0.62);

      // Gentle radial vignette keeping road center crisp
      vec2 centered = vUv - 0.5;
      float dist = dot(centered, centered) * 2.2;
      float vig = smoothstep(0.22, 1.25, dist);
      col *= 1.0 - vig * uVignetteStrength;

      // Red impact flash around peripheral edges during collision
      if (uDamageFlash > 0.001) {
        float edgeMask = smoothstep(0.18, 0.92, dist);
        col = mix(col, vec3(0.92, 0.16, 0.12), edgeMask * clamp(uDamageFlash, 0.0, 1.0) * 0.68);
      }

      // Fine retro 35mm film grain
      float grain = (rand2(vUv * vec2(1280.0, 720.0) + fract(uTime * 17.3)) - 0.5) * uGrainIntensity;
      col += grain * (0.4 + 0.6 * luma);

      gl_FragColor = vec4(clamp(col, 0.0, 1.0), base.a);
    }
  `
};

/**
 * Hanoi Postcard Retro Post-Processing Pipeline:
 * RenderPass -> subtle UnrealBloomPass -> RetroHanoiFilmShader -> OutputPass.
 * Supports toggling off cleanly for lower-end devices.
 */
export class RetroPostPipeline {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly composer: EffectComposer;
  private readonly renderPass: RenderPass;
  private readonly bloomPass: UnrealBloomPass;
  private readonly filmPass: ShaderPass;
  private readonly outputPass: OutputPass;

  private enabled = true;
  private elapsedTime = 0;
  private damageFlash = 0;

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera
  ) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;

    const width = Math.max(1, window.innerWidth);
    const height = Math.max(1, window.innerHeight);

    this.composer = new EffectComposer(renderer);
    this.renderPass = new RenderPass(scene, camera);
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(Math.floor(width * 0.5), Math.floor(height * 0.5)),
      0.2,
      0.42,
      0.88
    );
    this.filmPass = new ShaderPass(RetroHanoiFilmShader);
    this.outputPass = new OutputPass();

    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(this.filmPass);
    this.composer.addPass(this.outputPass);
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  public triggerDamageFlash(strength = 1.0): void {
    this.damageFlash = Math.max(this.damageFlash, Math.min(1, strength));
  }

  public getDamageFlash(): number {
    return this.damageFlash;
  }

  public setSize(width: number, height: number, pixelRatio: number): void {
    const safeW = Math.max(1, Math.floor(width));
    const safeH = Math.max(1, Math.floor(height));
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(safeW, safeH);
    this.bloomPass.setSize(Math.max(1, Math.floor(safeW * 0.5)), Math.max(1, Math.floor(safeH * 0.5)));
  }

  public render(dt: number): void {
    const safeDt = Math.max(0, Math.min(0.05, dt));
    this.elapsedTime += safeDt;
    if (this.damageFlash > 0) {
      this.damageFlash = Math.max(0, this.damageFlash - safeDt * 2.8);
    }

    if (!this.enabled) {
      this.renderer.render(this.scene, this.camera);
      return;
    }

    this.filmPass.uniforms.uTime.value = this.elapsedTime;
    this.filmPass.uniforms.uDamageFlash.value = this.damageFlash;
    this.composer.render();
  }

  public dispose(): void {
    this.bloomPass.dispose();
    this.composer.dispose();
  }
}
