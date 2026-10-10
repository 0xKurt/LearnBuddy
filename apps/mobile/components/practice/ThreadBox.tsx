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
//
// The rule for both edges is `threadEdge` (lib/practice/threadRoom.ts).
//
// Where it follows its end, it rests at the end — except on a reply she reads through
// (`readFrom`, `readsThrough`: Buddy's feedback on her long text, #258, an explanation with its
// picture, #298): that is read from its top, so the box rests there and she scrolls down through
// it; resting at its end showed the last line of the feedback first and its first point under the
// card. Where it does not follow (the help chips alone, before
// her first answer), it rests at its top, where it was drawn (#504).

import { Children, isValidElement, useEffect, useRef, useState, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';

import type { RoomPart } from '../../lib/practice/screenRoom.js';
import { useStackTops } from '../../lib/practice/useStackTops.js';
import { THREAD_PAD, threadEdge, threadRest } from '../../lib/practice/threadRoom.js';
import { SPACE } from '../../lib/theme/space.js';
import { EDGE_FADE, TopEdgeFade, topEdgeMaskFrom } from '../lb/EdgeFade.js';

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
  /** Where a reply she reads through starts (`screenRoom`): the box rests there, not at its end. */
  readFrom?: number;
  /** The box as laid out (`RoomPart`, issue #484), and what its content truly needs (padding included). */
  box: RoomPart;
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
  readFrom,
  box: measured,
  onNeed,
  onParts,
  children,
}: Props) {
  const scroll = useRef<ScrollView>(null);
  const [box, setBox] = useState(0);
  /**
   * Where the conversation stands: how far it is scrolled, and how tall it is. Where it follows
   * its end, that end is where it stands (`threadRest`): the throttled scroll events dropped the last
   * one of a scroll to the end, and an old offset faded a whole turn as if she had scrolled up.
   */
  const [at, setAt] = useState({ offset: 0, content: 0 });
  /** The scroll view's own height as laid out, and its content's. */
  const view = useRef(0);
  const content = useRef(0);
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
  const { cut, fadeFull, more } = threadEdge({ box, ...at, tops, follows: followEnd, readFrom });
  const tail = more ? EDGE_FADE : 0;
  /** Scrolls to where it rests (`threadRest`) and stands there. */
  function rest(animated: boolean) {
    const offset = threadRest(content.current, view.current, true, readFrom);
    if (readFrom === undefined) scroll.current?.scrollToEnd({ animated });
    // A reply read from its top is jumped to: a smooth scroll there, while the box still grew
    // and the picture in the reply sized itself, ended 2–19 pt past its top, and the first line
    // of the explanation stood in the fade (#387).
    else scroll.current?.scrollTo({ y: offset, animated: false });
    setAt({ offset, content: content.current });
  }
  // The reply's top is measured after it arrived: the box moves to it once it is known.
  const restRef = useRef(rest);
  restRef.current = rest;
  useEffect(() => {
    if (followEnd && readFrom !== undefined) restRef.current(true);
  }, [followEnd, readFrom]);
  return (
    // minHeight 0: on the web a flex child's min-height is its content, and the conversation then
    // SQUEEZES the question below its own content instead of scrolling itself (issue #96). The
    // conversation is the one that scrolls.
    <View
      ref={measured.ref}
      style={{ flexShrink: 1, minHeight: floor, maxHeight: cap }}
      onLayout={(e) => {
        const h = Math.round(e.nativeEvent.layout.height);
        setBox(h);
        measured.onHeight(h);
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
          fadeFull
            ? topEdgeMaskFrom(0, EDGE_FADE, tail)
            : holds || cut
              ? topEdgeMaskFrom(0, SPACE.sm, tail)
              : null,
        ]}
        scrollEventThrottle={64}
        onScroll={(e) => {
          const { contentOffset, contentSize } = e.nativeEvent;
          content.current = Math.round(contentSize.height);
          setAt({ offset: Math.round(contentOffset.y), content: content.current });
        }}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: SPACE.lg, paddingVertical: THREAD_PAD }}
        onContentSizeChange={(_, h) => {
          content.current = Math.round(h);
          if (followEnd) rest(true);
          else setAt((a) => ({ ...a, content: content.current }));
        }}
        onLayout={(e) => {
          view.current = Math.round(e.nativeEvent.layout.height);
          // The keyboard shrinks this view; keep the latest reply visible above it.
          if (followEnd) rest(false);
        }}
      >
        {/* One measured column: what the conversation truly holds, so the question knows what
            is spare. */}
        <View onLayout={(e) => onNeed(Math.round(e.nativeEvent.layout.height) + 2 * THREAD_PAD)}>
          {slots.map(({ key, part }, i) => (
            <View key={key} style={{ marginTop: pieces[i]?.step ?? 0 }} onLayout={onHeight(key)}>
              {part}
            </View>
          ))}
        </View>
      </ScrollView>
      {fadeFull ? <TopEdgeFade /> : null}
      {more ? <TopEdgeFade bottom /> : null}
    </View>
  );
}
