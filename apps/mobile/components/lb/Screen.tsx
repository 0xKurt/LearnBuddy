// Screen frame: safe area, background, optional back button and title.
// Keyboard handling is left to screens with inputs (KeyboardAvoidingView).

import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { CircleBtn } from './CircleBtn.js';
import { Glow } from './Glow.js';

type Props = {
  title?: string;
  back?: boolean;
  right?: ReactNode;
  children: ReactNode;
};

export function Screen({ title, back = false, right, children }: Props) {
  const { palette } = useTheme();
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: palette.bg }}>
      {/* The same soft light as on Buddy's home, a little lower so content stays calm. */}
      <Glow height={260} />
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
            // minWidth 0: a title of one long word ("Reaktionsgleichungen") ends in "…" instead of
            // pushing the button beside it off a 360 pt screen — and on ONE line, because a
            // second line could only hold the word's last letters (issue #239, #287).
            <Text
              accessibilityRole="header"
              numberOfLines={/\s/.test(title.trim()) ? 2 : 1}
              style={[TYPE.title, { flex: 1, minWidth: 0 }]}
            >
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
