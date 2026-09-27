// Push notifications for Buddy's messages outside the app. Registration only
// after contact was allowed; taps are reported to the API (the only proof a
// message was opened). The app never schedules local notifications itself —
// anything still queued from an older version is removed on start.
//
// Binding (audit M-65, decision D-6): tokens are registered with a random id
// of this install, and the server keeps at most one learner's token active per
// install. Signed in on start or after a sign-in, the app claims the install
// (a sibling's leftover token goes) and, when contact is on and the permission
// is already there, registers its current token again so the phone in use is
// the one that rings. Signing out releases the install — without waiting for a
// push token (audit M-74) and retried until the server has it.
//
// Opened (audit M-64): a tap — also one that started the app — is kept on the
// device (lib/pushQueue.ts) until the API has it, and sent once signed in.
//
// Buttons (gaps #16, lib/pushActions.ts): the server picks each message's category; the app
// registers the buttons. A press is kept like a tap and sent to the API, which decides what it
// does. "Heute nicht" and "Seltener schreiben" work from the lock screen: when the app is not
// running, the background task (lib/pushTask.ts) sends them.

import { PUSH_CHANNEL_ID, type BuddyHome } from '@learnbuddy/shared-types/contracts';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { newId } from './api/client.js';
import type { OutreachActionResponse } from '@learnbuddy/shared-types/contracts';

import {
  claimPushDevice,
  getSettings,
  outreachAct,
  outreachOpened,
  registerPushToken,
  releasePushDevice,
} from './api/endpoints.js';
import { readItem, writeItem } from './api/outboxStorage.js';
import { resultOf } from './api/outboxSync.js';
import { currentSession } from './auth/session.js';
import { i18n } from './i18n/index.js';
import { categorySpecs, pressOf, type Press } from './pushActions.js';
import {
  outreachIdOf,
  parsePushQueue,
  withAction,
  withOpened,
  withoutAction,
  withoutOpened,
  withRelease,
  type PushQueue,
  type QueuedAction,
} from './pushQueue.js';

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

const INSTALL_KEY = 'lb.install_id';
const QUEUE_KEY = 'lb.push.queue.v1';
const HERE_KEY = 'lb.push.registered_for';
/** Nothing about push may keep sign-out or start waiting longer than this. */
const PUSH_TIMEOUT_MS = 4000;

function within<T>(p: Promise<T>, ms = PUSH_TIMEOUT_MS): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

/**
 * The buttons under Buddy's notifications, titled in the app's language (registered on start
 * and when she signs in; the server names the category per message).
 */
