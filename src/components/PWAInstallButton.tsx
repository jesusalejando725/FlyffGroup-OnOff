import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { Download, Smartphone, WifiOff } from 'lucide-react';

import { offlineInstallReady } from '../services/offlineInstall';
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let pendingPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
function setPrompt(prompt: BeforeInstallPromptEvent | null) {
  pendingPrompt = prompt;
  listeners.forEach(fn => fn());
}
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    setPrompt(event as BeforeInstallPromptEvent);
  });
  window.addEventListener('appinstalled', () => setPrompt(null));
}
function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function isStandaloneApp(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export const PWAInstallButton: React.FC = () => {
  const deferredPrompt = useSyncExternalStore(subscribe, () => pendingPrompt);
  const [isInstalled, setIsInstalled] = useState(false);

  const [help,setHelp] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);
  useEffect(() => {
    let mounted = true;
    let verified = false;
    let checking = false;
    const verify = async () => {
      if (!mounted || verified || checking) return;
      checking = true;
      try {
        const ok = await offlineInstallReady();
        if (mounted) { verified = ok; setOfflineReady(ok); }
      } catch { /* retry while the client is downloading */ }
      finally { checking = false; }
    };
    const onReplacement = () => { verified = false; setOfflineReady(false); void verify(); };
    void verify();
    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker.ready.then(verify);
      navigator.serviceWorker.addEventListener('controllerchange', onReplacement);
    }
    const retry = window.setInterval(verify, 3000);
    return () => { mounted = false; clearInterval(retry); navigator.serviceWorker?.removeEventListener('controllerchange', onReplacement); };
  }, []);

  useEffect(() => {
    setIsInstalled(isStandaloneApp());

    const onAppInstalled = () => setIsInstalled(true);
    window.addEventListener('appinstalled', onAppInstalled);
    return () => {
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  const handleClick = async () => {
    if (deferredPrompt && offlineReady) {
      void navigator.storage?.persist?.().catch(() => {});
      setPrompt(null);
      try { await deferredPrompt.prompt(); } catch { setHelp(true); }
      return;
    }
    setHelp(true);
  };

  if (isInstalled) {
    return null;
  }

  return (<>
    <button
      type="button"
      onClick={handleClick}
      className="min-h-[38px] px-3 rounded-lg bg-[#162033] hover:bg-slate-700 border border-amber-500/50 text-amber-200 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
    >
      {deferredPrompt ? <Download className="w-3.5 h-3.5 text-emerald-400" /> : <Smartphone className="w-3.5 h-3.5 text-amber-400" />}
      Instalar APK-WEB
    </button>
    {help && <div role="dialog" aria-label="Instalar APK-WEB" className="fixed z-50 top-16 right-4 max-w-xs p-4 rounded-lg bg-slate-950 border border-amber-500 text-sm text-amber-100">
      {offlineReady ? 'Cliente completo. Para instalarlo, abre el menú del navegador y elige Instalar aplicación o Añadir a inicio.' : 'Mantén esta página abierta con internet mientras se guarda el cliente completo para jugar sin conexión.'}
      <button className="block mt-3 underline" onClick={()=>setHelp(false)}>Cerrar</button></div>}</>
  );
};

export const OfflineIndicator: React.FC = () => {
  const [online, setOnline] = useState(() => (typeof navigator !== 'undefined' ? navigator.onLine : true));

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  if (online) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-3 left-1/2 -translate-x-1/2 z-50 px-3 py-1 rounded-full bg-amber-950/95 border border-amber-500/70 text-[11px] font-semibold text-amber-200 inline-flex items-center gap-1.5 shadow-lg pointer-events-none"
    >
      <WifiOff className="w-3.5 h-3.5 text-amber-400" />
      <span>Modo Offline · Guardado automático en IndexedDB</span>
    </div>
  );
};
