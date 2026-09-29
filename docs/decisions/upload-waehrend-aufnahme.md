# Entscheidungsnotiz: Upload während der Aufnahme — kein WebSocket

Anlass: Issue #28 ([P3], Quelle: Latenz-Research 28.09.2026, „nach den übrigen Latenz-Hebeln").
Stand: 29.09.2026, nach dem Merge von #19 (Diktat ohne Zeitlimit, Stück-Upload während des
Sprechens). Alle Zahlen zum Ist-Zustand stammen aus dem Repo (Quelle jeweils dabei);
Upload-Dauern sind **gerechnet, nicht am Gerät gemessen** — eine Mobilfunk-Messung fehlt
weiterhin (wie schon in `docs/speed-audit.md` §Layout und Upload vermerkt, #37).

**Ergebnis in einem Satz:** Ein WebSocket würde die Stücke zu exakt denselben Zeitpunkten
erhalten wie HTTP heute, weil der Engpass client-seitig liegt (der Recorder liefert während
der Aufnahme keine Bytes) — gebaut wurde stattdessen der Hebel, der die Restlatenz wirklich
bestimmt: das letzte Stück klein machen (Soft-Bound 90 s → 15 s) und ein beweisbar stummes
Endstück gar nicht erst hochladen.

---

## 1. Ist-Zustand nach #19 — und was die Issue-Prämisse übersehen hat

Ein Diktat auf dem Aufnahme-Pfad rollt an echten Pausen (≥ 700 ms unter Raumpegel) in Stücke;
jedes fertige Stück geht als eigener `POST /voice/transcribe` hoch, während sie weiterspricht
(`apps/mobile/lib/speech/record.ts`, `dictation.ts`). Der Streaming-Rückweg existiert:
`/voice/transcribe` schreibt die Wörter als SSE-`progress` mit, während das Modell noch hört
(Issue #9, `transcribe-stream.int.test.ts`).

Die Issue-Prämisse „Segmente laden ohnehin während des Sprechens hoch" galt aber nur für
lange Diktate: geschnitten wurde erst **ab ~90 s** (`DICTATION_CHUNK.softMs`, Stand vor
dieser Änderung). Ein Diktat von 20–90 Sekunden — der häufige Fall: eine Nachricht, eine
längere Antwort — war **ein** Stück, und das lud **komplett erst nach dem Stopp-Tipp** hoch.
Genau dieser Upload plus die Transkription ist die Wartezeit, die das Issue meint.

## 2. Rechnung: wo die Restlatenz nach dem Stopp-Tipp steckt

Bausteine (Quellen):

- **Audio:** 48 kbit/s AAC mono (`record.ts`) ≈ 6 KB/s roh ≈ 8 000 Base64-Zeichen/s
  (`dictation.test.ts`); die realen Fixtures liegen darunter (73 KB/10 s, 295 KB/66 s,
  852 KB/206 s — `docs/speed-audit.md`), die Rechnung nimmt den Nominalwert, ist also eher zu
  pessimistisch.
- **Endpunkt-Wall-Clock** (in-process, ohne Netz): 1,33–2,73 s, **skaliert praktisch nicht
  mit der Cliplänge** (206-s-Clip: 2,32 s) — `docs/speed-audit.md` §Endpoint wall-clock.
  Der Vercel-Weg kommt am Handy dazu.
- **Upload** = Base64-Größe ÷ Uplink (gerechnet):

| Stücklänge | Base64  | 1 Mbit/s (schlechtes Schul-WLAN) | 5 Mbit/s (LTE-Uplink) | 20 Mbit/s |
| ---------- | ------- | -------------------------------- | --------------------- | --------- |
| 15 s       | ~120 KB | ~1,0 s                           | ~0,2 s                | ~0,05 s   |
| 30 s       | ~240 KB | ~1,9 s                           | ~0,4 s                | ~0,10 s   |
| 60 s       | ~480 KB | ~3,8 s                           | ~0,8 s                | ~0,19 s   |
| 90 s       | ~720 KB | ~5,8 s                           | ~1,2 s                | ~0,29 s   |

Restlatenz nach dem Stopp-Tipp am Beispiel eines 60-s-Diktats (Modell/Endpunkt ~2 s überall
gleich, Finalisieren/Base64-Lesen am Gerät ungemessen):

| Variante                                         | bei 1 Mbit/s | bei 5 Mbit/s |
| ------------------------------------------------ | ------------ | ------------ |
| vorher (Soft-Bound 90 s: alles nach dem Tipp)    | ~6 s         | ~3 s         |
| **jetzt** (Soft-Bound 15 s, letztes Stück ≲15 s) | ~3 s         | ~2,3 s       |
| jetzt, Tipp nach einer Sprechpause (Normalfall)  | ~2 s¹        | ~2 s¹        |
| WebSocket (hypothetisch, Bytes lägen schon da)   | ~2 s         | ~2 s         |

¹ Der Schnitt fiel ~0,7 s nach ihrem letzten Wort; das Endstück ist dann beweisbar stumm und
wird nicht hochgeladen — es bleibt der Ausklang der bereits laufenden Transkription.

**Der WebSocket-Rest gegenüber dem Gebauten ist der Upload eines kleinen letzten Stücks:
~0,3–1 s bei 1 Mbit/s, ~0,1–0,2 s sonst.** Und selbst den würde ein WebSocket nur einlösen,
wenn die Bytes während der Aufnahme flössen — siehe 3.

## 3. Warum ein WebSocket hier nichts einlöst

**Der Engpass ist der Client, nicht der Transport.** expo-audio liefert auf diesem Build
keine Bytes, solange die Aufnahme läuft; die Datei ist erst nach `recorder.stop()` lesbar —
deshalb existiert der Rollover-Trick überhaupt (`dictation.ts` Kopfkommentar; Issue #19:
PCM-Stream = „native Runde!", verschoben nach #36). Ein WebSocket bekäme die Stücke also zu
**denselben Zeitpunkten** wie die POSTs heute und spart nur Request-Overhead
(Größenordnung ein Roundtrip pro Stück).

Die Transportoptionen auf den vier Achsen (Owner-Regel):

| Option                           | Speed                                                                                          | Qualität                                   | Kosten                                                                                                                                                                           | Anwendungsfall                                                                                     |
| -------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| **Chunked HTTP (heute)**         | Rest ≈ letztes Stück + Modell; mit kleinem Stück ~2–3 s                                        | unverändert; SSE-Fortschritt je Stück (#9) | 0 € neu                                                                                                                                                                          | trägt Diktat jeder Länge; stateless, Stück-Retry sicher                                            |
| **WebSocket (Hono/`ws`)**        | −0,1…−1 s gegenüber kleinem letzten Stück — nur falls Bytes flössen, was der Client nicht kann | keine Änderung am Gehörten                 | 0 € Verbrauch, aber neue Serverfläche: laut Issue-Research (28.09., nicht neu geprüft) Vercel-Beta auf Fluid, Ende an `maxDuration` → Reconnect-Logik, Verbindungs-/Auth-Zustand | löst das falsche Problem: der Client hat mid-Aufnahme nichts zu senden                             |
| **„SSE-Duplex"**                 | —                                                                                              | —                                          | —                                                                                                                                                                                | gibt es nicht: SSE ist Server→Client; der Rückkanal wäre wieder ein POST je Stück = heutiger Stand |
| **Ein POST mit wachsendem Body** | wie WebSocket                                                                                  | —                                          | Endpunkt verlöre seine Stateless-Retry-Eigenschaft                                                                                                                               | gleiche Client-Blockade                                                                            |

## 4. Was stattdessen gebaut wurde (dieser Change)

1. **`DICTATION_CHUNK.softMs` 90 s → 15 s** (`lib/speech/dictation.ts`): geschnitten wird
   weiterhin nur an echten Pausen (≥ 700 ms), aber schon ab 15 s Stücklänge. Beim Stopp-Tipp
   ist damit fast alles schon hochgeladen; das letzte Stück ist klein. Nicht kleiner, weil
   jeder Schnitt einen Recorder-Neustart (kurze Lücke, die die Pause schlucken muss) und
   einen Modellaufruf kostet.
2. **Beweisbar stumme Endstücke werden nicht hochgeladen** (`SpeechMark` in `dictation.ts`,
   unit-getestet; Verdrahtung `record.ts` → `useVoiceInput.ts`): tippt sie nach einer
   Sprechpause auf Stopp, ist das Endstück nur die Stille zwischen Schnitt und Tipp — es
   kostete sonst einen Modellaufruf, hinter dem der fertige Text warten müsste. Stumm zählt
   nur, was das Metering **belegt**: es lieferte echte Werte für dieses Stück, keiner
   erreichte Sprechpegel, und ein früheres Stück desselben Diktats hat sie nachweislich
   gehört — ein Metering, das sie nie hören konnte (Browser ohne Metering, hängender Pegel),
   kann so nie ihre Worte wegwerfen.

**Kosten des Hebels:** je zusätzlicher Naht ein `transcribe`-Aufruf mehr (tier smart; fester
Prompt-Anteil ~1 000 Input- + ~82 Output-Tokens ≈ **~0,1 ct je Naht**, abgeleitet aus
`docs/speed-audit.md` §Modellseite und `llm/pricing.ts`). Ein 60-s-Diktat: ~3 statt 1 Aufruf
(+~0,2 ct); ein 3-min-Diktat: ~9 statt 2–3 (+~0,7 ct). Die Budgets tragen das unverändert
(600/h, 400/Tag; Rechnung in `docs/architecture.md` §Limits aktualisiert). Für diese Notiz
liefen keine Modellaufrufe (0 €); alle Zahlen sind zitiert oder gerechnet.

**Qualitäts-Vorbehalt (ehrlich):** Der Naht-Mechanismus (prev_tail, Schnitt in der Pause) ist
unverändert, aber er greift jetzt alle ≥ 15 s statt alle ≥ 90 s. Die Naht-Qualität am echten
Gerät ist **weiterhin ungemessen** (`docs/architecture.md` §Voice, #19-Abschluss) — dieser
Messvorbehalt gilt jetzt für mehr Nähte. Auch die Rollover-Lücke (Recorder-Neustart in der
Pause) ist nur am Gerät bezifferbar.

## 5. Wann neu bewerten — und wo der PCM-Stream andockt

Erst mit **#19/#28 auf PCM-Basis** (PCM-Stream + VAD, das volle #19-Design): dann existieren
Bytes während der Aufnahme, und der Transport dafür (WebSocket oder chunked POST) ist eine
Folgeentscheidung mit echtem Gewinn — dem Wegfall auch des letzten kleinen Uploads. Vorher ist
jede WebSocket-Arbeit auf Vercel Aufwand ohne einlösbaren Speed.

### Vorbereitet in der nativen Runde (#36), bewusst nicht mehr

Damit der Dev-Client dafür nicht noch einmal neu muss, liegt das Modul seit #36 in der App —
**nur die Abhängigkeit und das Konfig-Plugin, keine Zeile VAD.** Ein halb verdrahteter
Sprachpfad wäre genau der Stub, den CLAUDE.md Regel 12 verbietet; heute importiert kein
App-Code `react-native-audio-api`, und am Aufnahmeweg (`record.ts`, `dictation.ts`) ist nichts
geändert.

**Gewählt: `react-native-audio-api` (Software Mansion), gepinnt auf `~0.12.2`.**

| Achse             | Befund (29.09.2026, geprüft an npm + Doku, **nicht am Gerät**)                                                                                                                                                                                                        |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Anwendungsfall    | `AudioRecorder.onAudioReady({ sampleRate, bufferLength, channelCount }, ({ buffer, numFrames, when }) => …)` liefert rohes PCM (Float −1…1) **während** der Aufnahme — genau die Bytes, die expo-audio auf diesem Build nicht herausgibt (§3)                         |
| Qualität / Pflege | Software Mansion (Reanimated, Gesture Handler), aktiv gepflegt, offizielles Expo-Config-Plugin; die Alternativen sind tot oder schmal: `react-native-live-audio-stream` zuletzt 2022, `expo-audio-stream` 2024, `@siteed/expo-audio-studio` Einzelmaintainer, 06/2026 |
| Kompatibilität    | Die Versionstabelle der Doku führt **0.12.x für RN 0.76–0.85** (New Architecture) — RN 0.81.5 dieses Builds liegt darin. 0.13.x ist dort **nicht** geführt, baut gegen RN 0.87 und fordert `react-native-worklets ≥ 0.7`, während Expo SDK 54 auf 0.5.1 pinnt         |
| Kosten            | 0 € Verbrauch; Preis ist Build-Größe (das Paket bringt FFmpeg mit — `disableFFmpeg: true` im Plugin wäre der Hebel, bewusst **nicht** gesetzt, weil hier kein Build verifiziert werden kann) und ein Dev-Client-Rebuild, der in #36 ohnehin ansteht                   |

Der Worklets-Peer (`≥ 0.6`) ist beim Paket als _optional_ deklariert und betrifft nur
`WorkletNode`; für `AudioRecorder` wird er nicht gebraucht. Expos 0.5.1 ist deshalb in
`pnpm-workspace.yaml` ausdrücklich erlaubt, statt Expos Pin anzufassen.

**Anschlusspunkt, wenn #19/#28 weitergeht:** `apps/mobile/lib/speech/record.ts` ist die einzige
Stelle, die heute einen Recorder startet, stoppt und die fertige Datei als Base64 an
`/voice/transcribe` gibt; `dictation.ts` entscheidet (rein und unit-getestet) über Schnitte an
Sprechpausen und über beweisbar stumme Endstücke. Ein PCM-Pfad ersetzt in `record.ts` die
Datei-Quelle durch `onAudioReady` und füttert dieselbe Pausenlogik mit echten Pegeln statt
Metering-Stichproben — die Entscheidungen in `dictation.ts` bleiben, nur ihre Eingabe wird
feiner. Erst wenn dort Bytes fließen, wird der Transport (WebSocket vs. chunked POST) wieder
eine offene Frage; vorher nicht (§3).

**Ungeprüft:** Weder Recorder noch Plugin sind je auf einem Gerät gelaufen — die Wahl stützt
sich auf die Kompatibilitätstabelle und die API-Doku, nicht auf eine Messung.

### Abnahmekriterien aus Issue #28

- [x] Entscheidung dokumentiert (Chunking macht den WebSocket überflüssig — mit der Korrektur,
      dass das erst seit dem kleinen Soft-Bound dieser Änderung wirklich stimmt) **und**
      der verbleibende schlanke Hebel umgesetzt (Rechnung oben; Gerätemessung am Mobilfunk
      steht aus, #37).

## Quellen

Repo (Stand 29.09.2026): `apps/mobile/lib/speech/dictation.ts` · `record.ts` ·
`components/voice/useVoiceInput.ts` · `apps/api/src/modules/voice/routes.ts`, `service.ts`
(SSE-Streaming, tier smart) · `apps/api/src/__tests__/transcribe-stream.int.test.ts` ·
`apps/api/src/http/limits.ts`, `src/config.ts` (Budgets 600/h, 400/Tag) ·
`docs/speed-audit.md` (Baseline 28.09.2026) · `docs/architecture.md` §Voice, §Limits ·
Issue #19 (Abschlusskommentar) · Issue #28 (Research-Notiz zu Vercel-WebSockets, 28.09.2026 —
nicht neu verifiziert, für die Entscheidung unerheblich).

Zu §5 (29.09.2026): `docs.swmansion.com/react-native-audio-api` — Kompatibilitätstabelle
(0.12.x ↔ RN 0.76–0.85), `AudioRecorder`/`onAudioReady`, Seite „Audio API Expo plugin" ·
npm-Manifeste `react-native-audio-api@0.12.2` / `@0.13.6` (Peers, devDependency RN 0.85 bzw.
0.87) · `expo/bundledNativeModules.json` des installierten SDK 54 · Issue
software-mansion/react-native-audio-api#809 (Expo 54 / RN 0.81.5; vom Melder als
Emulator-Problem geschlossen, kein Bibliotheksfehler).
