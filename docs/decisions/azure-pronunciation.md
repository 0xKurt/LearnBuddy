# Entscheidungsvorlage: Azure Pronunciation Assessment

**Für den Owner. Die Entscheidung liegt bei ihm — dieses Dokument entscheidet nichts.**
Anlass: Issue #27 ([P3][ENTSCHEID], Quelle: Aussprache-Research 28.09.2026). Stand: 29.09.2026.
Es ist **nichts angebunden**; es wurde kein Azure-Konto angelegt und kein Ton zu Microsoft
geschickt.

Alle Zahlen zum Ist-Zustand sind aus dem Repo übernommen, nicht neu behauptet; jede Quelle steht
dabei. Alles zu Azure stammt aus der Microsoft-Dokumentation mit Abrufdatum 29.09.2026 — gelesen,
nicht gemessen.

---

## 1. Ist-Zustand: was die Aussprache-Prüfung heute tut

Das Modell hört die Aufnahme selbst. Es schreibt erst die erwartete Aussprache und die tatsächlich
produzierten Laute (IPA) auf und urteilt dann Wort für Wort — `apps/api/src/modules/practice/speak.ts`,
`purpose: 'pronounce'` auf `eu/gemini-3.1-flash-lite` (`llm/vertex.ts` `DEFAULT_ROUTES`), ohne
Nachdenk-Budget (`thinkingBudget: 0`). Ergebnis ist `PronunciationFeedback`
(`packages/shared-types/src/contracts/learning.ts`): `heard`, `overall` (`good | almost | retry`)
und je Wort `ok` plus `tip` — der Tipp in **ihrer** Sprache. Dazu eine gesprochene Rückmeldung
(`reply`). Die Aufnahme wird nie gespeichert (`docs/privacy.md`, Tabelle „Voice recordings").

### Geschwindigkeit (gemessen)

| Was                                     | Zahl                                        | Quelle                                                      |
| --------------------------------------- | ------------------------------------------- | ----------------------------------------------------------- |
| Endpunkt-Wall-Clock, 5-s-Clip (2 Läufe) | min 2,27 s · **median 3,57 s** · max 3,57 s | `docs/speed-audit.md` §Endpoint wall-clock (28.09.2026)     |
| Modellseite `pronounce` (2 Calls)       | Latenz median **2,88 s**, max 3,53 s        | `docs/speed-audit.md` §Modellseite                          |
| Tokens `pronounce` (Median)             | 1 005 in · 618 out                          | `docs/speed-audit.md` §Modellseite                          |
| Baseline-Notiz                          | „pronunciation 6 s (…), **3–4 s after**"    | `docs/architecture.md` §Speed (Median aus 3 Runden, 26.09.) |

Dazu das Verdict-Streaming (Issue #8): `heard` wird vor der Wortliste geschrieben, die Wörter
färben sich also einzeln, statt dass die Karte sekundenlang stillsteht (`docs/architecture.md`
§Speed). Gefühlt sind das nicht 3,5 s Stillstand, sondern deutlich weniger.

Die ~10 s, die sich am Handy angefühlt haben, sind laut `docs/speed-audit.md` §Lesart **nicht das
Modell**, sondern Upload, Vercel-Weg und App-Orchestrierung. Das bleibt so, egal wer das Urteil
spricht.

### Qualität (gemessen — und was die Messung nicht hergibt)

`apps/api/evals/speak/run.ts`, Aufnahmen mit espeak-ng, je 3 Läufe, ohne Nachdenk-Budget
(`pronounce.v2.1`) — `docs/buddy/02-verifikation.md`:

- falsches Wort **3/3** erkannt (mit Nachdenken nur 2/3),
- korrekte Computerstimme **2/3** als „gut" (mit Nachdenken 1/3),
- **deutsche Aussprache in beiden Varianten nur als „fast"**,
- halb so lange: ≈ 3,8 s statt ≈ 8 s pro Satz.

Dieselbe Quelle sagt wörtlich: **„Aussprache-Bewertung ist eine KI-Einschätzung, keine Messung.
Das ist kein statistischer Beleg."** Und `docs/buddy/04-abgleich.md` Nr. 31: **„Strenge nur mit
Computerstimmen gemessen (`evals/speak`), nicht mit Kinderstimmen."**

Das ist die eigentliche Lücke: Die Aussprache-Prüfung ist nie mit der Stimme getestet worden, für
die sie gebaut wurde.

### Kosten (abgeleitet, nicht gemessen)

1 005 in + 618 out Tokens × `gemini-3.1-flash-lite` (0,275 $ / 1,65 $ je 1 M, `apps/api/src/llm/pricing.ts`,
Preise gelesen 25.09.2026) ≈ **0,0013 $ ≈ 0,13 ct je Versuch**. Abgeleitet aus zwei Repo-Zahlen —
die Audit-Tabelle nennt das Modell nicht ausdrücklich; auf `gemini-3.6-flash` wären es ≈ 0,34 ct.

### Datenschutz heute

Ein bereits beschriebener Verarbeiter (Vertex AI, EU), Aufnahme geht einmal hin und wird verworfen,
nichts gespeichert (`docs/privacy.md`). Kein neuer Vertrag, keine neue Elterninformation.

---

## 2. Was Azure Pronunciation Assessment bietet

Quelle: Microsoft Learn, abgerufen 29.09.2026. Seitenstände in Klammern.

**Was zurückkommt** (REST-API für kurzes Audio, Seitenstand `ms.date` 21.11.2025 / aktualisiert
05.06.2026): `AccuracyScore`, `FluencyScore`, `ProsodyScore`, `CompletenessScore`, `PronScore`,
dazu **je Wort** ein `AccuracyScore` und ein `ErrorType` aus `None | Omission | Insertion |
Mispronunciation`. Granularität wahlweise `FullText | Word | Phoneme` — auf Phonem-Ebene gibt es
Scores je Laut; das Lautalphabet kann auf **IPA** gestellt werden, sonst SAPI. Der Referenztext
(„was sie sagen sollte") geht als Base64-JSON im Header `Pronunciation-Assessment` mit — den haben
wir, es ist `item.prompt`.

**Sprachen**: 34 Locales, darunter `de-DE`, `en-US`, `en-GB`, `fr-FR`, `es-ES`, `it-IT`
(Language-Support-Seite, Stand 10.09.2026) — also alle fünf Schulsprachen.

**Region**: `germanywestcentral` ist als Speech-Region mit Echtzeit-Transkription gelistet
(Regions-Seite, Stand 29.09.2026). Dieselbe Seite: _„Azure Speech doesn't store or process your
data outside the region of your Azure Speech resource."_

**Grenzen, die in der Doku stehen** (Responsible-AI-Seite „Characteristics and limitations",
`ms.date` 31.03.2026 / aktualisiert 20.06.2026):

- ≥ 16 kHz Audio empfohlen, Sprecher nah am Mikrofon, wenig Störgeräusch;
- nur **ein** Sprecher, **kein** gemischtsprachiges Szenario;
- _„Pronunciation Assessment compares the submitted audio to native speakers in general conditions."_
- Microsofts eigene Auswertung: **> 0,5 Pearson-Korrelation** mit menschlichen Bewertern — ohne
  Aufschlüsselung nach Alter.

### Die Kinderstimmen-Frage aus dem Issue

Die Microsoft-Doku erwähnt Kinder **genau einmal**, und zwar als Schwellenwert-Hinweis, nicht als
Qualitätsaussage (gleiche Seite, 20.06.2026):

> „For example, the grading method for children's learning might not be as strict as that for adult
> learning. Consider setting a higher mispronunciation detection threshold for adult learning."

Mehr steht dort nicht. **Es gibt keine veröffentlichte Genauigkeitszahl für Kinderstimmen.**
Microsoft sagt an derselben Stelle ausdrücklich, dass Kunden vor dem Einsatz mit echten Daten aus
dem eigenen Szenario selbst testen sollen. Die Frage aus Issue #27 ist damit **unbeantwortet und
nur durch einen eigenen Testlauf beantwortbar** — bei Azure genauso wie heute bei Gemini.

---

## 3. Die vier Achsen: Azure gegen heute

### Speed

|                | heute                                                          | Azure                                                                                                                       |
| -------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Urteil da nach | Endpunkt-Median **3,57 s**, Modell 2,88 s (speed-audit 28.09.) | **unbekannt** — erst im Testlauf messbar                                                                                    |
| Zwischenstand  | ja: Wörter färben sich einzeln, `heard` kommt zuerst (#8)      | **nein** auf dem REST-Weg: _„The REST API for short audio returns only final results. It doesn't provide partial results."_ |
| Netzweg        | Vercel → Vertex EU                                             | zusätzlicher Hop Vercel → `germanywestcentral`                                                                              |

Ehrlich: Die im Issue genannte „< 1 s" ist eine Research-Notiz, keine eigene Messung — sie steht
weder hier noch sonst im Repo belegt. Plausibel ist sie (eine Phonem-Engine denkt nicht nach),
aber Microsoft empfiehlt ausdrücklich Chunked-Upload, „which can significantly reduce the latency" —
also ist die Latenz auch dort nicht vernachlässigbar. **Und selbst ein schnelleres Urteil kommt
auf dem REST-Weg als Block**, während heute schon nach Bruchteilen der Zeit das erste Wort grün
wird. Ob sich das schneller _anfühlt_, ist offen.

### Qualität

|                             | heute                                                            | Azure                                                               |
| --------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------- |
| Art des Urteils             | KI-Einschätzung über IPA, **keine Messung** (02-verifikation.md) | phonetische Messung, Score je Laut/Silbe/Wort                       |
| falsches Wort               | 3/3 erkannt (espeak, 3 Läufe)                                    | `ErrorType: Mispronunciation/Omission/Insertion` je Wort            |
| starker deutscher Akzent    | **nur „fast"** — genau der Fall, den die Schule abwertet         | offen; eine Zahl je Laut gibt es, wie streng sie bei ihr ist, nicht |
| Kinderstimmen               | **nie getestet** (04-abgleich.md Nr. 31)                         | **keine veröffentlichte Zahl**, nur ein Schwellenwert-Hinweis       |
| menschliche Übereinstimmung | nicht gemessen                                                   | > 0,5 Pearson (Microsofts eigene Auswertung, ohne Altersangabe)     |

Was Azure **nicht** liefert und was deshalb bleibt: `tip` je Wort in ihrer Sprache und die
gesprochene Rückmeldung `reply`. Azure gibt Zahlen und Fehlertypen; „Fast richtig — das _r_ am
Ende kannst du weicher sprechen" entsteht daraus nicht von selbst. Entweder Textbausteine je
`ErrorType` (billig, klingt schnell wie ein Automat) oder weiterhin ein — dann reiner Text —
Modellaufruf. **Azure ist kein Drop-in hinter `PronunciationFeedback`**, auch wenn
`docs/architecture.md` §Practice das bisher so knapp formuliert.

### Kosten

|            | heute                                       | Azure                                                                                                                        |
| ---------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| je Versuch | ≈ **0,13 ct** (abgeleitet, s. o.)           | ≈ **0,4–0,7 ct** bei ~1,0–1,7 $ je Audiostunde für einen 15-s-Clip                                                           |
| Preisbeleg | `llm/pricing.ts` (Listenpreise, 25.09.2026) | **unsicher**: die Azure-Preisseite lädt die Zahlen per JavaScript nach und lieferte beim Abruf am 29.09.2026 nur Platzhalter |
| Gratis     | —                                           | F0: **5 Audiostunden/Monat frei** (Preisseite)                                                                               |

Zur Unsicherheit, weil sie für die Entscheidung zählt: Die Preisseite listet Pronunciation
Assessment unter „enhanced add-on features" mit **eigenem** Stundenpreis, eine Microsoft-Q&A-Antwort
(learn.microsoft.com/answers, Frage 5608069) sagt dagegen, es werde schlicht als Speech-to-Text
Standard zu **1,32 $/Audiostunde** abgerechnet. Beides kann ich nicht auflösen; die
Größenordnung (0,4–0,7 ct je Versuch) stimmt mit der Research-Notiz „~0,5 ct/Versuch" aus dem
Issue überein. **Vor einer Produktivschaltung gehört der echte Preis für `germanywestcentral` aus
dem Azure-Preisrechner in dieses Dokument.**

Praktisch: bei 20 Versuchen am Tag sind das ≈ 2,6 ct heute gegen ≈ 8–14 ct. Der Preisunterschied
ist real (Faktor 3–5), in absoluten Zahlen aber nicht die Entscheidung. Die Entscheidung kostet
Arbeit und Papier, nicht Geld.

### Konkreter Anwendungsfall

Sie sagt einen französischen oder englischen Satz auf, damit sie in der Schule nicht wegen der
Aussprache Punkte verliert.

**Dafür:** Genau der Fall, der heute durchrutscht, ist der belegte Schwachpunkt — starker deutscher
Akzent wird als „fast" bewertet, nicht als „nochmal". Eine Phonem-Messung ist strukturell das
richtige Werkzeug dafür, und sie kann in allen fünf Schulsprachen.

**Dagegen / Aufwand, der konkret anfällt:**

- **Audioformat.** Die App nimmt nativ `.m4a` (AAC) mit 22 050 Hz auf (`apps/mobile/lib/speech/record.ts`),
  im Browser `audio/webm` (Opus). Die REST-API für kurzes Audio akzeptiert **nur** WAV/PCM 16 kHz
  mono oder OGG/Opus 16 kHz mono. Also entweder serverseitig umkodieren oder das Speech-SDK
  nehmen (das mehr Formate kann, aber eine weitere Abhängigkeit im API-Prozess ist).
- **Längengrenze** 30 s für Pronunciation Assessment — unsere Clips sind ≤ 15 s, passt.
- **Ein Sprecher, wenig Störgeräusch, nah am Mikro** — am Küchentisch mit Geschwistern im
  Hintergrund keine Selbstverständlichkeit; Microsoft nennt das als Qualitätsgrenze.
- **Kein Zwischenstand** (s. o.), also müsste #8 anders bedient werden.
- **Die Tipps und die gesprochene Rückmeldung** kommen weiterhin nicht aus Azure.

---

## 4. DSGVO-Blick

**Neuer Auftragsverarbeiter.** Microsoft ist ein US-Konzern; die Ressource lässt sich aber auf
`germanywestcentral` festlegen, und die Regions-Seite (29.09.2026) sagt zu, außerhalb der
Ressourcen-Region weder zu speichern noch zu verarbeiten. Das ist eine Doku-Zusage, **kein von uns
geprüfter Nachweis** — dieselbe Vorsicht wie bei Google Cloud TTS in `docs/privacy.md` („Legal
review", noch nicht live verifiziert).

**Aufbewahrung.** Data-privacy-Seite zu Speech to text (`ms.date` 31.03.2026 / aktualisiert
26.08.2026), Abschnitt „No data trace":

> „When doing real-time speech to text, fast transcription, **pronunciation assessment**, and speech
> translation, Microsoft does not retain or store the data provided by customers."

und:

> „For real-time speech to text, audio input is processed only on the Azure's server memory, and no
> data is stored at rest."

Das passt zu unserer Zusage „Aufnahme wird nicht gespeichert" — vorausgesetzt, es bleibt beim
Echtzeit-/Kurzaudio-Weg und **nicht** Batch-Transkription (dort speichert der Kunde selbst).

**Kinderstimmen.** Dieselbe Microsoft-Seite schiebt die Verantwortung ausdrücklich zu uns:

> „If you are using Microsoft products or services to process Biometric Data, you are responsible
> for: (i) providing notice to data subjects …; (ii) obtaining consent …; and (iii) deleting the
> Biometric Data …"

Aussprache-Bewertung ist **keine** Sprecheridentifikation, „biometrische Daten" im Sinne von Art. 9
DSGVO setzt die eindeutige Identifizierung voraus — nach Aktenlage greift Art. 9 also nicht. Das ist
eine Einschätzung, keine Rechtsauskunft; der Satz steht in Microsofts eigener Doku und gehört
deshalb einem Juristen vorgelegt, bevor die Stimme eines Kindes dorthin geht.

**Was vor einer Produktivschaltung fällig wäre:** DPA (Microsoft Products and Services Data
Protection Addendum) unterschrieben · Eintrag in `docs/privacy.md` §Processors nach dem Muster der
anderen Verarbeiter · `docs/dpia.md` ergänzt · Elterninformation angepasst · für Minderjährige der
bestehende Einwilligungsweg (Erwachsenen-PIN) berührt.

**Der unangenehme Punkt.** Die einzige Aufnahme, die die offene Frage beantwortet, ist die Stimme
eines Kindes. Ein Validierungslauf mit espeak-Clips und Erwachsenenstimmen misst genau das nicht,
worum es geht — und ein Validierungslauf mit ihrer Stimme ist bereits eine Verarbeitung durch einen
neuen Verarbeiter. **Die Papierarbeit kommt also vor dem interessanten Teil des Tests, nicht danach.**

---

## 5. Empfehlung (ein Satz) und was ein Validierungslauf kostet

> **Nicht anbinden, sondern erst messen — aber die Reihenfolge umdrehen: erst DPA und die drei
> Doku-Einträge, dann ein befristeter Validierungslauf in `germanywestcentral`, weil die einzige
> Aufnahme, die die Kinderstimmen-Frage beantwortet, schon selbst eine Verarbeitung ist.**

Begründung in einem Satz dahinter: Der belegte Schwachpunkt von heute (starker Akzent nur „fast",
nie mit Kinderstimmen getestet) ist echt und genau Azures Stärke — aber Azure liefert weder die
Tipps noch den Zwischenstand, und ob es bei _ihrer_ Stimme besser ist, steht nirgends geschrieben.

### Kosten eines Validierungslaufs

| Posten                                                                                                                       | Schätzung                                                               |
| ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Azure-Verbrauch: ~60 Clips × 15 s = 15 Minuten Audio                                                                         | **0 €** — passt in F0 (5 Audiostunden/Monat frei); auf S0 ≈ 0,25–0,42 $ |
| Azure-Ressource anlegen, EU-Region, Logging aus                                                                              | Owner, Portal (kein CLI), ~15 min                                       |
| Wegwerf-Skript: vorhandene espeak-Fixtures + neue Aufnahmen gegen Azure, Vergleichstabelle gegen die heutigen Gemini-Urteile | **S**, ein halber Tag                                                   |
| Latenz ehrlich messen (von Vercel aus, nicht vom Laptop)                                                                     | im Skript enthalten                                                     |
| DPA + `privacy.md` + `dpia.md` + Elterninfo **vor** Aufnahmen der Tochter                                                    | Owner/Recht — **der eigentliche Aufwand**, nicht bezifferbar von hier   |

Das Geld ist also nicht das Thema; der halbe Tag Arbeit auch nicht. Die Entscheidung ist, ob ein
weiterer Verarbeiter die Stimme eines Kindes hören darf, damit ein Akzent strenger bewertet wird.

### Was gegen die Abnahmekriterien aus Issue #27 noch fehlt

- [ ] Vergleichstabelle Gemini vs. Azure auf identischen Clips — **offen**, braucht den Testlauf.
- [x] Keine Produktivnutzung ohne explizites Owner-Go — eingehalten: hier ist kein Code entstanden.

---

## Quellen

Repo (Stand 29.09.2026): `docs/speed-audit.md` (Baseline 28.09.2026) · `docs/architecture.md`
§Speed, §Practice · `docs/buddy/02-verifikation.md` · `docs/buddy/04-abgleich.md` Nr. 31 ·
`docs/privacy.md` · `apps/api/src/modules/practice/speak.ts` · `apps/api/src/llm/vertex.ts` ·
`apps/api/src/llm/pricing.ts` · `apps/mobile/lib/speech/record.ts` ·
`packages/shared-types/src/contracts/learning.ts`.

Microsoft Learn, alle abgerufen 29.09.2026:

- [Characteristics and limitations of Pronunciation Assessment](https://learn.microsoft.com/en-us/azure/foundry/responsible-ai/speech-service/pronunciation-assessment/characteristics-and-limitations-pronunciation-assessment) — Seitenstand 31.03.2026, aktualisiert 20.06.2026 (Kinder-Zitat, Pearson, Grenzen)
- [Data, privacy, and security for Speech to text](https://learn.microsoft.com/en-us/azure/foundry/responsible-ai/speech-service/speech-to-text/data-privacy-security) — Seitenstand 31.03.2026, aktualisiert 26.08.2026 („No data trace", Biometric-Data-Hinweis)
- [Speech to text REST API for short audio](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/rest-speech-to-text-short) — Seitenstand 21.11.2025, aktualisiert 05.06.2026 (Formate, 30-s-Grenze, Header, Antwortfelder, „only final results")
- [Supported regions for Azure Speech](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/regions) — Seitenstand 29.09.2026 (`germanywestcentral`, Regions-Zusage)
- [Language and voice support for Azure Speech](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support?tabs=pronunciation-assessment) — Seitenstand 10.09.2026 (34 Locales)
- [Pricing — Azure Speech](https://azure.microsoft.com/en-us/pricing/details/speech/) — Preise werden per JavaScript nachgeladen, beim Abruf nur Platzhalter; F0-Kontingent lesbar
- [Microsoft Q&A 5608069: Pricing and usage of Pronunciation Assessment](https://learn.microsoft.com/en-us/answers/questions/5608069/pricing-and-usage-of-pronunciation-assessment-feat) — 1,32 $/Audiostunde, Community-/Support-Antwort, **kein** verbindlicher Preis
