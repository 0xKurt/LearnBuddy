# Talk presentation

Based on published Chat #567 (`ca68604e`). The Talk route retains its genuine conversation, speech controller, last-three-message tail, capture/navigation callbacks and protected large Orb/moon. Published Home, Chat, Clearance, undo and voice contracts remain intact.

## Scope and reuse

- `app/talk.tsx`: plain 44 pt close action; centered Orb/status and natural-height, shrinkable conversation scroll area; existing Talk control row. Two text entrances use published `AppearText`, retaining keys, native Text semantics and polite announcements. Active intentional end-follow settles immediately at its requested end on live reduction; future requests become nonanimated.
- `components/voice/MicButton.tsx`, `VoiceRow.tsx`: optional Talk pill and short visible label with unchanged full accessible action; static, stoppable recording; shared live-reduction-aware BusyIndicator while working. Existing Practice center Check, quiet dictation, default circle controls and callbacks remain compatible. Side controls are 52 pt; the main pill is 64 pt.
- `components/lb/InputBar.tsx`: secondary dictation explicitly requests quiet tone; primary/disabled behavior is preserved.
- `lib/theme/talk.ts`: Talk stage, caption, group gap, side and pill geometry. Group spacing derives from existing SPACE. `TYPE.voiceTranscript` reuses body geometry/current font with italic and ink2. Published voiceStatus and all other typography roles remain intact. Disabled opacity uses UI.disabledOpacity.
- `lib/useEndScroll.ts`: extracts published Chat active-end tracking, measured completion and public manual-input interruption without moving domain follow policy. `useThreadFollow.ts` delegates; `HomeThread.tsx` reuses its handlers; Talk keeps its existing layout-instant/content-follow policy. `EndScrollMotion.test.tsx` mounts the actual ScrollView adapter and covers live end settlement exactly once, manual reading, completion, text/action keys and detached refs after unmount. No timer or new scroll engine.
- Five buddy namespaces: existing translated finish action and supplied short interrupt label; the long accessible interrupt action is unchanged.
- VoiceRow, MicButton tone and RecordingMotion tests cover actual callbacks, disabled/busy behavior, primary ownership, static stop, visible versus accessible labels and live busy reduction. RecordingStatus remains owned by Rehearse.
- Browser tests retain actual translated Talk titles and genuine voice callbacks. The matrix checks four appearances at both phone sizes, actual listening/speaking/interruption and Practice voice→keyboard, strict fit/axe/44 pt targets and nonoverlapping side/primary controls. It waits for the real Practice heading before selecting its tool, avoiding a mounted-route navigation race.

No new routes, dependencies, contracts, drawings or server data are introduced. MIC_RING_ROOM and VOICE.disabledOpacity remain compatibility aliases for final cleanup. Standalone RecordingStatus and later shared background work are separate units.

## Verification

Frozen install and actual mobile typecheck passed on this base. The initial integration passed 47 focused tests across nine files; the short-visible-label change passed 21 tests across four affected suites. Scoped lint and diff checks passed. The final Talk/Practice matrix passed 8/8 in 2.0 minutes (24 PNGs). Two genuine offer/live-control cases passed 2/2 in 21.6 seconds; original speech/barge regressions passed 5/5 in 1.2 minutes. The final focused run passed 57 tests across eleven files. After wiring the adapter’s existing scroll throttle, the five mounted adapter and four unchanged Chat follow tests passed 9/9. The settlement regression failed with only its end-settlement command removed, then passed after exact restoration. Translation parity also passes.

The first browser failure selected a mounted hidden waveform during navigation; its screenshot still showed the genuine Practice tool. A separate nonoverlap assertion initially matched both the intentionally tappable Orb and the pill; the final assertion identifies the actual pill by its visible short label. Both failures are preserved rather than treated as source success.

Evidence lives under `learnbuddy-redesign/talk/` in the task visualization directory; source/check logs are `/tmp/learnbuddy-talk-ca686-*` and `/tmp/learnbuddy-talk-center-*`. `centered-first-green` records the first genuine Talk/Practice pass after layout correction.

Native device recording, physical sound and in-flight native scrolling are unverified. The earlier three-turn browser observation had viewport/content 368/368 and no overflow, so it proves no active-scroll cancellation property. Its diagnostic source is external to test discovery. The new genuine long offer has 55 pt overflow at 360 and none at 390. The bounded follow trace observed genuine smooth requests to ends 168/157, but the actual reply shrank the tail to zero before an active media-toggle boundary could be caught; no browser cancellation proof is claimed. The shared tracker now closes that source gap; the mounted adapter substantiates cancellation semantics, while the final genuine 360 pt long-offer/route callback passes 1/1 after extraction. Orb choreography is intentionally preserved.

## Final evidence and file scope

Durable task visualization folders: `talk/matrix-final/web` (24 PNGs), `talk/long-live-final/web` (two long-offer shots and actual tail measurements), `talk/original-final/web` (speech/barge), `talk/follow-final/web` (final 360 pt callback), and `talk/active-follow-before` (external diagnostic source/trace/log; no media-toggle observation). The matrix images precede only the reviewed callback extraction; the final callback screenshot verifies its genuine integration. Failure folders preserve initial navigation/locator and auto-preparation-card assumptions; they are not success evidence.

Logs: `/tmp/learnbuddy-talk-actual-label-matrix.log`, `/tmp/learnbuddy-talk-long-offer-final.log`, `/tmp/learnbuddy-talk-original-browser.log`, `/tmp/learnbuddy-talk-follow-route-final.log`, `/tmp/learnbuddy-talk-final-all-focused.log`, `/tmp/learnbuddy-talk-follow-throttle-final-tests.log`, `/tmp/learnbuddy-talk-end-scroll-red.log`, `/tmp/learnbuddy-talk-final-tsc.log` and `/tmp/learnbuddy-talk-follow-final-lint.log`.

Twenty-six paths: Talk route; InputBar; MicButton/VoiceRow and their three focused test files; HomeThread; EndScrollMotion test; useEndScroll/useThreadFollow; theme type/talk; five buddy namespaces; core-loop-settings/modes/roleplay/talk browser helper/redesign-talk spec; this ledger, central mobile-redesign progress and the existing #548 temporary compatibility grant. The diagnostic is outside discovery. No pending-unit source is copied.

The documented compatibility grant retains exactly the two now-unused MIC_RING_ROOM exports until the user-required dedicated alias cleanup, alongside the published REDUCE aliases. Final cleanup must remove both exports, their two knip signatures and the grant; no permanent exemption is introduced.
