# Consent migration — screen 5c

> **Changed by #599 (onboarding area).** This ledger describes the state of #548. The page says "Schritt 1" (no total: whether three or four steps follow is known only once the profile exists) while it is the setup (no profile yet; `components/auth/setupSteps.ts`), nothing when a changed text is agreed to later. `CheckPoints` is plain rows only: the boxed variants and `ONBOARDING.legacyFacts` are gone. Margin 20 (`GUTTER_OUTER`).

Tracking #548. Integrated onto merged Reset #554 (`f3e76a43`); Welcome #553 and foundations #549–#552 are dependencies.

## Scope and replacements

Files: app/consent.tsx; auth/CheckPoints.tsx and SetupStep.tsx; existing lb/Checkbox.tsx; lib/theme/onboarding.ts; paragraph alias in lib/theme/type.ts; focused SetupStep tests; tests/web/redesign-consent.spec.ts; this ledger and docs/mobile-redesign.md.

Consent uses a small left Orb, the merged TYPE.pageHeadline and lead in the shared onboarding shell. Its six existing facts become plain wrapping icon/text rows. Required agreement and the primary/decline actions remain pinned. Longer policy content scrolls in its own body and remains wholly reachable above that footer. Existing SetupStep and CheckPoints callers retain their default presentation until their own screen steps. The reusable Checkbox has a 24 pt visible box and a real minimum 44 pt row target; pressed scaling stops under live reduced motion.

## Preserved behavior

All six translated statements, the actual policy URL/legal-gap notice, required checked state, accept/decline handlers, loaded consent version, self-consent at age 16, adult PIN gate, stale-version refetch, fresh GET/me before navigation and sign-out are preserved. No legal promise, consent API, database, route or age-flow change. A prototype progress total is omitted because actual learner/parent/contact/handover/voice branches vary; no guessed count is shown.

SetupStep adds an optional onboarding variant, caller-owned Orb state and keyboardSafe flag. Editable callers can opt into one shared KeyboardSafe containing both scroll body and pinned footer. The shell does not own domain state or protected Orb choreography. Existing noneditable/default callers do not gain an avoider. CheckPoints reads semantic typography at render time and does not capture live theme objects at module scope.

## Tokens

ONBOARDING centralizes shared Orb, hero/body/footer spacing, plain fact rows, checkbox geometry and compatible default shell/fact geometry. TYPE.pageHeadline is reused from merged Reset. TYPE.paragraph aliases TYPE.input, preserving one source for its geometry and font face. Canonical gutters, radius, existing palette values and minimum targets remain shared. All display copy uses existing i18n; no locale changes.

## Verification

Frozen install, mobile typecheck and scoped lint pass. Thirteen focused tests pass: three SetupStep boundary/state tests, three frozen-theme guards and seven Bold Text tests. The focused shell tests verify one avoider contains field/footer, default callers have none, and caller Orb state is forwarded.

The final five-case real-browser matrix passes in 48.8 seconds on the isolated PG16 stack. Pastell/Meer light/dark each exercise 390 × 844 and 360 × 740. Assertions verify actual palette and Figtree, unchecked/checked agreement gates, a measured minimum 44 pt checkbox target, pinned actions, all six complete facts and the complete policy link reachable above the footer, actual Profile transition, and live reduced-motion checkbox press behavior. A separate decline case verifies real sign-out and Welcome return. Strict fit and accessibility guards remain active. Durable before/after evidence: /tmp/learnbuddy-consent-554-artifacts/before and final-matrix; log: /tmp/learnbuddy-consent-browser-final2.log.

Existing setup, sign-out and four-locale browser flows pass 6/6 in 1.6 minutes against this actual integrated branch, verifying interim Profile/Contact/Handover/Look callers with unchanged strict guards. Manager rendered review passes geometry, readability, whole title, footer and bottom facts in all four appearances. Normal commit/push gates follow. The shared background Glow remains a separate reconciliation unit; this screen does not claim a pixel-identical background. Native keyboard/scroll, physical-device and screenreader verification remain separate. New-account browser coverage does not establish the age-16/self-consent or adult-PIN repeat-consent branch; their domain contracts are unchanged.
