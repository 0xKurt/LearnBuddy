// Pure subject-list presentation; the registered domain supplies actual cards and query state.
import type { ReactNode } from 'react';
import { Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { TYPE } from '../../lib/theme/type.js';
import { ListGroup } from '../lb/ListGroup.js';
import { LoadFailed } from '../lb/LoadFailed.js';
import { GroupSkeleton } from '../lb/Skeletons.js';

export function ProfileSubjects({
  cards,
  loading,
  error,
  onRetry,
}: {
  cards: ReactNode[];
  loading: boolean;
  error: unknown;
  onRetry: () => void;
}) {
  const { t } = useTranslation(['settings', 'common']);
  if (loading)
    return error ? (
      // A section of the profile page, not a screen: without the full-screen state's Buddy.
      <LoadFailed inline error={error} onRetry={onRetry} />
    ) : (
      // The group's own box — its label, its rows — where the group will stand (#599).
      <GroupSkeleton label={t('common:loading')} />
    );
  return (
    <ListGroup label={t('settings:profile.subjects')}>
      {cards.length ? cards : <Text style={TYPE.meta}>{t('settings:profile.subjects_empty')}</Text>}
    </ListGroup>
  );
}
