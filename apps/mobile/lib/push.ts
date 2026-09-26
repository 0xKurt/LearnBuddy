// Push notifications for Buddy's messages outside the app. Registration only
// after contact was allowed; taps are reported to the API (the only proof a
// message was opened). The app never schedules local notifications itself —
// anything still queued from an older version is removed on start.

import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { registerPushToken, unregisterPushToken } from './api/endpoints.js';

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    // In the foreground the message is already in the Buddy thread.
    handleNotification: async () => ({
      shouldShowBanner: false,
      shouldShowList: false,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

export async function clearLegacyLocalNotifications(): Promise<void> {
  if (Platform.OS === 'web') return;
  await Notifications.cancelAllScheduledNotificationsAsync().catch(() => undefined);
}

function projectId(): string | null {
  const fromExtra = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)
    ?.eas?.projectId;
  return fromExtra ?? Constants.easConfig?.projectId ?? null;
}

/** Asks for permission (once) and registers this device. False when not possible. */
export async function registerDeviceForPush(): Promise<boolean> {
  if (Platform.OS === 'web' || !Device.isDevice) return false;
  const id = projectId();
  if (!id) return false;
  const current = await Notifications.getPermissionsAsync();
  const granted = current.granted || (await Notifications.requestPermissionsAsync()).granted;
  if (!granted) return false;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('buddy', {
      name: 'Buddy',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  const token = await Notifications.getExpoPushTokenAsync({ projectId: id });
  await registerPushToken(token.data, Platform.OS === 'ios' ? 'ios' : 'android');
  return true;
}

/**
 * Signing out: this device stops getting Buddy's messages for this learner (on a
 * shared family phone the next person must not see them). Never asks for anything;
 * a failure does not stop the sign-out.
 */
export async function unregisterDeviceForPush(): Promise<void> {
  if (Platform.OS === 'web' || !Device.isDevice) return;
  const id = projectId();
  if (!id) return;
  try {
    if (!(await Notifications.getPermissionsAsync()).granted) return;
    const token = await Notifications.getExpoPushTokenAsync({ projectId: id });
    await unregisterPushToken(token.data);
  } catch {
    // Offline or no token: the server drops the token once the provider reports it gone.
  }
}

/** Calls back with the outreach id when the learner taps one of Buddy's notifications. */
export function onNotificationTap(callback: (outreachId: string) => void): () => void {
  if (Platform.OS === 'web') return () => undefined;
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data as {
      type?: unknown;
      outreach_id?: unknown;
    };
    if (data.type === 'buddy_outreach' && typeof data.outreach_id === 'string')
      callback(data.outreach_id);
  });
  return () => sub.remove();
}
