# Preis- und Kostenvergleich Gemini ↔ OpenAI EU — 23.10.2026 (#893)

Owner, 23.10.2026: „Wir brauchen Preis- und Kostenmessungen, die das Ganze mit Gemini
vergleichen." Grundlage ist der Provider-Benchmark (`apps/api/scripts/bench-providers.ts`): echte
App-Anfragen (geseedeter Lernender, echte Prompts und Schemas) über die Produktionsadapter,
Kosten aus den Belegen jedes Calls. Neu ist die Kostenansicht (`apps/api/src/testing/bench/costs.ts`):
Tokens und Dollar je Zweck × Kandidat und eine Hochrechnung je Tag und Monat.

**Kurz:** Bei den gemessenen Kernzwecken ist `gpt-5.4-mini` (Produktionsvorgabe für `smart`)
heute pro Lerntag **≈ 2,5× günstiger** als Gemini 3.6 Flash netto und ab 2027 **≈ 5× günstiger**
als der Gemini-Listenpreis — aber nur, wenn der OpenAI-Präfixcache so trifft wie im Benchmark.
Ohne einen einzigen Cachetreffer liegt 5.4-mini heute etwa gleichauf mit Gemini (typischer Tag
$0,19 gegen $0,22, beide ohne Cache) und ab 2027 bei der Hälfte. Teurer als Gemini ist 5.4-mini bei Blattlesen und
Übungsvorbereitung (explain/extraction): dort schickt der OpenAI-Pfad das volle Schema (≈ 30k
Eingabetokens gegen 5k/9k bei Vertex nach der Formauswahl). Bei Sprache sind die Einheitskosten
gemischt: TTS halb so teuer (tts-1), Aussprache ≈ 6× teurer (gpt-audio-1.5).

## Was gemessen ist und was nicht

