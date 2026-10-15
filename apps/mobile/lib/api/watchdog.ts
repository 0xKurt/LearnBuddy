// How long a call to the API may take before the app says so (#662, audit F14-a). Without it a
// connection that died after the request went out (a lift, a train, a router that drops idle
// lines) left the screen waiting forever: no error, no retry, the next tap blocked behind it.
// Pure and Expo-free, so lib/api/__tests__/watchdog.test.ts drives it with a hanging fetch.

import { STREAM_IDLE_MS } from '@learnbuddy/shared-types/contracts';

import { ApiError } from './apiError.js';

/**
 * How long a plain JSON answer may take. `quick` is every read and every write that only
 * touches the database; `long` is a call that waits for the model before it answers (practice,
 * tutor, reading her work, speech) or gathers all her data (the export). The API bounds its
 * model calls itself (the longest, a spoken rehearsal, at 120 s), so `long` only ends a call
 * whose answer can no longer arrive.
 */
export const WAIT_MS = { quick: 15_000, long: 150_000 } as const;
export type Wait = keyof typeof WAIT_MS;

/** A streamed answer: silence this long means the line is gone (the API sends keepalives). */
export const STREAM_SILENCE_MS = STREAM_IDLE_MS;

/** The JSON answer did not come in time: the server may still finish what was asked. */
export function timedOut(): ApiError {
  return new ApiError('network', 'No answer in time', 0, { reason: 'timeout' });
}

/**
 * Ends one call after `ms` without news. `touch()` starts the count again (a streamed chunk
 * arrived); `race()` makes any promise of the call reject with `expired()` once the time is up —
 * also a fetch that ignores its AbortSignal. `stopped` is her own "Stopp": it aborts the call
 * too, but is not a timeout.
 */
export class Watchdog {
  private readonly ctl = new AbortController();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private fire: (err: ApiError) => void = () => undefined;
  private readonly expiry: Promise<never>;
  private done = false;
  fired = false;

  constructor(
    private readonly ms: number,
    readonly expired: () => ApiError,
    stopped?: AbortSignal,
  ) {
    this.expiry = new Promise<never>((_, reject) => {
      this.fire = reject;
    });
    // Nobody may be racing at the moment it fires; that is not an unhandled rejection.
    this.expiry.catch(() => undefined);
    if (stopped?.aborted) this.ctl.abort();
    else stopped?.addEventListener('abort', () => this.ctl.abort(), { once: true });
    this.touch();
  }

  get signal(): AbortSignal {
    return this.ctl.signal;
  }

  touch(): void {
    if (this.done) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.fired = true;
      this.done = true;
      this.fire(this.expired());
      this.ctl.abort();
    }, this.ms);
  }

  race<T>(work: Promise<T>): Promise<T> {
    return Promise.race([work, this.expiry]);
  }

  /** The call is over (answered or failed): the timer must not fire afterwards. */
  stop(): void {
    this.done = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
