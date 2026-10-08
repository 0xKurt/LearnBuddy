// Where the learner is in the session ("Frage 2 von 8" and a rounded violet
// bar on a pale lavender track – no timer, no pressure) and the question itself in large, readable text, with
// its math set properly and its figure drawn underneath. A blank ("Ich helfe
// ___ Mutter.") shows as a gap, read out as "Lücke"; while she types a short
// answer it stands in the gap, so she sees the whole sentence.

import type { Figure, ItemImage, ItemView, TaskPartView } from '@learnbuddy/shared-types/contracts';
import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { FIGURE_CHROME } from '../../lib/math/figureScale.js';
import { fillableAnswer } from '../../lib/math/prompt.js';
import { formDensity } from '../../lib/keyboard.js';
import { useVisibleHeight } from '../../lib/useVisibleHeight.js';
import { SPACE } from '../../lib/theme/space.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { DURATION, EASE } from '../../lib/theme/motion.js';
import { TYPE } from '../../lib/theme/type.js';
import { BuddyOrb } from '../lb/BuddyOrb.js';
import { Card } from '../lb/Card.js';
import { ReadAgain } from '../lb/ReadAgain.js';
import { MathText } from '../math/MathText.js';
import { PartStem } from './PartStem.js';
import { PassagePanel } from './PassagePanel.js';
import { QuestionFigure } from './QuestionFigure.js';
import { StimulusImage } from './StimulusImage.js';

type ProgressProps = {
  /** 1-based position of the question on screen. */
  position: number;
  total: number;
  /** Questions already closed (answered right, or solution shown). */
  closed: number;
  /** A quiet action at the end of the row ("Frage passt nicht"). */
  right?: ReactNode;
  /**
   * The time left in a test she sits with time (issue #241): its own fixed place right after the
   * bar (issue #334.2). The bar keeps its least width beside it, so the clock never pushes it out.
   */
  clock?: ReactNode;
  /**
   * What the row says instead of "Frage x von y". A flashcard pass counts cards, not
   * questions (issue #147) — same row, same bar, same place on the screen.
   */
  label?: string;
  /**
   * More questions for this run are still being written (issue #220). Then `total` is not the
   * number it will be, so neither the count nor the bar is shown: "Frage 1 von 3" that turns into
   * "Frage 1 von 9" is exactly the display that costs trust. The row says where she is and that
   * more is coming, and the number arrives when it is true.
   */
  preparing?: boolean;
};

/** The narrowest the progress bar gets: whatever stands beside it, it keeps this. */
const MIN_BAR = 40;

export function ProgressRow({
  position,
  total,
  closed,
  right,
  clock,
  label,
  preparing,
}: ProgressProps) {
  const { palette } = useTheme();
  const { t } = useTranslation('practice');
  const share = total > 0 ? Math.max(0, Math.min(1, closed / total)) : 0;
  // The bar grows softly to where she is now (at once with reduce motion).
  const reduced = useReducedMotion();
  const width = useSharedValue(share);
  useEffect(() => {
    width.value = reduced
      ? share
      : withTiming(share, { duration: DURATION.gentle * 2, easing: EASE.standard });
  }, [share, reduced, width]);
  const fill = useAnimatedStyle(() => ({ width: `${width.value * 100}%` }));
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <Text style={[TYPE.label, { color: palette.ink2, fontSize: 14 }]}>
        {label ??
          (preparing
            ? t('progress_more_coming', { current: position })
            : t('progress', { current: position, total }))}
      </Text>
      {/* The text above already says where we are; the bar is decoration. While the set is still
          growing there is nothing honest to fill it to, so only its place is kept. */}
      {preparing ? (
        <View style={{ flex: 1 }} />
      ) : (
        <View
          testID="progress-bar"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{
            flex: 1,
            minWidth: MIN_BAR,
            height: 8,
            borderRadius: 4,
            backgroundColor: palette.lavender,
            overflow: 'hidden',
          }}
        >
          <Animated.View
            style={[{ height: '100%', borderRadius: 4, backgroundColor: palette.primary }, fill]}
          />
        </View>
      )}
      {clock ? <View style={{ flexShrink: 0 }}>{clock}</View> : null}
      {right}
    </View>
  );
}

