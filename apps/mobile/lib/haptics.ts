// One haptics helper for the whole app (polish brief 2026-09-27). Soft and
// sparing: a light tap on send and primary taps, success on a right answer or
// a finished session, a soft warning on "Noch nicht ganz" (never harsh),
// selection on PIN digits. On the web every call is a no-op; a device without
// a haptic engine ignores it — feedback is never the only signal.
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

const on = Platform.OS === 'ios' || Platform.OS === 'android';

function fire(run: () => Promise<void>): void {
  if (!on) return;
  run().catch(() => {
    // No haptic engine or the OS refused: nothing to tell the learner.
  });
}

export const haptic = {
  /** Send, primary taps, chip taps. */
  tap(): void {
    fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
  },
  /** A right answer, a finished session. */
  success(): void {
    fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
  },
  /** "Noch nicht ganz", a failed send: soft, never harsh. */
  soft(): void {
    fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
  },
  /** PIN digits, pickers. */
  select(): void {
    fire(() => Haptics.selectionAsync());
  },
};
