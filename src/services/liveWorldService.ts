import { discoverSharedServer, isPublishedClient, parseServerOrigin } from './serverConnection';
import { INVASIONS } from '../data/worldInvasions';
import { defaultLiveWorld, validateLiveWorld, type LiveWorld } from '../data/liveWorld.ts';

export const ADMIN_USERNAME = 'adonyhdp';
const cacheKey = 'mu-live-world-config';
const configuredServer = import.meta.env.VITE_WORLD_SERVER_URL?.trim() || '';
let world = defaultLiveWorld;
let pendingRefresh: Promise<LiveWorld> | undefined;
let generation = 0;

async function apiUrl(route: string): Promise<URL> {
  const shared = await discoverSharedServer();
  const configured = parseServerOrigin(configuredServer);
  const target = isPublishedClient(location.hostname) ? shared || configured : configured || shared;
  const origin = new URL(target || location.origin);
  if (origin.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname))
    throw Error('El servidor de administración debe usar HTTPS.');
  if (origin.username || origin.password) throw Error('Configuración de servidor inválida.');
  if (!target && isPublishedClient(origin.hostname)) throw Error('Falta configurar el servidor Node para ADMIN.');
  return new URL(route, origin.origin);
}
export function getLiveWorld() { return world; }
export function worldInvasions() {
  return INVASIONS.map(event => ({ ...event, ...world.invasions[event.id] }));
}

export function acceptLiveWorld(next: LiveWorld) {
  generation++;
  world = next;
  try { localStorage.setItem(cacheKey, JSON.stringify(next)); } catch { /* offline storage may be full */ }
}

export function refreshLiveWorld(): Promise<LiveWorld> {
  if (pendingRefresh) return pendingRefresh;
  const started = generation;
  pendingRefresh = (async () => {
    if (world === defaultLiveWorld) {
      try {
        const saved = localStorage.getItem(cacheKey);
        if (saved) world = validateLiveWorld(JSON.parse(saved));
      } catch { /* use bundled default */ }
    }
    if (!navigator.onLine) return world;
    try {
      const res = await fetch(await apiUrl('/api/world-config'), { cache: 'no-store', signal: AbortSignal.timeout(3500) });
      if (!res.ok) return world;
      const next = validateLiveWorld(await res.json());
      if (generation === started && next.revision !== world.revision) acceptLiveWorld(next);
    } catch { /* keep last revision for offline play */ }
    return world;
  })().finally(() => { pendingRefresh = undefined; });
  return pendingRefresh;
}

export interface WorldSession { token: string; expires: number }
async function request(route: string, body?: unknown, token?: string) {
  const res = await fetch(await apiUrl(route), {
    method: body === undefined ? 'GET' : 'POST',
    headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store', credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(10_000),
  });
  if (res.status === 204) return;
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !res.headers.get('content-type')?.includes('application/json'))
    throw Error(data.error || 'El servidor ADMIN no está disponible.');
  return data;
}

export async function openWorldAdmin(password: string): Promise<{ session: WorldSession; config: LiveWorld }> {
  const session = await request('/api/world-admin/session', { username: ADMIN_USERNAME, password }) as WorldSession;
  if (!session?.token || !Number.isFinite(session.expires)) throw Error('Sesión inválida.');
  return { session, config: validateLiveWorld(await request('/api/world-config')) };
}
export async function publishWorldConfig(config: LiveWorld, token: string) {
  const updated = validateLiveWorld(await request('/api/world-admin/publish', validateLiveWorld(config), token));
  acceptLiveWorld(updated);
  return updated;
}
export function closeWorldAdmin(token: string) {
  void request('/api/world-admin/logout', {}, token).catch(() => {});
}
