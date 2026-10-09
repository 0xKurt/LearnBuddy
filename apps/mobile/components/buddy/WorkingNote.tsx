// Buddy is on something the learner is waiting for (their photos, the
// practice they just finished): say so, instead of an unexplained pause —
// with Buddy's orb, its moon racing round (thinking), instead of a spinner.

import type { BuddyHome } from '@learnbuddy/shared-types/contracts';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useAnnounce } from '../../lib/announce.js';
import { SPACE } from '../../lib/theme/space.js';
import { TYPE } from '../../lib/theme/type.js';
import { BuddyOrb } from '../lb/BuddyOrb.js';
import { Card } from '../lb/Card.js';

export function WorkingNote({ what }: { what: NonNullable<BuddyHome['working']> }) {
  const { t } = useTranslation('buddy');
  useAnnounce(t(`working.${what}`));
  return (
    <Card padding={SPACE.lg} radius={18}>
      <View
        accessibilityLiveRegion="polite"
        style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.md }}
      >
        <BuddyOrb size={28} state="think" />
        <Text style={[TYPE.body, { flex: 1 }]}>{t(`working.${what}`)}</Text>
      </View>
    </Card>
  );
}
