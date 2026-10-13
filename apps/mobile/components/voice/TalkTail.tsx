// The conversation's tail on the talk screen: the newest messages as the chat's own bubbles,
// cards and streaming (issue #18), at their natural height under the stage and following their
// end. What no longer fits scrolls out at the top and fades there (components/lb/EdgeFade.tsx)
// instead of being cut hard (#599 correction).

import type { MessageView } from '@learnbuddy/shared-types/contracts';
import { useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { CHAT } from '../../lib/theme/chat.js';
import { SPACE } from '../../lib/theme/space.js';
import { useEndScroll } from '../../lib/useEndScroll.js';
import { Conversation } from '../buddy/Conversation.js';
import { EDGE_FADE, TopEdgeFade, topEdgeMask } from '../lb/EdgeFade.js';

export function TalkTail({
  messages,
  pending,
  live,
  busy,
  showTyping,
}: {
  messages: MessageView[];
  /** Her words as her own bubble, until the server's thread carries the message. */
  pending: { text: string } | null;
  /** Buddy's reply while it is still being written. */
  live: string | null;
  busy: boolean;
  showTyping: boolean;
}) {
  const scroll = useRef<ScrollView>(null);
  const endScroll = useEndScroll(scroll);
  const [room, setRoom] = useState(0);
  const [content, setContent] = useState(0);
  // Only a tail that is longer than its room has something to fade.
  const more = room > 0 && content > room;
  return (
    <View style={{ flexShrink: 1 }}>
      {/* Own name, not "scroll-thread": the home stays mounted under this modal, and two
          identical testIDs make every thread locator ambiguous (Playwright strict mode). */}
      <ScrollView
        ref={scroll}
        testID="scroll-talk"
        style={[{ flexGrow: 0, flexShrink: 1 }, more ? topEdgeMask : null]}
        contentContainerStyle={{
          paddingHorizontal: SPACE.lg,
          // The fade's own height: a tail at rest never has a bubble under it.
          paddingTop: EDGE_FADE,
          paddingBottom: SPACE.sm,
        }}
        onLayout={(e) => {
          setRoom(e.nativeEvent.layout.height);
          endScroll.toEnd(false);
        }}
        onContentSizeChange={(_, height) => {
          setContent(height);
          endScroll.toEnd(true);
        }}
        onScroll={endScroll.onScroll}
        {...endScroll.inputProps}
        scrollEventThrottle={CHAT.scrollThrottle}
      >
        <Conversation
          messages={messages}
          pending={pending}
          live={live}
          busy={busy}
          spoken
          // The microphone is this screen's one filled action.
          quiet="soft"
          showTyping={showTyping}
        />
      </ScrollView>
      {more ? <TopEdgeFade /> : null}
    </View>
  );
}
