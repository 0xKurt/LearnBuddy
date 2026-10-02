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

TTS: lokal `SPEECH_BACKEND` nicht gesetzt — übersprungen, in dieser Tabelle gibt es
deshalb keine TTS-Zeile (das Skript ruft TTS nur bei `SPEECH_BACKEND=google` auf).

> **Korrektur 01.10.2026.** Hier stand „auf Vercel konfiguriert". Das war eine
> Behauptung, keine Messung, und zum Zeitpunkt der Baseline (28.09.) falsch: der
> Standard in `apps/api/src/config.ts` ist `disabled`, und #176 hat gezeigt, dass die
> natürliche Stimme bis dahin **nie** eingeschaltet war — jede Vorlese-Anfrage fiel auf
> die Stimme des Telefons zurück. Die Zeile hat genau das kaschiert.
> **Stand jetzt, gemessen am 01.10. ~19:05 UTC:** `curl -s https://learn-buddy-api.vercel.app/v1/health`
> antwortet `"voice":true`. Das Feld ist `deps.speech.available` (`apps/api/src/app.ts`),
> und `available` ist nur bei `GoogleSpeech` wahr (`production.ts`: `SPEECH_BACKEND === 'google'`)
> — auf Vercel steht die Variable also inzwischen. Was damit **nicht** belegt ist: dass ein
> echter Chirp-3-Aufruf durchgeht (IAM-Recht, aktivierte API). Das ist die offene
> Live-Verifikation aus ADR 0008 und #176.
>
> Echte TTS-Zahlen stehen weiter unten — §Vorlesen im Voice-Mode und §Das erste
> gesprochene Stück: dort wurde `SPEECH_BACKEND=google` für den Lauf gesetzt und gegen
> den echten EU-Endpunkt gemessen.

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
  **Nachgemessen 01.10. in Produktion:** Diese Eval-Zahlen gelten **nicht** für den
  Betrieb. Über Vercel trägt der Cache bei `buddy_turn` **28 348 von 308 726**
  Eingabe-Tokens (9,2 %, 14 Aufrufe, 3 mit Treffer) — der Eval feuert hunderte Aufrufe mit
  demselben Präfix in Minuten, Produktion eine Handvoll Stunden auseinander. Wer eine von
  beiden Zahlen zitiert, muss sagen, welche: `docs/decisions/prefix-cache-2026-10-01.md`.
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

## Abnahme-Messlauf nach der zweiten Welle (29.09. nachmittags, Issue #59)

`scripts/speed-audit.ts` auf dem Stand nach den Merges (TTS übersprungen — `SPEECH_BACKEND`
lokal nicht gesetzt; wenige Läufe, in-process ohne Funknetz):

| Pfad                         | Läufe | min    | median | max    |
| ---------------------------- | ----- | ------ | ------ | ------ |
| Buddy-Turn gesamt (JSON)     | 2     | 2,25 s | 2,43 s | 2,43 s |
| Buddy-Turn erstes SSE-Event  | 2     | 1,14 s | 1,42 s | 1,42 s |
| Transkription t15 (73 KB)    | 3     | 1,88 s | 2,01 s | 2,14 s |
| Transkription t60 (295 KB)   | 2     | 2,35 s | 2,66 s | 2,66 s |
| Transkription t180 (852 KB)  | 1     | 2,48 s | 2,48 s | 2,48 s |
| Aussprache-Urteil (5-s-Clip) | 2     | 2,75 s | 3,58 s | 3,58 s |

Gegen die Abnahme aus Issue #59:

- **Erste Worte im Chat < 1,5 s:** erstes SSE-Event median **1,42 s** — API-seitig erfüllt;
  am Gerät kommt das Funknetz dazu (Gerätemessung offen).
- **Übung starten < 1 s / nächste Frage < 0,5 s:** aus dem Walkthrough vom 30.09.
  (`test-results/web/perf.jsonl`, 11 Durchläufe, gescriptetes Modell):

  | Marke                                 | n   | min   | median | max   |
  | ------------------------------------- | --- | ----- | ------ | ----- |
  | `start_offer` (Angebot → Übung läuft) | 3   | 9 ms  | 10 ms  | 10 ms |
  | `check` (Antwort → nächste Frage)     | 7   | 19 ms | 22 ms  | 35 ms |
  | `first_audio` (Antwort → erster Ton)  | 1   | 16 ms | 16 ms  | 16 ms |
  | `relisten` (letztes Wort → Mikro)     | 1   | 46 ms | 46 ms  | 46 ms |

  **Der App-Anteil ist vernachlässigbar.** Das Modell ist hier gescriptet und die Stimme eine
  Attrappe, also messen diese Zahlen genau das: Session-Cache, Prefetch und Rendering kosten
  Millisekunden, keine Sekunden. Was ein Kind als Warten erlebt, sind Modell und Netz — und
  am Gerät der Start des Android-Erkenners. **Diese Marken sagen nichts über das Handy**;
  sie schließen nur aus, dass die App selbst bremst.

