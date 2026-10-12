# Shared page background — #548

Prepared on published main `a511df1befeb661ea22114c3182bc9804cb45477`. Thirteen publication paths including the central delivery status; no publication yet.

## Final scope

The shared `lb/Glow.tsx` renderer and `theme/background.ts` replace clipped upper ellipses with the supplied `colors.css` page-glow: top-left glow1, top-right glow3 and bottom glow2. BACKGROUND owns layer centers/extents and the 70% transparency stop; existing palette glow colors/opacity remain authoritative. SVG uses transformed user-space gradients and reverse painter order to preserve CSS layering. The static decoration fills its parent, is untouchable/accessibility-hidden and disappears under live Reduce Transparency. No assets, dependencies, animation or Orb/moon changes.

`lb/Screen.tsx`, Welcome, Reset's three branches and current Talk remove only obsolete Glow height props. Talk was reconstructed from the published centered shell; its controls, speech, AppearText and active-scroll handling remain intact. `lb/BottomBar.tsx` removes only opaque background paint, retaining safe-area/keyboard padding, children and Toast measurement. Published Home Composer therefore shows the same full-page ground through its footer.

The existing `lib/a11ySettings.ts` hook adds SSR-safe web `prefers-reduced-transparency` initial/live subscription and cleanup. Installed RN Web has no native transparency query; native AccessibilityInfo and Bold Text handling remain unchanged. Focused `Glow.test.tsx` and `A11yTransparency.test.tsx` verify actual removal/restoration and listener lifetime. The existing `redesign-background.spec.ts` exercises real local accounts, four appearances at both phones, live CDP transparency and representative Welcome/invalid Reset/Talk/Practice roots.

## Evidence

Actual integrated frozen install, mobile typecheck, strict browser-spec typecheck, scoped lint/format and diff checks pass. Eighteen focused tests across three files pass. The four-appearance/two-phone Home/footer matrix and genuine live transparency test pass 5/5 in 55.3 seconds including the initial custom-root diagnostic. Logs: `/tmp/learnbuddy-background-646b-{install,tsc,spec-tsc,focused,lint,spec-lint,format-check,browser}.log`.

The custom-root checks use actual published labels and count the active visible renderer, because navigation retains previous routes in the DOM. Earlier failed test assumptions are preserved in `/tmp/learnbuddy-background-646b-first-artifacts` and `/tmp/learnbuddy-background-646b-hidden-stack-artifacts`; neither indicated a production defect. The final custom-root case passes 1/1 in 30.1 seconds, with ten images covering both phones and the actual Practice keyboard state. Its log is `/tmp/learnbuddy-background-646b-roots-final.log`; durable proof is task artifact `learnbuddy-redesign/background/646b-roots`.

Durable integrated matrix: task artifact `learnbuddy-redesign/background/646b-matrix`. Earlier df537 media/footer red and green evidence remains separate provenance; it is not relabeled as current source.

## Remaining verification and cleanup

Native SVG extent, safe-area continuity, OS transparency propagation and accessibility need actual device review. Installed native SVG supports the used gradient units/transforms, but source compatibility and web simulations do not establish native rendering. Final whole walkthrough remains separate.

HEADER.glow, AUTH.glow, RESET.glow and TALK.glowHeight stay until the dedicated final integrated zero-caller cleanup. This unit does not prematurely remove old theme aliases or unrelated pulse tokens.

## Keyboard viewport regression

Actual published Speak #578 and structured keyboard #579 are preserved. The accepted twelve files restored without conflicts; production renderer bytes match the earlier accepted 646b draft. Earlier six browser cases retain their 646b provenance.

The new real signup → planTest conversation case isolates the decorative background from optional first-visit Home content. At 360×440, temporarily restoring the published fixed 520 pt Glow fails the visible SVG/layer/root extent assertion. Exact parent-sized Glow passes the same strict bounds/fit/axe case (1/1 in 11.8 s), then restores both phone sizes and verifies footer continuity. No Capture source or guard exception is involved. Red and green are preserved separately under test-results/redesign-background-preparation/a511-keyboard-{red,green}. Actual maximum-photo integration remains Capture-owned after this publication.

Fresh actual a511 checks pass: frozen install, mobile and strict browser TypeScript, scoped lint/format/diff, and 21 focused tests across four files (the original 18 plus three frozen-token guards). No source change outside the thirteen declared publication paths. Normal commit/pre-push gates remain pending source and visual review.
