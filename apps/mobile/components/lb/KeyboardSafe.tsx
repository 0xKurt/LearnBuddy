// One place decides how a screen gets out of the keyboard's way (issue #46).
//
// Android resizes the window itself (`softwareKeyboardLayoutMode: "resize"`, Expo's
// default): a KeyboardAvoidingView with `behavior="height"` then shrinks the screen a
// second time, and the band of empty space that leaves below the pinned bar is what the
// owner saw on every screen with a field (28.09.). So: iOS pads, Android does nothing —
// the window is already the right size.
//
// Screens with a form pin their CTA inside this view and outside the ScrollView
// (CLAUDE.md rule 15); `app/welcome.tsx` is the reference.

import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, type ViewStyle } from 'react-native';

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
  return (
    <KeyboardAvoidingView
      style={style ?? { flex: 1 }}
      {...(Platform.OS === 'ios' ? { behavior: 'padding' as const } : {})}
      enabled={enabled}
    >
      {children}
    </KeyboardAvoidingView>
  );
}
