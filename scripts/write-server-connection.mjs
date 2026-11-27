import { readFileSync, writeFileSync } from 'node:fs';
let configured = (process.env.VITE_BACKUP_URL || process.env.VITE_WORLD_SERVER_URL || '').trim();
const publishing = process.env.PUBLISH_RELEASE === 'true';
const pages = JSON.parse(readFileSync('public/ota-manifest.json','utf8')).pagesUrl;
// Keep subsequent releases on the endpoint chosen by the previous official release.
if (publishing && !configured) {
  const response = await fetch(new URL('server-connection.json', pages), {
    redirect:'error', signal:AbortSignal.timeout(10000),
  });
  if (response.ok) {
    const previous = await response.json();
    if (typeof previous?.origin !== 'string') throw Error('La configuración publicada de cuentas es inválida.');
    configured = previous.origin.trim();
  } else if (response.status !== 404 && response.status !== 410) {
    throw Error('No se pudo verificar la configuración de cuentas anterior: HTTP ' + response.status);
  }
}
const url = configured ? new URL(configured) : null;
if (url && (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash)) {
  throw Error('VITE_BACKUP_URL debe ser el origen HTTPS del servidor, sin ruta ni credenciales.');
}
if (publishing && !url) console.warn('Edición local: no hay servidor configurado para recuperar cuentas entre dispositivos.');
if (publishing && url) {
  const origin = new URL(pages).origin;
  const options = {headers:{Origin:origin}, redirect:'error', signal:AbortSignal.timeout(15000)};
  const status = await fetch(new URL('/api/account-service',url),options);
  const info = status.ok ? await status.json() : null;
  if (status.headers.get('access-control-allow-origin') !== origin ||
      info?.service !== 'mugroup-accounts' || info.recovery !== true)
    throw Error('Servidor de cuentas o recuperación no disponible desde '+origin);
  for (const path of ['/api/private-backup','/api/account-link/'+'0'.repeat(64)]) {
    const preflight = await fetch(new URL(path,url),{...options,method:'OPTIONS',headers:{
      Origin:origin,'Access-Control-Request-Method':'PUT','Access-Control-Request-Headers':'authorization,content-type',
    }});
    const permits = key => (preflight.headers.get(key) || '').toLowerCase().split(',').map(x=>x.trim());
    if (!preflight.ok || preflight.headers.get('access-control-allow-origin') !== origin ||
        !permits('access-control-allow-methods').includes('put') ||
        !['authorization','content-type'].every(h=>permits('access-control-allow-headers').includes(h)))
      throw Error('El servidor no admite sincronización desde '+origin);
  }
}
writeFileSync(process.argv[2] || 'dist/server-connection.json', JSON.stringify({ origin: url?.origin ?? '' }) + '\n');
