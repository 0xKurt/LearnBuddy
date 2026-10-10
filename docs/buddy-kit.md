# Buddy-Starterkit: eine neue, unabhängige Buddy-App aus diesem Repository

**Issue:** #107 · **Stand:** 10.10.2026 · **Code:** `packages/buddy-kit/`,
`infra/supabase/templates/api-role.sql`, `tools/guards/boundaries.mjs`

> **Was gebaut ist und was nicht — ehrlich.** Das Issue beschreibt ein Zielbild mit ~20–30 PRs.
> Gebaut ist der mechanische Teil der kleinsten Version (Owner, 29.09.), lokal und in CI geprüft:
>
> - **`pnpm create-buddy`** kopiert das Repository in ein neues Projekt mit eigener Identität,
>   kappt jede Verbindung zur Infrastruktur von LearnBuddy und **prüft das selbst** — die
>   Kennungen liest es aus LearnBuddys eigenen Dateien, ein übersehener Rest lässt es scheitern;
> - **`pnpm provision`** erledigt, was ohne Cloud-Konto geht (Secrets, Status, Ids in `app.json`,
>   `eas.json` und den Health-Workflow, Verarbeiterliste, `/v1/health` prüfen), und gibt jeden
>   Cloud-Schritt als **exakte Anleitung** aus — **ausgeführt wird davon nichts**.
>   `--dry-run` zeigt zusätzlich, was am Ende existiert, gelesen aus diesem Repository;
> - die **API-Datenbankrolle** ist eine versionierte Vorlage, gegen Postgres 16 getestet;
> - **Wächter:** CI erzeugt bei jedem PR den Referenz-Buddy neu und typecheckt ihn; die Tests des
>   Kits halten `provision` an Env-Namen, Migrationen, Cron-Job, Vault-Secrets und Region fest;
>   `pnpm guards` zählt jeden Import aus generischem Code in die Lern-Domain (nur weniger erlaubt).
>
> **Nicht gebaut:** die Lern-Domain herauslösen (§6 des Issues; gemessen unten, „Modulgrenzen“),
> die Kern-Pakete (Option B), Aufrufe an die Management-APIs von Supabase, Vercel, Expo, Google
> Cloud — für sie gibt es hier keine Konten, und eine Automatisierung, die nie gegen die echte API
> lief, wäre eine Behauptung (CLAUDE.md Regel 5).

## Neuer Buddy in 10 Schritten

1. **Projekt erzeugen.** Im LearnBuddy-Repository:
   ```bash
   pnpm create-buddy ../fitbuddy --name "Fit Buddy" --bundle-id com.firma.fitbuddy \
     --repo firma/fitbuddy --audience adults-only --locales de,en --capabilities voice --git
   ```
   oder aus einer fertigen Konfiguration (`--config buddy.config.json`, Vorlage:
   `packages/buddy-kit/reference.config.json`). Im Terminal fragt das Skript fehlende Werte ab;
   ohne Terminal muss jeder Pflichtwert als Flag kommen. `--git` legt ein eigenes Repository auf
   `main` mit erstem Commit an. `--verify` lässt danach `install`, `typecheck`, `lint` und `test`
   im neuen Projekt laufen (braucht den lokalen Postgres wie hier), `--verify=typecheck` nur
   `install`, `typecheck` und `provision --dry-run` (so in CI).
2. **`BUDDY-SETUP.md` lesen.** Es steht im neuen Projekt: was ersetzt wurde, wie viel der
   Lern-Domain noch drin ist (am 10.10.: 553 Dateien), die Cloud-Checkliste.
3. **Lern-Domain entfernen** — nach den Schnitten aus „Modulgrenzen“ unten. Danach eine frische
   Basis-Migration ohne Lern-Tabellen. Nach jedem Schritt die Gates.
4. **Nicht gewählte Fähigkeiten entfernen** — Code und Plugin zusammen, nie nur das Plugin.
5. **Persona, Texte, Look** (Prompt-Schicht 3, Locales, Theme-Palette).
6. **`pnpm provision --dry-run`** — was entsteht, die lokalen Änderungen, die Cloud-Schritte.
7. **`pnpm provision`** — erzeugt `.buddy/secrets.env` (0600, gitignored, nie ausgegeben) und
   `.buddy/state.json` (nur Ids).
