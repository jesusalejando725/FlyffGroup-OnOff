import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { test } from 'node:test';
import express from 'express';
import { mountWorldAdmin } from '../src/server/worldAdmin.ts';
import { defaultLiveWorld } from '../src/data/liveWorld.ts';
import { MU_MAPS, MU_SHOP_CATALOG } from '../src/data/muWorldData.ts';

test('only the administrator can publish world changes; invalid and stale writes preserve the last revision', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mu-admin-'));
  const file = join(dir, 'world.json');
  const password = randomBytes(30).toString('hex');
  const app = express();
  app.use(express.json());
  mountWorldAdmin(app, { file, password, origins: 'https://game.example' });
  const server = app.listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const addr = server.address();
    if (!addr || typeof addr === 'string') throw Error('Expected an HTTP port');
    const base = `http://127.0.0.1:${addr.port}/api`;
    const send = (route: string, data: unknown, token?: string) => fetch(base + route, {
      method: 'POST', body: JSON.stringify(data),
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
    assert.equal((await send('/world-admin/publish', defaultLiveWorld)).status, 401);
    assert.equal((await send('/world-admin/session', { username: 'other', password })).status, 401);
    const session = await send('/world-admin/session', { username: 'adonyhdp', password });
    assert.equal(session.status, 200);
    const { token } = await session.json();
    const unsafe = { ...defaultLiveWorld, groups: [
      { map: 'flaris', monsterId: 'glb_aibatt', count: 1, ...MU_MAPS[0].spawn },
    ] };
    assert.equal((await send('/world-admin/publish', unsafe, token)).status, 400);
    const config = {
      ...defaultLiveWorld,
      monsters: { glb_aibatt: { zen: 0, hp: 999 } },
      groups: [{ map: 'flaris', monsterId: 'glb_aibatt', x: 80, z: 90, count: 2 }],
      npcs: { 'flaris-npc-hanzo': { x: 100, z: 100, mapId: 'robledal', stock: { [MU_SHOP_CATALOG[0].id]: 0 } } },
      invasions: { red: { x: 110, z: 120, zen: 3000 } },
    };
    const publish = await send('/world-admin/publish', config, token);
    assert.equal(publish.status, 200);
    const published = await publish.json();
    assert.notEqual(published.revision, config.revision);
    assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), { ...config, revision: published.revision });
    assert.equal((await send('/world-admin/publish', config, token)).status, 409);
    const get = await fetch(base + '/world-config', { headers: { Origin: 'https://game.example' } });
    assert.equal(get.headers.get('access-control-allow-origin'), 'https://game.example');
    assert.equal(get.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await get.json(), published);
    await send('/world-admin/logout', {}, token);
    assert.equal((await send('/world-admin/publish', published, token)).status, 401);
  } finally {
    server.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
