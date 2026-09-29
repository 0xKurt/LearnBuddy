# Datenschutz-Folgenabschätzung (DSGVO Art. 35)

**Gegenstand:** LearnBuddy — ein proaktiver Lernbegleiter für Schülerinnen und Schüler, der
Arbeitsblätter liest, Übungen erzeugt, im Chat erklärt und zu vereinbarten Zeiten erinnert.

**Warum diese Folgenabschätzung Pflicht ist:** die Verarbeitung betrifft **Daten von Kindern**
(schutzbedürftige Betroffene), nutzt **KI-Systeme** für Inhalte, die das Kind selbst schreibt
und fotografiert (neuartige Technologie), und verarbeitet **Sprachaufnahmen**. Nach den
WP248-Kriterien des EDSA genügen zwei dieser Merkmale; hier treffen drei zu — die
Folgenabschätzung ist nicht diskutabel. Zusätzlich verlangt EDPB Statement 1/2025 §13 eine
Abwägung der eingesetzten Alterssicherung (→ §6).

**Stand:** 29.09.2026 · **Prompt-Version der Modelle:** buddy.26 (`modules/buddy/prompts.ts`,
`BUDDY_PROMPT_VERSION`) · **Fassung:** 2 (Entwurf, Owner-Review offen) ·
**Verantwortlicher:** der Betreiber der App (Privatperson; Familienbetrieb)

> Diese Fassung ist von der Entwicklungsseite geschrieben und nennt ausdrücklich, was **belegt**
> ist (Datei und Symbol im Code, Test, Messung) und was **noch offen** ist. Was hier als offen
> steht, ist nicht geprüft — nicht „wahrscheinlich in Ordnung". Codepfade ohne `apps/`-Präfix
> liegen unter `apps/api/src/`; jedes genannte Symbol ist mit `grep` auffindbar.
>
> _Fassung 2 gegenüber Fassung 1:_ Belege auf Datei + Symbol präzisiert, Einwilligungs-Durchsetzung
> im Scheduler ergänzt (§2), Alterssicherung um die offene E-Mail-Schleife (#30) ergänzt (§6),
> offene Punkte vervollständigt (§7).

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
`docs/privacy.md` §What is stored): Name oder Spitzname, Geburtsdatum, Schulstufe ·
Chat-Nachrichten · Zusammenfassungen beendeter Gespräche (zwei bis vier Sätze, vom Modell
geschrieben, `buddy_session_summaries`) · Fotos von Arbeitsblättern und der daraus gelesene Text
· erzeugte Fragen und ihre Antworten · Lernstand je Thema · Notizen, die Buddy sich merkt (nur
aus ihren eigenen Worten, mit Zitat) · Einstellungen (Kontaktzeiten, Stimme) · Betriebsdaten
(Modellaufrufe ohne Inhalt, Hintergrundjobs, Fehlzähler). Logs enthalten Routennamen und
Fehlerklassen, nie Inhalte.

**Besondere Kategorien (Art. 9).** Nicht vorgesehen und nicht gewollt. Der Prompt verbietet,
Gesundheit, Familienprobleme, Gewalt oder Selbstverletzung als Wissen zu speichern; in einem
als Notlage markierten Zug verweigert der **Code** die Merk-Werkzeuge (`modules/buddy/tools.ts`,
`ToolContext.concern`), die App antwortet mit einem festen Text samt Hilfenummer und **merkt
sich nichts** (`docs/architecture.md` §Safeguarding; `safeguarding.int.test.ts`; live geprüft in
`apps/api/evals/buddy` in fünf Sprachen).

**Datenflüsse.**

| Schritt               | Was fließt wohin                                                                                                                                            |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chat                  | Nachricht → eigene API (Vercel, Region `fra1`/Frankfurt, `apps/api/vercel.json`) → Google Vertex AI (EU-Endpunkt) → Antwort                                 |
| Foto eines Blattes    | Foto → Supabase Storage (EU, privater Bucket) → Vertex AI liest es → Fragen in der Datenbank; das Foto wird 7 Tage nach dem Lesen gelöscht                  |
| Sprechen              | Erkennung **auf dem Gerät**, wo sie die Sprache kann; sonst Aufnahme → eigene API → Vertex AI (EU). Die Aufnahme wird **nie gespeichert**, nur ihr Ergebnis |
| Vorlesen              | ein Satz je Aufruf → Google Cloud TTS (nur EU-Endpunkt), Audio 24 h zwischengespeichert (`speech_cache`), ohne Namensfeld, Id oder Kontodaten               |
| Erinnerung aufs Handy | nur wenn Kontakt außerhalb der App eingeschaltet ist (Standard: aus); Titel/Text ohne Noten und ohne persönliche Details                                    |