- **Erstes Audio < 1 s nach der Antwort:** mit Per-Satz-MP3 **nicht erreichbar** (Modellzeit
  bis zum ersten fertigen Satz + eine Synthese, §Vorlesen unten) — das Kriterium braucht
  entweder Streaming-TTS oder eine ehrliche Korrektur; die Stille ZWISCHEN Sätzen ist 0,00 s.

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

## Wieder-Zuhören und erster Ton im Gesprächsmodus (29.09., Issues #41/#35)

Zwischen Buddys letztem Wort und dem Mikrofon lagen App-seitig drei Wartezeiten, die kein
Gerät braucht — sie sind entfernt, nicht verkürzt:

- **Berechtigungs-Roundtrip pro Turn:** `getPermissionsAsync` wurde vor jedem Zuhören neu
  gefragt. Eine erteilte Berechtigung gilt jetzt, solange die App im Vordergrund bleibt
  (`GrantMemory`, `apps/mobile/lib/speech/engine.ts`): Android kann eine
  „Nur dieses Mal"-Berechtigung zurücknehmen, während die App weg ist, iOS startet die App
  bei einer Änderung neu — nach dem Zurückkommen wird einmal neu gefragt, nicht pro Turn.
- **Engine-Wahl und Android-Service-Liste beim ersten Zuhören:** beim Öffnen des
  Talk-Screens vorgewärmt (`warmRecognition`, `lib/speech/recognize.ts`) statt beim ersten
  Start abgewartet.
- **Hängengebliebenes „Buddy spricht":** War eine kurze Antwort fertig vorgelesen, bevor
  der Server sie gespeichert hatte, wartete die Schleife für immer — die Entscheidung fiel
  nur am Ende des Vorlesens. Jetzt entscheidet `afterReply` (`lib/speech/talkTurn.ts`,
  unit-getestet) an beiden Enden, wer auch immer zuletzt kommt.

