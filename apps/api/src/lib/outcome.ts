// One classification for every call to the outside world (model, push, auth, storage).
// docs/architecture.md §Model calls, audit S-7.
//
//   ok         it worked
//   refused    a definitive "no" (a 4xx, a safety block, bad input): asking again the
//              same way gives the same answer — never retried automatically
//   transient  the other side is down or busy (5xx, 429, network): retrying later is fine
//   unknown    no answer; whether it happened cannot be known (a timeout while sending).
//              Side-effect-free calls may retry it; calls that change something outside
//              (a push) never repeat it blindly (CLAUDE.md rule 5).
//
// Seams map their provider's errors to this once; feature code decides on the outcome,
// never on provider status codes.

export type Outcome = 'ok' | 'refused' | 'transient' | 'unknown';

/** HTTP status class → outcome, for adapters that talk HTTP. */
export function outcomeOfStatus(status: number): Outcome {
  if (status >= 200 && status < 300) return 'ok';
  if (status === 408 || status === 429 || status >= 500) return 'transient';
  return 'refused';
}
