// One existing practice flow: ordinary question, answer and feedback share a scrolling
// body with shortcut Chips directly above the pinned Composer. Structured forms retain their measured
// board, spacer and folding behavior. Forms keep all real drafts and answer payloads.
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { ScrollView, View } from 'react-native';
import { useThreadFollow } from '../../lib/buddy/useThreadFollow.js';
import { PictureRoom } from '../../lib/practice/screenRoom.js';
import { useStackTops } from '../../lib/practice/useStackTops.js';
import { PRACTICE } from '../../lib/theme/practice.js';

import { answerFolds, formDensity } from '../../lib/keyboard.js';
import { SPACE } from '../../lib/theme/space.js';
import { useVisibleHeight } from '../../lib/useVisibleHeight.js';
import { AskRoute, CheckBar, type CheckAction } from './CheckBar.js';
import { FreeSpace } from './FreeSpace.js';

type Props = {
  /** The form: what she taps, places or types in (none: a closed question, a spoken one). */
  answer?: ReactNode;
  /**
   * What of the answer stays while she types in the bar under it and the answer folds (null:
   * nothing, it folds whole) — the Fehlerdetektiv's line she corrects (#387).
   */
  whileTyping?: ReactNode;
  /** Keys for what she is typing, while she types (null: none). */
  keys?: ReactNode;
  /** "Prüfen": when the answer may go and how. */
  action: CheckAction;
  /**
   * What the answer slot keeps when the room runs out. 0: it may give all of it (a board scrolls
   * inside itself). A number: at least that (the note line: its tightest staff with both key
   * rows, `STAFF_ANSWER_MIN`). 'whole': nothing — options she taps and the fraction bar she
   * shades never shrink; the conversation above gives way instead (`threadRoom`).
   */
  keeps?: number | 'whole';
  /** A cell in the board is being edited; it stays mounted while optional help folds. */
  boardEditing?: boolean;
};

/** Pure layout slots supplied by the existing practice screen adapters. */
type FlowSlots = {
  thread: ReactNode;
  tools: ReactNode;
  question?: ReactNode;
  newestReply?: string | null;
  sentKey?: string | null;
  readKey?: string | null;
  readFrom?: number;
};
export const AnswerFlow = createContext<FlowSlots>({
  thread: null,
  tools: null,
});

export function AnswerShell({
  answer = null,
  whileTyping = null,
  keys = null,
  action,
  keeps = 0,
  boardEditing = false,
}: Props) {
  const seen = useVisibleHeight();
  const compact = formDensity(seen.window, seen.overlap) !== 'roomy';
  const ask = useContext(AskRoute);
  const flow = useContext(AnswerFlow);
  const typedUnderBoard = answer !== null && 'field' in action && action.field !== undefined;
  const typing = typedUnderBoard && action.typing === true;
  // Typed fields may have no answer board. While she edits in the tight keyboard room,
  // the optional hint row folds; the full source, keys and Check retain their minimum sizes.
  const toolsFolded =
    (boardEditing || ('field' in action && action.field !== undefined && action.typing === true)) &&
    formDensity(seen.window, seen.overlap) === 'tight';
  const { onFocused } = ask;
  useEffect(() => {
    if (!typedUnderBoard) return;
    onFocused(typing);
    return () => onFocused(false);
  }, [typedUnderBoard, typing, onFocused]);
  const folded =
    answerFolds(ask.focused, seen.window, seen.overlap) ||
    (typing && formDensity(seen.window, seen.overlap) !== 'roomy');
  // She types under the board (her own focus, reported as the route's): what of it stays.
  const kept = folded && typing ? whileTyping : null;
  if (flow.question !== undefined && flow.question !== null) {
    return <OrdinaryBody flow={flow} answer={answer} action={action} keys={keys} />;
  }
  return (
    <>
      {answer === null ? null : (
        <View
          testID="answer-slot"
          style={{
            // It gives way when the room runs out (the conversation's reply, the keyboard); the
            // form inside scrolls then, "Prüfen" stays.
            display: folded && kept === null ? 'none' : 'flex',
            flexGrow: 0,
            flexShrink: keeps === 'whole' ? 0 : 1,
            minHeight: keeps === 'whole' ? undefined : keeps,
            paddingHorizontal: SPACE.lg,
            paddingTop: compact ? SPACE.xs : SPACE.md,
          }}
        >
          {kept ?? answer}
        </View>
      )}
      {flow.thread}
      <FreeSpace />
      {flow.tools ? (
        <View
          testID="answer-help"
          style={{
            display: toolsFolded ? 'none' : 'flex',
            paddingHorizontal: SPACE.lg,
            paddingTop: compact ? SPACE.xs : SPACE.sm,
          }}
        >
          {flow.tools}
        </View>
      ) : null}
      <CheckBar {...action} keys={folded ? null : keys} />
    </>
  );
}

