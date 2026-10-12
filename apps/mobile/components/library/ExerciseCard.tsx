// One exercise inside a subject (issue #189): the ones that came from no sheet — a
// vocabulary list she typed, a topic she named. Her sheets carry their own "Üben"; these
// would otherwise stand nowhere she can reach them again.
//
// Its name, the day it was, and — only while it is still open — that it is. Never a result:
// how it went belongs to the exercise's own screen, and a row in a list she browses is not
// the place to be told anything about scores (CLAUDE.md rule 6).

import type { SubjectExercise } from '@learnbuddy/shared-types/contracts';
import { useTranslation } from 'react-i18next';

import { formatDate } from '../../lib/time.js';
import { Row } from '../lb/ListGroup.js';

export function ExerciseCard({
  exercise,
  onPress,
}: {
  exercise: SubjectExercise;
  onPress: () => void;
}) {
  const { t, i18n } = useTranslation('library');
  const title = exercise.title?.trim() || t('subject.exercise_untitled');
  const open = exercise.status === 'active';
  return (
    <Row
      icon="practice"
      title={title}
      sub={[
        formatDate(exercise.started_at, i18n.language),
        open ? t('subject.exercise_still_open') : '',
      ]
        .filter(Boolean)
        .join(' · ')}
      onPress={onPress}
      accessibilityLabel={title}
      accessibilityHint={t(open ? 'subject.exercise_open_hint' : 'subject.exercise_look_hint')}
    />
  );
}