type QuestionProps = {
  /** May contain inline math between dollar signs ($\frac{3}{4}$). */
  prompt: string;
  topic: string | null;
  /** A drawing that goes with the question (fraction picture, graph, table …). */
  figure?: Figure | null;
  /** A real crop from the photographed sheet that goes with the question (issue #50). */
  image?: ItemImage | null;
  /** Stable cache key for the crop (the question's id); required with `image`. */
  imageKey?: string;
  /** Buddy wrote this question (origin 'buddy'), it is not from the learner's own material. */
  fromBuddy?: boolean;
  /**
   * The short answer she is typing: shown inside the blank when the question
   * has exactly one (lib/math/prompt.ts fillableAnswer). Leave it out for
   * choices, long answers and once the question is closed.
   */
  answer?: string;
  /** The least the drawing may have, even in a full conversation (the old fixed cap). */
  figureMaxHeight?: number;
  /** The tallest the crop may be (≤ 180 pt; the 360×740 fit rule). */
  imageMaxHeight?: number;
  /**
   * The card grows to this height when the screen has room the conversation does not
   * need (issue #96) — but only when there is a drawing or a photo to use it (#143).
   * The figure then takes the measured rest of the card. Smaller than the natural
   * height, or without a visual, it does nothing.
   */
  minHeight?: number;
  /**
   * A smaller prompt (18 pt instead of 21): for a question whose answer surface needs the
   * height more than the words do — the staff she writes on (issue #275), where a six-line
   * prompt left no room for the staff, its keys AND Buddy's reply on 360×740.
   */
  dense?: boolean;
  /**
   * What stands above the question and is answered FROM: the text this question is about
   * (Leseverständnis, issue #233) — with its line numbers, scrolling in itself so the question under
   * it never moves — or the situation of a task in parts (issue #297), with the part's letter before
   * the question and the task's letters where the topic stands. At most one of the two (migration
   * 0100).
   */
  stimulus?: Pick<ItemView, 'passage' | 'task_part'>;
  /**
   * The answer is a board under the card (an order to put, issue #228): it needs the height, so
   * the reading text keeps the smaller box it has while she types.
   */
  answerBoard?: boolean;
  /** While Vorlesen is on, a tap on the question reads it again (#434); absent when it must not be heard. */
  onReadAgain?: () => void;
};

/**
 * How tall a reading text may stand before it scrolls in itself: a good quarter of what she sees —
 * eight lines on 360×740, with the question, the answer and "Prüfen" still on screen (rule 16).
 */
const PASSAGE_SHARE = 0.26;
/**
 * The same above an answer board, and in a short window — while she types, the keyboard takes up to half of what she sees
 * (on Android the window itself shrinks, adjustResize), and the field must stay above it: two
 * or three lines of the text, which scrolls on, and folds away with one tap.
 */
const PASSAGE_SHARE_SHORT = 0.15;
/** The card's padding, and the gap between the prompt and the drawing. */
const CARD_PAD = 18;
const FIGURE_GAP = SPACE.md;

