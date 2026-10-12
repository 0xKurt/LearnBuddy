// Screen frame: safe area, background, optional back button and title.
// Keyboard handling is left to screens with inputs (KeyboardAvoidingView).

import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { BuddyHeader, type BuddyHeaderProps } from './BuddyHeader.js';
import { useMore, type Contextual } from '../navigation/MoreProvider.js';
import { ReadAloudSwitch } from './ReadAloudSwitch.js';
import { CircleBtn } from './CircleBtn.js';
import { useTranslation } from 'react-i18next';
import { Glow } from './Glow.js';

type Props = {
  title?: string;
  back?: boolean;
  subtitle?: string;
  state?: BuddyHeaderProps['state'];
  progress?: BuddyHeaderProps['progress'];
  right?: ReactNode;
  contextual?: Contextual;
  menuDisabled?: boolean;
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
  contextual,
  menuDisabled = false,
  leading,
  footer,
  sound,
  children,
}: Props) {
  const { palette } = useTheme();
  const menu = useMore();
  const { t } = useTranslation('buddy');
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: palette.bg }}>
      {/* The same full-page background as the custom screen roots. */}
      <Glow />
      {(title || back || right || leading || footer) && (
        <BuddyHeader
          title={title ?? ''}
          subtitle={subtitle}
          state={state}
          progress={progress}
          trailing={
            right ??
            (menu ? (
              <CircleBtn
                plain
                icon="more"
                disabled={menuDisabled}
                accessibilityLabel={t('menu.title')}
                onPress={() => menu.open(contextual)}
              />
            ) : undefined)
          }
          footer={footer}
          sound={sound ?? <ReadAloudSwitch />}
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
