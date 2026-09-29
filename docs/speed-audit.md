# Speed-Audit — Baseline 28.09.2026

Methode: echte App in-process (Testing-Harness, Wegwerf-Postgres), echte
Vertex-EU-Modelle aus `apps/api/.env.local`. Wall-Clock am Endpoint plus
Modell-Latenz/Tokens aus `llm_calls`, sodass Overhead = Wall − Modell pro Pfad
sichtbar ist. Wiederholen: `pnpm --filter @learnbuddy/api exec tsx scripts/speed-audit.ts`
(Fixtures: `apps/api/src/testing/fixtures/audio`, macOS `say`).

## Endpoint wall-clock

| Pfad                         | Läufe | min   | median | max   |
| ---------------------------- | ----- | ----- | ------ | ----- |
| Buddy-Turn gesamt (JSON)     | 2     | 1.99s | 2.87s  | 2.87s |
| Buddy-Turn erstes SSE-Event  | 2     | 1.14s | 1.22s  | 1.22s |
| Transkription 10 s (73 KB)   | 3     | 1.33s | 1.67s  | 1.76s |
| Transkription 66 s (295 KB)  | 2     | 2.49s | 2.73s  | 2.73s |
| Transkription 206 s (852 KB) | 1     | 2.32s | 2.32s  | 2.32s |
| Aussprache-Urteil (5-s-Clip) | 2     | 2.27s | 3.57s  | 3.57s |

## Modellseite (`llm_calls`)

| Purpose    | Calls | Latenz median | Latenz max | In-Tokens median | Out-Tokens median |
| ---------- | ----- | ------------- | ---------- | ---------------- | ----------------- |
| buddy_turn | 4     | 1.80s         | 2.81s      | 15 014           | 105               |
| explain    | 1     | 2.17s         | 2.17s      | 4 236            | 366               |
| pronounce  | 2     | 2.88s         | 3.53s      | 1 005            | 618               |
| transcribe | 6     | 2.02s         | 2.72s      | 1 303            | 82                |

TTS: lokal `SPEECH_BACKEND` nicht gesetzt — übersprungen (auf Vercel
konfiguriert; bei Bedarf lokal setzen und erneut laufen lassen).

## Lesart (Stand Baseline)

- **Die erlebten ~10 s Aussprache-Wartezeit sind nicht das Modell** (2,9 s
  median in-process). Die Differenz liegt in Handy-Upload (WLAN), Vercel-Weg
  und App-Orchestrierung (Aufnahme finalisieren, Base64, Rendering + Vorlesen).
  Konsequenz: #8 (Verdict-Streaming) + #13/#28 (Upload früher) + App-seitige
  Messung, nicht nur Server-Optimierung.
