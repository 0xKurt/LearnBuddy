// Server-side wrapper around the Expo Push Notification service.
//
// Expo's hosted push API takes an array of "messages", each with a
// recipient token, a title/body, and optional `data` for in-app routing.
// Auth-free — the security model is that anyone holding the device's
// push token can already send to it; we just don't broadcast tokens.
//
// We batch up to 100 messages per request (Expo's documented cap) and
// fire-and-forget so a slow Expo response can never block the
// extraction-drain or any other caller. Failures are logged but never
// thrown — a missed push is a UX nit, not a data integrity issue.

type ExpoMessage = {
  to: string;
  title?: string;
  body?: string;
  data?: Record<string, unknown>;
  /** "default" plays the system notification sound on iOS. */
  sound?: 'default' | null;
};

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const MAX_PER_REQUEST = 100;

export async function sendExpoPush(messages: ExpoMessage[]): Promise<void> {
  if (messages.length === 0) return;

  for (let i = 0; i < messages.length; i += MAX_PER_REQUEST) {
    const batch = messages.slice(i, i + MAX_PER_REQUEST);
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'accept-encoding': 'gzip, deflate',
          'content-type': 'application/json',
        },
        body: JSON.stringify(batch),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        console.warn(`[expo-push] HTTP ${res.status}: ${txt.slice(0, 200)}`);
      } else {
        // Drain the body so the socket can be released. Per-ticket
        // failures are visible here but we don't act on them — Expo
        // automatically removes invalid tokens after a few failures.
        await res.json().catch(() => null);
      }
    } catch (err) {
      console.warn(
        `[expo-push] batch send failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
