// The learning domain's part of the home's layout (lib/homeLayout.ts, issue #107): which of its
// cards takes the slim bar on top — a practice to go on with, one that is ready, the photo Buddy
// waits for, the sheet being read, or after a result the practice prepared next — and what the
// conversation then leaves out, so each thing is said once (issues #17, #94, #195, #204).

import type { BuddyHome } from '@learnbuddy/shared-types/contracts';

import type { HomeTop, HomeTopLayout } from '../homeLayout.js';

/** What the bar on top says (part of the key she closes it by), or null when there is none. */
function bar(h: Pick<BuddyHome, 'now'>): object | null {
  const now = h.now;
  return now === null || now.type === 'material_failed'
    ? null
    : now.type === 'practice_result'
      ? now.next
        ? { next: now.next }
        : null
      : { now };
}

function layout(
  h: Pick<BuddyHome, 'now' | 'working'>,
  hidden: boolean,
  greetingTells: string | null,
): HomeTopLayout {
  const now = h.now;
  const top =
    hidden || now === null
      ? null
      : now.type === 'resume_practice'
        ? 'resume'
        : now.type === 'practice_ready'
          ? 'ready'
          : now.type === 'capture_needed'
            ? 'capture'
            : now.type === 'material_processing'
              ? 'reading'
              : now.type === 'practice_result' && now.next
                ? 'next'
                : null;
  // "Ich lese dein Blatt …" already says Buddy is on the photos (one bar, not two notes).
  const inBar = top === 'reading' && h.working === 'material';
  return {
    bar: top,
    failed: now?.type === 'material_failed',
    // Keyed on the session, not on "a greeting exists": a practice she finished AFTER the
    // greeting was written still gets its own card.
    result: now?.type === 'practice_result' && now.session_id !== greetingTells,
    working: h.working === null ? null : inBar ? 'bar' : 'thread',
    photoAsk: top === 'capture' ? 'bar' : 'thread',
    preparedIn: top === 'ready' || top === 'next' ? 'bar' : 'thread',
  };
}

export const learningTop: HomeTop = { bar, layout };
