// Buddy pointed to a part of the app ("Zeig mir meine Blätter", "Ich will
// die Sprache ändern"): one button that opens it. Nothing happens on its own.
// A photo is no screen of its own (issue #519): its button opens the chat's + menu.
// Drawn as the thread's one card (`ChatCard`, #599).
import type { ActionSummary } from '@learnbuddy/shared-types/contracts';
import { router, usePathname, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { askAttach, attachInChat } from '../../lib/capture/attachRequest.js';
import type { IconName } from '../lb/Icon.js';
import { ChatCard } from './ChatCard.js';

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

export function AreaCard({ area }: { area: Area }) {
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
    <ChatCard
      tone="accent"
      icon={AREA_ICON[area]}
      title={label}
      primary={{
        label: t('area.open'),
        accessibilityLabel: t('area.open_label', { what: label }),
        onPress: open,
      }}
    />
  );
}
