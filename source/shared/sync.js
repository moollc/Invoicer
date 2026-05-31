const QUEUE_KEY = 'sync-queue';

async function performSync(tag) {
  console.log(`Syncing: ${tag}`);
}

async function queueSync(tag) {
  const existing = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
  if (!existing.includes(tag))
    localStorage.setItem(QUEUE_KEY, JSON.stringify([...existing, tag]));
}

async function processQueue() {
  const queue = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
  for (const tag of queue) await performSync(tag);
  localStorage.removeItem(QUEUE_KEY);
}

export async function scheduleSync(tag) {
  const hasBackgroundSync = 'serviceWorker' in navigator
    && 'sync' in ServiceWorkerRegistration.prototype;

  if (hasBackgroundSync) {
    const reg = await navigator.serviceWorker.ready;
    await reg.sync.register(tag);
  } else if (navigator.onLine) {
    await performSync(tag);
  } else {
    await queueSync(tag);
    window.addEventListener('online', processQueue, { once: true });
  }
}
