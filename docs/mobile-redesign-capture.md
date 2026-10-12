# Capture and sheet attachments — #548

The preparation is based on published Background main `1caf60dd84abc09a5c63a70cc27aa93b434a0258`. Thirteen owned paths cover Buddy/HomeIntro, AttachStrip and its existing test, Buddy Composer, InputBar, AttachMenu, PhotoCheckCard, `theme/capture`, the shared browser fit helper, two Capture specs and this ledger. The central delivery status is the fourteenth publication path. No route, contract, asset, attachment limit or controller changes.

## Presentation and reuse

Portrait previews remain 104×140 with separate 44-point remove targets, original source/PDF/error/quality flags, one-based badges, real zoom and renumbering. CAPTURE owns preview, badge and close geometry. Its 158-point accessory cap derives from one complete portrait plus the existing close overhang/focus room above and SPACE.xs below. The abandoned previewGlyph token is removed after a repository-wide no-caller search.

Pure InputBar accepts optional `accessoriesMaxHeight`. Buddy supplies CAPTURE's cap only while photos exist. One keyboard-focusable ScrollView contains the entire accessory stack: MicStatus, ComposerPages (previews, review, permission, progress and error) and FieldCount. AttachStrip supplies wrapping content without a nested scroll viewport. Caption and tools stay pinned; their existing five-row cap, callbacks and 44-point targets remain unchanged. The editable Composer stays in the same React sibling position when attachments are removed. All other InputBar callers retain their original presentation.

Existing visible-height/form-density and actual attachment count keep the first-visit Home whole. Tight keyboard room omits its optional intro and restores it on keyboard close. At compact full height with photos, pure HomeIntro uses SPACE.lg between sections; roomy presentation, greeting, fonts, copy and all three callbacks remain unchanged. There is no new threshold, timer, measurement engine or shared state.

Source actions are quiet, quality feedback uses a sunken card with secondary retake, and the more-photo tile is unfilled. Actual uploads, attachment modes, draft recovery, retake/keep and caches are preserved. Protected Orb/moon behavior is untouched.

## Real verification

The actual local app/API/PG matrix passes 12 cases across Pastell and Meer, each light/dark, at 360×740 and 390×844 plus keyboard viewports. It checks the supported 20-page maximum, every full portrait/remove through all clipping ancestors, pinned controls, exact original zoom source, middle removal/renumbering, clearing and genuine ordinary Home restoration. The maximum case also reaches the real 2000-character counter and five-row caption, starts the microphone normally, captures the recording layout, stops after the displayed timer reaches a second, and awaits successful real transcription. Strict fit and axe remain enabled. Log: `/tmp/learnbuddy-capture-final-browser.log` (12/12, 4.5 minutes).

Fresh mobile/spec typechecks, scoped lint and diff check pass. Sixteen existing component tests across four files plus three frozen-theme tests pass. Logs: `/tmp/learnbuddy-capture-final-{tsc,spec-tsc,lint,tests,frozen}.log`.

The additional quality-only verification separately browses the actual review title/tip and both 44-point Retake/Keep actions into view at both phones, rather than treating DOM visibility as viewport reachability. All four affected appearance cases pass (1.4 minutes); log `/tmp/learnbuddy-capture-final-quality-reach.log`.

The 84 matrix screenshots and actual geometry are preserved under task `learnbuddy-redesign/capture/final-12` and `/tmp/learnbuddy-capture-final-12-artifacts`. Source identity and hashes are in `/tmp/learnbuddy-capture-final-source`. Earlier four-look proof is historical provenance and is not substituted for this integrated matrix.

## Preserved causal evidence

Actual 20-file selection exposed the unbounded footer (1174 points), followed by first-visit Home overflow and the separately repaired 520-point Glow in a 440-point viewport. A five-row caption then exposed 9 points of overflow; the full counter and genuine recording added further rows, proving the whole accessory stack needed one bound. Original failures remain in `/tmp/learnbuddy-capture-max-red-artifacts`, `/tmp/learnbuddy-capture-glow-red-artifacts`, `/tmp/learnbuddy-capture-a511-caption-red-artifacts`, `/tmp/learnbuddy-capture-a511-near-limit-red-artifacts` and `/tmp/learnbuddy-capture-1caf-real-mic-red-artifacts`.

The shared fit helper permits internal editable overflow only for a native textarea inside the actual Composer, with a finite reached cap and both the entire field and Composer inside viewport/all clipping ancestors. Ordinary page/background containers remain strict. The earlier checkpoint proved the intentional 151-point editable scroll allowed while the genuine 80-point Glow page overflow remained rejected; `/tmp/learnbuddy-capture-a511-editable-checkpoint-artifacts` preserves that negative evidence.

Initial verification diagnostics also retain the correctly rejected too-short recording, the accessible image-wrapper/source selector mismatch and the empty primary-slot expectation mismatch. No product thresholds, timeout growth, weakened payload assertion or guard relaxation addresses those test assumptions.

## Delivery limits

Capture follows published Background #580 and precedes Material detail, Library and Subject. Native camera/permission flows, physical image gestures, keyboard, large text and screen readers remain device verification gaps. Browser fake-device microphone proof does not claim native recording or final whole-walk coverage. Normal publication hooks and root review remain required.