8. **Cloud-Schritte von Hand**, in der ausgegebenen Reihenfolge. Jede neue Id mit
   `pnpm provision --set key=value` eintragen — `provision` schreibt sie in `app.json`,
   `eas.json` und `.github/workflows/health.yml`.
9. **`pnpm provision --check-health`** — fragt `/v1/health` der eingetragenen API ab.
10. **Rechtspaket** (`docs/legal/processors.md` ist erzeugt; DPIA, Datenschutzerklärung,
    Impressum, AV-Verträge sind Arbeit für diese App). `pnpm provision --env production`
    verweigert, solange Verantwortlicher, Anschrift, Datenschutz-URL, Impressum oder Support-Mail
    in `buddy.config.json` fehlen.

## Was `create-buddy` tut

| Schritt                        | Ergebnis                                                                                                                                                                                                                                                |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Kopieren                       | alle von Git verfolgten Dateien; **nicht**: `.git`, `docs/legacy`, `docs/decisions`, die Audits, `reports`, `research_notes`, `design-examples`, `.buddy/`, `google-services.json`, Schlüssel, `.env`, der Generator selbst (`KIT_ONLY` in `create.ts`) |
| `apps/mobile/app.json`         | Name, Slug, Scheme, Bundle-ID/Paket, Share-Extension, **Berechtigungstexte im Namen der neuen App**; **entfernt**: Expo-Owner, Update-URL, EAS-Projekt-Id, `googleServicesFile`                                                                         |
| `apps/mobile/eas.json`         | API-, Supabase- und Rechts-Adressen **entfernt**; der Build-Schalter `EXPO_PUBLIC_INTERNAL_BUILD` bleibt (die interne Vorschau startet sonst nicht)                                                                                                     |
| überall                        | Bundle-ID der Quelle → neue (Maestro-Flows, Store-Link in `update.tsx`, App Group)                                                                                                                                                                      |
| `package.json`                 | Name und Beschreibung der App; ohne `create-buddy`                                                                                                                                                                                                      |
| `infra/supabase/config.toml`   | eigene `project_id` — sonst teilt sich der lokale Supabase-Stack die Docker-Volumes mit LearnBuddy                                                                                                                                                      |
| `.github/workflows/health.yml` | `HEALTH_URL` leer (die Probe meldet „nicht gesetzt“ und bleibt grün), bis `provision` die eigene API kennt                                                                                                                                              |
| `CLAUDE.md`                    | Issues ins eigene Repository (`--repo`), sonst ein Platzhalter — nie in LearnBuddys                                                                                                                                                                     |
| Prüfung                        | `findForeign` (`source.ts`): Bundle-ID, Expo-Konto und -Projekt, Supabase-Projekt und Publishable Key, API-Hosts aus `eas.json` und `health.yml`, Repository, lokaler Stack — **ein Fund = Abbruch**                                                    |
| `buddy.config.json`            | identity · policy · content · wiring · legal, mit zod geprüft                                                                                                                                                                                           |
| `docs/legal/processors.md`     | Auftragsverarbeiter, abgeleitet aus den gewählten Fähigkeiten                                                                                                                                                                                           |
| `BUDDY-SETUP.md`               | was passiert ist, was von der Domain übrig ist, die Cloud-Checkliste, was sich nicht löschen lässt                                                                                                                                                      |

Die Konfiguration lässt **nur die EU** zu: Supabase `eu-central-1`, Vercel `fra1`, Vertex `eu`
oder `europe-*`. Ein Pooler-Host außerhalb von `eu-central-1` wird bei `--set` abgewiesen.

## Was `provision` tut

| Befehl                                | Wirkung                                                                                                                                                          |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm provision --dry-run`            | zeigt, was am Ende existiert (aus dem Repository gelesen), die lokalen Änderungen und die Cloud-Schritte; **schreibt nichts, ruft nichts auf** (`--plan` gleich) |
| `pnpm provision`                      | lokale Schritte; ein zweiter Lauf ohne Neues ändert **keine Datei**                                                                                              |
| `pnpm provision --set key=value`      | Id eintragen (Format geprüft; ein ungültiger Wert wird **nicht** wiederholt, falls dort ein Secret gelandet ist)                                                 |
| `pnpm provision --rotate TICK_SECRET` | genau dieses Secret neu; die Ausgabe nennt, **wohin** es muss (Vercel, Vault), nie den Wert                                                                      |
| `pnpm provision --env production`     | verweigert ohne Rechtsangaben und ändert dann nichts                                                                                                             |
| `pnpm provision --check-health`       | echte Anfrage an `/v1/health`, Ergebnis wie es kam                                                                                                               |
| `pnpm provision --deprovision-plan`   | was sich nach dem Anlegen nicht mehr löschen lässt                                                                                                               |

`--dry-run` am Referenz-Buddy (10.10.), gekürzt:

```
Supabase      Projekt "reference" in eu-central-1 · 86 Migrationen 0001_baseline … 0104_code_tasks_and_talks
              pg_cron lb-tick · Vault lb_api_url, lb_tick_secret · Rolle lb_api · Auth-Redirect referencebuddy://**
