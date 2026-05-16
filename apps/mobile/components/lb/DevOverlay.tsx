// Dev-only floating menu. Mounted in the root layout so it floats above
// every screen in __DEV__. Pinned at top-right with a high zIndex; the
// button itself is a clearly-labeled red pill so it can't be missed.
// Tap → action sheet with reset + quick jumps.

import { router } from 'expo-router';
import { Alert, Pressable, Text, View } from 'react-native';

import { devResetAll } from '../../lib/dev/reset.js';

export function DevOverlay() {
  if (!__DEV__) return null;

  const open = () => {
    Alert.alert('Dev menu', undefined, [
      {
        text: '↺ Reset all (wipe local state)',
        style: 'destructive',
        onPress: async () => {
          await devResetAll();
          Alert.alert('Wiped', 'Shake → Reload in Expo Go to start fresh.');
        },
      },
      { text: '→ Language', onPress: () => router.replace('/(onboarding)/language' as never) },
      { text: '→ Welcome', onPress: () => router.replace('/(onboarding)/welcome') },
      { text: '→ Signup', onPress: () => router.replace('/(onboarding)/account-signup') },
      { text: '→ Login', onPress: () => router.replace('/login') },
      { text: '→ Home', onPress: () => router.replace('/(learner)/home') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 99999,
        elevation: 99999, // android
      }}
    >
      <Pressable
        onPress={open}
        hitSlop={16}
        style={({ pressed }) => ({
          position: 'absolute',
          top: 60,
          right: 12,
          backgroundColor: '#d1361c',
          paddingHorizontal: 10,
          paddingVertical: 6,
          borderRadius: 999,
          opacity: pressed ? 0.7 : 0.92,
          shadowColor: '#000',
          shadowOpacity: 0.25,
          shadowRadius: 4,
          shadowOffset: { width: 0, height: 2 },
          elevation: 6,
        })}
      >
        <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800', letterSpacing: 0.4 }}>
          DEV
        </Text>
      </Pressable>
    </View>
  );
}
