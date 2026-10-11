# Redesign base components

Tracking: #548. Implements HANDOFF §5–7 and the base component references before screen migrations.

## Files and compatibility

- `components/lb/Btn.tsx`: primary, secondary, quiet, ghost; outline aliases secondary and soft aliases quiet. Danger and existing callback/state/layout props remain. Adds right icon, uses primary foreground role, disabled opacity .45 and busy opacity .8.
- `IconBtn.tsx`: canonical round control; `CircleBtn.tsx` re-exports the same implementation. Legacy plain/filled map to semantic tones. Optional visible size keeps an actual target of at least 44.
- `Field.tsx`: restricted form interface exported from the existing `LbTextInput.tsx` renderer; no second TextInput implementation. Adds hint/error precedence and keeps ref, submission, password, clear and focus behavior.
- `Card.tsx`: selected/sunken surface roles alongside legacy tones.
- `Chip.tsx`: default/receipt, selected state, disabled callback guard, optional press and trailing content; interactive targets at least 44 in both dimensions. Legacy status tones remain.
- `ListGroup.tsx`: soft shadow outside clipped paper rows. Static rows are not buttons. Navigation and trailing actions are sibling targets. Subject tiles use semantic tones.
- `Segmented.tsx`: one canvas track, selected paper face, exclusive radio semantics. Actual segment target 44, normal visual face36. Existing typed values/labels/callback and size prop remain compatible.
- `Progress.tsx`: explicit total/current/part segmented mode; legacy value remains continuous. Values are clamped and progressbar metadata reflects the rendered state.
- `Sheet.tsx`, `Motion.tsx`: consume the reactive reduced-motion hook, cancel shared animations and apply final values immediately. Sheet retains native modal, safe area, keyboard, pinned footer and visible close action.

The offered hint in `components/practice/HelpChips.tsx` now selects the canonical Chip to preserve its primary tint after the soft alias changes. Other help controls and callbacks remain intact. SpeakPanel tests read the canonical round radius while retaining one-lead and quiet-control assertions.

Paths above are relative to `apps/mobile`. Screens, routes, shared contracts and BuddyOrb/moon are unchanged by this step.

## Tokens

`apps/mobile/lib/theme/components.ts` centralizes component geometry and treatment: borders1/2, opacity .45/.8, pressed scale .97, input52 and the canonical input line height, button padding22/icons18, icon glyph20/22 and composer face40, rows56/tile36, chips34, segmented interior36, progress4/6, and sheet radius28/handle36×5/veil .28/maximum fraction .92. Existing spacing and type roles provide the shared scale.

Theme #549 is merged. Semantic typography roles action16/23/700/−.1, cell16/23/600 and metaStrong14/20/700 now live in type.ts, including live Bold Text remapping. Components select these roles rather than raw font weights. Field line height aliases TYPE.input.lineHeight. The merged renderer retains Figtree input wiring and the full base field behavior. `ACTIVE_MOTION` explicitly bypasses the cached Reanimated system setting only after the live hook allows animation. The shared `palette.scrim` keeps sheet veils dark in all eight looks, including with Reduce Transparency.

## Verification

`BaseControls.test.tsx` checks disabled submission and opacity, icon compatibility/busy state, field error/hint and changes, independent row/trailing targets, exclusive choice semantics, and safe progress bounds. BaseMotion.test.tsx verifies live cancellation and immediate sheet closure; boldText.test.ts verifies control role identity and Figtree remapping. Mobile typecheck, focused base and existing component tests, contrast checks, targeted ESLint, whitespace checks and all engineering guards pass against merged theme #549. Visual comparison uses the relevant layout/setup/settings/material walkthroughs after integration.