- **Transkription skaliert praktisch nicht mit der Cliplänge** (206 s → 2,3 s):
  das neue 3-Minuten-Diktat kostet keine gefühlte Wartezeit; VAD-Chunking (#19)
  macht das Ende dann pausen-schnell.
- **buddy_turn trägt ~15k Input-Tokens** → deutlich über dem 4.096er-Minimum
  für Vertex Implicit Caching. #25 (Cache-Schichtung) hat reales Sparpotenzial
  (90 % auf den stabilen Präfix), zusätzlich zur TTFT-Politur.
- SSE-TTFB 1,1–1,2 s ist eine gute Basis; Thinking-Caps (#10) sollten den
  Median weiter drücken — Nachmessung nach P1 hier ergänzen.

## App-seitig gemessen (29.09., Browser-Walkthrough, gescriptetes Modell + lokale API)

Die App misst selbst, wie lange ein Tipp bis zur sichtbaren Reaktion braucht
(`apps/mobile/lib/perf.ts`, Issue #66); der Walkthrough schreibt es nach
`test-results/web/perf.jsonl`.

| Aktion                                       | gemessen     | was fehlt                                                                  |
| -------------------------------------------- | ------------ | -------------------------------------------------------------------------- |
| Senden einer Nachricht → ihre Blase steht    | **0 ms**     | —                                                                          |
| „Los geht's" auf einem Angebot → erste Frage | **11–18 ms** | die Generierung, falls nicht vorbereitet (#48; in Produktion 5,2 s Median) |
| „Prüfen" → Urteil                            | **22–36 ms** | die Modellzeit bei Freitext-Antworten (0,7–1,6 s)                          |

**Was das ausschließt:** im Zeichnen der App hängt nichts. Was sich langsam anfühlt, kommt
vom Netz, vom Modell oder vom Kaltstart (#75). Budgets werden daraus abgeleitet, nicht
vorher gesetzt.

## Layout und Upload (29.09., gemessen)

| Was                                                          | vorher      | nachher      | Messung                                         |
| ------------------------------------------------------------ | ----------- | ------------ | ----------------------------------------------- |
| gepinnte Leiste unter einer Mathefrage (360×740, Feld aktiv) | **254 pt**  | **185 pt**   | `tests/web/fit.ts` → `bottomStack`, `fit.jsonl` |
| Seiten hochladen beim Senden                                 | alle Seiten | nur der Rest | noch nicht am Gerät gemessen (Mobilfunk fehlt)  |

Der Upload läuft seit #56 mit, während sie weiter fotografiert: die Reservierung entsteht mit
der ersten Seite, jede weitere hängt sich an, und jede fertige Seite geht sofort in den
Speicher. Was „Senden" danach noch tut, ist der Submit — die Ersparnis ist genau die
Upload-Zeit der Seiten, die vor dem Tippen fertig waren. Im Browser-Walkthrough ist der
Speicher lokal, die Zahl sagt dort also nichts; die ehrliche Messung braucht ein Handy im
Mobilfunknetz (#37).

## Live gegen das Modell (29.09., 19 Lena-Journeys, in-process)

| Was                                  | Median                         | Maximum |
| ------------------------------------ | ------------------------------ | ------- |
| Chat-Antwort (ganze Antwort)         | 2,9–4,2 s                      | 6,5 s   |
| Übung vorbereiten (`prepare`)        | 2,5–7,3 s                      | 7,3 s   |
| Antwort prüfen (`answer`)            | 10 ms (Regel) – 1,4 s (Modell) | 1,5 s   |
| Blatt lesen (1 Seite) → Übung bereit | 8,2–9,9 s                      | 11,2 s  |

**Kaltstart der deployten API** (nach Ruhe, `/v1/health`): 15 min → 148 ms, 20 min → 165 ms
(warm 95–105 ms). Der Minuten-Cron des Schedulers hält die Funktion wach; die 11 s beim
Blattlesen sind Modellzeit, kein Kaltstart (#75).

## Vorlesen im Voice-Mode: wo die Stille steckt (29.09., Issue #24)

Gemessen mit `apps/api/evals/tts/run.ts` (2 Runden × 3 Prompts = 6 Turns, 16 Sätze) gegen das
echte Modell **und** die echte Google-TTS (Chirp 3 HD, EU-Endpunkt). Pro Satz einer echten
Buddy-Antwort wird gemessen: wann sein Text fertig geschrieben ist (aus dem Modell-Stream),
wie lange die Synthese dauert (seriell und alle Sätze parallel) und wie lange das Audio spielt
(MP3-Framelänge, nicht geschätzt). Der Turn-Verlauf wird aus diesen drei gemessenen Größen
gerechnet; die Abspielzeit selbst wird nicht abgewartet.

| Pro Satz (Median von 16)  | Wert   |
| ------------------------- | ------ |
| Synthese, seriell         | 0,95 s |
| Synthese, alle 3 parallel | 0,94 s |
| Abspieldauer              | 4,70 s |

Die Synthese ist also **fünfmal schneller als das Abspielen** — und der Provider cacht nicht
(derselbe Satz zweimal: 0,66 s dann 0,69 s), die Zahlen sind echt.

| Zeitplan der App                                     | erstes Audio | Stille zwischen den Sätzen | Turn fertig |
| ---------------------------------------------------- | ------------ | -------------------------- | ----------- |
| **vorher**: ein `speak()` pro Satz (`streamSpeaker`) | 2,44 s       | **2,41 s** (0,88–2,97 s)   | 23,94 s     |
| **nachher**: ein Vorlesen, nächster Satz vorgeholt   | 2,44 s       | **0,00 s** (in allen 6)    | 21,57 s     |
| alle Sätze sofort parallel                           | 2,66 s       | 0,00 s                     | 21,51 s     |

**Befund.** Die Lücke lag nicht an der Synthese, sondern am Zeitplan: `createStreamSpeaker`
rief pro Satz `speak()` auf, also begann die Synthese von Satz n+1 erst, **nachdem** Satz n
fertig gespielt war — 0,65–1,87 s Stille nach jedem Satz. Seit #24 ist eine Antwort **ein**
Vorlesen (`lib/speech/pipeline.ts`): der nächste Satz wird geholt, während der aktuelle läuft.
Weil Abspielen (4,7 s) ≫ Synthese (0,95 s), reicht **ein** Satz Vorlauf — er schließt in allen
sechs gemessenen Turns jede Lücke.

**Was bewusst nicht gebaut wurde.**

- **Kein Batch-Endpunkt** (`/voice/speech-batch`): Die Messzeile „alle Sätze sofort parallel"
  bringt gegenüber einem Satz Vorlauf **0,00 s** weniger Stille und macht das erste Audio
  sogar minimal später (2,66 s statt 2,44 s, parallele Requests sind einzeln nicht schneller).
  Eine zusätzliche Serverfläche ohne Gewinn.
- **Das erste Audio wird durch Pipelining nicht früher** — es besteht aus Modellzeit bis zum
  ersten fertigen Satz (1,27–3,75 s) plus einer Synthese (0,65–1,10 s), beides unvermeidbar
  pro Satz-MP3. Das Akzeptanzkriterium „erstes Audio ≥ 1 s früher" aus #24 ist so **nicht**
  erreichbar; dafür gibt es bereits `shortOpening` (#41, kurzer erster Teilsatz) und den
  Handy-Stimmen-Fallback nach 2,5 s. Echt früher ginge nur mit einem Streaming-Player
  (Chirp 3 HD liefert in der EU nur OGG/PCM — großer Mobile-Umbau, in #24 verworfen).
- **Kein Vor-Synthetisieren auf dem Server** (der „waitUntil"-Teil von #24): Die App fragt den
  Satz, sobald sie ihn im SSE-Stream sieht — der Server wüsste ihn nur einen Roundtrip früher.
  Gespart wäre also die Netzstrecke, nicht die 0,95 s Synthese; dafür brauchte es Hintergrund-
  arbeit pro Turn. Der Hash-Cache, auf den #24 aufbaut, existiert bereits (`speech_cache`,
  `speech_cache_shared`, per sha256 über Stimme/Locale/Rate/Text; Treffer sind in
  `speech.int.test.ts` festgenagelt), der Provider selbst cacht nicht.

Preis des Vorlaufs: unterbricht sie mitten in der Antwort, ist höchstens **ein** Satz umsonst
synthetisiert (das Audio wird verworfen, `release`). Gegen das Kostenlimit von 1 000 neuen
Sätzen pro Konto und Stunde (ADR 0008) fällt das nicht ins Gewicht.

Nachmessen: `cd apps/api && SPEECH_BACKEND=google npx tsx evals/tts/run.ts 2`.
