import { parseServerOrigin } from '../services/serverConnection';
import { networkDeadline } from '../services/networkDeadline';
import { offlineInstallReady } from '../services/offlineInstall';
import { PrivateBackupPanel } from './PrivateBackupPanel';
import React, { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  Cloud,
  CloudOff,
  Database,
  Download,
  ExternalLink,
  FileArchive,
  GitBranch,
  Link2,
  RefreshCw,
  Smartphone,
  Upload,
  X,
} from 'lucide-react';
import { exportDatabaseFile, getDatabaseStats, importDatabaseFile } from '../db/dexieStore';
import { cloudSyncManager } from '../services/cloudSyncManager';
import {
  applyWebOtaUpdate,
  checkForGithubOtaUpdate,
  getConfiguredCloudApiUrl,
  getLinkedGithubRepoSlug,
  setConfiguredCloudApiUrl,
  setLinkedGithubRepoSlug,
  type GithubOtaStatus,
} from '../services/githubOtaService';
import type { SyncStatusInfo } from '../types/game';
import { PWAInstallButton } from './PWAInstallButton';

interface ApkSyncDrawerProps {
  open: boolean;
  syncStatus: SyncStatusInfo;
  onClose: () => void;
  onDatabaseImported: () => Promise<void>;
}

export const ApkSyncDrawer: React.FC<ApkSyncDrawerProps> = ({
  open,
  syncStatus,
  onClose,
  onDatabaseImported,
}) => {
  const [otaStatus, setOtaStatus] = useState<GithubOtaStatus | null>(null);
  const [checkingOta, setCheckingOta] = useState(false);
  const [dbStats, setDbStats] = useState<{
    tables: Array<{ name: string; rows: number }>;
    byteSize: number;
  } | null>(null);
  const [repoUrl, setRepoUrl] = useState(
    () => `https://github.com/${getLinkedGithubRepoSlug()}`,
  );
  const [cloudUrlInput, setCloudUrlInput] = useState(() => getConfiguredCloudApiUrl());
  const [preloadingCache, setPreloadingCache] = useState(false);
  const [syncingCloud, setSyncingCloud] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const runOtaCheck = useCallback(async () => {
    setCheckingOta(true);
    try {
      const status = await checkForGithubOtaUpdate();
      setOtaStatus(status);
      return status;
    } finally {
      setCheckingOta(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    getDatabaseStats().then(setDbStats).catch(() => {});
    runOtaCheck().catch(() => {});
  }, [open, runOtaCheck]);

  if (!open) return null;

  const handleSaveGithubLink = async () => {
    const slug = setLinkedGithubRepoSlug(repoUrl);
    setRepoUrl(`https://github.com/${slug}`);
    const status = await runOtaCheck();
    setNotice(
      status.updateAvailable && status.updateReason
        ? `Repositorio vinculado (${slug}). ${status.updateReason}`
        : `Repositorio GitHub vinculado: ${slug}.`,
    );
  };

  const handleSaveCloudUrl = async () => {
    const origin = parseServerOrigin(cloudUrlInput);
    if (cloudUrlInput.trim()) {
      if (!origin) { setNotice('Introduce el origen HTTPS del servidor de cuentas, sin ruta.'); return; }
      try {
        const res = await fetch(origin+'/api/account-service',{cache:'no-store',credentials:'omit',
          redirect:'error',signal:networkDeadline(15000)});
        const status = res.ok && await res.json();
        if (status.service !== 'mugroup-accounts' || status.recovery !== true) throw Error();
      } catch { setNotice('Este servidor no responde con un servicio de cuentas y recuperación activo. Comprueba la dirección.'); return; }
    }
    const clean = setConfiguredCloudApiUrl(origin);
    setCloudUrlInput(clean);
    cloudSyncManager.resetApiProbe();
    const res = await cloudSyncManager.syncNow();
    setNotice(
      clean
        ? `URL Cloud Sync guardada (${clean}). ${res.message}`
        : `Servidor remoto desvinculado. Modo GitHub Pages / Offline-First activo.`,
    );
  };

  const handleCheckAndApplyUpdate = async () => {
    setNotice(null);
    const status = await runOtaCheck();
    const checked = await applyWebOtaUpdate();
    setNotice(checked
      ? 'Se pidió al navegador que compruebe la versión publicada de esta aplicación.'
      : status.updateReason || 'Abre la versión publicada para activar las actualizaciones de la aplicación.');
  };

  const handlePreloadOfflineCache = async () => {
    setPreloadingCache(true);
    setNotice(null);
    try {
      if (!('serviceWorker' in navigator)) throw new Error('Este navegador no admite la instalación sin conexión.');
      const ready = await offlineInstallReady();
      if (!ready && navigator.onLine) await applyWebOtaUpdate();
      setNotice(ready
        ? 'La descarga terminó. Ya puedes abrir el juego sin conexión en este navegador.'
        : 'La descarga aún no está lista. Mantén el juego abierto con conexión y vuelve a comprobar.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'No se pudo comprobar la instalación.');
    } finally {
      setPreloadingCache(false);
    }
  };

  const handleManualCloudSync = async () => {
    setSyncingCloud(true);
    setNotice(null);
    try {
      const [res, ota] = await Promise.all([cloudSyncManager.syncNow(), runOtaCheck()]);
      const stats = await getDatabaseStats();
      setDbStats(stats);
      if (ota.updateAvailable && ota.updateReason) {
        setNotice(`${res.message} · ${ota.updateReason}`);
      } else {
        setNotice(res.message);
      }
    } finally {
      setSyncingCloud(false);
    }
  };

  const handleExportJson = async () => {
    const blob = await exportDatabaseFile();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mugroup-dexie-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setNotice('Respaldo IndexedDB (.json) exportado correctamente.');
  };

  const handleImportJson = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await importDatabaseFile(file);
    await onDatabaseImported();
    const stats = await getDatabaseStats();
    setDbStats(stats);
    setNotice('Base de datos IndexedDB (Dexie) restaurada con éxito.');
  };

  return (
    <div className="fixed inset-0 z-40 flex items-end md:items-center justify-center bg-black/75 p-0 md:p-6">
      <div className="w-full max-w-3xl max-h-[90vh] flex flex-col rounded-t-2xl md:rounded-2xl bg-[#111622] border border-slate-700/80 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <Smartphone className="w-5 h-5 text-amber-400" />
            <div>
              <h2 className="font-display text-lg font-bold text-amber-300">
                MuGro-up&apos; · Web y APK-WEB + IndexedDB
              </h2>
              <p className="text-xs text-slate-400">
                Actualizaciones automáticas OTA desde GitHub Pages para Web/APK-WEB + respaldo offline Dexie.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar panel APK"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg bg-[#1a2233] hover:bg-slate-700 text-slate-200 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {notice && (
          <div className="px-5 py-2.5 bg-emerald-950/70 border-b border-emerald-500/30 text-xs text-emerald-200">
            {notice}
          </div>
        )}

        <div className="flex-1 overflow-y-auto mu-scroll p-5 space-y-4">
          {/* 1. PWA + GitHub Auto-Update OTA + Cloud Sync */}
          <div className="p-4 rounded-xl bg-[#151c2c] border border-slate-800 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                  <span>1. Web / APK-WEB Auto-Update (GitHub OTA)</span>
                  {otaStatus?.updateAvailable && (
                    <span className="px-2 py-0.5 rounded bg-amber-500 text-slate-950 text-[10px] font-bold">
                      Actualización lista
                    </span>
                  )}
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Versión local: <span className="font-mono-tabular text-amber-300">{otaStatus?.localVersion || '2.2.0'}</span>
                  {otaStatus?.pagesVersion && (
                    <> · GitHub Pages: <span className="font-mono-tabular text-emerald-300">{otaStatus.pagesVersion}</span></>
                  )}
                  {otaStatus?.latestCommitSha && (
                    <> · Commit: <span className="font-mono-tabular text-sky-300">{otaStatus.latestCommitSha}</span></>
                  )}
                </p>
                {otaStatus?.latestCommitMessage && (
                  <p className="text-[11px] text-slate-400 mt-0.5 truncate max-w-xl">
                    Último push en GitHub: {otaStatus.latestCommitMessage}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={handleCheckAndApplyUpdate}
                  disabled={checkingOta}
                  className="min-h-[38px] px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${checkingOta ? 'animate-spin' : ''}`} />
                  {otaStatus?.updateAvailable ? 'Aplicar Actualización' : 'Buscar Actualizaciones'}
                </button>

                <PWAInstallButton />
              </div>
            </div>

            <div className="flex items-center justify-between flex-wrap gap-2 pt-2 border-t border-slate-800/80">
              <div className="flex items-center gap-2 text-xs">
                {syncStatus.isOnline ? (
                  <Cloud className="w-4 h-4 text-emerald-400" />
                ) : (
                  <CloudOff className="w-4 h-4 text-amber-400" />
                )}
                <span className="text-slate-200">
                  {syncStatus.isOnline
                    ? `En línea · Pendientes: ${syncStatus.pendingCount}`
                    : `Sin internet (Offline) · Pendientes locales: ${syncStatus.pendingCount}`}
                </span>
                {syncStatus.lastMessage && (
                  <span className="text-slate-400">({syncStatus.lastMessage})</span>
                )}
              </div>
              {syncStatus.error && <p role="status" className="w-full text-xs text-amber-200">{syncStatus.error}</p>}
              <button
                onClick={handleManualCloudSync}
                disabled={syncingCloud || !syncStatus.isOnline}
                className="min-h-[38px] px-3 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncingCloud ? 'animate-spin' : ''}`} />
                Sincronizar Ahora
              </button>
            </div>
          </div>

          {/* 2. GitHub Repo + APK-WEB + Optional Cloud API Server Linking */}
          <div className="p-4 rounded-xl bg-[#141a26] border border-slate-800 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 text-sm font-semibold text-amber-300">
                <FileArchive className="w-4 h-4" />
                2. Vínculo GitHub Pages + APK-WEB Auto-Actualizable
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Cada <code>git push</code> a tu repositorio actualiza GitHub Pages. Cuando abres la Web o el APK-WEB con internet, el Service Worker descarga la nueva compilación automáticamente sin borrar tu base IndexedDB.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="block text-xs text-slate-400">
                  Repositorio GitHub vinculado:
                  <input
                    type="text"
                    value={repoUrl}
                    onChange={(e) => setRepoUrl(e.target.value)}
                    className="mt-1 w-full min-h-[40px] rounded-lg bg-[#0d111a] border border-slate-700 px-3 text-xs font-mono-tabular text-slate-100"
                  />
                </label>
                <button
                  onClick={handleSaveGithubLink}
                  className="min-h-[36px] px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-200 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Link2 className="w-3.5 h-3.5" />
                  Vincular Repo GitHub
                </button>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs text-slate-400">
                  Servidor de cuentas y recuperación (dirección HTTPS):
                  <input
                    type="text"
                    value={cloudUrlInput}
                    placeholder="https://tu-servidor-mugroup.com (vacío = Offline/Pages)"
                    onChange={(e) => setCloudUrlInput(e.target.value)}
                    className="mt-1 w-full min-h-[40px] rounded-lg bg-[#0d111a] border border-slate-700 px-3 text-xs font-mono-tabular text-slate-100"
                  />
                </label>
                <button
                  onClick={handleSaveCloudUrl}
                  className="min-h-[36px] px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-sky-200 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Cloud className="w-3.5 h-3.5" />
                  Guardar URL Cloud Sync
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2.5 flex-wrap pt-1">
              <button
                onClick={handlePreloadOfflineCache}
                disabled={preloadingCache}
                className="min-h-[42px] px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-slate-950 font-semibold text-xs inline-flex items-center gap-2 cursor-pointer"
              >
                <RefreshCw className={`w-4 h-4 ${preloadingCache ? 'animate-spin' : ''}`} />
                {preloadingCache ? 'Comprobando…' : 'Comprobar descarga sin conexión'}
              </button>
              {otaStatus?.pagesUrl && (
                <a
                  href={otaStatus.pagesUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="min-h-[42px] px-3.5 rounded-lg bg-[#1a2233] hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold inline-flex items-center gap-1.5"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-sky-400" />
                  Abrir Web GitHub Pages
                </a>
              )}
            </div>
          </div>

          <PrivateBackupPanel onRestored={onDatabaseImported} />

          {/* 4. Dexie IndexedDB Inspector & Backup */}
          <div className="p-4 rounded-xl bg-[#141a26] border border-slate-800 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-emerald-300">
                <Database className="w-4 h-4" />
                4. Base de Datos Local IndexedDB / Dexie ({dbStats ? `${(dbStats.byteSize / 1024).toFixed(1)} KB` : '...'})
              </div>
              <button
                onClick={() => getDatabaseStats().then(setDbStats)}
                className="text-xs text-slate-400 hover:text-white inline-flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Actualizar
              </button>
            </div>

            {dbStats && (
              <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
                {dbStats.tables.map((t) => (
                  <div key={t.name} className="p-2.5 rounded-lg bg-[#0d111a] border border-slate-800">
                    <div className="text-[11px] text-slate-400 truncate">{t.name}</div>
                    <div className="text-sm font-bold font-mono-tabular text-slate-100 mt-0.5">
                      {t.rows} filas
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center gap-3 flex-wrap pt-1">
              <button
                onClick={handleExportJson}
                className="min-h-[44px] px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                Exportar Respaldo (.json)
              </button>

              <label className="min-h-[44px] px-4 py-2 rounded-lg bg-[#1e293b] hover:bg-slate-700 text-slate-100 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer">
                <Upload className="w-4 h-4" />
                Importar Respaldo (.json)
                <input
                  type="file"
                  accept=".json"
                  onChange={handleImportJson}
                  className="hidden"
                />
              </label>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
