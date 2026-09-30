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
