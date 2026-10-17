// Token manager tests with a mocked google.accounts.oauth2 (no network, no
// real Google account, no Gmail drafts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGoogleTokenManager, REFRESH_MARGIN_MS } from '../source/shared/google-token.mjs';

function memStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), _m: m };
}

// Fake GIS. `behaviour(prompt)` returns { token } | { error } | { popupError }.
function fakeGoogle(behaviour) {
  const calls = [];
  const google = {
    accounts: { oauth2: {
      initTokenClient(cfg) {
        return {
          requestAccessToken(req) {
            calls.push(req);
            const r = behaviour(req.prompt, calls.length);
            queueMicrotask(() => {
              if (r.token) cfg.callback({ access_token: r.token, expires_in: 3600 });
              else if (r.error) cfg.callback({ error: r.error });
              else if (r.popupError) cfg.error_callback({ type: r.popupError });
            });
          },
        };
      },
    } },
  };
  return { google, calls };
}

function makeMgr({ behaviour, nowRef, storage }) {
  const fg = fakeGoogle(behaviour);
  const timers = [];
  const signIn = [];
  const mgr = createGoogleTokenManager({
    getGoogle: () => fg.google,
    getClientId: () => 'cid',
    scope: 'scope-a',
    getLoginHint: () => 'user@example.com',
    now: () => nowRef.t,
    storage,
    setTimer: (fn, ms) => { const id = { fn, at: nowRef.t + ms }; timers.push(id); return id; },
    clearTimer: id => { const i = timers.indexOf(id); if (i >= 0) timers.splice(i, 1); },
    onSignInNeeded: e => signIn.push(e),
  });
  return { mgr, calls: fg.calls, timers, signIn };
}

const T0 = 1_000_000_000_000;

test('fresh token is reused with no GIS call', async () => {
  const nowRef = { t: T0 };
  const storage = memStorage({ 'gmail-token': 'old', 'gmail-token-exp': String(T0 + 30 * 60e3), 'gmail-token-scopes': 'scope-a' });
  const { mgr, calls } = makeMgr({ behaviour: () => ({ token: 'new' }), nowRef, storage });
  assert.equal(mgr.restore(), true);
  assert.equal(await mgr.ensureToken({ interactive: true }), 'old');
  assert.equal(calls.length, 0);
});

test('expired token + interactive: silent refresh with prompt "" and login_hint, no popup', async () => {
  const nowRef = { t: T0 };
  const storage = memStorage({ 'gmail-token': 'old', 'gmail-token-exp': String(T0 - 1000), 'gmail-token-scopes': 'scope-a' });
  const { mgr, calls } = makeMgr({ behaviour: () => ({ token: 'new' }), nowRef, storage });
  assert.equal(mgr.restore(), false);
  assert.equal(await mgr.ensureToken({ interactive: true }), 'new');
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], { prompt: '', login_hint: 'user@example.com' });
  assert.equal(storage.getItem('gmail-token'), 'new');
  assert.equal(Number(storage.getItem('gmail-token-exp')), T0 + 3600e3);
});

test('token with < 5 min left is refreshed before use', async () => {
  const nowRef = { t: T0 };
  const storage = memStorage({ 'gmail-token': 'old', 'gmail-token-exp': String(T0 + 4 * 60e3), 'gmail-token-scopes': 'scope-a' });
  const { mgr, calls } = makeMgr({ behaviour: () => ({ token: 'new' }), nowRef, storage });
  mgr.restore();
  assert.equal(await mgr.ensureToken({ interactive: false }), 'new');
  assert.equal(calls[0].prompt, 'none');
});

test('silent failure -> popup fallback, then caller retries and succeeds', async () => {
  const nowRef = { t: T0 };
  const { mgr, calls } = makeMgr({
    behaviour: prompt => (prompt === '' ? { error: 'interaction_required' } : { token: 'popup-token' }),
    nowRef, storage: memStorage(),
  });
  let draftsCreated = 0;
  const publish = async () => {
    const t = await mgr.ensureToken({ interactive: true });
    if (!t) return false;
    draftsCreated++; // stands in for the mocked Gmail drafts.create call
    return t;
  };
  assert.equal(await publish(), 'popup-token');
  assert.equal(draftsCreated, 1);
  assert.deepEqual(calls.map(c => c.prompt), ['', 'select_account']);
});

test('background (non-interactive) failure never opens the popup', async () => {
  const nowRef = { t: T0 };
  const { mgr, calls, signIn } = makeMgr({ behaviour: () => ({ error: 'interaction_required' }), nowRef, storage: memStorage() });
  assert.equal(await mgr.ensureToken({ interactive: false }), null);
  assert.deepEqual(calls.map(c => c.prompt), ['none']);
  assert.equal(signIn.length, 1);
});

test('user closing the popup does not trigger a second popup', async () => {
  const nowRef = { t: T0 };
  const { mgr, calls } = makeMgr({ behaviour: () => ({ popupError: 'popup_closed' }), nowRef, storage: memStorage() });
  assert.equal(await mgr.ensureToken({ interactive: true }), null);
  assert.equal(calls.length, 1);
});

test('GIS not loaded: returns null quietly', async () => {
  const mgr = createGoogleTokenManager({ getGoogle: () => null, getClientId: () => 'x', scope: 's', storage: memStorage() });
  assert.equal(await mgr.ensureToken({ interactive: true }), null);
});

test('concurrent callers share one token request', async () => {
  const nowRef = { t: T0 };
  const { mgr, calls } = makeMgr({ behaviour: () => ({ token: 'shared' }), nowRef, storage: memStorage() });
  const [a, b] = await Promise.all([mgr.ensureToken({ interactive: true }), mgr.ensureToken({ interactive: true })]);
  assert.equal(a, 'shared'); assert.equal(b, 'shared');
  assert.equal(calls.length, 1);
});

test('proactive refresh is scheduled 5 min before expiry and is silent', async () => {
  const nowRef = { t: T0 };
  let n = 0;
  const { mgr, calls, timers } = makeMgr({ behaviour: () => ({ token: 'tok' + (++n) }), nowRef, storage: memStorage() });
  await mgr.ensureToken({ interactive: true });
  const refresh = timers.find(t => t.at === T0 + 3600e3 - REFRESH_MARGIN_MS);
  assert.ok(refresh, 'refresh timer at exp - 5 min');
  nowRef.t = refresh.at;
  refresh.fn();
  await new Promise(r => setTimeout(r, 0));
  await new Promise(r => setTimeout(r, 0));
  assert.equal(mgr.token, 'tok2');
  assert.equal(calls[1].prompt, 'none');
});

test('withToken retries once on 401 with a forced refresh', async () => {
  const nowRef = { t: T0 };
  let n = 0;
  const { mgr } = makeMgr({ behaviour: () => ({ token: 't' + (++n) }), nowRef, storage: memStorage() });
  const seen = [];
  const res = await mgr.withToken(async t => { seen.push(t); return { status: seen.length === 1 ? 401 : 200, ok: seen.length > 1 }; });
  assert.equal(res.status, 200);
  assert.deepEqual(seen, ['t1', 't2']);
});

test('scope change discards the stored token', () => {
  const storage = memStorage({ 'gmail-token': 'old', 'gmail-token-exp': String(T0 + 60e5), 'gmail-token-scopes': 'other' });
  const mgr = createGoogleTokenManager({ getGoogle: () => null, scope: 'scope-a', storage, now: () => T0 });
  assert.equal(mgr.restore(), false);
  assert.equal(storage.getItem('gmail-token'), null);
});
