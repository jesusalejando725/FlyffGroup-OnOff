import Dexie from 'dexie';
import { discoverSharedServer, isPublishedClient, sharedServerOrigin } from './serverConnection';
import { loginNameTaken, lookupAccountLink, lookupRecoveryLink, lookupRecoveryQuestions, publishAccountLink } from './accountLink';
import { generateRecoveryCode, syncEncryptedBackup } from './privateBackup';
import { db, hashSecret, getKvSetting, initDexie, normalizeCharacterRecord, setKvSetting } from '../db/dexieStore';
import { getConfiguredCloudApiUrl } from './githubOtaService';
import type {
  AsyncDuelChallenge,
  MuAccount,
  MuCharacter,
  SyncStatusInfo,
} from '../types/game';

type StatusListener = (status: SyncStatusInfo) => void;
type DataAppliedListener = () => void;

class CloudSyncManager {
  private statusListeners = new Set<StatusListener>();
  private dataAppliedListeners = new Set<DataAppliedListener>();
  private activeAccountId: string | null = null;
  private pollTimer: number | null = null;
  private syncing = false;
  private recoveryRetryAt = new Map<string,number>();
  private apiProbeState: 'unknown' | 'available' = 'unknown';

  private status: SyncStatusInfo = {
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    isOfflineMode: typeof navigator !== 'undefined' ? !navigator.onLine : false,
    syncing: false,
    pendingCount: 0,
    lastSyncedAt: null,
    lastMessage: null,
    cloudUrl: getConfiguredCloudApiUrl(),
    error: null,
  };

  private backgroundRequest?: Promise<void>;
  private scheduleOfflineUpload = () => {
    if (navigator.onLine || !navigator.serviceWorker || this.backgroundRequest) return;
    // Custom servers selected in this browser are handled by the foreground client.
    const configured = getConfiguredCloudApiUrl();
    if (configured && configured !== sharedServerOrigin() && configured !== location.origin) return;
    this.backgroundRequest = navigator.serviceWorker.ready.then(async reg => {
      const sync = (reg as ServiceWorkerRegistration & {sync?: {register(tag:string):Promise<void>}}).sync;
      await sync?.register('mu-account-backup');
    }).catch(() => {}).finally(() => { this.backgroundRequest = undefined; });
  };

  public async syncPending(background = false) {
    // A sync event can arrive during a network transition. Reject it so the
    // browser retains the job instead of acknowledging an empty upload.
    if (background && !navigator.onLine) throw new Error('Sin conexión');
    if (this.activeAccountId) await this.syncNow();
    const prefix = 'privateBackup:pending:';
    const queued = await db.kvMeta.where('key').startsWith(prefix).toArray();
    const ids = new Set(queued.map(entry => entry.key.slice(prefix.length)));
    // A player can earn items offline and sign out before the next upload.
    const dirty = await db.characters.filter(character => !character.isSynced).toArray();
    for (const id of new Set(dirty.map(character => character.accountId))) {
      if (await db.kvMeta.get('privateBackup:' + id)) ids.add(id);
    }
    let failure: string | undefined;
    for (const id of ids) {
      if (id === this.activeAccountId) continue;
      if (!navigator.onLine) {
        if (background) throw new Error('Sin conexión');
        break;
      }
      if (background) {
        // Background jobs may only contact the trusted deployment for already enrolled accounts.
        const binding = await getKvSetting<{endpoint:string} | null>('privateBackup:' + id,null);
        if (!binding || binding.endpoint !== (await this.backupEndpoint()).href) continue;
      }
      const result = await this.syncNow(id);
      if (background && !result.ok) failure = result.message;
    }
    if (failure) throw new Error(failure);
  }

  private onOnline = () => {
    this.apiProbeState = 'unknown';
    this.updateStatus({ isOnline: true, isOfflineMode: false });
    void this.syncPending().catch(() => {});
  };

  private onOffline = () => {
    this.scheduleOfflineUpload();
    this.updateStatus({
      isOnline: false,
      isOfflineMode: true,
      lastMessage: 'Sin conexión · Guardado local en IndexedDB',
    });
  };

