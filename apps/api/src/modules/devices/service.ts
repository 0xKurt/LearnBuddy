// Push devices (docs/architecture.md §Delivery; audit M-65, decision D-6).
//
// A push token is bound to the app install that registered it (`device_id`, a
// random id the app keeps), and an install gets Buddy's messages for at most one
// learner. Code enforces it, not the app's good behaviour:
// - registering a token deactivates every other active token of that install;
// - a signed-in person claiming the install deactivates tokens of learners that
//   are not theirs (a sibling signs in on a shared phone after an offline sign-out);
// - releasing the install (sign-out) deactivates its tokens. Release needs no
//   session — the app retries it after the tokens are gone; knowing the random
//   install id is the proof, and it can only ever switch messages off.

import type { RegisterPushTokenRequest } from '@learnbuddy/shared-types/contracts';

import type { Deps } from '../../deps.js';

export async function registerPushToken(
  deps: Deps,
  learnerId: string,
  input: RegisterPushTokenRequest,
): Promise<void> {
  const now = deps.now();
  await deps.db.tx(async (tx) => {
    if (input.device_id) {
      await tx.query(
        `update push_tokens set status = 'invalid', invalid_reason = 'replaced_on_device'
          where device_id = $1 and status = 'active' and token <> $2`,
        [input.device_id, input.token],
      );
    }
    await tx.query(
      `insert into push_tokens (learner_id, token, platform, status, registered_at, device_id)
       values ($1, $2, $3, 'active', $4, $5)
       on conflict (token) do update
         set learner_id = excluded.learner_id, platform = excluded.platform, status = 'active',
             invalid_reason = null, registered_at = excluded.registered_at,
             device_id = coalesce(excluded.device_id, push_tokens.device_id)`,
      [learnerId, input.token, input.platform, now, input.device_id ?? null],
    );
  });
}
