# EU speech latency — 2026-10-24 (#926)

Status: owner accepted approximately 680 ms on native Android at 16:12 Berlin; latency optimisation stopped. The original 600 ms target is not achieved on native.
The new model remains opt-in; the production default is unchanged. Issue #926 stays open.
Owner, 24 October: “2 s warten ist ein komplettes No-Go. Recherchiere online … finde raus,
wie wir das Problem lösen. Vernünftig lösen ohne Pfusch.”

## Decision

Use a bounded, learner-scoped persistent Realtime connection with **gpt-realtime-1.5**,
explicit read-aloud instructions, no tools, no conversation history and tracing disabled.
It is the measured non-reasoning option. Configure it through the existing SpeechGateway;
retain tts-1 and the existing model as operator choices. Prewarm during the wait for text;
stream PCM16 into a scheduled audio queue on both platforms. Preserve the authenticated
speech route, learner cache, cost accounting and existing stop/barge-in paths.

This is a measured architectural choice, not a claim that the product target is achieved.
The Mac-to-provider warm median is 438 ms; 162 ms remain for our authenticated route,
transport, initial silence and device playback. Fresh connection median is 809 ms.
Instance churn can still cause a cold connection: an in-process pool cannot promise session
identity across serverless instances. No hosting or production configuration was changed.

Why not the fastest measured mini model? Its minimum supported reasoning effort is
`minimal`, not `none`; receipts still contain reasoning tokens. The task explicitly asks
for TTS without model reasoning. The existing prompt also produced two completely different
answers; the stronger instruction fixes those samples, but a generative read-aloud model
still requires fidelity checks. gpt-realtime-1.5 is documented as non-reasoning and has better
independent transcription agreement here. It costs more; usage comes from provider receipts.

## Measurements

Mac, Node 22.23.3, EU project, eu.api.openai.com, 24 October 2026. Five different synthetic
German sentences (questions and imperatives), same set for each condition; n=5 per cell.
Cold HTTP sends Connection: close, warm uses Node fetch pooling. This controls connection
reuse, not provider caches or DNS/TLS session resumption; those were not purged. Realtime
cold opens/configures a new socket; warm reuses the fifth cold socket and uses
`conversation: none` per response. Each synthesis is independently transcribed without an
expected-text hint. No child data, no Google calls. Sequential requests, machine test lock.

First byte means first nonempty decoded audio payload, never HTTP headers or an SSE event.
Playable means 20 ms PCM (960 bytes at 24 kHz mono PCM16) or the first MP3 samples actually
decoded by the installed @audio/decode. These are **not speaker-onset measurements**.
Full audio is the completion boundary of the old buffered WAV/MP3 path, excluding app work.
Median is the middle observation; p90 is nearest rank (the maximum at n=5).
| Option | Connection | n | First byte median/p90 | Playable median/p90 | Full audio median/p90 |
|---|---|---:|---:|---:|---:|
| baseline tts-1-mp3 | cold | 5 | 1386/2991 ms | 1386/2993 ms | 1527/3103 ms |
| baseline tts-1-mp3 | warm | 5 | 1375/3146 ms | 1376/3147 ms | 1487/3268 ms |
| baseline tts-1-pcm | cold | 5 | 1416/1458 ms | 1416/1458 ms | 1545/1795 ms |
| baseline tts-1-pcm | warm | 5 | 1457/2901 ms | 1457/2901 ms | 1583/3012 ms |
| baseline realtime | cold | 5 | 747/1919 ms | 747/1919 ms | 1402/2112 ms |
| baseline realtime | warm | 5 | 410/566 ms | 410/566 ms | 641/739 ms |
| verbatim realtime | cold | 5 | 715/799 ms | 715/799 ms | 963/1065 ms |
| verbatim realtime | warm | 5 | 392/392 ms | 392/392 ms | 617/662 ms |
| nonreasoning realtime | cold | 5 | 809/865 ms | 809/865 ms | 1120/1593 ms |
| nonreasoning realtime | warm | 5 | 438/528 ms | 438/528 ms | 922/1221 ms |
Baseline Realtime = current read-aloud prompt, mini, minimal reasoning. Verbatim = explicit
TTS role and a read-aloud wrapper on the text, mini, minimal reasoning. Nonreasoning = same
explicit TTS prompt, gpt-realtime-1.5, no reasoning parameter.

### Fidelity and cost

