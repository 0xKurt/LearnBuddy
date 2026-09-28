# Datenschutz-Folgenabschätzung (DSGVO Art. 35)

**Gegenstand:** LearnBuddy — ein proaktiver Lernbegleiter für Schülerinnen und Schüler, der
Arbeitsblätter liest, Übungen erzeugt, im Chat erklärt und zu vereinbarten Zeiten erinnert.

**Warum diese Folgenabschätzung Pflicht ist:** die Verarbeitung betrifft **Daten von Kindern**
(Art. 8 DSGVO), nutzt **KI-Systeme** für Inhalte, die das Kind selbst schreibt und fotografiert,
und verarbeitet **Sprachaufnahmen**. Jeder dieser Punkte steht in den Listen der Aufsichtsbehörden;
zusammen ist die Folgenabschätzung nicht diskutabel. Zusätzlich verlangt EDPB Statement 1/2025 §13
eine Abwägung der eingesetzten Alterssicherung.

**Stand:** 29.09.2026 · **Prompt-Version der Modelle:** buddy.26 · **Fassung:** 1 (Entwurf,
Owner-Review offen) · **Verantwortlicher:** der Betreiber der App (Privatperson; Familienbetrieb)

> Diese Fassung ist von der Entwicklungsseite geschrieben und nennt ausdrücklich, was **belegt**
> ist (Code, Test, Messung) und was **noch offen** ist. Was hier als offen steht, ist nicht
> geprüft — nicht "wahrscheinlich in Ordnung".

---

## 1. Systembeschreibung

**Zweck.** Organisieren, Vorbereiten und Erinnern abnehmen, damit die lernende Person lernen kann:
Termine für Arbeiten führen, fotografierte Arbeitsblätter in Übungen verwandeln, Antworten
beurteilen, im Chat erklären, zu vereinbarten Zeiten erinnern.

**Betroffene Personen.** Eine lernende Person je Konto (in der Regel ein Kind ab ca. 10 Jahren) und
die erwachsene Person, die das Konto hält (bei Minderjährigen).

**Kategorien der Daten** (vollständig in `docs/privacy.md` §What is stored):
Name oder Spitzname, Geburtsdatum, Schulstufe · Chat-Nachrichten · Fotos von Arbeitsblättern und
der daraus gelesene Text · erzeugte Fragen und ihre Antworten · Lernstand je Thema · Notizen, die
Buddy sich merkt (nur aus ihren eigenen Worten, mit Zitat) · Einstellungen (Kontaktzeiten, Stimme)
· Betriebsdaten (Modellaufrufe ohne Inhalt, Hintergrundjobs).

**Besondere Kategorien (Art. 9).** Nicht vorgesehen und nicht gewollt. Der Prompt verbietet
ausdrücklich, Gesundheit, Familienprobleme, Gewalt oder Selbstverletzung als Wissen zu speichern;
in einem Notfall antwortet die App mit einem festen Text und **merkt sich nichts**
(`docs/architecture.md` §Safeguarding, live geprüft in `evals/buddy` in fünf Sprachen).

**Datenflüsse.**

| Schritt               | Was fließt wohin                                                                                                          |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Chat                  | Nachricht → eigene API (Vercel, EU-Funktion) → Google Vertex AI (`eu`) → Antwort                                          |
| Foto eines Blattes    | Foto → Supabase Storage (EU) → Vertex AI liest es → Fragen in der Datenbank; das Foto wird 7 Tage nach dem Lesen gelöscht |
| Sprechen              | Erkennung **auf dem Gerät**, wo sie die Sprache kann; sonst Aufnahme → eigene API → Vertex AI (EU)                        |
| Vorlesen              | ein Satz → Google Cloud TTS (`eu`), Audio 24 h zwischengespeichert                                                        |
| Erinnerung aufs Handy | nur wenn Kontakt außerhalb der App eingeschaltet ist; Titel/Text ohne Noten und ohne persönliche Details                  |

**Auftragsverarbeiter** (Details und offene Punkte: `docs/privacy.md` §Processors): Supabase
(Datenbank, Auth, Storage; EU-Region) · Google Vertex AI (Modell; EU-Endpunkt erzwungen, andere
Regionen werden beim Start abgelehnt) · Google Cloud TTS (nur wenn eingeschaltet, EU-Endpunkt) ·
Apple/Google Spracherkennung **auf dem Gerät** · Expo Push (optional, aus; fügt einen
US-Unterauftragsverarbeiter hinzu).

---

## 2. Rechtsgrundlagen

- **Einwilligung (Art. 6 Abs. 1 lit. a, Art. 8).** Unter 16 gibt die erwachsene Person die
  Einwilligung beim Anlegen des Profils; sie ist mit Textfassung und Zeitpunkt gespeichert
  (`minor_consent_version`, `minor_consent_at`). **Ab dem 16. Geburtstag fragt die App die
  lernende Person selbst** (EDPB §147–149) und speichert ihre eigene Einwilligung
  (`self_consent_version`, `self_consent_at`); die Aufzeichnung der Eltern bleibt unverändert
  stehen — sie sagt, was bis dahin getragen hat.
