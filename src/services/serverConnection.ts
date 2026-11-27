import { networkDeadline } from './networkDeadline.ts';
import manifest from '../../public/ota-manifest.json' with { type:'json' };

const pages = new URL(manifest.pagesUrl);
let discovered = '';
let pending: Promise<string> | undefined;
let retryAt = 0;

export function isPublishedClient(hostname: string) {
  return hostname === pages.hostname;
}

export function parseServerOrigin(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return '';
  try {
    const url = new URL(value.trim());
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) return '';
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(url.hostname))) return '';
    return url.origin;
  } catch { return ''; }
}

export function sharedServerOrigin() {
  return discovered || parseServerOrigin(import.meta.env.VITE_BACKUP_URL) || parseServerOrigin(import.meta.env.VITE_WORLD_SERVER_URL);
}

// Always trust the public deployment URL embedded in the app, never a user-selected OTA repository.
export async function discoverSharedServer(): Promise<string> {
  if (!isPublishedClient(location.hostname) || !navigator.onLine) return sharedServerOrigin();
  if (pending) return pending;
  if (Date.now() < retryAt) return sharedServerOrigin();
  retryAt = Date.now() + 30_000;
  pending = (async () => {
    try {
      const res = await fetch(new URL('server-connection.json',pages), {
        cache:'no-store', credentials:'omit', redirect:'error', signal:networkDeadline(3000),
      });
      if (res.ok) discovered = parseServerOrigin((await res.json()).origin) || discovered;
    } catch { /* retain the last trusted configuration */ }
    return sharedServerOrigin();
  })().finally(() => { pending = undefined; });
  return pending;
}
