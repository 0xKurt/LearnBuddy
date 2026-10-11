# Header and Composer migration — step 3

Tracking: #548. This step is built from main in its own worktree and integrates after the theme and base component steps.

## Authorized scope and replacements

The file scope was announced before implementation. These are presentation changes; API contracts, persistence, speech recognition, attachment uploads and retry behavior remain with their current containers.

| Existing owner                                 | Result                                                                                                                                                | Files                                                                                               |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Screen's ad hoc navigation row and chat Header | Pure BuddyHeader: functional leading/trailing controls, clamped title/subtitle, 28/30 orb in its existing 1.85 slot, optional explicit-count Progress | `components/lb/BuddyHeader.tsx`, `Screen.tsx`, `components/buddy/Header.tsx`, `lib/theme/header.ts` |
| InputBar frame assembly                        | Pure Composer reuses the sole LbTextInput; text, optional keys, tools and one primary slot. InputBar retains voice/status/count/density adapter       | `components/lb/Composer.tsx`, `InputBar.tsx`, `LbTextInput.tsx`, `lib/theme/composer.ts`            |
| Chat send/voice/stop controls                  | Same callbacks, attachment/draft handling and stable primary location; tokenized 40pt visible icons with 44pt targets                                 | `components/buddy/Composer.tsx`, `components/voice/TalkButton.tsx`, `MicButton.tsx`                 |
| Typed answer's second check beneath input      | Check action always inside Composer; WritingSheet still receives its own modal check callback                                                         | `components/practice/CheckBar.tsx`                                                                  |
| Board key row outside the bar                  | Keys handed through CheckBar into Composer; board folding still controls visibility                                                                   | `components/practice/AnswerShell.tsx`                                                               |
| Closed question's standalone Next bar          | Next action in the same Composer primary slot                                                                                                         | `components/practice/AnswerArea.tsx`, `CheckBar.tsx`                                                |

| Practice progress in scrolling content and inline flag/dispute | Count subtitle once beneath the title, full-width segmented progress and timed-test clock in shared header footer; existing flag/dispute confirm callback behind functional menu | `app/practice/[id].tsx`, `QuestionProgress.tsx`, `Question.tsx` |

Tests: Composer and CheckBar behavior, plus oneInput/oneBar/answerShell structural ownership guards. No new raw TextInput or domain fetching in composites.

## Integration dependencies

Theme provides fontFace, canonical type/spacing/radius/color roles and useMotionReduced. Base provides IconBtn size and segmented Progress with total/current/part. Step 3 adds semantic TYPE.brand/headerMeta roles after integration. Header and control typechecks are completed after those dependencies merge; pending files are never copied between branches.

## Preservation

Existing Orb/moon geometry, state choreography and deliberate reduced-motion heartbeat are retained. Talk/VoiceRow owns hands-free mode. Flashcard rating remains two equal decisions; it is not converted into answer grading. UI strings use existing translations.

## Verification record

Before dependency integration: 20 targeted structural/CheckBar tests pass; 11 Composer/CheckBar behavior tests pass. Typecheck currently reports only missing pending fontFace and segmented Progress APIs. Further visual and interaction verification runs after integrating the base.

Additional pre-integration checks: 17 ProgressRow/QuestionCorner tests pass; header/practice ESLint passes. QuestionMenu tests cover open→flag callback, no dead menu and locked state. Brand copy uses buddy:brand with all five locale parity entries. Canonical composer face aliases base UI.iconButton.composer. Title and subtitle font/clamp checks follow dependency integration.

Reference browser comparison: native CUA inspected prototype practice header (close/orb/title/count/sound/menu plus segments below) and Composer (text, keys, tools and one check control). Exact count subtitle arrangement implemented. Final ProgressRow/Menu targeted run: seven tests pass, including no duplicate count; updated lint passes.

Review fixes: InputBar now forwards its locked flag as native editable=false and preserves explicit editable=false. The actual field regression failed without the fix (one failure) then all three tests pass, including the unchanged recording alternate-primary behavior. Pending Check uses quiet variant until ready. Board tutor-question dictation now reuses useVoiceInput purpose message in CheckBar; mergeTranscript appends to the current ask draft within ASK_TEXT_MAX and delegates ask.onChange. Disabled late results are discarded and lock/unmount cancels recording. Combined spoken+selected-check remains coordinated with step 4. Existing message/answer transcription contract remains unchanged.