- **Vertrag (lit. b)** trägt den Betrieb des Kontos selbst.
- **Kein berechtigtes Interesse** als Grundlage für Inhalte des Kindes; kein Werbe- oder
  Analysezweck; **kein Training** durch uns auf ihren Daten (die Bestätigung der
  Verarbeiterbedingungen für Vertex und TTS steht in §6 als offener Punkt).

---

## 3. Notwendigkeit und Verhältnismäßigkeit

- **Datenminimierung im Code, nicht im Versprechen.** Der Modellaufruf trägt Vorname und Alter in
  Jahren (nie das Geburtsdatum), ihre Nachrichten, ihre Notizen und den Blatt-Text, den die Antwort
  braucht — sonst nichts (`modules/buddy/context.ts`).
- **Notizen nur aus ihren Worten.** Eine Notiz braucht ein wörtliches Zitat aus ihrer Nachricht;
  die API weist Notizen ohne Beleg zurück (`requireQuote`, `requireSupported`). Damit kann das
  Modell keine Eigenschaften über sie erfinden.
- **Fotos leben kurz.** Nach dem Lesen 7 Tage, dann weg; beim Löschen sofort
  (`purgePhotos`, `sweepForgottenPhotos`).
- **Modell-Entscheidungen verlieren ihren Inhalt nach 90 Tagen**, die reine Buchhaltung der
  Aufrufe nach 180 (`purgeDecisionContent`) — die Form der Entscheidung bleibt für die
  Nachvollziehbarkeit.
- **Kein Zählen von Versäumtem.** Die App zeigt Lernenden nie, wie viele Tage sie ausgelassen hat
  oder wie viel „offen" ist — eine bewusste Entscheidung gegen Druck (CLAUDE.md Regel 6).

---

## 4. Risiken für die Rechte und Freiheiten

