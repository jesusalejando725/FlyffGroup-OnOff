import { networkDeadline } from './networkDeadline.ts';
// Wrap the random backup key so another device can find it with a login or a recovery answer.
const utf8 = new TextEncoder();
const hex = (bytes: ArrayBuffer) => Array.from(new Uint8Array(bytes), n => n.toString(16).padStart(2, '0')).join('');
const bytes = (value: string) => Uint8Array.from(value.match(/../g)!, v => parseInt(v,16));
const digest = async (value: string) => hex(await crypto.subtle.digest('SHA-256', utf8.encode(value)));
const accountName = (username: string) => digest('mu:user:v1:' + username.trim().toLowerCase());
type Slot = 1 | 2;
type Wrapped = {proof:string;iv:string;cipher:string};
type Recovery = [{question:string;verifier:string},{question:string;verifier:string}];

async function keys(salt: string, verifier: string) {
  const material = await crypto.subtle.importKey('raw', utf8.encode(verifier), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({name:'PBKDF2', salt:utf8.encode(salt), iterations:600000, hash:'SHA-256'}, material, 512);
  const key = await crypto.subtle.importKey('raw', bits.slice(32), 'AES-GCM', false, ['encrypt','decrypt']);
  return {key, proof:hex(bits.slice(0,32))};
}
async function wrap(salt: string, verifier: string, code: string): Promise<Wrapped> {
  const {key, proof} = await keys(salt,verifier);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({name:'AES-GCM', iv}, key, utf8.encode(code));
  return {proof,iv:hex(iv.buffer),cipher:hex(cipher)};
}

function route(endpoint: URL, name: string, suffix = '') {
  if (endpoint.protocol !== 'https:' && !['localhost','127.0.0.1','[::1]'].includes(endpoint.hostname)) throw new Error('Se requiere HTTPS.');
  return new URL('./account-link/' + name + suffix, endpoint);
}
const options = (): RequestInit => ({cache:'no-store', redirect:'error', credentials:'omit', signal:networkDeadline(10000)});

export async function publishAccountLink(endpoint: URL, username: string, verifier: string, code: string, version: number, recovery?: Recovery): Promise<boolean> {
  const name = await accountName(username);
  const [login, owner, answers] = await Promise.all([
    wrap(name,verifier,code),
    digest('mu:account-owner:v1:' + code),
    recovery && Promise.all(recovery.map(async ({question,verifier},i) => ({
      question, ...await wrap(name+':recovery:'+(i+1),verifier,code),
    }))),
  ]);
  const res = await fetch(route(endpoint,name), {...options(), method:'PUT', headers:{Authorization:'Bearer ' + owner,'Content-Type':'application/json'},
    body:JSON.stringify({...login,version,answers})});
  if (!res.ok) throw new Error(res.status === 409 ? 'El ID ya está vinculado a otra cuenta. Tu partida sigue en este dispositivo.' : 'No se pudo vincular la cuenta.');
  return res.headers.get('X-Mu-Recovery') === 'enabled';
}
async function retrieve(endpoint: URL, name: string, salt: string, verifier: string, slot?: Slot) {
  const {key, proof} = await keys(salt,verifier);
  const res = await fetch(route(endpoint,name,slot ? '/recovery/'+slot : ''), {...options(),headers:{Authorization:'Bearer ' + proof}});
  if (res.status === 429) throw Error('Demasiados intentos. Vuelve a intentarlo más tarde.');
  if (!res.ok) throw new Error([401,404].includes(res.status) ?
    slot ? 'La respuesta de recuperación no coincide.' : 'ID o contraseña incorrectos.' : 'Servidor de cuentas no disponible.');
  const {iv,cipher} = await res.json();
  return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(iv)},key,bytes(cipher)));
}
export async function lookupAccountLink(endpoint: URL, username: string, verifier: string) {
  const name = await accountName(username);
  return retrieve(endpoint,name,name,verifier);
}
export async function lookupRecoveryLink(endpoint: URL, username: string, slot: Slot, verifier: string) {
  const name = await accountName(username);
  return retrieve(endpoint,name,name+':recovery:'+slot,verifier,slot);
}
export async function lookupRecoveryQuestions(endpoint: URL, username: string): Promise<[string,string]> {
  const res = await fetch(route(endpoint,await accountName(username),'/recovery'), options());
  if (res.status === 429) throw Error('Demasiados intentos. Vuelve a intentarlo más tarde.');
  if (!res.ok && res.status !== 404) throw Error('El servidor de recuperación no está disponible. Vuelve a intentarlo.');
  if (!res.ok) throw Error('La cuenta aún no tiene recuperación en línea. Entra desde el dispositivo donde ya guardaste la cuenta para sincronizarla.');
  const questions = await res.json();
  if (!Array.isArray(questions) || questions.length !== 2 || questions.some(q=>typeof q !== 'string')) throw Error('Servidor de cuentas no disponible.');
  return [questions[0], questions[1]];
}
export async function loginNameTaken(endpoint: URL, username: string) {
  const res = await fetch(route(endpoint,await accountName(username)), {...options(),method:'HEAD'});
  return res.status === 200 && !res.headers.get('content-type')?.includes('text/html');
}
