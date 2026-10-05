// Gespräch on a practice screen (issue #386): the waveform at the end of the input bar starts it,
// "Tastatur" in the conversation row ends it — the two ways, written once. Starting needs no line
// of explanation: as on /talk, Buddy reads the question and then listens (`useQuestionVoice`), and
// the row shows it. Ending stops a reading that only the conversation wanted; with Vorlesen on,
// Buddy goes on reading.

import { stop as stopSpeaking } from '../../lib/speech/listen.js';
import { useVoiceMode } from '../../lib/speech/voiceMode.js';

export function useConversation(): { start: () => void; stop: () => void } {
  return {
    start: () => useVoiceMode.getState().setConversation(true),
    stop: () => {
      const modes = useVoiceMode.getState();
      modes.setConversation(false);
      if (!modes.readAloud) stopSpeaking();
    },
  };
}
