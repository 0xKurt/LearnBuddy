# Buddy-Starterkit: eine neue, unabhängige Buddy-App aus diesem Repository

**Issue:** #107 · **Stand:** 02.10.2026 · **Code:** `packages/buddy-kit/`,
`infra/supabase/templates/api-role.sql`

> **Was gebaut ist und was nicht — ehrlich.** Das Issue beschreibt ein Zielbild mit ~20–30 PRs
> (Kit herauslösen, Kern-Pakete, `provision` gegen alle Cloud-APIs). Der Owner hat es am
> 29.09. geparkt und die **kleinste Version** vorgegeben: _„LearnBuddy kopieren, die Lern-Teile
> entfernen … die Einrichtung von Hand nach der Checkliste … Erst beim zweiten Mal wird
> automatisiert, was sich tatsächlich wiederholt."_ Gebaut ist genau der mechanische Teil
> dieser kleinsten Version, lokal getestet:
>
> - **`pnpm create-buddy`** kopiert das Repository in ein neues Projekt mit eigener Identität und
>   schneidet jede Verbindung zu LearnBuddys Projekten ab;
> - **`pnpm provision`** erledigt, was ohne Cloud-Konto geht (Secrets, Status, Ids in die
>   Konfiguration schreiben, `/v1/health` prüfen) und gibt jeden Cloud-Schritt als **exakte
>   Anleitung** aus — **ausgeführt wird davon nichts, und nichts davon wird als erledigt
>   gemeldet**;
> - die **API-Datenbankrolle** ist eine versionierte Vorlage, gegen Postgres 16 getestet.
>
> **Nicht gebaut:** die Lern-Domain herauslösen (§6 des Issues), die Kern-Pakete (Option B),
> Aufrufe an die Management-APIs von Supabase, Vercel, Expo, Google Cloud. Für Letztere gibt es
> in dieser Umgebung keine Konten, und eine Automatisierung, die nie gegen die echte API lief,
> wäre eine Behauptung (CLAUDE.md Regel 5).

## Neuer Buddy in 10 Schritten

1. **Projekt erzeugen.** Im LearnBuddy-Repository:
   ```bash
   pnpm create-buddy ../fitbuddy --name "Fit Buddy" --bundle-id com.firma.fitbuddy \
     --audience adults-only --locales de,en --capabilities voice --git
   ```
   Im Terminal fragt das Skript fehlende Werte ab; ohne Terminal muss jeder Pflichtwert als
   Flag kommen. Mit `--verify` laufen danach `pnpm install`, `typecheck`, `lint` und `test` im
   neuen Projekt (braucht den lokalen Postgres wie hier).
2. **`BUDDY-SETUP.md` lesen.** Es steht im neuen Projekt und zählt, wie viel noch „LearnBuddy"
   ist (am 02.10.: 471 Stellen in 318 Dateien).
