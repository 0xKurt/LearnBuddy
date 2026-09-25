// Keeps a focused input above the keyboard. KeyboardAvoidingView shrinks the
// ScrollView, but nothing scrolls a field that ends up behind the keyboard
// back into view — so after the keyboard animation the field is measured
// against the scroll content and scrolled near the top.
//
// Usage: <ScrollView ref={scroll}><View ref={content}>…</View></ScrollView>,
// and onFocus={() => reveal(inputRef.current)} on each input.

import { useCallback, useRef } from 'react';
import type { ScrollView, TextInput, View } from 'react-native';

const AFTER_KEYBOARD_MS = 280;
const SPACE_ABOVE = 96;

export function useRevealInput() {
  const scroll = useRef<ScrollView>(null);
  const content = useRef<View>(null);

  const reveal = useCallback((input: TextInput | null) => {
    setTimeout(() => {
      const inner = content.current;
      if (!input || !inner) return;
      input.measureLayout(
        inner,
        (_x, y) => scroll.current?.scrollTo({ y: Math.max(0, y - SPACE_ABOVE), animated: true }),
        () => undefined,
      );
    }, AFTER_KEYBOARD_MS);
  }, []);

  return { scroll, content, reveal };
}
