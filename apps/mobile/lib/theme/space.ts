// One spacing scale for the whole app (issue #64). Before this every screen picked its own
// numbers, so the same gap was 8 here and 14 there and the app looked padded in places where
// the content was what mattered.
//
// Steps, not free numbers: xs 4 · sm 8 · md 12 · lg 16 · xl 24. Anything that is not one of
// these needs a reason in a comment (an optical correction, a touch target).
import type { ViewStyle } from 'react-native';

export const SPACE = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
} as const;

/**
 * The side margin of the pages before and around the app (issue #311): welcome, reset-password,
 * consent, pin, the onboarding's footer and the profile steps. 20, between SPACE.lg and
 * SPACE.xl — one column of fields and pill buttons on Buddy's light gets a calmer frame than
 * the 16 inside the app, as it has since the first build. One value, so those pages stay alike;
 * each used to write its own 20.
 */
export const GUTTER = 20;

/**
 * A card's padding (components/lb/Card.tsx, issue #311). `base` is the card's own; `roomy` the
 * calmer one of a card that holds a sentence to read or a setting's question and answers — the
 * settings' cards, the sentence to speak, a text to hear, a solution, the sign-up pages' notes;
 * `snug` the slim one of a card that holds one line or one control — an error note, Buddy's
 * way into an area, the consent's checkbox and its points. One value each, so those cards stay
 * alike; each used to write its own 14, 18 or 20.
 */
export const CARD_PAD = { snug: 14, base: 18, roomy: 20 } as const;

/**
 * Three gaps the app has used off the scale since its first screens (issue #311), named so each
 * stays one value: `parts` 10 between the parts of one card, form or row (its lines, fields and
 * buttons, an icon and its title), `stack` 14 between the blocks of a stack (the cards of a
 * list, a card's blocks, a sheet's parts, a form's fields, the PIN pad's rows, the title under
 * Buddy's orb, a step's rhythm where it is tight), `sections` 18 between the sections of a page
 * or of a card (the page's rhythm). Each place used to write its own 10, 14 or 18 with a
 * `token-exempt` beside it. Folding them into SPACE (sm/md, lg/xl) is a visible change and a
 * decision of its own.
 */
export const RHYTHM = { parts: 10, stack: 14, sections: 18 } as const;

/** The smallest a tappable thing may be (design brief); never trimmed to save space. */
export const TOUCH = 44;

/**
 * The heights of a `<Btn>` by size (components/lb/Btn.tsx). Here, not in the button, because a
 * layout that has to know what a pinned bar takes reads the real number instead of copying it
 * (the practice screen's room for a board under its "Prüfen", lib/practice/threadRoom.ts).
 */
export const CONTROL = { sm: TOUCH, md: 48, lg: 54 } as const;

/**
 * The narrowest the practice progress bar gets (`ProgressRow`, issue #459): whatever stands beside
 * it — the question's quiet action, a test's clock — it keeps this, so it still reads as a bar and
 * not as a stub. Here, like CONTROL, because the walkthrough's fit check reads the real number
 * (tests/web/fit.ts `progressHead`).
 */
export const PROGRESS_BAR_MIN = 48;

/**
 * The bottom padding of a bar or a page that ends at the screen's edge (issue #142).
 *
 * The safe-area inset is what the SYSTEM takes from the edge — a gesture bar, a
 * navigation bar, a home indicator. The gap is what the DESIGN needs on top of it. The
 * app used to write `Math.max(insets.bottom, 16)` in ten places, which gives a phone
 * with a 48 pt navigation bar its 48 and then no gap at all: the bar sits ON the system
 * bar, and the composer's shadow runs into the screen edge. On the web, with no inset,
 * the same line looked perfectly fine — which is why it survived until someone held a
 * real phone ("das input field minimal nach unten abgeschnitten", owner 30.09.).
 *
 * So: past the system first, then room to breathe.
 */
export function bottomRoom(safeBottom: number, gap: number = SPACE.lg): number {
  return safeBottom + gap;
}

/**
 * The bar under a GUTTER page that holds its CTA (CLAUDE.md rule 15): the page's margin, a small
 * step above, room past the system's bottom inset below. Inside a SafeAreaView that keeps the
 * bottom edge itself, the inset left to clear is 0.
 */
export function pinnedBar(safeBottom: number): ViewStyle {
  return { paddingHorizontal: GUTTER, paddingTop: SPACE.sm, paddingBottom: bottomRoom(safeBottom) };
}
