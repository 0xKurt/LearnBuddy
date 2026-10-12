// Factual entry into the native Profile destination; onboarding stays at /profile.
import type { LearnerView } from '@learnbuddy/shared-types/contracts';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ListGroup, Row } from '../lb/ListGroup.js';

export function ProfileSection({ learner }: { learner: LearnerView }) {
  const { t } = useTranslation('settings');
  return (
    <ListGroup>
      <Row
        title={learner.display_name}
        tile={{ letter: [...learner.display_name][0]?.toLocaleUpperCase() ?? '', tone: 'peach' }}
        sub={[
          t('profile.page_title'),
          learner.grade !== null
            ? t('profile.grade_value', { grade: learner.grade })
            : t(`profile.level_${learner.level}`),
        ].join(' · ')}
        onPress={() => router.push('/settings/profile')}
      />
    </ListGroup>
  );
}
