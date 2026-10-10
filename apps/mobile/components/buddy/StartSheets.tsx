// The ⋯ menu on Buddy's home and the sheets its ways to start can open (issue #174). The ways to
// start and their sheets are a domain's (components/buddy/extensions.ts `startMenu`, issue #107):
// the learning domain's homework, vocabulary, speaking and test. Without one the menu holds only
// the places. Each way closes the sheet it came from first: two modals in one frame do not come
// up on iOS.

import type { BuddyHome } from '@learnbuddy/shared-types/contracts';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform } from 'react-native';

import { startMenu } from './extensions.js';
import { MenuSheet } from './MenuSheet.js';

/** iOS can't present a sheet while another one is still sliding away. */
export const SHEET_SWAP_MS = Platform.OS === 'ios' ? 450 : 0;

type Props = {
  menuOpen: boolean;
  onCloseMenu: () => void;
  next: BuddyHome['next'];
  /** Says it to Buddy, as if she had written it. */
  send: (text: string) => void;
  /** Nothing new starts while Buddy is answering. */
  canStart: boolean;
};

export function StartSheets({ menuOpen, onCloseMenu, next, send, canStart }: Props) {
  const { t } = useTranslation('buddy');
  /** The domain's sheet that is up, by its own name; null: none. */
  const [sheet, setSheet] = useState<string | null>(null);
  const menu = startMenu.get();

  /** Same from the ⋯ menu: some of the ways to start open a sheet of their own (#174). */
  function fromMenu(go: () => void): void {
    onCloseMenu();
    setTimeout(go, SHEET_SWAP_MS);
  }

  return (
    <>
      <MenuSheet
        visible={menuOpen}
        // Each way to start closes the sheet first: some of them open a sheet of their
        // own, and two modals in one frame do not come up on iOS.
        start={(menu?.items(next, t, { send, open: setSheet }) ?? []).map((i) => ({
          ...i,
          onPress: () => fromMenu(i.onPress),
        }))}
        canStart={canStart}
        onGo={(path) => fromMenu(() => router.push(path))}
        onClose={onCloseMenu}
      />
      {menu ? <menu.Sheets open={sheet} onOpen={setSheet} /> : null}
    </>
  );
}
