// Buddy pointed to a part of the app ("Zeig mir meine Blätter", "Ich will
// die Sprache ändern"): one button that opens it. Nothing happens on its own.
import type { ActionSummary } from '@learnbuddy/shared-types/contracts';
import { router, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { LB } from '../../lib/theme/colors.js';
import { SHADOW } from '../../lib/theme/shadow.js';
import { TYPE } from '../../lib/theme/type.js';
import { Btn } from '../lb/Btn.js';
import { Icon, type IconName } from '../lb/Icon.js';

type Area = Extract<ActionSummary, { tool: 'open_area' }>['area'];

export const AREA_ROUTE: Record<Area, Href> = {
  library: '/library',
  memory: '/memory',
  settings: '/settings',
  history: '/history',
  capture: '/capture',
};

const AREA_ICON: Record<Area, IconName> = {
  library: 'folder',
  memory: 'bulb',
  settings: 'shield',
  history: 'clock',
  capture: 'camera',
};

export function AreaCard({ area }: { area: Area }) {
  const { t } = useTranslation('buddy');
  const label = t(`area.${area}`);
  return (
    <View
      style={[
        {
          backgroundColor: '#fff',
          borderRadius: 20,
          padding: 14,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
        },
        SHADOW.soft,
      ]}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: LB.lavender,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name={AREA_ICON[area]} size={20} color={LB.primary} />
      </View>
      <Text style={[TYPE.body, { flex: 1, fontWeight: '600' }]}>{label}</Text>
      <Btn
        size="sm"
        pill
        onPress={() => router.push(AREA_ROUTE[area])}
        accessibilityLabel={t('area.open_label', { what: label })}
      >
        {t('area.open')}
      </Btn>
    </View>
  );
}
