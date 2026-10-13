// The chat's head: the brand title beside Buddy, whose state the chat supplies, and its menu —
// the same head as every screen (`BuddyHeader`), with the ways to start in its ⋯ (`StartSheets`).
import { useTranslation } from 'react-i18next';
import { HEADER } from '../../lib/theme/header.js';
import { BuddyHeader } from '../lb/BuddyHeader.js';
import type { MoonState } from '../lb/BuddyOrb.js';

export const HEADER_HEIGHT = HEADER.height;

export function Header({ state = 'idle', onMenu }: { state?: MoonState; onMenu: () => void }) {
  const { t } = useTranslation('buddy');
  return (
    <BuddyHeader title={t('brand')} state={state} testID="home-header" menu={{ onPress: onMenu }} />
  );
}
