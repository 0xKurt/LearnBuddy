// Connects a mic on the practice screen to the hands-free loop (lib/speech/handsFree.ts):
// her own tap arms it; when the loop asks, an idle mic starts listening.
import { useEffect, useRef } from 'react';

import { useHandsFree } from '../../lib/speech/handsFree.js';
import { useVoiceMode } from '../../lib/speech/voiceMode.js';
import type { VoiceInput } from './useVoiceInput.js';

export function useHandsFreeMic(voice: VoiceInput, disabled: boolean): void {
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

  useEffect(() => {
    if (ask === seen.current) return;
    seen.current = ask;
    const c = current.current;
    if (!c.voiceMode || c.disabled || c.voice.state !== 'idle') return;
    if (!useHandsFree.getState().armed) return;
    c.voice.toggle();
  }, [ask]);
}
