// Which of Buddy's six states (lib/buddy/signatures/core.ts) the app shows when — the same for
// every signature.
import type { OrbState } from './signatures/core.js';

/** Talk mode's states (components/voice/TalkOrb.tsx). */
export type TalkMode = 'idle' | 'listening' | 'thinking' | 'waiting' | 'speaking';

/** Buddy's state for a talk-mode state. */
export function orbForTalk(mode: TalkMode): OrbState {
  switch (mode) {
    case 'listening':
      return 'listen';
    case 'thinking':
      return 'think';
    case 'waiting':
      return 'wait';
    case 'speaking':
      return 'speak';
    default:
      return 'idle';
  }
}

/**
 * Talk mode's state from the screen's phase: Buddy's natural voice still loading counts as
 * thinking; paused after a turn is her turn (waiting) — unless something went wrong, then
 * Buddy just rests.
 */
export function talkMode(input: {
  phase: 'listening' | 'thinking' | 'speaking' | 'paused';
  /** The microphone is recording (or starting). */
  hearing: boolean;
  transcribing: boolean;
  voiceLoading: boolean;
  /** A problem, a hint or a denied microphone is shown. */
  trouble: boolean;
}): TalkMode {
  const { phase } = input;
  if (phase === 'thinking' || input.transcribing || (phase === 'speaking' && input.voiceLoading))
    return 'thinking';
  if (phase === 'speaking') return 'speaking';
  if (input.hearing) return 'listening';
  if (phase === 'paused' && !input.trouble) return 'waiting';
  return 'idle';
}

/**
 * Buddy beside one of his replies about a practice answer: a reply that just arrived
 * after a right answer celebrates (happy); otherwise he rests.
 */
export function orbForReply(input: { fresh: boolean; afterCorrect: boolean }): OrbState {
  return input.fresh && input.afterCorrect ? 'happy' : 'idle';
}
