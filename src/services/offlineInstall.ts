
// Check the installed worker's own inventory, including revisioned terrain and game data.
export async function offlineInstallReady(expectedVersion?: string): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !('caches' in window)) return false;
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration?.active) return false;
  const cacheName = (await caches.keys()).find(key => key.startsWith('workbox-precache-') && key.endsWith(registration.scope));
  if (!cacheName) return false;
  const cache = await caches.open(cacheName);
  const urls = (await cache.keys()).map(request => new URL(request.url));
  const inventory = new URL('offline-files.json', registration.scope);
  const index = urls.find(url => url.origin === inventory.origin && url.pathname === inventory.pathname);
  if (!index) return false;
  const response = await cache.match(index);
  if (!response) return false;
  const entries: [string, string | null][] = await response.json();
  const keys = new Set(urls.map(url => url.href));
  if (expectedVersion) {
    const manifest = entries.find(([path]) => path === 'ota-manifest.json');
    if (!manifest) return false;
    const url = new URL(manifest[0], registration.scope);
    if (manifest[1]) url.searchParams.set('__WB_REVISION__', manifest[1]);
    const cachedManifest = await cache.match(url);
    if (!cachedManifest || (await cachedManifest.json()).version !== expectedVersion) return false;
  }
  return entries.length > 0 && entries.every(([path, revision]) => {
    const url = new URL(path, registration.scope);
    if (revision) url.searchParams.set('__WB_REVISION__', revision);
    return keys.has(url.href);
  });
}
