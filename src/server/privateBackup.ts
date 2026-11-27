import { createHash, randomUUID, randomBytes, createCipheriv, createDecipheriv, timingSafeEqual } from 'node:crypto';
import { accessSync, constants, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync, unlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Express } from 'express';

const BACKUP_ROUTE = '/api/private-backup';
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const routes = [BACKUP_ROUTE, '/api/account-link/:name', '/api/account-link/:name/recovery/:slot?'];
const wrapValid = (v: any) => v && typeof v.proof === 'string' && /^[a-f0-9]{64}$/.test(v.proof) &&
  typeof v.iv === 'string' && /^[a-f0-9]{24}$/.test(v.iv) && typeof v.cipher === 'string' && /^[a-f0-9]{160}$/.test(v.cipher);
type Stored = { revision: string; iv: string; data: string };

export function mountPrivateBackup(app: Express, directory?: string, browserOrigins = '', recoverySecret = '') {
  if (!directory) {
    app.all(routes, (_req, res) => { res.status(503).json({ error: 'El servidor no tiene respaldo privado habilitado.' }); });
    return;
  }
  const root = resolve(directory);
  mkdirSync(root, { recursive: true, mode: 0o700 });
  const allowedOrigins = new Set(browserOrigins.split(',').map(origin => origin.trim()).filter(Boolean));
  const recoveryKey = /^[a-f0-9]{64}$/i.test(recoverySecret) ? Buffer.from(recoverySecret,'hex') : null;
  app.get('/api/account-service', (req,res) => {
    const origin = req.get('origin');
    if (origin && !allowedOrigins.has(origin)) { res.sendStatus(403); return; }
    if (origin) res.set('Access-Control-Allow-Origin',origin).vary('Origin');
    res.set('Cache-Control','no-store');
    try {
      accessSync(root,constants.R_OK | constants.W_OK);
      res.status(recoveryKey ? 200 : 503).json({service:'mugroup-accounts', recovery:!!recoveryKey});
    } catch { res.sendStatus(503); }
  });
  const seal = (name: string, answers: unknown) => {
    const iv = randomBytes(12);
    const encoder = createCipheriv('aes-256-gcm',recoveryKey!,iv);
    encoder.setAAD(Buffer.from(name));
    const encrypted = Buffer.concat([encoder.update(JSON.stringify(answers)),encoder.final()]);
    return Buffer.concat([iv,encoder.getAuthTag(),encrypted]).toString('base64');
  };
  const unseal = (name: string, wrapped: string) => {
    const buf = Buffer.from(wrapped,'base64');
    const decoder = createDecipheriv('aes-256-gcm',recoveryKey!,buf.subarray(0,12));
    decoder.setAAD(Buffer.from(name));
    decoder.setAuthTag(buf.subarray(12,28));
    return JSON.parse(Buffer.concat([decoder.update(buf.subarray(28)),decoder.final()]).toString());
  };
  const answerAttempts = new Map<string,{expires:number; count:number}>();
  const attempts = new Map<string, { at: number; count: number }>();
  app.all(routes, (req, res) => {
    const origin = req.get('origin');
    if (origin) {
      let sameHost = false;
      try { sameHost = new URL(origin).host === req.get('host'); } catch { /* reject malformed origin */ }
      if (!sameHost && !allowedOrigins.has(origin)) {
        res.status(403).json({ error: 'Origen no autorizado.' });
        return;
      }
      res.set('Access-Control-Allow-Origin', origin);
      res.vary('Origin');
      res.set('Access-Control-Expose-Headers', 'X-Mu-Recovery');
    }
    res.set('Cache-Control', 'no-store');
    if (req.method === 'OPTIONS') {
      res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      res.set('Access-Control-Allow-Methods', 'GET, HEAD, PUT, OPTIONS');
      res.sendStatus(204);
      return;
    }
    if (req.method !== 'GET' && req.method !== 'PUT' && !(req.method === 'HEAD' && req.path.startsWith('/api/account-link/'))) {
      res.sendStatus(405); return;
    }
    const now = Date.now(), ip = req.ip || 'unknown';
    if (attempts.size > 1000) {
      for (const [key, value] of attempts) if (now - value.at >= 60000) attempts.delete(key);
    }
    const seen = attempts.get(ip);
    if (seen && now - seen.at < 60000) {
      if (++seen.count > 60) { res.sendStatus(429); return; }
    } else if (attempts.size < 5000 || attempts.has(ip)) attempts.set(ip, { at: now, count: 1 });
    else { res.sendStatus(429); return; }

    const token = /^Bearer ([a-f0-9]{64})$/.exec(req.get('authorization') || '')?.[1];

    if (req.path.startsWith('/api/account-link/')) {
      const name = req.params.name;
      if (!/^[a-f0-9]{64}$/.test(name)) { res.sendStatus(400); return; }
      const file = join(root, 'login-' + name + '.json');
      const hash = (value: string) => createHash('sha256').update(value).digest('hex');
      try {
        let saved;
        try { saved = JSON.parse(readFileSync(file,'utf8')); }
        catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
        if (req.path.includes('/recovery')) {
          if (req.method !== 'GET') { res.sendStatus(405); return; }
          if (!recoveryKey || !saved?.recovery) { res.sendStatus(404); return; }
          const answers = unseal(name,saved.recovery);
          if (!req.params.slot) { res.json(answers.map((a: {question:string}) => a.question)); return; }
          const slot = req.params.slot;
          if (slot !== '1' && slot !== '2') { res.sendStatus(400); return; }
          if (!token) { res.sendStatus(401); return; }
          const previous = answerAttempts.get(name);
          const current = previous && now < previous.expires ? previous : {expires:now + 15*60_000,count:0};
          answerAttempts.set(name,current);
          if (current.count >= 5) { res.sendStatus(429); return; }
          const {proof,iv,cipher} = answers[Number(slot)-1];
          if (!timingSafeEqual(Buffer.from(proof,'hex'),Buffer.from(hash(token),'hex'))) {
            current.count++; res.sendStatus(401); return;
          }
          res.json({iv,cipher}); return;
        }
        if (req.method === 'HEAD') { res.sendStatus(saved ? 200 : 404); return; }
        if (!token) { res.sendStatus(401); return; }
        if (req.method === 'GET') {
          if (!saved || saved.proof !== hash(token)) { res.sendStatus(401); return; }
          res.json({iv:saved.iv, cipher:saved.cipher}); return;
        }
        const {proof,iv,cipher,version,answers} = req.body || {};
        if (!wrapValid(req.body) || !Number.isSafeInteger(version) || (answers !== undefined &&
            (!Array.isArray(answers) || answers.length !== 2 || answers.some(a => !wrapValid(a) ||
              typeof a.question !== 'string' || a.question.length < 1 || a.question.length > 200)))) {
          res.sendStatus(400); return;
        }
        if (saved && saved.owner !== hash(token)) { res.sendStatus(409); return; }
        if (!saved && readdirSync(root).filter(n => n.startsWith('login-')).length >= 1000) { res.sendStatus(507); return; }
        if (!saved || version >= saved.version) {
          const tmp = file + '.' + randomUUID();
          const recovery = recoveryKey && answers
            ? seal(name,answers.map((a: {question:string; proof:string; iv:string; cipher:string})=>({...a,proof:hash(a.proof)}))) : saved?.recovery;
          try {
            writeFileSync(tmp, JSON.stringify({proof:hash(proof),owner:hash(token),iv,cipher,version,recovery}), {mode:0o600,flag:'wx'});
            renameSync(tmp,file);
          } finally { try { unlinkSync(tmp); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; } }
          if (recoveryKey && recovery) res.set('X-Mu-Recovery','enabled');
        }
        res.sendStatus(204);
      } catch { res.sendStatus(500); }
      return;
    }
    if (!token) { res.sendStatus(401); return; }
    const file = join(root, createHash('sha256').update(token).digest('hex') + '.json');
    try {
      let previous: Stored | undefined;
      try { previous = JSON.parse(readFileSync(file, 'utf8')) as Stored; }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }

      if (req.method === 'GET') {
        if (previous) res.json(previous);
        else res.sendStatus(404);
        return;
      }
      const { revision, iv, data } = req.body ?? {};
      if (typeof iv !== 'string' || iv.length !== 16 || !BASE64.test(iv) ||
          typeof data !== 'string' || data.length < 24 || data.length > 560000 || !BASE64.test(data)) {
        res.status(400).json({ error: 'Copia cifrada inválida.' }); return;
      }
      if ((previous?.revision ?? null) !== revision) { res.sendStatus(409); return; }
      if (!previous && readdirSync(root).filter(name => /^[a-f0-9]{64}\.json$/.test(name)).length >= 1000) {
        res.sendStatus(507); return;
      }
      const next = { revision: randomUUID(), iv, data };
      const tmp = file + '.' + next.revision + '.tmp';
      try {
        writeFileSync(tmp,JSON.stringify(next), { mode: 0o600, flag: 'wx' });
        renameSync(tmp,file);
      } finally {
        try { unlinkSync(tmp); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      }
      res.json({ revision: next.revision });
    } catch {
      res.status(500).json({ error: 'Falló el almacenamiento del respaldo.' });
    }
  });
}
