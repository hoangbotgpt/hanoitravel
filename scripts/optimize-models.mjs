import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const OUTPUT_DIR = path.join(ROOT_DIR, 'public', 'assets', 'models');
const MAX_TEXTURE_DIM = 512;
const MAX_TOTAL_BYTES = 8 * 1024 * 1024; // 8 MB hard budget

const MODELS = [
  {
    name: 'honda',
    inputRelPath: path.join('Models', 'honda.glb'),
    outputFilename: 'honda.glb',
    simplifyRatio: null,
    simplifyError: null
  },
  {
    name: 'vinfast',
    // Models/vinfast2 replaces the original scooter (sharper, cleaner topology).
    inputRelPath: path.join('Models', 'vinfast2', 'model.glb'),
    outputFilename: 'vinfast.glb',
    simplifyRatio: 0.07,
    simplifyError: 0.02,
    // Normals are re-creased at load time (bikeLoader) and the 4K normal map is dropped:
    // it no longer matches the decimated surface and only produced shimmering noise.
    dropNormalMap: true,
    maxTextureDim: 1024
  },
  {
    name: 'driver',
    inputRelPath: path.join('Models', 'driver.glb'),
    outputFilename: 'driver.glb',
    simplifyRatio: null,
    simplifyError: null
  }
];

function countDocumentTriangles(doc) {
  let tris = 0;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const indices = prim.getIndices();
      const pos = prim.getAttribute('POSITION');
      if (indices) {
        tris += indices.getCount() / 3;
      } else if (pos) {
        tris += pos.getCount() / 3;
      }
    }
  }
  return Math.round(tris);
}

/**
 * Rebuilds smooth area-weighted vertex normals on an indexed primitive
 * without unwelding shared vertices.
 */
function recomputeSmoothNormals(doc, prim) {
  const posAttr = prim.getAttribute('POSITION');
  const idxAttr = prim.getIndices();
  if (!posAttr || !idxAttr) return;

  const pos = posAttr.getArray();
  const idx = idxAttr.getArray();
  const vertCount = posAttr.getCount();
  const norm = new Float32Array(vertCount * 3);

  for (let i = 0; i < idx.length; i += 3) {
    const ia = idx[i] * 3;
    const ib = idx[i + 1] * 3;
    const ic = idx[i + 2] * 3;

    const abx = pos[ib] - pos[ia];
    const aby = pos[ib + 1] - pos[ia + 1];
    const abz = pos[ib + 2] - pos[ia + 2];

    const acx = pos[ic] - pos[ia];
    const acy = pos[ic + 1] - pos[ia + 1];
    const acz = pos[ic + 2] - pos[ia + 2];

    const nx = aby * acz - abz * acy;
    const ny = abz * acx - abx * acz;
    const nz = abx * acy - aby * acx;

    norm[ia] += nx;
    norm[ia + 1] += ny;
    norm[ia + 2] += nz;
    norm[ib] += nx;
    norm[ib + 1] += ny;
    norm[ib + 2] += nz;
    norm[ic] += nx;
    norm[ic + 1] += ny;
    norm[ic + 2] += nz;
  }

  for (let v = 0; v < vertCount; v++) {
    const o = v * 3;
    const x = norm[o];
    const y = norm[o + 1];
    const z = norm[o + 2];
    const len = Math.hypot(x, y, z);
    if (len > 1e-8) {
      norm[o] = x / len;
      norm[o + 1] = y / len;
      norm[o + 2] = z / len;
    } else {
      norm[o] = 0;
      norm[o + 1] = 1;
      norm[o + 2] = 0;
    }
  }

  const buffer = doc.getRoot().listBuffers()[0] ?? doc.createBuffer();
  const normAccessor = doc
    .createAccessor('NORMAL')
    .setType('VEC3')
    .setArray(norm)
    .setBuffer(buffer);
  prim.setAttribute('NORMAL', normAccessor);
}

