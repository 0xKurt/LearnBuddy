# ADR 0012 — Local acoustic evidence, shared pronunciation verdicts

- Status: Android hybrid activation; device validation outstanding (24.10.2026)
- Date: 2026-10-23
- Issue: #896; native prerequisites #194/#177/#710
- Evidence: [Mac probe and device plan](../measurements/vosk-2026-10-23.md)

## Decision

Use Vosk with expected words, generated confusion candidates and `[unk]` as the primary
checker when a verified native runtime and language pack are available. Preparation supplies
the candidates in structured output; code validates them and the native runtime checks model
vocabulary. A shared contract separates evidence, deterministic verdicts and phrased tips.
Server/web fallback must hear the audio itself through the provider-neutral gateway. Transcript
equality is not pronunciation correctness. Neither checker writes verdicts; shared code does.

Pin `react-native-vosk` 2.1.7 and maintain a narrow bridge patch because the released JS API
discards word confidences. Reuse the existing recorder/decoder and an optional TurboModule
lookup so Expo Go/web remain usable. Download models with explicit states, SHA-256 verification
and bounded extraction. No models in the app or repository, no new learner route. The recorder discloses before recording that uncertainty or native failure sends original
audio through the existing hearing gateway. Cancellation never falls back. Reliable local
results send only evidence; the developer lab remains strictly local.

## Consequences

The synthetic Mac probe demonstrates the grammar effect and very short decoder latency, but
also false positives. Recognition confidence is not a calibrated phonetic score. Android activation therefore uses conservative centrally recorded thresholds and an audio
fallback for every uncertain word/sentence. See [24.10 calibration](../measurements/vosk-2026-10-24.md).
Real POCO X3 and child recordings remain necessary; iOS stays developer-only. The fallback's new evidence prompt also needs a live comparison;
historical model numbers are baselines, not validation of the new prompt. Unknown/omitted
words stay uncertain and cost no attempt. A constrained recognizer cannot provide general
free-speech safeguarding; the independent text safety path remains and its limits stay visible.

Reject system speech recognition as a pronunciation checker: it normalises errors. Sherpa-ONNX
and Whisper wrappers are viable speech tools but their hotword bias is not this tested grammar
constraint; ONNX Runtime alone is not an acoustic recognizer. Revisit these choices from the
same evidence/result interface if learner calibration disproves Vosk's usefulness.
