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
type ExpoNotifs = {
  cancelAllScheduledNotificationsAsync: () => Promise<void>;
  scheduleNotificationAsync: (req: {
    content: { title: string; body: string };
    trigger: { hour: number; minute: number; repeats: boolean };
  }) => Promise<string>;
  requestPermissionsAsync: () => Promise<{ granted: boolean }>;
};
let Notifs: ExpoNotifs | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  Notifs = require('expo-notifications') as ExpoNotifs;
} catch {
  Notifs = null;
}

export async function ensurePermissions(): Promise<boolean> {
  if (!Notifs) return false;
  const { granted } = await Notifs.requestPermissionsAsync();
  return granted;
}

export async function rescheduleNotifications(prefs: NotificationPrefs): Promise<void> {
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
}
