// Screen frame: safe area, background, optional back button and title.
// Keyboard handling is left to screens with inputs (KeyboardAvoidingView).

import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { HEADER } from '../../lib/theme/header.js';
import { BuddyHeader, type BuddyHeaderProps } from './BuddyHeader.js';
import { Glow } from './Glow.js';

type Props = {
  title?: string;
  back?: boolean;
  subtitle?: string;
  state?: BuddyHeaderProps['state'];
  progress?: BuddyHeaderProps['progress'];
  right?: ReactNode;
  leading?: BuddyHeaderProps['leading'];
  footer?: ReactNode;
  sound?: ReactNode;
  children: ReactNode;
};

export function Screen({
  title,
  subtitle,
  state,
  progress,
  back = false,
  right,
  leading,
  footer,
  sound,
  children,
}: Props) {
  const { palette } = useTheme();
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: palette.bg }}>
      {/* The same soft light as on Buddy's home, a little lower so content stays calm. */}
      <Glow height={HEADER.glow} />
      {(title || back || right || leading || footer) && (
        <BuddyHeader
          title={title ?? ''}
          subtitle={subtitle}
          state={state}
          progress={progress}
          trailing={right}
          footer={footer}
          sound={sound}
          leading={
            leading ??
            (back
              ? {
                  icon: 'back',
                  onPress: () => (router.canGoBack() ? router.back() : router.replace('/')),
                }
              : undefined)
          }
        />
      )}
      {children}
    </SafeAreaView>
  );
}
