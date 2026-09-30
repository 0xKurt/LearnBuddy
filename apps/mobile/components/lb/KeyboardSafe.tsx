// One place decides how a screen gets out of the keyboard's way (issues #46, #141).
//
// iOS: a KeyboardAvoidingView with `behavior="padding"`, which has always been right.
//
// Android: it used to be enough to do nothing, because the window shrank itself
// (`softwareKeyboardLayoutMode: "resize"`, Expo's default) and a second KeyboardAvoiding-
// View left the empty band under the pinned bar that the owner saw on 28.09. (#46).
// Since edge-to-edge that no longer holds: Android 15 and up ignore `adjustResize` for a
// borderless app, the window keeps its height, and the typing bar sits behind the
// keyboard — "man sieht gar nicht was man schreibt" (owner's daughter, 30.09., #141).
//
// So Android neither assumes nor guesses: it measures its own height with and without
// the keyboard and pads by what the window did NOT take away (lib/keyboard.ts). A device
// that still resizes gets 0 and behaves exactly as before.
//
// Screens with a form pin their CTA inside this view and outside the ScrollView
// (CLAUDE.md rule 15); `app/welcome.tsx` is the reference.

import { type ReactNode, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  type LayoutChangeEvent,
  Platform,
  View,
  type ViewStyle,
} from 'react-native';

import { keyboardOverlap } from '../../lib/keyboard.js';
import { useKeyboardHeight } from '../../lib/useKeyboardHeight.js';

export function KeyboardSafe({
  children,
  style,
  enabled = true,
}: {
  children: ReactNode;
  style?: ViewStyle;
  /** Off while the screen is not the one in front (a modal over it keeps its own). */
  enabled?: boolean;
}) {
  if (Platform.OS === 'ios') {
    return (
      <KeyboardAvoidingView style={style ?? { flex: 1 }} behavior="padding" enabled={enabled}>
        {children}
      </KeyboardAvoidingView>
    );
  }
  return (
    <AndroidKeyboardSafe style={style} enabled={enabled}>
      {children}
    </AndroidKeyboardSafe>
  );
}

function AndroidKeyboardSafe({
  children,
  style,
  enabled,
}: {
  children: ReactNode;
  style?: ViewStyle;
  enabled: boolean;
}) {
  const keyboard = useKeyboardHeight();
  const [height, setHeight] = useState(0);
  // The height with no keyboard on screen, kept in a ref: it is a measurement, not state
  // to render from, and writing it must not cost a second pass.
  const base = useRef(0);
  const onLayout = (e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    if (keyboard === 0) base.current = h;
    setHeight(h);
  };
  const overlap = enabled ? keyboardOverlap(keyboard, base.current, height) : 0;
  return (
    <View onLayout={onLayout} style={[style ?? { flex: 1 }, { paddingBottom: overlap }]}>
      {children}
    </View>
  );
}
