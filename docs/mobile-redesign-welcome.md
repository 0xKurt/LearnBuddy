# Welcome migration — screen 5a

> **Changed by #599 (onboarding area).** This ledger describes the state of #548. The page keeps the margin of the pages before the app (20, `GUTTER_OUTER`; `pinnedBar()` too). The switch, the fields and the line under them are one group 12 apart (`AUTH.formGap`, `ui_kits/app/Welcome.jsx:18–24`), the e-mail field shows an address to type (`auth:welcome.email_placeholder`), and the pinned action keeps the design's lower edge of 26 where the page is roomy. "Passwort wiederholen" stays (owner 28.09.).

Tracking #548. Preflight scope announced before implementation: `app/welcome.tsx`, pure `components/lb/LanguageChoice.tsx` and its tests, `lib/theme/auth.ts`, Welcome/language browser tests, the scoped auth-form fit rule, and design/UX ledgers. No locale, route, authentication library, API, schema or dependency changes.

## Replacements and preserved behavior

The centered introduction becomes a 56 pt left Orb, canonical Figtree display/body and labelled shared Fields. The current-language pill shares the Orb's top band and opens the existing Sheet. Selected rows reuse the shared `picked` skin (`primaryLt`, `primaryDk`) and check icon; selection and dismissal retain radio and locale semantics. Quiet meta copy replaces the decorative under-16 card. The primary account action remains pinned inside the existing KeyboardSafe.

Signup, signin, repeat-password validation, reset requests, confirmation/resend, private errors, touched fields, password visibility, next-field refs, announcements, locale persistence, in-flight locking and onboarding handoff retain their existing handlers. BuddyOrb/moon internals are unchanged. All required fields and supporting copy remain.

`AUTH` centralizes Welcome geometry: Orb 56 pt, static glow 420 pt, top 12 pt, hero top 20 pt, bottom 26 pt, regular gap 24 pt, compact/hero gap 12 pt and copy inset 4 pt. The owner-selected 16 pt gutter and existing type/radius/space tokens remain authoritative.

## Reachability contract

The supplied Welcome reference permits form scrolling with a pinned action. Required auth forms use explicit `scroll-form`; approved typography and the repeated password are retained. At 360 × 740 all three initial signup inputs are whole. Lower supporting copy and validation text can scroll; each field must be wholly reachable above the action. The general fit and accessibility guards remain intact. CLAUDE rule 16 and UX principles document this narrow form rule.

## Final integration and evidence

Rebased onto merged Practice #552 (`c61e4139`), preserving the merged Field, Figtree faces, Bold Text, focus halo, motion and practice fit diagnostics. Frozen install, mobile typecheck and scoped lint exit 0. LanguageChoice tests use the real shared Btn (Sheet portal seam only): 10/10 pass, including actual selected colors in all eight looks. Frozen-token guard: 3/3 pass.

Final browser matrix: 5/5 pass in 1.6 minutes, covering Pastell/Meer light/dark at 390 × 844 and 360 × 740, signup/signin, client validation, complete scrolled error bounds, language Sheet and real local invalid-credentials response with preserved fields and retry. Meer uses canonical `ocean`, with an actual computed primary-color assertion. Initial fields are checked before scrolling. Bottom-error proof verifies the real scroll position and whole mismatch copy above the CTA. No auth-response stubs. Log: `/tmp/learnbuddy-welcome-552-browser-final.log`; 42 screenshots plus fit/accessibility records preserved in `/tmp/learnbuddy-welcome-552-artifacts/matrix-final`.

Existing setup and four-language lifecycle walks: 5/5 pass in 1.3 minutes, exercising actual signup, consent, required parent fields/PIN, contact, handover, look and Home plus English/French/Spanish/Italian signup. Log: `/tmp/learnbuddy-welcome-552-lifecycle.log`; artifacts preserved in `/tmp/learnbuddy-welcome-552-artifacts/lifecycle-final`.

Owner visual review approved Pastell light scrolled errors at 360, Pastell dark signup at 390, Meer light signup at 360 and Meer dark language Sheet at 360. The existing signed iPhone 14 / iOS 26 development client loaded this checkout through local Metro/API. Owner CUA verified initial fields and real keyboard labels/fields/hint/CTA whole, with next-field focus working and no runtime error. Native scroll gestures are unavailable in the current Device Hub tool; native scrolling is not claimed. Browser scrolled-copy proof is green. Physical-device and VoiceOver/TalkBack verification remain open.

Normal commit hooks are the next publication gate; their actual result will be reported separately. Other prepared screens remain separate uncommitted worktrees.
