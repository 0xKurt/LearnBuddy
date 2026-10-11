// Chat adapter: the container supplies Buddy state, sound behavior and a functional menu.
import { useTranslation } from 'react-i18next';
import { HEADER } from '../../lib/theme/header.js';
import { BuddyHeader } from '../lb/BuddyHeader.js';
import type { MoonState } from '../lb/BuddyOrb.js';
import { CircleBtn } from '../lb/CircleBtn.js';
import { ReadAloudSwitch } from '../lb/ReadAloudSwitch.js';

export const HEADER_HEIGHT = HEADER.height;

export function Header({ state = 'idle', onMenu }: { state?: MoonState; onMenu: () => void }) {
  const { t } = useTranslation('buddy');
  return (
    <BuddyHeader
      brand
      title={t('brand')}
      state={state}
      testID="home-header"
      sound={<ReadAloudSwitch />}
      trailing={
        <CircleBtn plain icon="more" onPress={onMenu} accessibilityLabel={t('menu.title')} />
      }
    />
  );
}
