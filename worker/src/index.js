/**
 * WHOOP OAuth- & API-Proxy als Cloudflare Worker.
 *
 * Warum? GitHub Pages hostet nur statische Dateien. Der Token-Tausch bei WHOOP
 * braucht aber das Client Secret – das darf nie im Browser landen. Ausserdem
 * erlaubt die WHOOP API keine direkten Browser-Aufrufe (CORS).
 *
 * Endpunkte:
 *   POST /oauth/token    { code }           → tauscht Login-Code gegen Tokens
 *   POST /oauth/refresh  { refresh_token }  → erneuert abgelaufene Tokens
 *   GET  /developer/v2/* (Bearer-Token)     → leitet Lese-Anfragen an WHOOP weiter
 *
 * Konfiguration (wrangler.toml [vars] + Secret):
 *   WHOOP_CLIENT_ID, REDIRECT_URI, ALLOWED_ORIGIN, WHOOP_CLIENT_SECRET (Secret!)
 */

const WHOOP = 'https://api.prod.whoop.com';

function cors(env, extra = {}) {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
    ...extra,
  };
}

const json = (env, body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: cors(env, { 'Content-Type': 'application/json' }) });

async function tokenRequest(env, params) {
  const res = await fetch(`${WHOOP}/oauth/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.WHOOP_CLIENT_ID,
      client_secret: env.WHOOP_CLIENT_SECRET,
      ...params,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return json(env, { error: data.error || 'token_error', detail: data.error_description }, res.status);
  // Nur das Nötige an den Browser zurückgeben
  return json(env, {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_in: data.expires_in,
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(env) });

    // Nur Anfragen von deiner eigenen Dashboard-Seite zulassen
    if (origin && origin !== env.ALLOWED_ORIGIN) return json(env, { error: 'origin_not_allowed' }, 403);

    if (request.method === 'POST' && url.pathname === '/oauth/token') {
      const { code } = await request.json().catch(() => ({}));
      if (!code) return json(env, { error: 'missing_code' }, 400);
      return tokenRequest(env, {
        grant_type: 'authorization_code',
        code,
        redirect_uri: env.REDIRECT_URI,
      });
    }

    if (request.method === 'POST' && url.pathname === '/oauth/refresh') {
      const { refresh_token } = await request.json().catch(() => ({}));
      if (!refresh_token) return json(env, { error: 'missing_refresh_token' }, 400);
      return tokenRequest(env, { grant_type: 'refresh_token', refresh_token, scope: 'offline' });
    }

    if (request.method === 'GET' && url.pathname.startsWith('/developer/v2/')) {
      const auth = request.headers.get('Authorization');
      if (!auth) return json(env, { error: 'missing_token' }, 401);
      const upstream = await fetch(`${WHOOP}${url.pathname}${url.search}`, {
        headers: { Authorization: auth, Accept: 'application/json' },
      });
      return new Response(upstream.body, {
        status: upstream.status,
        headers: cors(env, { 'Content-Type': upstream.headers.get('Content-Type') || 'application/json' }),
      });
    }

    return json(env, { ok: true, service: 'whoop-proxy' }, url.pathname === '/' ? 200 : 404);
  },
};
