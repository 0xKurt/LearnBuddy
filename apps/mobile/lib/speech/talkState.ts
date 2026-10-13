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

/** Buddy's voice as far as this decision needs it (lib/speech/voiceState.ts). */
export type VoiceNow = 'idle' | 'loading' | 'speaking';

export type TalkStatus = TalkHeadline | 'buddy:talk.listening_sub' | 'buddy:talk.tap_when_done';

/**
 * Whether his voice has been heard for the reply he is on (the screen keeps it as state and
 * feeds it back). True from the first audio of a reply until the screen leaves 'speaking': the
 * gap while the next sentence's audio loads is still him speaking. Any other phase starts over.
 */
export function heardHim(before: boolean, phase: TalkPhase, voice: VoiceNow): boolean {
  if (phase !== 'speaking') return false;
  return before || voice === 'speaking';
}

/**
 * The one status line under the orb (design ui_kits/app/Talk.jsx:28).
 *
 *  · While the microphone really records it says how her turn ends: by itself only where her
 *    pause really ends it (issue #523); the browser's recorder measures no level, so there the
 *    tap finishes.
 *  · "Buddy spricht …" stands from his first audio to the end of his reply — not before it
 *    (his voice on its way is thinking, as the moon shows), and without flipping back between
 *    two sentences (a live region would announce every flip).
 *  · Everything else is the headline itself.
 */
export function talkStatus(now: {
  phase: TalkPhase;
  mic: MicState;
  /** Her pause ends the recording (`VoiceInput.endsByItself`). */
  endsByItself: boolean;
  voice: VoiceNow;
  /** `heardHim` so far. */
  heard: boolean;
}): TalkStatus {
  if (now.phase === 'listening' && now.mic === 'recording')
    return now.endsByItself ? 'buddy:talk.listening_sub' : 'buddy:talk.tap_when_done';
  if (now.phase === 'speaking' && now.mic !== 'transcribing')
    return heardHim(now.heard, now.phase, now.voice)
      ? 'buddy:talk.speaking'
      : 'buddy:talk.thinking';
  return talkHeadline(now.phase, now.mic);
}

/**
 * Whether a home that a turn brought back may be written over the one the app holds. Two
 * requests can be on their way at once here — her spoken turn and "Gespräch beenden" — and the
 * turn's answer, built before the scene ended, can arrive after the answer that ended it. Every
 * change a decision depends on raises `context_version` (CLAUDE.md rule 4), ending a scene
 * included, so the older home is the one with the lower version.
 */
export function newerHome(
  incoming: { context_version: number },
  held: { context_version: number } | undefined,
): boolean {
  return held === undefined || incoming.context_version >= held.context_version;
}
