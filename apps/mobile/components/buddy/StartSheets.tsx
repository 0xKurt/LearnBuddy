// The ⋯ menu on Buddy's home and the sheets its ways to start can open (issue #174). The ways to
// start and their sheets are a domain's (components/buddy/extensions.ts `startMenu`, issue #107):
// the learning domain's homework, vocabulary, speaking and test. Without one the menu holds only
// the places. The sheet itself, and the tick it leaves before a way opens the next one, is the
// same on every screen (`HeaderMenu`).

import type { BuddyHome } from '@learnbuddy/shared-types/contracts';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { startMenu } from './extensions.js';
import { HeaderMenu } from './HeaderMenu.js';

export { SHEET_SWAP_MS } from './HeaderMenu.js';

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

  return (
    <>
      <HeaderMenu
        visible={menuOpen}
        actions={menu?.items(next, t, { send, open: setSheet })}
        canAct={canStart}
        onClose={onCloseMenu}
      />
      {menu ? <menu.Sheets open={sheet} onOpen={setSheet} /> : null}
    </>
  );
}
