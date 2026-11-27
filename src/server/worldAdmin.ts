import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Express, Request, Response, NextFunction } from 'express';
import { defaultLiveWorld, validateLiveWorld } from '../data/liveWorld.ts';

export const ADMIN_USERNAME = 'adonyhdp';
const SESSION_MS = 30 * 60_000;
const secretDigest = (value: string) => createHash('sha256').update(value).digest();

export function mountWorldAdmin(app: Express, options: { file: string; password?: string; origins?: string }) {
  const password = options.password && options.password.length >= 16 ? secretDigest(options.password) : undefined;
  const origins = new Set((options.origins ?? '').split(',').map(origin => origin.trim().replace(/\/$/, '')).filter(Boolean));
  let session: { token: string; expires: number } | undefined;
  let failures = 0;
  let retryAt = 0;
  const read = () => {
    try { return validateLiveWorld(JSON.parse(readFileSync(options.file, 'utf8'))); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return defaultLiveWorld;
      throw error;
    }
  };

  const headers = (req: Request, res: Response, next: NextFunction) => {
    res.set('Cache-Control', 'no-store');
    const origin = req.get('Origin');
    if (origin && origins.has(origin)) {
      res.vary('Origin');
      res.set('Access-Control-Allow-Origin', origin);
      res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    }
    if (req.method === 'OPTIONS') { res.sendStatus(204); return; }
    next();
  };
  app.use('/api/world-config', headers);
  app.use('/api/world-admin', headers);

  app.get('/api/world-config', (_req, res) => {
    try { res.json(read()); }
    catch { res.status(503).json({ error: 'La configuración publicada no está disponible.' }); }
  });

  app.post('/api/world-admin/session', (req, res) => {
    if (!password) { res.status(503).json({ error: 'Administración sin configurar en el servidor.' }); return; }
    if (Date.now() < retryAt) { res.status(429).json({ error: 'Demasiados intentos. Espera un minuto.' }); return; }
    const { username, password: attempt } = req.body ?? {};
    if (username !== ADMIN_USERNAME || typeof attempt !== 'string' || attempt.length > 512 ||
      !timingSafeEqual(password, secretDigest(attempt))) {
      if (++failures >= 5) { retryAt = Date.now() + 60_000; failures = 0; }
      res.status(401).json({ error: 'Acceso de administrador inválido.' });
      return;
    }
    failures = 0;
    session = { token: randomBytes(32).toString('base64url'), expires: Date.now() + SESSION_MS };
    res.json(session);
  });

  const authorized = (req: Request) => Boolean(session && Date.now() < session.expires &&
    req.get('Authorization') === `Bearer ${session.token}`);

  app.post('/api/world-admin/logout', (req, res) => {
    if (authorized(req)) session = undefined;
    res.sendStatus(204);
  });

  app.post('/api/world-admin/publish', (req, res) => {
    if (!authorized(req)) { res.status(401).json({ error: 'Vuelve a iniciar sesión como administrador.' }); return; }
    let validated;
    try { validated = validateLiveWorld(req.body); }
    catch (error) {
      res.status(400).json({ error: (error as Error).message });
      return;
    }
    const temp = `${options.file}.${randomUUID()}.tmp`;
    try {
      if (read().revision !== validated.revision) {
        res.status(409).json({ error: 'La configuración cambió. Vuelve a abrir el panel para cargar la última versión.' });
        return;
      }
      validated.revision = randomUUID();
      mkdirSync(dirname(options.file), { recursive: true });
      writeFileSync(temp, JSON.stringify(validated, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
      renameSync(temp, options.file);
      res.json(validated);
    } catch {
      try { rmSync(temp, { force: true }); } catch { /* preserve original error */ }
      res.status(500).json({ error: 'No se guardaron los cambios. Revisa el almacenamiento del servidor.' });
    }
  });
}
