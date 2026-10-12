import { useCallback, useEffect, useMemo, useState } from 'react';
import TodayPanel from './components/TodayPanel.jsx';
import Trends from './components/Trends.jsx';
import Workouts from './components/Workouts.jsx';
import DayTable from './components/DayTable.jsx';
import { isLiveConfigured } from './lib/config.js';
import { handleRedirect, isLoggedIn, logout, startLogin } from './lib/auth.js';
import { fetchWhoopData } from './lib/api.js';
import { generateMockData } from './lib/mock.js';
import { buildDays } from './lib/transform.js';

const RANGES = [
  { days: 7, label: '7 T' },
  { days: 30, label: '30 T' },
  { days: 90, label: '90 T' },
];

function loadPref(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}
function savePref(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* egal */
  }
}

function Logo() {
  return (
    <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="12" fill="none" stroke="var(--good)" strokeWidth="4" strokeDasharray="56 100" strokeLinecap="round" transform="rotate(-90 16 16)" />
      <circle cx="16" cy="16" r="12" fill="none" stroke="var(--strain)" strokeWidth="4" strokeDasharray="0 60 14 100" strokeLinecap="round" transform="rotate(-90 16 16)" />
    </svg>
  );
}

export default function App() {
  const [mode, setMode] = useState(() => (isLiveConfigured && isLoggedIn() ? 'live' : 'demo'));
  const [range, setRange] = useState(() => loadPref('whoop.range', 30));
  const [theme, setTheme] = useState(() => loadPref('whoop.theme', null));
  const [raw, setRaw] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);

  useEffect(() => {
    if (theme) document.documentElement.dataset.theme = theme;
    else delete document.documentElement.dataset.theme;
    savePref('whoop.theme', theme);
  }, [theme]);

  useEffect(() => savePref('whoop.range', range), [range]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (mode === 'live') {
        setRaw(await fetchWhoopData(range));
      } else {
        await new Promise((r) => setTimeout(r, 250));
        setRaw(generateMockData(range));
      }
      setUpdatedAt(new Date());
    } catch (e) {
      setError(e.message);
      if (!isLoggedIn()) setMode('demo');
    } finally {
      setLoading(false);
    }
  }, [mode, range]);

  // Rückkehr vom WHOOP-Login verarbeiten
  useEffect(() => {
    handleRedirect()
      .then((ok) => ok && setMode('live'))
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const days = useMemo(() => (raw ? buildDays(raw).slice(-range - 1) : []), [raw, range]);
  const name = raw?.profile ? `${raw.profile.first_name} ${raw.profile.last_name}`.trim() : '';

  const onConnect = () => {
    if (!isLiveConfigured) {
      setError('Live-Modus ist noch nicht konfiguriert. Siehe README → „WHOOP verbinden“.');
      return;
    }
    startLogin();
  };
  const onLogout = () => {
    logout();
    setMode('demo');
  };

  const nextTheme = { null: 'dark', dark: 'light', light: null }[String(theme)];
  const themeLabel = theme === 'dark' ? 'Dunkel' : theme === 'light' ? 'Hell' : 'Auto';

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <Logo />
          <div>
            <div className="brand-name">WHOOP Dashboard</div>
            <div className="brand-sub">
              {mode === 'demo' ? <span className="badge">Demo-Daten</span> : name || 'Verbunden'}
              {updatedAt && <span className="muted"> · aktualisiert {updatedAt.toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' })}</span>}
            </div>
          </div>
        </div>

        <div className="controls">
          <div className="segmented" role="group" aria-label="Zeitraum">
            {RANGES.map((r) => (
              <button key={r.days} className={range === r.days ? 'active' : ''} onClick={() => setRange(r.days)} aria-pressed={range === r.days}>
                {r.label}
              </button>
            ))}
          </div>
          <button className="btn btn-ghost icon-btn" onClick={load} disabled={loading} title="Neu laden" aria-label="Neu laden">
            <span className={loading ? 'spin' : ''}>↻</span>
          </button>
          <button className="btn btn-ghost" onClick={() => setTheme(nextTheme ?? null)} title="Farbschema wechseln">
            Design: {themeLabel}
          </button>
          {mode === 'live' ? (
            <button className="btn btn-ghost" onClick={onLogout}>Abmelden</button>
          ) : (
            <button className="btn btn-primary" onClick={onConnect}>Mit WHOOP verbinden</button>
          )}
        </div>
      </header>

      {error && (
        <div className="alert" role="alert">
          <span>⚠ {error}</span>
          <button className="btn btn-ghost" onClick={() => setError(null)} aria-label="Hinweis schliessen">✕</button>
        </div>
      )}

      <main className={loading && !raw ? 'loading' : ''}>
        {!raw && loading ? (
          <div className="skeleton-grid">
            <div className="skeleton tall" />
            <div className="skeleton" />
            <div className="skeleton" />
          </div>
        ) : days.length === 0 ? (
          <section className="card empty">
            <h2>Noch keine Daten</h2>
            <p className="muted">Für den gewählten Zeitraum liefert WHOOP keine Einträge.</p>
          </section>
        ) : (
          <>
            <TodayPanel days={days} />
            <Trends days={days} />
            <Workouts workouts={raw.workouts} />
            <DayTable days={days} />
          </>
        )}
      </main>

      <footer className="footer muted">
        Inoffizielles Dashboard · Daten über die WHOOP Developer API v2 · Kein medizinischer Rat
      </footer>
    </div>
  );
}
