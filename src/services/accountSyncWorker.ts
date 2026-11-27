import { cloudSyncManager } from './cloudSyncManager';

// Browsers without one-shot Background Sync use the same queue on the next launch.
self.addEventListener('sync', event => {
  const job = event as Event & { tag:string; waitUntil(task:Promise<void>):void };
  if (job.tag === 'mu-account-backup') job.waitUntil(cloudSyncManager.syncPending(true));
});
