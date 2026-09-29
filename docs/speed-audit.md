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
  **Nachgemessen 29.09. (#25):** Der Cache greift bereits — `evals/buddy`, 36 Fälle,
  zwei Läufe: **243 525 bzw. 389 469 von 627 985 Input-Tokens aus dem Cache** (20 bzw.
  31 von 36 Fällen trafen; Implicit Caching ist best-effort, und wie oft es greift,
  schwankt stark zwischen Läufen). Gecacht wird aber der Teil _vor_ `contents`:
  Systemprompt (3 442 Tokens — allein unter dem Minimum) plus das Response-JSON-Schema
  (~6 100 Tokens). Beleg, dass es dort endet: jeder Treffer lag zwischen 12 013 und
  12 177 Tokens, bei 36 Lernenden, deren Zustandsblöcke sich um weit mehr
  unterscheiden — der Wert wuchs nie mit dem Zustand mit.
  Der STATE-Block wird heute also nicht mitgecacht; die Schichtung
  (stabil vorn, „## Now" hinten) ist trotzdem drin — sie kostet nichts und ist die
  einzige Form, mit der ein Präfix-Cache je weiter greifen kann. Ablesbar in
  `llm_calls.cached_tokens` (Migration 0052); `cost_micros` bleibt der ungerabattierte
  Preis. Siehe `docs/architecture.md` §Speed.
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
