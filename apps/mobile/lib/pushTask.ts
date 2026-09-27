// Buttons pressed on a notification while the app is not running (gaps #16): "Heute nicht"
// and "Seltener schreiben" work from the lock screen. The OS starts the app's JavaScript in
// the background (expo-task-manager, registered through expo-notifications); the press is kept
// on the device and sent to the API like any other (lib/push.ts). Defined at start-up from
// the entry file (index.ts), before any screen — no views are mounted in this mode.

import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

import { loadSession } from './auth/session.js';
import { flushActions, keepPress } from './push.js';

export const PUSH_ACTION_TASK = 'lb-push-action';

if (Platform.OS !== 'web') {
  TaskManager.defineTask<Notifications.NotificationTaskPayload>(
    PUSH_ACTION_TASK,
    async ({ data, error }) => {
      // Only presses: incoming notifications are shown by the system.
      if (error || !data || !('actionIdentifier' in data)) return;
      const kept = await keepPress(data.notification.request.content.data, data.actionIdentifier);
      if (!kept || kept.press.kind !== 'action') return;
      await loadSession();
      await flushActions(() => undefined);
    },
  );
  void Notifications.registerTaskAsync(PUSH_ACTION_TASK).catch(() => undefined);
}
