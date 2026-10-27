// ============================================================
//  Datenschicht: Supabase (Echtbetrieb) oder localStorage (Demo)
//  Beide liefern dieselben Funktionen, app.js merkt keinen Unterschied.
// ============================================================

function createSupabaseStore(cfg) {
  if (!window.supabase) throw new Error("Supabase-Bibliothek konnte nicht geladen werden (Internetverbindung?).");
  // Wo das Login gespeichert wird: sessionStorage = nur solange der Tab offen ist
  const persist = cfg.REMEMBER_LOGIN === true;
  const area = () => (persist ? window.localStorage : window.sessionStorage);
  const authStorage = {
    getItem(k) { try { return area().getItem(k); } catch (e) { return null; } },
    setItem(k, v) { try { area().setItem(k, v); } catch (e) { /* ignorieren */ } },
    removeItem(k) { try { area().removeItem(k); } catch (e) { /* ignorieren */ } }
  };
  // Dauerhafte Logins einer früheren Version entfernen
  if (!persist) {
    try {
      Object.keys(localStorage)
        .filter((k) => /^sb-.*-auth-token/.test(k))
        .forEach((k) => localStorage.removeItem(k));
    } catch (e) { /* ignorieren */ }
  }
  const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
    auth: { storage: authStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  const chk = ({ data, error }) => { if (error) throw error; return data; };
  let channel = null;

  return {
    demo: false,

    async getSession() {
      const { data } = await sb.auth.getSession();
      return data.session;
    },
    async signIn(email, password) {
      chk(await sb.auth.signInWithPassword({ email, password }));
    },
    // Selbstregistrierung: Der Registrierungscode wird in der Datenbank geprüft
    // und bestimmt die Rolle (Schule/Lerninsel oder Es Tischli für Alli).
    async signUp({ email, password, displayName, code }) {
      const data = chk(await sb.auth.signUp({
        email,
        password,
        options: {
          data: { display_name: displayName, reg_code: code },
          emailRedirectTo: window.location.origin + window.location.pathname
        }
      }));
      return { needsConfirm: !data.session };
    },
    async signOut() {
      if (channel) { sb.removeChannel(channel); channel = null; }
      await sb.auth.signOut();
    },
    async getProfile() {
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return null;
      const p = chk(await sb.from("profiles").select("role, display_name").eq("id", user.id).maybeSingle());
      return p ? { ...p, email: user.email } : null;
    },

    // --- Schüler/innen ---
    async listStudents() {
      return chk(await sb.from("students").select("*"));
    },
    async saveStudent(s) {
      const row = {
        first_name: s.first_name, last_name: s.last_name, class_name: s.class_name || null,
        remark: s.remark || null, weekdays: s.weekdays, active: s.active ?? true
      };
      if (s.id) return chk(await sb.from("students").update(row).eq("id", s.id).select().single());
      return chk(await sb.from("students").insert(row).select().single());
    },
    async setActive(id, active) {
      chk(await sb.from("students").update({ active }).eq("id", id));
    },
    async deleteStudent(id) {
      chk(await sb.from("students").delete().eq("id", id));
    },

    // --- Abmeldungen ---
    async listAbsences(from, to) {
      return chk(await sb.from("absences").select("*").gte("day", from).lte("day", to));
    },
    async addAbsences(rows) {
      if (!rows.length) return;
      // in Paketen, damit auch lange Zeiträume für ganze Klassen funktionieren
      for (let i = 0; i < rows.length; i += 500) {
        chk(await sb.from("absences").upsert(rows.slice(i, i + 500), { onConflict: "student_id,day,source" }));
      }
    },
    async removeAbsence(student_id, day, source) {
      chk(await sb.from("absences").delete().match({ student_id, day, source }));
    },

    // --- Tage ohne Mittagstisch (Ferien, Feiertage) ---
    async listClosed(from, to) {
      return chk(await sb.from("closed_days").select("*").gte("day", from).lte("day", to));
    },
    async setClosed(day, note) {
      chk(await sb.from("closed_days").upsert({ day, note: note || null }));
    },
    async removeClosed(day) {
      chk(await sb.from("closed_days").delete().eq("day", day));
    },

    // Live-Aktualisierung, wenn die andere Stelle etwas ändert
    subscribe(cb) {
      if (channel) return;
      channel = sb.channel("mittagstisch")
        .on("postgres_changes", { event: "*", schema: "public", table: "students" }, cb)
        .on("postgres_changes", { event: "*", schema: "public", table: "absences" }, cb)
        .on("postgres_changes", { event: "*", schema: "public", table: "closed_days" }, cb)
        .subscribe();
    }
  };
}

function createDemoStore(cfg) {
  const KEY = "mittagstisch-demo-v1";
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const pad = (n) => String(n).padStart(2, "0");
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  function seed() {
    const S = (first_name, last_name, class_name, remark, weekdays) =>
      ({ id: uid(), first_name, last_name, class_name, remark, weekdays, active: true });
    const students = [
      S("Lea", "Meier", "1a", "vegetarisch", [1, 2, 4, 5]),
      S("Noah", "Schneider", "1a", "", [1, 2, 4, 5]),
      S("Elif", "Yilmaz", "1a", "ohne Schweinefleisch", [1, 2, 4]),
      S("Luca", "Bernasconi", "1b", "", [1, 4, 5]),
      S("Mia", "Keller", "1b", "vegan", [1, 2, 4, 5]),
      S("Arijon", "Krasniqi", "1b", "ohne Schweinefleisch", [1, 2, 4, 5]),
      S("Sara", "Gashi", "2a", "", [2, 4]),
      S("Leon", "Weber", "2a", "laktosefrei", [1, 2, 4, 5]),
      S("Nina", "Brunner", "2a", "vegetarisch", [1, 2, 3, 4, 5]),
      S("Jonas", "Frei", "2b", "", [1, 2, 4, 5]),
      S("Amira", "Haddad", "2b", "ohne Schweinefleisch, vegetarisch", [1, 2, 4, 5]),
      S("Tim", "Huber", "3a", "", [1, 2, 4]),
      S("Lara", "Rossi", "3a", "glutenfrei", [1, 2, 4, 5]),
      S("Dario", "Pereira", "3a", "", [2, 4, 5])
    ];
    const now = new Date();
    const mon = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
    const day = (n) => iso(new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + n));
    const absences = [
      { id: uid(), student_id: students[1].id, day: day(1), source: "schule", reason: "Exkursion" },
      { id: uid(), student_id: students[4].id, day: day(3), source: "tischli", reason: "Krank gemeldet" },
      { id: uid(), student_id: students[7].id, day: day(0), source: "tischli", reason: "Eltern haben abgemeldet" },
      { id: uid(), student_id: students[11].id, day: day(3), source: "schule", reason: "Schnuppertag" },
      { id: uid(), student_id: students[11].id, day: day(3), source: "tischli", reason: "" }
    ];
    return { students, absences, closed: [] };
  }

  let db;
  try { db = JSON.parse(localStorage.getItem(KEY)); } catch (e) { db = null; }
  if (!db || !Array.isArray(db.students)) db = seed();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { /* ignorieren */ } };
  save();

  let role = null;
  try { role = sessionStorage.getItem(KEY + "-role"); } catch (e) { role = null; }

  const inRange = (d, from, to) => d >= from && d <= to;

  return {
    demo: true,

    async getSession() { return role ? { demo: true } : null; },
    async signIn(roleName) {
      role = roleName;
      try { sessionStorage.setItem(KEY + "-role", role); } catch (e) { /* ignorieren */ }
    },
    async signUp() {
      throw new Error("Im Demo-Modus gibt es keine Registrierung.");
    },
    async signOut() {
      role = null;
      try { sessionStorage.removeItem(KEY + "-role"); } catch (e) { /* ignorieren */ }
    },
    async getProfile() {
      if (!role) return null;
      return { role, display_name: role === "schule" ? "Schule / Lerninsel" : "Es Tischli für Alli", email: "demo" };
    },

    async listStudents() { return clone(db.students); },
    async saveStudent(s) {
      const row = {
        first_name: s.first_name, last_name: s.last_name, class_name: s.class_name || null,
        remark: s.remark || null, weekdays: s.weekdays, active: s.active ?? true
      };
      if (s.id) {
        const i = db.students.findIndex((x) => x.id === s.id);
        if (i < 0) throw new Error("Schüler/in nicht gefunden.");
        db.students[i] = { ...db.students[i], ...row };
        save(); return clone(db.students[i]);
      }
      const n = { id: uid(), ...row };
      db.students.push(n); save(); return clone(n);
    },
    async setActive(id, active) {
      const s = db.students.find((x) => x.id === id);
      if (s) { s.active = active; save(); }
    },
    async deleteStudent(id) {
      db.students = db.students.filter((x) => x.id !== id);
      db.absences = db.absences.filter((a) => a.student_id !== id);
      save();
    },

    async listAbsences(from, to) { return clone(db.absences.filter((a) => inRange(a.day, from, to))); },
    async addAbsences(rows) {
      for (const r of rows) {
        if (r.source !== role) throw new Error("Keine Berechtigung für Abmeldungen der anderen Stelle.");
        const ex = db.absences.find((a) => a.student_id === r.student_id && a.day === r.day && a.source === r.source);
        if (ex) ex.reason = r.reason; else db.absences.push({ id: uid(), ...r });
      }
      save();
    },
    async removeAbsence(student_id, day, source) {
      if (source !== role) throw new Error("Keine Berechtigung für Abmeldungen der anderen Stelle.");
      db.absences = db.absences.filter((a) => !(a.student_id === student_id && a.day === day && a.source === source));
      save();
    },

    async listClosed(from, to) { return clone(db.closed.filter((c) => inRange(c.day, from, to))); },
    async setClosed(day, note) {
      db.closed = db.closed.filter((c) => c.day !== day);
      db.closed.push({ day, note: note || null }); save();
    },
    async removeClosed(day) { db.closed = db.closed.filter((c) => c.day !== day); save(); },

    subscribe(cb) {
      // Änderungen aus einem anderen Tab desselben Browsers übernehmen
      window.addEventListener("storage", (e) => {
        if (e.key === KEY) {
          try { db = JSON.parse(e.newValue) || db; } catch (err) { /* ignorieren */ }
          cb();
        }
      });
    }
  };
}
