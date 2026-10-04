// A practice screen that cannot go on — the session did not load, or finishing it failed, or it
// ended without a result: what happened in one line, "Nochmal versuchen" where trying again can
// help, and always the way back to Buddy. A run never ends in a dead end (issue #47). One
// component for both cases of the practice route (CLAUDE.md: one UI element, one component).

import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { SPACE } from '../../lib/theme/space.js';
import { Btn } from '../lb/Btn.js';
import { EmptyState } from '../lb/EmptyState.js';
import { Screen } from '../lb/Screen.js';

type Props = {
  /** The session's title, once it is known. */
  title?: string;
  message: string;
  /** Trying again can help: the retry comes first, the way back steps back. */
  onRetry?: () => void;
  onBack: () => void;
};

export function PracticeStuck({ title, message, onRetry, onBack }: Props) {
  const { t } = useTranslation(['practice', 'common']);
  return (
    <Screen title={title}>
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <EmptyState
          title={message}
          action={
            <View style={{ gap: SPACE.sm, alignItems: 'center' }}>
              {onRetry ? (
                <Btn center onPress={onRetry}>
                  {t('common:actions.retry')}
                </Btn>
              ) : null}
              <Btn variant={onRetry ? 'ghost' : 'primary'} center onPress={onBack}>
                {t('practice:back_to_buddy')}
              </Btn>
            </View>
          }
        />
      </View>
    </Screen>
  );
}
