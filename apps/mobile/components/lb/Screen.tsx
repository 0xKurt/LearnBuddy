// Screen frame: safe area, background and — as soon as the screen has a title or a way back —
// the one head of the app (`BuddyHeader`): Buddy's orb in the state the screen gives it, the
// Vorlesen switch and ⋯, which opens the same menu everywhere (`HeaderMenu`, #599).
// Keyboard handling is left to screens with inputs (KeyboardAvoidingView).

import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { HeaderMenu } from '../buddy/HeaderMenu.js';
import type { StartItem } from '../buddy/MenuSheet.js';
import { BuddyHeader, type BuddyHeaderProps } from './BuddyHeader.js';
import { Glow } from './Glow.js';

type Props = {
  title?: string;
  back?: boolean;
  subtitle?: string;
  /** What is happening on this screen, as the orb's pose; idle when nothing is. */
  state?: BuddyHeaderProps['state'];
  progress?: BuddyHeaderProps['progress'];
  leading?: BuddyHeaderProps['leading'];
  footer?: ReactNode;
  /**
   * Nothing: ⋯ opens the shared menu. `actions`: what this screen puts into it before the places
   * (renaming a sheet), and whether it can be taken right now. `own`: the ⋯ this screen still
   * draws itself, with its own sheet. `null`: no ⋯ at all — only where the menu would mislead.
   * The last two are exceptions on a list (lib/__tests__/headerShell.test.ts).
   */
  menu?: { actions: readonly StartItem[]; canAct?: boolean } | { own: ReactNode } | null;
  /** The card pass's own right end, in place of the switch and ⋯ (`BuddyHeader.trailing`). */
  right?: ReactNode;
  /** No longer read: the head carries the Vorlesen switch itself. Callers drop it (#599). */
  sound?: ReactNode;
  children: ReactNode;
};

export function Screen({
  title,
  subtitle,
  state,
  progress,
  back = false,
  leading,
  footer,
  menu,
  right,
  children,
}: Props) {
  const { palette } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const headed = Boolean(title || back || right || leading || footer);
  const own = menu && 'own' in menu ? menu : null;
  const added = menu && 'actions' in menu ? menu : null;
  const shared = headed && menu !== null && own === null && right === undefined;
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: palette.bg }}>
      {/* The same full-page background as the custom screen roots. */}
      <Glow />
      {headed ? (
        <BuddyHeader
          title={title ?? ''}
          subtitle={subtitle}
          state={state}
          progress={progress}
          trailing={right}
          footer={footer}
          menu={shared ? { onPress: () => setMenuOpen(true) } : own}
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
      ) : null}
      {children}
      {shared ? (
        <HeaderMenu
          visible={menuOpen}
          actions={added?.actions}
          canAct={added?.canAct}
          onClose={() => setMenuOpen(false)}
        />
      ) : null}
    </SafeAreaView>
  );
}
