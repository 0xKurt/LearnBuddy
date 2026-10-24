// A practice screen that cannot go on — the session did not load, or finishing it failed, or it
// ended without a result: what happened in one line, "Nochmal versuchen" where trying again can
// help, and always the way back to Buddy. A run never ends in a dead end (issue #47). One
// component for both cases of the practice route (CLAUDE.md: one UI element, one component).

import { useTranslation } from 'react-i18next';
import { useOnline } from '../../lib/api/queries.js';
import { LoadFailed, isGone } from '../lb/LoadFailed.js';
import { Screen } from '../lb/Screen.js';

type Props = {
  /** The session's title, once it is known. */
  title?: string;
  message?: string;
  error?: unknown;
  busy?: boolean;
  /** Trying again can help: the retry comes first, the way back steps back. */
  onRetry?: () => void;
  onBack: () => void;
};

export function PracticeStuck({ title, message, error, busy, onRetry, onBack }: Props) {
  const online = useOnline();
  const { t } = useTranslation(['practice', 'common']);
  return (
    // Design ui_kits/app/Extra.jsx:255 "failed": the head has its way out and Buddy thinks about
    // what went wrong. The head closes; "Zurück zu Buddy" is the button in the page.
    <Screen
      title={title ?? t('practice:title_fallback')}
      state={!online || isGone(error) ? 'idle' : 'think'}
      leading={{ icon: 'close', onPress: onBack }}
    >
      <LoadFailed
        error={error}
        message={message}
        busy={busy}
        onRetry={onRetry}
        back={{ label: t('practice:back_to_buddy'), onPress: onBack }}
      />
    </Screen>
  );
}
