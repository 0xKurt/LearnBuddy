// Buddy pointed to a part of the app ("Zeig mir meine Blätter", "Ich will
// die Sprache ändern"): one button that opens it. Nothing happens on its own.
// A photo is no screen of its own (issue #519): its button opens the chat's + menu.
import type { ActionSummary } from '@learnbuddy/shared-types/contracts';
import { router, usePathname, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { askAttach, attachInChat } from '../../lib/capture/attachRequest.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { SHADOW } from '../../lib/theme/shadow.js';
import { TYPE } from '../../lib/theme/type.js';
import { circle, RADIUS } from '../../lib/theme/radius.js';
import { CARD_PAD, SPACE } from '../../lib/theme/space.js';
import { Btn } from '../lb/Btn.js';
import { Icon, type IconName } from '../lb/Icon.js';

type Area = Extract<ActionSummary, { tool: 'open_area' }>['area'];

const AREA_ROUTE: Record<Exclude<Area, 'capture'>, Href> = {
  library: '/library',
  memory: '/memory',
  settings: '/settings',
  history: '/history',
};

/** The chat: where a photo is taken (lib/capture/attachRequest.ts). */
const CHAT = '/buddy';

const AREA_ICON: Record<Area, IconName> = {
  library: 'folder',
  memory: 'bulb',
  settings: 'shield',
  history: 'clock',
  capture: 'camera',
};

/** The round mark with the area's icon. */
const DISC = 40;

export function AreaCard({ area }: { area: Area }) {
  const { palette } = useTheme();
  const { t } = useTranslation('buddy');
  const here = usePathname();
  const label = t(`area.${area}`);
  // Already there (the history shows Buddy's "Verlauf" card too): no second copy of the
  // same screen on the stack (p2-history-areacard-stacks-history).
  if (area !== 'capture' && here === AREA_ROUTE[area]) return null;
  const open = () => {
    if (area !== 'capture') router.push(AREA_ROUTE[area]);
    else if (here === CHAT) askAttach({ open: 'menu' });
    else attachInChat({ open: 'menu' });
  };
  return (
    <View
      style={[
        {
          backgroundColor: palette.paper,
          borderRadius: RADIUS.item,
          padding: CARD_PAD.snug,
          flexDirection: 'row',
          alignItems: 'center',
          gap: SPACE.md,
        },
        SHADOW.soft,
      ]}
    >
      <View
        style={{
          width: DISC,
          height: DISC,
          borderRadius: circle(DISC),
          backgroundColor: palette.lavender,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name={AREA_ICON[area]} size={20} color={palette.primary} />
      </View>
      <Text style={[TYPE.body, { flex: 1, fontWeight: '600' }]}>{label}</Text>
      <Btn size="sm" pill onPress={open} accessibilityLabel={t('area.open_label', { what: label })}>
        {t('area.open')}
      </Btn>
    </View>
  );
}
