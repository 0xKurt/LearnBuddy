// Connects a mic on the practice screen to the hands-free loop (lib/speech/handsFree.ts):
// her own tap arms it; when the loop asks, an idle mic starts listening. One listening
// belongs to one turn: when she answers another way (the screen locks while it checks),
// when Buddy starts speaking or when the question changes, a running mic is cancelled and
// its text dropped (audit M-78 handsfree-recording-outlives-turn).
import { useEffect, useRef } from 'react';

import { useHandsFree } from '../../lib/speech/handsFree.js';
import { onSpeakStart } from '../../lib/speech/listen.js';
import { useVoiceMode } from '../../lib/speech/voiceMode.js';
import type { VoiceInput } from './useVoiceInput.js';

const listening = (v: VoiceInput) => v.state === 'starting' || v.state === 'recording';

export function useHandsFreeMic(voice: VoiceInput, disabled: boolean, turn?: string): void {
  const voiceMode = useVoiceMode((s) => s.on);
  const ask = useHandsFree((s) => s.ask);
  const seen = useRef(ask);
  const current = useRef({ voice, disabled, voiceMode });
  current.current = { voice, disabled, voiceMode };

  // She started listening (her tap, or the loop): in voice mode that arms the loop.
  useEffect(() => {
    if (voiceMode && (voice.state === 'starting' || voice.state === 'recording'))
      useHandsFree.getState().arm();
  }, [voice.state, voiceMode]);

  // She answered another way (the screen locks while the answer is checked).
  useEffect(() => {
    if (disabled && listening(current.current.voice)) current.current.voice.cancel();
  }, [disabled]);

  // A new question: whatever was being recorded belonged to the old one.
  const lastTurn = useRef(turn);
  useEffect(() => {
    if (lastTurn.current === turn) return;
    lastTurn.current = turn;
    if (listening(current.current.voice)) current.current.voice.cancel();
  }, [turn]);

  // Buddy starts reading aloud: the mic would only hear Buddy.
  useEffect(
    () =>
      onSpeakStart(() => {
        if (listening(current.current.voice)) current.current.voice.cancel();
      }),
    [],
  );

  useEffect(() => {
    if (ask === seen.current) return;
    seen.current = ask;
    const c = current.current;
    if (!c.voiceMode || c.disabled || c.voice.state !== 'idle') return;
    if (!useHandsFree.getState().armed) return;
    c.voice.toggle();
  }, [ask]);
}
