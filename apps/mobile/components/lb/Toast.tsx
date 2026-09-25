// One short message at the bottom (errors, confirmations). Screen readers
// hear it as a live region.

import { useEffect } from 'react';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';

import { LB } from '../../lib/theme/colors.js';

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
          backgroundColor: tone === 'error' ? LB.danger : LB.ink,
          borderRadius: 14,
          paddingHorizontal: 16,
          paddingVertical: 12,
          maxWidth: 520,
        }}
      >
        <Text style={{ color: '#fff', fontSize: 15, lineHeight: 21 }}>{message}</Text>
      </View>
    </View>
  );
}
