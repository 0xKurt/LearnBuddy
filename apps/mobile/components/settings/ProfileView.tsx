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

export function ProfileView({
  learner,
  email,
  children,
  subjects,
  footer,
}: {
  learner: LearnerView;
  email?: string;
  children: ReactNode;
  subjects?: ReactNode;
  footer?: ReactNode;
}) {
  const { t } = useTranslation('settings');
  const { palette, tones } = useTheme();
  return (
    <View style={{ gap: SPACE.lg }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: PROFILE.identityGap,
          paddingVertical: SPACE.sm,
          paddingHorizontal: SPACE.xs,
        }}
      >
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
          {!learner.is_minor && email ? <Text style={TYPE.meta}>{email}</Text> : null}
        </View>
      </View>
      <ListGroup label={t('profile.about_you')}>
        <Row title={t('profile.name')} icon="pencil" value={learner.display_name} />
        {/* Her class, as the design has it (ui_kits/app/Extra.jsx `Profile`); a learner without
            one — a student, an adult — reads where she learns instead. The design's "Schulform"
            has no row: the profile holds no school type. */}
        {learner.grade !== null ? (
          <Row title={t('profile.grade_label')} icon="file" value={String(learner.grade)} />
        ) : (
          <Row
            title={t('profile.level_label')}
            icon="sparkle"
            value={t(`profile.level_${learner.level}`)}
          />
        )}
        {children}
      </ListGroup>
      {subjects}
      <Text style={[TYPE.profileExplanation, { color: palette.ink2, paddingHorizontal: SPACE.xs }]}>
        {t('profile.curriculum_explanation')}
      </Text>
      {footer}
    </View>
  );
}
