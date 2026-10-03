# Datenschutz-Folgenabschätzung (DSGVO Art. 35)

**Gegenstand:** LearnBuddy — ein proaktiver Lernbegleiter für Schülerinnen und Schüler, der
Arbeitsblätter liest, Übungen erzeugt, im Chat erklärt und zu vereinbarten Zeiten erinnert.

**Warum diese Folgenabschätzung Pflicht ist:** die Verarbeitung betrifft **Daten von Kindern**
(schutzbedürftige Betroffene), nutzt **KI-Systeme** für Inhalte, die das Kind selbst schreibt
und fotografiert (neuartige Technologie), und verarbeitet **Sprachaufnahmen**. Nach den
WP248-Kriterien des EDSA genügen zwei dieser Merkmale; hier treffen drei zu — die
Folgenabschätzung ist nicht diskutabel. Zusätzlich verlangt EDPB Statement 1/2025 §13 eine
Abwägung der eingesetzten Alterssicherung (→ §6).

**Stand:** 02.10.2026 · **Prompt-Version der Modelle:** buddy.53 (`modules/buddy/prompts.ts`,
`BUDDY_PROMPT_VERSION`) · **Fassung:** 4 (Entwurf, Owner-Review offen) ·
**Verantwortlicher:** der Betreiber der App (Privatperson; Familienbetrieb) — **offen**, ob das
so bleibt (§7 Punkt 13)

