// One exercise inside a subject (issue #189): the ones that came from no sheet — a
// vocabulary list she typed, a topic she named. Her sheets carry their own "Üben"; these
// would otherwise stand nowhere she can reach them again.
//
// Its name, the day it was, and — only while it is still open — that it is. Never a result:
// how it went belongs to the exercise's own screen, and a row in a list she browses is not
// the place to be told anything about scores (CLAUDE.md rule 6).

import type { SubjectExercise } from '@learnbuddy/shared-types/contracts';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { SPACE } from '../../lib/theme/space.js';
import { TYPE } from '../../lib/theme/type.js';
import { formatDate } from '../../lib/time.js';
import { Card } from '../lb/Card.js';
import { Chip } from '../lb/Chip.js';
import { Icon } from '../lb/Icon.js';

export function ExerciseCard({
  exercise,
  onPress,
}: {
  exercise: SubjectExercise;
  onPress: () => void;
}) {
  const { palette } = useTheme();
  const { t, i18n } = useTranslation('library');
  const title = exercise.title?.trim() || t('subject.exercise_untitled');
  const open = exercise.status === 'active';
  return (
    <Card
      onPress={onPress}
      padding={SPACE.lg}
      accessibilityLabel={title}
      accessibilityHint={t(open ? 'subject.exercise_open_hint' : 'subject.exercise_look_hint')}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.md }}>
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: palette.primaryLt,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="practice" size={20} color={palette.primaryDk} />
        </View>
        <View style={{ flex: 1, gap: SPACE.xs }}>
          <Text style={[TYPE.body, { fontWeight: '600' }]}>{title}</Text>
          <Text style={TYPE.small}>{formatDate(exercise.started_at, i18n.language)}</Text>
          {open ? (
            <View style={{ marginTop: 2 }}>
              <Chip tone="primary">{t('subject.exercise_still_open')}</Chip>
            </View>
          ) : null}
        </View>
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Icon name="chevron" size={20} color={palette.ink3} />
        </View>
      </View>
    </Card>
  );
}
