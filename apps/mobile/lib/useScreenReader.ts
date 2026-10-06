// Whether a screen reader (VoiceOver, TalkBack) is on — null until the system has answered or when
// it cannot. The mic never opens by itself while one is on: it would record the screen reader's
// own speech (audit M-85, `talkListensByItself`). Used by the conversation screen and by a
// conversation on a practice question (issue #386), so both decide by the same answer.

import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

export function useScreenReader(): boolean | null {
  const [on, setOn] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    // The browser cannot tell (react-native-web always answers true): no screen reader assumed.
    const known: Promise<boolean> =
      Platform.OS === 'web' ? Promise.resolve(false) : AccessibilityInfo.isScreenReaderEnabled();
    known
      .then((value) => {
        if (alive) setOn(value);
      })
      .catch(() => undefined);
    const sub =
      Platform.OS === 'web'
        ? null
        : AccessibilityInfo.addEventListener('screenReaderChanged', (value) => setOn(value));
    return () => {
      alive = false;
      sub?.remove();
    };
  }, []);
  return on;
}
