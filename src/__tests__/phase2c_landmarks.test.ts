import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { getStageSpec, type DestinationKey, type StageId } from '../config/gameConfig.ts';
import {
  distanceToWorldZ,
  getRoadCenterX,
  getRoadElevationY
} from '../core/roadMath.ts';
import { buildHanoiLandmarks } from '../world/hanoiLandmarks.ts';
import {
  DESTINATION_LANDMARK_MANIFEST,
  disposeLandmarkObject
} from '../world/landmarkLoader.ts';

describe('Phase 2.0C — All 9 Destination Landmark GLB Manifest, FinishHologram & Streaming Integration', () => {
  it('registers all 9 DestinationKeys in DESTINATION_LANDMARK_MANIFEST with preserveGroundOriginY on stages 4..9', () => {
    const ch1Keys: DestinationKey[] = ['my_dinh', 'quan_su', 'vinuni'];
    const ch23Keys: DestinationKey[] = [
      'nha_hat_lon',
      'lang_bac',
      'cot_co',
      'nha_tho_lon',
      'ho_hoan_kiem',
      'ga_ha_noi'
    ];

    for (const key of ch1Keys) {
      const cfg = DESTINATION_LANDMARK_MANIFEST[key];
      expect(cfg).toBeDefined();
      expect(cfg!.key).toBe(key);
      expect(cfg!.path).toMatch(/^\/assets\/landmarks\/.+\.glb$/);
      expect(cfg!.targetWidth).toBeGreaterThan(0);
      expect(cfg!.offsetAhead).toBeGreaterThan(0);
    }

    for (const key of ch23Keys) {
      const cfg = DESTINATION_LANDMARK_MANIFEST[key];
      expect(cfg).toBeDefined();
      expect(cfg!.key).toBe(key);
      expect(cfg!.path).toMatch(/^\/assets\/landmarks\/.+\.glb$/);
      expect(cfg!.targetWidth).toBeGreaterThan(0);
      expect(cfg!.offsetAhead).toBeGreaterThan(0);
      expect(cfg!.preserveGroundOriginY).toBe(true);
    }
  });

  it('builds a transparent see-through FinishHologram (no opaque arch blocking landmarks) across stages', () => {
    const sampleStages: StageId[] = [1, 4, 8, 9];
    for (const stageId of sampleStages) {
      const stage = getStageSpec(stageId);
      const built = buildHanoiLandmarks(stageId);

      const hologram = built.group.getObjectByName('FinishHologram');
      expect(hologram).toBeDefined();
      expect(hologram?.userData.isFinishHologram).toBe(true);

      let meshCount = 0;
      hologram?.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh) return;
        meshCount += 1;
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const mat of mats) {
          expect(mat.transparent).toBe(true);
          expect(mat.depthWrite).toBe(false);
        }
      });
      expect(meshCount).toBeGreaterThan(0);

      // Far from finish: hidden; near finish: visible
      built.update(0, 0);
      expect(hologram?.visible).toBe(false);
      built.update(stage.length - 450, 1.2);
      expect(hologram?.visible).toBe(true);

      expect(() => built.dispose()).not.toThrow();
    }
  });

  it('attaches hero GLB cleanly ahead of stage finish on stages 1..9, hides procedural fallback, and disposes cleanly', () => {
    const cases: Array<{ stageId: StageId; key: DestinationKey }> = [
      { stageId: 1, key: 'my_dinh' },
      { stageId: 2, key: 'quan_su' },
      { stageId: 3, key: 'vinuni' },
      { stageId: 4, key: 'nha_hat_lon' },
      { stageId: 8, key: 'ho_hoan_kiem' },
      { stageId: 9, key: 'ga_ha_noi' }
    ];

    for (const { stageId, key } of cases) {
      const stage = getStageSpec(stageId);
      const cfg = DESTINATION_LANDMARK_MANIFEST[key]!;
      const built = buildHanoiLandmarks(stageId);

      expect(built.getStreamingStats().heroGlbLoaded).toBe(false);

      const mockGeo = new THREE.BoxGeometry(10, 10, 10);
      const mockMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
      const geoDisposeSpy = vi.spyOn(mockGeo, 'dispose');
      const matDisposeSpy = vi.spyOn(mockMat, 'dispose');

      const mockGroup = new THREE.Group();
      mockGroup.name = `Mock_${key}`;
      mockGroup.add(new THREE.Mesh(mockGeo, mockMat));

      built.setHeroGlb(mockGroup, cfg);
      expect(built.getStreamingStats().heroGlbLoaded).toBe(true);

      // Verify procedural sibling(s) inside heroGroup were hidden and mockGroup was positioned ahead of stage.length
      const heroGroup = mockGroup.parent;
      expect(heroGroup).not.toBeNull();
      const nonGlbSiblings = heroGroup!.children.filter((c) => c !== mockGroup);
      expect(nonGlbSiblings.length).toBeGreaterThan(0);
      for (const sibling of nonGlbSiblings) {
        expect(sibling.visible).toBe(false);
      }

      const expectedDist = stage.length + cfg.offsetAhead;
      expect(mockGroup.position.x).toBeCloseTo(getRoadCenterX(stageId, expectedDist), 5);
      expect(mockGroup.position.y).toBeCloseTo(getRoadElevationY(stageId, expectedDist), 5);
      expect(mockGroup.position.z).toBeCloseTo(distanceToWorldZ(expectedDist), 5);

      // Verify nearFinish window reveals heroGroup cleanly
      built.update(stage.length - 450, 0);
      expect(heroGroup!.visible).toBe(true);

      // Dispose cleans up attached GLB & all tracked resources without throwing
      expect(() => built.dispose()).not.toThrow();
      expect(geoDisposeSpy).toHaveBeenCalledTimes(1);
      expect(matDisposeSpy).toHaveBeenCalledTimes(1);
    }
  });

  it('disposeLandmarkObject disposes geometry, materials, and textures safely without throwing', () => {
    expect(() => disposeLandmarkObject(null)).not.toThrow();
    expect(() => disposeLandmarkObject(undefined)).not.toThrow();

    const tex = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, THREE.RGBAFormat);
    const geo = new THREE.BoxGeometry(2, 2, 2);
    const mat = new THREE.MeshStandardMaterial({ map: tex });
    const mesh = new THREE.Mesh(geo, mat);
    const root = new THREE.Group();
    root.add(mesh);

    const geoSpy = vi.spyOn(geo, 'dispose');
    const matSpy = vi.spyOn(mat, 'dispose');
    const texSpy = vi.spyOn(tex, 'dispose');

    expect(() => disposeLandmarkObject(root)).not.toThrow();
    expect(geoSpy).toHaveBeenCalledTimes(1);
    expect(matSpy).toHaveBeenCalledTimes(1);
    expect(texSpy).toHaveBeenCalledTimes(1);
  });
});
