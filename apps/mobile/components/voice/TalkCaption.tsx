// What stands under the orb on the conversation screen (design ui_kits/app/Talk.jsx:27–30): one
// small status line — what Buddy is doing right now — and ONE centred line of words: her own
// while she speaks (quiet), the sentence Buddy is saying while he speaks (full ink), and what he
// said, quiet again, once he is silent. The sentence follows his real voice
// (lib/speech/voiceState.ts), as the read-along in the chat does; a line that is new rises in,
// her growing words do not rise again with every word.
//
// The line is never cut: what does not fit its room scrolls inside it — her newest words stay in
// sight, his finished answer starts at its beginning.

import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';

import { markdownPlain } from '../../lib/buddy/markdown.js';
import { useSay } from '../../lib/speech/say.js';
import { useBuddyVoice } from '../../lib/speech/useBuddyVoice.js';
import { highlightedSentence } from '../../lib/speech/voiceState.js';
import { TALK } from '../../lib/theme/talk.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { InlineText } from '../lb/InlineText.js';
import { Rise } from '../lb/Motion.js';
import { sentenceAt, type TalkLineOf } from './talkLine.js';

export function TalkCaption({
  status,
  line,
  lines = TALK.lineMax,
  room = true,
}: {
  /** What Buddy is doing, decided by lib/speech/talkState.ts — a claim, not a label. */
  status: string;
  line: TalkLineOf;
  /** How many lines of words stand before the rest scrolls. */
  lines?: number;
  /** Keep the line's room while it is empty, so the orb does not move when words come. */
  room?: boolean;
}) {
  const { palette } = useTheme();
  const { t } = useTranslation('buddy');
  const say = useSay();
  const voice = useBuddyVoice();
  const scroll = useRef<ScrollView>(null);
  const speaking = line?.who === 'buddy' && line.speaking;
  const words =
    line && speaking ? sentenceAt(line.text, highlightedSentence(voice, line.text)) : line?.text;
  return (
    <View
      style={{
        alignSelf: 'stretch',
        alignItems: 'center',
        gap: TALK.captionGap,
        minHeight: room ? TALK.captionHeight : undefined,
      }}
    >
      <Text
        accessibilityRole="header"
        accessibilityLiveRegion="polite"
        style={[TYPE.label, { textAlign: 'center' }]}
      >
        {status}
      </Text>
      {line && words ? (
        <ScrollView
          ref={scroll}
          testID="scroll-talk"
          style={{
            alignSelf: 'stretch',
            flexGrow: 0,
            maxHeight: lines * TYPE.question.lineHeight,
          }}
          onContentSizeChange={() =>
            line.who === 'her'
              ? scroll.current?.scrollToEnd({ animated: false })
              : scroll.current?.scrollTo({ y: 0, animated: false })
          }
        >
          <Rise
            // His next sentence is a new line; her words grow in the one that is there.
            key={line.who === 'her' ? 'her' : words}
            testID="talk-line"
            accessible
            accessibilityRole="text"
            accessibilityLabel={`${t(line.who === 'buddy' ? 'thread.buddy' : 'thread.you')}: ${say(
              markdownPlain(words, { spoken: true }),
            )}`}
          >
            <InlineText
              text={words}
              accessible={false}
              style={[
                TYPE.question,
                { textAlign: 'center', color: speaking ? palette.ink : palette.ink2 },
              ]}
            />
          </Rise>
        </ScrollView>
      ) : null}
    </View>
  );
}
