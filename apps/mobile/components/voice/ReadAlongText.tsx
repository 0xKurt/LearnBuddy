// A text that reads along with Buddy's voice (gap 12, ADR 0008): while exactly this text is
// read aloud, the sentence being read stands out (soft lilac behind it, full ink) and the rest
// steps back a little. The natural voice gives no word timings, so the highlight is per
// sentence and follows the real playback (lib/speech/listen.ts → useBuddyVoice). Otherwise it
// is a plain Text. The highlight is only an aid: the words are the same for a screen reader.

import { useMemo } from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';

import { sentenceSpans } from '../../lib/speech/readAloud.js';
import { useBuddyVoice } from '../../lib/speech/useBuddyVoice.js';
import { highlightedSentence } from '../../lib/speech/voiceState.js';
import { LB } from '../../lib/theme/colors.js';

export function ReadAlongText({ text, style }: { text: string; style?: StyleProp<TextStyle> }) {
  const voice = useBuddyVoice();
  const spans = useMemo(() => sentenceSpans(text), [text]);
  const index = highlightedSentence(voice, text);
  const span = index === null ? undefined : spans[index];
  if (!span) return <Text style={style}>{text}</Text>;
  return (
    <Text style={style}>
      <Text style={{ color: LB.ink2 }}>{text.slice(0, span[0])}</Text>
      <Text style={{ color: LB.ink, backgroundColor: LB.primaryLt, borderRadius: 6 }}>
        {text.slice(span[0], span[1])}
      </Text>
      <Text style={{ color: LB.ink2 }}>{text.slice(span[1])}</Text>
    </Text>
  );
}
