// Gespräch on a practice screen (issue #386): the waveform at the end of the input bar starts it,
// "Tastatur" in the conversation row ends it — the two ways, written once.
//
// Starting says in one line what happens now (issue #52: the mark alone left its purpose unclear):
// Buddy reads, and after her first tap on the mic he listens again by himself — the microphone
// never starts before that tap (lib/speech/handsFree.ts). Ending stops a reading that only the
// conversation wanted; with Vorlesen on, Buddy goes on reading.

import { useTranslation } from 'react-i18next';

import { stop as stopSpeaking } from '../../lib/speech/listen.js';
import { useVoiceMode } from '../../lib/speech/voiceMode.js';
import { toast } from '../lb/Toast.js';

export function useConversation(): { start: () => void; stop: () => void } {
  const { t } = useTranslation('common');
  return {
    start: () => {
      useVoiceMode.getState().setConversation(true);
      toast.show(t('voice.conversation_on'), 'info');
    },
    stop: () => {
      const modes = useVoiceMode.getState();
      modes.setConversation(false);
      toast.dismiss(t('voice.conversation_on'));
      if (!modes.readAloud) stopSpeaking();
    },
  };
}