**Auftragsverarbeiter** (Details und offene Punkte: `docs/privacy.md` §Processors): Supabase
(Datenbank, Auth, Storage; EU-Region) · Google Vertex AI (Modell; nur `eu` oder `europe-*`,
andere Regionen werden beim Start abgelehnt — `config.ts`, `EuLocation`) · Google Cloud TTS (nur
wenn eingeschaltet; nur `eu-texttospeech.googleapis.com` als einziger erlaubter Wert —
`config.ts`, `SPEECH_ENDPOINT`) · Vercel (API-Funktion, Frankfurt) · Apple/Google
Spracherkennung **auf dem Gerät** · Expo Push (Standard: aus, `config.ts` `PUSH_BACKEND`
default `disabled`; würde einen US-Unterauftragsverarbeiter hinzufügen — rechtliche Prüfung vor
dem Einschalten, §7).

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

| Was                                                 | Frist           | Beleg                                                            |
| --------------------------------------------------- | --------------- | ---------------------------------------------------------------- |
| Fotos und PDFs nach dem Lesen                       | 7 Tage          | `modules/materials/purge.ts` `PHOTO_RETENTION_DAYS`              |
| Entfernte/korrigierte Notiz (Undo-Fenster)          | 7 Tage          | `modules/materials/purge.ts` `MEMORY_UNDO_DAYS`                  |
| Was das Modell beim Entscheiden schrieb             | 90 Tage         | `modules/materials/purge.ts` `DECISION_CONTENT_DAYS` (Issue #78) |
| Buchhaltung der Modellaufrufe (nie Inhalt)          | 180 Tage        | `modules/materials/purge.ts` `CALL_LOG_DAYS`                     |
| Sprachaufnahmen (Sprechen statt Tippen, Aussprache) | nie gespeichert | `docs/privacy.md` §What is stored                                |
| Vorgelesenes Audio                                  | 24 h            | `speech_cache`, Migration `0044_shared_speech_cache.sql`         |
| Löschfrist nach Löschwunsch (Widerrufsfenster)      | 7 Tage Halt     | `modules/identity/privacy.ts` `DELETION_HOLD_DAYS`               |

**Kein Druck als Designregel.** Die App zeigt Lernenden nie, wie viele Tage sie ausgelassen hat
oder wie viel „offen" ist (CLAUDE.md Regel 6); Sperrbildschirm-Texte tragen keine Noten und
keine persönlichen Details.

---

## 4. Risiken für die Rechte und Freiheiten (Art. 35 Abs. 7 lit. c)

Bewertet aus der Sicht der betroffenen Person — des Kindes.

| #   | Risiko                                                                                         | Wer trägt es | Schwere  | Eintritt     |
| --- | ---------------------------------------------------------------------------------------------- | ------------ | -------- | ------------ |
| R1  | Das Modell **behauptet etwas Falsches** über ihren Lernstand oder erfindet eine Notiz über sie | Kind         | mittel   | mittel       |
| R2  | Das Modell antwortet **unangemessen** auf eine Notlage (Mobbing, Selbstverletzung)             | Kind         | **hoch** | gering       |
| R3  | **Fremdzugriff** auf Chats, Fotos, Lernstand                                                   | Kind         | hoch     | gering       |
| R4  | Ein **Auftragsverarbeiter** nutzt Inhalte weiter (Training, Missbrauchs-Logging)               | Kind         | hoch     | offen (§7)   |
| R5  | **Text ins Ausland** über die Vorlesestimme oder die Spracherkennung des Telefons              | Kind         | mittel   | gering–offen |
| R6  | **Druck und Dauerkontakt** („du hast 5 Tage nicht geübt")                                      | Kind         | mittel   | gering       |
| R7  | **Eltern lesen mit**, ohne dass das Kind es weiß                                               | Kind         | mittel   | gering       |
| R8  | **Falsches Alter** angegeben: ein zu junges Kind nutzt die App ohne Einwilligung der Eltern    | Kind         | mittel   | mittel       |
| R9  | **Daten bleiben** nach dem Löschwunsch                                                         | Kind         | hoch     | gering       |
| R10 | **Injection**: Text auf einem fotografierten Blatt steuert Buddy                               | Kind         | mittel   | gering       |

---

## 5. Abhilfemaßnahmen — und was sie belegt (Art. 35 Abs. 7 lit. d)

| Risiko | Maßnahme                                                                                                                                                                                                                                         | Beleg                                                                                                                                                                                     |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1     | Eine Notiz braucht ein wörtliches Zitat aus ihrer Nachricht, sonst weist die API sie zurück; Entscheidungen landen atomar hinter dem Kontext-Zaun; Status wird als _geplant / vorbereitet / erledigt / bestätigt_ getrennt geführt, nie geraten  | `modules/buddy/tools.ts` (`requireQuote`, `requireSupported`), `apply.ts` (`context_version`); Integrationstests inkl. veralteter Kontext; CLAUDE.md Regeln 1, 4, 5                       |
| R1     | **Inhalts-Eval**: erzeugte Fragen werden von einem zweiten Modell gegen das Blatt und die Klassenstufe geprüft                                                                                                                                   | `apps/api/evals/content` — Live-Lauf 29.09.: 30/30 ohne Befund (Issue #77)                                                                                                                |
| R2     | Not-Erkennung ist ein Code-Pfad: markiert das Modell `concern`, antwortet die App mit einem **festen** Text je Sprache samt Hilfenummer; die Modellantwort wird nie gezeigt; die Merk-Werkzeuge sind in dem Zug **im Code** verweigert           | `modules/buddy/turn.ts` (`safeguardingText`), `tools.ts` (`ToolContext.concern`); `safeguarding.int.test.ts`; `apps/api/evals/buddy` (Notlagen-Fälle in de/en/fr/es/it)                   |
| R2     | Blockt der Sicherheitsfilter des Anbieters eine Nachricht, bekommt sie denselben festen Text statt eines Fehlers; die Nachricht bleibt ihre, wird markiert und nie erneut ans Modell gesendet                                                    | `docs/architecture.md` §Safeguarding (`failure_code = 'blocked'`)                                                                                                                         |
| R3     | Row-Level-Security auf **allen** Tabellen ohne Policies; die in der App verbauten Schlüssel können nichts direkt lesen, schreiben oder aufrufen; Datenbank nur über TLS mit Zertifikatsprüfung                                                   | Migration `0022_revoke_app_key_access.sql`; `lib/db.ts`; Supabase-Advisor-Prüfung 29.09. (Issue #72: mit dem öffentlichen Schlüssel keine Zeile lesbar)                                   |
| R3     | Elternbereich hinter PIN (scrypt-Hash; 5 Fehlversuche sperren 15 Minuten, atomar gezählt); Admin-Token 5 Minuten gültig, HMAC-gebunden; Minderjährigen-Kontakt kann Buddy nur **reduzieren**, nie lockern                                        | `modules/identity/routes.ts` (`checkPin`), `lib/limits.ts` (`BUDGETS.pin`), `modules/buddy/policy.ts` (`loosens`); ADR 0006                                                               |
| R4     | EU-Endpunkte für Modell und Stimme sind erzwungen, ein anderer Wert bricht den Start ab; kein Training durch uns                                                                                                                                 | `config.ts` (`EuLocation`, `SPEECH_ENDPOINT` als Ein-Wert-Enum); **offen:** schriftliche Bestätigung der Verarbeiterbedingungen (§7); die DB-Region wird nur gewarnt (§1)                 |
| R5     | Spracherkennung nur **auf dem Gerät**; wo das Gerät es nicht kann (und immer im Browser), nimmt die App auf und nutzt den eigenen EU-Weg; auf iOS wird die Systemerkennung nur für die Telefonsprache genutzt; Aufnahmen werden nie gespeichert  | `apps/mobile/lib/speech/engine.ts` (Entscheidung im Code), `recognize.ts` (`requiresOnDeviceRecognition: true`); `docs/privacy.md` §Processors; **offen:** Prüfung am echten iPhone       |
| R6     | Kontakt außerhalb der App ist Opt-in (Einstellung + OS-Berechtigung, Standard aus); Ruhezeiten, Pause und Fenster werden beim Planen **und noch einmal beim Senden** geprüft; keine Zahlen über Versäumtes                                       | `modules/buddy/policy.ts`, `delivery.ts`; `config.ts` (`PUSH_BACKEND` default `disabled`); CLAUDE.md Regel 6; ADR 0006                                                                    |
| R7     | Der Elternbereich zeigt PIN, Zugangsdaten, Export, Löschung und Profilkorrektur — **keinen Chat**; bei einer Notlage werden die Eltern bewusst nicht benachrichtigt (die Hilfenummer ist der richtige Ort, Entscheidung D-10)                    | `apps/mobile/components/settings/AdultSection.tsx`; `docs/privacy.md` §Distress (D-10)                                                                                                    |
| R8     | Selbstauskunft des Geburtsdatums plus erzwungene E-Mail-Bestätigung des Kontos plus Eltern-PIN; Abwägung in §6                                                                                                                                   | `apps/mobile/lib/auth/supabase.ts` (`email_not_confirmed`: ohne Bestätigung keine Anmeldung); EDPB Statement 1/2025 §13                                                                   |
| R9     | Export (Art. 15/20) sofort als JSON; Löschung (Art. 17) nach 7-Tage-Halt als Job mit unbegrenzten Wiederholungen; Storage-Schulden werden nachverfolgt; `/health` meldet eine mehr als einen Tag überfällige Löschung                            | `modules/identity/privacy.ts` (`exportAccount`, `requestDeletion`, `executeAccountDeletion`), `modules/materials/purge.ts` (`erasureStatus`), `app.ts` (`/health`); `erasure.int.test.ts` |
| R10    | Blatt-Text, Nachschlage-Ergebnisse und STATE sind im Prompt ausdrücklich **Daten, keine Anweisungen**; die harte Garantie ist Code: jedes Werkzeug ist validiert, arbeitet nur auf den Aliassen dieser lernenden Person, hinter dem Kontext-Zaun | Prompt buddy.23+; `apps/api/evals/buddy` Fall `de_sheet_instruction_is_not_an_order`; `tools.ts`, `policy.ts`; `docs/architecture.md` §Injected text                                      |

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

**Bekannte Lücke, ehrlich benannt (Issue #30, offen):** die Bestätigungsmail trägt heute nicht
den Einwilligungstext und der Klick wird nicht als Einwilligungsschritt protokolliert
(kein `consent_confirmed_at`), wie es die EDPB-Blaupause (Leitlinien 05/2020, Example 23)
vorzeichnet. Der heutige Stand — Einwilligung in der App, protokolliert mit Textfassung und
Zeitpunkt, plus erzwungene E-Mail-Bestätigung — ist branchenüblich und vertretbar; die
protokollierte E-Mail-Schleife ist die belastbarere Variante und geplant.

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
4. **E-Mail-Schleife als protokollierter Einwilligungsschritt** (Issue #30, EDPB Example 23):
   Bestätigungsmail mit Einwilligungstext, Klick als `consent_confirmed_at` protokolliert,
   Kinderprofil-Chat erst danach.
5. **Pädagogische und rechtliche Prüfung der Notfalltexte** und der Entscheidung, Eltern nicht
   zu benachrichtigen (D-10) — `docs/architecture.md` §Safeguarding nennt sie ausdrücklich als
   Voraussetzung vor echten Lernenden außerhalb der Familie.
6. **iPhone-Prüfung** der Auf-dem-Gerät-Erkennung (`docs/privacy.md` §Processors nennt das
   iOS-Versprechen ausdrücklich als unbewiesen, bis es am Gerät geprüft ist).
7. **Leaked-Password-Schutz** in der Supabase-Konsole einschalten (Issue #72); ebenda offen:
   ein Rate-Limit auf Kontoerstellung in unserer API und die regelmäßige Advisor-Prüfung.
8. **Aufräumjobs beobachten und Backup-Wiederherstellung testen** (Issue #78): die Löschjobs
   laufen und sind getestet, aber niemand liest regelmäßig, ob sie liefen; ein Restore wurde
   nie geprobt.
9. **Konzeptbilder (Issue #50):** bevor sie gebaut werden, gehört die Aufbewahrung der
   Blatt-Ausschnitte ausdrücklich in `docs/privacy.md` — sie lebten länger als die Fotos, aus
   denen sie stammen.
10. **Expo Push:** vor dem Einschalten (`PUSH_BACKEND=expo`) rechtliche Prüfung des
    US-Unterauftragsverarbeiters (`docs/privacy.md` §Processors).
11. **Owner-Review** dieser Fassung; danach Datum und Fassung erhöhen. **Überprüfung** bei jeder
    Änderung an Zweck, Modell, Region oder Aufbewahrung, sonst jährlich.

---

## 8. Ergebnis

Die Verarbeitung ist mit den Maßnahmen aus §5 **zulässig durchführbar**; die verbleibenden
Risiken sind gering bis mittel und werden getragen. **Nicht erledigt** ist §7 — insbesondere die
schriftliche Bestätigung der Verarbeiterbedingungen (R4) und die pädagogisch-rechtliche Prüfung
der Notfalltexte (R2). Solange die App im Familienkreis läuft und die dort betroffene Person die
Tochter des Verantwortlichen ist, ist das vertretbar; **vor jeder Nutzung durch Dritte** müssen
die Punkte aus §7 abgearbeitet sein.
