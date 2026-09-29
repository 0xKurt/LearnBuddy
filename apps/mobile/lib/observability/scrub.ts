// What a crash report may carry off the phone — and what it never may (issue #36).
//
// Crash reports are off unless the owner configured a DSN (`EXPO_PUBLIC_SENTRY_DSN`,
// lib/env.ts). Where they are on, this module is the fence. It is pure, so every rule is
// unit-tested without a device (`__tests__/scrub.test.ts`); `sentry.ts` only hands these
// functions to the SDK.
//
// Two rules, both from docs/privacy.md §Processors:
//
//  1. **EU ingest only.** A DSN that does not point at Sentry's EU host is refused while
//     the app starts — the same shape as the API refusing a non-EU model region
//     (`apps/api/src/config.ts` `EuLocation`). A crash report carries a stack trace and
//     device data; it must not leave the EU because a build was configured carelessly.
//  2. **No conversation, no addresses.** Everything a Sentry event uses to carry free
//     text (extra data, request bodies, console output) is dropped before sending, and
//     what is left has e-mail addresses redacted.

import type { Breadcrumb, Event } from '@sentry/react-native';

/**
 * Sentry's EU ingest domain. The `.de` host *is* the EU guarantee (the region is chosen
 * when the Sentry organisation is created and cannot be changed later), so it is matched
 * exactly and nothing else is accepted.
 */
const EU_INGEST_SUFFIX = '.ingest.de.sentry.io';

/** True only for `https://<key>@<something>.ingest.de.sentry.io/<project>`. */
export function isEuIngest(dsn: string): boolean {
  let url: URL;
  try {
    url = new URL(dsn);
  } catch {
    return false;
  }
  return url.protocol === 'https:' && url.hostname.endsWith(EU_INGEST_SUFFIX);
}

/**
 * Refuses a DSN outside the EU ingest. Called while `lib/env.ts` loads, so a build with a
 * wrong DSN never reaches a screen instead of quietly reporting to another region. The
 * message never echoes the DSN.
 */
export function assertEuIngest(dsn: string): void {
  if (isEuIngest(dsn)) return;
  throw new Error(
    `EXPO_PUBLIC_SENTRY_DSN must be a Sentry EU DSN (https://<key>@<org>${EU_INGEST_SUFFIX}/<project>). ` +
      'Crash reports may only go to the EU region (docs/privacy.md §Processors).',
  );
}

/**
 * Breadcrumbs that say *where* she was, never *what* was said, typed or sent. Console and
 * network crumbs are the ones that would carry message text and URLs, so only these
 * categories survive at all.
 */
const KEPT_CATEGORIES = new Set(['navigation', 'app.lifecycle', 'touch']);

/** A crumb reduced to where and when, or `null` when it has no business leaving. */
export function scrubBreadcrumb(crumb: Breadcrumb): Breadcrumb | null {
  if (!crumb.category || !KEPT_CATEGORIES.has(crumb.category)) return null;
  const kept: Breadcrumb = { category: crumb.category };
  if (crumb.type !== undefined) kept.type = crumb.type;
  if (crumb.level !== undefined) kept.level = crumb.level;
  if (crumb.timestamp !== undefined) kept.timestamp = crumb.timestamp;
  // Route names ("/practice/<id>") say which screen she was on. They are app routes and
  // internal ids, never text she or Buddy wrote — anything else in `data` is dropped.
  const from = routeOf(crumb.data?.['from']);
  const to = routeOf(crumb.data?.['to']);
  if (from !== null || to !== null) {
    kept.data = {};
    if (from !== null) kept.data['from'] = from;
    if (to !== null) kept.data['to'] = to;
  }
  return kept;
}

/**
 * Strips an event down to what a developer needs to find the bug: the stack, the device,
 * the app version. Everything that could carry the learner's words or her address goes.
 */
export function scrubEvent<E extends Event>(event: E): E {
  // Who she is: never. We never call `Sentry.setUser`, and this makes sure no integration
  // can add one behind our back (and with it an id, an e-mail or an IP address).
  delete event.user;
  // URL, headers, cookies and body of the request that was running: all of it can hold
  // her token or the text she just sent.
  delete event.request;
  // Free-form attachments: the two places anything at all can be hung on an event.
  delete event.extra;
  delete event.server_name;
  if (event.contexts) {
    delete event.contexts['response'];
    delete event.contexts['state'];
  }
  if (event.message !== undefined) event.message = redact(event.message);
  if (event.logentry) {
    const message = event.logentry.message;
    event.logentry = message === undefined ? {} : { message: redact(message) };
  }
  for (const value of event.exception?.values ?? []) {
    if (value.value !== undefined) value.value = redact(value.value);
  }
  event.breadcrumbs = (event.breadcrumbs ?? [])
    .map(scrubBreadcrumb)
    .filter((crumb): crumb is Breadcrumb => crumb !== null);
  return event;
}

/** Deliberately narrow: an address that slipped into an error message is removed. */
const EMAIL = /[^\s<>()[\]{},;:"']+@[^\s<>()[\]{},;:"']+\.[a-zA-Z]{2,}/g;

export function redact(text: string): string {
  return text.replace(EMAIL, '[email]');
}

function routeOf(value: unknown): string | null {
  return typeof value === 'string' ? redact(value) : null;
}