The baseline mini answered “Es gibt nichts zu lesen.” instead of reading the supplied
imperative; another run gave a longer refusal. Both were confirmed by three independent
transcribers. That is a real failure, not latency noise. Never count these as successful TTS.

Initial back-transcription agreement: tts-1 18/20; baseline mini 4/10; explicit mini 6/10;
nonreasoning 8/10. Secondary whisper-1 and gpt-4o-transcribe ran on all mismatches, without
hints. whisper-1 agreed exactly (ignoring case, punctuation and whitespace) on all 10
nonreasoning samples; gpt-4o-transcribe still disagreed on one imperative. Explicit mini
has two repeated Was/Das disagreements between recognizers. This is evidence, not proof
of arbitrary-text fidelity; human acoustic review and broader multilingual/adversarial
coverage remain open. Never silently relabel a paraphrase as a match.

50 syntheses + 50 initial back-transcriptions: $0.101048 list-price/receipt estimate (EU
Realtime uplift and no cache discount). 26 secondary transcriptions reserved <=$0.10;
Implemented-gateway validation reserved <=$0.10 (five syntheses plus whisper-1).
Transport/device batches and their receipts are recorded below; the total remains below the $1 task cap. Reservations and completion are in the
machine budget ledger. Raw JSONL includes each timing, text, transcript and usage receipt;
no keys or authorization headers. Saved synthetic audio stays in the ignored local cache.

## Research (official sources opened 2026-10-24)

