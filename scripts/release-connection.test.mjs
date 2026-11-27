import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import test from 'node:test';

test('official releases without an account server remain playable offline', async t => {
  const directory = await mkdtemp(join(tmpdir(),'mu-connection-'));
  const output = join(directory,'server-connection.json');
  const argv = process.argv;
  const keys = ['PUBLISH_RELEASE','VITE_BACKUP_URL','VITE_WORLD_SERVER_URL'];
  const previous = keys.map(k => process.env[k]);
  try {
    process.env.PUBLISH_RELEASE = 'true';
    delete process.env.VITE_BACKUP_URL;
    delete process.env.VITE_WORLD_SERVER_URL;
    process.argv = [argv[0],argv[1],output];
    const request = t.mock.method(globalThis,'fetch', async () => new Response(null,{status:404}));
    await import('./write-server-connection.mjs?first');
    assert.deepEqual(JSON.parse(await readFile(output)),{origin:''});
    request.mock.mockImplementation(async () => Response.json({origin:''}));
    await import('./write-server-connection.mjs?existing-local');
    assert.deepEqual(JSON.parse(await readFile(output)),{origin:''});
    request.mock.mockImplementation(async () => new Response(null,{status:503}));
    await assert.rejects(import('./write-server-connection.mjs?unavailable'),/503/);
    process.env.VITE_BACKUP_URL = 'http://accounts.invalid';
    await assert.rejects(import('./write-server-connection.mjs?insecure'),/HTTPS/);
  } finally {
    process.argv = argv;
    keys.forEach((key,i) => { if(previous[i]===undefined) delete process.env[key]; else process.env[key]=previous[i]; });
    await rm(directory,{recursive:true,force:true});
  }
});
