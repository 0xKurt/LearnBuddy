// Screens that show what she and Buddy said keep the phone from copying them out
// (issue #36).
//
// Android: `FLAG_SECURE` — no screenshot, no screen recording, and a blank card in the
// app switcher, so a conversation is not left lying in the recents view.
// iOS: the window is blanked while the screen is being recorded (iOS 11+) and screenshots
// are blocked (iOS 13+); older versions do nothing, which is the platform's limit, not a
// silent failure of ours.
// The browser has no such flag at all — `screenGuard.web.ts` is a no-op (docs/privacy.md).
//
// Each screen passes its own key: the guard lifts only when the *last* screen holding it
// unmounts (the talk screen opens on top of Buddy's home, so both hold it at once).

import { usePreventScreenCapture } from 'expo-screen-capture';

/** The screens with conversation content on them. */
export type GuardedScreen = 'buddy' | 'talk' | 'history' | 'practice';

/** Blocks screenshots and recordings for as long as this screen is mounted. */
export function useScreenGuard(screen: GuardedScreen): void {
  usePreventScreenCapture(`lb.${screen}`);
}