| gemessen (Belege, 23.10.)                                                                       | angenommen / nicht gemessen                                                                |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Tokens, Cachetreffer, Reasoning und $ je Call für buddy_turn, tutor, explain, extraction, forms | die Tage „leicht / typisch / intensiv" (Anzahl Vorgänge pro Tag) und 20 Lerntage pro Monat |
| Aufrufanzahl je Zweck in Produktion 28.09.–14.10. (2 Lernende, #626)                            | aktive Tage je Lernende in diesem Fenster (nicht erhoben, daher kein Wert pro Tag daraus)  |
| Vertex-Tokens der übrigen Zwecke aus Produktion (KI-Audit F §6, `llm_calls`)                    | OpenAI-Tokens der übrigen Zwecke (dort nur „gleiche Tokens wie Vertex" als Schätzung)      |
| TTS-/STT-/Embedding-/Aussprache-Größen des Sprach-Agenten (`claude/openai-speech-embed`)        | Audio-Tokens je Sekunde bei `gpt-4o-mini-tts` (Endpunkt meldet keine Usage)                |
| Preise von den offiziellen Preisseiten, abgerufen 23.10.2026                                    | Cache-Trefferquote unter echtem Verkehr (der Benchmark wiederholt identische Anfragen)     |

## Preise (USD je 1M Tokens, abgerufen 23.10.2026)

| Modell                                              |              Input | Cache-Treffer | Output (inkl. Reasoning) | Quelle / Hinweis                                                                                                                               |
| --------------------------------------------------- | -----------------: | ------------: | -----------------------: | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Gemini 3.6/3.7/3.8 Flash, eu, **heute netto**       |              0,825 |        0,0825 |                    4,125 | [Vertex-Preisseite](https://cloud.google.com/vertex-ai/generative-ai/pricing): bis 31.12.2026, über 50 % Gutschrift; Rechnung brutto 1,65/8,25 |
| Gemini Flash, eu, **ab 01.01.2027 Liste**           |               1,65 |         0,165 |                     8,25 | ebd. „Starting January 1, 2027"; 3.6 wird am 19.11. abgeschaltet, ab 2027 gilt der Preis für 3.8                                               |
| Gemini 3.1 Flash-Lite, eu (Formauswahl, Aussprache) | 0,275 (Audio 0,55) |        0,0275 |                     1,65 | ebd.; im Benchmark unverändert in beiden Zeiträumen gerechnet                                                                                  |
| gpt-5.4-mini, EU                                    |              0,825 |        0,0825 |                     4,95 | [OpenAI Pricing](https://developers.openai.com/api/docs/pricing): 0,75/0,075/4,50 + 10 % Residency-Aufschlag (Modelle ab 05.03.2026)           |
| gpt-5.4-nano, EU                                    |               0,22 |         0,022 |                    1,375 | ebd., 0,20/0,02/1,25 + 10 %                                                                                                                    |
| gpt-4.1-mini, EU                                    |               0,40 |          0,10 |                     1,60 | ebd., kein Aufschlag (vor 05.03.2026); Abschaltung 14.01.2027                                                                                  |

Die Preistabellen im Code (`VERTEX_EU_PRICES`, `OPENAI_EU_PRICES`) tragen jetzt zusätzlich den
Cache-Preis (`cachedInputPerM`). Er dient nur dem Bericht; `llm_calls.cost_micros` bleibt die
Obergrenze ohne Cacheabzug. Für OpenAI ist keine Preisänderung zum Jahreswechsel angekündigt.

## Kosten je Call (Live-Lauf 23.10.2026)

`--models gpt-5.4-mini,gpt-4.1-mini,gpt-5.4-nano --rounds 2 --budget 1`, Vertex = `eu/gemini-3.6-flash`
(+ Formauswahl auf 3.1 Flash-Lite). Mittelwerte über die Calls mit Beleg. „Beleg" = App-Formel
(`cost_micros`, Cache zum vollen Preis, Vertex netto). „Liste" = Preisseite mit Cacheabzug.
Im Benchmark laufen beide OpenAI-Stufen auf dem jeweiligen Kandidaten; in Produktion sind diese
vier Zwecke `smart`, also `gpt-5.4-mini`.

| candidate    | purpose          | valid |  input | cached | output | reasoning | cache share | $/call Beleg (ohne Cache) | $/call Liste heute | $/call Liste ab 2027 | $ je 1.000 Calls heute |
| ------------ | ---------------- | ----- | -----: | -----: | -----: | --------: | ----------: | ------------------------: | -----------------: | -------------------: | ---------------------: |
| vertex       | buddy_turn       | 6/6   | 22,510 |  2,026 |    124 |         0 |       9.0 % |                  $0.01908 |           $0.01758 |             $0.03515 |                 $17.58 |
| gpt-5.4-mini | buddy_turn       | 6/6   | 14,015 | 11,221 |    117 |        44 |      80.1 % |                  $0.01236 |           $0.00403 |             $0.00403 |                  $4.03 |
| gpt-4.1-mini | buddy_turn       | 6/6   | 13,997 | 13,824 |     98 |         0 |      98.8 % |                  $0.00576 |           $0.00161 |             $0.00161 |                  $1.61 |
| gpt-5.4-nano | buddy_turn       | 5/6   | 14,015 | 10,880 |    111 |        22 |      77.6 % |                  $0.00327 |           $0.00111 |             $0.00111 |                  $1.11 |
| vertex       | tutor            | 2/2   |  2,581 |      0 |     56 |         0 |       0.0 % |                  $0.00236 |           $0.00236 |             $0.00472 |                  $2.36 |
| gpt-5.4-mini | tutor            | 2/2   |  2,420 |  1,152 |     51 |         0 |      47.6 % |                  $0.00225 |           $0.00139 |             $0.00139 |                  $1.39 |
| gpt-4.1-mini | tutor            | 2/2   |  2,422 |  2,176 |     57 |         0 |      89.8 % |                  $0.00106 |           $0.00041 |             $0.00041 |                  $0.41 |
| gpt-5.4-nano | tutor            | 2/2   |  2,420 |    896 |     61 |         0 |      37.0 % |                  $0.00062 |           $0.00044 |             $0.00044 |                  $0.44 |
| vertex       | explain          | 2/2   |  4,975 |    995 |  1,365 |         0 |      20.0 % |                  $0.00974 |           $0.00900 |             $0.01799 |                  $9.00 |
| gpt-5.4-mini | explain          | 2/2   | 29,567 | 14,720 |  1,300 |         0 |      49.8 % |                  $0.03083 |           $0.01990 |             $0.01990 |                 $19.90 |
| gpt-4.1-mini | explain          | 2/2   | 29,569 | 29,440 |  1,415 |         0 |      99.6 % |                  $0.01409 |           $0.00526 |             $0.00526 |                  $5.26 |
| gpt-5.4-nano | explain          | 2/2   | 29,567 | 14,720 |  1,173 |         0 |      49.8 % |                  $0.00812 |           $0.00520 |             $0.00520 |                  $5.20 |
| vertex       | extraction       | 1/1   |  9,060 |      0 |  1,869 |         0 |       0.0 % |                  $0.01519 |           $0.01518 |             $0.03037 |                 $15.18 |
| gpt-5.4-mini | extraction       | 2/2   | 32,170 | 15,808 |  1,156 |         0 |      49.1 % |                  $0.03226 |           $0.02052 |             $0.02052 |                 $20.52 |
| gpt-4.1-mini | extraction       | 2/2   | 32,969 | 31,744 |  1,173 |         0 |      96.3 % |                  $0.01507 |           $0.00554 |             $0.00554 |                  $5.54 |
| gpt-5.4-nano | extraction       | 2/2   | 32,170 | 15,744 |  1,320 |         0 |      48.9 % |                  $0.00889 |           $0.00577 |             $0.00577 |                  $5.77 |
| vertex       | forms:extraction | 2/2   |  2,421 |      0 |     17 |         0 |       0.0 % |                  $0.00069 |           $0.00069 |             $0.00069 |                  $0.69 |
| vertex       | forms:explain    | 2/2   |  1,526 |      0 |     49 |         0 |       0.0 % |                  $0.00050 |           $0.00050 |             $0.00050 |                  $0.50 |

Befunde:

- **Der Cache macht bei OpenAI den Unterschied.** Ab dem zweiten Buddy-Zug trafen 5.4-mini/nano
  12.9k–13.8k von 14k Eingabetokens (stabiler Systemprompt + Schema vorn). Gemini traf im selben
  Lauf nur 0–6k von 22.5k (9 %), wie in Produktion (9,2 %, #166). Die 4.1-mini-Treffer schon in
  Runde 1 stammen aus dem früheren Lauf desselben Projekts am selben Tag. Unter echtem Verkehr ist
  die OpenAI-Quote unbekannt: Der Cache ist laut Doku nicht garantiert und verfällt im ZDR-Modus
  `in_memory` nach typisch 5–10 Minuten Pause. Die Spalte „Beleg" ist daher die Obergrenze.
- **explain/extraction sind auf OpenAI teurer pro Call als auf Gemini** (5.4-mini explain $0,020 gegen
  $0,0095, extraction $0,021 gegen $0,016, Vertex jeweils inkl. Formauswahl). Ursache: Vertex wählt erst die Formen (kleiner Flash-Lite-Call) und
  schickt dann ein kleines Schema; der direkte Pfad schickt das volle Schema mit 702–776 Properties
  (≈ 30k Tokens, `openai-eu-2026-10-23.md`). Eine Formauswahl auch für OpenAI würde das senken —
  nicht gemessen.
- **Reasoning ist billig:** 5.4-mini im Mittel 44 Reasoning-Tokens je Buddy-Zug (`low`), sonst 0.
- **Validität:** nano verfehlte einmal den Domain-Vertrag beim Mathe-Zug (wie im Lauf zuvor, #893
  offen); alle anderen gültig. Eine Vertex-Extraktion der Runde 2 wurde wegen der konservativen
  Budgetreservierung übersprungen (Stichprobe dort 1).

## Hochrechnung

Ein Vorgang = ein Call je Art (Vertex rechnet die Formauswahl zu explain/extraction). Nur die
Produktionszeile beruht auf gemessenen Anzahlen; die Tage sind **Annahmen**:

- **leicht:** 5 Buddy-Züge, 2 modellgeprüfte Antworten, 1 Übungsvorbereitung, kein Blatt.
- **typisch** (KI-Audit F §6b): 10 Züge, 3 modellgeprüfte Antworten, 1 Übung, 1 Blatt.
- **intensiv:** 30 Züge, 8 modellgeprüfte Antworten, 2 Übungen, 2 Blätter
  (Obergrenze `DAILY_LIMITS`: 80 Züge, 12 Blätter — das ist eine Grenze, keine Nutzung).
- Monat = 20 Lerntage. Je Kind und Monat = Monatswert (ein Kind).

| mix                                   | Basis              | candidate    | $ heute | $ heute, ohne Cachetreffer | $ ab 2027 | $/Monat heute | $/Monat ohne Cache | $/Monat ab 2027 |
| ------------------------------------- | ------------------ | ------------ | ------: | -------------------------: | --------: | ------------: | -----------------: | --------------: |
| Produktion 28.09.–14.10. (2 Lernende) | gemessene Anzahlen | vertex       | $1.1557 |                    $1.2413 |   $2.2992 |             – |                  – |               – |
| Produktion 28.09.–14.10. (2 Lernende) | gemessene Anzahlen | gpt-5.4-mini | $0.6666 |                    $1.3374 |   $0.6666 |             – |                  – |               – |
| Produktion 28.09.–14.10. (2 Lernende) | gemessene Anzahlen | gpt-4.1-mini | $0.2043 |                    $0.6191 |   $0.2043 |             – |                  – |               – |
| Produktion 28.09.–14.10. (2 Lernende) | gemessene Anzahlen | gpt-5.4-nano | $0.1811 |                    $0.3556 |   $0.1811 |             – |                  – |               – |
| leichter Tag                          | Annahme            | vertex       | $0.1021 |                    $0.1104 |   $0.2037 |         $2.04 |              $2.21 |           $4.07 |
| leichter Tag                          | Annahme            | gpt-5.4-mini | $0.0428 |                    $0.0971 |   $0.0428 |         $0.86 |              $1.94 |           $0.86 |
| leichter Tag                          | Annahme            | gpt-4.1-mini | $0.0141 |                    $0.0450 |   $0.0141 |         $0.28 |              $0.90 |           $0.28 |
| leichter Tag                          | Annahme            | gpt-5.4-nano | $0.0116 |                    $0.0257 |   $0.0116 |         $0.23 |              $0.51 |           $0.23 |
| typischer Tag                         | Annahme            | vertex       | $0.2082 |                    $0.2240 |   $0.4152 |         $4.16 |              $4.48 |           $8.30 |
| typischer Tag                         | Annahme            | gpt-5.4-mini | $0.0849 |                    $0.1934 |   $0.0849 |         $1.70 |              $3.87 |           $1.70 |
| typischer Tag                         | Annahme            | gpt-4.1-mini | $0.0281 |                    $0.0899 |   $0.0281 |         $0.56 |              $1.80 |           $0.56 |
| typischer Tag                         | Annahme            | gpt-5.4-nano | $0.0234 |                    $0.0515 |   $0.0234 |         $0.47 |              $1.03 |           $0.47 |
| intensiver Tag                        | Annahme            | vertex       | $0.5969 |                    $0.6436 |   $1.1915 |        $11.94 |             $12.87 |          $23.83 |
| intensiver Tag                        | Annahme            | gpt-5.4-mini | $0.2128 |                    $0.5149 |   $0.2128 |         $4.26 |             $10.30 |           $4.26 |
| intensiver Tag                        | Annahme            | gpt-4.1-mini | $0.0731 |                    $0.2395 |   $0.0731 |         $1.46 |              $4.79 |           $1.46 |
| intensiver Tag                        | Annahme            | gpt-5.4-nano | $0.0588 |                    $0.1369 |   $0.0588 |         $1.18 |              $2.74 |           $1.18 |

Die Produktionszeile: 49 Züge, 20 Tutor-, 16 explain-, 6 extraction-Calls aus `llm_calls`
(#626-Kommentar vom 16.10.). Dieselbe reale Nutzung hätte auf Gemini $1,16 netto gekostet, auf
5.4-mini $0,67 (ohne Cache $1,34). Das Fenster ist zu klein und zu kurz für einen Tageswert: aktive
Tage je Lernende wurden nicht erhoben. 9 `forms`-Calls standen dort 22 explain/extraction gegenüber;
die Hochrechnung setzt für Vertex je Vorgang eine Formauswahl an (Vertex leicht überschätzt, ≈ $0,0006 je Vorgang).

### Übrige Modellzwecke (nicht im Benchmark)

Vertex aus Produktions-Mittelwerten (KI-Audit F §6, 28.09.–14.10.), OpenAI **nur geschätzt** mit
denselben Tokenzahlen auf der Produktionsstufe (Tokenizer und Schemas unterscheiden sich; im
Benchmark lagen OpenAI-Eingaben zwischen 0,6× und 6× der Vertex-Werte):

| Zweck (Produktionsanzahl 28.09.–14.10.) | Vertex heute | Vertex ab 2027 | OpenAI (Schätzung)            |
| --------------------------------------- | -----------: | -------------: | ----------------------------- |
| buddy_check (20)                        |     $0,00803 |       $0,01606 | 5.4-mini ≈ $0,0086 ohne Cache |
| hints (13)                              |     $0,00632 |       $0,01264 | 5.4-mini ≈ $0,0074            |
| figures (5)                             |     $0,00286 |       $0,00573 | 5.4-mini ≈ $0,0029            |
| summary (5)                             |     $0,00033 |       $0,00033 | 5.4-nano ≈ $0,0003            |
| transcribe (35)                         |     $0,00059 |       $0,00118 | siehe Sprache                 |
| pronounce (4)                           |     $0,00109 |       $0,00109 | siehe Sprache                 |
| embedding (39)                          |  siehe unten |                |                               |

Zusammen tragen sie am typischen Tag (2 Prüfungen, 1 Hinweisrunde, 1 Figurensuche,
2 Zusammenfassungen) auf Vertex ≈ $0,026 heute / $0,050 ab 2027 bei — klein gegen die Kernzwecke.

## Sprache, Aussprache und Embeddings: Einheitskosten

Preise abgerufen 23.10.2026: [Cloud TTS](https://cloud.google.com/text-to-speech/pricing),
[Cloud STT](https://cloud.google.com/speech-to-text/pricing), Vertex und OpenAI wie oben. Größen
gemessen vom Sprach-Agenten (`docs/measurements/eu-speech-search-2026-10-23.md` auf
`claude/openai-speech-embed`): fünf Sätze, 329 Zeichen zusammen; Audiodauer per `afinfo`.

| Einheit                                                        | Google (heute App-Pfad)                                                                                                                                      | OpenAI EU (Kandidat)                                                                                                                             | Bemerkung                                                                                                                                                                                                  |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TTS je 1.000 Zeichen**                                       | Chirp 3 HD **$0,030**; 0–1M Zeichen/Monat und Konto frei                                                                                                     | `tts-1` **$0,015**; kein Freikontingent                                                                                                          | gemessen 76 s Audio je 1.000 Zeichen (`gpt-4o-mini-tts`), 59 s (`tts-1`), 65 s (Chirp 3)                                                                                                                   |
| TTS, `gpt-4o-mini-tts`                                         | —                                                                                                                                                            | $0,60/1M Text-Tokens + $12/1M Audio-Tokens                                                                                                       | Audio-Tokens/s nicht dokumentiert, Endpunkt meldet keine Usage → **Preis je Zeichen offen**. Die EU-Residency-Tabelle nennt `tts-1`, `gpt-4o-tts`, aber nicht `gpt-4o-mini-tts`. Latenz 11–16 s (gemessen) |
| TTS am typischen Tag (20 Sätze × 80 Zeichen, Annahme KI-Audit) | $0,048 roh, $0 im Freikontingent (reicht für ≈ 31 Lernende)                                                                                                  | $0,024                                                                                                                                           |                                                                                                                                                                                                            |
| **STT je Minute**                                              | Gemini 3.6 (App-Pfad `transcribe`) ≈ $0,0021 heute / $0,0043 ab 2027 (Audit-Annahme: 25 Tokens/s, 200 Ausgabetokens); Chirp 3 STT $0,016 (nicht im App-Pfad) | `gpt-4o-transcribe` **$0,0037** gemessen (102 Audio- + 37 Ausgabetokens für 10,2 s; Preisseite schätzt $0,006); `gpt-4o-mini-transcribe` $0,0018 | OpenAI braucht danach eine Chat-Stufe für Formatierung/Schutzprüfung (vom Sprach-Agenten verbucht, Kosten nicht gemessen)                                                                                  |
| STT je Produktions-Call (Mittel ≈ 19 s Audio)                  | $0,00059 / $0,00118                                                                                                                                          | ≈ $0,0012 (gpt-4o-transcribe, hochgerechnet) + Chat-Stufe                                                                                        |                                                                                                                                                                                                            |
| **Aussprache je Urteil**                                       | Gemini 3.1 Flash-Lite **$0,00090** (Beleg, 6 menschliche Aufnahmen, 1.034 in / 360 out)                                                                      | `gpt-audio-1.5` **$0,0057** (gemessene Tokens 37 Audio + 751 Text in, 269 out × Listenpreis)                                                     | ≈ 6×; `gpt-audio-1.5` steht **nicht** in der EU-Residency-Liste für Chat Completions (Data controls, 23.10.) — vor jeder Freigabe klären                                                                   |
| **Embeddings je 1M Tokens**                                    | gemini-embedding-001 $0,15 Liste (App-Tabelle rechnet $0,20)                                                                                                 | `text-embedding-3-small` **$0,02**                                                                                                               | gemessen, gleiches Korpus (7 Blätter + 14 Suchen): 105 gegen 13 Mikro-USD erfasst                                                                                                                          |
| je Blatt (≈ 2.000 Tokens, Annahme KI-Audit)                    | $0,0003                                                                                                                                                      | $0,00004                                                                                                                                         | vernachlässigbar                                                                                                                                                                                           |

## Live-Ausgaben dieser Messung

51 HTTP-Inferenzversuche, alle mit Beleg, 1 Call als Budget-Skip protokolliert.
App-Formel ohne Cacheabzug: Vertex **$0,156 netto** (brutto vor Gutschrift $0,313), gpt-5.4-mini
$0,205, gpt-4.1-mini $0,095, gpt-5.4-nano $0,055. Gegen das Budget gebucht (Vertex brutto):
**$0,667 von $1**. Im gemeinsamen Budget-Ledger eingetragen. Die reale Rechnung liegt darunter
(OpenAI-Cacheabzug, spätere Vertex-Gutschrift).

## Offene Lücken

1. **Cachequote unter echtem Verkehr** (größter Hebel, Faktor ≈ 2 bei 5.4-mini). Nach einer
   Umschaltung aus `llm_calls.cached_tokens` messen; bis dahin gilt die Spanne
   „heute" … „ohne Cachetreffer".
2. **explain/extraction auf OpenAI ohne Formauswahl:** ≈ 30k Eingabetokens je Call. Ob eine
   Formauswahl wie bei Vertex die Kosten halbiert, ist nicht gemessen.
3. **Tagesmix:** echte Vorgänge je aktivem Lerntag fehlen (2 Lernende, 17 Tage, keine
   Aktivtage erhoben). Schwelle aus #626 (≥ 200 Züge, ≥ 30 je Zweck, ≥ 2 Wochen) gilt auch hier.
4. **Übrige Zwecke auf OpenAI** (buddy_check, hints, figures, summary, distress) nicht gemessen.
5. **`gpt-4o-mini-tts`-Preis je Zeichen** und EU-Listung; **`gpt-audio-1.5` EU-Listung**.
6. Kleine Stichprobe: 2 Runden, 1–6 Calls je Zweck und Kandidat; keine Last, keine Quota-Aussage.

## Reproduzieren

```sh
set -a; . apps/api/.env.local; set +a          # Schlüssel nie ausgeben
sh -c '. scripts/test-lock.sh; pnpm -C apps/api exec tsx scripts/bench-providers.ts \
  --provider openai --models gpt-5.4-mini,gpt-4.1-mini,gpt-5.4-nano --rounds 2 --budget 1 \
  --tag bench-costs --out ../../test-results/cost/provider-bench.md'
```

Der Bericht enthält jetzt die Abschnitte „Cost per call" und „Projection"; die Mischungen stehen
in `MIXES` (`apps/api/src/testing/bench/costs.ts`) mit Kennzeichnung gemessen/Annahme.
