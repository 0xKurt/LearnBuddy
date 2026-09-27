// The app speaks the learner profile's language as soon as GET /me is known,
// whichever screen the app was entered at (app/_layout.tsx).

import type { MeResponse } from '@learnbuddy/shared-types/contracts';

import { keys } from '../api/keys.js';

type AppLocale = NonNullable<MeResponse['learner']>['locale'];

/** The learner's language when this query result is GET /me with a profile. */
export function learnerLocaleOf(queryKey: readonly unknown[], data: unknown): AppLocale | null {
  if (queryKey.length !== keys.me.length || queryKey[0] !== keys.me[0]) return null;
  const me = data as Partial<MeResponse> | undefined;
  return me?.learner?.locale ?? null;
}
