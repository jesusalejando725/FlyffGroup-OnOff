import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { PNG } from 'pngjs';

function inspect(glb) {
  const jsonLength = glb.readUInt32LE(12);
  assert.equal(glb.readUInt32LE(8), glb.length);
  const doc = JSON.parse(glb.toString('utf8', 20, 20 + jsonLength));
  const buffer = glb.subarray(28 + jsonLength);
  const views = doc.bufferViews.map(({ byteOffset = 0, byteLength }) => {
    assert.equal(byteOffset % 4, 0);
    const view = buffer.subarray(byteOffset, byteOffset + byteLength);
    assert.equal(view.length, byteLength);
    return view;
  });
  return { doc, views };
}

const manifest = JSON.parse(readFileSync('public/mugroup/mundo/mundo.json', 'utf8'));
const revision = bytes => createHash('md5').update(bytes).digest('hex');
const isGap = (bytes, i) => Math.max(bytes[i], bytes[i + 1], bytes[i + 2]) <= 2;

test('production terrain removes atlas voids without changing the geometry or valid colors', () => {
  let repaired = 0;
  for (const { terrain } of manifest.tiles) {
    const original = inspect(readFileSync(`public/mugroup/${terrain}`));
    const built = inspect(readFileSync(`dist/mugroup/${terrain}`));
    assert.deepEqual(built.doc.accessors, original.doc.accessors, terrain);
    const image = original.doc.images[0].bufferView;
    built.views.forEach((view, i) => {
      if (i !== image) assert(view.equals(original.views[i]), terrain);
    });
    const a = PNG.sync.read(original.views[image]);
    const b = PNG.sync.read(built.views[image]);
    assert.equal(a.data.length, b.data.length);
    for (let i = 0; i < a.data.length; i += 4) {
      assert(!isGap(b.data, i), `${terrain}: void remaining at pixel ${i / 4}`);
      if (isGap(a.data, i)) repaired++;
      else assert.equal(b.data.readUInt32LE(i), a.data.readUInt32LE(i), `${terrain}: valid color changed`);
    }
  }
  assert(repaired > 0);
});

test('Workbox includes every gameplay file and the current revision of each corrected terrain', () => {
  const worker = readFileSync('dist/sw.js', 'utf8');
  const hasEntry = (path, expectedRev) => {
    const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (expectedRev) {
      return new RegExp(`(?:"url"|url)\\s*:\\s*"${escaped}"[\\s\\S]{0,80}(?:"revision"|revision)\\s*:\\s*"${expectedRev}"`).test(worker);
    }
    return new RegExp(`(?:"url"|url)\\s*:\\s*"${escaped}"`).test(worker);
  };
  for (const dir of ['mugroup', 'openmu', 'models', 'ADMIN']) {
    for (const file of readdirSync(`dist/${dir}`, { recursive: true, withFileTypes: true })) {
      if (!file.isFile() || !/\.(glb|json|png|webp|f32|u8|wav|mp3|ogg)$/.test(file.name)) continue;
      const path = `${file.parentPath}/${file.name}`.slice('dist/'.length);
      assert(hasEntry(path), `Not cached: ${path}`);
    }
  }
  for (const { terrain } of manifest.tiles) {
    const path = `mugroup/${terrain}`;
    assert(hasEntry(path, revision(readFileSync(`dist/${path}`))), path);
  }
  assert(hasEntry('sql-wasm.wasm'));
});