export function QuestionCard({
  prompt,
  topic,
  figure = null,
  image = null,
  imageKey,
  fromBuddy = false,
  answer,
  figureMaxHeight,
  imageMaxHeight = 180,
  minHeight,
  dense = false,
  stimulus,
  answerBoard = false,
  onReadAgain,
}: QuestionProps) {
  const passage = stimulus?.passage ?? null;
  const part = stimulus?.task_part ?? null;
  const { palette } = useTheme();
  // What she can see, keyboard or not: while she types (`tight`), the text gives way to the field.
  const seen = useVisibleHeight();
  const viewHeight = seen.visible;
  const typing = formDensity(seen.window, seen.overlap) === 'tight';
  // While she types the card's padding steps down to the field's: on 360×440 a three-line prompt,
  // its folded drawing and the bar with its math keys ran 7 pt past the window and the keys stood
  // cut (issue #419, `cutControls`).
  const pad = typing ? SPACE.md : CARD_PAD;
  const passageShare = answerBoard || typing ? PASSAGE_SHARE_SHORT : PASSAGE_SHARE;
  // A reading question's topic is its text: the text's heading already names it.
  // A part of a task names its place in the task where the topic stands: the same for all parts.
  const shownTopic = passage || part ? null : topic;
  const meta = fromBuddy || Boolean(shownTopic) || part !== null;
  const { t } = useTranslation('practice');
  // What the header row and the prompt keep for themselves; the rest is the figure's.
  const [headHeight, setHeadHeight] = useState(0);
  const filled = fillableAnswer(prompt, answer);
  const hasVisual = figure !== null || (image !== null && imageKey !== undefined);
  // Only a card that USES the room takes it (issue #143). #96 gave the card whatever the
  // conversation did not need, so a drawing could size itself from the measured space —
  // right for a figure, wrong for one line of text: "da steht nur eine kleine frage und
  // das feld ist riesig. das wirkt richtig komisch" (owner, 30.09., after the first test
  // with his daughter). A plain question keeps its own height; the room stays with the
  // conversation that appears right under it a moment later.
  const grown = hasVisual && minHeight !== undefined && minHeight > 0;
  // The room the drawing really has inside the grown card, measured instead of guessed
  // from the window (issue #96): the card's padding, the gap under the prompt and the
  // drawing's own frame (FigureView's padding and border) all come off first, so the card
  // never outgrows what the screen granted it. Never below the old fixed cap.
  const figureRoom =
    grown && headHeight > 0 ? minHeight - 2 * pad - headHeight - FIGURE_GAP - FIGURE_CHROME : 0;
  const figureMax = figureRoom > (figureMaxHeight ?? 0) ? figureRoom : figureMaxHeight;
  return (
    <Card tone="lavender" padding={pad} radius={24} style={grown ? { minHeight } : null}>
      <View style={grown ? { flexGrow: 1 } : null}>
        {passage ? (
          <PassagePanel passage={passage} maxHeight={Math.round(viewHeight * passageShare)} />
        ) : null}
        <View onLayout={(e) => setHeadHeight(Math.round(e.nativeEvent.layout.height))}>
          {meta ? (
            // Where it comes from and what it is about share one line.
            <View
              testID="question-meta"
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: SPACE.sm,
                marginBottom: SPACE.sm,
              }}
            >
              {fromBuddy ? <FromBuddyTag label={t('origin_buddy')} /> : null}
              {/* One line, never a second (it would cost the card a line, issue #310): a long
                  topic ends in "…" — the header's title names the run, a screen reader the rest. */}
              {part ? (
                <PartSteps
                  part={part}
                  label={t('parts.step', { part: part.part, all: part.letters.join(', ') })}
                />
              ) : shownTopic ? (
                <Text
                  numberOfLines={1}
                  style={[
                    TYPE.small,
                    { color: palette.ink2, fontWeight: '600', flex: 1, minWidth: 0 },
                  ]}
                >
                  {shownTopic}
                </Text>
              ) : null}
            </View>
          ) : null}
          {/* The situation of a task in parts, the same above each of its parts (issue #297). */}
          {part ? <PartStem stem={part.stem} typing={typing} /> : null}
          <ReadAgain {...(onReadAgain ? { onRead: onReadAgain } : {})}>
            <MathText
              text={part ? `${part.part}) ${prompt}` : prompt}
              blanks={{ filled }}
              // A fraction in the question sits in its sentence (issue #288).
              inlineFractions
              accessibilityRole="header"
              style={
                dense
                  ? [TYPE.title, { fontSize: 18, lineHeight: 25, fontWeight: '500' }]
                  : TYPE.question
              }
            />
          </ReadAgain>
        </View>
        {figure ? (
          <View
            style={
              grown
                ? { marginTop: FIGURE_GAP, flexGrow: 1, justifyContent: 'center' }
                : { marginTop: FIGURE_GAP }
            }
          >
            {/* While she types the drawing folds to one line (issue #379). */}
            <QuestionFigure figure={figure} maxHeight={figureMax} folded={typing} />
          </View>
        ) : null}
        {image && imageKey ? (
          <View style={grown ? { flexGrow: 1, justifyContent: 'center' } : null}>
            <StimulusImage image={image} cacheKey={imageKey} maxHeight={imageMaxHeight} />
          </View>
        ) : null}
      </View>
    </Card>
  );
}

/**
 * The letters of a task in parts, the current one in the accent: where she is, never how many are
 * left to do (rule 6). One line, like the topic it stands in for.
 */
function PartSteps({ part, label }: { part: TaskPartView; label: string }) {
  const { palette } = useTheme();
  return (
    <Text
      testID="task-part-steps"
      accessibilityLabel={label}
      numberOfLines={1}
      style={[TYPE.small, { flex: 1, minWidth: 0, color: palette.ink3, fontWeight: '600' }]}
    >
      {part.letters.map((letter, i) => (
        <Text key={letter} style={letter === part.part ? { color: palette.primaryDk } : null}>
          {i > 0 ? ' · ' : ''}
          {letter})
        </Text>
      ))}
    </Text>
  );
}

/** "Frage von Buddy": a small white pill with Buddy's orb, so it reads as his at a glance. */
function FromBuddyTag({ label }: { label: string }) {
  const { palette } = useTheme();
  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={label}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        gap: 6,
        backgroundColor: palette.paper,
        borderRadius: 999,
        paddingLeft: 4,
        paddingRight: 12,
        paddingVertical: 4,
      }}
    >
      <BuddyOrb size={18} />
      <Text style={{ color: palette.ink, fontSize: 13, lineHeight: 17, fontWeight: '600' }}>
        {label}
      </Text>
    </View>
  );
}
