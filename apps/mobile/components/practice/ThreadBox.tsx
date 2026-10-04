// The box the practice conversation scrolls in (issues #96, #286): under the question card, sized
// by `threadRoom` to whole turns, newest at the bottom like a chat. Its own component so the
// practice screen stays within its size (docs/engineering-guards.md, rule 4) and the rule for its
// top edge has one owner.
//
// The top edge (live finding 8, issue #63): what scrolls up under the question card fades out
// instead of ending in a hard cut — the same fade every scroll area under a bar uses
// (`components/lb/EdgeFade.tsx`). At rest on a whole turn only the gap above it fades (SPACE.sm).
// The full fade comes whenever the edge lies inside a turn — she scrolled up, the newest turn is
// cut, or the keyboard took room from the box after `threadRoom` sized it — measured from where
// the conversation stands, not assumed: with the keyboard up Buddy's reply ran under the card at
// a hard edge (issue #365, closing comment).

import { useRef, useState, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';

import { SPACE } from '../../lib/theme/space.js';
import { TopEdgeFade, topEdgeMask, topEdgeMaskFrom } from '../lb/EdgeFade.js';

/** The conversation's padding above its first turn and below its last. */
const PAD = SPACE.md;

type Props = {
  /** At most (undefined: not decided yet) and at least (`threadRoom`). */
  cap: number | undefined;
  floor: number;
  /** The box holds more than it shows, and the newest turn is cut (`threadRoom`). */
  holds: boolean;
  clipped: boolean;
  /** Each turn's top in the conversation's coordinates (`ItemThread`'s `onTurnTops`). */
  tops: readonly number[];
  /** Keep the newest part in view as it grows (once there is a conversation). */
  followEnd: boolean;
  /** The box as laid out, and what its content truly needs (padding included). */
  onBox: (height: number) => void;
  onNeed: (height: number) => void;
  children: ReactNode;
};

export function ThreadBox({
  cap,
  floor,
  holds,
  clipped,
  tops,
  followEnd,
  onBox,
  onNeed,
  children,
}: Props) {
  const scroll = useRef<ScrollView>(null);
  const [box, setBox] = useState(0);
  /** Where the conversation stands: how far it is scrolled, and how tall it is. */
  const [at, setAt] = useState({ offset: 0, content: 0 });
  /** She scrolled the conversation up from its end (#63). */
  const scrolledUp = at.content - (at.offset + box) > 4;
  const cut = box > 0 && at.content > box + 1;
  // At rest the edge lies in the gap above a whole turn (or at the very top): only that gap fades.
  const onTurn =
    at.offset <= 1 ||
    tops.some((y) => at.offset >= PAD + y - SPACE.sm - 1 && at.offset <= PAD + y + 1);
  const fadeFull = clipped || (cut && (scrolledUp || !onTurn));
  return (
    // minHeight 0: on the web a flex child's min-height is its content, and the conversation then
    // SQUEEZES the question below its own content instead of scrolling itself (issue #96). The
    // conversation is the one that scrolls.
    <View
      style={{ flexShrink: 1, minHeight: floor, maxHeight: cap }}
      onLayout={(e) => {
        const h = Math.round(e.nativeEvent.layout.height);
        setBox(h);
        onBox(h);
      }}
    >
      <ScrollView
        ref={scroll}
        testID="scroll-thread"
        // Reachable by keyboard, so a long reply that holds no control (a long text's feedback,
        // #258) can still be scrolled without a pointer (axe: scrollable-region-focusable).
        focusable
        style={[
          { flexGrow: 0, flexShrink: 1 },
          fadeFull ? topEdgeMask : holds || cut ? topEdgeMaskFrom(0, SPACE.sm) : null,
        ]}
        scrollEventThrottle={64}
        onScroll={(e) => {
          const { contentOffset, contentSize } = e.nativeEvent;
          setAt({ offset: Math.round(contentOffset.y), content: Math.round(contentSize.height) });
        }}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: SPACE.lg, paddingVertical: PAD }}
        onContentSizeChange={(_, h) => {
          setAt((a) => ({ ...a, content: Math.round(h) }));
          if (followEnd) scroll.current?.scrollToEnd({ animated: true });
        }}
        onLayout={() => {
          // The keyboard shrinks this view; keep the latest reply visible above it.
          if (followEnd) scroll.current?.scrollToEnd({ animated: false });
        }}
      >
        {/* One measured column: what the conversation truly holds, so the question knows what
            is spare. */}
        <View
          style={{ gap: SPACE.md }}
          onLayout={(e) => onNeed(Math.round(e.nativeEvent.layout.height) + 2 * PAD)}
        >
          {children}
        </View>
      </ScrollView>
      {fadeFull ? <TopEdgeFade /> : null}
    </View>
  );
}
