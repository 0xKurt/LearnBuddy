// The ⋯ menu on Buddy's home and what it leads to (issue #174, #599). The menu is the same list
// of places on every screen (`HeaderMenu`); the chat puts one row before them — the way into the
// start sheet "Was willst du üben?" (design ui_kits/app/Extra.jsx `StartSheet`), which lists the
// ways to start. Those ways and the sheets they open are a domain's (components/buddy/
// extensions.ts `startMenu`, issue #107): the learning domain's test, homework, speaking and
// vocabulary. Without one there is no such row: the menu holds only the places.

import type { BuddyHome } from '@learnbuddy/shared-types/contracts';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ChoiceSheet } from './ChoiceSheet.js';
import { startMenu } from './extensions.js';
import { HeaderMenu, SHEET_SWAP_MS } from '../lb/HeaderMenu.js';

export { SHEET_SWAP_MS } from '../lb/HeaderMenu.js';

/** The core's own sheet: the ways to start. Every other name is one of the domain's sheets. */
const START = 'start';

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
  // The start sheet's words are the learning domain's and exist once (`learn:topic.practice`).
  const { t } = useTranslation(['buddy', 'learn']);
  /** The sheet that is up, by name; null: none. */
  const [sheet, setSheet] = useState<string | null>(null);
  const menu = startMenu.get();
  const ways = menu?.items(next, t, { send, open: setSheet }) ?? [];
  const title = t('learn:topic.practice.title');

  return (
    <>
      <HeaderMenu
        visible={menuOpen}
        actions={
          ways.length > 0
            ? [
                {
                  key: START,
                  icon: 'practice',
                  label: title,
                  leads: true,
                  onPress: () => setSheet(START),
                },
              ]
            : undefined
        }
        canAct={canStart}
        onClose={onCloseMenu}
      />
      <ChoiceSheet
        visible={sheet === START}
        title={title}
        onClose={() => setSheet(null)}
        choices={ways.map((way) => ({
          label: way.label,
          icon: way.icon,
          // The start sheet closes first: a way may open a sheet of its own.
          onPress: () => {
            setSheet(null);
            setTimeout(way.onPress, SHEET_SWAP_MS);
          },
        }))}
      />
      {menu ? <menu.Sheets open={sheet === START ? null : sheet} onOpen={setSheet} /> : null}
    </>
  );
}
