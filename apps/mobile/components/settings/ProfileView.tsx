// Factual learner presentation. Account/PIN actions stay with their existing owner.
import type { LearnerView } from '@learnbuddy/shared-types/contracts';
import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { PROFILE } from '../../lib/theme/profile.js';
import { RADIUS } from '../../lib/theme/radius.js';
import { SPACE } from '../../lib/theme/space.js';
import { TYPE } from '../../lib/theme/type.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { ListGroup, Row } from '../lb/ListGroup.js';

export function ProfileView({ learner, children }: { learner: LearnerView; children: ReactNode }) {
  const { t } = useTranslation('settings');
  const { palette, tones } = useTheme();
  return (
    <View style={{ gap: SPACE.lg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: PROFILE.identityGap }}>
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{
            width: PROFILE.avatar,
            height: PROFILE.avatar,
            borderRadius: RADIUS.round,
            backgroundColor: tones.bg.peach,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={[TYPE.identity, { color: palette.ink }]}>
            {Array.from(learner.display_name.trim())[0]?.toLocaleUpperCase(learner.locale) ?? ''}
          </Text>
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: PROFILE.identityLineGap }}>
          <Text style={TYPE.identity}>{learner.display_name}</Text>
          <Text style={TYPE.meta}>{t(`profile.level_${learner.level}`)}</Text>
        </View>
      </View>
      <ListGroup label={t('profile.about_you')}>
        <Row title={t('profile.name')} value={learner.display_name} />
        <Row title={t('profile.level_label')} value={t(`profile.level_${learner.level}`)} />
        {learner.grade !== null ? (
          <Row
            title={t('profile.grade_label')}
            value={t('profile.grade_value', { grade: learner.grade })}
          />
        ) : null}
      </ListGroup>
      {children}
    </View>
  );
}
