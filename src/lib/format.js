const LOCALE = 'de-CH';

export const fmtNum = (v, digits = 0) =>
  v == null ? '–' : v.toLocaleString(LOCALE, { minimumFractionDigits: digits, maximumFractionDigits: digits });

export const fmtHours = (h) => {
  if (h == null) return '–';
  const total = Math.round(h * 60);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')} h`;
};

export const fmtDuration = (ms) => fmtHours(ms / 3600000);

export const fmtDay = (iso, opts = { weekday: 'short', day: 'numeric', month: 'short' }) =>
  new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString(LOCALE, opts);

export const fmtShortDay = (iso) => fmtDay(iso, { day: 'numeric', month: 'numeric' });

export const fmtTime = (iso) =>
  iso ? new Date(iso).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' }) : '–';

const SPORT_DE = {
  running: 'Laufen',
  cycling: 'Radfahren',
  'functional fitness': 'Functional Fitness',
  weightlifting: 'Krafttraining',
  tennis: 'Tennis',
  hiking: 'Wandern',
  yoga: 'Yoga',
  swimming: 'Schwimmen',
  walking: 'Gehen',
  activity: 'Aktivität',
};
export const sportName = (name = '') =>
  SPORT_DE[name.toLowerCase()] || name.replace(/(^|[\s-])\w/g, (m) => m.toUpperCase());
