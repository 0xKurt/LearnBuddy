// The one line under the orb on the conversation screen (design ui_kits/app/Talk.jsx:27–30), as a
// pure decision: her own words while she speaks and while Buddy thinks about them, and Buddy's
// reply — `speaking` only while he really says it (CLAUDE.md rule 5: the screen sets it apart, as
// the design does with its ink). Once he has finished, what he said stays readable until she says
// something.
//
// An answer that was NOT written in front of her (`whole`) is treated differently, because that
// is how the fixed help answer arrives (CLAUDE.md rule 18; the server never streams an answer with
// a concern, apps/api/src/modules/buddy/stream.ts, and the message carries no mark of its own):
// it stands in full from the moment it arrives, also while it is read, and nothing she says or
// the recogniser hears takes its place — only Buddy's next answer does, or leaving the screen. A
// phone number in it must stay readable for as long as she is here.

import { sentenceSpans } from '../../lib/speech/readAloud.js';
import type { TalkPhase } from '../../lib/speech/talkState.js';

/** Buddy's answer to one turn of hers. */
export type TalkReply = {
  /** The turn it answers: a new answer is a new line. */
  id: string;
  text: string;
  /** It arrived stored, not word by word: shown in full and kept (see above). */
  whole: boolean;
};

export type TalkLineOf =
  | { who: 'her'; text: string }
  | ({ who: 'buddy'; speaking: boolean } & TalkReply)
  | null;

export function talkLine(now: {
  phase: TalkPhase;
  /** What the microphone has understood so far (empty until there is something). */
  heard: string;
  /** Her turn that is on its way. */
  said: string | null;
  /** Buddy's newest answer, as far as it is written. */
  reply: TalkReply | null;
}): TalkLineOf {
  const his: TalkLineOf = now.reply
    ? { who: 'buddy', ...now.reply, speaking: now.phase === 'speaking' }
    : null;
  if (now.reply?.whole) return his;
  if (now.phase === 'listening' && now.heard) return { who: 'her', text: now.heard };
  if (now.phase === 'thinking') return now.said ? { who: 'her', text: now.said } : null;
  return his;
}

/** The sentence of `text` his voice is on; the whole text while no sentence is known. */
export function sentenceAt(text: string, index: number | null): string {
  const span = index === null ? undefined : sentenceSpans(text)[index];
  return span ? text.slice(span[0], span[1]).trim() : text;
}

/**
 * What makes the line a NEW line (it comes in with a small rise): his next sentence, his next
 * answer, her turn — never the next chunk of a text that is still growing, which would let the
 * line fade in again with every word.
 */
export function lineKey(line: NonNullable<TalkLineOf>, sentence: number | null): string {
  if (line.who === 'her') return 'her';
  if (line.whole || !line.speaking || sentence === null) return `${line.id}:all`;
  return `${line.id}:${sentence}`;
}