/** One scrolling conversation, with all submission and draft ownership left in the adapters. */
function OrdinaryBody({
  flow,
  answer,
  action,
  keys,
}: {
  flow: FlowSlots;
  answer: ReactNode;
  action: CheckAction;
  keys?: ReactNode;
}) {
  const follow = useThreadFollow(flow.newestReply ?? null, { initiallyFollowing: false });
  const [contentHeight, setContentHeight] = useState(0);
  const [box, setBox] = useState(0);
  const { pieces, onHeight } = useStackTops(
    PRACTICE.ordinaryBody.gap,
    ['question', 'answer', 'thread'],
    undefined,
  );
  const currentFollow = useRef(follow);
  currentFollow.current = follow;
  useEffect(() => {
    if (flow.sentKey == null) return;
    currentFollow.current.followNext();
    currentFollow.current.follow();
  }, [flow.sentKey]);
  useLayoutEffect(() => {
    if (flow.readKey != null) currentFollow.current.readFrom(flow.readKey);
  }, [flow.readKey]);
  const target =
    flow.readFrom === undefined
      ? undefined
      : PRACTICE.ordinaryBody.paddingTop +
        (pieces[2]?.top ?? 0) +
        PRACTICE.ordinaryBody.feedbackTop +
        flow.readFrom;
  useEffect(() => {
    if (flow.readKey != null && target !== undefined && contentHeight > 0)
      currentFollow.current.readFrom(flow.readKey, target);
  }, [flow.readKey, target, contentHeight]);
  // The room the question and her answer leave in the body (#599): the conversation under them is
  // the part that scrolls, never they — a labelled picture under the question sizes itself to it.
  const thread = pieces[2];
  const spare =
    box > 0 && contentHeight > 0 && thread
      ? box -
        (PRACTICE.ordinaryBody.paddingTop +
          thread.top -
          thread.step +
          PRACTICE.ordinaryBody.paddingBottom)
      : null;
  return (
    <PictureRoom.Provider value={spare}>
      <ScrollView
        ref={follow.scroll}
        testID="scroll-practice-body"
        tabIndex={0}
        keyboardShouldPersistTaps="handled"
        style={{ flex: 1, minHeight: 0 }}
        contentContainerStyle={{
          paddingHorizontal: SPACE.lg,
          paddingTop: PRACTICE.ordinaryBody.paddingTop,
          paddingBottom: PRACTICE.ordinaryBody.paddingBottom,
        }}
        {...follow.inputProps}
        onScroll={follow.onScroll}
        onLayout={(e) => {
          setBox(Math.round(e.nativeEvent.layout.height));
          follow.onLayout(e);
        }}
        onContentSizeChange={(width, height) => {
          setContentHeight(height);
          follow.onContentSizeChange(width, height);
        }}
      >
        <View onLayout={onHeight('question')}>{flow.question}</View>
        <View onLayout={onHeight('answer')} style={{ marginTop: pieces[1]?.step ?? 0 }}>
          {answer === null ? null : <View testID="answer-slot">{answer}</View>}
        </View>
        <View onLayout={onHeight('thread')} style={{ marginTop: pieces[2]?.step ?? 0 }}>
          {flow.thread}
        </View>
      </ScrollView>
      <CheckBar {...action} keys={keys} chips={flow.tools} />
    </PictureRoom.Provider>
  );
}
