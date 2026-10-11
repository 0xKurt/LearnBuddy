# Shared form clearance and Composer targets (#548)

Integrated on published responder-fix main4b39bb30, preserving Handover/Look/Voice. Full field frames and their focus halos remain inside the actual viewport above pinned footers. Stacked Composer follows supplied padding/gaps and has a real44pt editable target; compact Practice retains whole answer boards. Source: HANDOFF Composer/Field/Sheet contracts, docs/UX-PRINCIPLES.md and CLAUDE.md rules15–17.

## Scope and reuse

Ten unit files: SetupStep.tsx, LbTextInput.tsx, Sheet.tsx, FormFrameClearance.tsx, FormFrameClearance.test.tsx, SheetClearance.test.tsx, AnswerShell.tsx, theme/components.ts, redesign-composer.spec.ts and this ledger. Central mobile-redesign.md records merged progress separately.

The shared clearance controller measures the full non-collapsable field frame and actual native ScrollView viewport, includes existing SPACE.xs halo clearance and scrolls only missing space with animated:false. Focus/blur/layout, keyboard and content-size events drive measurement; generation guards discard stale callbacks. SetupStep provides its form viewport; Sheet provides the nearest independent modal viewport and resets offset when its native scroll host remounts. Existing forwarded TextInput refs, pinned footers and one keyboard avoider remain. Bar/cell variants are excluded from form enrollment. Settings later removes its obsolete useRevealInput plumbing.

Stacked Composer alone uses frame SPACE.sm8, column gap SPACE.xs4 and text padding8/10/6. New single-authority roles UI.field.composerHorizontal10 and composerBottom6 supply missing semantic padding; minimum edit height clamps to existing TOUCH. Nonstacked fields/cells retain geometry. AnswerShell reuses established formDensity to select4pt answer/help separation in compact/tight viewports, restoring12/8 in roomy viewports. No new sizing engine, phone threshold, route, API, deadline, scroll escape or guard allowance.

## Verified evidence

Mobile typecheck/scoped lint pass. Existing clearance/shell/Composer/frozen tests pass21 across5files; separate existing answer/code/room/keyboard/frozen tests pass29 across5files (shared frozen tests overlap; counts are not summed). The actual real-PG Composer and eight-code-line Practice matrix passes8/8 in4.3m, Pastell/Meer light/dark at390×844 and360×740, with strict fit/axe, draft persistence, grading, all8canonical code rows and one primary. Published Composer browser assertions measure empty/typed edit targets≥44 at both phones.

Red evidence: actual input height31 failed the44target assertion; the first spacing attempt then exposed11pt clipping of row8. Existing density-based gap compression resolves that fit failure without changing targets/guards/contracts. Durable test-results/redesign-clearance-target/{red,first-green-attempt,green} retains all screenshots, fit/axe reports and logs. Final rebase preserved all6runtime production files byte-for-byte (green/final-rebase-identity.txt); later requested changes only corrected a stale comment/import placement.

Prior Profile clearance evidence remains honestly scoped to Profile main268297e7: actual parent matrix4/4, bothphones/fourappearances, date/region/PIN validation and browser440-height keyboard checks. It used the same unchanged clearance implementation.36screenshots are retained in task learnbuddy-redesign/form-clearance/profile-parent-green/shots and /tmp/learnbuddy-form-clearance-parent-artifacts. No new Profile runtime run claimed.

## Remaining device proof

Native iOS26 focus Year after a long region selection and parent PIN with its error; verify the whole frame/halo above pinned footers, keyboard focus changes and Sheet close/reopen offsets with large text/Bold Text/reduced motion. Browser measurement seams and reduced-height tests do not prove native IME behavior. Native review remains pending while the host is locked. Accepted eight-case browser evidence predates the responder patch and keeps that provenance; frozen install and normal publication gates use the patched dependency. Native and CI outcomes are never inferred from that earlier browser run.
