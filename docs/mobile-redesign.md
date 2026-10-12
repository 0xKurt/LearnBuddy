# Mobile redesign migration

Tracking: [#548](https://github.com/0xKurt/LearnBuddy/issues/548). Target: `apps/mobile`.

## Authority and decisions

The October 2026 design package is `~/Downloads/UIUX Design Audit LearnBuddy/`.
Read `HANDOFF.md`, `implementation/MIGRATION.md`, `implementation/README.md`, then
`readme.md`. HTML and JSX are visual references, not production sources. Only the
implementation theme/component TypeScript and `assets/figures/**` may be copied.

Owner decisions, 11 October 2026:

- Use the supplied `implementation/lib/theme/space.ts` values: 16 pt gutters throughout,
  card padding 12/16/24 pt, rhythm 8/12/24 pt. These supersede the contradictory gutter20
  and card20 statements elsewhere in the package.
- Reduced motion disables all transitions, including cross-fades. This supersedes
  the earlier cross-fade policy in issue126. The existing Orb/moon choreography
  and its explicit heartbeat policy remain unchanged as separately requested.
- The explicitly required Figtree package may ship under its declared
  `MIT AND OFL-1.1` licence, with its full notice. This is a package-specific
  exception to the older dependency licence policy, not a general OFL allowance.
- Follow the supplied design and request throughout the migration. Keep existing
  domain contracts, canonical identifiers and actual application flows.

Figtree, the eight palette looks, semantic color roles and all presentation values
belong in `lib/theme`. Compatibility names remain aliases until the last screen is
migrated, then are removed in a separate PR. Composite components receive state
and variants as props; screen behavior stays at callers. Copy comes from locale
namespaces, German first. Keep `BuddyOrb` and moon choreography; adjust header size
and footprint only. Touch targets remain at least 44 pt.

Reference-only sample content is not app data. Existing schematic contracts allow
at most six labels; the reference's discussion of eight or nine labels does not
expand that contract. Capture continues through the existing attachment flow.

## Delivery sequence

Each row is a separate PR unless it explicitly describes a group of screen PRs.
Branch from current main, pass the local gates and CI, review the rendered result,
then merge before beginning the next dependent change.

| Step                   | Files and replacements                                                                                                                                                                               | Status                                                                                                                                                         |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 Theme                | `lib/theme/*`, `app/_layout.tsx`, mobile manifest/lockfile, licences and tests; minimal input-font wiring, live motion subscription and LookChoice touch fix. No component replacement.              | Merged #549                                                                                                                                                    |
| 2 Base                 | `components/lb/`: Btn, IconBtn replacing CircleBtn, Chip, Card, Field adapting LbTextInput, ListGroup/Row, Sheet, Segmented, Progress. Existing callers remain compatible.                           | Merged #550                                                                                                                                                    |
| 3 Header and composer  | BuddyHeader replaces Screen/buddy header composition; Composer replaces InputBar/CheckBar presentation with one voice/send/check/next primary slot. Preserve voice, drafts, attachments and retries. | Merged #551                                                                                                                                                    |
| 4 Practice             | Option replaces AnswerTile; QuestionCard; all current answer forms use shared states and tokens. Keep answer payloads and evaluation behavior.                                                       | Merged #552                                                                                                                                                    |
| 5a Account             | Welcome, account errors, reset.                                                                                                                                                                      | Merged #553, #554                                                                                                                                              |
| 5b Onboarding          | Consent, parent setup, voice, look, handover; individual screen PRs.                                                                                                                                 | Consent #555, Profile #556, Contact #557, Voice #560, Look #561 and Handover #562 merged                                                                       |
| 5c Home and chat       | First visit, conversation, offers, undo and chat cards; individual screen PRs.                                                                                                                       | Home merged #566; Chat merged #567                                                                                                                             |
| 5d Talk                | Conversation mode and practice in voice.                                                                                                                                                             | Merged #568                                                                                                                                                    |
| 5e Practice            | Practice route, zoom, completion, test results/time-up, homework, drill and speaking; individual screen/state PRs.                                                                                   | Practice #569, Done #571, TestReview #573, TimeUp #574 and Homework #575 and Drill #577 and Speak #578 merged; keyboard repair #579 and Background #580 merged |
| 5f Material            | Capture, sheet questions, library, subject and empty/missing states; individual screen PRs.                                                                                                          | Capture #581 and Material detail #582 merged; Library #583 merged; Subject #584 merged                                                                         |
| 5g Personal            | Memory, history and profile; individual screen PRs.                                                                                                                                                  | Memory #585, History #586 and Profile #587 merged                                                                                                              |
| 5h Settings            | Settings, voice, about, learning times, PIN; individual screen/sheet PRs.                                                                                                                            | Settings ready for review; child units pending                                                                                                                 |
| 5i Other surfaces      | Start sheet, roleplay, rehearsal, system states and overflow menu; individual surface PRs.                                                                                                           | Pending                                                                                                                                                        |
| 6 Figures and licences | Image assets, data anchors in schematics, SVG number/leader/hit overlays, existing licence sheet plus every figure and part attribution.                                                             | Pending                                                                                                                                                        |
| 7 Alias removal        | Remove compatibility keys/components only after no migrated caller depends on them.                                                                                                                  | Pending                                                                                                                                                        |

## Validation

Before each step, announce the files and replaced components. Each PR records its
changes, open follow-ups, new tokens and verified checks. Run typecheck, relevant
tests and the repository hooks; never bypass hooks. Compare changed screens with
`ui_kits/app/index.html` in a browser at360×740 and390×844, Pastell and another family,
light and dark. Check reduced motion and minimum targets. At completion run the
full walkthrough once and inspect the screenshot folder.

The existing PostgreSQL14 on the development machine cannot run the ICU database
setup used by integration tests. For this migration a separate local PostgreSQL16
instance on port15432 runs the test harness. Scope `LB_TEST_DATABASE_URL` to test
commands; never substitute production connection settings.

## Step notes

### Step 1 — theme foundation

Changes: Figtree loads before the splash handoff with five bundled weights. Existing
look colors remain intact; new foreground/boundary roles are covered by contrast
checks. Supplied typography, radii and spacing feed existing callers through
compatibility aliases. Two temporarily unused motion exports are explicitly retained
by the narrow `redesign-theme-compatibility-548.json` guard grant; remove the grant
with the final alias cleanup. The motion preference is live, protects against stale
startup reads and disables entrance fades as well as movement. Input fonts retain
the existing geometry. The appearance switch retains its visual size with an
accessible minimum touch target.

New tokens: the five Figtree faces, `TYPE.input`, `TYPE.code`, `TYPE.meta`,
`RADIUS.sm/md/lg`, `onPrimary`, `hairlineStrong`; updated durations140/220/420 ms
and the supplied easing. Existing semantic values remain in their theme modules.

Review evidence: font assets load and the email field renders Figtree. Pastell and
Meer, light/dark, were inspected at360×740 and390×844. Browser regressions exercise
the actual running preference change, not only mocked animation builders. The
repository commit gate records typecheck, lint, guards, the full test suite and
iOS/Android bundle exports. Native OS setting changes and physical microphone/
camera behavior still need device evidence.

Still open: each screen,
figures and their attributions, and the final dedicated alias removal PR.

Header/Composer browser evidence: the real core-loop practice passes the strict fit and accessibility guards after decorative progress is hidden consistently on native and web. The Composer matrix passes in Pastell and Meer, light and dark, at both phone sizes. Its locator scopes to the visible route because Expo retains a hidden Home route. Provider-dependent dictation walkthrough skips without its provider; mocked Chromium voice-loop coverage passes. Native device behavior is not yet verified.

Final progress review: the displayed question now explicitly supplies its open state through QuestionProgress and the test-clock adapter. Checking a question fills its completed segment without prematurely half-filling the next segment; Next activates the new current segment. Flashcard callers retain their default active-card behavior. Focused open → closed → next regression passes; the browser matrix now asserts progress values 0.5 → 1 → 1.5. The final Pastell light visual recheck passes in 17.8 seconds; all four palette/mode cases already passed the focus, fit and accessibility checks.

Step 3 final visual approval: all four Pastell/Meer light/dark matrix cases pass with both phone sizes, visible theme focus halo and no browser inner outline. Final Pastell light progress recheck passes with 0.5 → 1 → 1.5 assertions and only the completed first segment before Next. Core-loop practice and independent callback/locking/timer/navigation review pass. Evidence: /tmp/learnbuddy-composer-focus-green.log and /tmp/learnbuddy-composer-progress-final.log. Native device interaction remains unverified; normal commit hooks will verify iOS/Android bundle exports.

Step 4 integration: Option replaces AnswerTile, QuestionCard adapts existing question content,
and answer forms use shared practice states and semantic typography. The rendered order is
card → answer → feedback → free room → help/tools → Composer. Selection drafts check explicitly,
including Reexplain reasons through the existing Composer override. Spoken selection Check
retains one central primary and rejects late voice results. The actual Pastell/Meer light/dark phone matrix passes all four cases (72 screenshots,
84 fit reports and 28 clean accessibility stops). See mobile-redesign-practice.md for evidence
and remaining screen work; representative help, core practice, code/picture and diagrams walks pass; normal commit hooks and CI passed before merge in #552.

Merged foundations evidence: steps 1–4 are merged through #552 (`c61e4139`). Practice gates passed 5,061 tests with one conditional pgvector skip, iOS/Android bundle exports and all CI checks. Its four-look/two-phone matrix, material keyboard-fit recheck, help, core-loop practice, code/talk, picture explanation and diagrams representatives pass. Step 3 merged in #551 with full local and CI gates plus native bundle exports. A signed iPhone 14 / iOS 26 development client now renders the merged baseline Welcome and real keyboard with its fields and CTA reachable; final redesigned screen and physical-device verification remain separate.

Welcome screen 5a merged in #553 (`9a9e1c5d`) after all CI checks passed. Its normal gates passed 5,071 tests across 486 files with one conditional pgvector skip, native bundle exports and engineering guards. The four-mode/two-phone browser matrix plus invalid login passed 5/5; setup and locale lifecycle passed 5/5. Signed iPhone 14 / iOS 26 review verified initial three fields, keyboard focus/handoff, mode switching and language sheet. Native scroll gestures and physical-device/provider verification remain open.

Reset screen 5b merged in #554 (`f3e76a43`) with all CI checks green. Normal commit hooks passed workspace typecheck, lint, guards, 656 related tests and iOS/Android exports/licences. The normal pre-push suite passed 5,080 tests across 487 files with one conditional pgvector skip. Focused screen/recovery/theme tests passed 26/26; the six-case actual browser matrix passed in 1.1 minutes with strict fit/accessibility guards and rendered review. Valid recovery email delivery and native Reset remain separate open evidence.

Consent #555 merged (`8ee518cf`) with all required CI checks green. Normal gates passed 5,083 tests across 488 files with one conditional pgvector skip, native exports and engineering guards. The five-case four-mode/two-phone matrix proves palette/font, fact/policy reachability, live reduced motion and 44 pt targets; six setup/sign-out/locale flows pass for interim shared callers. Manager rendered review passed. Shared background reconciliation and native verification remain separate.

Parent Profile #556 merged (`268297e7`) after all CI checks passed. Normal gates passed 5,087 tests across 490 files with one conditional pgvector skip, 645 related tests, native exports and engineering guards. The final four-look/two-phone picker matrix, six existing setup/exit/locale flows and 31 focused tests pass. Native iPhone 14 / iOS 26 rendered review confirms readable normal/long region values with keyboard, PIN repeat focus, mismatch gating and corrected PIN → Contact. The outer focus frame meeting the Year-field scroll clip edge is a separate shared-focus review; no native Contact POST was claimed.

Contact #557 merged (`085344e0`) with complete creation payloads, single POST and persisted English locale verified in nine actual browser cases across four appearances and both phones. A held real-POST case also proves live busy reduction, fit/axe and disabled choices without duplicate submission. Android uses an existing static clock under reduction because its native ProgressBar hides when stopped; web/iOS preserve the visible paused mark. UI.busyIndicator centralizes 20/36 pt, with caller color/numeric sizing/layout retained. Normal gates passed 453 related tests and 5,095 full-suite tests across 492 files with one conditional pgvector skip, native exports and guards; CI passed. Redesigned native Contact and Android runtime verification remain open.

Voice #560 merged (`1eac2ab4`) after all required checks passed. Shared six-voice selection/preview contracts and French heading fixes are preserved. Native Voice and physical speech remain separate evidence.

Look #561 merged (`b36be2a2`) after all applicable CI checks passed. Shared family tiles and explicit System/light/dark controls preserve introductory cards and persistence. Four actual appearance cases on both phone sizes passed with40durable screenshots; normal gates passed687related and5,099full-suite tests, native exports and guards. See mobile-redesign-look.md.

Handover #562 merged (`41b089be`) after required checks passed. Actual saved facts use translated bold labels and regular values; the existing child handover instruction sits above the pinned action. Eight actual appearance/decision cases pass at both phone sizes; native rendering remains separate. See mobile-redesign-handover.md.

Shared form clearance #565 merged (`b2b3d338`). SetupStep/Sheet expose actual scroll viewports for complete frame/halo focus clearance; stacked Composer has 44 pt editable targets and supplied 8/10/6 padding. Compact Practice uses existing density to keep all eight code rows whole. The actual Composer/Practice matrix passed 8/8; normal gates and all applicable CI checks passed. See mobile-redesign-form-clearance.md.

Home first visit #566 merged (`df537c91`). Its real greeting and supplied introduction use shared grouped rows with calendar/camera/sparkle accent glyphs and existing send/photo callbacks. No new route or data contract; see mobile-redesign-home.md for final proof and native/background follow-ups.

Chat merged as #567 (`ca68604e`) on that published base. It preserves real dispatch, receipts/undo, offers and material navigation while centralizing presentation and canceling active follow/entrances on live reduction. Focused checks pass 92 tests. The actual sheet/card matrix passes 4/4 at both phone sizes with 64 PNGs; final factual-text proof passes another narrow 4/4 with 16 PNGs. Real undo failure/retry and exact material-focus navigation are preserved. See mobile-redesign-chat.md for evidence and native limitations.

Talk #568 merged (`e8c31de5`) after all required checks passed. Its four-appearance/two-phone matrix passes 8/8, genuine long-offer/live-control checks pass 2/2, and original speech/barge flows pass 5/5. Shared active end-scroll tracking preserves Chat follow policy and settles Talk movement on live reduction; mounted adapter tests and a final real 360 pt offer callback pass. Device and observed in-flight browser cancellation limits are recorded in mobile-redesign-talk.md.

Practice screen completion #569 merged (`f71f59b9`); see [its ledger](mobile-redesign-practice-screen.md) for accepted source and browser evidence.

Done #571 merged (`d87cf55c`); see [mobile-redesign-done.md](mobile-redesign-done.md) for factual result rows, reuse and verified evidence.

TestReview #573, TimeUp #574 and Homework #575 are merged; see [mobile-redesign-test-review.md](mobile-redesign-test-review.md) and [mobile-redesign-time-up.md](mobile-redesign-time-up.md).

Drill and card-pass completion merged as #577; see [mobile-redesign-drill.md](mobile-redesign-drill.md).

Speak #578 merged on `227b5321`; see [mobile-redesign-speak.md](mobile-redesign-speak.md). Structured-answer keyboard repair #576 merged as #579 (`a511df1b`): required table/column frames and rings stay whole, wide grids retain 44 pt targets, and explicit web submit-without-blur preserves Enter handoffs. Its 72 focused caller tests and 12 genuine appearance cases pass. See [structured-answer-keyboard.md](structured-answer-keyboard.md). Shared Background #580 merged on `1caf60dd`; see [mobile-redesign-background.md](mobile-redesign-background.md) for its parent-sized glow, live transparency and verified viewport repair. Capture #581 merged (`82df0681`) with bounded portrait/accessory browsing, intact caption/actions and a genuine 20-page maximum proof; see [mobile-redesign-capture.md](mobile-redesign-capture.md).

Material detail #582 merged (`caa1541c`); see [mobile-redesign-material-detail.md](mobile-redesign-material-detail.md) for complete factual titles, grouped questions and actual add-page completion evidence.

Library #583 merged (`7ea4d463`); see [mobile-redesign-library.md](mobile-redesign-library.md) for grouped real records, shared action extraction and actual navigation/SessionView proof.

Subject #584 merged (`d6e9f4f3`); see [mobile-redesign-subject.md](mobile-redesign-subject.md) for grouped real records, action handoff safety and verified deletion/recovery behavior.

Memory #585 merged (`6d8166ae`); see [mobile-redesign-memory.md](mobile-redesign-memory.md) for grouped factual records, preserved versioned edit/remove/undo and guarded action handoff. Its retained 82df four-look/two-phone proof remains source-equivalent; current scoped checks pass.

History #586 merged (`2e539835`); see [mobile-redesign-history.md](mobile-redesign-history.md) for canonical presentation and preserved pagination/undo evidence.

Profile view merged in #587 on `9d7fcf56`; see [mobile-redesign-profile-view.md](mobile-redesign-profile-view.md) for one visible editor Sheet, factual identity/subjects, confirmed versioned saves and proven cache/lifetime acceptance. The boundary-corrected tree passes 71 focused tests in eight files and four genuine current appearance cases at both phone sizes, with 32 images. Native editor verification remains open.

Settings shell is prepared on published Profile #587: inline paper disclosure groups, always-visible appearance and published form clearance preserve child-owned editor/PIN/licence flows. Current proof and remaining device limits are recorded in [mobile-redesign-settings-view.md](mobile-redesign-settings-view.md).

Profile destination correction #589 is prepared on published Foundation #590 (`69db7842`): full-page factual Profile and pushed editors replace the destination Sheet, with original explicit Header Back to Settings, existing parent/account policies and live future Stack motion gating. See [mobile-redesign-profile-page.md](mobile-redesign-profile-page.md). Final48 focused tests, mobile/spec typechecks and four real appearances at both phone sizes pass; root reviewed the full-page composition. Ordinary publication gates remain pending. Shared Header/More fidelity remains a separate open correction.
