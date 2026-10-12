import { PROXY_URL } from './config.js';
import { getAccessToken } from './auth.js';

async function get(path, params = {}, retry = true) {
  const token = await getAccessToken();
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${PROXY_URL}/developer/v2${path}${qs ? `?${qs}` : ''}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401 && retry) {
    await getAccessToken({ force: true });
    return get(path, params, false);
  }
  if (res.status === 429) throw new Error('WHOOP-Rate-Limit erreicht – bitte kurz warten.');
  if (!res.ok) throw new Error(`WHOOP-API-Fehler ${res.status} bei ${path}`);
  return res.json();
}

/** Lädt alle Seiten einer Collection (max. 25 Einträge pro Seite). */
async function getAll(path, start, maxPages = 20) {
  const records = [];
  let nextToken;
  for (let i = 0; i < maxPages; i++) {
    const params = { limit: 25, start: start.toISOString() };
    if (nextToken) params.nextToken = nextToken;
    const page = await get(path, params);
    records.push(...(page.records || []));
    nextToken = page.next_token;
    if (!nextToken) break;
  }
  return records;
}

/** Holt alles, was das Dashboard braucht, für die letzten `days` Tage. */
export async function fetchWhoopData(days) {
  const start = new Date(Date.now() - (days + 1) * 86400000);
  const [profile, body, cycles, recoveries, sleeps, workouts] = await Promise.all([
    get('/user/profile/basic'),
    get('/user/measurement/body').catch(() => null),
    getAll('/cycle', start),
    getAll('/recovery', start),
    getAll('/activity/sleep', start),
    getAll('/activity/workout', start),
  ]);
  return { profile, body, cycles, recoveries, sleeps, workouts };
}
