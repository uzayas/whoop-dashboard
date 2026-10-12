// Zentrale Konfiguration. Werte kommen aus Vite-Umgebungsvariablen
// (lokal: .env.local, auf GitHub: Repository Variables im Workflow).
const env = import.meta.env || {};

export const CLIENT_ID = env.VITE_WHOOP_CLIENT_ID || '';
export const PROXY_URL = (env.VITE_PROXY_URL || '').replace(/\/$/, '');

// Die Redirect-URL ist immer die Adresse, unter der die App läuft
// (z. B. https://deinname.github.io/whoop-dashboard/). Genau diese URL
// muss im WHOOP Developer Dashboard als Redirect URL eingetragen sein.
export const REDIRECT_URI = window.location.origin + window.location.pathname;

export const AUTH_URL = 'https://api.prod.whoop.com/oauth/oauth2/auth';
export const SCOPES = [
  'read:recovery',
  'read:cycles',
  'read:sleep',
  'read:workout',
  'read:profile',
  'read:body_measurement',
  'offline',
];

export const isLiveConfigured = Boolean(CLIENT_ID && PROXY_URL);
