// What the conversation screen says Buddy is doing, as one pure decision (issue #158).
//
// It used to say "Ich höre zu." the moment she opened the screen — while the recorder was
// still being prepared. She would speak into a microphone that was not running yet and
// only find out afterwards that nothing arrived. CLAUDE.md rule 5: never claim what is not
// proven, and "I am listening" is a claim about a machine that has to be started first.
//
// The order matters and is the whole point: thinking and speaking come first (they are
// what Buddy is doing), then "getting ready" (the microphone is not yet running), and only
// then "listening". Pure, so the promise is checkable instead of a comment in a component.

export type TalkPhase = 'listening' | 'thinking' | 'speaking' | 'paused';

/** The recogniser's own state (lib/speech/voiceState.ts) as far as this decision needs it. */
export type MicState = 'idle' | 'starting' | 'recording' | 'transcribing';

export type TalkHeadline =
  | 'buddy:talk.thinking'
  | 'buddy:talk.speaking'
  | 'buddy:talk.getting_ready'
  | 'buddy:talk.listening'
  | 'buddy:talk.paused';

export function talkHeadline(phase: TalkPhase, mic: MicState): TalkHeadline {
  if (phase === 'thinking' || mic === 'transcribing') return 'buddy:talk.thinking';
  if (phase === 'speaking') return 'buddy:talk.speaking';
  if (mic === 'starting') return 'buddy:talk.getting_ready';
  if (phase === 'listening') return 'buddy:talk.listening';
  return 'buddy:talk.paused';
}
