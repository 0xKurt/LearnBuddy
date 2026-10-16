// The learning domain's part of Buddy's greeting (lib/buddy/sessionAnchor.ts, issue #107): the
// practice she just finished, said in the greeting's own sentence (issue #195).

import type { NowCard } from '@learnbuddy/shared-types/contracts';

import type { Greeting } from '../buddy/sessionAnchor.js';

/**
 * What Buddy's greeting tells about the practice she just finished (issue #195); null: nothing,
 * and the plain hello stands.
 *
 * The owner's own app in the promo footage: „Hi, Lienne!" and directly under it a card
 * „Done! You answered 6 questions." — „Was für ne tolle conversation". She had just worked
 * through six questions and was greeted as if nothing had happened, then handed a log entry.
 *
 * So the greeting looks at what the home already carries. The practice she just finished is
 * in the same payload as the thread (`NowCard` 'practice_result', server-side only within
 * 30 minutes of finishing it, `modules/buddy/home.ts`), so this costs **no round trip and no
 * model call** — the reason opening the app is instant and works offline stays untouched
 * (this is not variant B of issue #104).
 *
 * What may be said is exactly what the summary may say (`lib/practice/summaryLine.ts`,
 * CLAUDE.md rule 5): how many she answered is a fact about what she did; "alles gleich beim
 * ersten Mal" only when that is true of the **whole** round, and never for a test, where no
 * answer was judged in front of her. Six questions with four wrong get the plain sentence —
 * praise she can see through is worse than none.
 *
 * Never a count of due or missed work (CLAUDE.md rule 6): the only number here is her own
 * finished work.
 */
export function practiceGreeting(
  now: NowCard | null,
  /** When the last message before this greeting was written; null = there is none. */
  lastMessageAt: string | null = null,
): Greeting | null {
  // Nothing just happened (or a session she left without answering): nothing to tell, the plain
  // hello stands.
  if (
    now?.type !== 'practice_result' ||
    now.result.answered <= 0 ||
    !justBefore(now, lastMessageAt)
  )
    return null;
  const { answered, first_try: firstTry } = now.result;
  const shape =
    now.mode === 'help'
      ? // Homework: what she solved herself, the one thing help mode claims.
        'help'
      : now.mode !== 'test' && firstTry === answered
        ? 'all_first'
        : 'practice';
  // One wording per shape, not three per part of the day: the repetition issue #129 was
  // about is a greeting she reads every day, and this one belongs to a single event that
  // stands for half an hour. Four times the copy for that is not a trade worth making.
  return { key: `session.after.${shape}`, count: answered, tells: now.session_id };
}

/**
 * Whether the finished practice is what she did last, so "gerade" is true (issue #630). The
 * greeting stands under the last message; a practice finished BEFORE that message is older than
 * what was said since — the owner's device: „Hey Testkind – 7 Fragen hast du gerade beantwortet"
 * under her own later „Lass uns das Arbeitsblatt üben", read as Buddy's answer to it. That result
 * keeps its own card at its own moment in the thread (`placeByTime`). A home without the moment
 * (an older server) claims nothing (CLAUDE.md rule 5).
 */
function justBefore(
  now: Extract<NowCard, { type: 'practice_result' }>,
  lastMessageAt: string | null,
): boolean {
  if (!now.finished_at) return false;
  return lastMessageAt === null || Date.parse(now.finished_at) >= Date.parse(lastMessageAt);
}
