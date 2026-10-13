# Done completion — #548

> Superseded by #599 (redesign correction, October 2026): component and route names below describe the state before it.

Integrated on published Practice #569, main `f71f59b930f592f21a2be9a83c3f1dedb2404af1`; awaiting final source review.

## Exact scope and result

The 17-file unit comprises RunResult, SessionSummary, AgainButton, ResultList, results/motionDurations theme additions, three focused result/summary tests, five practice locale files, the Done matrix, this ledger and the central migration status.

Normal non-test completion uses the happy shared header with actual session title and localized “Fertig” subtitle. The screen intro groups the heading and every factual summary sentence with RESULT.introGap 10; 24 pt separates it from grouped actual results. Row solutions and worked notes use TYPE.meta; legacy card solutions retain TYPE.bodyStrong. ResultRow's optional factual status distinguishes correct, missed, skipped, open and revealed without parsing labels. Status/title wrap, and every solution/explanation remains intact. Existing right-only Roleplay/Rehearse consumers and legacy presentation defaults remain supported.

Return to Buddy is the primary action; actual card-pass or further-practice offers stay quiet and retain server decisions/callbacks. No sample scores, counts, strings, routes or payloads are introduced. Five practice locale files add only summary.finished, faithfully translating supplied Done's completion subtitle.

Legacy celebration preserves protected BuddyOrb/moon choreography, uses live reduction for its existing arrival delay and removes decorative outer halo/scale movement. Screen content/footer arrive immediately. No Orb internals change.

## Tokens and serial integration

RESULT owns row/badge/spacing/legacy geometry, introGap 10 and staggerLimit 5; border derives UI.border. DURATION adds summaryTitle 260, summaryCard 460, summaryLine 140, summaryReview 900, summaryActions 900 and resultCardLead 60. Distinct review/action semantics remain separate despite equal values. Existing published durations, live preference, TYPE.bodyStrong and current Screen contracts stay intact.

Current RunResult migrates only session.mode !== 'test'. Later TestReview/TimeUp must extend the union of previously migrated modes while preserving the subtitle, intro grouping, statuses, solutions, actions and legacy fallback; never replay old SessionSummary snapshots. The six roles are added to genuinely published motionDurations.ts. Published motion.ts and Chat duration exports remain unchanged; no stale module is replayed.

## Evidence and limits

Frozen installation, actual mobile typecheck, strict browser-spec typecheck, scoped lint/format and diff checks pass. Twenty-five meaningful tests in seven files cover statuses/solutions/legacy behavior/live timing, locale parity and shared motion/frozen roles. Current logs: `/tmp/learnbuddy-done-ca686-{install,tsc,tests,lint,spec-tsc,motion-tests}.log`. The 25 cases span 19 result/summary/locale/frozen checks and six published Motion checks.

The accepted real four-appearance/two-phone matrix on published Home df537c91145e60aad3e75b0149a0260663bed81c passes 4/4 in 54.6 seconds using published Home helpers and actual API/PG scenarios. It derives finished session ID/status/item counts from the real SessionView GET, checks each factual correct row and subtitle, primary paint/targets, and unchanged strict fit/axe. Actual Again POST preserves from_session_id and harder intent, opens a genuine new session, then the original finished route and return callback remain functional. No state/results/routes are mocked.

The results list legitimately scrolls on the smaller phone. Strict axe identified missing keyboard focusability; the minimal public web-only tabIndex 0 preserves native semantics, geometry, all text and callbacks. Actual focus/PageDown movement and last-row reachability now pass at overflow sizes. Header close and footer return share an intentional label; the primary locator is scoped to the footer rather than weakening accessibility. Failure artifacts are separately labeled selector-failure and scroll-a11y-red; final proof is independent.

Durable eight-image proof: ignored worktree `test-results/redesign-done-preparation/final/web/shots`, with source identity in its parent. Actual final log `/tmp/learnbuddy-done-home-browser-final.log`. Current published Practice integration preserves that geometry and all Screen/Btn/type contracts. Published Motion consumes skipped entrances without changing fresh Rise behavior; its actual suites pass. No merge-induced rendering concern was identified, so screenshots retain their original source identity and were not repeated or relabelled as a newer export. Source remains uncommitted pending ordered publication/review. Only normal completion's all-correct real fixture is rendered in this matrix; TestReview/time-up factual states belong to their later units. Native result/focus/OS Bold Text proof remains open. PassEnd belongs to later Drill and is untouched. No pending Practice-screen source copied, full walkthrough or native UI performed.

The Practice rebase changed only the pure duration module, preserving all 13 published keys and adding only the six Done roles. Accepted component, locale and browser-spec bytes remain unchanged; no broad visual rerun was needed.

Final published-base focused checks pass: 19 result/summary/locale/frozen cases across five files and six BaseMotion/MotionBuilders cases: 25 tests across seven files total. Node 22 frozen install, mobile typecheck, scoped lint/format and diff checks pass. Final hook gates remain pending authorization.

## Correction #599 (practice cards)

The result page follows `ui_kits/app/Done.jsx:23–44` now. The intro is the heading and ONE paragraph: every factual sentence joined, so "Heute ohne Tipp geschafft: …" and "Schauen wir nochmal an: …" close with a full stop in five languages. A row is sign · title with its notes under it · the state's word at the right end (`ResultList` `rows`): the label is the state alone ("Richtig", "Übersprungen", "Nicht beantwortet"), no number before it; it never shrinks, wraps at 45 % of the row (`RESULT.labelShare`, which replaces `RESULT.titleMinWidth`) and stands on a line as tall as the title's (600 16/22). A title that ends in math keeps the word before it on its line, so a closing fraction is no orphan. The page stands 20 from its sides (`GUTTER_OUTER`) and ends 16 above the bar. The second way on ("Mehr davon, etwas schwerer", "Die wackligen nochmal üben", "Die Wörter als Karten durchgehen") is a ghost of the plain size without a sign; `AgainButton` lost its `quiet` switch and the `soft` skin. Not walked in a browser in that change (owner 13.10.: tested once at the end).
