// Shared Google access-token manager for the GIS token client.
//
// One place decides whether we have a usable token, refreshes it when it is
// expired or close to expiry, and only shows the interactive Google popup when
// the caller says the action is user-initiated (interactive: true).
//
// Background work (sheet sync on load, Drive PDF backup after print, the
// proactive timer) always passes interactive: false, so it can never pop a
// sign-in window or block the page; it just reports that sign-in is needed.

export const REFRESH_MARGIN_MS = 5 * 60 * 1000;   // refresh when < 5 min left
export const SILENT_TIMEOUT_MS = 20 * 1000;
export const POPUP_TIMEOUT_MS = 3 * 60 * 1000;

const KEY_TOKEN = 'gmail-token';
const KEY_EXP = 'gmail-token-exp';
const KEY_SCOPES = 'gmail-token-scopes';

export function createGoogleTokenManager(opts = {}) {
  const getGoogle = opts.getGoogle || (() => (typeof google !== 'undefined' ? google : null));
  const getClientId = opts.getClientId || (() => '');
  const scope = opts.scope || '';
  const getLoginHint = opts.getLoginHint || (() => '');
  const now = opts.now || (() => Date.now());
  const storage = opts.storage || null;
  const setTimer = opts.setTimer || ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = opts.clearTimer || (id => clearTimeout(id));
  const onToken = opts.onToken || (() => {});
  const onSignInNeeded = opts.onSignInNeeded || (() => {});
  const margin = opts.refreshMarginMs ?? REFRESH_MARGIN_MS;

  let token = null;
  let exp = 0;
  let inflight = null;     // one token request at a time
  let refreshTimer = null;

  function store() {
    if (!storage) return;
    try {
      if (token) {
        storage.setItem(KEY_TOKEN, token);
        storage.setItem(KEY_EXP, String(exp));
        storage.setItem(KEY_SCOPES, scope);
      } else {
        storage.removeItem(KEY_TOKEN);
        storage.removeItem(KEY_EXP);
        storage.removeItem(KEY_SCOPES);
      }
    } catch (e) {}
  }

  function restore() {
    if (!storage) return false;
    const t = storage.getItem(KEY_TOKEN);
    const e = parseInt(storage.getItem(KEY_EXP) || '0', 10);
    const s = storage.getItem(KEY_SCOPES);
    if (s !== scope) { if (t || e) { token = null; exp = 0; store(); } return false; }
    if (t && e && now() < e) { token = t; exp = e; scheduleRefresh(); return true; }
    return false;
  }

  function msLeft() { return token ? exp - now() : -Infinity; }
  // Usable right now (with a small safety margin for the request itself).
  function isValid() { return !!token && msLeft() > 30 * 1000; }
  // Comfortable: more than the refresh margin left.
  function isFresh() { return !!token && msLeft() > margin; }

  function setToken(accessToken, expiresInSec) {
    token = accessToken;
    exp = now() + (Number(expiresInSec) || 3600) * 1000;
    store();
    scheduleRefresh();
    try { onToken(token, exp); } catch (e) {}
  }

  function clear() {
    token = null; exp = 0; store();
    if (refreshTimer) { clearTimer(refreshTimer); refreshTimer = null; }
  }

  // Ask GIS for a token once. Resolves { ok, error } and never rejects.
  function requestOnce(prompt, timeoutMs) {
    return new Promise(resolve => {
      const g = getGoogle();
      if (!g || !g.accounts || !g.accounts.oauth2 || !getClientId()) {
        resolve({ ok: false, error: 'gis_unavailable' });
        return;
      }
      let done = false;
      const finish = r => { if (done) return; done = true; if (timer) clearTimer(timer); resolve(r); };
      const timer = setTimer(() => finish({ ok: false, error: 'timeout' }), timeoutMs);
      let client;
      try {
        client = g.accounts.oauth2.initTokenClient({
          client_id: getClientId(),
          scope,
          callback: resp => {
            if (!resp || resp.error || !resp.access_token) {
              finish({ ok: false, error: (resp && resp.error) || 'no_token' });
              return;
            }
            setToken(resp.access_token, resp.expires_in);
            finish({ ok: true });
          },
          error_callback: err => finish({ ok: false, error: (err && err.type) || 'error' }),
        });
        const req = { prompt };
        const hint = getLoginHint();
        if (hint) req.login_hint = hint;
        client.requestAccessToken(req);
      } catch (e) {
        finish({ ok: false, error: (e && e.message) || 'error' });
      }
    });
  }

  // Get a usable token.
  //   interactive false: no GIS call; a valid token or null.
//   background true:   refresh with prompt 'none' (proactive timer only);
//                      Google never shows UI for prompt 'none'.
  //   interactive true:  refresh with prompt '' + login_hint (no UI when the
  //   Google session and consent are still there), then fall back to an
  //   account-chooser popup only if that fails.
  // Resolves the token string, or null when the user must sign in.
  async function ensureToken({ interactive = false, force = false, background = false } = {}) {
    if (!force && isFresh()) return token;
    // Plain non-interactive callers (sheet pulls, Drive backup, 401 retries
    // inside background work) never call GIS at all: GIS token requests use
    // a popup window, which is exactly what must not appear while printing
    // or opening a dialog. They use a still-valid token or report sign-in.
    if (!interactive && !background) {
      if (force) { token = null; exp = 0; store(); }
      if (isValid()) return token;
      try { onSignInNeeded('expired', { interactive: false }); } catch (e) {}
      return null;
    }
    if (inflight) {
      const r = await inflight;
      if (r && isValid()) return token;
      if (!interactive) return isValid() ? token : null;
    }
    const run = (async () => {
      const first = await requestOnce(interactive ? '' : 'none', interactive ? POPUP_TIMEOUT_MS : SILENT_TIMEOUT_MS);
      if (first.ok) return { ok: true, path: 'silent' };
      if (!interactive) return { ok: false, error: first.error };
      // The user closed the window or said no: respect it, no second popup.
      if (first.error === 'popup_closed' || first.error === 'access_denied') return { ok: false, error: first.error };
      const second = await requestOnce('select_account', POPUP_TIMEOUT_MS);
      return second.ok ? { ok: true, path: 'popup' } : { ok: false, error: second.error };
    })();
    inflight = run;
    let r;
    try { r = await run; } finally { inflight = null; }
    if (r.ok) return token;
    // A still-valid (but near-expiry) token is better than nothing, unless
    // the caller forced a refresh because Google already rejected it (401).
    if (force) { token = null; exp = 0; store(); }
    else if (isValid()) return token;
    try { onSignInNeeded(r.error, { interactive }); } catch (e) {}
    return null;
  }

  // Run fn(token). If Google answers 401 (token revoked/expired early), get a
  // fresh token once and retry. fn must return a fetch Response.
  async function withToken(fn, { interactive = false } = {}) {
    let t = await ensureToken({ interactive });
    if (!t) return { ok: false, status: 0, signInNeeded: true };
    let res = await fn(t);
    if (res && res.status === 401) {
      t = await ensureToken({ interactive, force: true });
      if (!t) return { ok: false, status: 401, signInNeeded: true };
      res = await fn(t);
    }
    return res;
  }

  function scheduleRefresh() {
    if (refreshTimer) { clearTimer(refreshTimer); refreshTimer = null; }
    if (!token) return;
    const wait = Math.max(0, exp - now() - margin);
    refreshTimer = setTimer(() => {
      refreshTimer = null;
      ensureToken({ background: true, force: true }).catch(() => {});
    }, wait);
  }

  return {
    ensureToken,
    withToken,
    restore,
    clear,
    setToken,
    isValid,
    isFresh,
    scheduleRefresh,
    get token() { return token; },
    get exp() { return exp; },
    _requestOnce: requestOnce,
  };
}
