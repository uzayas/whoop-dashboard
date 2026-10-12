import { AUTH_URL, CLIENT_ID, PROXY_URL, REDIRECT_URI, SCOPES } from './config.js';

const TOKEN_KEY = 'whoop.tokens';
const STATE_KEY = 'whoop.oauthState';

function read(key, store = localStorage) {
  try {
    return JSON.parse(store.getItem(key));
  } catch {
    return null;
  }
}
function write(key, value, store = localStorage) {
  try {
    if (value == null) store.removeItem(key);
    else store.setItem(key, JSON.stringify(value));
  } catch {
    /* Speicher nicht verfügbar (z. B. privater Modus) */
  }
}

export const getTokens = () => read(TOKEN_KEY);
export const isLoggedIn = () => Boolean(getTokens()?.access_token);
export const logout = () => write(TOKEN_KEY, null);

function saveTokens(t) {
  write(TOKEN_KEY, {
    access_token: t.access_token,
    refresh_token: t.refresh_token,
    // 60 s Puffer, damit wir vor Ablauf erneuern
    expires_at: Date.now() + (t.expires_in - 60) * 1000,
  });
}

/** Leitet zum WHOOP-Login weiter. */
export function startLogin() {
  // WHOOP verlangt einen state mit genau 8 Zeichen
  const state = Array.from(crypto.getRandomValues(new Uint8Array(4)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  write(STATE_KEY, state, sessionStorage);

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: SCOPES.join(' '),
    state,
  });
  window.location.assign(`${AUTH_URL}?${params}`);
}

/**
 * Prüft, ob wir gerade vom WHOOP-Login zurückkommen (?code=…),
 * tauscht den Code über den Proxy gegen Tokens und räumt die URL auf.
 */
export async function handleRedirect() {
  const url = new URL(window.location.href);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');
  if (!code && !error) return false;

  const cleanUrl = url.origin + url.pathname;
  window.history.replaceState({}, '', cleanUrl);

  if (error) throw new Error(`WHOOP-Login abgebrochen: ${error}`);

  const expected = read(STATE_KEY, sessionStorage);
  write(STATE_KEY, null, sessionStorage);
  if (!expected || expected !== url.searchParams.get('state')) {
    throw new Error('Ungültiger OAuth-State – bitte erneut verbinden.');
  }

  const res = await fetch(`${PROXY_URL}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  if (!res.ok) throw new Error(`Token-Tausch fehlgeschlagen (${res.status})`);
  saveTokens(await res.json());
  return true;
}

let refreshing = null;
async function refresh() {
  // Nur ein Refresh gleichzeitig: WHOOP invalidiert alte Refresh-Tokens.
  if (!refreshing) {
    refreshing = (async () => {
      const t = getTokens();
      if (!t?.refresh_token) throw new Error('Nicht angemeldet');
      const res = await fetch(`${PROXY_URL}/oauth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: t.refresh_token }),
      });
      if (!res.ok) {
        logout();
        throw new Error('Sitzung abgelaufen – bitte erneut verbinden.');
      }
      saveTokens(await res.json());
    })().finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}

/** Liefert ein gültiges Access-Token (erneuert es bei Bedarf). */
export async function getAccessToken({ force = false } = {}) {
  const t = getTokens();
  if (!t) throw new Error('Nicht angemeldet');
  if (force || Date.now() > t.expires_at) await refresh();
  return getTokens().access_token;
}
