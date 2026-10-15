// What ⋯ in the head opens — on every screen the same sheet, wired once (#599, owner rule 1;
// Engineering-Regel 3; design ui_kits/app/App.jsx:125–134, one menu for the whole app). The six
// places are always there (`MenuSheet`); a screen may put its own action before them: the chat
// the way into its start sheet (`StartSheets`), a sheet its renaming. Each row closes the sheet
// first — some open a sheet of their own, and two modals in one frame do not come up on iOS.

import { router, usePathname, type Href } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { preloadPlaces } from '../../lib/api/queries.js';
import { askAttach, attachInChat } from '../../lib/capture/attachRequest.js';
import { tapped } from '../../lib/perf.js';
import { useShown } from '../../lib/perfShown.js';
import { MenuSheet, type MenuAction, type Place } from './MenuSheet.js';

/** iOS can't present a sheet while another one is still sliding away. */
export const SHEET_SWAP_MS = Platform.OS === 'ios' ? 450 : 0;

/** The chat: where a photo is taken (lib/capture/attachRequest.ts). */
const CHAT = '/buddy';

const ROUTE: Record<Exclude<Place, 'capture'>, Href> = {
  library: '/library',
  memory: '/memory',
  history: '/history',
  settings: '/settings',
  profile: '/settings/profile',
};

type Props = {
  visible: boolean;
  onClose: () => void;
  /** What this screen adds before the places, in her own words. */
  actions?: readonly MenuAction[];
  /** False while one of them would race something in flight. */
  canAct?: boolean;
};

export function HeaderMenu({ visible, onClose, actions = [], canAct = true }: Props) {
  const here = usePathname();
  useShown('menu', visible);
  // The places she may tap load while the menu stands open (#711).
  useEffect(() => {
    if (visible) preloadPlaces();
  }, [visible]);
  const leave = (go: () => void): void => {
    onClose();
    setTimeout(go, SHEET_SWAP_MS);
  };
  const open = (place: Place): void => {
    // "Blatt fotografieren" is no page (owner 12.10.: photos go through the chat bar): the
    // chat's bar opens its camera — from any other screen after going back to the chat.
    if (place === 'capture') {
      if (here === CHAT) askAttach({ open: 'camera' });
      else attachInChat({ open: 'camera' });
      return;
    }
    // The place she is already in: the sheet closes and she is there, not there twice.
    if (ROUTE[place] === here) return;
    // How long until the place shows, and until its content is there (issue #711).
    tapped(place);
    tapped(`${place}_data`);
    router.push(ROUTE[place]);
  };
  return (
    <MenuSheet
      visible={visible}
      actions={actions.map((action) => ({ ...action, onPress: () => leave(action.onPress) }))}
      canAct={canAct}
      onGo={(place) => leave(() => open(place))}
      onClose={onClose}
    />
  );
}
