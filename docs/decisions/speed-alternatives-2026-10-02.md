# Schneller bei gleicher Qualität: Alternativen und wo die Zeit liegt — 02.10.2026

Anlass: Issue #165 („My daughter always complains shit is too slow“, Owner 01.10.2026) mit den
zwei Nachträgen (Mini-Modell pro Schritt; kreative Modellwahl pro Schritt). Dieses Dokument
sammelt, **was heute belegt ist**, mit Quelle und Datum, trennt es von dem, was nicht geprüft
werden konnte, und sagt, was in dieser Runde gebaut wurde.

**Wie geprüft wurde.** Recherche am 02.10.2026 aus der Build-Umgebung. Viele Herstellerseiten
sind dort durch den Egress-Proxy gesperrt (u. a. docs.cloud.google.com, mistral.ai, groq.com,
cerebras.ai, artificialanalysis.ai, milliseconds.ai, developers.cloudflare.com,
learn.microsoft.com). Jede Angabe trägt deshalb eine Marke:

- **[gelesen]** — die Seite selbst wurde abgerufen und gelesen.
- **[Suchtreffer]** — nur aus der Zusammenfassung einer Websuche; Seite nicht geöffnet, Datum
  oft nicht sichtbar. **Nicht verifiziert.** Vor einer Entscheidung am Original prüfen.

Nichts hier ist an LearnBuddys eigenen Prompts gemessen, außer wo es ausdrücklich steht.

## Kurz

