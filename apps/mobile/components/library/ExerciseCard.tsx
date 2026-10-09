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
import { TYPE } from '../../lib/theme/type.js';
import { formatDate } from '../../lib/time.js';
import { Chip } from '../lb/Chip.js';
import { EntryCard } from './EntryCard.js';

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
    <EntryCard
      icon="practice"
      tile={{ fill: palette.primaryLt }}
      title={title}
      onPress={onPress}
      accessibilityLabel={title}
      accessibilityHint={t(open ? 'subject.exercise_open_hint' : 'subject.exercise_look_hint')}
    >
      <Text style={TYPE.small}>{formatDate(exercise.started_at, i18n.language)}</Text>
      {open ? (
        // token-exempt: the chip two points below the date, snug, as on the sheet's card
        <View style={{ marginTop: 2 }}>
          <Chip tone="primary">{t('subject.exercise_still_open')}</Chip>
        </View>
      ) : null}
    </EntryCard>
  );
}
