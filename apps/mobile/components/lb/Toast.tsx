// One short message at the bottom (errors, confirmations). Screen readers
// hear it as a live region. Looks: a dark pill floating on a soft shadow; an
// error also carries a round warning mark (never colour alone).

import { useEffect } from 'react';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';

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
};

export function ToastHost() {
  const { message, tone, seq } = useToastStore();
  const insets = useSafeAreaInsets();
  useEffect(() => {
    if (!message) return;
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
        bottom: insets.bottom + 90,
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
