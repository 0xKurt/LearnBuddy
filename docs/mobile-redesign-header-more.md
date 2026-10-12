# Shared Header, More and practice chooser — #548 / #589

Integrated on published PhotoReview `b586e03dce1fec301bccf7228c9ce09cef627738`, preserving published QuestionCard and all TYPE review roles. Runtime provenance remains Capture `3fd169b5b06e649031c9cfdcdcadf77cfe52f922` with unchanged relevant caller behavior. This unit separates the original six-destination More menu from the genuine practice chooser and preserves existing domain actions. It does not claim whole-redesign completion.

## Original presentation and genuine actions

Header.jsx and App.jsx define one read-aloud switch, one More button and six destinations. Ordinary headed screens now share those controls. CardPass keeps its existing close callback and hint in the leading slot; Material rename and Practice flag/dispute remain separate factual contextual actions. Context ownership includes the mounted adapter instance and domain identity, so a hidden same-item adapter cannot cancel the foreground menu.

The chooser uses Modes.jsx title 16/21/600, metadata 13/18/400 and square 40/20 icon tiles. Original Material/Topic/Roleplay/Rehearse/Drill choices coexist with registered Exam/Homework/Speak/Vocabulary functionality. Actual contracts and payloads remain unchanged. Returning-chat access is one existing quiet Chip in the scrolling conversation, a documented functional gap-fill because the original does not specify its live launcher. No new pinned bar or seventh destination is introduced.

Sheet.jsx supplies the shared grabber/title/content frame: existing 36×5 visual grabber with a named 44-point target, title tracking 0, original spacing and safe-area-aware bottom room. The old global Close footer is removed; explicit domain actions and pinned form footers remain. Native Back/accessibility escape, veil/swipe and actual web keyboard dismissal are preserved. CLAUDE rule 14 is updated only to this binding original requirement.

## Lifetime and theme authority

Menu and chooser handoffs wait for actual closing completion. Reopen, route/account replacement, lost eligibility and unmount cancel obsolete work; no guessed new timeout is introduced. Unchanged MaterialCard retains its documented platform compatibility export until its separately owned lifetime correction. Sheet close generations retain live reduced-motion cancellation and modal form-frame clearance.

New semantic roles: TYPE.startChoiceTitle, startChoiceMeta, topicLead, topicChip and derived sheetTitle; START geometry and shared IconTile geometry; additive DURATION.sheetHandoff. Existing shared roles and all published locale removals are preserved. Orb/moon internals are unchanged.

## Evidence and limits

The first 9 PNG on 3fd prove functional navigation only and retain the obsolete Close footer. The corrected frame run and final current source manifest are recorded separately. Two-owner cancellation has a genuine red checkpoint followed by green; real stacked same-item adapters preserve the foreground callback. Focused checks cover domain registration, original card callbacks, close generations, form clearance and read-aloud behavior.

Browser evidence uses the real local app/API/PostgreSQL and actual signup, messages, material rename, card pass and homework preparation. No database state injection or fabricated destination data is used. Final bounded checks pass: 69 tests across 12 files, mobile and strict web-spec typechecks, scoped lint, format and diff checks. The genuine two-owner red log is `/tmp/learnbuddy-header-more-owner-red.log`; final focused logs are `/tmp/learnbuddy-header-more-final-focused.log` and `/tmp/learnbuddy-header-more-final-register.log`.

Runtime comprises four successful final-frame Header/More appearances plus one genuine CardPass case from the preserved mixed run, followed by six causal cases: Material rename, grabber Enter/Escape dismissal and four Start appearances with truthful homework eligibility and the genuine permitted flag flow. That is 11 successful distinct cases; there was no whole walkthrough. The mixed artifact contains 53 PNG including partial failed setup states, so it is not described as all-green proof. Its 38 complete Header/CardPass images and the causal run’s 34 complete images provide the final relevant state proof. Preserved failure causes were visible-text expectation for the now-unlabelled grabber, Library/Subject action-name confusion and expecting flagging in real mode=help; no production eligibility was weakened.

Durable task paths: `learnbuddy-redesign/design-audit-589/header-more/3fd/frame-mixed` and `causal-final`. External artifacts are `/tmp/learnbuddy-header-more-final-matrix-first` and `/tmp/learnbuddy-header-more-final-causal-proof`; logs are `/tmp/learnbuddy-header-more-final-browser2.log` and `/tmp/learnbuddy-header-more-causal-browser.log`. The causal export identity is `733e81ccd858f6f73b7a4aefb1b5cfef68925dbd`. The additional Material busy lock uses a default-false pure Screen prop and leaves the four Header/CardPass call paths unchanged. The final source manifest is `/tmp/learnbuddy-header-more-49-publication-manifest.json`.

Normal commit/push gates remain pending root review. Native physical dismissal, keyboard and active UIKit transition behavior remain unverified; shared Row typography and later full-page leaf corrections remain separate owners. MessageMenu’s anchored action presentation is a separate follow-on unit.
