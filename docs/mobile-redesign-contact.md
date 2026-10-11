# Contact setup screen migration

Profile #556 is merged. This independent step replaces the centered notification question with the shared onboarding title/lead: a small left Buddy, wrapping headline/body, leading 44 pt Back at the canonical gutter, one primary allow action and quiet skip. ContactStep uses canonical IconBtn and delegates its top inset to SetupStep; there is no double wrapper.

Controlled answering/onAnswer/onBack behavior, child/adult translated meanings, real yes/no decisions, in-flight disabling, actual parent PIN/consent and atomic profile creation remain intact. No OS permission behavior, storage, API, route or display text is added by the screen migration. Other onboarding presentations stay separate.

## Files

ContactStep.tsx; focused ContactStep callback/locked-state test; prepared redesign-contact.spec.ts; this ledger and the central delivery ledger. The browser spec reuses the actually merged Profile helper. Its English scenario chooses relation before opening the locale field. No pending source is copied.

## Validation

Frozen installation, workspace/mobile typechecks, scoped lint and diff checks pass. Twenty-eight final focused tests cover explicit yes/no/Back with no automatic submit, adult wording and controlled busy lock, shared shell frozen theme tokens and actual Btn/IconBtn/live busy behavior.

Nine real-stack browser cases pass (49.9 s): allow/skip in Pastell/Meer light/dark at both 390×844 and 360×740; actual primary/ink/Figtree, held normal press settling on live reduction, full labels, 44 pt targets, strict fit/accessibility. The tests compare the complete create body and actual server response and observe exactly one POST per entire scenario. The English scenario proves German parent UI until submit, English payload/response and persisted locale through authenticated GET /v1/me, then English Handover facts.

Genuine prior Contact screenshots come from Profile's earlier lifecycle and are under contact/before. Final screen matrix is under task contact/final-matrix and /tmp/learnbuddy-contact-556-artifacts/final-matrix. Manager rendered review passed all four appearances. Shared background reconciliation, native redesigned Contact, physical-device and screen-reader evidence remain separate. Native Profile previously reached the old Contact presentation; it is a before baseline, not redesigned Contact proof.

## Shared busy-motion integration preflight

The required reduction policy also covers button busy indicators. The step includes a bounded shared BusyIndicator and its actual Btn/IconBtn/MicButton callsites plus focused live-toggle test, ported as narrow current-source edits from the deferred small-controls scope. ContactStep/spec ownership remains separate. This integration keeps visible busy semantics and disabled targets while stopping spinner motion under live reduction. Android reduction uses the existing static clock icon because installed React Native 0.81.5 hides its ProgressBar whenever animating is false; hidesWhenStopped applies only on iOS. UI.busyIndicator centralizes native small/large dimensions at 20/36 pt; numeric sizes, supplied color and layout remain intact. Web/iOS keep the proven paused spinner, normal Android keeps its native spinner. Six BusyIndicator tests include the Android visibility regression, live resume and caller sizing/color/layout; the related 26-test suite passes. No Android runtime verification is claimed. It adds no timing, string or dependency. A separate real held Contact POST browser case passes 1/1 (10.1 s), including strict fit and axe at both phones: live pause, visible indicator, disabled choices and no duplicate before releasing to the actual API response. BusyIndicator is decoratively hidden on web and native while parent aria-busy remains. Durable proof is under contact/busy-final. The normal real-stack screen matrix remains accepted; geometry is unchanged. Native redesigned Contact is not claimed while the Mac is locked. Normal gates follow below.
