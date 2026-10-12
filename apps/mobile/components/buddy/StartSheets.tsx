// Practice selection is separate from the app destination menu. Domain callbacks remain registered.
import type { BuddyHome } from '@learnbuddy/shared-types/contracts';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSheetHandoff } from '../navigation/useSheetHandoff.js';
import { startMenu } from './extensions.js';
import { Sheet } from '../lb/Sheet.js';
import { StartChoice } from '../lb/StartChoice.js';
import { View } from 'react-native';
import { START } from '../../lib/theme/start.js';
// Retained compatibility for unchanged domain callers until their close-boundary migration.
import { Platform } from 'react-native';
import { DURATION } from '../../lib/theme/motionDurations.js';
export const SHEET_SWAP_MS = Platform.OS === 'ios' ? DURATION.sheetHandoff : 0;

type Props = {
  menuOpen: boolean;
  onCloseMenu: () => void;
  onOpenMenu: () => void;
  next: BuddyHome['next'];
  send: (text: string) => void;
  canStart: boolean;
  active?: boolean;
};
export function StartSheets({
  menuOpen,
  onCloseMenu,
  onOpenMenu,
  next,
  send,
  canStart,
  active = true,
}: Props) {
  const { t } = useTranslation(['buddy', 'common']);
  const [sheet, setSheet] = useState<string | null>(null);
  const handoff = useSheetHandoff({
    enabled: canStart && active,
    visible: menuOpen,
    onClose: onCloseMenu,
    onInvalidated: () => {
      onCloseMenu();
      setSheet(null);
    },
  });
  const menu = startMenu.get();
  const open = (name: string) => (name === 'material' ? router.push('/library') : setSheet(name));
  return (
    <>
      <Sheet
        visible={menuOpen}
        title={t('buddy:start_choice.title')}
        closeLabel={t('common:actions.close')}
        onClose={() => {
          handoff.cancel();
          onCloseMenu();
        }}
        onClosed={handoff.closed}
        scrollTestID="scroll-list"
      >
        <View style={{ gap: START.listGap }}>
          {(menu?.items(next, t, { send, open }) ?? []).map((item) => (
            <StartChoice
              key={item.key}
              title={item.label}
              icon={item.icon}
              tone={item.tone ?? 'sky'}
              meta={item.meta}
              disabled={!canStart}
              onPress={() => handoff.begin(item.onPress)}
            />
          ))}
        </View>
      </Sheet>
      {menu ? (
        <menu.Sheets
          open={sheet}
          onOpen={setSheet}
          active={canStart && active}
          onBack={() => {
            setSheet(null);
            onOpenMenu();
          }}
        />
      ) : null}
    </>
  );
}
