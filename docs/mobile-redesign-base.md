# Redesign base components

Tracking: #548. Implements HANDOFF §5–7 and the base component references before screen migrations.

## Files and compatibility

- `components/lb/Btn.tsx`: primary, secondary, quiet, ghost; outline aliases secondary; soft keeps its accent tint from before the redesign (#599, below). Danger and existing callback/state/layout props remain. Adds right icon, uses primary foreground role, disabled opacity .45 and busy opacity .8.
- `IconBtn.tsx`: canonical round control; `CircleBtn.tsx` re-exports the same implementation. Legacy plain/filled map to semantic tones. Optional visible size keeps an actual target of at least 44.
- `Field.tsx`: restricted form interface exported from the existing `LbTextInput.tsx` renderer; no second TextInput implementation. Adds hint/error precedence and keeps ref, submission, password, clear and focus behavior.
- `Card.tsx`: selected/sunken surface roles alongside legacy tones.
- `Chip.tsx`: default/receipt, selected state, disabled callback guard, optional press and trailing content; interactive targets at least 44 in both dimensions. Legacy status tones remain.
- `ListGroup.tsx`: soft shadow outside clipped paper rows. Static rows are not buttons. Navigation and trailing actions are sibling targets. Subject tiles use semantic tones.
- `Segmented.tsx`: one canvas track, selected paper face, exclusive radio semantics. Actual segment target 44, normal visual face36. Existing typed values/labels/callback remain compatible; the segments share one line and there is no size prop (#599, below).
- `Progress.tsx`: explicit total/current/part segmented mode; legacy value remains continuous. Values are clamped and progressbar metadata reflects the rendered state.
- `Sheet.tsx`, `Motion.tsx`: consume the reactive reduced-motion hook, cancel shared animations and apply final values immediately. Sheet retains native modal, safe area, keyboard, pinned footer and visible close action.

The offered hint in `components/practice/HelpChips.tsx` now selects the canonical Chip to preserve its primary tint after the soft alias changes. Other help controls and callbacks remain intact. SpeakPanel tests read the canonical round radius while retaining one-lead and quiet-control assertions.

## Correction against the design (#599, area 2)

The design folder decides the look (owner 12.10.); each point names its line there.

- `Btn.tsx` (`components/core/Btn.jsx`): `soft` is not one of the design's four variants and has its accent tint again (`primaryLt` / `primaryDk`, owner rule 2). The four design variants answer a press with the dip alone (readme "States": scale .97); with Reduce Motion, where the dip is off, they dim as before (`pressedStyle` in `lib/theme/components.ts`). The other variants are unchanged.
- `IconBtn.tsx` (`Btn.jsx:37`): the glyph is 22 for `voice` and `send` in any tone and 20 otherwise; the same press treatment; no border.
- `Chip.tsx` (`Chip.jsx:10`): one point of edge in every tone, clear where the tone has none. The 44 pt target hands the 5 pt it reaches above and below the 34 pt chip back as margin, so a chip row is 34 tall. `endIcon` draws the glyph at a receipt's end inside the pill.
- `Card.tsx` (`Card.jsx:4,11`): default padding `CARD_PAD.card` (20), its parts `SPACE.md` apart. A card in the conversation passes `CARD_PAD.thread`.
- `ListGroup.tsx` (`List.jsx`): title `TYPE.option` 600 16/22, value `TYPE.listValue` 400 15/20, 10 above and below, 2 between title and line under it, a lone icon in the accent at 20, tile letter `TYPE.listTile` 700 15 or the tile's icon at 18, `children` under the line, `action` for the 32 pt pill in the chevron's place (`ui_kits/app/Library.jsx`). `completed` and `destructive` are not in the design and stay as they are.
- `Sheet.tsx` (`Sheet.jsx:4–14`): title optional and 4 in from the side, 16 between handle, title and parts, 30 under the last part (more where the safe area asks for it). The in-sheet close button stays (CLAUDE.md rule 14).
- `Segmented.tsx` (`Segmented.jsx:6–12`): no `size`, no wrapping.
- The system states keep their look (`implementation/MIGRATION.md` §5); their literals are tokens in `lib/theme/states.ts` (`SKELETON`, `TOAST`, `EMPTY_STATE`, `LOADING_STATE`, `DEV_NOTE`) and `UI.slot|section|fold|edgeFade|splash`. Text that carried a bare size and weight (Banner, Slot, Toast, DevHostNote) is set in Figtree at the same size.

`DesignBase.test.tsx` holds these, each case with its design line.

Paths above are relative to `apps/mobile`. Screens, routes, shared contracts and BuddyOrb/moon are unchanged by this step.

## Tokens

`apps/mobile/lib/theme/components.ts` centralizes component geometry and treatment: borders1/2, opacity .45/.8, pressed scale .97, input52 and the canonical input line height, button padding22/icons18, icon glyph20/22 and composer face40, rows56/tile36, chips34, segmented interior36, progress4/6, and sheet radius28/handle36×5/veil .28/maximum fraction .92. Existing spacing and type roles provide the shared scale.

Theme #549 is merged. Semantic typography roles action16/23/700/−.1, cell16/23/600 and metaStrong14/20/700 now live in type.ts, including live Bold Text remapping. Components select these roles rather than raw font weights. Field line height aliases TYPE.input.lineHeight. The merged renderer retains Figtree input wiring and the full base field behavior. `ACTIVE_MOTION` explicitly bypasses the cached Reanimated system setting only after the live hook allows animation. The shared `palette.scrim` keeps sheet veils dark in all eight looks, including with Reduce Transparency.

## Verification

`BaseControls.test.tsx` checks disabled submission and opacity, icon compatibility/busy state, field error/hint and changes, independent row/trailing targets, exclusive choice semantics, and safe progress bounds. BaseMotion.test.tsx verifies live cancellation and immediate sheet closure; boldText.test.ts verifies control role identity and Figtree remapping. Mobile typecheck, focused base and existing component tests, contrast checks, targeted ESLint, whitespace checks and all engineering guards pass against merged theme #549. Visual comparison uses the relevant layout/setup/settings/material walkthroughs after integration.