async function runMeshPhase() {
  const { dedup, prune, simplify, weld } = await import('@gltf-transform/functions');
  const { MeshoptSimplifier } = await import('meshoptimizer');
  await MeshoptSimplifier.ready;
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const meshReport = [];

  for (const spec of MODELS) {
    const inputPath = path.join(ROOT_DIR, spec.inputRelPath);
    const tempPath = path.join(OUTPUT_DIR, `${spec.name}.mesh.tmp.glb`);
    if (!fs.existsSync(inputPath)) {
      throw new Error(`Missing source model: ${inputPath}`);
    }

    const doc = await io.read(inputPath);
    const srcBytes = fs.statSync(inputPath).size;
    const srcTris = countDocumentTriangles(doc);

    if (spec.dropNormalMap) {
      for (const mat of doc.getRoot().listMaterials()) {
        const tex = mat.getNormalTexture();
        mat.setNormalTexture(null);
        if (tex) tex.dispose();
      }
    }

    if (spec.simplifyRatio !== null && spec.keepNormals) {
      // Keep the authored normals so hard edges stay crisp (no smoothing noise).
      await doc.transform(
        dedup(),
        weld(),
        simplify({
          simplifier: MeshoptSimplifier,
          ratio: spec.simplifyRatio,
          error: spec.simplifyError
        }),
        prune()
      );
    } else if (spec.simplifyRatio !== null) {
      // Strip split vertex normals before weld+simplify so UV seam-free geometry
      // can decimate cleanly into the 10k-18k triangle budget, then rebuild smooth normals.
      for (const mesh of doc.getRoot().listMeshes()) {
        for (const prim of mesh.listPrimitives()) {
          prim.setAttribute('NORMAL', null);
        }
      }
      await doc.transform(
        dedup(),
        weld(),
        simplify({
          simplifier: MeshoptSimplifier,
          ratio: spec.simplifyRatio,
          error: spec.simplifyError
        }),
        prune()
      );
      for (const mesh of doc.getRoot().listMeshes()) {
        for (const prim of mesh.listPrimitives()) {
          recomputeSmoothNormals(doc, prim);
        }
      }
    } else {
      await doc.transform(dedup(), weld(), prune());
    }

    await io.write(tempPath, doc);

    const dstTris = countDocumentTriangles(doc);
    meshReport.push({ name: spec.name, srcBytes, srcTris, dstTris });
  }

  // Run texture compression in an isolated child process so sharp@0.33 and
  // @gltf-transform/functions' nested sharp never load conflicting libvips DLLs.
  execFileSync(process.execPath, [__filename, '--phase=textures'], {
    stdio: 'inherit'
  });

  let totalBytes = 0;
  for (const entry of meshReport) {
    const finalPath = path.join(OUTPUT_DIR, `${entry.name}.glb`);
    const dstBytes = fs.statSync(finalPath).size;
    totalBytes += dstBytes;
    const srcMb = (entry.srcBytes / (1024 * 1024)).toFixed(2);
    const dstKb = (dstBytes / 1024).toFixed(1);
    console.log(
      `[optimize-models] ${entry.name}: ${entry.srcTris} -> ${entry.dstTris} tris | ${srcMb} MB -> ${dstKb} KB (${finalPath})`
    );
  }

  const totalMb = (totalBytes / (1024 * 1024)).toFixed(2);
  console.log(
    `[optimize-models] Total output size: ${totalBytes} bytes (${totalMb} MB / limit 8.00 MB)`
  );

  if (totalBytes > MAX_TOTAL_BYTES) {
    throw new Error(
      `Optimized models exceed 8 MB budget: ${totalBytes} > ${MAX_TOTAL_BYTES}`
    );
  }
}

async function runTexturesPhase() {
  const { default: sharp } = await import('sharp');
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

  for (const spec of MODELS) {
    const tempPath = path.join(OUTPUT_DIR, `${spec.name}.mesh.tmp.glb`);
    const finalPath = path.join(OUTPUT_DIR, spec.outputFilename);
    const doc = await io.read(tempPath);

    for (const texture of doc.getRoot().listTextures()) {
      const srcImage = texture.getImage();
      if (!srcImage) continue;

      const isNormal = texture.getName().toLowerCase().includes('normal');
      const srcBuf = Buffer.from(srcImage);
      const dim = spec.maxTextureDim ?? MAX_TEXTURE_DIM;
      const resized = sharp(srcBuf).resize(dim, dim, {
        fit: 'inside',
        withoutEnlargement: true
      });

      if (isNormal) {
        const outBuf = await resized
          .png({ compressionLevel: 9, effort: 10 })
          .toBuffer();
        texture.setImage(new Uint8Array(outBuf)).setMimeType('image/png');
      } else {
        const outBuf = await resized
          .jpeg({ quality: 86, mozjpeg: true })
          .toBuffer();
        const uri = texture.getURI();
        if (uri) {
          texture.setURI(uri.replace(/\.(png|webp|jpeg|jpg)$/i, '.jpg'));
        }
        texture.setImage(new Uint8Array(outBuf)).setMimeType('image/jpeg');
      }
    }

    await io.write(finalPath, doc);
    fs.rmSync(tempPath, { force: true });
  }
}

const isTexturesPhase = process.argv.includes('--phase=textures');
(isTexturesPhase ? runTexturesPhase() : runMeshPhase()).catch((err) => {
  console.error('[optimize-models] Failed:', err);
  process.exit(1);
});