> Diese Fassung ist von der Entwicklungsseite geschrieben und nennt ausdrücklich, was **belegt**
> ist (Datei und Symbol im Code, Test, Messung) und was **noch offen** ist. Was hier als offen
> steht, ist nicht geprüft — nicht „wahrscheinlich in Ordnung". Codepfade ohne `apps/`-Präfix
> liegen unter `apps/api/src/`; jedes genannte Symbol ist mit `grep` auffindbar.
>
> _Fassung 2 gegenüber Fassung 1:_ Belege auf Datei + Symbol präzisiert, Einwilligungs-Durchsetzung
> im Scheduler ergänzt (§2), Alterssicherung um die offene E-Mail-Schleife (#30) ergänzt (§6),
> offene Punkte vervollständigt (§7).
>
> _Fassung 4 gegenüber Fassung 3 (Issue #32):_ gegen den Code vom 02.10. nachgezogen — neue
> Datenarten und Modellaufrufe seit dem 30.09. (Bundesland, Materialsuche mit Einbettungen,
> nächtliche Gedächtnis-Zusammenführung, unklare Stellen, Konzeptbilder, Hörverstehen) in §1 und
> §3; der **Zwischenspeicher beim Modellanbieter** als eigener Datenfluss und Risiko R11; R7
> korrigiert (der Export zeigt dem Erwachsenen auch den Chat — Fassung 3 sagte „keinen Chat");
> R9 mit einem Vollständigkeitstest gegen den Datenbank-Katalog belegt, der dabei drei Lücken
> im Export gefunden hat (geschlossen); §7 um die Rechtsfragen ergänzt, die nur der Owner oder
> eine Anwältin entscheiden kann. Dazu das **Reinreden im Gesprächsmodus** (Issue #35): das
> Mikro misst, während Buddy spricht, nur den Pegel (§1 „Sprechen“, R5).

---

## 1. Systematische Beschreibung der Verarbeitung (Art. 35 Abs. 7 lit. a)

**Zweck.** Organisieren, Vorbereiten und Erinnern abnehmen, damit die lernende Person lernen kann:
Termine für Arbeiten führen, fotografierte Arbeitsblätter in Übungen verwandeln, Antworten
beurteilen, im Chat erklären, zu vereinbarten Zeiten erinnern. Kein Werbezweck, keine Analyse
für Dritte, keine Profilbildung über das Lernen hinaus.

**Betroffene Personen.** Eine lernende Person je Konto (in der Regel ein Kind ab ca. 10 Jahren)
und die erwachsene Person, die das Konto hält (E-Mail-Adresse, PIN; bei Minderjährigen gibt sie
die Einwilligung).

**Kategorien der Daten** (vollständige Tabelle mit Aufbewahrung je Zeile:
`docs/privacy.md` §What is stored): Name oder Spitzname, Geburtsdatum, Schulstufe, Bundesland
der Schule (`learners.curriculum_region`, für den Lehrplan; Issue #199) ·
Chat-Nachrichten · Zusammenfassungen beendeter Gespräche (zwei bis vier Sätze, vom Modell
geschrieben, `buddy_session_summaries`) · Fotos von Arbeitsblättern und der daraus gelesene Text
· daraus abgeleitet: Suchabschnitte des Textes samt Einbettungsvektoren (`material_passages`,
Issue #23), kleine echte Bildausschnitte von Abbildungen des Blattes (`material_images`, Issue
#50) und Stellen, die das Lesen nicht entscheiden konnte, samt der Lesart, die sie gewählt hat
(`material_unclear_spots`, Issue #164) · erzeugte Fragen und ihre Antworten · Lernstand je
Thema · Notizen, die Buddy sich merkt (nur aus ihren eigenen Worten, mit Zitat; nachts vom
Modell zusammengeführt, wo zwei dasselbe sagen — `modules/buddy/consolidate.ts`, Issue #20) · Einstellungen (Kontaktzeiten, Stimme) · Betriebsdaten
(Modellaufrufe ohne Inhalt, Hintergrundjobs, Fehlzähler). Logs enthalten Routennamen und
Fehlerklassen, nie Inhalte.

**Besondere Kategorien (Art. 9).** Nicht vorgesehen und nicht gewollt, und seit dem 30.09.
**nicht mehr nur im Prompt verboten**: jede Erinnerung trägt eine Angabe, worüber sie geht, und
der Code weist Gesundheit, Familie, Verletzung und Identität ab (`modules/buddy/tools.ts`,
`refuseForbiddenAbout`) — unabhängig davon, ob das Modell den Zug als Notlage markiert hat
(Issue #108). Zusätzlich verweigert der Code in einem als Notlage markierten Zug alle
Merk-Werkzeuge (`ToolContext.concern`), die App antwortet mit einem festen Text samt
Hilfenummer und **merkt sich nichts** (`docs/architecture.md` §Safeguarding;
`safeguarding.int.test.ts`; live geprüft in `apps/api/evals/buddy` in fünf Sprachen).

Diese Doppelung ist der Punkt: die Messung vom 29.09. hat live protokolliert, wie ein **nicht**
als Notlage markierter Zug eine Gesundheitsangabe als Erinnerung speicherte. Ein einziges Bit
des Modells darf kein Datenschutzversprechen tragen.

**Datenflüsse.**

| Schritt               | Was fließt wohin                                                                                                                                                                                                                                                                  |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chat                  | Nachricht → eigene API (Vercel, Region `fra1`/Frankfurt, `apps/api/vercel.json`) → Google Vertex AI (EU-Endpunkt) → Antwort                                                                                                                                                       |
| Foto eines Blattes    | Foto → Supabase Storage (EU, privater Bucket) → Vertex AI liest es → Fragen in der Datenbank; das Foto wird 7 Tage nach dem Lesen gelöscht                                                                                                                                        |
| Sprechen              | Erkennung **auf dem Gerät**, wo sie die Sprache kann; sonst Aufnahme → eigene API → Vertex AI (EU). Die Aufnahme wird **nie gespeichert**, nur ihr Ergebnis. Im Gesprächsmodus hört das Mikro auch, während Buddy spricht — aber nur als **Pegel** (Reinreden, #35), nie als Wort |
| Vorlesen              | ein Satz je Aufruf → Google Cloud TTS (nur EU-Endpunkt), Audio 24 h zwischengespeichert (`speech_cache`), ohne Namensfeld, Id oder Kontodaten                                                                                                                                     |
| Erinnerung aufs Handy | nur wenn Kontakt außerhalb der App eingeschaltet ist (Standard: aus); Titel/Text ohne Noten und ohne persönliche Details                                                                                                                                                          |
| Materialsuche         | Abschnitte des gelesenen Blatt-Textes und ihre Suchanfrage → Vertex AI (EU, Einbettungsmodell `VERTEX_MODEL_EMBEDDING`) → Vektor nur in `material_passages`                                                                                                                       |
| Hintergrund-Modell    | nach einem Gespräch: Zusammenfassung (`summarise.ts`); nachts: Zusammenführen der Notizen (`consolidate.ts`) — beide nur bei aktueller Einwilligung                                                                                                                               |
| Hörverstehen          | der Aufgabentext, den die Frage vorliest (`items.listen_task`, Issue #210) → derselbe TTS-Weg wie „Vorlesen", derselbe 24-h-Audiocache                                                                                                                                            |

**Auftragsverarbeiter** (Details und offene Punkte: `docs/privacy.md` §Processors): Supabase
(Datenbank, Auth, Storage; EU-Region) · Google Vertex AI (Modell; nur `eu` oder `europe-*`,
andere Regionen werden beim Start abgelehnt — `config.ts`, `EuLocation`) · Google Cloud TTS (nur
wenn eingeschaltet; nur `eu-texttospeech.googleapis.com` als einziger erlaubter Wert —
`config.ts`, `SPEECH_ENDPOINT`) · Vercel (API-Funktion, Frankfurt) · Apple/Google
Spracherkennung **auf dem Gerät** · Expo Push (Standard: aus, `config.ts` `PUSH_BACKEND`
default `disabled`; würde einen US-Unterauftragsverarbeiter hinzufügen — rechtliche Prüfung vor
dem Einschalten, §7) · Sentry (Absturzberichte; Standard: aus, ohne `EXPO_PUBLIC_SENTRY_DSN`
wird das SDK nie gestartet. Eingeschaltet nur EU-Region: ein DSN außerhalb
`*.ingest.de.sentry.io` bricht den Start ab — `apps/mobile/lib/env.ts`, dieselbe Haltung wie
`EuLocation`. Gesendet werden Fehler, Stack, Build, Gerätemodell und der Bildschirmwechsel;
Nutzerobjekt, laufender Request, Freitextanhänge, Konsolen- und Netz-Breadcrumbs und
E-Mail-Adressen werden vorher entfernt — Screenshots und Session-Replay sind ausdrücklich aus
(`lib/observability/scrub.ts`, unit-getestet). Rechtliche Prüfung vor dem Einschalten, §7).

**Zwischenspeicher beim Modellanbieter (neu in Fassung 4).** Der Prompt ist so geschichtet,
dass Gemini den gleichbleibenden Anfang aufeinanderfolgender Aufrufe wiederverwenden kann
(implizites Caching; `modules/buddy/context.ts`, Messung in `docs/architecture.md` §Speed,
`llm_calls.cached_tokens`, Migration 0052). Gemessen (Issue #279, 02.10.): der gleichbleibende
Teil besteht zu 98,6 % aus Systemanweisung und Antwortschema, reicht bei **derselben** Lernenden
aber bis kurz vor `## Now` in den Zustandsblock — **Name, Alter, Stufe und Sprache** stehen
darin. Google dokumentiert für dieses Caching einen Zwischenspeicher **im Arbeitsspeicher mit
höchstens 24 Stunden Lebensdauer** (Herstellerseite „zero data retention", Abruf 02.10.2026,
zitiert in #279). Wir schreiben nichts davon selbst; ob und wo der Anbieter es hält, ist eine
Aussage des Anbieters, **nicht von uns geprüft** — deshalb R11 und §7 Punkt 14. Expliziter
Cache (`CachedContent`) wird **nicht** genutzt (Issue #282 vergleicht ihn erst).

_Der Genauigkeit halber:_ die Datenbank-Region wird beim Start **geprüft, aber nur gewarnt**,
nicht verweigert (`config.ts`, `databaseRegionWarning`; Entscheidung D-4) — anders als bei
Vertex und TTS, wo eine Nicht-EU-Region den Start abbricht.

---

## 2. Rechtsgrundlagen — und wie die Einwilligung erzwungen wird

- **Einwilligung (Art. 6 Abs. 1 lit. a, Art. 8; deutsches Schutzalter 16, ADR 0006).** Unter 16
  gibt die erwachsene Person die Einwilligung beim Anlegen des Profils; sie ist mit Textfassung
  und Zeitpunkt gespeichert (`minor_consent_version`, `minor_consent_at`;
  `modules/identity/routes.ts`). **Ab dem 16. Geburtstag fragt die App die lernende Person
  selbst** (Issue #31; EDPB-Leitlinien 05/2020 zur Einwilligung, Rn. 147–149) und speichert ihre
  eigene Einwilligung (`self_consent_version`, `self_consent_at`; `POST /learner/consent`, ohne
  PIN); die Aufzeichnung der Eltern bleibt unverändert stehen — sie sagt, was bis dahin getragen
  hat (`self-consent.int.test.ts`).
- **Die Einwilligung ist Code, kein Häkchen.** Jede lernenden-seitige Route antwortet
  409 `consent_outdated`, solange die Kontofassung nicht die aktuelle ist (`http/context.ts`);
  eine geänderte Datenschutzerklärung bekommt eine neue `CONSENT_VERSION` und muss erneut
  gelesen werden. Auch die **Hintergrundarbeit** hält an: `consentCurrentSql`
  (`modules/scheduler/jobs.ts`, ebenso in `modules/buddy/delivery.ts`) filtert Jobs und
  Zustellungen — bei veralteter Einwilligung liest kein Job Fotos, läuft kein Buddy-Check und
  geht keine Nachricht hinaus.
- **Vertrag (lit. b)** trägt den Betrieb des Kontos selbst (Anmeldung, Speicherung, Export).
- **Kein berechtigtes Interesse** als Grundlage für Inhalte des Kindes; kein Werbe- oder
  Analysezweck; **kein Training** durch uns auf ihren Daten (die schriftliche Bestätigung der
  Verarbeiterbedingungen für Vertex und TTS steht in §7 als offener Punkt).

---

## 3. Notwendigkeit und Verhältnismäßigkeit (Art. 35 Abs. 7 lit. b)

**Warum überhaupt ein KI-Modell.** Der Zweck — ein fotografiertes Blatt verstehen, in ihren
Worten erklären, eine freie Antwort beurteilen — verlangt Sprachverständnis. Wortlisten und
fest verdrahtete Antworten als Ersatz sind verboten (CLAUDE.md Regel 3), weil sie
Sprachverständnis nur vortäuschen. Die Rollenteilung ist fest: **das Modell interpretiert und
plant, Code erzwingt** (Regel 1) — Berechtigungen, Mandantentrennung, Kontaktregeln und Fristen
stehen nie nur im Prompt. Ohne Modell läuft die App ehrlich eingeschränkt weiter
(`LLM_BACKEND=disabled`, `config.ts`); der Kernzweck entfällt dann.

**Datenminimierung im Modellaufruf, nicht im Versprechen.** Der Kontext des Modells
(`modules/buddy/context.ts`) trägt: Datum und Zeitzone, Name (auch Spitzname möglich) und
**Alter in Jahren** (`ageGroup` — nie das Geburtsdatum), Stufe und Sprache, Buddys Notizen samt
Zitat, Ziele und Plan, den Gesprächsverlauf und den Blatt-Text, den die Antwort braucht.
Nie: E-Mail-Adresse, PIN, echte Datenbank-Ids (das Modell arbeitet auf Aliassen wie `m3`,
Regel 2), Zustelldetails.

**Kurze Fristen, im Code als Konstanten:**

| Was                                                 | Frist                                    | Beleg                                                            |
| --------------------------------------------------- | ---------------------------------------- | ---------------------------------------------------------------- |
| Fotos und PDFs nach dem Lesen                       | 7 Tage                                   | `modules/materials/purge.ts` `PHOTO_RETENTION_DAYS`              |
| Entfernte/korrigierte Notiz (Undo-Fenster)          | 7 Tage                                   | `modules/materials/purge.ts` `MEMORY_UNDO_DAYS`                  |
| Was das Modell beim Entscheiden schrieb             | 90 Tage                                  | `modules/materials/purge.ts` `DECISION_CONTENT_DAYS` (Issue #78) |
| Buchhaltung der Modellaufrufe (nie Inhalt)          | 180 Tage                                 | `modules/materials/purge.ts` `CALL_LOG_DAYS`                     |
| Sprachaufnahmen (Sprechen statt Tippen, Aussprache) | nie gespeichert                          | `docs/privacy.md` §What is stored                                |
| Vorgelesenes Audio                                  | 24 h                                     | `speech_cache`, Migration `0044_shared_speech_cache.sql`         |
| Konzeptbild-Ausschnitte, Suchabschnitte             | mit dem Blatt                            | `modules/materials/purge.ts` `purgeContent` (Issues #50, #23)    |
| Unklare Stellen eines Blattes                       | mit dem Blatt                            | `modules/materials/purge.ts` `purgeContent` (Issue #164)         |
| Prompt-Zwischenspeicher beim Anbieter (implizit)    | ≤ 24 h (Angabe des Anbieters, ungeprüft) | Herstellerdoku, §1; R11                                          |
| Löschfrist nach Löschwunsch (Widerrufsfenster)      | 7 Tage Halt                              | `modules/identity/privacy.ts` `DELETION_HOLD_DAYS`               |

**Kein Druck als Designregel.** Die App zeigt Lernenden nie, wie viele Tage sie ausgelassen hat
oder wie viel „offen" ist (CLAUDE.md Regel 6); Sperrbildschirm-Texte tragen keine Noten und
keine persönlichen Details.

---

## 4. Risiken für die Rechte und Freiheiten (Art. 35 Abs. 7 lit. c)

Bewertet aus der Sicht der betroffenen Person — des Kindes.

| #   | Risiko                                                                                                               | Wer trägt es | Schwere  | Eintritt     |
| --- | -------------------------------------------------------------------------------------------------------------------- | ------------ | -------- | ------------ |
| R1  | Das Modell **behauptet etwas Falsches** über ihren Lernstand oder erfindet eine Notiz über sie                       | Kind         | mittel   | mittel       |
| R2  | Das Modell antwortet **unangemessen** auf eine Notlage (Mobbing, Selbstverletzung)                                   | Kind         | **hoch** | gering       |
| R3  | **Fremdzugriff** auf Chats, Fotos, Lernstand                                                                         | Kind         | hoch     | gering       |
| R4  | Ein **Auftragsverarbeiter** nutzt Inhalte weiter (Training, Missbrauchs-Logging)                                     | Kind         | hoch     | offen (§7)   |
| R5  | **Text ins Ausland** über die Vorlesestimme oder die Spracherkennung des Telefons                                    | Kind         | mittel   | gering–offen |
| R6  | **Druck und Dauerkontakt** („du hast 5 Tage nicht geübt")                                                            | Kind         | mittel   | gering       |
| R7  | **Eltern lesen mit**, ohne dass das Kind es weiß                                                                     | Kind         | mittel   | gering       |
| R8  | **Falsches Alter** angegeben: ein zu junges Kind nutzt die App ohne Einwilligung der Eltern                          | Kind         | mittel   | mittel       |
| R9  | **Daten bleiben** nach dem Löschwunsch                                                                               | Kind         | hoch     | gering       |
| R10 | **Injection**: Text auf einem fotografierten Blatt steuert Buddy                                                     | Kind         | mittel   | gering       |
| R11 | **Zwischenspeicher beim Anbieter** hält Name, Alter und Prompt-Anfang bis zu 24 h außerhalb unserer Löschung         | Kind         | mittel   | offen (§7)   |
| R12 | **Abgeleitetes überdauert die Quelle**: Bildausschnitte, Suchabschnitte, Zusammenfassungen leben länger als das Foto | Kind         | gering   | mittel       |

---

## 5. Abhilfemaßnahmen — und was sie belegt (Art. 35 Abs. 7 lit. d)

| Risiko | Maßnahme                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Beleg                                                                                                                                                                                                                                       |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1     | Eine Notiz braucht ein wörtliches Zitat aus ihrer Nachricht, sonst weist die API sie zurück; Entscheidungen landen atomar hinter dem Kontext-Zaun; Status wird als _geplant / vorbereitet / erledigt / bestätigt_ getrennt geführt, nie geraten                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `modules/buddy/tools.ts` (`requireQuote`, `requireSupported`), `apply.ts` (`context_version`); Integrationstests inkl. veralteter Kontext; CLAUDE.md Regeln 1, 4, 5                                                                         |
| R1     | **Inhalts-Eval**: erzeugte Fragen werden von einem zweiten Modell gegen das Blatt und die Klassenstufe geprüft                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `apps/api/evals/content` — Live-Lauf 29.09.: 30/30 ohne Befund (Issue #77)                                                                                                                                                                  |
| R2     | Not-Erkennung ist ein Code-Pfad: markiert das Modell `concern`, antwortet die App mit einem **festen** Text je Sprache samt Hilfenummer; die Modellantwort wird nie gezeigt; die Merk-Werkzeuge sind in dem Zug **im Code** verweigert                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `modules/buddy/turn.ts` (`safeguardingText`), `toolKit.ts` (`ToolContext.concern`, `refuseDuringConcern`); `safeguarding.int.test.ts`; `apps/api/evals/buddy` (Notlagen-Fälle in de/en/fr/es/it)                                            |
| R2     | Blockt der Sicherheitsfilter des Anbieters eine Nachricht, bekommt sie denselben festen Text statt eines Fehlers; die Nachricht bleibt ihre, wird markiert und nie erneut ans Modell gesendet                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | `docs/architecture.md` §Safeguarding (`failure_code = 'blocked'`)                                                                                                                                                                           |
| R2     | **Restrisiko, gemessen statt vermutet:** der ganze Pfad hängt daran, dass das Modell `concern` setzt. 35 Fälle (16 Offenlegungen aus dem Korpus, 19 Gegenproben), mehrfach live gefahren. Messung vom **29.09. (buddy.26)**: 88 % erkannt, 26 % Fehlalarm — eine Essstörung in 6 von 10 Runden nicht erkannt, Scheidung und Elternstreit 10/10 Fehlalarm, und ein nicht geflaggter Zug speicherte eine Gesundheitsangabe als Erinnerung. **Daraus geändert und am 30.09. (buddy.41/42) nachgemessen: 83/83 erkannt, 0/78 Fehlalarm, kein Fall kippt zwischen Runden.** Die Kriterien nennen jetzt ausdrücklich das Hungern, und die Gegenbeispiele stammen aus den gemessenen Fehlalarmen, nicht aus einer Vermutung | `apps/api/evals/concern/` (Läufe 29.09. und 30.09.2026, Modell `eu/gemini-3.6-flash`, je 161 Züge); Issue #109 (geschlossen)                                                                                                                |
| R2     | **Der Merk-Schutz hängt nicht mehr an derselben Entscheidung:** `refuseForbiddenAbout` verweigert jede Erinnerung über Gesundheit, Familie, Verletzung und Identität — unabhängig davon, ob `concern` gesetzt wurde. Die beiden am 29.09. live protokollierten Ausrutscher können diesen Weg nicht mehr nehmen                                                                                                                                                                                                                                                                                                                                                                                                       | `modules/buddy/tools.ts` (`NEVER_KEPT`); Issue #108                                                                                                                                                                                         |
| R3     | Row-Level-Security auf **allen** Tabellen ohne Policies; die in der App verbauten Schlüssel können nichts direkt lesen, schreiben oder aufrufen; Datenbank nur über TLS mit Zertifikatsprüfung                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Migration `0022_revoke_app_key_access.sql`; `lib/db.ts`; Supabase-Advisor-Prüfung 29.09. (Issue #72: mit dem öffentlichen Schlüssel keine Zeile lesbar)                                                                                     |
| R3     | Elternbereich hinter PIN (scrypt-Hash; 5 Fehlversuche sperren 15 Minuten, atomar gezählt); Admin-Token 5 Minuten gültig, HMAC-gebunden; Minderjährigen-Kontakt kann Buddy nur **reduzieren**, nie lockern                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `modules/identity/routes.ts` (`checkPin`), `lib/limits.ts` (`BUDGETS.pin`), `modules/buddy/policy.ts` (`loosens`); ADR 0006                                                                                                                 |
| R4     | EU-Endpunkte für Modell und Stimme sind erzwungen, ein anderer Wert bricht den Start ab; kein Training durch uns                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `config.ts` (`EuLocation`, `SPEECH_ENDPOINT` als Ein-Wert-Enum); **offen:** schriftliche Bestätigung der Verarbeiterbedingungen (§7); die DB-Region wird nur gewarnt (§1)                                                                   |
| R5     | Spracherkennung nur **auf dem Gerät**; wo das Gerät es nicht kann (und immer im Browser), nimmt die App auf und nutzt den eigenen EU-Weg; auf iOS wird die Systemerkennung nur für die Telefonsprache genutzt; Aufnahmen werden nie gespeichert; beim Reinreden (Gesprächsmodus, #35) liest die App nur den Pegel des Mikros, schreibt nichts mit und schickt nichts weg                                                                                                                                                                                                                                                                                                                                             | `apps/mobile/lib/speech/engine.ts` (Entscheidung im Code), `recognize.ts` (`requiresOnDeviceRecognition: true`); `apps/mobile/lib/speech/bargeIn.ts`, `bargeMonitor.ts`; `docs/privacy.md` §Processors; **offen:** Prüfung am echten iPhone |
| R6     | Kontakt außerhalb der App ist Opt-in (Einstellung + OS-Berechtigung, Standard aus); Ruhezeiten, Pause und Fenster werden beim Planen **und noch einmal beim Senden** geprüft; keine Zahlen über Versäumtes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `modules/buddy/policy.ts`, `delivery.ts`; `config.ts` (`PUSH_BACKEND` default `disabled`); CLAUDE.md Regel 6; ADR 0006                                                                                                                      |
| R7     | Der Elternbereich zeigt PIN, Zugangsdaten, Export, Löschung und Profilkorrektur — **kein Mitlesen**: kein Chatfenster, keine Benachrichtigung, auch nicht bei einer Notlage (die Hilfenummer ist der richtige Ort, Entscheidung D-10). **Korrektur gegenüber Fassung 3:** der Export (unter 16 hinter der Eltern-PIN) enthält das ganze Gespräch (`buddy_messages`) — der Erwachsene kann es also herunterladen. Buddy sagt ihr genau das, wenn sie fragt, abgelesen aus dem, was der Code erlaubt (Issue #114). Ob ein Kind darüber hinaus vorab informiert werden muss, ist eine Rechtsfrage (§7 Punkt 15)                                                                                                         | `apps/mobile/components/settings/AdultSection.tsx`; `http/context.ts` (`assertAccountHolderOf`); `modules/buddy/context.ts` (Abschnitt „Who can read this“); `docs/privacy.md` §Distress (D-10)                                             |
| R8     | Selbstauskunft des Geburtsdatums plus erzwungene E-Mail-Bestätigung des Kontos plus Eltern-PIN; der Klick auf den Bestätigungslink wird als bestätigte Einwilligung protokolliert (`accounts.consent_confirmed_at`; die Mail trägt den Einwilligungstext); Abwägung in §6                                                                                                                                                                                                                                                                                                                                                                                                                                            | `apps/mobile/lib/auth/supabase.ts` (`email_not_confirmed`); EDPB Statement 1/2025 §13, Guidelines 05/2020 Beispiel 23 (#30); `consent-confirmation.int.test.ts`, `docs/consent-email-templates.md`                                          |
| R9     | Export (Art. 15/20) sofort als JSON; Löschung (Art. 17) nach 7-Tage-Halt als Job mit unbegrenzten Wiederholungen; Storage-Schulden werden nachverfolgt; `/health` meldet eine mehr als einen Tag überfällige Löschung. **Vollständigkeit gegen den Datenbank-Katalog geprüft, nicht gegen eine Liste:** jede Spalte, die eine Person nennt, kaskadiert beim Löschen von ihr, und jede solche Tabelle steht im Export — eine neue Tabelle ohne Export lässt den Test scheitern. Er fand am 02.10. drei Lücken im Export (`material_unclear_spots`, `speech_cache`, `attempt_counters`), alle geschlossen                                                                                                              | `modules/identity/privacy.ts` (`exportAccount`, `requestDeletion`, `executeAccountDeletion`), `modules/materials/purge.ts` (`erasureBacklog`), `app.ts` (`/health`); `erasure.int.test.ts`, `export-completeness.int.test.ts`               |
| R10    | Blatt-Text, Nachschlage-Ergebnisse und STATE sind im Prompt ausdrücklich **Daten, keine Anweisungen**; die harte Garantie ist Code: jedes Werkzeug ist validiert, arbeitet nur auf den Aliassen dieser lernenden Person, hinter dem Kontext-Zaun                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Prompt buddy.23+; `apps/api/evals/buddy` Fall `de_sheet_instruction_is_not_an_order`; `tools.ts`, `policy.ts`; `docs/architecture.md` §Injected text                                                                                        |
| R11    | Kein expliziter Cache; der Anbieter-Zwischenspeicher ist nach seiner Angabe flüchtig und projektgebunden; das Geburtsdatum geht nie hinaus (nur Alter in Jahren). **Offen:** Bestätigung beim Anbieter, wo der Zwischenspeicher liegt, und die Entscheidung, ob er projektweit abgeschaltet wird — das kostet die gemessene Ersparnis (§7 Punkt 14)                                                                                                                                                                                                                                                                                                                                                                  | `modules/buddy/context.ts` (`ageGroup`, Reihenfolge der Abschnitte); `llm/vertex.ts` (`cachedContentTokenCount`); Issue #279                                                                                                                |
| R12    | Bewusst entschieden und benannt: Ausschnitte, Suchabschnitte und unklare Stellen sind Lernmaterial und gehen **mit dem Blatt**; Zusammenfassungen gehen mit dem Konto; ein Notlagen-Zug erscheint in keiner Zusammenfassung (eine Regel für alles, was ein Modell über frühere Nachrichten erfährt)                                                                                                                                                                                                                                                                                                                                                                                                                  | `modules/materials/purge.ts` (`purgeContent`); `modules/buddy/recall.ts` (Issue #149); `docs/privacy.md` §What is stored                                                                                                                    |

**Organisatorisch.** Ein Modell- oder Regionswechsel ist eine Codeänderung und wird erst
übernommen, wenn die Evals der betroffenen Aufgabe auf ihm bestehen (`docs/architecture.md`
§Model calls); der Browser-Durchlauf prüft jede Oberflächenänderung auf beiden Handygrößen samt
Barrierefreiheit (axe an 52 Halten, Issue #73).

---

## 6. Verhältnismäßigkeit der Alterssicherung (EDPB Statement 1/2025 §13)

**Maßstab.** Die Eingriffstiefe der Alterssicherung muss zum Risiko des Dienstes passen; eine
Alterssicherung darf nicht selbst zur Datensammlung über das Kind werden.

**Risikoprofil des Dienstes:** keine Werbung, kein Tracking für Dritte, keine sozialen
Funktionen, kein Kontakt zu Fremden, Verarbeitung in der EU, kurze Fristen (§3), Kontakt nur
mit Opt-in. Die Schutzmaßnahmen aus §5 gelten **unabhängig vom angegebenen Alter**.

**Gewählt:**

1. **Selbstauskunft des Geburtsdatums** beim Anlegen des Profils (das volle Datum, damit der
   Übergang mit 16 erkannt wird — ADR 0001; unter 16 verlangt die API die elterliche
   Einwilligung, `modules/identity/routes.ts` `minor_consent_required`).
2. **Erzwungene E-Mail-Bestätigung** des Erwachsenen-Kontos vor der ersten Anmeldung
   (`apps/mobile/lib/auth/supabase.ts` behandelt `email_not_confirmed`; die Durchsetzung selbst
   ist eine Auth-Einstellung des gehosteten Supabase-Projekts, nicht in diesem Repository
   prüfbar).
3. **Eltern-PIN** für alles, was Kontakt lockert oder Daten ausleitet (Export, Löschung,
   Geburtsdatum-Korrektur, neue Einwilligung — `docs/privacy.md` §Accounts and minors).

**Frühere Lücke, geschlossen (Issue #30):** der Klick auf den Bestätigungslink wird als
bestätigte Einwilligung protokolliert (`accounts.consent_confirmed_at`, Migration 0051,
angewandt 29.09.), wie es die EDPB-Blaupause (Leitlinien 05/2020, Example 23) vorzeichnet;
die Mail-Vorlagen mit dem Einwilligungstext in Worten stehen in
`docs/consent-email-templates.md`. **Offen bleibt allein der Konsolen-Schritt des Owners**
(Vorlage in Supabase Auth eintragen, siehe §7 und Issue #44) — bis dahin bestätigt der Klick
die Adresse, und die App protokolliert ihn bereits.

**Geprüft und verworfen, mit Grund:**

- _Ausweis- oder Gesichtsprüfung:_ eine biometrische oder amtliche Prüfung für eine
  Familien-Lern-App verarbeitet deutlich mehr Daten über dasselbe Kind, als sie schützt —
  unverhältnismäßig (die Eingriffstiefe passt nicht zum Risikoprofil oben).
- _Bezahlkarten-Prüfung des Elternteils:_ schließt Familien ohne Karte aus und verrät
  Zahlungsdaten an einen weiteren Verarbeiter, ohne das Alter des **Kindes** zu belegen.
- _Drittanbieter-Alterssignal:_ fügt einen Verarbeiter hinzu, der ein Profil über dasselbe Kind
  aufbaut — genau das, was die Alterssicherung verhindern soll.

**Restrisiko (R8):** Ein Kind kann ein falsches Geburtsdatum angeben — auch eines, das es älter
als 16 macht und damit die Eltern-Schranken umgeht. Getragen wird das durch die Maßnahmen, die
unabhängig vom Alter gelten: kein Werbezweck, keine Profilbildung, kurze Aufbewahrung,
Notfalltext statt Modellantwort, kein Zählen von Versäumtem, Kontakt nur mit Opt-in. Das
Restrisiko wird als **vertretbar** eingestuft.

---

## 7. Offene Punkte (vor einem Start über den Familienkreis hinaus)

1. **Verarbeiterbedingungen bestätigen** für Vertex AI und Cloud TTS: kein Training auf
   Kundendaten, Missbrauchs-Logging (abuse monitoring) aus, EU-Verarbeitung — schriftlich,
   projektbezogen. Dazu der **GA-Status des Modells**: Googles Preview-Bedingungen schließen
   Dienste aus, die voraussichtlich von unter 18-Jährigen genutzt werden
   (`docs/privacy.md` §Processors).
2. **Auftragsverarbeitungsverträge** (Art. 28) mit Supabase, Google Cloud und Vercel ablegen.
3. **Verzeichnis von Verarbeitungstätigkeiten** (Art. 30) schreiben — diese Folgenabschätzung
   liefert den Inhalt.
4. **E-Mail-Schleife: der Konsolen-Schritt** (Issue #30 ist code-seitig erledigt — Klick wird
   als `consent_confirmed_at` protokolliert, Migration 0051 angewandt): die Vorlage aus
   `docs/consent-email-templates.md` in der Supabase-Konsole eintragen (Issue #44).
5. **Pädagogische und rechtliche Prüfung der Notfalltexte** und der Entscheidung, Eltern nicht
   zu benachrichtigen (D-10) — `docs/architecture.md` §Safeguarding nennt sie ausdrücklich als
   Voraussetzung vor echten Lernenden außerhalb der Familie.
6. **iPhone-Prüfung** der Auf-dem-Gerät-Erkennung (`docs/privacy.md` §Processors nennt das
   iOS-Versprechen ausdrücklich als unbewiesen, bis es am Gerät geprüft ist).
7. **Leaked-Password-Schutz** in der Supabase-Konsole einschalten (Issue #72); ebenda offen:
   ein Rate-Limit auf Kontoerstellung in unserer API und die regelmäßige Advisor-Prüfung.
8. **Backup-Wiederherstellung testen** (Issue #78): ein Restore wurde nie geprobt — in der
   Supabase-Konsole ein Backup auf ein Wegwerf-Projekt zurückspielen und stichprobenhaft
   prüfen, dass Konten, Materialien und Gespräche vollständig sind. Der erste Teil des
   Issues ist erledigt: die Aufräumjobs melden jeden vollständigen Lauf mit Zählern an
   `GET /health` (`scheduler.retention`), und die Health-Action wird rot, wenn sie
   24 Stunden nicht liefen (`docs/privacy.md` §What is stored).
9. ~~**Konzeptbilder (Issue #50):** Aufbewahrung der Blatt-Ausschnitte vor dem Bau in
   `docs/privacy.md`.~~ **Erledigt:** `docs/privacy.md` §What is stored nennt sie (mit dem
   Blatt, nicht mit der 7-Tage-Frist der Fotos); als bewusste Entscheidung in R12.
10. **Expo Push:** vor dem Einschalten (`PUSH_BACKEND=expo`) rechtliche Prüfung des
    US-Unterauftragsverarbeiters (`docs/privacy.md` §Processors).
11. **Sentry (Issue #36):** vor dem Setzen von `EXPO_PUBLIC_SENTRY_DSN` der
    Auftragsverarbeitungsvertrag mit Functional Software Inc. und die Bestätigung, dass die
    EU-Region in EU-Mitgliedstaaten verarbeitet und speichert (`docs/privacy.md` §Processors).
    Der Restrisiko-Punkt steht dort ebenfalls: eine Ausnahmemeldung wird von unserem Code
    geschrieben, künftiger Code könnte darin etwas zitieren, das die Lernende getippt hat.
12. **Owner-Review** dieser Fassung; danach Datum und Fassung erhöhen. **Überprüfung** bei jeder
    Änderung an Zweck, Modell, Region oder Aufbewahrung, sonst jährlich.
13. **Verantwortlicher** (Owner): bleibt es für LearnBuddy die Privatperson, oder wird es wie für
    neue Buddys Zero X Ventures (Entscheidung in Issue #107, 29.09.)? Davon hängen
    Datenschutzerklärung, Impressum, AV-Verträge und der Kopf dieser Folgenabschätzung ab.
14. **Zwischenspeicher beim Modellanbieter** (R11, Owner + Anbieter): schriftlich bestätigen
    lassen, dass der implizite Cache im Arbeitsspeicher, projektgebunden und in der EU-Region
    liegt und nach höchstens 24 h verfällt. Dann entscheiden, ob er projektweit abgeschaltet
    wird (Google beschreibt dafür eine Projekteinstellung — **von uns nicht geprüft**); das
    kostet die in `docs/architecture.md` §Speed gemessene Ersparnis. Eine juristische Wertung,
    ob ein ≤ 24-h-Zwischenspeicher zur „Speicherung" im Sinne der Verarbeiterbedingungen zählt,
    ist hier **nicht** getroffen.
15. **Export eines Kinderkontos an die Eltern** (Anwältin/Anwalt): der Export unter 16 hinter
    der Eltern-PIN enthält ihr ganzes Gespräch (R7). Rechtlich zu werten: ob das als Ausübung
    ihres Auskunftsrechts durch die Sorgeberechtigten trägt, ob das Kind **vorher** in der App
    darauf hingewiesen werden muss (heute erfährt sie es auf Nachfrage von Buddy), und ob ab
    16 etwas anderes gilt (heute: ab 16 exportiert sie selbst, ohne PIN). **Nicht entschieden.**
16. **Age-Assurance-Proportionalität (§6) juristisch bestätigen:** die Abwägung in §6 ist von
    der Entwicklungsseite begründet; ob sie den Erwartungen der zuständigen Aufsichtsbehörde
    genügt, ist eine Rechtsfrage und hier **nicht** abschließend beurteilt.

---

## 8. Ergebnis

_Fassung 4:_ an diesem Ergebnis ändert sich nichts. Neu dazu kommen zwei Rechtsfragen, die
nicht die Entwicklung entscheidet (§7 Punkte 14 und 15), und eine Entscheidung des Owners
(Punkt 13).

Die Verarbeitung ist mit den Maßnahmen aus §5 **zulässig durchführbar**; die verbleibenden
Risiken sind gering bis mittel und werden getragen. **Nicht erledigt** ist §7 — insbesondere die
schriftliche Bestätigung der Verarbeiterbedingungen (R4) und die pädagogisch-rechtliche Prüfung
der Notfalltexte (R2). Die **Erkennung**, die zu diesen Texten führt, ist seit dem 30.09. in
beide Richtungen belegt (§5, R2); geprüft werden muss weiterhin, ob die Texte selbst pädagogisch
und rechtlich richtig sind — das ist keine Messfrage. Solange die App im Familienkreis läuft und die dort betroffene Person die
Tochter des Verantwortlichen ist, ist das vertretbar; **vor jeder Nutzung durch Dritte** müssen
die Punkte aus §7 abgearbeitet sein.