| Frage                                        | Antwort                                                                                                                                                                                                                                                  |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wo liegt die Zeit?                           | Fast ganz beim Modell (Messungen in #165, `docs/speed-audit.md`). Ab jetzt aus Produktionsdaten ablesbar: `evals/speed/where-time-goes.ts`.                                                                                                              |
| Macht ein Anbieterwechsel spürbar schneller? | **Nicht belegt.** Für Tempo sind Prompt-Länge, Streaming und Vorbereiten die Hebel; ein Wechsel ist ein Kosten-Hebel.                                                                                                                                    |
| Mistral als Standard-Tutor?                  | **Vorerst nein.** Neben den offenen Evals: die Nutzungsbedingungen verbieten laut Suchtreffer, personenbezogene Daten von Kindern unter dem digitalen Einwilligungsalter ohne Elterneinwilligung zu senden — muss juristisch am Original geprüft werden. |
| milliseconds.ai?                             | **Nein** (kein Tutor-Modell; Firmensitz/Datenregion nicht auffindbar).                                                                                                                                                                                   |
| Cloudflare Workers AI für Evals?             | **Nein** für echte Texte (keine dokumentierte EU-Bindung der Inferenz); allenfalls synthetische Testfälle.                                                                                                                                               |
| Was ist gebaut?                              | Messwerkzeug „wo die Zeit liegt“ (aus `llm_calls`), Gesamteindruck-Eval (#127) als Qualitätsschranke für jeden Tempo-Umbau, Eval-Trennung vom Live-Kontingent (#206).                                                                                    |

## 1. Wo die Zeit wirklich liegt

Gemessen (Issue #165, `docs/speed-audit.md`, Walkthrough und `evals/speed`; nicht am Handy):

| Moment                            | gemessen                               | davon Modell                 |
| --------------------------------- | -------------------------------------- | ---------------------------- |
| Blatt fotografiert → Übung bereit | 8–11 s                                 | fast alles                   |
| Übung vorbereiten                 | 2,5–7,3 s                              | Modell                       |
| Aussprache-Urteil                 | ~3,6 s                                 | 2,9 s                        |
| Chat-Antwort komplett             | 2,9–4,2 s; erste Wörter nach 1,1–1,4 s | Modell                       |
| Erster Ton nach Buddys Antwort    | ~2–3 s                                 | erster Satz + 0,85–1,8 s TTS |
| App selbst                        | 0–36 ms                                | –                            |

Was davon offen war: **Welcher Teil der Modellzeit hängt an der Prompt-Länge?** Ein
`buddy_turn` schickt ~15 000 Eingabe-Tokens, davon ~6 100 nur das Antwortschema. Ob dessen
Kürzung _schneller_ macht oder nur _billiger_, entscheidet sich daran, wie stark die Latenz mit
den Eingabe-Tokens wächst.

**Neu:** `apps/api/evals/speed/where-time-goes.ts <von> <bis>` liest `llm_calls` (nur
Aggregate, keine Texte) und gibt pro Zweck aus: Aufrufe, 429, Timeouts, p50/p90 der
Modell-Latenz, Anteil an der gesamten Wartezeit, Median-Tokens (ein/aus/Denken), Cache-Anteil —
und eine Regression `Latenz ≈ Basis + a·Eingabe + b·(Ausgabe + Denken)` mit R², ab 30 Aufrufen.
Damit wird „die 6 100 Schema-Tokens kosten N ms pro Zug“ eine Zahl aus der Produktion. Sie ist
eine **Korrelation**: längere Gespräche haben längere Prompts _und_ längere Antworten. Das
Experiment, das es entscheidet, bleibt der Vorher/Nachher-Lauf mit `evals/stream`.

**Noch nicht gelaufen**: Die Build-Umgebung hat keinen Zugang zur Produktionsdatenbank. Aufruf
für den Owner:

```bash
cd apps/api
DATABASE_URL=… DATABASE_CA_CERT="$(cat prod-ca.crt)" \
  npx tsx evals/speed/where-time-goes.ts 2026-09-25 2026-10-02
```

Am Handy gemessen ist weiterhin nichts (#37) — das bleibt die erste Abnahmebedingung von #165.

## 2. Gemini auf Vertex: Stellschrauben im selben Anbieter

**Preise und Stufen** [gelesen] Vertex-Preisseite (leitet inzwischen auf „Gemini Enterprise
Agent Platform“ um), https://cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing,
abgerufen 02.10.2026, ohne Seitendatum:

- Gemini 3.6/3.7/3.8 Flash: $0,75 ein / $3,75 aus pro 1 Mio. Tokens bis 31.12.2026 (Aktion),
  danach $1,50 / $7,50.
- **Regionale (Nicht-global-)Endpunkte kosten seit 01.07.2026 10 % mehr** — das betrifft
  LearnBuddy, das nur `eu`/`europe-*` verwenden darf.
- **Flex PayGo und Batch: −50 %**; Priority PayGo: 1,8× Standard.
- Context-Caching: zwischengespeicherte Eingabe kostet 10 % des Eingabepreises; Speicher für
  explizite Caches $1 pro 1 Mio. Tokens und Stunde (Flash-Modelle).
- Provisioned Throughput pro GSU (Nicht-global): 1 Woche $7,854 · 1 Monat $4,07 · 3 Monate
  $3,62 · 1 Jahr $3,01 (im Stundenblick der Seite; Mindestmenge 1 GSU).

**Drosselung** [gelesen] Google-Cloud-Blog „Reduce 429 errors on Vertex AI“, 12.03.2026,
https://cloud.google.com/blog/products/ai-machine-learning/reduce-429-errors-on-vertex-ai —
Ursachen: Lastspitzen, TPM-Grenze, Kapazität einer Region. Empfehlung: exponentielles Backoff
mit Jitter (so umgesetzt, `llm/retry.ts`, #206). Nur Provisioned Throughput ist vom geteilten
Pool isoliert. Die Dynamic-Shared-Quota-Seite selbst [Suchtreffer] nennt 2.5-Modelle und 3 Pro;
**ob 3.6 Flash darunter fällt, ist nicht bestätigt.**

**Labels** [Suchtreffer] Vertex-Doku „Add labels to API calls“: `labels` an generateContent
landen im Billing-Export. Umgesetzt (#206): `traffic` und `purpose` an jedem Aufruf.

**Was daraus für Tempo folgt:**

1. **Explizites Context-Caching für den stabilen Buddy-Präfix.** Live trägt der implizite Cache
   nur 9,2 % der Eingabe (`docs/decisions/prefix-cache-2026-10-01.md`). Mindestgröße 2 048 Tokens
   [Suchtreffer] — der Präfix (~12 000) liegt weit darüber. Speicherkosten bei einem Präfix:
   ~$0,012 pro Stunde. Wirkung auf die **Latenz** bis zum ersten Zeichen ist bei Google nicht
   beziffert; erst messen (`evals/stream` vorher/nachher). **Ob explizites Caching im
   `eu`-Multiregion-Endpunkt verfügbar ist, ist nicht bestätigt.**
2. **Flex/Batch für Hintergrundarbeit** (`consolidate`, `buddy_check`, Tipps vorbereiten): halber
   Preis, sie wartet nicht darauf. Reiner Kosten-Hebel. Retry-Leitlinie für Flex [Suchtreffer]:
   nicht aggressiv wiederholen, Timeout bis ~30 min — passt nicht in die heutigen Zeitbudgets,
   braucht eigenen Pfad.
3. **Flash-Lite für das Blatt-Lesen** bleibt ungetestet (#165 Nachtrag 1). Ein öffentlicher
   Vergleich [Suchtreffer, Artificial Analysis, Median der letzten 72 h zum Suchzeitpunkt,
   AI-Studio-Endpunkt, nicht Vertex]: 3.5 Flash-Lite ~490 Tokens/s, 3.5 Flash (minimal reasoning)
   ~162 Tokens/s, aber Zeit bis zum ersten Token Lite 6,1 s gegen Flash-minimal 0,87 s. Für den
   ausgabelastigen Blatt-Schritt kann Lite trotzdem gewinnen; für Chat nicht. **Nur `evals/content`
   mit Zeitmessung entscheidet.**
4. Der **globale Endpunkt**, den Google gegen 429 empfiehlt: keine Option (EU-Verarbeitung,
   `docs/privacy.md`).

## 3. Die Vorschläge des Owners

### milliseconds.ai — nein

[Suchtreffer] Product-Hunt-Eintrag um den 21./22.09.2026,
https://www.producthunt.com/posts/milliseconds-ai: kleine „Decision“-API (`decision-machine-1`)
für Ja/Nein, Klassifizieren, Extrahieren; $0,04 pro 1 Mio. Eingabe-Tokens, Ausgabe frei,
125 Mio. Tokens/Monat gratis mit Testschlüssel. **Firmensitz und Datenregion: nicht gefunden.**
LearnBuddy hat keine vorgeschaltete Klassifizierstufe, die man ersetzen könnte (ein
strukturierter Aufruf pro Zug, Regeln 3/4); eine zusätzliche Stufe wäre ein zusätzlicher Hop.
Ohne EU-Nachweis darf dort ohnehin kein Kindertext hin.

### Mistral als Standard-Tutor — vorerst nein

- Mistral Small 4, veröffentlicht 16.03.2026 [Suchtreffer] https://mistral.ai/news/mistral-small-4/
  (MoE, 119 Mrd. Parameter gesamt / 6 Mrd. aktiv, 256k Kontext, Apache 2.0).
- Preis $0,15 / $0,60 pro 1 Mio. [Suchtreffer, nur Drittseiten] — **nicht an mistral.ai/pricing
  geprüft.** Das wäre ~5× günstiger als 3.6 Flash nach der Aktion.
- Datenort: standardmäßig EU (Schweden), Endpunkt `api.eu.mistral.ai`; Kontrollebene und
  einzelne Unterauftragsverarbeiter evtl. außerhalb [Suchtreffer]
  https://help.mistral.ai/en/articles/156206-when-using-mistral-ai-s-api-where-is-my-data-stored
- **Kinder** [Suchtreffer, Zusammenfassung der Commercial Terms]: Kunden dürfen „keine
  personenbezogenen Daten von Kindern unter 13 bzw. unter dem jeweiligen digitalen
  Einwilligungsalter senden oder Minderjährige die Produkte ohne Zustimmung der Eltern nutzen
  lassen“. LearnBuddy hat für unter 16-Jährige eine Erwachsenen-Einwilligung — ob das die
  Klausel erfüllt, ist eine **juristische Frage am Originaltext** (https://mistral.ai/en/terms),
  nicht hier zu entscheiden.
- Tempo: Latenzzahlen für Small 4 nicht abrufbar. Kein Beleg, dass es schneller wäre.
- Voraussetzung bleibt: OpenAI-kompatibler Zweitanschluss im Gateway, und **dieselben Evals**
  (`tutor`, `buddy`, `concern`) **plus der Gesamteindruck-Vergleich** (#127, unten) — mit dem
  sich ein Modellwechsel jetzt genauso blind gegen den Ist-Zustand prüfen lässt wie eine
  Prompt-Version.
- Voxtral Transcribe 2 [Suchtreffer] the-decoder.com: $0,003/min (Batch), Realtime $0,006/min,
  Latenz einstellbar bis < 200 ms (bei 480 ms ~1–2 Punkte mehr Wortfehler). Mistral OCR 3
  [Suchtreffer] https://mistral.ai/news/mistral-ocr-3: $2 pro 1 000 Seiten (Batch $1), ca.
  12/2025. Beide fallen unter dieselbe Kinder-Klausel.

### Cloudflare Workers AI für Evals — nein für echte Daten

[Suchtreffer] https://developers.cloudflare.com/data-localization/compatibility: Workers AI ist
**nicht** mit Regional Services kompatibel, nur mit dem Customer Metadata Boundary (Logs,
Analytics) — keine dokumentierte EU-Bindung der Inferenz. Preis [Suchtreffer] $0,011 pro
1 000 Neurons, 10 000 Neurons/Tag frei. Evals sollen ohnehin das Produktivmodell messen;
sinnvoll höchstens als Generator synthetischer Testfälle. „Jev“ bleibt unklar.

## 4. Die kreativen Kandidaten aus Nachtrag 2

| Kandidat                                                 | Belegt                                                                                                                             | Quelle, Datum                                                                                                                                                                                     | Offen                                                                                                                                                                |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Groq** (schnelle Hardware)                             | RZ Helsinki mit Equinix, angekündigt 07.07.2025; gpt-oss-120b ~475 Tokens/s, gpt-oss-20b ~942 Tokens/s; AVV mit SCCs ab 15.10.2025 | [Suchtreffer] groq.com/news/groq-launches-european-data-center-footprint-in-helsinki-finland; artificialanalysis.ai/providers/groq; console.groq.com/docs/legal/customer-data-processing-addendum | **Festlegen auf EU nur im Enterprise-Tarif** (Forum-Aussage, [Suchtreffer]); Qualität offener Modelle an unseren Evals                                               |
| **Cerebras**                                             | EU-Kapazität „bis Ende 2026“, 200 MW bis Ende 2027 (Frankreich, Nordics), angekündigt 09.07.2026                                   | [Suchtreffer] cerebras.gcs-web.com Pressemitteilung                                                                                                                                               | Noch nicht verfügbar                                                                                                                                                 |
| **Chirp 3 HD Streaming** (erster Ton früher)             | `StreamingSynthesize` ist eine bidirektionale RPC der v1-API                                                                       | [gelesen] github.com/googleapis/googleapis …/texttospeech/v1/cloud_tts.proto (master, ohne Datum)                                                                                                 | Streaming-Formate laut Doku PCM/OGG_OPUS/MULAW/ALAW, **kein MP3** [Suchtreffer] — App-Player müsste PCM/Opus abspielen; **Streaming am EU-Endpunkt nicht bestätigt** |
| **Azure Pronunciation Assessment**                       | 33 Sprachen inkl. de-DE, en-US/GB, fr-FR, es-ES, it-IT; Streaming-Modus; Regionen westeurope, germanywestcentral, swedencentral    | [gelesen] MicrosoftDocs/azure-ai-docs: language-support.md (ms.date 09.09.2026), how-to-pronunciation-assessment.md (21.11.2025), regions.md (30.09.2026)                                         | Preis (+$0,30/h auf Echtzeit-STT) nur [Suchtreffer]; Kinderstimmen; neuer Auftragsverarbeiter. Vorarbeit: `docs/decisions/azure-pronunciation.md`                    |
| **Apple Foundation Models** (auf dem Gerät)              | ab iOS/iPadOS/macOS 26.0; 4 096 Tokens Kontext pro Sitzung                                                                         | [gelesen] developer.apple.com/documentation/foundationmodels; TN3193                                                                                                                              | nur Apple-Intelligence-Geräte (iPhone 15 Pro+) [Suchtreffer]; darf nie Aktionen auslösen (Regeln 1/4)                                                                |
| **Gemini Nano** (Android, AICore)                        | ML Kit GenAI: Prompt, Zusammenfassen, Umschreiben, Bildbeschreibung, Spracherkennung                                               | [gelesen] developer.android.com/ai/gemini-nano (zuletzt aktualisiert 08.09.2026)                                                                                                                  | Geräte: Pixel 9/10, Galaxy S25 u. a. [Suchtreffer] — für Kinderhandys selten                                                                                         |
| **ML Kit Text Recognition v2** (Blatt-OCR auf dem Handy) | lateinische Schrift „in Echtzeit auf den meisten Geräten“, ~38 MB pro Schrift                                                      | [Suchtreffer] developers.google.com/ml-kit/vision/text-recognition/v2                                                                                                                             | Handschrift, Formeln, Tabellen; Flash bleibt Rückfall                                                                                                                |

## 5. Was in dieser Runde gebaut wurde (ohne neue Konten)

1. **`evals/speed/where-time-goes.ts`** — siehe §1. Getestet auf echter Postgres mit
   synthetischen Zeilen (`evals/speed/__tests__/where-time-goes.int.test.ts`): Fenstergrenzen,
   Perzentile, 429/Timeout-Zählung, Cache-Anteil, Regression findet die eingebaute Steigung
   exakt wieder und verweigert eine Anpassung, die sie nicht trennen kann.
2. **Gesamteindruck-Vergleich** (#127) — `sh scripts/eval-impression.sh <A> [<B>]`. Jeder
   Tempo-Umbau (Schema-Diät, Caching, Lite fürs Blatt, ein anderer Anbieter) kann damit **blind
   und gepaart** gegen den Ist-Zustand geprüft werden, nicht nur Fall für Fall. Die Abnahme
   „kein Eval verschlechtert sich“ aus #165 bekommt damit eine Statistik
   (`docs/architecture.md` §Testing).
3. **Eval-Trennung vom Live-Kontingent** (#206) — Evals und Messläufe brechen ohne eigenes
   Projekt ab; jeder Aufruf trägt `traffic`/`purpose`-Labels für die Abrechnung.

Bewusst **nicht** gebaut: ein OpenAI-kompatibler Zweitanschluss (ohne Zugang nicht prüfbar, und
die Mistral-Kinderklausel ist ungeklärt); explizites Caching (EU-Verfügbarkeit offen, Wirkung
erst zu messen); Streaming-TTS (Format- und EU-Frage offen). Jeder davon wäre heute Code, der
nicht belegt laufen kann (Regel 12).

## 6. Empfohlene Reihenfolge

1. **Gerätemessung** mit dem Kind (#37) — ohne sie optimieren wir blind.
2. `where-time-goes.ts` über die letzte Woche laufen lassen → Zahl „ms pro 1 000 Eingabe-Tokens“
   für `buddy_turn`.
3. Ist sie nennenswert: **Schema-Diät** (#168) und **explizites Caching**, jeweils vorher/nachher
   mit `evals/stream` und `eval-impression.sh` (Qualität darf nicht sinken).
4. **Blatt lesen** mit Lite und weniger Thinking gegen `evals/content` mit Zeitmessung; Fragen vor
   dem Transkript streamen.
5. Kosten danach: Flex/Batch für Hintergrundarbeit; Mistral erst nach juristischer Klärung der
   Kinderklausel und bestandenen Evals.

## Nicht verifiziert

- DSQ-Modellliste für 3.x Flash; Provisioned Throughput in EU-Regionen; Context-Caching im
  `eu`-Multiregion-Endpunkt.
- Vertex-spezifische Latenzzahlen (die öffentlichen sind AI Studio).
- Mistral: Preis auf der Originalseite, AVV-Text, Wortlaut der Kinderklausel, Latenz.
- Groq: EU-Festlegung außer der Forum-Aussage.
- Chirp-3-HD-Streaming am EU-Endpunkt.
- Azure- und Cloudflare-Preise an den Originalseiten.
- milliseconds.ai: Sitz und Datenregion.
- Geräte-Listen für Apple Intelligence und Gemini Nano an den Originalseiten; ML-Kit-Latenz.
- Alles an LearnBuddys eigenen Prompts — außer den Messungen aus #165 selbst.
