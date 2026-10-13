# Structured answer keyboard clearance — #576 / #548

> Superseded by #599 (redesign correction, October 2026): component and route names below describe the state before it.

Prepared on published main `227b53210bf748fe0e11ec2d5fff07d737c68f85`; rendered review accepted. Native keyboard runtime remains open.

## Exact scope

Sixteen publication paths: `TableAnswer.tsx`, `ColumnAnswer.tsx`, `AnswerShell.tsx`, `PartsArea.tsx`, `LbTextInput.tsx`, `FormFrameClearance.tsx`, `theme/practice.ts`; existing `AnswerShellTools.test.tsx`, `TableAnswer.test.tsx`, `FormFrameClearance.test.tsx` and existing `SheetClearance.test.tsx`; `structured-answer-keyboard.spec.ts`, `fit.ts`, `CLAUDE.md`, this ledger and the central `mobile-redesign.md` delivery ledger.

## Final behavior and policy

Focused table/column cells report board editing separately from an answer typed beneath a board. Tight keyboard room folds optional help, keeps the board mounted and preserves every draft/row. Only active tight editing declares the vertical `scroll-answer-form` exception. Ordinary vertical `scroll-parts` remains strict.

Wide column grids retain their server-defined alignment/data inside a stable horizontal PartsArea. `PRACTICE.columnDigitTarget` derives from TOUCH plus twice the existing columnCellAir, yielding a full 44 pt frame. The domain COLUMN_DIGIT_MIN and task maxima remain unchanged. Short grids stay centered. No font shrinking, overlapping hit targets or field removal is used.

PartsArea reuses the existing clearance with optional horizontal axis and parent registration. Both axes scroll immediately through public APIs; web reads finite live scrollTop/scrollLeft, while native retains event offsets. Generation, blur and unmount fences remain. Explicit submitBehavior=submit maps to web blurOnSubmit=false, preserving the intended Enter handoff; native/default behavior and final blurAndSubmit remain intact. Composer, payloads, grading, tutor, division-step reopening and primary action stay unchanged.

The fit exception requires the focused actual frame and ring to fit every clipping ancestor. Dedicated wholeFrame assertions verify both axes and minimum dimensions for each needed cell at full and keyboard heights. Generic overflow checks detect vertical overflow; they do not establish horizontal visibility or no-overflow ring clearance alone. Unfocused rows remain reachable through the form, while ordinary boards keep their strict policy.

## Evidence

Regression proof is retained separately: original table input y332–374 was outside viewport y167–210; addition retained a whole frame but had 67 pt undeclared vertical overflow; the existing division frame was only 36×44 pt. The observed stored-offset race had cached 15, live 116 and delta 5, producing 20 instead of 121. Vertical/horizontal web offset and native-host fallback tests pass after meaningful reds. Real mounted TableAnswer Enter→refocus→queued timer demonstrates the deferred-blur bug; final-cell Enter still submits once and blurs. The exact timing of the earlier intermittent browser focus loss was not witnessed; no unsupported runtime-cause claim is made. Instrumentation was removed.

All 72 focused caller cases across nine files pass: the 35 core table/written/clearance cases plus Cloze, TypedAnswer/WritingSheet, InputBar, Reset/NewPassword and Sheet viewport isolation/remount. The Sheet geometry double includes the existing public native-host method; its parent-isolation and fresh-offset assertions remain unchanged. Mobile typecheck, strict standalone browser-spec typecheck, scoped lint/format and diff checks pass. Logs: `/tmp/learnbuddy-structured-submit-{tsc,tests,spec-tsc,lint}.log`; `/tmp/learnbuddy-structured-sheet-fallback-green.log` adds the two Sheet cases while repeating the 13 clearance cases, without double-counting.

Twelve genuine local API/Postgres appearance cases pass at both 390×844 and 360×740: four corrected table cases and eight written addition/division cases. They prove full frames/rings across clipping ancestors, Enter/focus handoffs, retained drafts, input-node lifetime through wide/full/keyboard resizing, strict restored vertical boards, exact payloads, genuine incorrect tutor feedback, correction and Next. The table cases passed in 4.6/3.9/4.0/4.0 seconds (20.0-second run). Written proof retains its exact pre-adapter source identity: Column has no submitBehavior prop, so that branch/rendering is unchanged by the final web-only correction.

Durable final proof is under `test-results/structured-answer-expanded-final` and task visualization `structured-keyboard/final`, with 48 final images and source identities. Earlier reds/diagnostics remain separate. The browser simulates a 300 pt keyboard viewport; no physical/native keyboard proof is claimed. Manager rendered review accepted centered addition, whole division/table focus frames and restored table. No new dependency or engine; the one new visual role is derived, not an independent numerical value.

Later Settings integration must discard its duplicate live web-offset implementation/test after this shared fix publishes. Other PartsArea consumers contain no enrolled cell inputs; Cloze retains its own existing scroller. Final token cleanup still owns the older TableAnswer conditional border literal. Normal publication gates remain required.
