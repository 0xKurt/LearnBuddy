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
  onRetry?: () => void;
  /** A local lifecycle state already translated by its caller. */
  message?: string;
  /** The retry is in flight: the button shows it and takes no second tap. */
  busy?: boolean;
  /**
   * The screen's way back (to the list): quiet under the retry — and alone, as the main action,
   * when the thing is gone and trying again cannot bring it back.
   */
  back?: { label: string; onPress: () => void };
  /** Another way on below the retry that is no way back (signing out at the start gate). */
  children?: ReactNode;
  /**
   * One part of a page that goes on around it (a profile's subjects), not the screen's whole
   * content: no Buddy. The design draws him only in the full-screen state (States.jsx:34).
   */
  inline?: boolean;
};

/**
 * The thing is not there any more (404): trying again cannot bring it back. The screen's head
 * rests with it, and its way on is the one thing to offer (#599).
 */
export const isGone = (error: unknown): boolean =>
  error instanceof ApiError && error.code === 'not_found';

export function LoadFailed({
  error,
  onRetry,
  busy,
  back,
  children,
  message,
  inline = false,
}: Props) {
  const { t } = useTranslation('common');
  const online = useOnline();
  const gone = isGone(error);
  // Offline, or the thing is gone: nothing to think about (States.jsx "offline", "notfound").
  const resting = !online || gone;
  const retry = onRetry ? (
    <Btn pill center busy={busy} onPress={onRetry}>
      {t('common:actions.retry')}
    </Btn>
  ) : null;
  return (
    <View style={{ flex: 1, justifyContent: 'center' }}>
      <EmptyState
        orb={!inline}
        state={resting ? 'idle' : 'think'}
        title={message ?? messageFor(error)}
        action={
          back && (gone || !onRetry) ? (
            // Gone: the way back alone. Without one the retry stays — never a screen whose only
            // offer is something else (signing out at the start gate).
            <Btn pill center onPress={back.onPress}>
              {back.label}
            </Btn>
          ) : back || children ? (
            <View style={{ gap: RHYTHM.parts, alignItems: 'center' }}>
              {retry}
              {back ? (
                <Btn variant="ghost" pill center onPress={back.onPress}>
                  {back.label}
                </Btn>
              ) : null}
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
