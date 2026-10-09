// What a screen shows when its content never loaded (issue #311): what went wrong in her
// words, "Nochmal versuchen", and — where the screen has one — a second way on below it. The
// one "load failed → try again" of the app's screens (library, a subject, a sheet, memory,
// the history, settings); a failed background refresh keeps what is on screen instead.

import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { messageFor } from '../../lib/errors.js';
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
  const retry = (
    <Btn pill center busy={busy} onPress={onRetry}>
      {t('common:actions.retry')}
    </Btn>
  );
  return (
    <View style={{ flex: 1, justifyContent: 'center' }}>
      <EmptyState
        title={messageFor(error)}
        action={
          children ? (
            // token-exempt: the two ways on keep the distance the sheet screen gave them
            <View style={{ gap: 10, alignItems: 'center' }}>
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
