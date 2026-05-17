// PostHog analytics wrapper. Doc 02 §observability + Doc 09 §analytics.
//
// We capture only events that inform product decisions; never raw answers,
// extracted text, or learner-identifying content. Event names mirror the
// USER-FLOWS bucket numbers so we can map analytics back to flows quickly.
//
// init() is idempotent; the client is `null` when no key is configured so
// every emit call is cheap.

import PostHog from 'posthog-react-native';

import { ENV } from './env.js';

let client: PostHog | null = null;

export async function initAnalytics(): Promise<void> {
  if (client) return;
  if (!ENV.POSTHOG_API_KEY) return;
  client = new PostHog(ENV.POSTHOG_API_KEY, {
    host: ENV.POSTHOG_HOST,
    // EU-only ingest; do not send IP, set `properties.$ip` to '0.0.0.0'.
    disableGeoip: true,
    captureNativeAppLifecycleEvents: true,
    flushInterval: 30,
  });
  await client.ready();
}

export function identifyUser(accountId: string | null): void {
  if (!client) return;
  if (accountId) {
    client.identify(accountId);
  } else {
    client.reset();
  }
}

type CaptureProps = Record<string, string | number | boolean | null>;

export function track(event: KnownEvent, props?: CaptureProps): void {
  if (!client) return;
  client.capture(event, props);
}

/**
 * Whitelisted event names. Adding a new event requires editing this union so
 * the rest of the app can't drift in arbitrary names that nobody analyzes.
 */
export type KnownEvent =
  | 'app_opened'
  | 'language_picked'
  | 'signup_completed'
  | 'consent_accepted'
  | 'learner_created'
  | 'subject_created'
  | 'folder_created'
  | 'material_captured'
  | 'material_uploaded'
  | 'material_extracted'
  | 'session_started'
  | 'session_finished'
  | 'item_answered'
  | 'explain_requested'
  | 'subscription_purchased'
  | 'dsgvo_export_requested'
  | 'dsgvo_delete_requested';
