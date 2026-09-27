// One short message at the bottom (errors, confirmations). Screen readers
// hear it (a live region on Android and the web, an announcement on iOS), and it
// sits above the keyboard on iOS, where it used to hide behind it (audit M-76, M-80). Looks: a dark pill floating on a soft shadow; an
// error also carries a round warning mark (never colour alone).

import { useEffect, useState } from 'react';
import { Keyboard, Platform, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';

import { announce } from '../../lib/announce.js';
import { LB } from '../../lib/theme/colors.js';
import { SHADOW } from '../../lib/theme/shadow.js';

export type ToastTone = 'info' | 'error';

type ToastState = { message: string | null; tone: ToastTone; seq: number };

const useToastStore = create<ToastState>(() => ({ message: null, tone: 'info', seq: 0 }));

export const toast = {
  show(message: string, tone: ToastTone = 'info'): void {
    useToastStore.setState((s) => ({ message, tone, seq: s.seq + 1 }));
  },
  hide(): void {
    useToastStore.setState({ message: null });
  },
  /** Hides this message if it is the one showing (it no longer holds), leaves any other. */
  dismiss(message: string): void {
    useToastStore.setState((s) => (s.message === message ? { message: null } : s));
  },
};

export function ToastHost() {
  const { message, tone, seq } = useToastStore();
  const insets = useSafeAreaInsets();
  const keyboard = useIosKeyboardHeight();
  useEffect(() => {
    if (!message) return;
    announce(message, { liveRegion: true });
    const timer = setTimeout(() => toast.hide(), 4500);
    return () => clearTimeout(timer);
  }, [message, seq]);
  if (!message) return null;
  return (
    <View
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
      style={{
        position: 'absolute',
        left: 16,
        right: 16,
        bottom: Math.max(insets.bottom + 90, keyboard + 16),
        alignItems: 'center',
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          backgroundColor: LB.ink,
          borderRadius: 26,
          paddingHorizontal: 20,
          paddingVertical: 13,
          maxWidth: 520,
          ...SHADOW.float,
        }}
      >
        {tone === 'error' ? (
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={{
              width: 22,
              height: 22,
              borderRadius: 11,
              backgroundColor: LB.peachDeep,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: LB.ink, fontSize: 14, lineHeight: 18, fontWeight: '700' }}>
              !
            </Text>
          </View>
        ) : null}
        <Text style={{ flexShrink: 1, color: LB.paper, fontSize: 15, lineHeight: 21 }}>
          {message}
        </Text>
      </View>
    </View>
  );
}

/**
 * iOS: how much of the screen the keyboard covers (0 when hidden). Android resizes the
 * window for the keyboard, so the toast is above it already.
 */
function useIosKeyboardHeight(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    const show = Keyboard.addListener('keyboardWillShow', (e) =>
      setHeight(e.endCoordinates.height),
    );
    const hide = Keyboard.addListener('keyboardWillHide', () => setHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return height;
}
