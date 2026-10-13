# Handover

> **Changed by #599 (onboarding area).** This ledger describes the state of #548. The hand-over's lines name what is set in bold with its colon (`<strong>…:</strong>`, `ui_kits/app/Onboarding.jsx:141`), drawn through `Trans` only. "Gib … jetzt das Handy." is the scale's title (17/23 · 700) 16 above the action. `CheckPoints` has no boxed variant left.

Current base: published main `b36be2a26b2c8203df5c109a69aa1a7d6c655406`. Handover presents the actual saved consent, parent PIN and notification choice, then gives the phone to the named child through the existing action. Profile form, Contact, Voice and controller behavior are preserved.

## Source scope

- `app/profile.tsx`: Handover uses the merged onboarding SetupStep with caller-owned happy Orb state, left heading and plain facts. The existing child-specific instruction is centered above the pinned primary CTA. Busy/onDone and translated wording remain unchanged. Trusted translated fact labels render through react-i18next Trans.
- `components/auth/CheckPoints.tsx`: pure keyed ReactNode content joins the existing string API. Existing string callers and legacy/plain layout remain compatible.
- `lib/theme/type.ts`: new TYPE.paragraphStrong derives canonical16/23 paragraph/input geometry and the live Figtree700 face; values remain TYPE.paragraph. Footer instruction reuses TYPE.bodyStrong and SPACE.md. No new geometry, motion token or compatibility alias.
- `locales/{de,en,fr,es,it}/auth.json`: only four existing Handover fact values mark labels before the colon with trusted `<strong>`. Words, spaces, punctuation, values and placeholders are unchanged. No translated-string splitting.
- `tests/web/redesign-handover.spec.ts`: eight real local API/PostgreSQL cases verify learner creation, submitted consent/contact fields, persisted settings.contact_enabled, displayed combined fact text, footer/action geometry, appearance and next routing.

## Accepted verification

Actual current-base frozen install, mobile typecheck, scoped lint/format/diff checks pass. Existing locale parity11 + SetupStep4 + frozen-colors3 tests pass18/18. Focused integration checks on published1eac2ab4 remain18/18; final source rebased narrowly onto Look mainb36be2a2. Normal commit hooks then passed workspace typecheck, staged lint, engineering guards,677 related tests across86files and iOS/Android exports with168 approved licences. The CheckPoints row renderer is shared without changing branch DOM/styles; accepted browser rendering remains identical. Logs: `/tmp/learnbuddy-handover-commit-retry.log` and `/tmp/learnbuddy-handover-native-bundle.log`.

Accepted rich-label browser evidence:8/8 cases (48.4s), Pastell/Meer light/dark × allow/skip, both360×740 and390×844 phones. Actual palette/Figtree,44pt targets, live reduced press, strict fit/axe, full combined fact-text queries and real learner/settings responses pass. Disabled speech reaches Intro with Voice absent. Evidence was collected on main268297e7 plus these identical rendering hunks; it is reused after the current-base rebase, not claimed as a new browser run. The fake-provider branch is separately covered by the preceding Voice unit.

Sixteen screenshots/full results: `/Users/kurt/.codex/visualizations/2026/10/11/01a12ba2-4690-7003-a078-31c31c27d5f0/learnbuddy-redesign/handover/rich-labels-final/results/shots`. Useful examples: `handover-pastell-false-false-360-360.png` and `handover-ocean-true-true-390.png`. Full copy: `/tmp/learnbuddy-handover-rich-artifacts`; runner log: `/tmp/learnbuddy-handover-rich-browser.log`. Root visual review accepted bold labels/regular values, title wrapping and pinned footer.

## Integration and device limits

Publication follows genuine Voice and Look merges. Preserve their published French Voice-title nonbreaking space, TYPE.voiceChoice and all current Profile/type/helper roles; apply only this unit's Handover/component/paragraphStrong/fact-markup hunks. No pending implementation is copied into this unit.

Actual native rendering, OS Bold Text/large text, live reduction and physical touch remain device verification. Browser viewport evidence does not establish native IME or native modal behavior. Protected BuddyOrb/moon internals are unchanged.
