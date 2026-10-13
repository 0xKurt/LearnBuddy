// What ⋯ in the head opens — on every screen the same sheet, wired once (#599, owner rule 1;
// Engineering-Regel 3). The places are always there (`MenuSheet`); a screen may put its own ways
// before them: the chat its ways to start (`StartSheets`), a practice question its one quiet
// action. Each way closes the sheet first — some open a sheet of their own, and two modals in
// one frame do not come up on iOS.

import { router, usePathname } from 'expo-router';
import { Platform } from 'react-native';

import { MenuSheet, type StartItem } from './MenuSheet.js';

/** iOS can't present a sheet while another one is still sliding away. */
export const SHEET_SWAP_MS = Platform.OS === 'ios' ? 450 : 0;

type Props = {
  visible: boolean;
  onClose: () => void;
  /** What this screen adds before the places, in her own words. */
  actions?: readonly StartItem[];
  /** False while one of them would race something in flight. */
  canAct?: boolean;
};

export function HeaderMenu({ visible, onClose, actions = [], canAct = true }: Props) {
  const here = usePathname();
  const leave = (go: () => void): void => {
    onClose();
    setTimeout(go, SHEET_SWAP_MS);
  };
  return (
    <MenuSheet
      visible={visible}
      start={actions.map((action) => ({ ...action, onPress: () => leave(action.onPress) }))}
      canStart={canAct}
      // The place she is already in: the sheet closes and she is there, not there twice.
      onGo={(path) => leave(() => (path === here ? undefined : router.push(path)))}
      onClose={onClose}
    />
  );
}
