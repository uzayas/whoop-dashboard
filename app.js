// ============================================================
//  Mittagstisch Sekundarschule Pratteln – Hauptlogik
// ============================================================
(function () {
  "use strict";

  const cfg = window.APP_CONFIG;
  const $app = document.getElementById("app");
  const $modal = document.getElementById("modal");
  const $print = document.getElementById("print");
  const $toast = document.getElementById("toast");

  const ROLES = {
    schule: { label: "Schule / Lerninsel", short: "S" },
    tischli: { label: "Es Tischli für Alli", short: "T" }
  };

  // ---------- Hilfsfunktionen ----------
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pad = (n) => String(n).padStart(2, "0");
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const mondayOf = (d) => addDays(new Date(d.getFullYear(), d.getMonth(), d.getDate()), -((d.getDay() + 6) % 7));
  const weekdayNum = (d) => ((d.getDay() + 6) % 7) + 1; // 1 = Mo
  const isoWeek = (d) => {
    const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const day = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - day);
    const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    return Math.ceil(((t - y) / 86400000 + 1) / 7);
  };
  const DAY_SHORT = ["", "Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
  const DAY_LONG = ["", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];
  const fmtShort = (d) => `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.`;
  const fmtLong = (d) => `${DAY_LONG[weekdayNum(d)]}, ${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
  const fullName = (s) => `${s.first_name} ${s.last_name}`;
  const cmpNat = (a, b) => String(a || "").localeCompare(String(b || ""), "de", { numeric: true, sensitivity: "base" });
  const sortStudents = (list) => list.slice().sort((a, b) =>
    cmpNat(a.class_name || "~", b.class_name || "~") || cmpNat(a.last_name, b.last_name) || cmpNat(a.first_name, b.first_name));
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

  function datesBetween(fromIso, toIso, weekdays) {
    const out = [];
    let d = parse(fromIso);
    const end = parse(toIso);
    let guard = 0;
    while (d <= end && guard++ < 400) {
      if (weekdays.includes(weekdayNum(d))) out.push(iso(d));
      d = addDays(d, 1);
    }
    return out;
  }

  function toast(msg, type = "ok") {
    $toast.textContent = msg;
    $toast.className = `show ${type}`;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { $toast.className = ""; }, type === "error" ? 6000 : 2800);
  }
  function errMsg(e) {
    const m = (e && (e.message || e.error_description)) || String(e);
    if (/Invalid login credentials/i.test(m)) return "E-Mail oder Passwort ist falsch.";
    if (/Email not confirmed/i.test(m)) return "Die E-Mail-Adresse ist noch nicht bestätigt. Bitte den Link in der Bestätigungs-E-Mail anklicken.";
    if (/Database error saving new user|INVALID_REGISTRATION_CODE/i.test(m)) return "Der Registrierungscode ist ungültig.";
    if (/already registered|already been registered/i.test(m)) return "Diese E-Mail-Adresse ist bereits registriert. Bitte anmelden.";
    if (/Password should be at least/i.test(m)) return "Das Passwort ist zu kurz (mindestens 8 Zeichen).";
    if (/rate limit|too many/i.test(m)) return "Zu viele Versuche. Bitte einige Minuten warten.";
    if (/Signups not allowed/i.test(m)) return "Die Registrierung ist in Supabase noch ausgeschaltet (siehe README).";
    if (/Failed to fetch|NetworkError/i.test(m)) return "Keine Verbindung zum Server. Bitte Internetverbindung prüfen.";
    if (/row-level security|permission denied/i.test(m)) return "Keine Berechtigung für diese Aktion.";
    return m;
  }
  const showError = (e) => { console.error(e); toast(errMsg(e), "error"); };

  async function act(fn, okMsg) {
    try {
      await fn();
      if (okMsg) toast(okMsg);
      await reload();
      return true;
    } catch (e) { showError(e); return false; }
  }

  // ---------- Zustand ----------
  let store;
  try {
    store = (cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY) ? createSupabaseStore(cfg) : createDemoStore(cfg);
  } catch (e) {
    $app.innerHTML = `<p class="loading error">${esc(errMsg(e))}</p>`;
    return;
  }

  const S = {
    profile: null,
    weekStart: mondayOf(new Date()),
    students: [],
    absences: [],
    closed: [],
    filterClass: "",
    search: ""
  };

  const weekDays = () => cfg.DAYS.map((n) => addDays(S.weekStart, n - 1));
  const myRole = () => S.profile.role;
  const otherRole = () => (myRole() === "schule" ? "tischli" : "schule");

  function absIndex() {
    const m = new Map();
    for (const a of S.absences) {
      const k = `${a.student_id}|${a.day}`;
      if (!m.has(k)) m.set(k, {});
      m.get(k)[a.source] = a;
    }
    return m;
  }
  const closedIndex = () => new Map(S.closed.map((c) => [c.day, c]));

  function statusOf(s, d, absMap, closedMap) {
    const day = iso(d);
    if (closedMap.has(day)) return { kind: "closed" };
    if (!(s.weekdays || []).includes(weekdayNum(d))) return { kind: "off" };
    const a = absMap.get(`${s.id}|${day}`) || {};
    if (a.schule || a.tischli) return { kind: "absent", a };
    return { kind: "present" };
  }

  function remarkBreakdown(students) {
    const presets = cfg.REMARK_PRESETS || [];
    const counts = presets.map((p) => ({ label: p, n: 0 }));
    let other = 0;
    for (const s of students) {
      const r = (s.remark || "").toLowerCase();
      if (!r.trim()) continue;
      let matched = false;
      counts.forEach((c) => { if (r.includes(c.label.toLowerCase())) { c.n++; matched = true; } });
      if (!matched) other++;
    }
    const out = counts.filter((c) => c.n > 0);
    if (other) out.push({ label: "andere Bemerkung", n: other });
    return out;
  }

  // ---------- Automatisches Logout ----------
  const SESS_KEY = "mittagstisch-session";
  const IDLE_MS = Math.max(0, Number(cfg.IDLE_TIMEOUT_MINUTES ?? 30)) * 60000;
  const MAX_MS = Math.max(0, Number(cfg.MAX_SESSION_HOURS ?? 10)) * 3600000;
  const WARN_MS = Math.min(60000, IDLE_MS / 2);
  const CHECK_MS = Math.min(10000, Math.max(1000, IDLE_MS / 10 || 10000));
  const ACT_EVENTS = ["pointerdown", "keydown", "wheel", "touchstart", "mousemove"];

  const sessGet = () => { try { return JSON.parse(sessionStorage.getItem(SESS_KEY)) || {}; } catch (e) { return {}; } };
  const sessSet = (v) => { try { sessionStorage.setItem(SESS_KEY, JSON.stringify(v)); } catch (e) { /* ignorieren */ } };
  const sessClear = () => { try { sessionStorage.removeItem(SESS_KEY); } catch (e) { /* ignorieren */ } };
  const markLogin = () => { const n = Date.now(); sessSet({ loginAt: n, lastActivity: n }); };

  let idleTimer = null, warnTimer = null, $warn = null;
  let loginAt = Date.now(), lastActivity = Date.now();

  const fmtDur = (ms) => {
    const min = Math.round(ms / 60000);
    if (min < 60) return `${min} Minute${min === 1 ? "" : "n"}`;
    const h = Math.round(min / 6) / 10;
    return `${String(h).replace(".", ",")} Stunde${h === 1 ? "" : "n"}`;
  };

  function onActivity(e) {
    // Während die Warnung offen ist, zählen nur die Knöpfe (kein Wegklicken durch Mausbewegung)
    if ($warn && e) return;
    const n = Date.now();
    if (!$warn && n - lastActivity < 5000) return; // nicht bei jeder Mausbewegung speichern
    lastActivity = n;
    const s = sessGet(); s.lastActivity = n; sessSet(s);
    hideWarn();
  }

  // gibt true zurück, wenn abgemeldet wurde
  function checkIdle() {
    if (!S.profile) return false;
    const n = Date.now();
    if (MAX_MS && n - loginAt >= MAX_MS) {
      doLogout(`Sie wurden nach ${fmtDur(MAX_MS)} automatisch abgemeldet. Bitte erneut anmelden.`);
      return true;
    }
    if (IDLE_MS) {
      const idle = n - lastActivity;
      if (idle >= IDLE_MS) {
        doLogout(`Sie wurden nach ${fmtDur(IDLE_MS)} ohne Aktivität automatisch abgemeldet.`);
        return true;
      }
      if (idle >= IDLE_MS - WARN_MS) showWarn();
    }
    return false;
  }

  function startIdleWatch() {
    stopIdleWatch();
    const s = sessGet(), n = Date.now();
    if (!s.loginAt) { s.loginAt = n; s.lastActivity = n; sessSet(s); }
    loginAt = s.loginAt;
    lastActivity = s.lastActivity || n;
    if (checkIdle()) return false; // z.B. Seite nach langer Pause neu geladen
    if (!IDLE_MS && !MAX_MS) return true;
    ACT_EVENTS.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    document.addEventListener("visibilitychange", checkIdle); // z.B. nach Standby des Laptops sofort prüfen
    idleTimer = setInterval(checkIdle, CHECK_MS);
    return true;
  }

  function stopIdleWatch() {
    clearInterval(idleTimer); idleTimer = null;
    ACT_EVENTS.forEach((e) => window.removeEventListener(e, onActivity));
    document.removeEventListener("visibilitychange", checkIdle);
    hideWarn();
  }

  function showWarn() {
    if ($warn) return;
    $warn = document.createElement("dialog");
    $warn.className = "idle-warn";
    $warn.innerHTML = `
      <div class="modal-inner">
        <h3>Noch da?</h3>
        <p>Sie werden in <strong id="idleSec"></strong> Sekunden automatisch abgemeldet.</p>
        <div class="row-actions">
          <button class="btn ghost" id="idleOut">Jetzt abmelden</button>
          <button class="btn primary" id="idleStay">Angemeldet bleiben</button>
        </div>
      </div>`;
    document.body.appendChild($warn);
    $warn.addEventListener("cancel", (ev) => { ev.preventDefault(); onActivity(); }); // Esc = bleiben
    $warn.querySelector("#idleStay").onclick = () => onActivity();
    $warn.querySelector("#idleOut").onclick = () => doLogout("Sie wurden abgemeldet.");
    const upd = () => {
      const left = Math.max(0, Math.ceil((IDLE_MS - (Date.now() - lastActivity)) / 1000));
      const el = $warn && $warn.querySelector("#idleSec");
      if (el) el.textContent = left;
      if (left <= 0) checkIdle();
    };
    upd();
    warnTimer = setInterval(upd, 1000);
    try { $warn.showModal(); } catch (e) { $warn.setAttribute("open", ""); }
    $warn.querySelector("#idleStay").focus();
  }

  function hideWarn() {
    clearInterval(warnTimer); warnTimer = null;
    if ($warn) { try { $warn.close(); } catch (e) { /* ignorieren */ } $warn.remove(); $warn = null; }
  }

  async function doLogout(info = "") {
    stopIdleWatch();
    sessClear();
    closeModal();
    $print.innerHTML = "";
    S.profile = null;
    try { await store.signOut(); } catch (e) { console.error(e); }
    renderLogin("", "login", info);
  }

  // ---------- Start ----------
  async function init() {
    try {
      const session = await store.getSession();
      if (!session) { sessClear(); return renderLogin(); }
      S.profile = await store.getProfile();
      if (!S.profile) return renderNoProfile();
      if (!startIdleWatch()) return;
      renderShell();
      await reload();
      store.subscribe(debounce(() => reload(), 400));
    } catch (e) {
      renderLogin(errMsg(e));
    }
  }

  // ---------- Login ----------
  // mode: "login" | "register";  info: Erfolgsmeldung (z.B. nach Registrierung)
  function renderLogin(msg, mode = "login", info = "") {
    const reg = mode === "register";
    $app.innerHTML = `
      <main class="login">
        <div class="login-card">
          <div class="login-logo" aria-hidden="true">🍽️</div>
          <h1>${esc(cfg.TITLE)}</h1>
          <p class="muted">Gemeinsamer Kalender für die Schule / Lerninsel und «Es Tischli für Alli».</p>
          ${info ? `<p class="info-text" role="status">${esc(info)}</p>` : ""}
          ${store.demo ? `
            <div class="note">
              <strong>Demo-Modus</strong> – Daten werden nur in diesem Browser gespeichert.
              Für den echten Betrieb Supabase in <code>config.js</code> eintragen (siehe README).
            </div>
            <div class="stack">
              <button class="btn primary lg" data-demo-role="schule">Weiter als Schule / Lerninsel</button>
              <button class="btn tischli lg" data-demo-role="tischli">Weiter als Es Tischli für Alli</button>
            </div>` : `
            <div class="tabs" role="tablist">
              <button type="button" role="tab" class="tab ${reg ? "" : "active"}" aria-selected="${!reg}" data-mode="login">Anmelden</button>
              <button type="button" role="tab" class="tab ${reg ? "active" : ""}" aria-selected="${reg}" data-mode="register">Registrieren</button>
            </div>
            ${reg ? `
            <form id="regForm" class="stack">
              <label>Vor- und Nachname<input name="display_name" required maxlength="80" autocomplete="name"></label>
              <label>E-Mail<input type="email" name="email" required autocomplete="email"></label>
              <div class="two">
                <label>Passwort<input type="password" name="password" required minlength="8" autocomplete="new-password"></label>
                <label>Wiederholen<input type="password" name="password2" required minlength="8" autocomplete="new-password"></label>
              </div>
              <label>Registrierungscode
                <input name="code" required autocomplete="off" spellcheck="false">
                <span class="field-help">Den Code erhalten Sie von der Schule / Lerninsel bzw. von «Es Tischli für Alli». Er legt fest, für welche Stelle Sie arbeiten.</span>
              </label>
              <button class="btn primary lg" type="submit">Konto erstellen</button>
            </form>` : `
            <form id="loginForm" class="stack">
              <label>E-Mail<input type="email" name="email" required autocomplete="username"></label>
              <label>Passwort<input type="password" name="password" required autocomplete="current-password"></label>
              <button class="btn primary lg" type="submit">Anmelden</button>
            </form>`}`}
          ${msg ? `<p class="error-text">${esc(msg)}</p>` : ""}
        </div>
      </main>`;

    $app.querySelectorAll("[data-demo-role]").forEach((b) =>
      b.addEventListener("click", async () => { await store.signIn(b.dataset.demoRole); markLogin(); init(); }));
    $app.querySelectorAll("[data-mode]").forEach((b) =>
      b.addEventListener("click", () => renderLogin("", b.dataset.mode)));

    const form = document.getElementById("loginForm");
    if (form) form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = form.querySelector("button[type=submit]");
      btn.disabled = true; btn.textContent = "Anmelden …";
      try {
        await store.signIn(form.email.value.trim(), form.password.value);
        markLogin();
        await init();
      } catch (err) {
        renderLogin(errMsg(err), "login");
        const f = document.getElementById("loginForm");
        if (f) f.email.value = form.email.value;
      }
    });

    const rf = document.getElementById("regForm");
    if (rf) rf.addEventListener("submit", async (e) => {
      e.preventDefault();
      const vals = {
        displayName: rf.display_name.value.trim(),
        email: rf.email.value.trim(),
        password: rf.password.value,
        code: rf.code.value.trim()
      };
      const showErr = (m) => {
        let p = rf.parentElement.querySelector(".error-text");
        if (!p) { p = document.createElement("p"); p.className = "error-text"; rf.after(p); }
        p.textContent = m;
      };
      if (vals.password.length < 8) return showErr("Das Passwort muss mindestens 8 Zeichen lang sein.");
      if (vals.password !== rf.password2.value) return showErr("Die beiden Passwörter stimmen nicht überein.");
      const btn = rf.querySelector("button[type=submit]");
      btn.disabled = true; btn.textContent = "Konto wird erstellt …";
      try {
        const { needsConfirm } = await store.signUp(vals);
        if (needsConfirm) {
          renderLogin("", "login",
            `Fast geschafft! Wir haben eine Bestätigungs-E-Mail an ${vals.email} gesendet. Bitte den Link darin anklicken und sich danach hier anmelden.`);
        } else {
          markLogin();
          await init();
        }
      } catch (err) {
        btn.disabled = false; btn.textContent = "Konto erstellen";
        showErr(errMsg(err));
      }
    });
  }

  function renderNoProfile() {
    $app.innerHTML = `
      <main class="login"><div class="login-card">
        <h1>Kein Zugang eingerichtet</h1>
        <p class="muted">Ihr Konto hat noch keine Stelle (Schule/Lerninsel oder Es Tischli für Alli) zugewiesen.
        Bitte die verantwortliche Person kontaktieren.</p>
        <button class="btn" id="logout">Logout</button>
      </div></main>`;
    document.getElementById("logout").onclick = () => doLogout();
  }

  // ---------- Hauptansicht ----------
  function renderShell() {
    const r = myRole();
    $app.innerHTML = `
      <header class="topbar">
        <div class="brand">
          <span class="brand-logo" aria-hidden="true">🍽️</span>
          <div>
            <div class="brand-title">${esc(cfg.TITLE)}</div>
            <div class="brand-sub">${store.demo ? '<span class="demo-tag">Demo</span> ' : ""}${
              !store.demo && S.profile.display_name ? `${esc(S.profile.display_name)} · ` : "Angemeldet als "}
              <span class="role-pill ${r}">${ROLES[r].label}</span></div>
          </div>
        </div>
        <button class="btn ghost" id="logout">Logout</button>
      </header>

      <section class="toolbar">
        <div class="weeknav">
          <button class="btn icon" id="prev" aria-label="Vorherige Woche">‹</button>
          <button class="btn" id="today">Heute</button>
          <button class="btn icon" id="next" aria-label="Nächste Woche">›</button>
          <input type="date" id="jump" aria-label="Zu Datum springen" title="Zu Datum springen">
          <h2 id="weekLabel"></h2>
        </div>
        <div class="tools">
          <input type="search" id="search" placeholder="Name suchen …" aria-label="Name suchen">
          <select id="classFilter" aria-label="Klasse filtern"></select>
          <button class="btn" id="classAbs">Klasse abmelden</button>
          <button class="btn" id="archive">Archiv</button>
          <button class="btn primary" id="addStudent">+ Schüler/in</button>
        </div>
      </section>

      <div class="legend">
        <span><i class="dot present"></i>Isst mit</span>
        <span><span class="badge schule">S</span>Abgemeldet durch Schule / Lerninsel</span>
        <span><span class="badge tischli">T</span>Abgemeldet durch Es Tischli für Alli</span>
        <span><i class="dot off"></i>Kein Anmeldetag</span>
        <span><i class="dot closed"></i>Kein Mittagstisch</span>
      </div>

      <section class="grid-wrap"><table class="grid" id="grid"></table></section>
      <p class="hint">Feld anklicken = für diesen Tag ab- oder wieder anmelden · Tag anklicken = Tagesliste drucken oder Tag schliessen · Name anklicken = Schüler/in bearbeiten</p>`;

    const $ = (id) => document.getElementById(id);
    $("logout").onclick = () => doLogout("Sie wurden abgemeldet.");
    $("prev").onclick = () => { S.weekStart = addDays(S.weekStart, -7); reload(); };
    $("next").onclick = () => { S.weekStart = addDays(S.weekStart, 7); reload(); };
    $("today").onclick = () => { S.weekStart = mondayOf(new Date()); reload(); };
    $("jump").onchange = (e) => { if (e.target.value) { S.weekStart = mondayOf(parse(e.target.value)); reload(); } };
    $("search").oninput = (e) => { S.search = e.target.value; renderGrid(); };
    $("classFilter").onchange = (e) => { S.filterClass = e.target.value; renderGrid(); };
    $("addStudent").onclick = () => openStudent(null);
    $("archive").onclick = openArchive;
    $("classAbs").onclick = openClassAbsence;

    $("grid").addEventListener("click", (e) => {
      const cell = e.target.closest("td.cell[data-sid]");
      if (cell) return openCell(cell.dataset.sid, cell.dataset.day);
      const name = e.target.closest("[data-edit]");
      if (name) return openStudent(name.dataset.edit);
      const head = e.target.closest("[data-dayhead]");
      if (head) return openDay(head.dataset.dayhead);
    });
  }

  async function reload() {
    if (!S.profile) return;
    const days = weekDays();
    const from = iso(days[0]), to = iso(days[days.length - 1]);
    try {
      const [students, absences, closed] = await Promise.all([
        store.listStudents(), store.listAbsences(from, to), store.listClosed(from, to)
      ]);
      S.students = sortStudents(students);
      S.absences = absences;
      S.closed = closed;
      renderGrid();
    } catch (e) { showError(e); }
  }

  function classes() {
    return [...new Set(S.students.filter((s) => s.active && s.class_name).map((s) => s.class_name))].sort(cmpNat);
  }

  function renderGrid() {
    const grid = document.getElementById("grid");
    if (!grid) return;
    const days = weekDays();
    const todayIso = iso(new Date());
    const last = days[days.length - 1];
    document.getElementById("weekLabel").textContent =
      `KW ${isoWeek(days[0])} · ${fmtShort(days[0])} – ${fmtShort(last)}${last.getFullYear()}`;

    const cls = classes();
    if (S.filterClass && !cls.includes(S.filterClass)) S.filterClass = "";
    document.getElementById("classFilter").innerHTML =
      `<option value="">Alle Klassen</option>` +
      cls.map((c) => `<option value="${esc(c)}" ${c === S.filterClass ? "selected" : ""}>Klasse ${esc(c)}</option>`).join("");

    const q = S.search.trim().toLowerCase();
    const list = S.students.filter((s) => s.active &&
      (!S.filterClass || s.class_name === S.filterClass) &&
      (!q || `${s.first_name} ${s.last_name} ${s.class_name || ""}`.toLowerCase().includes(q)));

    const absMap = absIndex();
    const closedMap = closedIndex();
    const me = myRole();

    let head = `<thead><tr><th class="name-col">Schüler/in</th>`;
    for (const d of days) {
      const di = iso(d);
      const c = closedMap.get(di);
      head += `<th class="day-col ${di === todayIso ? "today" : ""} ${c ? "is-closed" : ""}">
        <button class="day-head" data-dayhead="${di}" title="Tagesliste / Tag schliessen">
          <span class="dn">${DAY_SHORT[weekdayNum(d)]}</span><span class="dd">${fmtShort(d)}</span>
          ${c ? `<span class="closed-note">${esc(c.note || "geschlossen")}</span>` : ""}
        </button></th>`;
    }
    head += `</tr></thead>`;

    let body = "<tbody>";
    if (!list.length) {
      body += `<tr><td class="empty" colspan="${days.length + 1}">
        ${S.students.some((s) => s.active) ? "Keine Treffer für diese Suche / diesen Filter." : "Noch keine Schüler/innen erfasst. Mit «+ Schüler/in» beginnen."}
      </td></tr>`;
    }
    let lastClass = null;
    for (const s of list) {
      const c = s.class_name || "";
      if (c !== lastClass) {
        const n = list.filter((x) => (x.class_name || "") === c).length;
        body += `<tr class="group"><td colspan="${days.length + 1}">${c ? `Klasse ${esc(c)}` : "Ohne Klasse"} <span>${n}</span></td></tr>`;
        lastClass = c;
      }
      body += `<tr><th class="name-col" scope="row">
        <button class="name-btn" data-edit="${s.id}">
          <span class="nm">${esc(s.last_name)} ${esc(s.first_name)}</span>
          ${s.remark ? `<span class="remark">${esc(s.remark)}</span>` : ""}
        </button></th>`;
      for (const d of days) {
        const st = statusOf(s, d, absMap, closedMap);
        const di = iso(d);
        if (st.kind === "closed") { body += `<td class="cell closed" aria-label="Kein Mittagstisch"></td>`; continue; }
        if (st.kind === "off") { body += `<td class="cell off" title="Kein Anmeldetag">–</td>`; continue; }
        if (st.kind === "present") {
          body += `<td class="cell present" data-sid="${s.id}" data-day="${di}" title="Isst mit – klicken zum Abmelden"><i class="dot present"></i></td>`;
          continue;
        }
        const tips = [];
        let badges = "";
        for (const r of ["schule", "tischli"]) {
          if (st.a[r]) {
            badges += `<span class="badge ${r} ${r === me ? "mine" : ""}">${ROLES[r].short}</span>`;
            tips.push(`${ROLES[r].label}${st.a[r].reason ? ": " + st.a[r].reason : ""}`);
          }
        }
        body += `<td class="cell absent" data-sid="${s.id}" data-day="${di}" title="Abgemeldet – ${esc(tips.join(" | "))}">${badges}</td>`;
      }
      body += `</tr>`;
    }
    body += "</tbody>";

    let foot = `<tfoot><tr><th class="name-col">Essen${S.filterClass || q ? " <small>(Auswahl)</small>" : ""}</th>`;
    for (const d of days) {
      if (closedMap.has(iso(d))) { foot += `<td class="sum closed">–</td>`; continue; }
      const eating = list.filter((s) => statusOf(s, d, absMap, closedMap).kind === "present");
      const br = remarkBreakdown(eating);
      foot += `<td class="sum"><strong>${eating.length}</strong>${br.length ? `<small>${br.map((b) => `${b.n} ${esc(b.label)}`).join("<br>")}</small>` : ""}</td>`;
    }
    foot += `</tr></tfoot>`;

    grid.innerHTML = head + body + foot;
  }

  // ---------- Modal ----------
  function openModal(html, bind) {
    $modal.innerHTML = `<div class="modal-inner">${html}</div>`;
    if (!$modal.open) $modal.showModal();
    if (bind) bind($modal);
    const first = $modal.querySelector("input:not([type=hidden]), select, textarea");
    if (first) first.focus();
  }
  const closeModal = () => $modal.open && $modal.close();
  $modal.addEventListener("click", (e) => {
    if (e.target === $modal || e.target.closest("[data-close]")) closeModal();
  });

  // ---------- Feld: ab-/anmelden ----------
  function openCell(sid, day) {
    const s = S.students.find((x) => x.id === sid);
    if (!s) return;
    const d = parse(day);
    const me = myRole(), other = otherRole();
    const a = absIndex().get(`${sid}|${day}`) || {};
    const mine = a[me], theirs = a[other];

    const line = (r) => {
      const x = a[r];
      return `<div class="status-line">
        <span class="badge ${r}">${ROLES[r].short}</span>
        <span><strong>${ROLES[r].label}:</strong> ${x ? `abgemeldet${x.reason ? ` – ${esc(x.reason)}` : ""}` : "keine Abmeldung"}</span>
      </div>`;
    };

    openModal(`
      <header class="modal-head">
        <div><h3>${esc(fullName(s))}</h3><p class="muted">${s.class_name ? `Klasse ${esc(s.class_name)} · ` : ""}${fmtLong(d)}</p></div>
        <button class="btn icon ghost" data-close aria-label="Schliessen">×</button>
      </header>
      ${s.remark ? `<p class="remark-box">Bemerkung: ${esc(s.remark)}</p>` : ""}
      <div class="status-box">${line("schule")}${line("tischli")}</div>
      <form id="absForm" class="stack">
        <h4>Ihre Abmeldung (${ROLES[me].label})</h4>
        <label>Grund <span class="muted">(optional)</span>
          <input name="reason" maxlength="200" value="${esc(mine ? mine.reason : "")}" placeholder="z.B. krank, Exkursion, Lager, Eltern">
        </label>
        ${mine ? "" : `<label>Bis und mit <span class="muted">(für mehrere Tage)</span>
          <input type="date" name="until" value="${day}" min="${day}"></label>`}
        <div class="row-actions">
          ${mine ? `<button type="button" class="btn danger-outline" id="reAdd">Wieder anmelden</button>
                    <button type="submit" class="btn primary">Grund speichern</button>`
                 : `<button type="button" class="btn ghost" data-close>Abbrechen</button>
                    <button type="submit" class="btn primary">Abmelden</button>`}
        </div>
        ${theirs && !mine ? `<p class="muted small">Bereits abgemeldet durch ${ROLES[other].label}. Ihre Abmeldung wird zusätzlich erfasst.</p>` : ""}
        ${theirs && mine ? `<p class="muted small">Auch nach «Wieder anmelden» bleibt die Abmeldung von ${ROLES[other].label} bestehen.</p>` : ""}
      </form>`, (m) => {
      const form = m.querySelector("#absForm");
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const reason = form.reason.value.trim() || null;
        const until = form.until ? form.until.value || day : day;
        if (until < day) return toast("«Bis und mit» liegt vor dem Startdatum.", "error");
        const dates = datesBetween(day, until, s.weekdays || []);
        if (!dates.includes(day)) dates.unshift(day);
        const rows = dates.map((dd) => ({ student_id: sid, day: dd, source: me, reason }));
        const ok = await act(() => store.addAbsences(rows),
          mine ? "Grund gespeichert." : rows.length > 1 ? `${rows.length} Tage abgemeldet.` : "Abgemeldet.");
        if (ok) closeModal();
      });
      const re = m.querySelector("#reAdd");
      if (re) re.onclick = async () => {
        const ok = await act(() => store.removeAbsence(sid, day, me), "Wieder angemeldet.");
        if (ok) closeModal();
      };
    });
  }

  // ---------- Schüler/in erfassen / bearbeiten ----------
  function openStudent(id) {
    const s = id ? S.students.find((x) => x.id === id) : null;
    const wd = s ? (s.weekdays || []) : cfg.DEFAULT_DAYS;
    const presets = cfg.REMARK_PRESETS || [];
    openModal(`
      <header class="modal-head">
        <h3>${s ? "Schüler/in bearbeiten" : "Schüler/in hinzufügen"}</h3>
        <button class="btn icon ghost" data-close aria-label="Schliessen">×</button>
      </header>
      <form id="stuForm" class="stack">
        <div class="two">
          <label>Vorname<input name="first_name" required maxlength="80" value="${esc(s?.first_name)}"></label>
          <label>Nachname<input name="last_name" required maxlength="80" value="${esc(s?.last_name)}"></label>
        </div>
        <label>Klasse<input name="class_name" maxlength="20" list="classList" value="${esc(s?.class_name)}" placeholder="z.B. 1a">
          <datalist id="classList">${classes().map((c) => `<option value="${esc(c)}">`).join("")}</datalist></label>
        <label>Bemerkung <span class="muted">(Ernährung etc.)</span>
          <input name="remark" maxlength="200" value="${esc(s?.remark)}" placeholder="z.B. vegetarisch">
        </label>
        <div class="chips">${presets.map((p) => `<button type="button" class="chip" data-preset="${esc(p)}">+ ${esc(p)}</button>`).join("")}</div>
        <fieldset>
          <legend>Angemeldet für</legend>
          <div class="days">
            ${cfg.DAYS.map((n) => `<label class="day-check"><input type="checkbox" name="wd" value="${n}" ${wd.includes(n) ? "checked" : ""}>${DAY_SHORT[n]}</label>`).join("")}
          </div>
        </fieldset>
        <div class="row-actions">
          ${s ? `<button type="button" class="btn danger-outline" id="archiveBtn">Entfernen</button>` : ""}
          <span class="spacer"></span>
          <button type="button" class="btn ghost" data-close>Abbrechen</button>
          <button type="submit" class="btn primary">Speichern</button>
        </div>
      </form>`, (m) => {
      const form = m.querySelector("#stuForm");
      m.querySelectorAll("[data-preset]").forEach((b) => b.onclick = () => {
        const cur = form.remark.value.trim();
        const p = b.dataset.preset;
        if (cur.toLowerCase().includes(p.toLowerCase())) return;
        form.remark.value = cur ? `${cur}, ${p}` : p;
      });
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const weekdays = [...form.querySelectorAll("input[name=wd]:checked")].map((x) => Number(x.value));
        if (!weekdays.length) return toast("Bitte mindestens einen Tag auswählen.", "error");
        const data = {
          id: s?.id, active: s ? s.active : true,
          first_name: form.first_name.value.trim(), last_name: form.last_name.value.trim(),
          class_name: form.class_name.value.trim(), remark: form.remark.value.trim(), weekdays
        };
        if (!data.first_name || !data.last_name) return toast("Vor- und Nachname sind Pflicht.", "error");
        const ok = await act(() => store.saveStudent(data), s ? "Gespeichert." : `${fullName(data)} hinzugefügt.`);
        if (ok) closeModal();
      });
      const ab = m.querySelector("#archiveBtn");
      if (ab) ab.onclick = async () => {
        if (!confirm(`${fullName(s)} vom Mittagstisch entfernen?\n\nDie Person wird ins Archiv verschoben und kann dort wiederhergestellt oder endgültig gelöscht werden.`)) return;
        const ok = await act(() => store.setActive(s.id, false), `${fullName(s)} entfernt (Archiv).`);
        if (ok) closeModal();
      };
    });
  }

  // ---------- Archiv ----------
  function openArchive() {
    const arch = S.students.filter((s) => !s.active);
    openModal(`
      <header class="modal-head">
        <h3>Archiv – entfernte Schüler/innen</h3>
        <button class="btn icon ghost" data-close aria-label="Schliessen">×</button>
      </header>
      ${arch.length ? `<ul class="archive-list">${arch.map((s) => `
        <li><div><strong>${esc(fullName(s))}</strong><span class="muted">${s.class_name ? ` · Klasse ${esc(s.class_name)}` : ""}</span></div>
          <div class="row-actions tight">
            <button class="btn" data-restore="${s.id}">Wiederherstellen</button>
            <button class="btn danger-outline" data-delete="${s.id}">Löschen</button>
          </div></li>`).join("")}</ul>`
        : `<p class="muted">Das Archiv ist leer.</p>`}`, (m) => {
      m.querySelectorAll("[data-restore]").forEach((b) => b.onclick = async () => {
        await act(() => store.setActive(b.dataset.restore, true), "Wiederhergestellt.");
        openArchive();
      });
      m.querySelectorAll("[data-delete]").forEach((b) => b.onclick = async () => {
        const s = S.students.find((x) => x.id === b.dataset.delete);
        if (!confirm(`${fullName(s)} endgültig löschen?\n\nAlle Abmeldungen dieser Person werden ebenfalls gelöscht. Dies kann nicht rückgängig gemacht werden.`)) return;
        await act(() => store.deleteStudent(s.id), "Endgültig gelöscht.");
        openArchive();
      });
    });
  }

  // ---------- Klasse / alle abmelden ----------
  function openClassAbsence() {
    const cls = classes();
    const me = myRole();
    const start = iso(weekDays()[0]) > iso(new Date()) ? iso(weekDays()[0]) : iso(new Date());
    openModal(`
      <header class="modal-head">
        <h3>Klasse abmelden</h3>
        <button class="btn icon ghost" data-close aria-label="Schliessen">×</button>
      </header>
      <p class="muted">Für Exkursionen, Lager, Projekttage usw. Erfasst als Abmeldung durch <strong>${ROLES[me].label}</strong>.</p>
      <form id="clsForm" class="stack">
        <label>Klasse
          <select name="cls" required>
            ${S.filterClass ? "" : `<option value="">– bitte wählen –</option>`}
            ${cls.map((c) => `<option value="${esc(c)}" ${c === S.filterClass ? "selected" : ""}>Klasse ${esc(c)}</option>`).join("")}
            <option value="__all">Alle Schüler/innen</option>
          </select></label>
        <div class="two">
          <label>Von<input type="date" name="from" required value="${start}"></label>
          <label>Bis und mit<input type="date" name="to" required value="${start}"></label>
        </div>
        <label>Grund<input name="reason" maxlength="200" placeholder="z.B. Klassenlager"></label>
        <div class="row-actions">
          <button type="button" class="btn ghost" data-close>Abbrechen</button>
          <button type="submit" class="btn primary">Abmelden</button>
        </div>
      </form>`, (m) => {
      const form = m.querySelector("#clsForm");
      form.from.addEventListener("change", () => { if (form.to.value < form.from.value) form.to.value = form.from.value; });
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const c = form.cls.value, from = form.from.value, to = form.to.value;
        if (!c) return toast("Bitte eine Klasse wählen.", "error");
        if (to < from) return toast("«Bis und mit» liegt vor «Von».", "error");
        const target = S.students.filter((s) => s.active && (c === "__all" || s.class_name === c));
        const reason = form.reason.value.trim() || null;
        const rows = [];
        for (const s of target) for (const d of datesBetween(from, to, s.weekdays || [])) rows.push({ student_id: s.id, day: d, source: me, reason });
        if (!rows.length) return toast("Im gewählten Zeitraum hat niemand einen Anmeldetag.", "error");
        const label = c === "__all" ? "alle Schüler/innen" : `Klasse ${c}`;
        if (!confirm(`${rows.length} Abmeldungen für ${label} erfassen?`)) return;
        const ok = await act(() => store.addAbsences(rows), `${rows.length} Abmeldungen erfasst.`);
        if (ok) closeModal();
      });
    });
  }

  // ---------- Tag: Liste / schliessen ----------
  function openDay(day) {
    const d = parse(day);
    const c = closedIndex().get(day);
    const absMap = absIndex(), closedMap = closedIndex();
    const active = S.students.filter((s) => s.active);
    const eating = active.filter((s) => statusOf(s, d, absMap, closedMap).kind === "present");
    const absent = active.filter((s) => statusOf(s, d, absMap, closedMap).kind === "absent");
    openModal(`
      <header class="modal-head">
        <div><h3>${fmtLong(d)}</h3><p class="muted">KW ${isoWeek(d)}</p></div>
        <button class="btn icon ghost" data-close aria-label="Schliessen">×</button>
      </header>
      ${c ? `<div class="status-box"><p><strong>Kein Mittagstisch</strong>${c.note ? ` – ${esc(c.note)}` : ""}</p></div>
             <div class="row-actions"><button class="btn primary" id="reopen">Mittagstisch wieder öffnen</button></div>`
          : `<div class="stats">
              <div><strong>${eating.length}</strong><span>essen</span></div>
              <div><strong>${absent.length}</strong><span>abgemeldet</span></div>
            </div>
            <div class="row-actions"><button class="btn primary" id="printDay">Tagesliste drucken</button></div>
            <form id="closeForm" class="stack top-gap">
              <h4>Kein Mittagstisch an diesem Tag?</h4>
              <label>Grund<input name="note" maxlength="100" placeholder="z.B. Herbstferien, Feiertag, Weiterbildung"></label>
              <div class="row-actions"><button type="submit" class="btn danger-outline">Tag schliessen</button></div>
            </form>`}`, (m) => {
      const re = m.querySelector("#reopen");
      if (re) re.onclick = async () => { if (await act(() => store.removeClosed(day), "Tag wieder geöffnet.")) closeModal(); };
      const pr = m.querySelector("#printDay");
      if (pr) pr.onclick = () => { closeModal(); printDay(day); };
      const cf = m.querySelector("#closeForm");
      if (cf) cf.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (!confirm(`Am ${fmtLong(d)} findet kein Mittagstisch statt?`)) return;
        if (await act(() => store.setClosed(day, cf.note.value.trim()), "Tag geschlossen.")) closeModal();
      });
    });
  }

  function printDay(day) {
    const d = parse(day);
    const absMap = absIndex(), closedMap = closedIndex();
    const active = S.students.filter((s) => s.active);
    const eating = active.filter((s) => statusOf(s, d, absMap, closedMap).kind === "present");
    const absent = active.filter((s) => statusOf(s, d, absMap, closedMap).kind === "absent");
    const br = remarkBreakdown(eating);
    const now = new Date();

    $print.innerHTML = `
      <h1>Mittagstisch – ${fmtLong(d)}</h1>
      <p class="p-meta">${esc(cfg.TITLE)} · Stand ${fmtShort(now)}${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}</p>
      <div class="p-sum"><strong>${eating.length} Essen</strong>${br.length ? " · davon " + br.map((b) => `${b.n} ${esc(b.label)}`).join(" · ") : ""}</div>
      <table class="p-table">
        <thead><tr><th>#</th><th>Name</th><th>Klasse</th><th>Bemerkung</th><th>Da</th></tr></thead>
        <tbody>${eating.map((s, i) => `<tr><td>${i + 1}</td><td>${esc(s.last_name)} ${esc(s.first_name)}</td><td>${esc(s.class_name)}</td><td>${esc(s.remark)}</td><td class="box">☐</td></tr>`).join("")}</tbody>
      </table>
      ${absent.length ? `
      <h2>Abgemeldet (${absent.length})</h2>
      <table class="p-table">
        <thead><tr><th>Name</th><th>Klasse</th><th>Abgemeldet durch</th><th>Grund</th></tr></thead>
        <tbody>${absent.map((s) => {
          const a = absMap.get(`${s.id}|${day}`) || {};
          const src = ["schule", "tischli"].filter((r) => a[r]);
          return `<tr><td>${esc(s.last_name)} ${esc(s.first_name)}</td><td>${esc(s.class_name)}</td>
            <td>${src.map((r) => ROLES[r].label).join(", ")}</td>
            <td>${src.map((r) => esc(a[r].reason)).filter(Boolean).join(" / ")}</td></tr>`;
        }).join("")}</tbody>
      </table>` : ""}`;
    window.print();
  }

  init();
})();
