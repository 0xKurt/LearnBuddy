// The box the practice conversation scrolls in (issues #96, #286): under the question card, sized
// by `threadRoom` to whole parts, newest at the bottom like a chat. Its own component so the
// practice screen stays within its size (docs/engineering-guards.md, rule 4) and the rule for its
// top edge has one owner.
//
// Its parts (the turns, the help chips, a card under the replies) each stand in their own measured
// slot: where each starts is what `threadRoom` needs to begin the box above a WHOLE part — the
// help chips or a solution card are as much a part as a turn, and the row "Tipp · Lösung zeigen"
// stood half under the card while only turns counted (issue #403).
//
// The top edge (live finding 8, issue #63): what scrolls up under the question card fades out
// instead of ending in a hard cut — the same fade every scroll area under a bar uses
// (`components/lb/EdgeFade.tsx`). At rest on a whole part only the gap above it fades (SPACE.sm).
// The full fade comes whenever the edge lies inside a part — she scrolled up, or the keyboard took
// room from the box after `threadRoom` sized it — measured from where the conversation stands, not
// assumed: with the keyboard up Buddy's reply ran under the card at a hard edge (issue #365,
// closing comment).

import { Children, isValidElement, useRef, useState, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';

import { useStackTops } from '../../lib/practice/useStackTops.js';
import { SPACE } from '../../lib/theme/space.js';
import { TopEdgeFade, topEdgeMask, topEdgeMaskFrom } from '../lb/EdgeFade.js';

/** The conversation's padding above its first part and below its last. */
const PAD = SPACE.md;

/** Scrolled to its end: the content below the view's top is the view's height. */
function atEnd(content: number, view: number) {
  return { offset: Math.max(0, content - view), content };
}

type Props = {
  /** At most (undefined: not decided yet) and at least (`threadRoom`). */
  cap: number | undefined;
  floor: number;
  /** The box holds more than it shows (`threadRoom`). */
  holds: boolean;
  /** Where each turn and part starts, in the conversation's coordinates. */
  tops: readonly number[];
  /** Keep the newest part in view as it grows (once there is a conversation). */
  followEnd: boolean;
  /** The box as laid out, and what its content truly needs (padding included). */
  onBox: (height: number) => void;
  onNeed: (height: number) => void;
  /** Where each of its parts starts (`threadRoom`'s `parts`). */
  onParts: (tops: readonly number[]) => void;
  children: ReactNode;
};

export function ThreadBox({
  cap,
  floor,
  holds,
  tops,
  followEnd,
  onBox,
  onNeed,
  onParts,
  children,
}: Props) {
  const scroll = useRef<ScrollView>(null);
  const [box, setBox] = useState(0);
  /**
   * Where the conversation stands: how far it is scrolled, and how tall it is. Where it follows
   * its end, that end is where it stands (`atEnd`): the throttled scroll events dropped the last
   * one of a scroll to the end, and an old offset faded a whole turn as if she had scrolled up.
   */
  const [at, setAt] = useState({ offset: 0, content: 0 });
  /** The scroll view's own height as laid out. */
  const view = useRef(0);
  // Each part in its own slot, its top from the parts' heights (`useStackTops`, issue #403): the
  // step above it is none above the first drawn part and none at one that draws nothing (an empty
  // `ItemThread` before her first answer), as a column `gap` would not skip it.
  const slots = Children.toArray(children).map((part, i) => ({
    key: isValidElement(part) && part.key !== null ? String(part.key) : String(i),
    part,
  }));
  const { pieces, onHeight } = useStackTops(
    SPACE.md,
    slots.map((slot) => slot.key),
    (all) => onParts(all.map((p) => p.top)),
  );
  /** She scrolled the conversation up from its end (#63). */
  const scrolledUp = at.content - (at.offset + box) > 4;
  const cut = box > 0 && at.content > box + 1;
  // At rest the edge lies in the gap above a whole part (or at the very top): only that gap fades.
  const onTurn =
    at.offset <= 1 ||
    tops.some((y) => at.offset >= PAD + y - SPACE.sm - 1 && at.offset <= PAD + y + 1);
  const fadeFull = cut && (scrolledUp || !onTurn);
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
          const content = Math.round(h);
          setAt((a) => (followEnd ? atEnd(content, view.current) : { ...a, content }));
          if (followEnd) scroll.current?.scrollToEnd({ animated: true });
        }}
        onLayout={(e) => {
          view.current = Math.round(e.nativeEvent.layout.height);
          // The keyboard shrinks this view; keep the latest reply visible above it.
          if (!followEnd) return;
          setAt((a) => atEnd(a.content, view.current));
          scroll.current?.scrollToEnd({ animated: false });
        }}
      >
        {/* One measured column: what the conversation truly holds, so the question knows what
            is spare. */}
        <View onLayout={(e) => onNeed(Math.round(e.nativeEvent.layout.height) + 2 * PAD)}>
          {slots.map(({ key, part }, i) => (
            <View key={key} style={{ marginTop: pieces[i]?.step ?? 0 }} onLayout={onHeight(key)}>
              {part}
            </View>
          ))}
        </View>
      </ScrollView>
      {fadeFull ? <TopEdgeFade /> : null}
    </View>
  );
}
