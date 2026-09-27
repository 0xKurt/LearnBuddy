// The buttons under Buddy's notifications (gaps #16; docs/architecture.md §Delivery). The
// server picks the category per message (PUSH_CATEGORY); the app registers what each
// category shows and maps a press to what the API should do (rule 5: the API decides, the
// app only reports). Pure (Node-testable); lib/push.ts does the native part.
//
//   lb_practice: "Jetzt üben" (opens the prepared practice) · "Heute nicht" · "Seltener schreiben"
//   lb_message:  "Heute nicht" · "Seltener schreiben"
// "Heute nicht" and "Seltener schreiben" are answered from the lock screen, without opening
// the app; "Seltener" only reduces contact, so it needs no PIN (rule 6).

import { PUSH_CATEGORY, type OutreachAction } from '@learnbuddy/shared-types/contracts';

/** The action identifiers the phone reports back. */
export const ACTION_ID: Record<OutreachAction, string> = {
  practice_now: 'lb.practice_now',
  not_today: 'lb.not_today',
  less_often: 'lb.less_often',
};

/** i18n keys (common:push.*) of the button titles. */
const TITLE_KEY: Record<OutreachAction, string> = {
  practice_now: 'push.practice_now',
  not_today: 'push.not_today',
  less_often: 'push.less_often',
};

export type CategorySpec = {
  id: string;
  actions: Array<{
    identifier: string;
    buttonTitle: string;
    options: { opensAppToForeground: boolean };
  }>;
};

const button = (action: OutreachAction, title: (key: string) => string) => ({
  identifier: ACTION_ID[action],
  buttonTitle: title(TITLE_KEY[action]),
  // Only "Jetzt üben" opens the app.
  options: { opensAppToForeground: action === 'practice_now' },
});

/** The categories to register, with button titles in her language. */
export function categorySpecs(title: (key: string) => string): CategorySpec[] {
  return [
    {
      id: PUSH_CATEGORY.practice,
      actions: [
        button('practice_now', title),
        button('not_today', title),
        button('less_often', title),
      ],
    },
    {
      id: PUSH_CATEGORY.message,
      actions: [button('not_today', title), button('less_often', title)],
    },
  ];
}

export type Press =
  /** The notification itself was tapped: open Buddy (and report "opened"). */
  | { kind: 'open' }
  /** A button: report it to the API; `opens` tells whether the app came to the front. */
  | { kind: 'action'; action: OutreachAction; opens: boolean };

/** What a press means; anything unknown (another app version, a dismiss) is just an open. */
export function pressOf(actionIdentifier: string): Press {
  const entry = (Object.entries(ACTION_ID) as Array<[OutreachAction, string]>).find(
    ([, id]) => id === actionIdentifier,
  );
  if (!entry) return { kind: 'open' };
  return { kind: 'action', action: entry[0], opens: entry[0] === 'practice_now' };
}

/** Where "Jetzt üben" leads: the practice the server started, or Buddy when none is open. */
export function practiceRoute(sessionId: string | null): string {
  return sessionId ? `/practice/${sessionId}` : '/buddy';
}
