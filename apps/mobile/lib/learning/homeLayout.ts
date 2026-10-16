// The learning domain's part of the home's layout (lib/homeLayout.ts, issue #107): which of its
// cards takes the slim bar on top — a practice to go on with, one that is ready, the photo Buddy
// waits for, the sheet being read, or after a result the practice prepared next — and what the
// conversation then leaves out, so each thing is said once (issues #17, #94, #195, #204).

import type { BuddyHome, MessageView } from '@learnbuddy/shared-types/contracts';

import type { HomeLayout, HomeTop, HomeTopLayout } from '../homeLayout.js';

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
    // Only her photos get a "working" note (issue #845): after a practice the check may rightly
    // say nothing, and "Ich schaue mir an, wie deine Übung lief …" then went with nothing after
    // it. The result card tells what she did; `working` still keeps the home polling closely.
    working: h.working !== 'material' ? null : inBar ? 'bar' : 'thread',
    photoAsk: top === 'capture' ? 'bar' : 'thread',
    preparedIn: top === 'ready' || top === 'next' ? 'bar' : 'thread',
  };
}

type Action = MessageView['actions'][number];

/**
 * "Schick mir ein Foto" is said once (issue #94, `photoAsk`): while the capture bar asks for this
 * photo, its word-for-word "Ich warte auf dein Foto" receipt leaves the conversation. The practice
 * on top is told once (issue #204, `preparedIn`): the bar names it with its question count and
 * minutes, word for word what the "Vorbereitet: …" receipt says.
 */
function carried(h: Pick<BuddyHome, 'now'>, l: Pick<HomeLayout, 'photoAsk' | 'preparedIn'>) {
  const captureNow = l.photoAsk === 'bar' && h.now?.type === 'capture_needed' ? h.now : null;
  const preparedOnBar =
    l.preparedIn === 'bar'
      ? h.now?.type === 'practice_ready'
        ? h.now.step_id
        : h.now?.type === 'practice_result'
          ? (h.now.next?.step_id ?? null)
          : null
      : null;
  return {
    asks: (a: Action): boolean =>
      captureNow !== null &&
      a.summary.tool === 'request_material' &&
      a.status === 'applied' &&
      (captureNow.step_id !== null
        ? a.summary.step_id === captureNow.step_id
        : a.summary.title === captureNow.title),
    names: (a: Action): boolean =>
      preparedOnBar !== null &&
      a.summary.tool === 'prepare_practice' &&
      a.summary.step_id === preparedOnBar &&
      a.status === 'applied',
  };
}

export const learningTop: HomeTop = {
  bar,
  layout,
  carried,
  reading: (h) => h.now?.type === 'material_processing',
};
