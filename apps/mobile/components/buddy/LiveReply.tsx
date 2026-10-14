// Buddy's reply while it is written (issue #715): its own component, so the word-by-word reveal
// (useReveal, a new state every animation frame) redraws only this line. Inside the conversation
// it redrew every message of the thread each frame: on the POCO X3 one reply cost ~3.6 s of JS
// and half its frames came late.

import { Platform, View } from 'react-native';

import { closedStream } from '../../lib/buddy/markdown.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { Appear, Rise } from '../lb/Motion.js';
import { BuddyLine } from './ThreadParts.js';
import { RichText } from './RichText.js';
import { TypingBubble } from './TypingBubble.js';
import { useReveal } from './useReveal.js';

const Entrance = Platform.OS === 'web' ? Appear : Rise;

/**
 * The reply as far as it has arrived, revealed smoothly; before its first word, the typing dots
 * (when the screen shows them).
 */
export function LiveReply({
  live,
  enters,
  showTyping,
  typingLabel,
}: {
  live: string | null;
  enters: boolean;
  showTyping: boolean;
  typingLabel: string;
}) {
  const { palette } = useTheme();
  const shown = useReveal(live ? closedStream(live) : null);
  if (shown)
    return (
      <Entrance key="live" animate={enters} index={0}>
        <BuddyLine orb>
          <View accessibilityLiveRegion="polite">
            <RichText text={shown} style={[TYPE.body, { color: palette.ink }]} />
          </View>
        </BuddyLine>
      </Entrance>
    );
  // Buddy is thinking: his mini orb and the dots (the text is for screen readers).
  return showTyping ? <TypingBubble key="typing" label={typingLabel} /> : null;
}