3. **Lern-Domain entfernen** (von Hand, #107 §6), danach eine frische Basis-Migration ohne
   Lern-Tabellen. Nach jedem Schritt die Gates.
4. **Nicht gewählte Fähigkeiten entfernen** — Code und Plugin zusammen, nie nur das Plugin.
5. **Persona, Texte, Look** (Prompt-Schicht 3, Locales, Theme-Palette).
6. **`pnpm provision --plan`** — zeigt die lokalen Änderungen und die Liste der Cloud-Schritte.
7. **`pnpm provision`** — erzeugt `.buddy/secrets.env` (0600, gitignored, nie ausgegeben) und
   `.buddy/state.json` (nur Ids).
8. **Cloud-Schritte von Hand**, in der ausgegebenen Reihenfolge: Supabase in Frankfurt,
   Pooler-Host ablesen, Migrationen, API-Rolle, Vault, Auth; Vercel (Region fra1, Deployment
   Protection, Secrets nur „Production"); Expo; Google Cloud. Jede neue Id mit
   `pnpm provision --set key=value` eintragen — `provision` schreibt sie dann in `app.json` und
   `eas.json`.
9. **`pnpm provision --check-health`** — fragt `/v1/health` der eingetragenen API ab und meldet,
   was sie antwortet.
10. **Rechtspaket** (`docs/legal/processors.md` ist erzeugt; DPIA, Datenschutzerklärung,
    Impressum, AV-Verträge sind Arbeit für diese App). `pnpm provision --env production`
    verweigert, solange Verantwortlicher, Anschrift, Datenschutz-URL, Impressum oder Support-Mail
    in `buddy.config.json` fehlen.

## Was `create-buddy` tut

| Schritt                     | Ergebnis                                                                                                                                                                            |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Kopieren                    | alle von Git verfolgten Dateien; **nicht**: `.git`, `docs/legacy`, `reports`, `research_notes`, `design-examples`, `.buddy/`, `google-services.json`, Schlüssel- und `.env`-Dateien |
| `apps/mobile/app.json`      | Name, Slug, Scheme, Bundle-ID/Paket, Namen der Share-Extension; **entfernt**: Expo-Owner, Update-URL, EAS-Projekt-Id, `googleServicesFile`                                          |
| `apps/mobile/app.config.ts` | Name und Id der Dev-Variante                                                                                                                                                        |
| `apps/mobile/eas.json`      | **alle `EXPO_PUBLIC_*`-Werte entfernt** — ein Preview-Build der neuen App kann LearnBuddys API und Supabase nicht erreichen                                                         |
| `.gitignore`                | `.buddy/`                                                                                                                                                                           |
| `buddy.config.json`         | identity · policy · content · wiring · legal, mit zod geprüft                                                                                                                       |
| `docs/legal/processors.md`  | Auftragsverarbeiter, abgeleitet aus den gewählten Fähigkeiten                                                                                                                       |
| `BUDDY-SETUP.md`            | was passiert ist, was übrig ist, die Cloud-Checkliste, was sich nicht löschen lässt                                                                                                 |

Die Konfiguration lässt **nur die EU** zu: Supabase `eu-central-1`, Vercel `fra1`, Vertex `eu`
oder `europe-*` (dieselbe Regel wie `apps/api/src/config.ts`). Ein Pooler-Host außerhalb von
`eu-central-1` wird bei `--set` abgewiesen.

## Was `provision` tut

| Befehl                                | Wirkung                                                                                                          |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `pnpm provision --plan`               | zeigt alles, schreibt nichts                                                                                     |
| `pnpm provision`                      | lokale Schritte; ein zweiter Lauf ohne Neues ändert **keine Datei**                                              |
| `pnpm provision --set key=value`      | Id eintragen (Format geprüft; ein ungültiger Wert wird **nicht** wiederholt, falls dort ein Secret gelandet ist) |
| `pnpm provision --rotate TICK_SECRET` | genau dieses Secret neu; die Ausgabe nennt, **wohin** es muss (Vercel, Vault), nie den Wert                      |
| `pnpm provision --env production`     | verweigert ohne Rechtsangaben und ändert dann nichts                                                             |
| `pnpm provision --check-health`       | echte Anfrage an `/v1/health`, Ergebnis wie es kam                                                               |
| `pnpm provision --deprovision-plan`   | was sich nach dem Anlegen nicht mehr löschen lässt                                                               |

Ein Cloud-Schritt heißt in der Ausgabe höchstens **„aufgezeichnet (deine Angabe)"** — sobald
seine Id eingetragen ist. „Geprüft" sagt `provision` nur über `/v1/health`.

Die Stolpersteine vom 28.09. stehen in den Schritten selbst: Pooler-Host ablesen statt raten
(aws-0 statt aws-1), Produktions-Secrets nie für „Preview", Deployment Protection an,
Metro-Cache pro App und Export mit `--clear`, Push aus bis zur rechtlichen Prüfung.

## Die API-Datenbankrolle

`infra/supabase/templates/api-role.sql`, mit psql angewendet:

```bash
set -a; . ./.buddy/secrets.env; set +a
psql "<admin connection string>" -v api_role=lb_api -v api_password="$LB_API_DB_PASSWORD" \
     -f infra/supabase/templates/api-role.sql
```

Belegt durch `apps/api/src/__tests__/api-role.int.test.ts`: die Vorlage läuft zweimal
(idempotent), die Rolle ist kein Superuser, darf keine Tabelle anlegen und nichts in `auth`
lesen, und die API läuft **als diese Rolle** ein ganzes Konto durch (Anmeldung, Material,
Export, Löschung durch den Tick, `/v1/health` grün). Auch eine Tabelle aus einer späteren
Migration ist ohne neue Grants nutzbar. Gegenprobe: ohne BYPASSRLS schlagen alle drei Tests
fehl. **Nicht live geprüft:** ob Supabase BYPASSRLS an eine eigene Rolle vergibt — die Vorlage
nennt den Ausweg.

## Stand der Abnahmekriterien aus #107 §8

| Kriterium                                                                                                                   | Stand                                                                                                                                                                                                             |
| --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `create-buddy demo` erzeugt ein Projekt, in dem ohne Änderung typecheck, lint, test grün sind                               | **lokal belegt** für typecheck, lint, test (`--verify`, 02.10.); Web-Walkthrough im erzeugten Projekt nicht gefahren; die Unterhaltung mit einem Beispiel-Tool gibt es nicht, weil die Domain noch LearnBuddy ist |
| Konfig-Buddy ohne eigenen Code mit Eval-Fällen gegen echtes Modell                                                          | **nicht gebaut** (braucht das Herauslösen, §6)                                                                                                                                                                    |
| `provision --dry-run` zeigt alle Schritte; `provision` legt alles an, endet mit `/v1/health` ok; zweiter Lauf ändert nichts | `--plan` zeigt alle Schritte (getestet); Anlegen in der Cloud **nicht automatisiert**; zweiter Lauf ändert nichts (getestet); `/v1/health`-Prüfung gebaut, gegen eine Attrappe getestet, nie gegen eine echte API |
| Kein Secret in Ausgabe, Logs, Status-Datei oder Repo; Secrets pro App eindeutig                                             | getestet (Ausgabe und Status-Datei, 0600, `.buddy/` gitignored, zwei Apps → verschiedene Werte)                                                                                                                   |
| Previews nicht gegen die Produktions-DB; Deployment Protection an                                                           | als Anleitung; `create-buddy` entfernt die fremden `EXPO_PUBLIC_*`; die Vercel-Einstellung selbst ist nicht prüfbar ohne Konto                                                                                    |
| Export und Löschung decken jede Tabelle mit Nutzer-Id ab                                                                    | **gebaut und getestet** für LearnBuddy (`export-completeness.int.test.ts`, gegen `information_schema`) — und damit in jeder Kopie                                                                                 |
| App startet nur, wenn ihre Buddy-Id zur API passt; `/health` zeigt die Buddy-Id                                             | **nicht gebaut**                                                                                                                                                                                                  |
| Nicht gewählte Fähigkeiten nicht in der App                                                                                 | **nicht automatisiert** — siehe Schritt 4                                                                                                                                                                         |
| Anleitung „Neuer Buddy in 10 Schritten"                                                                                     | dieses Dokument                                                                                                                                                                                                   |
