# Schlüsselrotation (Owner-Runbook)

Issue #862, Punkt 4; Grundlage: [privacy.md §Access control](privacy.md#access-control),
[architecture.md §Delivery](architecture.md#delivery) und [SETUP-VERTEX.md](SETUP-VERTEX.md).
Stand: 23.10.2026. Diese Anleitung führt keine Rotation aus. Erzeugen, Umstellen, Deployment,
Live-Prüfung und Widerruf liegen beim Owner. Die tatsächlichen Cloud-Einstellungen und lokalen
Secret-Dateien wurden dafür nicht ausgelesen.

## Bestand und Ablage

| Schlüssel                                    | Verbraucher und produktive Ablage                                                                                                                                                              | Lokale Ablage                                                                                                                                                                                                    |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Firebase-Admin / FCM-V1-Service-Account-JSON | Expo/EAS → Projekt → Credentials → Android-App → FCM V1 service account key. Die API sendet über `ExpoPush` (`apps/api/src/push/transport.ts`); sie lädt keinen Firebase-Admin-Key aus Vercel. | Heruntergeladene JSON-Datei nur außerhalb des Repos, verschlüsselt verwahren oder nach Upload löschen. Kein Firebase-Secret in `.env` nötig. Historische Kopien und alte Verbraucher beim Owner inventarisieren. |
| Vertex-Service-Account-JSON                  | API-Projekt, Vercel **Production**: `GOOGLE_APPLICATION_CREDENTIALS_JSON`. Auch Cloud-TTS verwendet diesen Account.                                                                            | `apps/api/.env.local`: `GOOGLE_APPLICATION_CREDENTIALS=/Users/<user>/.config/learnbuddy/vertex-sa.json` oder Inline-JSON. Ein gesetzter Dateipfad hat Vorrang vor Inline-JSON (`llm/vertex.ts`).                 |
| Supabase Service Role / Secret API Key       | API-Projekt, Vercel **Production**: `SUPABASE_SERVICE_ROLE_KEY`; Auth-Prüfung, Auth-Administration und Storage über `lib/supabase.ts`.                                                         | `apps/api/.env.local`: gleicher Variablenname. Nur bei bewusstem Zugriff auf dieses Projekt; lokale Test-Credentials getrennt halten.                                                                            |
| Datenbankpasswort der API-Rolle (`lb_api`)   | Passwort der Postgres-Rolle; enthalten in Vercel **Production** `DATABASE_URL` (Pooler-Verbindung).                                                                                            | `apps/api/.env.local`: `DATABASE_URL`; falls Provisionierung verwendet wird, zusätzlich `LB_API_DB_PASSWORD` in `.buddy/secrets.env` (siehe `infra/supabase/templates/api-role.sql`).                            |
| Administratives Postgres-Passwort            | Supabase-Projekt, nur für Administration/Migrationen; nicht als API-Zugang verwenden.                                                                                                          | Separater Eintrag im Passwortmanager/geschützte Admin-Verbindung; nicht mit dem `lb_api`-Passwort verwechseln.                                                                                                   |

Diese Namen und Verbraucher stammen aus dem Repo, nicht aus einer Live-Inventur. Vor Beginn alle
weiteren Verbraucher festhalten: alte Deployments, lokale Shells und `.env`-Kopien, CI-Secrets,
Automationen, Edge Functions, Vault und externe Integrationen. Keine Werte in Issue, PR,
Screenshots, Terminalausgabe oder Shell-History übernehmen. Dateien nur für den Owner lesbar
halten (`0600`); niemals Server-Secrets in `apps/mobile/.env.local` oder `EXPO_PUBLIC_*` ablegen.
Das Android-`google-services.json` ist Client-Konfiguration und kein privater Admin-Schlüssel.

## Ablauf für jede Rotation

1. Projekt, Account/Rolle, alte Schlüssel-ID, Verbraucher, Wartungsfenster und Rückweg im privaten
   Betriebsprotokoll notieren. Bei einem Leak zuerst den Verbreitungsweg schließen; ein kompromittierter
   Schlüssel ist kein Rückweg. Bei aktiver Ausnutzung kann sofortiger Widerruf wichtiger als Verfügbarkeit sein.
2. Neue Credentials im richtigen Projekt erstellen, ohne Rechte zu erweitern. Wenn zwei Schlüssel
   gleichzeitig möglich sind, den alten bis zum erfolgreichen Funktionstest behalten.
3. Alle Ablagen aktualisieren. Vercel-Env-Änderungen benötigen ein **neues Production-Deployment**;
   lokale Prozesse neu starten. Alte warme Prozesse können noch Credentials oder Tokens im Speicher
   haben. Produktions-Secrets nicht nach Preview kopieren (Infrastrukturteil von #862 separat).
4. Die jeweilige Prüfung unten mit einem Owner-Testkonto durchführen; Uhrzeit, Deployment-ID und
   Ergebnis ohne Nutzerdaten festhalten. `/v1/health` allein belegt weder Push noch Vertex noch Storage.
5. Alten Schlüssel beim Aussteller deaktivieren/widerrufen und anschließend mit einem frischen
   Prozess erneut prüfen. Alte lokale Kopien entfernen. Bei bereits ausgegebenen Zugriffstokens
   deren Restlaufzeit berücksichtigen; ein sofortiges Token-Ende ist durch Key-Löschung nicht belegt.
6. Abschluss im Issue protokollieren: Schlüsselart/ID, Verbraucher umgestellt, alter Key widerrufen,
   Nachweise und offene Punkte. Erst dann ist die Rotation abgeschlossen.

## Firebase-Admin / FCM

1. In Firebase-Projekteinstellungen → Service accounts einen neuen privaten JSON-Key für den
   bestehenden FCM-Service-Account erzeugen; Projekt-ID und Account mit der Android-App abgleichen.
2. In Expo/EAS bei der bestehenden Android-App den FCM-V1-Key ersetzen. Den Vertex-Key und den
   separaten API-Wert `EXPO_ACCESS_TOKEN` dabei nicht verändern. Die aktuellen Upload-Wege stehen
   in [Expos FCM-Anleitung](https://docs.expo.dev/push-notifications/fcm-credentials/).
3. Mit einem bestehenden, einwilligenden Owner-Testgerät eine neutrale Testbenachrichtigung senden.
   Ticket und anschließend Receipt prüfen; `receipt: ok` bedeutet Übergabe an FCM/APNs, erst die
   sichtbare Benachrichtigung auf dem Gerät belegt Empfang. Kein Neubau allein für den Server-Key.
4. Alten Key in Google Cloud IAM → Service Accounts → betreffender Account → Keys deaktivieren,
   erneut Push prüfen und danach löschen. Bei Fehlern vor Widerruf den bisherigen EAS-Key
   zurücksetzen; nach Widerruf einen weiteren neuen Key verwenden.

## Vertex-Service-Account (auch TTS)

1. In Google Cloud IAM beim bestehenden Vertex-Account einen neuen JSON-Key erstellen; Projekt
   und Rollen beibehalten. Ablauf und Widerruf folgen [Googles Rotationsanleitung](https://cloud.google.com/iam/docs/key-rotation).
2. Vercel `GOOGLE_APPLICATION_CREDENTIALS_JSON` und die tatsächlich verwendete lokale Datei/Env
   ersetzen. Falls `GOOGLE_APPLICATION_CREDENTIALS` gesetzt ist, reicht ein Austausch von Inline-JSON
   nicht. Frisch deployen und lokale Prozesse neu starten.
3. Der Owner prüft genau eine kleine Buddy-Anfrage und, wenn aktiv, eine kurze TTS-Ausgabe. Erfolg,
   fehlende Auth-/Berechtigungsfehler und Kosten notieren. Dafür ist ein ausdrücklich freigegebenes
   Live-Budget nötig; diese Dokumentationsänderung autorisiert keine Modellaufrufe.
4. Alten Key deaktivieren, aus frischem Prozess erneut prüfen, danach löschen. Bei Problemen vor
   Widerruf den vorherigen Key in allen Ablagen wieder einsetzen und neu deployen; niemals nur ein
   altes Deployment zurückrollen, dessen Env bereits ungültige Credentials enthält.

## Supabase Service Role

1. Im Dashboard unter API Keys den Typ feststellen: JWT-basierter Legacy-`service_role` oder
   `sb_secret_…`. Für den Ersatz einen neuen benannten Secret-Key erstellen. Der Repo-Variablenname
   bleibt `SUPABASE_SERVICE_ROLE_KEY`; die Kompatibilität des installierten Clients ist live zu prüfen.
2. Den Wert auf Vercel und lokal ersetzen und neu deployen/starten. Mit einem Owner-Testkonto Login,
   `/me`, einen privaten Material-Upload samt signiertem Download sowie Auth-Administration an einem
   entbehrlichen Testnutzer prüfen. Keine echten Kinderkonten für diese Prüfung löschen.
3. Einen alten Secret-Key nach erfolgreicher Umstellung löschen. Bei Legacy-Keys ist das Abschalten
   der Legacy-API-Keys ein eigener, gekoppelter Schritt: vorher auch ausgelieferte Apps mit
   `EXPO_PUBLIC_SUPABASE_ANON_KEY`, Web-Clients und Integrationen auf Publishable-Keys umstellen
   und prüfen. Sonst können installierte Clients ausfallen. Nicht beiläufig das gemeinsame
   JWT-Secret wechseln: Auth-Sessions und weitere Verbraucher benötigen einen eigenen Rollout.
4. Solange der alte Legacy-Service-Key akzeptiert wird, ist seine Rotation **offen**, auch wenn der
   Server bereits den neuen nutzt. Nach Abschaltung eine harmlose Anfrage mit dem alten Key aus
   einer geschützten Umgebung versuchen: sie muss abgelehnt werden. Anschließend Login/Refresh,
   Storage und Administration mit den neuen Credentials erneut prüfen.

Herstellerablauf: [API-Key-Rotation](https://supabase.com/docs/guides/getting-started/api-keys#rotate-a-leaked-or-compromised-key)
und [Migration aller Legacy-Verbraucher](https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys).
Bei einem Fehler vor Widerruf den bisherigen nicht kompromittierten Key wieder einsetzen und neu
deployen; nach Widerruf einen neuen erzeugen. Ein Wechsel des Datenbankpassworts ersetzt diese Rotation nicht.

## Datenbankpasswort

1. API-Rolle und Admin-Rolle getrennt inventarisieren. PostgreSQL hält pro Rolle nur ein Passwort;
   für `lb_api` ein kurzes Wartungsfenster für Passwortwechsel, Env-Austausch und Deployment planen.
2. Als Administrator über eine verifizierte TLS-Verbindung in `psql` interaktiv `\password lb_api`
   ausführen: das neue Passwort wird verdeckt abgefragt. Kein Klartext-`ALTER ROLE ... PASSWORD`
   in History oder Logs. Rechte nicht ändern; Referenz ist `infra/supabase/templates/api-role.sql`.
3. `DATABASE_URL` auf Vercel und lokal aktualisieren (Passwort als URL-Komponente korrekt kodieren),
   gegebenenfalls `LB_API_DB_PASSWORD` in `.buddy/secrets.env` angleichen. Host, Port, Pooler-User,
   Datenbank, TLS und `DATABASE_CA_CERT` unverändert übernehmen. Neu deployen/starten.
4. Mit einer **neuen** API-Verbindung `select current_user` prüfen, dann `scripts/deploy-check.sh`
   mit der API-`DATABASE_URL` sowie `/v1/health` aufrufen. Einen authentifizierten Lesezugriff und
   eine kleine Änderung am Owner-Testkonto prüfen. Alte Pool-Verbindungen können trotz geändertem
   Passwort weiterleben; ein gesunder warmer Prozess beweist die neuen Credentials nicht.
5. Alte Credentials müssen bei neuer Anmeldung abgelehnt werden. Bei einem Leak bestehende
   Sitzungen der betroffenen Rolle kontrolliert beenden; das Passwort beendet sie nicht automatisch.
   Im Fehlerfall als Administrator ein neues Passwort setzen und sämtliche Verbraucher angleichen.
6. Falls auch das administrative `postgres`-Passwort betroffen ist, dieses separat im Supabase-
   Dashboard unter Database Settings zurücksetzen, alle Admin-/Migration-Verbindungen aktualisieren
   und einen frischen TLS-Login prüfen. Das rotiert nicht automatisch `lb_api`.

Referenzen: [Postgres-Rollen bei Supabase](https://supabase.com/docs/guides/database/postgres/roles)
und [`psql`-Passworteingabe](https://www.postgresql.org/docs/17/app-psql.html).
