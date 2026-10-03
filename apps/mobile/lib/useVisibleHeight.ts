// How tall the screen really is right now: the window less what the keyboard covers.
//
// Since edge-to-edge, Android keeps the window's height while the keyboard is up (#141), so
// `useWindowDimensions().height` says ~873 on a phone that shows ~567. A screen that decides
// its layout on that number stays roomy behind the keyboard — fields and their errors vanish
// under the pinned CTA (issue #289). This hook measures like components/lb/KeyboardSafe.tsx
// does: what the keyboard covers minus what the window already gave up by itself
// (lib/keyboard.ts), so a device that still resizes counts the keyboard once, not twice.

import { useRef } from 'react';
import { useWindowDimensions } from 'react-native';

import { keyboardOverlap, visibleHeight } from './keyboard.js';
import { useKeyboardHeight } from './useKeyboardHeight.js';

export type VisibleHeight = {
  /** The window's height, keyboard or not. */
  window: number;
  /** What the keyboard covers of it (0 while it is closed). */
  overlap: number;
  /** What is left to show the screen in. */
  visible: number;
};

export function useVisibleHeight(): VisibleHeight {
  const { height } = useWindowDimensions();
  const keyboard = useKeyboardHeight();
  // The window's height with no keyboard on screen: a measurement, not state to render from.
  const base = useRef(height);
  if (keyboard === 0) base.current = height;
  const overlap = keyboardOverlap(keyboard, base.current, height);
  return { window: height, overlap, visible: visibleHeight(height, overlap) };
}
