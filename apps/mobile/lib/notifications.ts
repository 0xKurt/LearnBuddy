// Notifications wrapper. Doc 05 §notifications + Doc 09 §consent.
//
// Slice F2 wires the scheduling against expo-notifications. Slice G3's
// notification screen uses loadNotificationPrefs / saveNotificationPrefs to
// persist the user's choices in SecureStore (small footprint, sensitive
// because nudges fire while the device is unlocked).
//
// The schedulers (`rescheduleDailyNudge`, `rescheduleTestReminders`) read
// these prefs and rebuild the expo-notifications queue.

import * as SecureStore from 'expo-secure-store';
import { i18n } from './i18n/index.js';

const KEY = 'lb_notification_prefs_v1';

export type NotificationPrefs = {
  daily_enabled: boolean;
  daily_time: string; // 'HH:mm'
  test_reminders: boolean;
  streak_enabled: boolean;
};

export const DEFAULT_PREFS: NotificationPrefs = {
  daily_enabled: true,
  daily_time: '16:30',
  test_reminders: true,
  streak_enabled: true,
};

export async function loadNotificationPrefs(): Promise<NotificationPrefs> {
  const raw = await SecureStore.getItemAsync(KEY);
  if (!raw) return DEFAULT_PREFS;
  try {
    const parsed = JSON.parse(raw) as Partial<NotificationPrefs>;
    return { ...DEFAULT_PREFS, ...parsed };
  } catch {
    return DEFAULT_PREFS;
  }
}

export async function saveNotificationPrefs(prefs: NotificationPrefs): Promise<void> {
  await SecureStore.setItemAsync(KEY, JSON.stringify(prefs));
  // Slice F2 hooks the actual rescheduling here.
  await rescheduleNotifications(prefs);
}

// ─── Scheduling — Slice F2 ──────────────────────────────────────────────────

// expo-notifications dynamic-required so this module can be loaded under
// vitest (node env) for tests of loadNotificationPrefs.
//
// Expo Go (SDK 53+) removed Android push notifications and the
// expo-notifications module greets the user with a console.error on load
// when it detects Expo Go. Detect Expo Go ourselves via expo-constants
// `appOwnership === 'expo'` and skip the require entirely there — local
// scheduling will be wired in a dev/preview build of the app where
// expo-notifications is fully supported.
type DailyTrigger = { hour: number; minute: number; repeats: boolean };
type DateTrigger = { date: Date };
type NotificationAction = {
  identifier: string;
  buttonTitle: string;
  options?: { opensAppToForeground?: boolean };
};

type ExpoNotifs = {
  cancelAllScheduledNotificationsAsync: () => Promise<void>;
  scheduleNotificationAsync: (req: {
    content: {
      title: string;
      body: string;
      data?: Record<string, unknown>;
      categoryIdentifier?: string;
    };
    trigger: DailyTrigger | DateTrigger;
  }) => Promise<string>;
  getPermissionsAsync: () => Promise<{ status: 'granted' | 'denied' | 'undetermined' }>;
  requestPermissionsAsync: () => Promise<{ granted: boolean; status: string }>;
  setNotificationCategoryAsync: (id: string, actions: NotificationAction[]) => Promise<void>;
  addNotificationResponseReceivedListener: (
    cb: (response: {
      notification: { request: { content: { data: Record<string, unknown> } } };
    }) => void,
  ) => { remove(): void };
};

let Notifs: ExpoNotifs | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Constants = require('expo-constants');
  const ownership = (Constants?.default ?? Constants)?.appOwnership;
  if (ownership !== 'expo') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    Notifs = require('expo-notifications') as ExpoNotifs;
  }
} catch {
  Notifs = null;
}

export async function getPermissionStatus(): Promise<'granted' | 'denied' | 'undetermined'> {
  if (!Notifs) return 'denied';
  try {
    const { status } = await Notifs.getPermissionsAsync();
    return status;
  } catch {
    return 'undetermined';
  }
}