- [Data controls](https://developers.openai.com/api/docs/guides/your-data): EU processing and
  storage list tts-1, gpt-4o-tts, whisper-1, the two 4o transcribers, gpt-realtime-1.5 and
  gpt-realtime-2.1-mini. gpt-4o-mini-tts is absent; endpoint success is not eligibility.
  Realtime tracing is not EU-residency compliant. Regional hostname alone is insufficient;
  the owner confirms this project's residency. No claim of an independently verified ZDR approval.
- [Speech guide](https://developers.openai.com/api/docs/guides/text-to-speech) and
  [Speech request](https://developers.openai.com/api/reference/resources/audio/subresources/speech/methods/create):
  chunked binary audio, PCM/WAV recommended for latency; PCM is 24 kHz signed little-endian
  16-bit without a header. `stream_format: audio` is distinct from `response_format: pcm`;
  SSE is unsupported on tts-1. Opus is a Speech container choice, not arbitrary PCM bytes.
  The guide announces tts-1 and mini-tts shutdown on 2027-01-06. gpt-4o-tts is listed for
  residency but the owner measured 404; availability and eligibility differ.
- [Realtime WebSocket](https://developers.openai.com/api/docs/guides/voice-websockets?voice-api=realtime):
  server-side sockets use the server key; audio arrives as base64 deltas. Keep one connection
  rather than repeating TLS/session setup. The Realtime schema supports PCM/PCMU/PCMA;
  do not assume an Opus output-format switch on the WebSocket API.
- [WebRTC](https://developers.openai.com/api/docs/guides/voice-webrtc?voice-api=realtime) and
  [client secrets](https://developers.openai.com/api/reference/resources/realtime/subresources/client_secrets/methods/create):
  server-minted ephemeral credentials permit browser media; normal API keys never go to
  clients. Browser WebRTC handles media transport and jitter. Token expiry is not a hard
  spending limit, and the client can configure its session. Direct client sessions would
  require server-side control/receipts and an EU-specific handshake verification. They
  bypass our current enforced speech seam, so are not the implementation chosen here.
- [Realtime conversations](https://developers.openai.com/api/docs/guides/realtime-conversations):
  disable VAD, send bounded explicit responses, use out-of-band empty-history input, cancel
  generated output on interruption. Voice cannot change after output in a session, so
  connection reuse must partition by voice and speech settings.
- [Prompting](https://developers.openai.com/api/docs/guides/voice-prompting),
  [1.5 model](https://developers.openai.com/api/docs/models/gpt-realtime-1.5),
  [2.1 mini model](https://developers.openai.com/api/docs/models/gpt-realtime-2.1-mini):
  1.5 is non-reasoning; 2.x minimum reasoning effort is minimal. A read-aloud prompt is an
  instruction to a generative model, not a deterministic transcription guarantee.
- [Latency guide](https://developers.openai.com/api/docs/guides/latency-optimization): stream
  and pipeline independent stages. Speech can start at a complete clause while the reply
  is still growing. This moves sentence-availability earlier, but cannot erase provider time.
- [Pipecat TTS](https://reference-server.pipecat.ai/en/stable/api/pipecat.services.tts_service.html)
  exposes sentence/token aggregation and interruptible synthesis;
  [LiveKit audio](https://docs.livekit.io/agents/multimodality/audio/) accepts streamed text
  for speech. These are production framework patterns, not evidence that this project's EU
  provider hits 600 ms. Connection prewarm, overlapping work and progressive playback are
  applicable without adopting a second orchestration system.

Keep the application server near the EU provider and database, reuse HTTP connections and
avoid another proxy hop. Region placement is a recommendation to measure, not a deployment
change or an asserted saving. A warm cache removes synthesis for repeats, never for new text.

## Library check

Reuse installed react-native-audio-api ~0.12.2 (MIT, Software Mansion, already licensed in
apps/mobile/lib/licences.json), with shared createBuffer/createBufferSource scheduling.
[Its documentation](https://docs.swmansion.com/react-native-audio-api/docs/fundamentals/getting-started/)
confirms Android/iOS and web support; the installed source confirms the version's interfaces.
No dependency/version/native build change. Avoid its native-only queue node: scheduled
AudioBufferSourceNodes work on both platforms. Reuse expo/fetch for streaming on native,
normal fetch on web, existing speech controls/read-along/accessibility; no new visible UI.
Bundle impact is checked by the existing bundle smoke/budget gates.

## Implemented transport and device evidence

The actual gateway (same production instruction, not just the exploratory prompt) was
prewarmed in 848 ms, then produced first audio in 527/487/423/447/477 ms: median 477 ms,
p90 527 ms. All five WAV recordings matched whisper-1 back-transcription, without hints.
Synthesis receipts total $0.024126, included in the <=$0.10 validation reservation.

The authenticated API, isolated shared Postgres, EU gateway and PCM queue were then timed
from the local Mac server. Desktop and POCO Chrome used the real queue with Web Audio;
native used the actual `pcmPlayer` in the already-installed development app. No APK build
or installation. Phone transport was USB `adb reverse`, not production Wi-Fi/mobile radio.
A 256-sample analyser, polled every 5 ms, detects the first rendered sample above 0.005.
Browser output was muted after the analyser; native was connected to the output. This is
**render onset**, not a microphone measurement of physical speaker onset. The timer starts
with the full sentence available, before the authenticated speech fetch. Prewarm is excluded
and reported separately. Native instrumentation temporarily replaced the entry and restored it.

| Path, n=5 each                | Prewarm | First rendered median/p90 | Under 600 ms | Synthesis receipts |
| ----------------------------- | ------: | ------------------------: | -----------: | -----------------: |
| Desktop Chromium, warm        |  339 ms |                537/652 ms |          4/5 |          $0.024426 |
| POCO X3 Chrome, warm          |  575 ms |                547/822 ms |          4/5 |          $0.024110 |
| POCO X3 native, warm, POST    |  446 ms |                683/718 ms |          0/5 |          $0.023194 |
| POCO X3 native, repeated POST |  649 ms |                647/777 ms |          1/5 |          $0.023141 |

The repeated native run unintentionally reused the old Metro bundle (port conflict); its
POST results are retained, labelled, and are not presented as GET/app-transport evidence.
The process was stopped before the subsequent fresh-bundle measurement. Native rendering
adds time beyond the provider; its HTTP-header arrival was 56–102 ms after the server's
first chunk in these local runs. Provider leading silence is another real contributor:
the earlier warm 1.5 recordings contain 13–475 ms before a sample exceeds 0.005. Do not
trim quiet speech or play a chime to manufacture a better "first sound" metric.

Raw timings, synthetic texts, transcripts and receipts: [measurement records](../measurements/tts-latency-2026-10-24/).
No keys, audio or child data are committed. Benchmark programs are under `apps/api/evals/media/`.
Run with Node 22, the shared test database, `. scripts/test-lock.sh`, approved EU environment,
and an explicit output directory/live opt-in. For native, run `tts-playback.ts` with
`TTS_DEVICE=native`, use the saved measurement entry in the existing dev client with local
ports 8137/8937, and restore the real entry/remove reverse mappings/stop Metro afterwards.

## Implementation and operational bounds

- `SpeechGateway.prepare` is optional and provider-neutral. The authenticated preparation
  route resolves learner voice/rate and consumes the existing per-account speech allowance.
  It creates no generated response. Growing replies prewarm the connection and audio context.
- The pool is process-local, at most 64 connections, keyed by server-resolved learner, voice,
  locale and rate. It expires after 30 seconds idle or five minutes of reuse; queued requests
  serialize per connection. There is no model conversation history, tools or tracing. Learner
  ids are local keys and are never sent to the provider. Disconnects are not retried blindly.
- PCM is negotiated explicitly; old clients receive complete WAV. tts-1 supports PCM binary
  streaming too. Completed audio still uses the existing learner-scoped 24-hour cache and
  fixed voice-preview shared cache. New text never enters a cross-learner cache.
- The shared queue handles odd byte boundaries, progressive playback, preload, underruns,
  EOF, bounded memory, failed streams and stop. Native uses installed expo/fetch; web uses
  fetch. The same installed audio library schedules PCM buffers, with existing UI/fallback.
  Stop/barge-in closes transport and provider work. Idle audio contexts suspend.
- Only the first complete clause can be emitted before the sentence is complete. The cursor
  preserves sentence indices and does not repeat that prefix; unfinished formulas wait.
- Provider completion transcripts must match the supplied words before caching. **This check
  happens after streaming has begun and cannot retract spoken audio.** It prevents cache
  poisoning, not arbitrary generative paraphrase. Instruction plus five matching recordings
  is not a deterministic fidelity guarantee; the model remains opt-in for that reason too.
- Usage receipts price audio/text tokens separately with a conservative EU uplift, without
  guessing cached discounts. Completed refusals retain paid usage. A connection closed before
  a final receipt has unknown provider spend; existing call accounting cannot reconstruct it.

## Acceptance and remaining work

Desktop and Android Chrome meet the typical rendered-onset target in this small local sample;
native Android and the tail do not. Early clause overlap is implemented and tested, but its
saving against a live streamed Buddy reply was not measured. No production configuration,
region or infrastructure was changed; a production EU-hosted/mobile-network trial is still
needed. Serverless pool affinity and cold starts remain unresolved deployment constraints.
Do not activate the new model by default or close #926 based on these results alone.
Physical speaker onset, release-build timing, iOS, multilingual/adversarial audio fidelity,
and provider billing after mid-response cancellation remain unverified.

Red→green: an opening-clause test failed on the original implementation (no part emitted);
a stalled-consumer cancellation test timed out before the fix and now rejects with its paid
receipt. Changed API tests: 49 passing; changed mobile tests: 23 passing. Browser specs
`talk-voice.spec.ts` and `tts-pcm.spec.ts` pass; PCM renders before EOF and interruption cancels
its fetch. Conversation screenshots at 390×844/360×740, light/dark, were visually inspected.
No clipped controls, duplicate actions or new visual patterns. Hooks supply the full-suite gate.

## Owner acceptance and native sample-rate correction, 16:12 Berlin

Owner: “0.68 s ist gut. Scheiß auf die 80 ms.” No further latency optimisation or live
provider spending is required. The reported 683/718 ms native median/p90 remains the
measurement; it predates the sample-rate correction and is not a post-fix device claim.

The installed react-native-audio-api 0.12.2 native AudioBufferBaseSourceNode computes
playback rate from playbackRate × detune without the buffer/context sample-rate ratio.
Unlike browser Web Audio, 24,000 frames therefore play in 0.5 s on a 48 kHz context
(0.544 s at 44.1 kHz). Native PCM playback now sets playbackRate to 24000/context.sampleRate;
the provider and buffer remain mono PCM16 at 24 kHz, and browsers keep their automatic
conversion. No custom resampler, dependency upgrade or native build is introduced.

Regression proof: pcmPlayer.test.ts first failed for native 48/44.1 kHz with durations
0.5/0.544 s instead of 1 s, while web passed. With compensation all three pass, together
with all 26 changed mobile speech tests. This test models the installed native processor;
it is not a physical device duration measurement. A fresh owner listening test and
post-fix physical duration/onset measurement remain unverified, tracked by #926.

The last pre-fix GET transport batch is retained as `native-get-invalid.jsonl` ($0.023688),
but excluded from latency summaries: one analyser timestamp (21 ms) precedes HTTP audio
availability (535 ms), so it cannot identify that response's onset. No valid GET latency
claim follows from that batch. The playback benchmark leaves USB attachment to the operator:
check `adb reverse --list`, reverse its local port and forward 9236 to
`localabstract:chrome_devtools_remote`, then remove those mappings when finished.
