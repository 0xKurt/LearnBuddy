// The end of her turn on the recording path (conversation mode, issue #523): the on-device
// recogniser ends by itself on a pause, and where it is unavailable the recorder's level
// decides. Once she has clearly spoken, a sustained pause ends the recording; a room too
// loud to ever fall quiet never ends it, and the tap keeps working. Pure, so the rule is
// unit-tested; useVoiceInput holds one per recording.

import { ROOM_TONE } from './level.js';

/** Use the recorder's existing room-tone boundary, including quieter syllables (#932). */
const ROOM = ROOM_TONE;
/** She must have spoken this long before a pause can end her turn. */
const HEARD_MS = 250;
/** A pause this long ends it. */
const PAUSE_MS = 1600;
/** A gap between two readings counts at most this much (a stalled poll is not speech). */
const MAX_STEP_MS = 200;

export class PauseEnd {
  private heardMs = 0;
  private quietSince: number | null = null;
  private lastAt = 0;

  /** One level reading (0…1) at `now`; true = her turn is over. */
  observe(level: number, now: number): boolean {
    const dt = this.lastAt ? Math.min(MAX_STEP_MS, now - this.lastAt) : 0;
    this.lastAt = now;
    if (level > ROOM) {
      this.heardMs += dt;
      this.quietSince = null;
      return false;
    }
    if (this.heardMs < HEARD_MS) return false;
    this.quietSince ??= now;
    return now - this.quietSince >= PAUSE_MS;
  }

  reset(): void {
    this.heardMs = 0;
    this.quietSince = null;
    this.lastAt = 0;
  }
}