export async function ensurePermissions(): Promise<boolean> {
  if (!Notifs) return false;
  const { granted } = await Notifs.requestPermissionsAsync();
  if (granted) {
    await Notifs.setNotificationCategoryAsync('PRACTICE_REMINDER', [
      {
        identifier: 'PRACTICE_NOW',
        buttonTitle: i18n.t('common:notifications.action_practice'),
        options: { opensAppToForeground: true },
      },
    ]);
  }
  return granted;
}

export async function rescheduleNotifications(
  prefs: NotificationPrefs,
  upcomingTests: UpcomingTest[] = [],
): Promise<void> {
  if (!Notifs) return;
  await Notifs.cancelAllScheduledNotificationsAsync();
  if (!prefs.daily_enabled) return;
  const [hStr, mStr] = prefs.daily_time.split(':');
  const hour = Number(hStr ?? 16);
  const minute = Number(mStr ?? 30);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return;
  const t = (k: string) => i18n.t(`common:${k}`);
  await Notifs.scheduleNotificationAsync({
    content: {
      title: t('notifications.daily_title'),
      body: t('notifications.daily_body'),
      categoryIdentifier: 'PRACTICE_REMINDER',
    },
    trigger: { hour, minute, repeats: true },
  });
  if (prefs.streak_enabled) {
    const streakHour = (hour + 4) % 24;
    await Notifs.scheduleNotificationAsync({
      content: {
        title: t('notifications.streak_title'),
        body: t('notifications.streak_body'),
        categoryIdentifier: 'PRACTICE_REMINDER',
      },
      trigger: { hour: streakHour, minute, repeats: true },
    });
  }
  if (prefs.test_reminders && upcomingTests.length > 0) {
    await scheduleTestHeadsUp(upcomingTests);
  }
}

/** Upcoming test row returned by GET /learners/:id/schedule-summary. */
export type UpcomingTest = {
  folder_id: string;
  subject_id: string;
  name: string;
  scheduled_for: string;
};

/**
 * Schedule three nudges per upcoming test: 3 days before, 1 day before,
 * morning-of (08:30 local). Doc 05 §notifications + USER-FLOWS-DEEP §1.1.
 * Tests further than 30 days out are ignored — they create noise without
 * actionable urgency.
 */
export async function scheduleTestHeadsUp(tests: UpcomingTest[]): Promise<void> {
  if (!Notifs) return;
  const now = Date.now();
  const HORIZON_MS = 30 * 86_400_000;
  for (const t of tests) {
    const testDate = new Date(`${t.scheduled_for}T08:30:00`);
    if (Number.isNaN(testDate.getTime())) continue;
    const ms = testDate.getTime() - now;
    if (ms <= 0 || ms > HORIZON_MS) continue;
    const nt = (k: string, opts?: Record<string, string>) => i18n.t(`common:${k}`, opts);
    const slots: Array<{ daysBefore: number; title: string; body: string }> = [
      {
        daysBefore: 3,
        title: nt('notifications.test_3days_title'),
        body: nt('notifications.test_3days_body', { name: t.name }),
      },
      {
        daysBefore: 1,
        title: nt('notifications.test_1day_title'),
        body: nt('notifications.test_1day_body', { name: t.name }),
      },
      {
        daysBefore: 0,
        title: nt('notifications.test_today_title'),
        body: nt('notifications.test_today_body', { name: t.name }),
      },
    ];
    for (const slot of slots) {
      const fireAt = new Date(testDate.getTime() - slot.daysBefore * 86_400_000);
      if (fireAt.getTime() <= now) continue;
      await Notifs.scheduleNotificationAsync({
        content: {
          title: slot.title,
          body: slot.body,
          data: { folder_id: t.folder_id, subject_id: t.subject_id },
        },
        trigger: { date: fireAt },
      });
    }
  }
}
