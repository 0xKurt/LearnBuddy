// How much of the screen the keyboard really covers — the one calculation both the
// screens (components/lb/KeyboardSafe.tsx) and the toast use.
//
// Android used to shrink the app's window for the keyboard (`adjustResize`), so nothing
// had to be done: issue #46. Since edge-to-edge that is no longer true — Android 15 and
// up ignore `adjustResize` for a borderless app, the window keeps its size, and the
// typing bar ends up behind the keyboard. That is what the owner's daughter ran into on
// the very first day of testing (30.09., issue #141).
//
// The fix is not the opposite assumption: older devices and non-borderless builds still
// resize, and padding them again would bring back exactly the empty band of #46. So we
// measure both and pad only by what the window did not already take away.

/**
 * @param keyboard   what the OS reports as the keyboard's height (0 while it is closed)
 * @param baseHeight the view's height with no keyboard on screen
 * @param height     the view's height right now
 */
export function keyboardOverlap(keyboard: number, baseHeight: number, height: number): number {
  if (keyboard <= 0 || baseHeight <= 0) return 0;
  // What the window gave up by itself. Never negative: a rotation or a split screen can
  // make the view taller, and that is not room the keyboard handed back.
  const shrank = Math.max(0, baseHeight - height);
  return Math.max(0, keyboard - shrank);
}

/**
 * The height a screen really has to show itself in: the window less what the keyboard covers
 * (`overlap`, from `keyboardOverlap`). Since edge-to-edge the window keeps its height while she
 * types, so a layout decided on the window alone stays in its roomy form behind the keyboard
 * (issue #289).
 */
export function visibleHeight(windowHeight: number, overlap: number): number {
  return Math.max(0, windowHeight - Math.max(0, overlap));
}

/**
 * Below this many points of visible height a form screen takes its tighter layout — a
 * 360×740 phone, or any phone with the keyboard up (issues #55, #289). The one place the
 * number stands.
 */
export const COMPACT_BELOW = 780;

/**
 * Below this, only the form itself still fits: what no phone is upright with the keyboard
 * closed, and every phone is while she types (POCO X3 567, 390×844 ~508, 360×740 ~440 —
 * issue #289). A screen then keeps its headline and its fields and lets the rest wait until
 * the keyboard goes.
 */
export const TIGHT_BELOW = 600;

export type FormDensity = 'roomy' | 'compact' | 'tight';

/** How much a form screen may show, from what is visible — never from the window alone (#289). */
export function formDensity(windowHeight: number, overlap: number): FormDensity {
  const visible = visibleHeight(windowHeight, overlap);
  if (visible < TIGHT_BELOW) return 'tight';
  return visible < COMPACT_BELOW ? 'compact' : 'roomy';
}

/**
 * While she types her question with the keyboard up, the answer folds away whole (issue #402):
 * not drawn, so no row of tiles stands cut at the slot's edge (rule 17), and a board gives no
 * room it no longer holds. Back unchanged when the keyboard goes.
 */
export function answerFolds(asking: boolean, windowHeight: number, overlap: number): boolean {
  return asking && formDensity(windowHeight, overlap) === 'tight';
}
