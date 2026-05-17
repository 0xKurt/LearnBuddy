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
type ExpoNotifs = {
  cancelAllScheduledNotificationsAsync: () => Promise<void>;
  scheduleNotificationAsync: (req: {
    content: { title: string; body: string };
    trigger: DailyTrigger | DateTrigger;
  }) => Promise<string>;
  requestPermissionsAsync: () => Promise<{ granted: boolean }>;
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

export async function ensurePermissions(): Promise<boolean> {
  if (!Notifs) return false;
  const { granted } = await Notifs.requestPermissionsAsync();
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
  await Notifs.scheduleNotificationAsync({
    content: {
      title: 'Kurz üben?',
      body: 'Drei Minuten reichen schon — Hauptsache, dranbleiben.',
    },
    trigger: { hour, minute, repeats: true },
  });
  // Streak reminder fires 4h after the daily nudge if no session yet today.
  // For v1 we approximate "no session" by scheduling regardless; a follow-up
  // can check the session table before scheduling.
  if (prefs.streak_enabled) {
    const streakHour = (hour + 4) % 24;
    await Notifs.scheduleNotificationAsync({
      content: {
        title: 'Reicht heute schon eine Aufgabe?',
        body: 'Eine Minute zählt auch — wir halten deine Serie am Leben.',
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
    const slots: Array<{ daysBefore: number; title: string; body: string }> = [
      {
        daysBefore: 3,
        title: 'Test in 3 Tagen',
        body: `${t.name} — heute kurz vorbereiten?`,
      },
      {
        daysBefore: 1,
        title: 'Morgen ist es soweit',
        body: `${t.name} — ein Probelauf bringt dich rein.`,
      },
      {
        daysBefore: 0,
        title: 'Heute Test',
        body: `${t.name} — du kannst das. Atme einmal durch.`,
      },
    ];
    for (const slot of slots) {
      const fireAt = new Date(testDate.getTime() - slot.daysBefore * 86_400_000);
      if (fireAt.getTime() <= now) continue;
      await Notifs.scheduleNotificationAsync({
        content: { title: slot.title, body: slot.body },
        trigger: { date: fireAt },
      });
    }
  }
}
