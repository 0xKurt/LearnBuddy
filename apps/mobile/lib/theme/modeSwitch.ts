// What the light/dark switch offers, as a decision on its own (issue #222).
//
// "Wie das Handy" is the DEFAULT behaviour, not a third card — that decision stands with the
// owner's own words in `components/lb/LookChoice.tsx` (#172). The consequence nobody intended:
// the switch sets only light or dark, so once she touched it there was no way back short of
// setting the device up again.
//
// The way back is a long press. A long press is invisible — to anyone who does not know it is
// there, and in particular to a screen reader — so it is announced twice: the hint says it, and
// it is also a NAMED accessibility action, which a rotor can find.
//
// This lives here rather than inline in the component because the component layer of this repo
// renders through react-native-web, where a `Pressable`'s props are not in the DOM and cannot be
// asserted. A decision that cannot be tested where it is written goes where it can be.

import type { Mode } from './palettes.js';

export type ModeSwitch = {
  /** She has chosen a side; the app no longer follows the phone. */
  pinned: boolean;
  /** The locale key for the hint under the switch. */
  hint: 'look.mode_hint' | 'look.mode_hint_pinned';
  /** The name of the accessibility action, or null while there is nothing to undo. */
  backAction: 'follow-system' | null;
};

export function modeSwitch(mode: Mode): ModeSwitch {
  const pinned = mode !== 'system';
  return {
    pinned,
    hint: pinned ? 'look.mode_hint_pinned' : 'look.mode_hint',
    backAction: pinned ? 'follow-system' : null,
  };
}
