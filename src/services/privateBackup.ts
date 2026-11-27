import { networkDeadline } from './networkDeadline.ts';
import type { MuAccount, MuCharacter } from '../types/game.ts';

type Backup = { account: MuAccount; characters: MuCharacter[] };
type Envelope = { revision: string; iv: string; data: string };
const text = new TextEncoder();
const toHex = (b: Uint8Array) => Array.from(b, n => n.toString(16).padStart(2,'0')).join('');
const base64 = (b: Uint8Array) => {
  let binary = '';
  for (let i = 0; i < b.length; i += 8192) binary += String.fromCharCode(...b.subarray(i,i+8192));
  return btoa(binary);
};
const from64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
export const generateRecoveryCode = () => toHex(crypto.getRandomValues(new Uint8Array(32)));

async function credentials(code: string) {
  if (!/^[a-f0-9]{64}$/.test(code)) throw new Error('El código debe tener 64 caracteres hexadecimales.');
  const [auth, secret] = await Promise.all([
    crypto.subtle.digest('SHA-256',text.encode('mu:backup:auth:v1:' + code)),
    crypto.subtle.digest('SHA-256',text.encode('mu:backup:key:v1:' + code)),
  ]);
  const key = await crypto.subtle.importKey('raw',secret,'AES-GCM',false,['encrypt','decrypt']);
  return { key, auth: 'Bearer ' + toHex(new Uint8Array(auth)) };
}

export function mergeBackup(local: Backup, remote?: Backup): Backup {
  if (!remote) return local;
  if (local.account.id !== remote.account.id) throw new Error('El código corresponde a otra cuenta.');
  const characters = new Map(remote.characters.map(c => [c.id,c]));
  for (const c of local.characters) if (c.updatedAt > (characters.get(c.id)?.updatedAt ?? -1)) characters.set(c.id,c);
  return {
    account: local.account.updatedAt >= remote.account.updatedAt ? local.account : remote.account,
    characters: [...characters.values()].sort((a,b) => a.id.localeCompare(b.id)),
  };
}

export async function syncEncryptedBackup(
  endpoint: URL, code: string, local?: Backup, request: typeof fetch = fetch,
): Promise<Backup> {
  if (endpoint.protocol !== 'https:' && !['localhost','127.0.0.1','[::1]'].includes(endpoint.hostname)) {
    throw new Error('El servidor de respaldo debe usar HTTPS.');
  }
  const { key, auth } = await credentials(code.trim().toLowerCase());
  const headers = { 'Authorization': auth, 'Content-Type': 'application/json' };
  const options: RequestInit = { cache: 'no-store', credentials: 'omit', redirect:'error', headers };
  const received = await request(endpoint,{...options,signal:networkDeadline(12000)});
  let remote: Backup | undefined, previousRevision: string | null = null;
  if (received.ok) {
    const encrypted = await received.json() as Envelope;
    previousRevision = encrypted.revision;
    const decoded = await crypto.subtle.decrypt({ name:'AES-GCM', iv:from64(encrypted.iv) },key,from64(encrypted.data));
    remote = JSON.parse(new TextDecoder().decode(decoded)) as Backup;
    if (!remote.account?.id || !Array.isArray(remote.characters) || remote.characters.some(c => c.accountId !== remote!.account.id)) {
      throw new Error('El respaldo no corresponde a una cuenta válida.');
    }
  } else if (received.status !== 404 || !local) {
    throw new Error(received.status === 404 ? 'El código no tiene una copia en este servidor.' : 'Servidor de respaldo no disponible.');
  }
  if (!local) return remote!;
  const result = mergeBackup(local,remote);
  // Avoid an upload on each polling interval when records have not changed.
  if (remote && remote.account.updatedAt === result.account.updatedAt &&
      remote.characters.length === result.characters.length &&
      remote.characters.every(c => result.characters.some(r => r.id === c.id && r.updatedAt === c.updatedAt))) return result;

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = await crypto.subtle.encrypt({name:'AES-GCM',iv},key,text.encode(JSON.stringify(result)));
  const res = await request(endpoint,{
    ...options, signal:networkDeadline(12000), method:'PUT', body:JSON.stringify({revision:previousRevision,iv:base64(iv),data:base64(new Uint8Array(encoded))}),
  });
  if (!res.ok) throw new Error(res.status === 409 ? 'Otro dispositivo actualizó la copia. Se reintentará.' : 'No se pudo guardar la copia privada.');
  return result;
}
