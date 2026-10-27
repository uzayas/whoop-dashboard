// ============================================================
//  Konfiguration – Mittagstisch Sekundarschule Pratteln
// ============================================================
//  Leer gelassen (SUPABASE_URL = "") läuft die App im DEMO-MODUS:
//  Daten werden nur im eigenen Browser gespeichert (zum Ausprobieren).
//
//  Für den echten Betrieb: Werte aus Supabase eintragen
//  (Project Settings → API → Project URL und anon / publishable key).
//  Der anon-Key darf öffentlich sein – der Schutz erfolgt über Login + RLS.
// ============================================================

window.APP_CONFIG = {
  SUPABASE_URL: "",
  SUPABASE_ANON_KEY: "",

  TITLE: "Mittagstisch Sekundarschule Pratteln",

  // Angezeigte Wochentage im Kalender (1 = Montag … 5 = Freitag)
  DAYS: [1, 2, 3, 4, 5],

  // Standard-Anmeldetage für neue Schüler/innen
  DEFAULT_DAYS: [1, 2, 4, 5],

  // ---------- Automatisches Logout ----------
  // Abmeldung nach so vielen Minuten ohne Aktivität (0 = aus). 1 Minute vorher erscheint eine Warnung.
  IDLE_TIMEOUT_MINUTES: 30,
  // Spätestens nach so vielen Stunden wird man abgemeldet, auch bei Aktivität (0 = aus).
  MAX_SESSION_HOURS: 10,
  // false = Login gilt nur im offenen Tab; Tab/Browser schliessen = abgemeldet.
  // true  = Login bleibt nach dem Schliessen des Browsers erhalten (bis Timeout/Logout).
  REMEMBER_LOGIN: false,

  // Schnellauswahl für die Bemerkungsspalte (werden auch in der Tageszählung ausgewertet)
  REMARK_PRESETS: ["vegetarisch", "vegan", "ohne Schweinefleisch", "laktosefrei", "glutenfrei"]
};
