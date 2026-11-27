import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PNG } from 'pngjs';

// The baked terrain atlases have missing texels encoded as black. Extend the
// nearest valid color into each gap without changing the rest of the atlas.
function fillMissingPixels({ width, height, data }) {
  const count = width * height;
  const queue = new Uint32Array(count);
  const seen = new Uint8Array(count);
  let next = 0;
  for (let i = 0; i < count; i++) {
    const p = i * 4;
    if (Math.max(data[p], data[p + 1], data[p + 2]) <= 2) continue;
    seen[i] = 1;
    queue[next++] = i;
  }
  if (next === 0 || next === count) return false;
  const copy = (to, from) => {
    if (seen[to]) return;
    seen[to] = 1;
    data.copyWithin(to * 4, from * 4, from * 4 + 4);
    queue[next++] = to;
  };
  for (let head = 0; head < next; head++) {
    const i = queue[head];
    if (i % width > 0) copy(i - 1, i);
    if (i % width < width - 1) copy(i + 1, i);
    if (i >= width) copy(i - width, i);
    if (i < count - width) copy(i + width, i);
  }
  return true;
}

export function repairTerrainTexture(glb) {
  const jsonLength = glb.readUInt32LE(12);
  const doc = JSON.parse(glb.toString('utf8', 20, 20 + jsonLength));
  // The terrain exporter embeds a single RGB atlas. World objects keep their
  // authored materials and alpha, so this operates only on the terrain files.
  const view = doc.bufferViews[doc.images[0].bufferView];
  const offset = view.byteOffset ?? 0;
  const binary = glb.subarray(28 + jsonLength);
  const png = PNG.sync.read(binary.subarray(offset, offset + view.byteLength));
  if (!fillMissingPixels(png)) return glb;
  const pixels = PNG.sync.write(png, { colorType: 2 });
  const align = n => Math.ceil(n / 4) * 4;
  const oldEnd = offset + align(view.byteLength);
  const delta = align(pixels.length) - align(view.byteLength);
  view.byteLength = pixels.length;
  for (const entry of doc.bufferViews) {
    if (entry.byteOffset >= oldEnd) entry.byteOffset += delta;
  }
  doc.buffers[0].byteLength += delta;
  const json = Buffer.from(JSON.stringify(doc));
  const jsonPadding = Buffer.alloc(align(json.length) - json.length, 32);
  const binaryPadding = Buffer.alloc(align(pixels.length) - pixels.length);
  const header = Buffer.from(glb.subarray(0, 20));
  const binaryHeader = Buffer.from(glb.subarray(20 + jsonLength, 28 + jsonLength));
  header.writeUInt32LE(28 + json.length + jsonPadding.length + binary.length + delta, 8);
  header.writeUInt32LE(json.length + jsonPadding.length, 12);
  binaryHeader.writeUInt32LE(binary.length + delta, 0);
  return Buffer.concat([header, json, jsonPadding, binaryHeader, binary.subarray(0, offset), pixels, binaryPadding, binary.subarray(oldEnd)]);
}

export function terrainTextures() {
  const tilesPath = 'mugroup/mundo/tiles';
  const originals = new URL(`../../public/${tilesPath}/`, import.meta.url);
  const cache = new Map();
  const getTile = id => {
    if (!cache.has(id)) cache.set(id, repairTerrainTexture(readFileSync(new URL(`${id}/terrain.glb`, originals))));
    return cache.get(id);
  };
  return {
    name: 'repair-terrain-textures',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = req.url?.split('?')[0];
        const tile = path?.match(/\/mugroup\/mundo\/tiles\/(\d+_\d+)\/terrain\.glb$/);
        if (!tile || !['GET', 'HEAD'].includes(req.method)) return next();
        try {
          const asset = getTile(tile[1]);
          res.setHeader('Content-Type', 'model/gltf-binary');
          res.setHeader('Content-Length', asset.length);
          res.end(req.method === 'HEAD' ? undefined : asset);
        } catch (error) {
          if (error.code === 'ENOENT') return next();
          next(error);
        }
      });
    },
    writeBundle(options) {
      // Replace the copied terrain before Workbox calculates revision hashes.
      for (const id of readdirSync(originals).filter(name => /^\d+_\d+$/.test(name))) {
        writeFileSync(resolve(options.dir, tilesPath, id, 'terrain.glb'), getTile(id));
      }
    },
  };
}