Board dictation tests: two pass, covering message-purpose draft append, microphone wiring, disabled late-result rejection and lock/unmount cancellation. CheckBar adapter lint passes; pure Composer has no transcription or domain logic.

Voice controls also migrate RecordingStatus to the live reduced-motion subscription. New `VOICE` geometry tokens and `DURATION.voicePulse` / `DURATION.recordingPulse` preserve existing recording visuals and timings; `TYPE.voiceStatus` supplies the semantic strong status face. Mounted microphone rings and recording dots stop their animation loops on a live preference change, without disabling the recording stop action. Focused RecordingMotion tests verify both mount and toggle behavior (3 passing). Orb/moon choreography is unchanged.

Base PR #550 is merged. Composer draft rebased onto `3bc9ca7fd510ecc282c75b00429465e5843f4e4a` after named stash `mobile-redesign-composer-before-base-550`; the stash remains recoverable. Full base Field/Figtree and live reduced-motion implementations are retained. Shared LbTextInput changes are limited to the opt-in stacked Composer tools row. Canonical new type roles: brand 20/26/800/−0.4, headerMeta 13/18/600, voiceStatus body geometry / 600; all use fontFace and refill live for palette/Bold Text. COMPOSER.slot aliases UI.iconButton.composer.

Frozen dependency installation, full workspace typecheck, lint including all repository guards, and 12 targeted test files (header, Composer, read-only input, dictation, progress/menu, recording motion, typography and ownership) pass. No full API suite repeated. Browser fit and accessibility checks pass; native device review remains pending; practice draft Check plus optional spoken routing belongs to the next practice integration. No commit or push performed.

Header footer/progress now share an inset slot (`SPACE.sm` horizontally), including the practice clock/footer. Focused header test verifies both content paths occupy that slot. Primary slot audit preserves legacy `action` while idle and `after` while recording; there is no duplicate send/check action, and active recordings remain stoppable even if the field is locked. Pending Check is quiet and disabled with its existing accessibility hint. Footer/control focused run: 19 tests across five files passing.

Browser review: core-loop practice passes, including accessibility and fit. The new four look matrix initially matched both hidden Home and visible Practice primary slots; its locator now scopes to the visible route, matching the existing fit helper. All four matrix cases now pass after the focused input fix; the outer theme halo remains visible. ReadAloudSwitch now uses the existing UI.iconButton.actionGlyph. Provider-dependent dictation skips without its provider; mocked Chromium voice loop passed. Native device behavior remains unverified.

Final progress review: the displayed question now explicitly supplies its open state through QuestionProgress and the test-clock adapter. Checking a question fills its completed segment without prematurely half-filling the next segment; Next activates the new current segment. Flashcard callers retain their default active-card behavior. Focused open → closed → next regression passes; the browser matrix now asserts progress values 0.5 → 1 → 1.5. The final Pastell light visual recheck passes in 17.8 seconds; all four palette/mode cases already passed the focus, fit and accessibility checks.

Step 3 final visual approval: all four Pastell/Meer light/dark matrix cases pass with both phone sizes, visible theme focus halo and no browser inner outline. Final Pastell light progress recheck passes with 0.5 → 1 → 1.5 assertions and only the completed first segment before Next. Core-loop practice and independent callback/locking/timer/navigation review pass. Evidence: /tmp/learnbuddy-composer-focus-green.log and /tmp/learnbuddy-composer-progress-final.log. Native device interaction remains unverified; normal commit hooks will verify iOS/Android bundle exports.

Commit gate correction: the first normal hook run rejected web `outlineStyle: 'none'` because native TextStyle excludes that value. An earlier chained check had incorrectly reported success because a later command masked the typecheck exit status. The input now uses supported solid style with zero width on web; the outer positive-width theme halo remains. A standalone mobile typecheck exits 0. The focused browser check asserts inner solid/zero width and outer solid/positive width before the commit gate is retried. Failed hook evidence remains in /tmp/learnbuddy-composer-commit.log.

Supported-outline final evidence: Pastell light browser passes in 18.0 seconds (/tmp/learnbuddy-composer-focus-supported.log). Screenshot review confirms a clear inner text field and the proper outer theme halo. Native-safe solid/zero-width input outline and positive-width outer halo assertions both pass. Commit retry follows this approval.
