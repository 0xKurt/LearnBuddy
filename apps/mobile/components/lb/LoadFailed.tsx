// What a screen shows when its content never loaded (issue #311): what went wrong in her
// words, "Nochmal versuchen", and — where the screen has one — a second way on below it. The
// one "load failed → try again" of the app's screens (library, a subject, a sheet, memory,
// the history, settings); a failed background refresh keeps what is on screen instead. It is the
// design's full-screen state (components/core/States.jsx `StateScreen`): Buddy at 64 above the
// line — thinking about what failed, at rest where there is no connection or the thing is gone
// (:37–40).

import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { ApiError } from '../../lib/api/apiError.js';
import { useOnline } from '../../lib/api/queries.js';
import { messageFor } from '../../lib/errors.js';
import { RHYTHM } from '../../lib/theme/space.js';
import { Btn } from './Btn.js';
import { EmptyState } from './EmptyState.js';

type Props = {
  /** What failed; its message is the title (`lib/errors.ts`). */
  error: unknown;
  onRetry: () => void;
  /** The retry is in flight: the button shows it and takes no second tap. */
  busy?: boolean;
  /** A second way on below the retry (back to the list). */
  children?: ReactNode;
};

export function LoadFailed({ error, onRetry, busy, children }: Props) {
  const { t } = useTranslation('common');
  const online = useOnline();
  // Offline, or the thing is gone: nothing to think about (States.jsx "offline", "notfound").
  const resting = !online || (error instanceof ApiError && error.code === 'not_found');
  const retry = (
    <Btn pill center busy={busy} onPress={onRetry}>
      {t('common:actions.retry')}
    </Btn>
  );
  return (
    <View style={{ flex: 1, justifyContent: 'center' }}>
      <EmptyState
        orb
        state={resting ? 'idle' : 'think'}
        title={messageFor(error)}
        action={
          children ? (
            <View style={{ gap: RHYTHM.parts, alignItems: 'center' }}>
              {retry}
              {children}
            </View>
          ) : (
            retry
          )
        }
      />
    </View>
  );
}
