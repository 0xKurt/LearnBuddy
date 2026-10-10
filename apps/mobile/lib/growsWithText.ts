// A multiline field that grows with what she types — on the web too (issue #188).
//
// A multiline field is a `<textarea>` in the browser, and a textarea keeps the height it
// started with: her long sentence scrolled away inside one row there, while the same field
// stood over three lines on her phone. The browser can size the control to its content
// itself, between the minHeight and maxHeight the field already carries, and it shrinks
// again when she deletes — so no second measuring of our own, and the two builds behave
// alike.
//
// Only once she has typed: an empty field's content is its placeholder, and the browser sizes it
// to that too. In a narrow bar — the camera, a unit chip ("in cm²"), the mic and the waveform
// beside it — "Deine Antwort …" wrapped onto a second line, the empty bar grew by that line, and
// with the keyboard up on 360×740 the screen ran past the window and cut the header's controls
// (#387). Empty, the field keeps its one row and clips what of the placeholder does not fit: its
// end stays out of sight, and the field is no box that scrolls a hidden second placeholder line.
//
// It also ends a blind spot: the browser walkthrough could not reach the multi-line state
// at all, which is how the misalignment of #187 got past it.
//
// React Native's style types do not know the property; the web renderer passes it on, and
// an engine that does not know it leaves the single row we had before.

import { Platform, type TextStyle } from 'react-native';

const CONTENT = { fieldSizing: 'content' } as unknown as TextStyle;
const ONE_ROW: TextStyle = { overflow: 'hidden' };

/** How a multiline field sizes in the browser: with `value`, or one clipped row while empty. */
export function growsWithText(value: string): TextStyle | null {
  if (Platform.OS !== 'web') return null;
  return value === '' ? ONE_ROW : CONTENT;
}