export async function registerPushCategories(): Promise<void> {
  if (Platform.OS === 'web') return;
  for (const c of categorySpecs((key) => i18n.t(`common:${key}`))) {
    await Notifications.setNotificationCategoryAsync(c.id, c.actions).catch(() => undefined);
  }
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

const pushPossible = () => Platform.OS !== 'web' && Device.isDevice && projectId() !== null;

let installId: Promise<string> | null = null;

/** This install's random id (created once; not the hardware, never shown). */
function deviceId(): Promise<string> {
  installId ??= (async () => {
    const kept = await readItem(INSTALL_KEY);
    if (kept) return kept;
    const id = `install-${newId()}`;
    await writeItem(INSTALL_KEY, id);
    return id;
  })();
  return installId;
}

// One writer at a time for the queue (like the answer outbox).
let chain: Promise<unknown> = Promise.resolve();
function updateQueue(fn: (q: PushQueue) => PushQueue): Promise<PushQueue> {
  const next = chain.then(async () => {
    const q = fn(parsePushQueue(await readItem(QUEUE_KEY), new Date()));
    await writeItem(QUEUE_KEY, JSON.stringify(q));
    return q;
  });
  chain = next.catch(() => undefined);
  return next;
}
const readQueue = () => updateQueue((q) => q);

async function expoToken(): Promise<string> {
  const id = projectId();
  if (!id) throw new Error('no project id');
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(PUSH_CHANNEL_ID, {
      name: 'Buddy',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  // Offline on iOS this may never answer: always bounded.
  return (await within(Notifications.getExpoPushTokenAsync({ projectId: id }))).data;
}

async function register(): Promise<void> {
  const token = await expoToken();
  await registerPushToken(token, Platform.OS === 'ios' ? 'ios' : 'android', await deviceId());
  const user = currentSession()?.user_id;
  if (user) await writeItem(HERE_KEY, user);
}

/** Asks for permission (once) and registers this device. False when not possible. */
export async function registerDeviceForPush(): Promise<boolean> {
  if (!pushPossible()) return false;
  const current = await Notifications.getPermissionsAsync();
  const granted = current.granted || (await Notifications.requestPermissionsAsync()).granted;
  if (!granted) return false;
  await register();
  return true;
}

/**
 * Whether this very device gets her messages (settings offers to register it
 * otherwise); null where a device cannot get push at all (browser, simulator).
 */
export async function registeredHere(): Promise<boolean | null> {
  if (!pushPossible()) return null;
  const user = currentSession()?.user_id;
  return user !== undefined && (await readItem(HERE_KEY)) === user;
}

async function tryRelease(): Promise<boolean> {
  try {
    await within(releasePushDevice(await deviceId()));
    await updateQueue((q) => withRelease(q, false));
    return true;
  } catch {
    return false;
  }
}

/**
 * Signing out: this device stops getting Buddy's messages (on a shared family
 * phone the next person must not see them). Never asks for anything and never
 * waits long; if the server cannot be reached, the release is kept and sent
 * again later (start, back online) — and the next person's sign-in claims the
 * device anyway.
 */
export async function unregisterDeviceForPush(): Promise<void> {
  await writeItem(HERE_KEY, null);
  await updateQueue((q) => withRelease(q, true));
  await tryRelease();
}

/**
 * Signed in (start or sign-in): a pending release goes first, then the install
 * is claimed, then — only when contact is on and the permission was already
 * given — the current token is registered again. Nothing is asked.
 */
export async function syncPushDevice(): Promise<void> {
  if ((await readQueue()).release && !(await tryRelease())) return;
  if (!currentSession()) return;
  void registerPushCategories();
  await within(claimPushDevice(await deviceId())).catch(() => undefined);
  if (!pushPossible()) return;
  try {
    if (!(await Notifications.getPermissionsAsync()).granted) return;
    if (!(await within(getSettings())).contact_enabled) return;
    await register();
  } catch {
    // Offline or no token: tried again on the next start.
  }
}

/** Retries a release that could not be sent at sign-out (start, back online). */
export async function retryPendingRelease(): Promise<void> {
  if ((await readQueue()).release) await tryRelease();
}

let flushingOpened: Promise<void> | null = null;

/**
 * Sends the kept "opened" reports, oldest first. Without a session, or while
 * the API cannot be reached, they wait; only a clear "no" (not hers, gone)
 * drops one — the same rule as the answer outbox.
 */
export function flushOpened(onHome: (home: BuddyHome) => void): Promise<void> {
  flushingOpened ??= (async () => {
    if (!currentSession()) return;
    for (const e of (await readQueue()).opened) {
      try {
        onHome(await outreachOpened(e.id, null));
      } catch (err) {
        if (resultOf(err) !== 'refused') break;
      }
      await updateQueue((q) => withoutOpened(q, e.id));
    }
  })().finally(() => {
    flushingOpened = null;
  });
  return flushingOpened;
}

let flushingActions: Promise<void> | null = null;

/**
 * Sends the kept button presses, oldest first, with the same rule as the opened reports: only
 * a clear "no" drops one. `onDone` gets each answer (e.g. the practice "Jetzt üben" started).
 */
export function flushActions(
  onDone: (e: { id: string; action: QueuedAction }, res: OutreachActionResponse) => void,
): Promise<void> {
  flushingActions ??= (async () => {
    if (!currentSession()) return;
    for (const e of (await readQueue()).actions) {
      try {
        onDone(e, await outreachAct(e.id, e.action));
      } catch (err) {
        if (resultOf(err) !== 'refused') break;
      }
      await updateQueue((q) => withoutAction(q, e.id, e.action));
    }
  })().finally(() => {
    flushingActions = null;
  });
  return flushingActions;
}

/** A press on one of Buddy's notifications, kept on the device until the API has it. */
export async function keepPress(
  data: unknown,
  actionIdentifier: string,
): Promise<{ id: string; press: Press } | null> {
  const id = outreachIdOf(data);
  if (!id) return null;
  const press = pressOf(actionIdentifier);
  const at = new Date();
  await updateQueue((q) => {
    if (press.kind === 'open') return withOpened(q, id, at);
    const kept = withAction(q, id, press.action, at);
    // "Jetzt üben" opened the app; the lock-screen buttons did not.
    return press.opens ? withOpened(kept, id, at) : kept;
  });
  return { id, press };
}

const handled = new Set<string>();

/**
 * Calls back with the outreach id and what was pressed when the learner taps one of Buddy's
 * notifications or one of its buttons — including the tap that started the app (read here
 * once; the listener may have missed it) — after keeping the report on the device.
 */
export function onNotificationTap(
  callback: (outreachId: string, press: Press) => void,
): () => void {
  if (Platform.OS === 'web') return () => undefined;
  const handle = (response: Notifications.NotificationResponse | null) => {
    if (!response) return;
    const key = `${response.notification.request.identifier}:${response.actionIdentifier}`;
    if (handled.has(key)) return;
    handled.add(key);
    void keepPress(response.notification.request.content.data, response.actionIdentifier).then(
      (kept) => {
        if (kept) callback(kept.id, kept.press);
      },
    );
  };
  const sub = Notifications.addNotificationResponseReceivedListener(handle);
  try {
    handle(Notifications.getLastNotificationResponse());
    Notifications.clearLastNotificationResponse();
  } catch {
    // Older native module: the listener still gets the taps it sees.
  }
  return () => sub.remove();
}
