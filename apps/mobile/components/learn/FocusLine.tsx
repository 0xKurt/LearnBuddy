// What she is working on, in her own words, as one line above Buddy's conversation (issue #160):
// only when there is something — an empty slot waiting to be filled would be a dashboard (rule
// 16). Tapping opens the sheet it is about. The learning domain's line on top of the thread
// (components/buddy/extensions.ts `workingOn`), unless a running roleplay takes it.

import type { BuddyHome } from '@learnbuddy/shared-types/contracts';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { TextLink } from '../lb/TextLink.js';

export function FocusLine({ focus }: { focus: NonNullable<BuddyHome['focus']> }) {
  const { palette } = useTheme();
  const { t } = useTranslation('buddy');
  const materialId = focus.material_id;
  return (
    <TextLink
      accessibilityLabel={t('buddy:focus.label', { what: focus.text })}
      onPress={materialId ? () => router.push(`/material/${materialId}`) : undefined}
      style={[TYPE.small, { color: palette.ink3, textAlign: 'center' }]}
    >
      {focus.text}
    </TextLink>
  );
}