Vercel        Projekt "reference-api", Root apps/api, Framework none, Region fra1, Deployment Protection an
              Env nur „Production": DATABASE_URL, DATABASE_CA_CERT, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
              ADMIN_TOKEN_SECRET, TICK_SECRET, CONSENT_VERSION, MIN_APP_VERSION, LLM_BACKEND,
              GOOGLE_CLOUD_PROJECT, GOOGLE_VERTEX_LOCATION, GOOGLE_APPLICATION_CREDENTIALS_JSON,
              SPEECH_BACKEND, PUSH_BACKEND (+ EXPO_ACCESS_TOKEN mit „push")
Expo / EAS    Projekt "reference", com.example.reference, Android-Keystore; eas.json preview + production:
              EXPO_PUBLIC_API_URL, _SUPABASE_URL, _SUPABASE_ANON_KEY, _PRIVACY_URL, _IMPRINT_URL, _SUPPORT_EMAIL
Google Cloud  Projekt mit aiplatform (+ texttospeech mit „voice"), Vertex europe-west4, Service Account, Budget-Alarm
              (+ Firebase-Projekt mit Android-App mit „push")
GitHub        eigenes Repository; Health-Workflow auf <apiUrl>/v1/health
Lokal         .buddy/secrets.env (ADMIN_TOKEN_SECRET, TICK_SECRET, LB_API_DB_PASSWORD), .buddy/state.json
```

Die Stolpersteine vom 28.09. stehen in den Schritten selbst: Pooler-Host ablesen statt raten,
Produktions-Secrets nie für „Preview", Deployment Protection an, Metro-Cache pro App und Export
mit `--clear`, Push aus bis zur rechtlichen Prüfung, die Supabase-CLI mit `--workdir infra`
(die Konfiguration liegt in `infra/supabase/`), `CONSENT_VERSION` der eigenen App statt des
Defaults der Quelle, und die Rechts-URLs in `eas.json`, ohne die ein Store-Build nicht startet.

## Was der Owner für einen echten ersten Lauf liefern muss

- **Konten (Firma Zero X Ventures):** Supabase-Organisation (Pro), Vercel-Team, Expo-Konto,
  Google-Cloud-Projekt mit Abrechnung (Vertex, ggf. TTS), bei „push" Firebase; Apple Developer als
  Organisation (D-U-N-S), Google Play Console als Organisation; ein GitHub-Repository; ein
  EU-SMTP-Anbieter; eine Domain, wenn Universal Links gebraucht werden.
- **Angaben in `buddy.config.json` → `legal`:** Verantwortlicher, Anschrift, Datenschutz-URL,
  Impressum-URL, Support-Mail (sonst verweigert `--env production`).
- **Entscheidungen:** Name, Bundle-ID, Scheme, Zielgruppe, Sprachen, Fähigkeiten; Datum des
  Einwilligungstexts (`CONSENT_VERSION`); ob Push nach der rechtlichen Prüfung an soll.
- **Nicht live geprüft:** Supabase vergibt `BYPASSRLS` an eine eigene Rolle; das Format der
  Pooler-URL (`lb_api.<ref>@…:6543`); die Management-APIs aller Anbieter.

## Modulgrenzen: was das Kit vom LearnBuddy-Kern trennt

Gemessen am 10.10. auf `f314c0f` mit dependency-cruiser 18.4.0 (MIT). Was Domain ist, steht in
`tools/guards/boundaries.config.mjs`; `pnpm guards` misst bei jedem Lauf und lässt nur weniger zu.

| Kopplung (generisch → Lern-Domain)              | Stand 10.10.                                                                                                                                                                               |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Importe API (Wächter)                           | 39 in 17 Dateien (`buddy/routes` 5, `scheduler/tick` 5, `buddy/tools` 4, `buddy/turn` 4, `app.ts` 3, …)                                                                                    |
| Importe App (Wächter)                           | 32 in 18 Dateien (`components/buddy/Conversation` 9, `StartSheets` 3, `lib/capture/upload` 3, …)                                                                                           |
| Verträge (`@learnbuddy/shared-types/contracts`) | `buddy.ts` importiert `learning.ts`, `drill.ts`, `talk.ts`; 24 generische Dateien nehmen Domain-Namen (≈ 10 davon nur falsch abgelegte Stimm-Schemas)                                      |
| SQL auf Domain-Tabellen                         | 11 generische Dateien, ≈ 75 Abfragen (`buddy/state` 24, `identity/privacy` 21, `buddy/home` 9, …); gemessen seit Schnitt 5 (`domain-sql.mjs`): 76 in 9                                     |
| Fremdschlüssel Kern → Domain                    | 8 (`buddy_goals`/`buddy_lookbacks` → `subjects`, `buddy_pending_actions` → `materials`/`items`, `buddy_focus` → `materials`/`subjects`, `buddy_messages` → `buddy_roleplays`/`rehearsals`) |

Reihenfolge der Schnitte (je ein eigener, kleiner Branch, ohne Verhaltensänderung): Stimm-Verträge
aus `learning.ts` lösen → Tools, Lookups und Angebote melden sich an → Domain-Routen →
Job-Arten und Anlässe → Kontext, Zustand, Home und Prompt als Provider → Export/Löschung über
einen Tabellen-Provider → Karten-Union in `buddy.ts` erweiterbar → Karten-, Start- und
Anhang-Registry in der App → Fremdschlüssel (neue Migrationen) → `create-buddy` kopiert den Kern
durch Konstruktion.

Erledigte Schnitte und was der Wächter danach misst (Importe generisch → Domain, Start 71):

1. **Stimm-Verträge** in `contracts/voice.ts` (`AudioMime`, `TranscribeRequest/-Response/-StreamEvent`,
   `VOICE_NAMES`, `VoiceName`, `VoiceSpeed`, `SpeechRequest/-Response`). Die Sprech-Fragen der
   Übungen (`SpeakRequest`, `SpeakWordRequest`, `SpeakStreamEvent`) bleiben Domain und nehmen nur
   `AudioMime`. Generische Dateien mit Domain-Vertragsnamen: 24 → 13; Wächter: 71 (Verträge zählt
   er nicht).
2. **Werkzeuge, Lookups, Angebote** melden sich an: `modules/learning/register.ts` ist die eine
   Stelle, die die Domain beim App-Start (`createApp`) in den Kern einträgt — Handler der
   Domain-Werkzeuge (`registerActHandlers`, `buddy/tools.ts`), die Leser der Lookups
   (seit Schnitt 5 die ganzen Lookups, `registerLookups`, `buddy/lookups.ts`); `offer_learning`/`offer_drill` stehen in
   `practice/offerTools.ts`. Der Start bricht ab, solange ein Werkzeug oder Lookup, das das Modell
   angeboten bekommt, keinen Code hat (`withoutCode()`). Was das Modell sieht (Schemas,
   Beschreibungen), steht noch im Kern: es geht in den Prompt-Hash ein und wandert mit Schnitt 5/7.
   Wächter: 71 → 63 (neu, freigegeben: die eine Naht `app.ts → learning/register.ts`).
3. **Routen als Plugins:** `http/plugins.ts` (`registerRoutes`); `createApp` hängt sie nach den
   Kern-Routen ein. `/practice`, `/materials` und die Domain-Taps unter `/buddy`
   (`modules/learning/routes.ts`: Schritt starten, Löschung bestätigen, Rollenspiel beenden,
   Probevortrag) kommen von der Domain; Buddys Wächter gelten für jeden Pfad unter `/buddy`
   (`mountBuddy`). „Jetzt üben“ aus einer Nachricht startet den Schritt über
   `buddy/stepStart.ts` (`registerStepStarter`). `erasureBacklog` steht in
   `identity/retention.ts`. Wächter: 63 → 55.
4. **Scheduler und Proaktivität:** `scheduler/registry.ts` (Job-Arten je Spur — wartend,
   Löschung — und der Anteil der Domain an einem Lauf: Bergung, Leerlauf, Aufräum-Sweep),
   `buddy/occasions.ts` (Anlässe, die Code allein entscheidet, und die zehn Minuten Fragen für
   einen Übungsschritt ohne Modell), `subscribe` in `buddy/events.ts`. Der Start bricht ab, solange
   eine Job-Art keinen Handler hat (`missingJobKinds`). Die Aufbewahrung jedes Buddys
   (Storage-Schuld, geschlossene Erinnerungen, Entscheidungsinhalte) steht in
   `identity/retention.ts`. Wächter: 55 → 45.
5. **Kontext-Provider** (`buddy/provider.ts`): die Domain meldet einen Provider an, der Kern
   liest nur noch seine eigenen Tabellen. Er liefert den Domain-Teil des Zustands
   (`learning/state.ts`; die Felder deklariert sie per Augmentation von `DomainState`,
   `DomainTotals`, `DomainAliases`, `DomainUndos`), ihre STATE-Abschnitte und was Ziele und
   Schritte tragen (`learning/context.ts`), ihre Regeln im Prompt (`learning/prompt.ts`), ihre
   Teile der Startseite und der Gesprächskarten (`learning/home.ts`), die Turn-Hooks — Rollenspiel
   als Modus, Passagen vorab, Hausaufgaben-Wächter, Angebot vorbereiten, Szene bei Sorge beenden
   (`learning/turn.ts`) —, den Rückblick (`learning/lookback.ts`), Fachnamen der Ziele, das Blatt
   für die feste Antwort ohne Modell und ihre Undo-Art. Der Prompt wird erst bei Bedarf gebaut
   (`buddyPrompt()`), darum melden sich auch die Lookups samt Beschreibung und Schema an
   (`learning/lookups.ts`, `registerLookups`); Prompt, Schemas, Prompt-Hash und ein voller STATE
   bleiben byte-gleich (`buddy/__tests__/prompt-pin.test.ts`). Neuer Wächter: `domain-sql.mjs`
   zählt Domain-Tabellen in SQL des generischen API-Codes (#107 §6) — 76 Abfragen in 9 Dateien
   → 24 in 1 (`identity/privacy.ts`, Schnitt 6). Importe: 45 → 33 (API: nur noch die Naht).
   Noch im Kern deklariert: die Schemas und Beschreibungen der Domain-Werkzeuge (`decision.ts`,
   `registry.ts`) — ihre Typen hängen an der Karten-Union (Schnitt 7).
6. **Datenschutz über eine Tabellen-Registry** (`identity/privacyTables.ts`): `identity/privacy.ts`
   nennt nur noch die Tabellen des Kerns; die Domain meldet ihre an (`learning/privacy.ts`) — was
   jede exportiert, wie ihre Zeilen für die Löschung gefunden werden, welche Storage-Dateien sie
   meinen. Export: erst der Kern, dann die Domain; Löschung: erst die Domain (Kinder zuerst), dann
   der Kern. Die Löschung merkt sich die Tabelle beim Namen statt als Listen-Index (ein Index von
   vorher beginnt die Stufe von vorn — jedes Löschen findet nur, was noch da ist). Die
   Vollständigkeit prüft weiter der Katalog (`export-completeness.int.test.ts`); `register.test.ts`
   hält die angemeldeten Tabellen und `DOMAIN_TABLES` des SQL-Wächters gleich. SQL im Kern auf
   Domain-Tabellen: 24 → 0. Importe: 33 (die Kante `privacy.ts → materials/purge.ts` war schon mit
   Schnitt 4 weg).

## Die API-Datenbankrolle

`infra/supabase/templates/api-role.sql`, mit psql angewendet:

```bash
set -a; . ./.buddy/secrets.env; set +a
psql "<admin connection string>" -v api_role=lb_api -v api_password="$LB_API_DB_PASSWORD" \
     -f infra/supabase/templates/api-role.sql
```

Belegt durch `apps/api/src/__tests__/api-role.int.test.ts`: die Vorlage läuft zweimal
(idempotent), die Rolle ist kein Superuser, darf keine Tabelle anlegen und nichts in `auth`
lesen, und die API läuft **als diese Rolle** ein ganzes Konto durch. **Nicht live geprüft:** ob
Supabase BYPASSRLS an eine eigene Rolle vergibt — die Vorlage nennt den Ausweg.

## Die drei Entscheidungen aus #107 und was sie im Kit ändern

Der Owner hat sie am 29.09. im Issue beantwortet (B; das Kit hängt an keinem bestimmten Buddy,
neutraler Referenz-Buddy; Zero X Ventures). Was jede Antwort im Kit bewegt:

- **Wie Fixes in bestehende Apps kommen.** _A (reine Kopie):_ so ist das Kit heute — eine App
  besitzt nach `create-buddy` allen Code, ein Kern-Fix muss von Hand in jede App. _B (Kopie +
  versionierte Kern-Pakete):_ die Modulgrenzen oben müssen erst durch sein; dann werden Tool-
  Laufzeit, Einwilligung/Löschung/Export, Zeitregeln, Zustellung und Modell-Gateway Pakete
  (privat, z. B. GitHub Packages), `create-buddy` kopiert sie nicht mehr, sondern trägt sie als
  Abhängigkeit ein, und ein `buddy:update` kopiert ihre Migrationen als neue, fortlaufende
  Migrationen der App.
- **Welcher Buddy zuerst.** Ein Konfig-Buddy (ohne eigenen Code) prüft nur Persona, Theme und die
  generischen Tools — dafür steht `reference.config.json`, den CI bei jedem PR neu erzeugt. Ein
  Code-Buddy bräuchte zusätzlich die Registry, über die sich eine Domain anmeldet (Schnitte oben),
  und ein Beispiel-Domain-Tool im Kit.
- **Verantwortlicher (DSGVO).** Ändert keine Zeile Code: `legal.controller` und
  `legal.controllerAddress` in `buddy.config.json`, die Verarbeiterliste nennt ihn, und
  `--env production` verweigert ohne ihn. Bei der Firma laufen die AV-Verträge und Store-Konten
  auf sie (Apple braucht dann eine D-U-N-S-Nummer); `docs/dpia.md` der Kopie muss für die App neu
  geschrieben werden.

## Stand der Abnahmekriterien aus #107 §8

| Kriterium                                                                                                                   | Stand                                                                                                                                                                                                                       |
| --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `create-buddy demo` erzeugt ein Projekt, in dem ohne Änderung typecheck, lint, test grün sind                               | **belegt am 10.10.** (Gewohnheits-Buddy: typecheck, lint mit Wächtern, API- und App-Tests auf Postgres); typecheck **bei jedem PR in CI**; Web-Walkthrough im erzeugten Projekt nicht gefahren; kein Beispiel-Tool (Domain) |
| Konfig-Buddy ohne eigenen Code mit Eval-Fällen gegen echtes Modell                                                          | **nicht gebaut** (braucht die Schnitte oben)                                                                                                                                                                                |
| `provision --dry-run` zeigt alle Schritte; `provision` legt alles an, endet mit `/v1/health` ok; zweiter Lauf ändert nichts | `--dry-run` zeigt, was entsteht, und alle Schritte (getestet); Anlegen in der Cloud **nicht automatisiert**; zweiter Lauf ändert nichts (getestet); `/v1/health` gegen eine Attrappe getestet, nie gegen eine echte API     |
| Kein Secret in Ausgabe, Logs, Status-Datei oder Repo; Secrets pro App eindeutig                                             | getestet (Ausgabe und Status-Datei, 0600, `.buddy/` gitignored, zwei Apps → verschiedene Werte)                                                                                                                             |
| Previews nicht gegen die Produktions-DB; Deployment Protection an                                                           | als Anleitung; die Vercel-Einstellung selbst ist ohne Konto nicht prüfbar                                                                                                                                                   |
| Export und Löschung decken jede Tabelle mit Nutzer-Id ab                                                                    | **gebaut und getestet** für LearnBuddy (`export-completeness.int.test.ts`) — und damit in jeder Kopie                                                                                                                       |
| App startet nur, wenn ihre Buddy-Id zur API passt; `/health` zeigt die Buddy-Id                                             | **nicht gebaut**                                                                                                                                                                                                            |
| Nicht gewählte Fähigkeiten nicht in der App                                                                                 | **nicht automatisiert** — siehe Schritt 4                                                                                                                                                                                   |
| Anleitung „Neuer Buddy in 10 Schritten"                                                                                     | dieses Dokument                                                                                                                                                                                                             |
