// The two voice settings (issue #386, owner 04.10.: "Es gibt aber weiterhin einen Unterschied
// zwischen vorlese Modus und interaktiver conversation"). Before #386 one flag did both, and three
// controls set it (the chat's speaker, the practice headphones, the voice-first composer).
//
//   · Vorlesen (`readAloud`): Buddy reads his replies, the questions and the feedback aloud and
//     does not listen. The speaker switch in the header (`ReadAloudSwitch`), the same in the chat
//     and on every practice screen. A per-device preference, kept in AsyncStorage (localStorage on
//     the web, see voiceModeStorage*.ts) under the key the old single flag used, so whoever had it
//     on keeps hearing Buddy; if the storage fails, the switch still works for this visit.
//   · Gespräch (`conversation`): hands-free — Buddy reads AND listens. The waveform at the end of
//     the input bar (`TalkButton`): in the chat it opens the conversation screen (`app/talk.tsx`),
//     in practice it turns the bar into the conversation row in place (`CheckBar`). It includes
//     reading aloud (`readsAloud`), and it is not kept across app starts: it is something she
//     starts, not a setting.
//
// Vorlesen never opens the microphone. Gespräch does once Buddy has read, as on /talk — not with a
// screen reader on (lib/speech/handsFree.ts, `useQuestionVoice`).

import { create } from 'zustand';

import { readVoiceMode, writeVoiceMode } from './voiceModeStorage.js';

const KEY = 'lb.voiceMode';

export type VoiceModes = {
  /** Vorlesen, her own choice (the speaker switch). */
  readAloud: boolean;
  /** Gespräch: reading aloud and listening, until she goes back to the keyboard. */
  conversation: boolean;
  /** Off also ends a conversation: that would go on reading aloud. */
  setReadAloud: (on: boolean) => void;
  setConversation: (on: boolean) => void;
};

/** Whether Buddy reads aloud right now: she switched it on, or she is in a conversation. */
export const readsAloud = (s: Pick<VoiceModes, 'readAloud' | 'conversation'>): boolean =>
  s.readAloud || s.conversation;

/** Set once the learner switched it herself: a late read from storage must not undo that. */
let touched = false;

export const useVoiceMode = create<VoiceModes>((set) => ({
  readAloud: false,
  conversation: false,
  setReadAloud: (on) => {
    touched = true;
    set(on ? { readAloud: true } : { readAloud: false, conversation: false });
    try {
      writeVoiceMode(KEY, on ? '1' : '0').catch(() => undefined);
    } catch {
      // No storage: the switch holds for this visit only.
    }
  },
  setConversation: (on) => set({ conversation: on }),
}));

async function restore(): Promise<void> {
  try {
    const stored = await readVoiceMode(KEY);
    if (!touched && stored !== null) useVoiceMode.setState({ readAloud: stored === '1' });
  } catch {
    // No storage (private browser window, broken storage): starts off.
  }
}

void restore();
