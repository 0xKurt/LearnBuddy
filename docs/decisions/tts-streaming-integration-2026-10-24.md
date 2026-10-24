# Progressive speech integration, 24 October 2026

Issues #921 and #893; docs/architecture.md §Voice. This supersedes the speech default in
`openai-model-choice-2026-10-24.md`; its other model decisions and quality gaps still apply.

The default is `tts-1`, the available EU-listed model that emits MP3 compatible with the
existing progressive native and web player. The adapter retains configurable voices/model,
Realtime synthesis, token receipts, cancellation, and the complete-file fallback.

## Live comparison

Two sequential rounds on the configured EU endpoint, no retries, the same 45-character German
sentence, a new Realtime session per call, at most 256 output tokens and 15 seconds per request.
Measured from request start to the first nonempty MP3 chunk or nonzero PCM chunk. These are
provider audio-payload times, not acoustic speaker onset or a statistically robust ranking.

| Model                   | First audio, round 1 | Round 2 | Playback compatibility                            |
| ----------------------- | -------------------: | ------: | ------------------------------------------------- |
| `gpt-realtime-2.1-mini` |              2042 ms |  798 ms | PCM; current adapter/player requires complete WAV |
| `gpt-4o-tts`            |                  404 |     404 | `model_not_found`; no audio                       |
| `tts-1`                 |              2467 ms | 2031 ms | Progressive MP3                                   |

Realtime was faster at raw audio delivery; it is not the fastest proven playable stream in
this implementation. Choosing it as default would keep the full-file wait. Its optional path
preserves the fixed calm, clear, child-appropriate read-aloud instruction. `tts-1` does not
support instructions; existing voices, locale handling and rate controls are preserved.
No new codec or native dependency is introduced during this integration.

EU listing and endpoint distinction were checked against the official
[data controls](https://developers.openai.com/api/docs/guides/your-data) and
[speech guide](https://developers.openai.com/api/docs/guides/text-to-speech).
The speech guide lists `tts-1` retirement on 6 January 2027; migration to a progressively
playable Realtime path is therefore required before that date. No broad voice-quality or
child-voice comparison was repeated. The one-second audible target remains unproven.

Six calls cost at most $0.005611 at listed rates with the Realtime EU uplift and without
assuming cached-token discounts (two rejected model calls produced no audio). The budget
ledger records the initial $0.20 reservation and its reconciliation; task ceiling $0.30.

## Merged API → browser playback

The existing `apps/api/evals/tts/stream.ts` benchmark ran after integration using the real EU
provider, isolated databases on the shared Postgres and Chromium's MP3 MediaSource decoder.

| Request             | HTTP first byte | Browser `playing` | Server first audio |
| ------------------- | --------------: | ----------------: | -----------------: |
| Uncached sentence 1 |         1813 ms |           1910 ms |            1804 ms |
| Uncached sentence 2 |         1437 ms |           1449 ms |            1431 ms |
| Cached repeat       |            4 ms |              6 ms |               1 ms |

Two additional provider calls cost $0.001170, recorded by the benchmark in the ledger.
Total integration live cost ceiling: **$0.006781**, below $0.30. The browser and test server
closed after the run. This confirms the transport/decoder path, not a full-screen walkthrough,
native device behavior or acoustic onset. No native build or production write was performed.
