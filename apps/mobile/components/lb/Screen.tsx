// Screen frame: safe area, background, optional back button and title.
// Keyboard handling is left to screens with inputs (KeyboardAvoidingView).

import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LB } from '../../lib/theme/colors.js';
import { TYPE } from '../../lib/theme/type.js';
import { CircleBtn } from './CircleBtn.js';

type Props = {
  title?: string;
  back?: boolean;
  right?: ReactNode;
  children: ReactNode;
};

export function Screen({ title, back = false, right, children }: Props) {
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: LB.bg }}>
      {(title || back || right) && (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            paddingHorizontal: 16,
            paddingVertical: 8,
            minHeight: 52,
          }}
        >
          {back && (
            <CircleBtn
              icon="back"
              onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
            />
          )}
          {title ? (
            <Text accessibilityRole="header" numberOfLines={1} style={[TYPE.title, { flex: 1 }]}>
              {title}
            </Text>
          ) : (
            <View style={{ flex: 1 }} />
          )}
          {right}
        </View>
      )}
      {children}
    </SafeAreaView>
  );
}
