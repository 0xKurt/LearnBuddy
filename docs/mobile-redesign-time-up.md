# Time-up completion — #548

Final integration on published main `ed352332bd4359c7973c0135d2a3282b982db8eb` (TestReview #573 merged). Exact four-path scope: `components/practice/RunResult.tsx`, `tests/web/redesign-time-up.spec.ts`, this ledger and `docs/mobile-redesign.md`. Publication follows the genuinely merged TestReview; no pending source is copied.

## Final result adapter

Every finished contract mode uses the already published shared result layout: genuine screen title, completion subtitle, header close callback, factual screen summary and keyboard-focusable review list. Orb state derives from actual `session.timer.ran_out`: idle when true, happy otherwise, matching supplied App.jsx; protected Orb/moon internals are unchanged. The former layout/legacy predicate and delayed legacy footer branches are removed. Shared SessionSummary/ResultList legacy APIs remain for their independent consumers.

The footer has one primary return and the existing quiet cards/Again path when actually offered. All topic derivation, card-pass behavior, busy state, summary facts, status/solution text and callbacks remain. No route, domain value, copy, token or timer policy is introduced. Final dead-duration cleanup is outside this unit.

## Actual checks and browser proof

Frozen install, mobile typecheck, strict browser-spec typecheck, scoped lint and diff checks pass. Existing summary/result/motion/frozen-token/locale suites pass 19 tests across 5 files. Final ed352332 source checks again passed 19 tests across 5 files, mobile typecheck, scoped lint and diff check. Logs: `/tmp/learnbuddy-time-up-final-{tsc,lint,tests}.log`; earlier install/spec checks retain `/tmp/learnbuddy-time-up-{install,spec-tsc}.log`.

The real local API/PG Photosynthese scenario checks exact session/item IDs and submitted choice indices, parses an active timed test with the third item open, then uses the existing dev-only deadline adjustment. Its 204 is not treated as completion evidence: the actual clock/hand-in path runs, and a fresh finished GET proves `ran_out=true`, unchanged IDs and correct/correct/open statuses. Factual two-of-three and unanswered-is-not-wrong text, genuine Traubenzucker solution, no Composer, actual painted primary, keyboard overflow movement, whole final review and back navigation are verified.

All 4 cases passed at 360 × 740 and 390 × 844: Pastell light 16.7 seconds, Pastell dark 18.0 seconds, Meer light 16.0 seconds and Meer dark 16.1 seconds. The 16 screenshots retain identical source/export identities. Top and final-review screenshots use strict fit, axe and 44 pt checks, with appearance/font proof from the genuinely published Home helper. Durable evidence is under `test-results/redesign-time-up-preparation/final` with exact source/export identities.

## Boundaries

Deadline adjustment is the existing local test harness, not production timer injection or a forged result. No native timing, keyboard, OS Bold Text or gesture/runtime proof is claimed. The published TestReview delta changed only the obsolete layout predicate; the accepted unconditional layout preserves all its factual data and callbacks. Prior browser proof retains its exact 706a6188 identity; this rebase changes no rendered source or API contract. Final source checks on ed352332 establish integration, with normal publication gates still pending.
