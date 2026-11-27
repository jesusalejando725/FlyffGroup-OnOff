import { isPublishedClient, parseServerOrigin, sharedServerOrigin } from './serverConnection';
import { offlineInstallReady } from './offlineInstall';
import manifest from '../../public/ota-manifest.json' with { type: 'json' };

const DEFAULT_REPO_SLUG = manifest.repo;
const LOCAL_VERSION = manifest.version;
const LS_REPO_KEY = 'mu_linked_github_repo';
const LS_CLOUD_URL_KEY = 'mu_cloud_api_url';

export interface GithubOtaStatus {
  repoSlug: string;
  localVersion: string;
  pagesUrl: string;
  pagesVersion?: string;
  latestCommitSha?: string;
  latestCommitMessage?: string;
  updateAvailable: boolean;
  updateReason?: string;
}

function normalizeRepoSlug(raw: string): string {
  const trimmed = raw.trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/i, '').replace(/^\/+|\/+$/g, '');
  const parts = trimmed.split('/').filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]}/${parts[1]}`;
  }
  return DEFAULT_REPO_SLUG;
}

export function getLinkedGithubRepoSlug(): string {
  try {
    const saved = localStorage.getItem(LS_REPO_KEY);
    const slug = saved ? normalizeRepoSlug(saved) : DEFAULT_REPO_SLUG;
    // Existing installs inherited the predecessor repository as their default.
    return slug.toLowerCase() === 'zoeyjf555/mu-offline-mobile-nuevo-' ? DEFAULT_REPO_SLUG : slug;
  } catch {
    return DEFAULT_REPO_SLUG;
  }
}

export function setLinkedGithubRepoSlug(raw: string): string {
  const slug = normalizeRepoSlug(raw);
  try {
    localStorage.setItem(LS_REPO_KEY, slug);
  } catch {
    // ignore storage quota errors
  }
  return slug;
}

export function getConfiguredCloudApiUrl(): string {
  try {
    const shared = sharedServerOrigin();
    if (shared && isPublishedClient(location.hostname)) return shared;
    const override = parseServerOrigin(localStorage.getItem(LS_CLOUD_URL_KEY));
    return isPublishedClient(location.hostname) ? shared || override : override || shared;
  } catch {
    return sharedServerOrigin();
  }
}

export function setConfiguredCloudApiUrl(raw: string): string {
  const clean = raw.trim().replace(/\/+$/g, '');
  try {
    localStorage.setItem(LS_CLOUD_URL_KEY, clean);
  } catch {
    // ignore storage errors
  }
  return clean;
}

async function fetchJsonTimeout<T>(url: string, timeoutMs = 4000): Promise<T | null> {
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}

export async function checkForGithubOtaUpdate(): Promise<GithubOtaStatus> {
  const repoSlug = getLinkedGithubRepoSlug();
  const [owner, repo] = repoSlug.split('/');
  const pagesUrl = `https://${owner.toLowerCase()}.github.io/${repo}/`;

  const localVersion = LOCAL_VERSION;

  const status: GithubOtaStatus = {
    repoSlug,
    localVersion,
    pagesUrl,
    updateAvailable: false,
  };

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return status;
  }

  const [pagesManifest, commitInfo] = await Promise.all([
    fetchJsonTimeout<{ version?: string }>(`${pagesUrl}ota-manifest.json?buscar-version=1`, 3500),
    fetchJsonTimeout<{ sha?: string; commit?: { message?: string } }>(
      `https://api.github.com/repos/${repoSlug}/commits/main`,
      3500,
    ),
  ]);

  if (pagesManifest?.version) {
    status.pagesVersion = pagesManifest.version;
    if (pagesManifest.version !== localVersion) {
      status.updateAvailable = true;
      status.updateReason = `Nueva versión ${pagesManifest.version} disponible en GitHub Pages.`;
    }
  }

  if (commitInfo?.sha) {
    const shortSha = commitInfo.sha.slice(0, 7);
    status.latestCommitSha = shortSha;
    status.latestCommitMessage = commitInfo.commit?.message?.split('\n')[0] || '';

  }

  return status;
}

export async function applyWebOtaUpdate(): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !navigator.onLine) return false;
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) return false;
    await registration.update();
    return true;
  } catch {
    return false;
  }
}

export function watchWebUpdates(saveLocalProgress: () => Promise<boolean>, status: (value:string) => void): () => void {
  if (!('serviceWorker' in navigator)) return () => {};
  const workers = navigator.serviceWorker;
  let stopped = false;
  let checking = false;
  let pendingCheck = false;
  let reloading = false;
  let previousController = workers.controller;
  let replacement = false;

  const inspectActiveWorker = async () => {
    // Read through the controller, so an online server response cannot cause
    // a reload before this release has finished downloading offline.
    if (!workers.controller || reloading || stopped || document.hidden) return;
    if (checking) { pendingCheck = true; return; }
    checking = true;
    try {
      const active = await fetchJsonTimeout<{ version?: string }>('./ota-manifest.json');
      if (!active?.version || (!replacement && active.version === LOCAL_VERSION)) return;
      if (!await offlineInstallReady(active.version)) return;
      if (!stopped && await saveLocalProgress() && !stopped) {
        status('Lista');
        reloading = true;
        window.location.reload();
      }
    } catch {
      // Keep playing; a failed save or incomplete download is retried.
    } finally {
      checking = false;
      if (pendingCheck) { pendingCheck = false; void inspectActiveWorker(); }
    }
  };
  let probing = false;
  const check = async () => {
    if (stopped || probing || document.hidden) return;
    probing = true;
    try {
      if (navigator.onLine) await applyWebOtaUpdate();
      await inspectActiveWorker();
    } finally { probing = false; }
  };
  const onCheck = () => { void check(); };
  const onControllerChange = () => {
    const controller = workers.controller;
    replacement ||= Boolean(previousController && controller && previousController !== controller);
    previousController = controller;
    if (controller?.state === 'activating') {
      controller.addEventListener('statechange', () => { void inspectActiveWorker(); }, { once: true });
    } else void inspectActiveWorker();
  };
  workers.addEventListener('controllerchange', onControllerChange);
  window.addEventListener('online', onCheck);
  window.addEventListener('pageshow', onCheck);
  window.addEventListener('focus', onCheck);
  document.addEventListener('visibilitychange', onCheck);
  const updateFound = () => {
    const installing = registration?.installing;
    if (!installing || !workers.controller) return;
    status('Descargando');
    installing.addEventListener('statechange', () => {
      if (!stopped && installing.state === 'redundant') status('');
    });
  };
  let registration: ServiceWorkerRegistration | undefined;
  void workers.ready.then(reg => {
    if (stopped) return;
    registration = reg; reg.addEventListener('updatefound',updateFound); updateFound(); onCheck();
  });
  onCheck();
  const timer = window.setInterval(onCheck, 60_000);
  return () => {
    stopped = true;
    registration?.removeEventListener('updatefound',updateFound);
    workers.removeEventListener('controllerchange', onControllerChange);
    window.removeEventListener('online', onCheck);
    window.removeEventListener('pageshow', onCheck);
    window.removeEventListener('focus', onCheck);
    document.removeEventListener('visibilitychange', onCheck);
    window.clearInterval(timer);
  };
}