| #   | Risiko                                                                                         | Wer trägt es | Schwere  | Eintritt     |
| --- | ---------------------------------------------------------------------------------------------- | ------------ | -------- | ------------ |
| R1  | Das Modell **behauptet etwas Falsches** über ihren Lernstand oder erfindet eine Notiz über sie | Kind         | mittel   | mittel       |
| R2  | Das Modell antwortet **unangemessen** auf eine Notlage (Mobbing, Selbstverletzung)             | Kind         | **hoch** | gering       |
| R3  | **Fremdzugriff** auf Chats, Fotos, Lernstand                                                   | Kind         | hoch     | gering       |
| R4  | Ein **Auftragsverarbeiter** nutzt Inhalte weiter (Training, Missbrauchs-Logging)               | Kind         | hoch     | offen (§6)   |
| R5  | **Text ins Ausland** über die Vorlesestimme oder die Spracherkennung des Telefons              | Kind         | mittel   | gering–offen |
| R6  | **Druck und Dauerkontakt** („du hast 5 Tage nicht geübt")                                      | Kind         | mittel   | gering       |
| R7  | **Eltern lesen mit**, ohne dass das Kind es weiß                                               | Kind         | mittel   | gering       |
| R8  | **Falsches Alter** angegeben: ein zu junges Kind nutzt die App ohne Einwilligung               | Kind         | mittel   | mittel       |
| R9  | **Daten bleiben** nach dem Löschwunsch                                                         | Kind         | hoch     | gering       |
| R10 | **Injection**: Text auf einem fotografierten Blatt steuert Buddy                               | Kind         | mittel   | gering       |

---

## 5. Maßnahmen — und was sie belegt

| Risiko | Maßnahme                                                                                                                                                                                          | Beleg                                                                                        |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| R1     | Notizen brauchen ein Zitat; Entscheidungen laufen atomar hinter dem Kontext-Zaun; Status wird als _geplant / vorbereitet / erledigt / bestätigt_ getrennt, nie geraten                            | `tools.ts`, `apply.ts`; Integrationstests inkl. veralteter Kontext; CLAUDE.md Regeln 1, 4, 5 |
| R1     | **Inhalts-Eval**: erzeugte Fragen werden gegen das Blatt und die Klasse geprüft                                                                                                                   | `evals/content` (30/30), `evals/explain` (5/5)                                               |
| R2     | Not-Erkennung im Prompt; die App antwortet mit einem **festen** Text samt Hilfenummer des Landes; die Modellantwort wird nicht gezeigt; **nichts wird gemerkt**                                   | `evals/buddy` (de/en/fr/es/it), `safeguarding.int.test.ts`                                   |
| R3     | Row-Level-Security auf **allen** Tabellen ohne Policy (nur der Service-Key der API kommt durch); Mandantentrennung zusätzlich im Code; mit dem öffentlichen Schlüssel geprüft: keine Zeile lesbar | Supabase-Advisor + Prüfung 29.09. (#72)                                                      |
| R3     | Elternbereich hinter PIN; Minderjährigen-Profil kann Kontakt nur **reduzieren**, nie lockern                                                                                                      | ADR 0006, `policy.ts`                                                                        |
| R4     | EU-Endpunkte erzwungen, Start bricht sonst ab; kein Training durch uns                                                                                                                            | `config.ts`; **offen:** Bestätigung der Verarbeiterbedingungen (§6)                          |
| R5     | Spracherkennung nur **auf dem Gerät**, sonst eigener EU-Weg; TTS nur über den EU-Endpunkt, abschaltbar                                                                                            | `lib/speech/engine.ts`, `config.ts`; **offen:** iPhone-Prüfung                               |
| R6     | Kontakt ist Opt-in; Buddy kann ihn nur reduzieren; keine Zahlen über Versäumtes; Ruhezeiten                                                                                                       | CLAUDE.md Regel 6, `policy.ts`                                                               |
| R7     | Der Elternbereich zeigt Einstellungen und Einwilligung — **nicht** den Chat                                                                                                                       | `app/settings.tsx`, `docs/privacy.md` §Access control                                        |
| R8     | Selbstauskunft plus erzwungene E-Mail-Bestätigung des Kontos; Abwägung in §6                                                                                                                      | EDPB Statement 1/2025 §13                                                                    |
| R9     | Export (Art. 15/20) und Löschung (Art. 17) als Jobs mit Nachweis; Storage-Schulden werden nachverfolgt, `/health` meldet Überfälliges                                                             | `erasure.int.test.ts`, `privacy.ts`                                                          |
| R10    | Blatt-Text und Nachschlage-Ergebnisse sind im Prompt ausdrücklich **Daten, keine Anweisungen**                                                                                                    | buddy.23+, `de_sheet_instruction_is_not_an_order` in `evals/buddy`                           |

**Organisatorisch.** Ein Wechsel des Modells oder einer Region ist Code und läuft durch die
Evals; jede Prompt-Version wird einmal vollständig gegen das echte Modell geprüft; der
Browser-Durchlauf prüft jede Änderung an der Oberfläche auf beiden Handygrößen samt
Barrierefreiheit.

---

## 6. Abwägung der Alterssicherung (EDPB Statement 1/2025 §13)

**Gewählt:** Selbstauskunft des Geburtsdatums beim Anlegen des Profils **plus** die ohnehin
erzwungene Bestätigung der E-Mail-Adresse des Kontos (Supabase Auth) **plus** die PIN der
erwachsenen Person für alles, was Kontakt lockert oder Daten ausleitet.

**Verworfen, mit Grund:**

- _Ausweis- oder Gesichtsprüfung:_ eine biometrische oder amtliche Prüfung für eine
  Familien-Lern-App verarbeitet deutlich mehr Daten über dasselbe Kind, als sie schützt —
  unverhältnismäßig (EDPB: Eingriffstiefe muss zum Risiko passen).
- _Bezahlkarten-Prüfung des Elternteils:_ schließt Familien ohne Karte aus und verrät
  Zahlungsdaten an einen weiteren Verarbeiter, ohne das Alter des **Kindes** zu belegen.
- _Drittanbieter-Alterssignal:_ fügt einen Verarbeiter hinzu, der ein Profil über dasselbe Kind
  aufbaut.

**Restrisiko (R8):** Ein Kind kann ein falsches Geburtsdatum angeben. Getragen wird das durch die
Maßnahmen, die **unabhängig vom Alter** gelten: kein Werbezweck, keine Profilbildung, kurze
Aufbewahrung, Notfalltext statt Modellantwort, kein Zählen von Versäumtem, Kontakt nur mit
Opt-in. Das Restrisiko wird als **vertretbar** eingestuft.

---

## 7. Offene Punkte (vor einem Start über den Familienkreis hinaus)

1. **Verarbeiterbedingungen bestätigen** für Vertex AI und Cloud TTS: kein Training auf
   Kundendaten, Missbrauchs-Logging aus, EU-Verarbeitung — schriftlich, projektbezogen.
2. **Auftragsverarbeitungsverträge** (Art. 28) mit Supabase, Google Cloud, Vercel ablegen.
3. **Verzeichnis von Verarbeitungstätigkeiten** (Art. 30) schreiben — diese Folgenabschätzung
   liefert den Inhalt.
4. **iPhone-Prüfung** der Auf-dem-Gerät-Erkennung (`docs/privacy.md` nennt sie als unbewiesen).
5. **Leaked-Password-Schutz** in der Supabase-Konsole einschalten (#72).
6. **Owner-Review** dieser Fassung; danach Datum und Fassung erhöhen.
7. **Überprüfung** bei jeder Änderung an Zweck, Modell, Region oder Aufbewahrung, sonst jährlich.

---

## 8. Ergebnis

Die Verarbeitung ist mit den Maßnahmen aus §5 **zulässig durchführbar**; die verbleibenden Risiken
sind gering bis mittel und werden getragen. **Nicht erledigt** ist §7 — insbesondere die
schriftliche Bestätigung der Verarbeiterbedingungen (R4). Solange die App im Familienkreis läuft
und die dort betroffene Person die Tochter des Verantwortlichen ist, ist das vertretbar; **vor
jeder Nutzung durch Dritte** müssen die Punkte aus §7 abgearbeitet sein.
