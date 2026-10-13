# Look and introductory cards redesign (#548)

> **Changed by #599 (onboarding area).** This ledger describes the state of #548. The switch reads System / Hell / Dunkel here as in the settings (`settings:look.mode_system_short`, `ui_kits/app/Gaps.jsx:34`); `settings:look.mode.system` ("Wie das Handy") has no reader left and is gone. The colours say "4 von 4" after the voice page and "3 von 3" where it was left out (`setupSteps.ts`), never a number after a step that was not there; the three cards before them carry no number any more (`common:onboarding.step_label` is "{{n}} von {{count}}"), and Buddy rests on the colours too instead of being happy there (`Gaps.jsx:20`). Tiles and switch stand 24 apart, as two blocks of the page.

The introductory cards use the shared onboarding shell. The final card and appearance settings reuse FamilyChoice/ModeChoice: supplied family tiles, selected paper/primaryLt treatment and explicit Wie das Handy/Hell/Dunkel Segmented. Existing step retention, skip, permission timing, gate routing and family/mode persistence are preserved. No new routes, dependencies or domain contracts.

Presentation lives in theme/look.ts (settings/onboarding tile geometry) and theme/intro.ts (existing introductory glyph geometry). Labels reuse canonical TYPE.headerMeta; no duplicate typography role. Five locale dictionaries provide mode group labels and remove unused hidden-long-press hints. The obsolete modeSwitch helper/tests are removed after confirming no callers. Published Composer/Practice scenarios retain all behavior assertions, with only mode-control selectors adapted.

Sources: HANDOFF §6, Gaps.jsx LookPick and Settings.jsx appearance rows. User-selected supplied gutter16 and shared44pt controls govern geometry.

## Verification

Integrated on published main1eac2ab4 after Contact #557 and Voice #560. Nine focused LookChoice/switch/frozen-token tests, mobile typecheck and scoped lint/format/diff checks pass. Four actual real-PG browser cases cover Pastell/Meer light/dark on390×844 and360×740: rendered palette/Figtree, strict fit/axe/44targets, live press reduction, mode/System behavior and persisted choices. All four renders were reviewed. OS appearance changes wait for actual expected palette paint, without fixed sleeps.13 selector-adapted tests across6files collect; that is collection evidence, not a full runtime-suite claim.

Task-local evidence: test-results/redesign-look-preparation contains40Intro/Look/System PNGs, fit/a11y reports and browser.log. Accepted rendering/source unchanged by this published-main update; no redundant browser run. Normal publication gates are recorded with this PR.

## Separate limits

Native/device verification remains open while the host is locked. Startup SplashHandoff and full-page background evidence remain separate from this screen matrix. Full-page background treatment remains a separate unit. These limits do not change ThemeProvider persistence or this screen’s controller behavior.
