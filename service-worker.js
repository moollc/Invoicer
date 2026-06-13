const CACHE = 'app-mqcqdivm'; // __CACHE_VERSION__
const ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/privacy.html',
  '/terms.html',
  '/source/shared/permissions.js',
  '/source/shared/file-bridge.js',
  '/source/shared/sync.js'
];

const OFFLINE_HTML = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Offline Â· moo Invoicer</title>
  <style>
    body {
      background: #14202e;
      color: #fff;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      text-align: center;
    }
    .card {
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(255,255,255,0.08);
      padding: 40px 30px;
      border-radius: 16px;
      max-width: 360px;
      backdrop-filter: blur(10px);
    }
    h1 {
      font-size: 20px;
      margin: 0 0 10px;
      letter-spacing: 0.5px;
    }
    p {
      font-size: 13px;
      color: #9aa2ac;
      line-height: 1.6;
      margin: 0 0 20px;
    }
    button {
      background: #d0241b;
      color: #fff;
      border: none;
      padding: 10px 20px;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: opacity 0.15s;
    }
    button:hover { opacity: 0.88; }
  </style>
</head>
<body>
  <div class="card">
    <div style="font-size: 32px; margin-bottom: 12px;">ðŸ“¡</div>
    <h1>You are Offline</h1>
    <p>Check your internet connection and try reloading the app. Your local ledger remains fully saved in your browser.</p>
    <button onclick="window.location.reload()">Retry Connection</button>
  </div>
</body>
</html>
`;

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).catch(err => {
      console.log('Pre-caching fallback triggered for offline assets:', err);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = e.request.url;

  // Let the browser handle all cross-origin requests natively â€” SW fetch()
  // runs under the page's CSP and will be blocked for auth/CDN origins.
  if (!url.startsWith(self.location.origin)) {
    return;
  }

  // 1. Network-First for same-origin app shell
  if (url.startsWith(self.location.origin)) {
    e.respondWith(
      fetch(e.request).then(response => {
        if (response.status === 200) {
          const respClone = response.clone();
          caches.open(CACHE).then(cache => cache.put(e.request, respClone));
        }
        return response;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  // 3. Cache-First with Network-Fallback for pre-cached app shell and local static resources
  e.respondWith(
    caches.match(e.request).then(cached => {
      return cached || fetch(e.request).then(response => {
        // Dynamically cache other valid local resources
        if (response.status === 200 && url.startsWith(self.location.origin)) {
          return caches.open(CACHE).then(cache => {
            cache.put(e.request, response.clone());
            return response;
          });
        }
        return response;
      }).catch(err => {
        // Serve visually polished offline UI fallback for failed navigations
        if (e.request.mode === 'navigate') {
          return new Response(OFFLINE_HTML, {
            headers: { 'Content-Type': 'text/html' }
          });
        }
        throw err;
      });
    })
  );
});
