// What stands under the orb on the conversation screen (design ui_kits/app/Talk.jsx:27–30): one
// small status line — what Buddy is doing right now — and ONE centred line of words: her own
// while she speaks (quiet), the sentence Buddy is saying while he speaks (full ink), and what he
// said, quiet again, once he is silent. The sentence follows his real voice
// (lib/speech/voiceState.ts), as the read-along in the chat does; a line that is new rises in
// (`lineKey`), growing words do not rise again with every word.
//
// An answer that arrived whole — how the fixed help answer arrives (rule 18, `talkLine.ts`) —
// stands in full and in full ink from the first moment, also while it is read.
//
// The line is never cut silently: what does not fit its room (`lineRoom`, decided in
// `talkRoom.ts`) scrolls inside it — her newest words stay in sight, his finished answer starts at
// its beginning — and the edge where more follows fades out (components/lb/EdgeFade.tsx).

import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';

import { markdownPlain } from '../../lib/buddy/markdown.js';
import { useSay } from '../../lib/speech/say.js';
import { useBuddyVoice } from '../../lib/speech/useBuddyVoice.js';
import { highlightedSentence } from '../../lib/speech/voiceState.js';
import { CHAT } from '../../lib/theme/chat.js';
import { TALK } from '../../lib/theme/talk.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { TopEdgeFade, bottomEdgeMask, topEdgeMask } from '../lb/EdgeFade.js';
import { InlineText } from '../lb/InlineText.js';
import { Rise } from '../lb/Motion.js';
import { lineKey, sentenceAt, type TalkLineOf } from './talkLine.js';
import { lineCut } from './talkRoom.js';

export function TalkCaption({
  status,
  line,
  lineRoom = TALK.lineMax * TYPE.question.lineHeight,
  onText,
  room = true,
}: {
  /** What Buddy is doing, decided by lib/speech/talkState.ts — a claim, not a label. */
  status: string;
  line: TalkLineOf;
  /** How high the words may stand before the rest scrolls (components/voice/talkRoom.ts). */
  lineRoom?: number;
  /** The words' real height once laid out: what `talkRoom` decides the stage by. */
  onText?: (height: number) => void;
  /** Keep the line's room while it is empty, so the orb does not move when words come. */
  room?: boolean;
}) {
  const { palette } = useTheme();
  const { t } = useTranslation('buddy');
  const say = useSay();
  const voice = useBuddyVoice();
  const scroll = useRef<ScrollView>(null);
  const his = line?.who === 'buddy' ? line : null;
  // Sentence by sentence only for a reply that was written in front of her.
  const sentence = his && his.speaking && !his.whole ? highlightedSentence(voice, his.text) : null;
  const words = his ? sentenceAt(his.text, sentence) : line?.text;
  const strong = his !== null && (his.speaking || his.whole);
  const [content, setContent] = useState<number | null>(null);
  // Her words are followed to their end; his answer is read from its beginning.
  const [atEnd, setAtEnd] = useState(false);
  const cut = lineCut({ content, room: lineRoom, atEnd });
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
        <View style={{ alignSelf: 'stretch' }}>
          <ScrollView
            ref={scroll}
            testID="scroll-talk"
            // Reachable by keyboard, like the practice body (axe `scrollable-region-focusable`).
            tabIndex={0}
            style={[
              { alignSelf: 'stretch', flexGrow: 0, maxHeight: lineRoom },
              cut === 'bottom' ? bottomEdgeMask() : cut === 'top' ? topEdgeMask : null,
            ]}
            scrollEventThrottle={CHAT.scrollThrottle}
            onScroll={({ nativeEvent: e }) =>
              setAtEnd(e.contentOffset.y + e.layoutMeasurement.height >= e.contentSize.height - 1)
            }
            onContentSizeChange={(_, height) => {
              setContent(height);
              onText?.(height);
              setAtEnd(line.who === 'her');
              if (line.who === 'her') scroll.current?.scrollToEnd({ animated: false });
              else scroll.current?.scrollTo({ y: 0, animated: false });
            }}
          >
            <Rise
              // His next sentence is a new line; growing words stay in the one that is there.
              key={lineKey(line, sentence)}
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
                  { textAlign: 'center', color: strong ? palette.ink : palette.ink2 },
                ]}
              />
            </Rise>
          </ScrollView>
          {cut ? <TopEdgeFade bottom={cut === 'bottom'} /> : null}
        </View>
      ) : null}
    </View>
  );
}