Ton („listen"-Cue) und Mikrofonstart liefen schon parallel (28.09.). Was bleibt, ist der
Start des Erkenners selbst (Android bindet einen Systemservice) — eine Zahl, die nur ein
echtes Gerät liefern kann. Deshalb misst die App jetzt selbst (`lib/perf.ts`):

- `relisten` — Buddys letztes Wort → der Erkenner läuft wieder (Abnahme #41: < 0,5 s);
- `first_audio` — Buddys Worte erscheinen (bzw. die gespeicherte Antwort steht) → der
  erste hörbare Ton, natürliche oder Handy-Stimme (Abnahme #41: < 1 s).

Im Browser-Walkthrough landen beide in `test-results/web/perf.jsonl`; die Gerätemessung
steht aus — **hier stehen bewusst keine Zahlen, bis eine Messung existiert** (Regel 5).

### Das erste gesprochene Stück (30.09., `apps/api/evals/tts/opening.ts`, 3 Runden live)

Chirp 3: HD, EU-Endpunkt, de-DE. Jede Länge einmal pro Runde und vor jeder Wiederholung,
damit eine langsame Minute alle Varianten gleich trifft — die erste Fassung dieser Messung
meldete sonst einen Unterschied zwischen zwei **identischen** Texten.

| Zeichen | min    | median | max    | spielt  |
| ------- | ------ | ------ | ------ | ------- |
| 20      | 0,35 s | 0,36 s | 0,67 s | 1,46 s  |
| 33      | 0,47 s | 0,49 s | 0,50 s | 2,50 s  |
| 58      | 0,54 s | 0,64 s | 0,64 s | 3,82 s  |
| 77      | 0,73 s | 0,84 s | 0,88 s | 5,93 s  |
| 98      | 0,91 s | 0,91 s | 0,93 s | 6,50 s  |
| 113     | 0,98 s | 1,15 s | 1,20 s | 6,74 s  |
| 160     | 1,21 s | 1,30 s | 1,36 s | 9,58 s  |
| 198     | 1,39 s | 1,40 s | 1,50 s | 11,69 s |

Die Synthese wächst fast linear mit der Länge und **kreuzt die Sekunde bei rund 100–110
Zeichen**. Genau da steht `OPENING_MAX = 110` (`lib/speech/readAloud.ts`) — die Grenze ist
damit gemessen, nicht geraten.

Vier echte lange Eröffnungssätze, ungeteilt gegen am ersten Klausel-Rand geschnitten:

| Satz                  | ganz   | 1. Stück | früher | spielt | 2. Stück braucht | Lücke |
| --------------------- | ------ | -------- | ------ | ------ | ---------------- | ----- |
| Urknall (118)         | 1,05 s | 0,66 s   | 0,38 s | 4,66 s | 0,55 s           | keine |
| Brüche addieren (141) | 1,00 s | 0,59 s   | 0,41 s | 3,82 s | 0,64 s           | keine |
| Pizza teilen (122)    | 0,90 s | 0,78 s   | 0,12 s | 4,97 s | 0,49 s           | keine |
| Englischtest (122)    | 0,96 s | 0,70 s   | 0,26 s | 3,29 s | 0,67 s           | keine |

**Median 0,38 s früher, Lücke in 4/4 gedeckt:** das erste Stück spielt drei- bis siebenmal
so lange, wie die Synthese des zweiten braucht, der Prefetch (`lib/speech/listen.ts`) kommt
also immer mit. Der Schnitt kostet nichts und bringt gut ein Drittel der Wartezeit.

Kein Provider-Cache, der die Zahlen schönt: derselbe Satz zweimal → 1,32 s, dann 0,94 s
(Verbindungsaufbau, kein Treffer aus einem Cache).

**Was damit belegt ist und was nicht:** die Synthese des ersten Stücks bleibt unter einer
Sekunde (0,59–0,78 s). Ob das Abnahmekriterium „erstes Audio < 1 s" gehalten wird, sagt
erst die Gerätemessung — dazwischen liegen noch App→API→Google und die Wiedergabe.
Gegen ein langes erstes Stück stehen `shortOpening` und die 2,5-s-Grenze, ab der die
Handy-Stimme einspringt.

**Barge-in (#35), Stand 29.09. — überholt am 02.10. (unten):** Während Buddy spricht, blieb das Mikrofon aus: weder expo-audio noch
expo-speech-recognition sichern Geräte-Echo-Cancellation zu, ein offenes Mikrofon schriebe
Buddys eigene Stimme mit (Aufnahmen, die währenddessen starten, werden schon verworfen —
Audit M-78). Ehrlich geht: der Tipp auf Buddy **oder** das Mikro unterbricht und hört
sofort zu — ein Tipp statt zwei. `iosCategory: playAndRecord` existiert in
expo-speech-recognition 3.1.3, ist aber ohne Gerätetest kein Versprechen; echtes Reinreden
bräuchte einen Duplex-Audio-Stack (nicht gebaut, `docs/architecture.md` §Voice).

### Nachgemessen 02.10.: Gesprächsmodus im Browser, vorher/nachher (#41, mit Barge-in #35)

Methode: `tests/web/talk-voice.spec.ts` — die echte App gegen die echte API (Dev-Stack,
geskriptetes Modell), drei Gesprächs-Turns hintereinander, die App-eigene Stoppuhr
(`lib/perf.ts`) nach `test-results/web/perf.jsonl`. Buddys Stimme ist am Netzrand durch Stille
der passenden Länge ersetzt (wie die `FakeSpeech` der API): die Synthese-Zeit ist also **nicht**
enthalten — sie steht oben (0,59–0,78 s für das erste Stück). „Vorher" = `app/talk.tsx` von
`main` (4ed87e3) mit derselben Spec, „nachher" = mit Barge-in-Ohr.

| Spanne                                     | vorher (3 Turns)   | nachher (3 Turns)  | Abnahme #41 |
| ------------------------------------------ | ------------------ | ------------------ | ----------- |
| `first_audio` (Worte da → erster Ton)      | 218 / 148 / 161 ms | 194 / 153 / 203 ms | < 1 s       |
| `relisten` (letztes Wort → Aufnahme läuft) | 46 / 55 / 41 ms    | 42 / 52 / 36 ms    | < 0,5 s     |

**Lesart, ehrlich:** im Browser gibt es keine Lücke mehr zu schließen — beide Spannen liegen
weit unter der Abnahme, vorher wie nachher; der Unterschied ist Rauschen. Dass das Ohr den
Mikrofon-Stream offen hält, bis die Aufnahme läuft, kann hier nichts zeigen: Chromiums
Fake-Mikrofon öffnet sofort. Ein echtes Laptop-Mikrofon braucht dafür messbar länger — nicht
gemessen, nicht behauptet. Das Satz-Pipelining (#24) und der kurze erste Satz (`shortOpening`)
waren schon drin; dieser Durchlauf bestätigt nur, dass die App selbst nichts mehr dazulegt.

Zweiter Lauf am selben Abend, nachdem der Erkenner auf ein noch loslassendes Ohr warten muss
(`lib/speech/bargeMonitor.ts`): `first_audio` 204 / 169 / 182 ms, `relisten` 45 / 39 / 49 ms
— im Browser unverändert (dort gibt das Ohr nichts frei, es teilt das Gerät); was das Warten auf
Android kostet, misst nur das Gerät.

**Barge-in (#35), gemessen im selben Aufbau** (`tests/web/talk-barge.spec.ts`): ein Mikrofon,
das nach 3 s Stille etwas Stimmförmiges „sagt" (150 Hz mit Obertönen, vier Silben pro Sekunde),
stoppt Buddy **3,87 s** nach „Buddy spricht …" — also rund 0,3 s Torzeit plus Bildschirm, nachdem
die Stimme einsetzt. Chromiums Standard-Fake-Mikrofon (ein 20-ms-Piep zweimal pro Sekunde, gemessen
−8 bis −17 dBFS) stoppt ihn in drei vollen Antworten **kein einziges Mal**.

**Was weiter nur das Gerät sagt:** `first_audio` und `relisten` auf Android/iOS (die
Logcat-Zeilen `[lb-perf]`, siehe oben), dazu für Barge-in: wie viel Echo Androids Canceller bei
Medienwiedergabe über den Lautsprecher übrig lässt (also wie laut sie sprechen muss), wie lange
der Pegel-Rekorder braucht, um das Mikro für den Erkenner freizugeben (das kommt nach einem
Reinreden zu `relisten` dazu), und ob Rekorder und Buddys Player auf jedem Audioweg
(Lautsprecher, Kopfhörer, Bluetooth) nebeneinander laufen. Auf iOS bleibt es beim Tipp
(`docs/architecture.md` §Voice).

## Ausgabe-Tokens sind die Wartezeit: die zwei gemessenen Hebel (02.10., Issues #219/#220)

Methode: `apps/api/scripts/speed-audit.ts practice` (jetzt stufenweise aufrufbar, drei Läufe
je Richtung) für die Zeit, `apps/api/evals/content` für den Inhalt — derselbe Lauf misst
beides, weil sonst Qualität und Tempo in zwei verschiedenen Läufen gegen zwei verschiedene
Blätter gemessen würden. Die Tabelle der Modellseite nennt jetzt auch **Denk-Tokens**: sie
kosten dieselbe Zeit wie geschriebene und standen vorher in keiner Zeile.

### #219 — die Reihenfolge der Abschrift: gemessen, und **nicht** eingebaut

Die Annahme des Issues war, die Abschrift (bis 12 000 Zeichen, vor `items` im Schema) sei
der Grund für die 14 s. Gemessen auf beiden Eval-Blättern:

| Was                                    | math-fractions  | german-cases  |
| -------------------------------------- | --------------- | ------------- |
| Anteil Abschrift an der Antwort        | **5,0 %**       | **9,0 %**     |
| Anteil Fragen an der Antwort           | 89,6 %          | 84,8 %        |
| `extraction`-Latenz vorher / umgedreht | 10,90 → 10,53 s | 7,75 → 7,39 s |
| Ausgabe-Tokens vorher / umgedreht      | 2 481 → 2 329   | 1 699 → 1 729 |
| „vom Blatt" ohne Befund                | 14/14 → 14/14   | (dieselben)   |

Die Umdrehung erreicht das Modell wirklich — die Feldreihenfolge der Antwort (aus
`Object.keys` der geparsten Antwort, also die echte Schreibreihenfolge) wechselte von
`… subject, extracted_text, items, …` zu `… subject, items, extracted_text, …`. Die Qualität
blieb gleich. **Die Zeit auch**, und das ist kein Zufall, sondern Arithmetik: ein nicht
gestreamter Aufruf gibt seine Antwort heraus, wenn das LETZTE Token geschrieben ist. Die
Reihenfolge innerhalb einer vollständigen Antwort kann ihre Länge nicht ändern. −0,37 s und
−0,36 s liegen im Rauschen (die Ausgabe-Tokens schwankten um ±6 %).

Und selbst gestreamt wäre die Decke klein: die Abschrift ist 5–9 % der Antwort, die Fragen
85–90 %. „Die erste Frage nach 2–4 s statt nach 11–16 s" ist über die Feldreihenfolge nicht
erreichbar — 90 % der Schreibzeit SIND die Fragen. Dafür müsste man innerhalb der
`items`-Liste streamen und das Blatt öffnen, während es noch wächst: genau die drei Fallen
von #220, versetzt auf den Blatt-Pfad, wo zusätzlich die Suche an der Abschrift hängt
(`modules/buddy/lookups.ts`).

**Verdikt: #219 geht so nicht raus.** Die Umdrehung ist harmlos, bringt aber 0 s, kostet eine
Prompt-Version und trägt ein Qualitätsrisiko, das diese Stichprobe nur grob begrenzt. Der
Code ist zurückgedreht; was bleibt, ist diese Messung. Die zwei Blätter hier sind klein (245
und 381 Zeichen Abschrift) — auf einer textlastigen Buchseite wäre der Anteil größer; das
Argument „Reihenfolge ohne Streaming = 0 s" hängt davon nicht ab.

**Nebenbefund für später:** `moreRules` lässt jede Folge-Lesung desselben Blattes die
Abschrift komplett neu schreiben („extracted_text: the same faithful transcription as
before"). Bei einer 50er-Vokabelliste sind das vier Abschriften statt einer — echte,
messbare Verschwendung, und etwas anderes als das, was #219 vorschlägt.

### #220 — Übung starten: 6,45 s → 3,90 s (median, am Endpoint)

| Lauf                   | min        | median     | max        | Fragen in der Antwort |
| ---------------------- | ---------- | ---------- | ---------- | --------------------- |
| vorher (ein Stück)     | 6,27 s     | 6,45 s     | 7,03 s     | 10 / 8 / 8            |
| nachher (erste Fragen) | **3,13 s** | **3,90 s** | **4,87 s** | 3 / 3 / 3             |

Modellseite, vorher: `explain` 6,42 s median, **1 432 Ausgabe-Tokens, 0 Denk-Tokens** —
reine Schreibzeit bei den dokumentierten 250–300 Tokens/s
(`docs/decisions/prefix-cache-2026-10-01.md`). Nachher: derselbe **eine** Aufruf, 7,36 s
median, 1 376 Tokens; sie wartet nur nicht mehr darauf.

**Ein Aufruf, nicht zwei.** Der Satz wird gestreamt und nach den ersten drei fertigen Fragen
aufgeschnitten (`apps/api/src/llm/partial.ts` `answerUpTo`), mit demselben zod-Schema
geprüft wie die fertige Antwort. Zwei Aufrufe hätten den zweiten erzählen müssen, was der
erste geschrieben hat, und den ganzen Systemprompt nochmal bezahlt (5 102 Eingabe-Tokens) —
und hätten das Dubletten-Problem erst erzeugt, das #220 Falle 3 nennt. Die gemessenen Kosten
des Inhalts-Evals bleiben entsprechend gleich: 5,01 ct vorher, 5,05 ct nachher.

Ehrlich dazu: **die 1,5–2 s der Abnahme werden nicht erreicht.** Drei Fragen sind ~460 der
1 376 Tokens, dazu der Sockel von ~1 s und die Felder vor den Fragen — ~3 s ist der Boden für
drei. Unter 2 s käme man nur mit EINER ersten Frage, und dann wäre „wird noch vorbereitet"
der Normalfall statt der Ausnahme. Zweites Nebenergebnis: der **ganze** Satz ist etwa 1 s
später komplett als vorher (Streaming-Overhead) — sie fängt 2,5 s früher an, der Rest
kommt ~1 s später an.

Inhalt, `evals/content` (derselbe Richter, dieselben zwei Blätter, je ein Lauf):

| Stufe               | vorher | nachher   |
| ------------------- | ------ | --------- |
| „mehr davon" (#220) | 14/17  | **17/17** |
| „vom Blatt" (#219)  | 14/14  | 14/14     |

Wall-Clock „Übung starten" im Eval-Lauf: 5,92 s / 6,45 s → **2,91 s / 2,99 s**. Die Sätze
wuchsen von 3 auf 9 bzw. 8 Fragen, jede genau einmal.
**Grenze der Zahl:** 17 geurteilte Fragen pro Lauf und ein Modell bei Temperatur 0,4 — im
Baseline-Lauf waren es 14/17, im nächsten Lauf ohne jede Änderung am `explain`-Pfad 17/17.
Die Stichprobe erkennt einen groben Einbruch, keine feine Verschlechterung.
