// The one line under the orb on the conversation screen (design ui_kits/app/Talk.jsx:27–30), as a
// pure decision: her own words while she speaks and while Buddy thinks about them, and Buddy's
// reply — `speaking` only while he really says it (CLAUDE.md rule 5: the screen sets it apart, as
// the design does with its ink). Once he has finished, what he said stays readable, quietly, until
// she says something: an answer she needs to read again (a phone number in a help answer, rule 18)
// must not vanish with his voice.

import { sentenceSpans } from '../../lib/speech/readAloud.js';
import type { TalkPhase } from '../../lib/speech/talkState.js';

export type TalkLineOf =
  | { who: 'her'; text: string }
  | { who: 'buddy'; text: string; speaking: boolean }
  | null;

export function talkLine(now: {
  phase: TalkPhase;
  /** What the microphone has understood so far (empty until there is something). */
  heard: string;
  /** Her turn that is on its way. */
  said: string | null;
  /** Buddy's reply to it, as far as it is written. */
  reply: string | null;
}): TalkLineOf {
  if (now.phase === 'listening' && now.heard) return { who: 'her', text: now.heard };
  if (now.phase === 'thinking') return now.said ? { who: 'her', text: now.said } : null;
  if (!now.reply) return null;
  return { who: 'buddy', text: now.reply, speaking: now.phase === 'speaking' };
}

/** The sentence of `text` his voice is on; the whole text while no sentence is known. */
export function sentenceAt(text: string, index: number | null): string {
  const span = index === null ? undefined : sentenceSpans(text)[index];
  return span ? text.slice(span[0], span[1]).trim() : text;
}
