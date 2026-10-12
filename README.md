# WHOOP Dashboard

Ein modernes Web-Dashboard für deine WHOOP-Daten – Recovery, Strain, Schlaf, HRV, Ruhepuls und Workouts auf einen Blick, auch auf dem Desktop.

- **React 19 + Vite**, keine Chart-Bibliothek (eigene, schlanke SVG-Charts)
- **Hell- & Dunkelmodus**, responsiv bis Smartphone-Breite
- **Demo-Modus** mit realistischen Beispieldaten – läuft sofort, ohne Konfiguration
- **Live-Modus** über die offizielle WHOOP Developer API v2 (OAuth 2.0)
- Zeitraum 7 / 30 / 90 Tage, Tooltips, Tagestabelle und CSV-Export
- Automatisches Deployment auf **GitHub Pages** per GitHub Actions

---

## 1. Lokal starten

Voraussetzung: [Node.js](https://nodejs.org) 20 oder neuer.

```bash
npm install
npm run dev
```

Öffne http://localhost:5173 – das Dashboard zeigt Demo-Daten.

---

## 2. Auf GitHub Pages veröffentlichen (Demo)

1. Neues, **leeres** und **öffentliches (Public)** Repository auf GitHub anlegen, z. B. `whoop-dashboard` (ohne README, .gitignore oder Lizenz).
   Im kostenlosen GitHub-Plan funktioniert Pages nur mit öffentlichen Repositories. Das ist hier unbedenklich: Im Code stehen keine Geheimnisse und keine WHOOP-Daten.
2. Im Repository: **Settings → Pages → Build and deployment → Source: „GitHub Actions“**.
   Das muss vor dem ersten Push passieren, sonst schlägt das erste Deployment fehl.
3. Code hochladen – entweder per Terminal **oder** per Web-Upload, nicht beides:
   ```bash
   git init
   git add .
   git commit -m "WHOOP Dashboard"
   git branch -M main
   git remote add origin https://github.com/DEIN-NAME/whoop-dashboard.git
   git push -u origin main
   ```
   Beim Web-Upload fehlt oft der versteckte Ordner `.github` (macOS und Windows blenden ihn aus). Ohne ihn läuft kein Build.
4. Unter **Actions** läuft der Workflow „Deploy to GitHub Pages“. Danach ist die App erreichbar unter
   `https://DEIN-NAME.github.io/whoop-dashboard/`.

Damit hast du den ersten Test online – noch mit Demo-Daten.

### Wenn das Deployment fehlschlägt

Öffne **Actions**, klicke den roten Lauf an und dann den roten Job (`build` oder `deploy`). Die Fehlermeldung steht in den letzten Zeilen.

| Meldung | Lösung |
|---|---|
| `Get Pages site failed`, `Not Found` oder `Failed to create deployment (status: 404)` | Pages-Source auf „GitHub Actions“ stellen (Schritt 2), dann im Lauf **Re-run all jobs**. |
| `Branch "main" is not allowed to deploy to github-pages due to environment protection rules` | **Settings → Environments → github-pages → Deployment branches** den Branch `main` erlauben, dann **Re-run all jobs**. |
| Fehlgeschlagener Lauf heisst „pages build and deployment“ | Pages steht noch auf „Deploy from a branch“. Auf „GitHub Actions“ umstellen. |
| Kein Lauf „Deploy to GitHub Pages“ sichtbar | Der Ordner `.github/workflows` fehlt im Repository. Per Terminal pushen (Schritt 3). |
| `git push` meldet `rejected` / `fetch first` | Das Repository hat schon Commits (z. B. vom Web-Upload). Einmalig `git push -u origin main --force` ausführen. |

---

## 3. Mit echten WHOOP-Daten verbinden

### Warum ein kleiner Proxy nötig ist

GitHub Pages liefert nur statische Dateien aus. Für den WHOOP-Login braucht es aber ein **Client Secret**, das niemals im Browser-Code stehen darf, und die WHOOP API erlaubt keine direkten Aufrufe aus dem Browser (CORS). Deshalb gibt es im Ordner `worker/` einen winzigen **Cloudflare Worker** (kostenloser Plan reicht), der nur zwei Dinge tut: Tokens tauschen/erneuern und Lese-Anfragen an WHOOP weiterleiten.

```
Browser (GitHub Pages) ──► Cloudflare Worker (kennt das Secret) ──► api.prod.whoop.com
```

### Schritt 1 – WHOOP-App anlegen

1. Auf [developer-dashboard.whoop.com](https://developer-dashboard.whoop.com) mit deinem WHOOP-Konto anmelden und eine App erstellen.
2. **Redirect URL:** `https://DEIN-NAME.github.io/whoop-dashboard/` (mit Schrägstrich am Ende).
   Für lokales Testen kannst du zusätzlich `http://localhost:5173/` eintragen (falls das Dashboard mehrere Redirect URLs erlaubt).
3. **Scopes:** `read:recovery`, `read:cycles`, `read:sleep`, `read:workout`, `read:profile`, `read:body_measurement` (und `offline` für Refresh-Tokens, falls separat auswählbar).
4. **Client ID** und **Client Secret** notieren.

### Schritt 2 – Worker deployen

```bash
cd worker
# wrangler.toml öffnen und WHOOP_CLIENT_ID, REDIRECT_URI und ALLOWED_ORIGIN eintragen
npx wrangler login
npx wrangler secret put WHOOP_CLIENT_SECRET   # Secret einfügen, wird verschlüsselt gespeichert
npx wrangler deploy
```

Am Ende zeigt Wrangler die URL, z. B. `https://whoop-proxy.DEIN-NAME.workers.dev`.

### Schritt 3 – Dashboard konfigurieren

Im GitHub-Repository unter **Settings → Secrets and variables → Actions → Variables** zwei *Repository variables* anlegen:

| Name | Wert |
|---|---|
| `VITE_WHOOP_CLIENT_ID` | deine WHOOP Client ID |
| `VITE_PROXY_URL` | die Worker-URL aus Schritt 2 |

Danach unter **Actions → Deploy to GitHub Pages → Run workflow** neu bauen. Auf der Seite erscheint jetzt **„Mit WHOOP verbinden“** → Login bei WHOOP → zurück im Dashboard mit deinen echten Daten.

> Die Client ID ist kein Geheimnis und darf im Frontend stehen. Das **Client Secret** gehört ausschliesslich in den Worker.

### Lokal mit echten Daten testen (optional)

```bash
cp .env.example .env.local            # VITE_WHOOP_CLIENT_ID und VITE_PROXY_URL eintragen
cd worker && cp .dev.vars.example .dev.vars && npx wrangler dev   # Proxy lokal auf :8787
```

Für einen rein lokalen Proxy `VITE_PROXY_URL=http://localhost:8787` setzen.

---

## Sicherheit & Datenschutz

- Die Tokens werden nur in deinem Browser (`localStorage`) gespeichert; der Worker speichert nichts.
- Der Worker akzeptiert nur Anfragen von `ALLOWED_ORIGIN` und leitet nur lesende `GET /developer/v2/...`-Aufrufe weiter.
- „Abmelden“ löscht die Tokens im Browser. Den Zugriff ganz widerrufen kannst du in deinem WHOOP-Konto.
- Das Projekt ist für die **persönliche Nutzung** gedacht. Inoffiziell, nicht mit WHOOP verbunden. Kein medizinischer Rat.

---

## Projektstruktur

```
├── index.html
├── src/
│   ├── App.jsx                 Layout, Zeitraum, Demo/Live-Umschaltung
│   ├── styles.css              Design-Tokens (hell/dunkel) und Layout
│   ├── components/
│   │   ├── TodayPanel.jsx      Heute: Ringe + Vitalwerte mit Vergleich zum Ø
│   │   ├── Trends.jsx          Recovery, HRV, Ruhepuls, Strain, Schlafphasen
│   │   ├── TimeChart.jsx       Wiederverwendbarer SVG-Chart (Balken/Linie/gestapelt)
│   │   ├── Ring.jsx            Kreisanzeige
│   │   ├── Workouts.jsx        Workout-Tabelle mit Herzfrequenzzonen
│   │   └── DayTable.jsx        Tagesdaten-Tabelle + CSV-Export
│   └── lib/
│       ├── config.js           Umgebungsvariablen
│       ├── auth.js             OAuth-Login, Token-Speicher, Refresh
│       ├── api.js              WHOOP API v2 (mit Paginierung)
│       ├── transform.js        Cycles + Recovery + Schlaf → Tageszeilen
│       ├── mock.js             Demo-Daten im API-Format
│       └── format.js           Zahlen-/Datumsformat (de-CH)
├── worker/                     Cloudflare Worker (OAuth- & API-Proxy)
└── .github/workflows/deploy.yml
```

## Ideen für später

- Webhooks von WHOOP nutzen, um Daten automatisch zu aktualisieren
- Wochen-/Monatsvergleiche, Korrelationen (z. B. Strain ↔ Recovery am Folgetag)
- Als PWA installierbar machen
