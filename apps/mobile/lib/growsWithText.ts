// A multiline field that grows with what she types — on the web too (issue #188).
//
// A multiline field is a `<textarea>` in the browser, and a textarea keeps the height it
// started with: her long sentence scrolled away inside one row there, while the same field
// stood over three lines on her phone. The browser can size the control to its content
// itself, between the minHeight and maxHeight the field already carries, and it shrinks
// again when she deletes — so no second measuring of our own, and the two builds behave
// alike.
//
// It also ends a blind spot: the browser walkthrough could not reach the multi-line state
// at all, which is how the misalignment of #187 got past it.
//
// React Native's style types do not know the property; the web renderer passes it on, and
// an engine that does not know it leaves the single row we had before.

import { Platform, type TextStyle } from 'react-native';

export const growsWithText: TextStyle | null =
  Platform.OS === 'web' ? ({ fieldSizing: 'content' } as unknown as TextStyle) : null;
