// Buddy's newest bubble in talk mode (app/talk.tsx): while exactly this text is being read
// aloud, the sentence being read stands out (components/voice/ReadAlongText.tsx); the rest
// of the time it is the chat's ordinary rich text. The words are the same either way — the
// highlight is only a visual aid, screen readers hear the bubble's own label.

import type { StyleProp, TextStyle } from 'react-native';

import { useBuddyVoice } from '../../lib/speech/useBuddyVoice.js';
import { highlightedSentence } from '../../lib/speech/voiceState.js';
import { ReadAlongText } from '../voice/ReadAlongText.js';
import { RichText } from './RichText.js';

export function ReadAlongBubble({ text, style }: { text: string; style: StyleProp<TextStyle> }) {
  const voice = useBuddyVoice();
  if (highlightedSentence(voice, text) === null) return <RichText text={text} style={style} />;
  return <ReadAlongText text={text} style={style} />;
}
