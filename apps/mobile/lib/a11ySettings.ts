// Two accessibility settings the OS offers and the app ignored (issue #133 position 13).
//
// **Bold Text** (iOS) / **Bold font** (Android): someone who turns it on is saying that thin
// type is hard for them to read. The app's own hierarchy is carried by weight — one bold
// headline per screen, 500 for a status line, 400 for body — so honouring it means lifting
// everything by a step, not replacing the scale.
//
// **Reduce Transparency**: the app's calm comes from soft gradients and a veil behind a
// sheet. For someone who turns this on, those are exactly what makes text hard to find. The
// decorative glow goes; the ground stays a solid colour from the palette, so nothing ends up
// unreadable (the veil behind a modal becomes opaque rather than disappearing — it is what
// separates the sheet from the screen).
//
// Read once and then followed: both can be changed while the app runs.

import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

export type A11ySettings = {
  /** The OS asks for heavier type. */
  boldText: boolean;
  /** The OS asks for no see-through surfaces. */
  reduceTransparency: boolean;
};

const OFF: A11ySettings = { boldText: false, reduceTransparency: false };

export function useA11ySettings(): A11ySettings {
  const [value, setValue] = useState<A11ySettings>(OFF);
  useEffect(() => {
    let alive = true;
    const set = (patch: Partial<A11ySettings>) =>
      alive ? setValue((v) => ({ ...v, ...patch })) : undefined;
    void AccessibilityInfo.isBoldTextEnabled?.()
      .then((on) => set({ boldText: on }))
      .catch(() => undefined);
    void AccessibilityInfo.isReduceTransparencyEnabled?.()
      .then((on) => set({ reduceTransparency: on }))
      .catch(() => undefined);
    const subs = [
      AccessibilityInfo.addEventListener('boldTextChanged', (on) => set({ boldText: on })),
      AccessibilityInfo.addEventListener('reduceTransparencyChanged', (on) =>
        set({ reduceTransparency: on }),
      ),
    ];
    return () => {
      alive = false;
      for (const s of subs) s.remove();
    };
  }, []);
  return value;
}
