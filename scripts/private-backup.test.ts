import assert from 'node:assert/strict';
import { test } from 'node:test';
import { once } from 'node:events';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { mountPrivateBackup } from '../src/server/privateBackup.ts';
import { generateRecoveryCode, syncEncryptedBackup } from '../src/services/privateBackup.ts';
import type { MuAccount, MuCharacter } from '../src/types/game.ts';

test('private backup preserves new inventory and only a recovery code can decrypt and restore it', async () => {
  const directory = await mkdtemp(join(tmpdir(),'mu-backup-test-'));
  const app = express();
  app.use(express.json());
  mountPrivateBackup(app,directory,'https://game.example');
  const server = app.listen(0,'127.0.0.1');
  await once(server,'listening');
  const endpoint = new URL(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/private-backup`);
  try {
    const account = { id:'fixture-account', username:'recovery-fixture',passwordHash:'example-verifier',updatedAt:1 } as MuAccount;
    const character = { id:'fixture-character', accountId:account.id,updatedAt:1,
      inventory:[{ name:'Alas de Aurora Boreal · Madrigal' }] } as MuCharacter;
    const code = generateRecoveryCode();
    const snapshot = { account,characters:[character] };
    assert.deepEqual(await syncEncryptedBackup(endpoint,code,snapshot),snapshot);
    const update = { ...character,updatedAt:3,inventory:[{ name:'Espada Estela Viajera · Madrigal' }] } as MuCharacter;
    await syncEncryptedBackup(endpoint,code,{ account,characters:[update] });
    // A stale device must not replace the newer offline item.
    await syncEncryptedBackup(endpoint,code,snapshot);
    const restored = await syncEncryptedBackup(endpoint,code);
    assert.deepEqual(restored.characters,[update]);
    assert.equal(restored.account.username,account.username);
    const [file] = await readdir(directory);
    const stored = await readFile(join(directory,file),'utf8');
    for (const sensitive of [account.username,account.passwordHash,character.inventory[0].name,code]) {
      assert(!stored.includes(sensitive),'Sensitive information stored in clear');
    }
    assert.equal((await fetch(endpoint)).status,401);
    assert.equal((await fetch(endpoint,{headers:{origin:'https://other.example'}})).status,403);
    await assert.rejects(syncEncryptedBackup(endpoint,generateRecoveryCode()),/no tiene una copia/);
    const corrupt: typeof fetch = async (url, options) => {
      const res = await fetch(url,options);
      const data = await res.json();
      data.data = 'B'+data.data;
      return Response.json(data);
    };
    await assert.rejects(syncEncryptedBackup(endpoint,code,undefined,corrupt));
  } finally {
    await new Promise<void>((resolve,reject) => server.close(err => err ? reject(err) : resolve()));
    await rm(directory,{ recursive:true,force:true });
  }
});

test('another client opens the wrapped backup by normalized login; collisions cannot replace it', async () => {
  const {publishAccountLink,lookupAccountLink,loginNameTaken} = await import('../src/services/accountLink.ts');
  const root = await mkdtemp(join(tmpdir(),'mu-login-'));
  const app = express(); app.use(express.json()); mountPrivateBackup(app,root);
  const server = app.listen(0,'127.0.0.1'); await once(server,'listening');
  const endpoint = new URL('http://127.0.0.1:'+ (server.address() as AddressInfo).port+'/api/private-backup');
  try {
    const code=generateRecoveryCode();
    const account={id:'a',username:'hero',passwordHash:'verifier',updatedAt:1} as MuAccount;
    await syncEncryptedBackup(endpoint,code,{account,characters:[]});
    assert.equal(await loginNameTaken(endpoint,'hero'),false);
    await publishAccountLink(endpoint,'hero','verifier',code,1);
    assert.equal(await loginNameTaken(endpoint,' HERO '),true);
    const restored=await lookupAccountLink(endpoint,' HERO ','verifier');
    assert.deepEqual((await syncEncryptedBackup(endpoint,restored)).account,account);
    await assert.rejects(lookupAccountLink(endpoint,'hero','wrong'));
    await assert.rejects(publishAccountLink(endpoint,'hero','other',generateRecoveryCode(),3),/otra cuenta/);
    await publishAccountLink(endpoint,'hero','new',code,2);
    await publishAccountLink(endpoint,'hero','verifier',code,1);
    await assert.rejects(lookupAccountLink(endpoint,'hero','verifier'));
    assert.equal(await lookupAccountLink(endpoint,'hero','new'),code);
  } finally {
    await new Promise<void>(resolve=>server.close(()=>resolve()));
    await rm(root,{recursive:true,force:true});
  }
});

test('online recovery accepts either single answer without exposing the sealed recovery records', async () => {
  const {publishAccountLink,lookupAccountLink,lookupRecoveryLink,lookupRecoveryQuestions} = await import('../src/services/accountLink.ts');
  const root = await mkdtemp(join(tmpdir(),'mu-recovery-'));
  const app = express(); app.use(express.json()); mountPrivateBackup(app,root,'https://game.example','ab'.repeat(32));
  const server = app.listen(0,'127.0.0.1'); await once(server,'listening');
  const endpoint = new URL('http://127.0.0.1:'+ (server.address() as AddressInfo).port+'/api/private-backup');
  try {
    const code = generateRecoveryCode();
    const account = {id:'fixture',username:'mage',passwordHash:'before',updatedAt:1} as MuAccount;
    await syncEncryptedBackup(endpoint,code,{account,characters:[]});
    await publishAccountLink(endpoint,'mage','before',code,1);
    await assert.rejects(lookupRecoveryQuestions(endpoint,'mage'));
    const questions = [{question:'Primer acertijo de prueba',verifier:'first'},{question:'Segundo acertijo de prueba',verifier:'second'}] as [ {question:string;verifier:string}, {question:string;verifier:string} ];
    assert.equal(await publishAccountLink(endpoint,'mage','before',code,1,questions),true);
    assert.deepEqual(await lookupRecoveryQuestions(endpoint,' MAGE '), questions.map(q=>q.question));
    await assert.rejects(lookupRecoveryLink(endpoint,'mage',1,'second'));
    assert.equal(await lookupRecoveryLink(endpoint,'mage',1,'first'),code);
    const recovered = await lookupRecoveryLink(endpoint,'mage',2,'second');
    await syncEncryptedBackup(endpoint,recovered,{account:{...account,passwordHash:'after',updatedAt:2},characters:[]});
    await publishAccountLink(endpoint,'mage','after',recovered,2,questions);
    await assert.rejects(lookupAccountLink(endpoint,'mage','before'));
    assert.equal(await lookupAccountLink(endpoint,'mage','after'),code);
    const file = (await readdir(root)).find(f=>f.startsWith('login-'))!;
    const saved = await readFile(join(root,file),'utf8');
    assert(!saved.includes(questions[0].question));
    assert(!saved.includes(questions[1].verifier));
    assert(!saved.includes(code));
    for (let i=0;i<4;i++) await assert.rejects(lookupRecoveryLink(endpoint,'mage',1,'incorrect'));
    await assert.rejects(lookupRecoveryLink(endpoint,'mage',1,'first'),/Demasiados intentos/);
  } finally {
    await new Promise<void>(resolve=>server.close(()=>resolve()));
    await rm(root,{recursive:true,force:true});
  }
});