  public getStatus(): SyncStatusInfo {
    return { ...this.status, cloudUrl: getConfiguredCloudApiUrl() };
  }

  public setActiveAccountId(accountId: string | null): void {
    this.activeAccountId = accountId;
    if (accountId && accountId !== 'acc-lorencia-demo') {
      // Keep offline enrollments queued even if the player signs out before reconnecting.
      void setKvSetting('privateBackup:pending:' + accountId,true)
        .then(async () => {
          if (navigator.onLine) { await this.syncNow(accountId); return; }
          const existing = await db.kvMeta.get('privateBackup:' + accountId);
          if (!existing && this.activeAccountId === accountId &&
              (getConfiguredCloudApiUrl() || !isPublishedClient(location.hostname))) {
            await this.preparePrivateBackup();
          }
          this.scheduleOfflineUpload();
        })
        .catch(() => this.updateStatus({error:'No se pudo programar la copia de esta cuenta.'}));
    }
  }

  public resetApiProbe(): void {
    this.apiProbeState = 'unknown';
    this.updateStatus({ cloudUrl: getConfiguredCloudApiUrl() });
  }

  public subscribeStatus(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    listener(this.getStatus());
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  public onCloudDataApplied(listener: DataAppliedListener): () => void {
    this.dataAppliedListeners.add(listener);
    return () => {
      this.dataAppliedListeners.delete(listener);
    };
  }

  public start(): void {
    if (typeof window === 'undefined') return;
    Dexie.on('storagemutated', this.scheduleOfflineUpload);
    this.scheduleOfflineUpload();
    window.addEventListener('online', this.onOnline);
    window.addEventListener('offline', this.onOffline);
    void this.refreshPendingCount();
    if (navigator.onLine) {
      void this.syncPending().catch(() => {});
    }
    if (this.pollTimer === null) {
      this.pollTimer = window.setInterval(() => {
        void this.refreshPendingCount();
        if (navigator.onLine) {
          void this.syncPending().catch(() => {});
        }
      }, 25000);
    }
  }

  public stop(): void {
    if (typeof window !== 'undefined') {
      Dexie.on('storagemutated').unsubscribe(this.scheduleOfflineUpload);
      window.removeEventListener('online', this.onOnline);
      window.removeEventListener('offline', this.onOffline);
    }
    if (this.pollTimer !== null) {
      window.clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private updateStatus(patch: Partial<SyncStatusInfo>): void {
    this.status = {
      ...this.status,
      ...patch,
      cloudUrl: getConfiguredCloudApiUrl(),
    };
    const snapshot = this.getStatus();
    for (const cb of this.statusListeners) {
      cb(snapshot);
    }
  }

  private async refreshPendingCount(): Promise<number> {
    try {
      await initDexie();
      const [accounts, characters] = await Promise.all([
        db.accounts.toArray(),
        db.characters.toArray(),
      ]);
      const pending =
        accounts.filter((a) => !a.isSynced).length +
        characters.filter((c) => !c.isSynced).length;
      this.updateStatus({ pendingCount: pending });
      return pending;
    } catch {
      return 0;
    }
  }

  private async resolveApiBase(): Promise<string | null> {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return null;
    }
    await discoverSharedServer();
    const configured = getConfiguredCloudApiUrl();
    if (configured) {
      return configured;
    }
    if (isPublishedClient(location.hostname)) return null;
    if (this.apiProbeState === 'available') return '';

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2500);
    try {
      const res = await fetch('/api/ota/manifest', { signal: ctrl.signal });
      if (res.ok && res.headers.get('content-type')?.includes('application/json')) {
        this.apiProbeState = 'available';
        return '';
      }
    } catch {
      // static host / offline
    } finally {
      clearTimeout(timer);
    }
    this.apiProbeState = 'unknown';
    return null;
  }

  private async backupEndpoint(): Promise<URL> {
    const base = await this.resolveApiBase();
    if (base === null) throw new Error('No hay conexión con un servidor de cuentas. Si la partida está en otro dispositivo, abre Web / APK-WEB allí, exporta el respaldo e impórtalo aquí.');
    return new URL(base + '/api/private-backup', location.origin);
  }

  private async snapshot(id: string): Promise<{ account: MuAccount; characters: MuCharacter[] }> {
    await initDexie();
    return db.transaction('r', db.accounts, db.characters, db.items, async () => {
      const account = await db.accounts.get(id);
      if (!account) throw new Error('Inicia sesión para crear una copia de tu cuenta.');
      const records = await db.characters.where('accountId').equals(id).toArray();
      const characters = await Promise.all(records.map(async (record) => {
        const items = await db.items.where('charId').equals(record.id).toArray();
        return { ...record, equipment: items.filter(i => i.isEquipped), inventory: items.filter(i => !i.isEquipped) };
      }));
      return { account, characters };
    });
  }

  private async applyBackup(
    copy: { account: MuAccount; characters: MuCharacter[] }, endpoint: URL, code: string, pending = false,
  ): Promise<void> {
    let applied = false;
    await db.transaction('rw', db.accounts, db.characters, db.items, db.kvMeta, async () => {
      const account = await db.accounts.get(copy.account.id);
      if (copy.account.id === 'acc-world-admin' || copy.account.id === 'acc-lorencia-demo' ||
          (account && account.username !== copy.account.username)) throw new Error('La copia pertenece a otra cuenta.');
      const byName = await db.accounts.where('username').equals(copy.account.username).first();
      if (byName && byName.id !== copy.account.id) throw new Error('Ya existe otra cuenta local con ese nombre.');
      if (!account || account.updatedAt <= copy.account.updatedAt) {
        await db.accounts.put({ ...copy.account, isSynced: true });
        applied ||= !account || account.updatedAt < copy.account.updatedAt;
      }
      for (const ch of copy.characters) {
        const old = await db.characters.get(ch.id);
        if (old && (old.accountId !== copy.account.id || old.updatedAt > ch.updatedAt)) continue;
        if (!old || old.updatedAt < ch.updatedAt) {
          await db.characters.put(normalizeCharacterRecord({ ...ch, isSynced: true }));
          await db.items.where('charId').equals(ch.id).delete();
          const gear = [...(ch.equipment || []), ...(ch.inventory || [])];
          const owners = await db.items.bulkGet(gear.map(item => item.id));
          if (owners.some(item => item && item.charId !== ch.id)) throw new Error('Conflicto de inventario.');
          await db.items.bulkPut(gear.map(item => ({ ...item, charId: ch.id })));
          applied = true;
        } else {
          await db.characters.update(ch.id, { isSynced: true });
        }
      }
      await setKvSetting('privateBackup:' + copy.account.id, { endpoint: endpoint.href, code });
      if (pending) await setKvSetting('privateBackup:pending:' + copy.account.id,true);
    });
    if (applied) for (const listener of this.dataAppliedListeners) listener();
  }

  // Enrollment also works offline; bind the code to the chosen server before
  // any upload so changing the server never silently transfers a backup.
  public async preparePrivateBackup(): Promise<string> {
    const id = this.activeAccountId;
    if (!id) throw new Error('Inicia sesión para activar la copia.');
    const base = getConfiguredCloudApiUrl();
    if (!base && isPublishedClient(location.hostname)) throw new Error('Configura el servidor privado para activar la copia.');
    const endpoint = new URL((base || location.origin) + '/api/private-backup');
    if (endpoint.protocol !== 'https:' && !['localhost','127.0.0.1','[::1]'].includes(endpoint.hostname)) {
      throw new Error('El servidor de respaldo debe usar HTTPS.');
    }
    const key = 'privateBackup:' + id;
    const code = await db.transaction('rw', db.kvMeta, async () => {
      const previous = await getKvSetting<{ endpoint: string; code: string } | null>(key,null);
      if (previous?.endpoint === endpoint.href) return previous.code;
      const code = generateRecoveryCode();
      await setKvSetting(key, {endpoint:endpoint.href,code});
      return code;
    });
    if (navigator.onLine) void this.syncNow();
    return code;
  }

  public async createPrivateBackup(): Promise<string> {
    const id = this.activeAccountId;
    if (!id) throw new Error('Inicia sesión para crear tu copia privada.');
    if (this.syncing) throw new Error('Espera a que termine la sincronización.');
    this.syncing = true;
    try {
      const endpoint = await this.backupEndpoint();
      const key = 'privateBackup:' + id;
      const saved = await getKvSetting<{ endpoint: string; code: string } | null>(key, null);
      const code = saved?.endpoint === endpoint.href ? saved.code : generateRecoveryCode();
      const remote = await syncEncryptedBackup(endpoint, code, await this.snapshot(id));
      await this.applyBackup(remote, endpoint, code);
      await this.refreshPendingCount();
      this.updateStatus({ lastSyncedAt: new Date().toISOString(), error: null });
      return code;
    } finally {
      this.syncing = false;
    }
  }

  public async restorePrivateBackup(rawCode: string): Promise<number> {
    if (this.syncing) throw new Error('Espera a que termine la sincronización.');
    this.syncing = true;
    try {
      const endpoint = await this.backupEndpoint();
      const code = rawCode.trim().toLowerCase();
      const copy = await syncEncryptedBackup(endpoint, code);
      await this.applyBackup(copy, endpoint, code);
      return copy.characters.length;
    } finally {
      this.syncing = false;
    }
  }

  public async recoveryQuestions(username: string) {
    this.checkRecovery(username);
    return lookupRecoveryQuestions(await this.backupEndpoint(),username);
  }

  private checkRecovery(username: string) {
    if (username.trim().toLowerCase() === 'adonyhdp') throw Error('El acceso ADMIN se restablece en el servidor.');
    if (!navigator.onLine) throw Error('Conéctate a internet para recuperar la cuenta.');
  }

  public async recoverLogin(username: string, slot: 1|2, answer: string, password: string) {
    this.checkRecovery(username);
    if (password.length < 4 || !answer.trim()) throw Error('Escribe una respuesta y una nueva contraseña de al menos 4 caracteres.');
    if (this.syncing) throw Error('Espera a que termine la sincronización.');
    let id: string;
    this.syncing = true;
    try {
      const endpoint = await this.backupEndpoint();
      const verifier = await hashSecret(answer.trim().toLowerCase());
      const code = await lookupRecoveryLink(endpoint,username,slot,verifier);
      const copy = await syncEncryptedBackup(endpoint,code);
      if (copy.account.username !== username.trim().toLowerCase() ||
          (slot === 1 ? copy.account.secretA1 : copy.account.secretA2) !== verifier) throw Error('La respuesta de recuperación no coincide.');
      const local = await db.accounts.get(copy.account.id);
      copy.account = {...copy.account, passwordHash:await hashSecret(password),
        updatedAt:Math.max(Date.now(),copy.account.updatedAt + 1,(local?.updatedAt || 0) + 1)};
      await this.applyBackup(copy,endpoint,code,true);
      id = copy.account.id;
    } finally { this.syncing = false; }
    const result = await this.syncNow(id);
    if (!result.ok) throw Error(result.message);
  }

  public async nameTaken(username: string) {
    if (!navigator.onLine) return false;
    try { return await loginNameTaken(await this.backupEndpoint(),username); }
    catch { return false; } // Offline registration is reconciled on reconnect.
  }

  public async refreshLinkedLogin(account: MuAccount): Promise<boolean> {
    const binding = await getKvSetting<{endpoint:string;code:string} | null>('privateBackup:' + account.id,null);
    if (!binding || !navigator.onLine) return false;
    try {
      const endpoint = await this.backupEndpoint();
      if (endpoint.href !== binding.endpoint) return false;
      const copy = await syncEncryptedBackup(endpoint,binding.code);
      // Inventory and character revisions advance independently of account credentials.
      if (copy.account.id !== account.id) return false;
      await this.applyBackup(copy,endpoint,binding.code);
      return true;
    } catch { return false; } // The local copy remains usable while the server is unavailable.
  }

  public async restoreLogin(username: string, password: string) {
    const endpoint = await this.backupEndpoint();
    const verifier = await hashSecret(password);
    const code = await lookupAccountLink(endpoint, username, verifier);
    const copy = await syncEncryptedBackup(endpoint, code);
    if (copy.account.username !== username.trim().toLowerCase() || copy.account.passwordHash !== verifier)
      throw new Error('ID o contraseña incorrectos.');
    await this.applyBackup(copy, endpoint, code);
  }

  public async syncNow(queuedId?: string): Promise<{ ok: boolean; message: string }> {
    if (this.syncing) return { ok: false, message: 'Sincronización en curso…' };
    const id = queuedId || this.activeAccountId;
    if (!navigator.onLine || !id) return { ok: false, message: 'Progreso disponible en este dispositivo.' };
    this.syncing = true;
    try {
      const endpoint = await this.backupEndpoint();
      if (id === 'acc-lorencia-demo') return {ok:false, message:'Demo local.'};
      const saved = await db.transaction('rw', db.kvMeta, async () => {
        const key = 'privateBackup:' + id;
        const previous = await getKvSetting<{endpoint:string;code:string} | null>(key,null);
        if (previous) return previous;
        const binding = {endpoint:endpoint.href,code:generateRecoveryCode()};
        await setKvSetting(key,binding);
        return binding;
      });
      if (endpoint.href !== saved.endpoint) {
        return { ok: false, message: 'Activa la copia privada para el servidor seleccionado.' };
      }
      if (!queuedId && this.activeAccountId !== id) return { ok: false, message: 'La cuenta activa cambió.' };
      this.updateStatus({ syncing: true, error: null });
      const copy = await syncEncryptedBackup(endpoint, saved.code, await this.snapshot(id));
      await this.applyBackup(copy, endpoint, saved.code);
      const marker = 'privateBackup:link-v2:' + id;
      const stamp = endpoint.href + ':' + copy.account.passwordHash + ':' + saved.code;
      const prior = await getKvSetting(marker,'');
      if (prior !== stamp && (prior !== stamp + ':pending' || Date.now() >= (this.recoveryRetryAt.get(id) || 0))) {
        const {account} = copy;
        const enabled = await publishAccountLink(endpoint,account.username,account.passwordHash,saved.code,account.updatedAt,
          account.secretA1 && account.secretA2 ? [
            {question:account.secretQ1,verifier:account.secretA1},
            {question:account.secretQ2,verifier:account.secretA2},
          ] : undefined);
        await setKvSetting(marker,enabled ? stamp : stamp + ':pending');
        this.recoveryRetryAt.set(id,Date.now()+5*60_000);
        if (!enabled) throw Error('Cuenta vinculada; el servidor aún no admite recuperación con preguntas.');
      }
      if (prior === stamp + ':pending' && await getKvSetting(marker,'') !== stamp)
        throw Error('La recuperación con preguntas aún está pendiente.');
      await this.refreshPendingCount();
      await db.kvMeta.delete('privateBackup:pending:' + id);
      const message = `Copia privada al día (${copy.characters.length} héroes)`;
      this.updateStatus({ lastSyncedAt: new Date().toISOString(), lastMessage: message, isOfflineMode: false });
      return { ok: true, message };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error de sincronización';
      this.updateStatus({ error: message, lastMessage: 'Progreso guardado en este dispositivo.' });
      return { ok: false, message };
    } finally {
      this.syncing = false;
      this.updateStatus({ syncing: false });
    }
  }

  public async fetchDuelChallenges(): Promise<AsyncDuelChallenge[]> {
    const base = await this.resolveApiBase();
    if (base === null) return [];
    try {
      const res = await fetch(`${base}/api/duels/challenges`);
      if (!res.ok) return [];
      const data = (await res.json()) as { challenges?: AsyncDuelChallenge[] };
      return Array.isArray(data.challenges) ? data.challenges : [];
    } catch {
      return [];
    }
  }

  public async publishDuelChallenge(challenge: AsyncDuelChallenge): Promise<boolean> {
    const base = await this.resolveApiBase();
    if (base === null) return false;
    try {
      const res = await fetch(`${base}/api/duels/challenge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(challenge),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

}

export const cloudSyncManager = new CloudSyncManager();
