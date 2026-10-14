// Where the learner is in the session ("Frage 2 von 8" and a rounded violet
// bar on a pale lavender track – no timer, no pressure) and the question itself in large, readable text, with
// its math set properly and its figure drawn underneath. A blank ("Ich helfe
// ___ Mutter.") shows as a gap, read out as "Lücke"; while she types a short
// answer it stands in the gap, so she sees the whole sentence.

import type { Figure, ItemImage, ItemView, TaskPartView } from '@learnbuddy/shared-types/contracts';
import { useContext, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { FIGURE_CHROME } from '../../lib/math/figureScale.js';
import { useDrawingNatural } from '../../lib/math/figureSizing.js';
import { fillableAnswer } from '../../lib/math/prompt.js';
import { formDensity } from '../../lib/keyboard.js';
import { useVisibleHeight } from '../../lib/useVisibleHeight.js';
import { QUESTION } from '../../lib/theme/question.js';
import { PROGRESS_BAR_MIN, SPACE } from '../../lib/theme/space.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { QuestionCard as PresentationCard, RunMeta, RunMetaLine } from '../lb/QuestionCard.js';
import { usePictureCap } from '../../lib/practice/screenRoom.js';
import { boardCap, standsAlone } from '../../lib/practice/visuals.js';
import { PRACTICE } from '../../lib/theme/practice.js';
import { Progress } from '../lb/Progress.js';
import { ReadAgain } from '../lb/ReadAgain.js';
import { MathText } from '../math/MathText.js';
import { lettered, PartStem } from './PartStem.js';
import { PassagePanel } from './PassagePanel.js';
import { QuestionFigure } from './QuestionFigure.js';
import { StimulusImage } from './StimulusImage.js';

type ProgressProps = {
  /** A shared header already speaks the count in its subtitle. */
  hideLabel?: boolean;
  /** 1-based position of the question on screen. */
  position: number;
  total: number;
  /** Questions already closed (answered right, or solution shown). */
  closed: number;
  /** The displayed question is still open; false until Next after checking it. */
  active?: boolean;
  /** A quiet action at the end of the row: one short word ("Passt nicht", `QuestionCorner`). */
  right?: ReactNode;
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

export function ProgressRow({
  position,
  total,
  closed,
  right,
  label,
  preparing,
  hideLabel = false,
  active = true,
}: ProgressProps) {
  const { palette } = useTheme();
  const { t } = useTranslation('practice');
  return (
    <View
      testID="progress-row"
      style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.md }}
    >
      {/* One line, always (issue #459), like the screen's title (#287): beside the full sentence
          "Bewertung stimmt nicht" the label broke onto two lines at 360 and the bar shrank to a
          stub. The action at the end is one short word now and the bar keeps its least width;
          what still does not fit — "ich schreibe noch mehr" beside an action — ends in "…". */}
      {hideLabel ? null : (
        <Text
          testID="progress-label"
          numberOfLines={1}
          style={[TYPE.label, { color: palette.ink2, flexShrink: 1, minWidth: 0 }]}
        >
          {label ??
            (preparing
              ? t('progress_more_coming', { current: position })
              : t('progress', { current: position, total }))}
        </Text>
      )}
      {/* The text above already says where we are; the bar is decoration. While the set is still
          growing there is nothing honest to fill it to, so only its place is kept. */}
      {preparing ? (
        <View style={{ flex: 1 }} />
      ) : (
        <View
          testID="progress-bar"
          aria-hidden
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{ flex: 1, minWidth: PROGRESS_BAR_MIN }}
        >
          <Progress total={total} current={closed} part={active ? undefined : 0} />
        </View>
      )}
      {right}
    </View>
  );
}

type QuestionProps = {
  extra?: ReactNode;
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
   * prompt left no room for the staff, its keys AND Buddy's reply on 360×740. Every prompt takes it
   * while she types (issue #484).
   */
  dense?: boolean;
  /** Closed typed feedback; distinct from open keyboard density. */
  compactFeedback?: boolean;
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
const PASSAGE_SHARE = PRACTICE.passageShare;
/**
 * The same above an answer board, and in a short window — while she types, the keyboard takes up to half of what she sees
 * (on Android the window itself shrinks, adjustResize), and the field must stay above it: two
 * or three lines of the text, which scrolls on, and folds away with one tap.
 */
const PASSAGE_SHARE_SHORT = PRACTICE.passageShareShort;
/** The card's padding, and the gap between the prompt and the drawing. */
const FIGURE_GAP = SPACE.md;

/** A quiet line in the page (design ui_kits/app/Flows.jsx:15, `Hint`): meta type, ink-2, 4 in. */
export function Hint({ children, testID }: { children: string; testID?: string }) {
  const { palette } = useTheme();
  return (
    <Text
      testID={testID}
      style={[TYPE.meta, { color: palette.ink2, paddingHorizontal: QUESTION.hintInset }]}
    >
      {children}
    </Text>
  );
}

export function QuestionCard({
  extra,
  prompt,
  topic,
  figure = null,
  image = null,
  imageKey,
  fromBuddy = false,
  answer,
  figureMaxHeight,
  imageMaxHeight = PRACTICE.imageHeight,
  minHeight,
  dense = false,
  compactFeedback = false,
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
  const pad = dense || typing ? QUESTION.typingPad : QUESTION.pad;
  // And the prompt steps down to the smaller size (`dense`), as the drawing folds (issue #484): on
  // 360×440 a four-line prompt from Buddy over the net of a cylinder, its folded drawing and the bar
  // with its math keys ran 38 pt past the window — the question never scrolls, so the keys and the
  // header stood cut. The words stay whole; they are the question.
  const small = dense || typing;
  const passageShare = answerBoard || typing ? PASSAGE_SHARE_SHORT : PASSAGE_SHARE;
  // A reading question's topic is its text: the text's heading already names it.
  // A part of a task names its place in the task where the topic stands: the same for all parts.
  const shownTopic = passage || part ? null : topic;
  // Where it comes from and what it is about — and, while she types, nothing she answers from: the
  // row steps aside like the drawing does (#419, #484). On 360×440 a part's situation over its
  // folded chart, the question and the bar with its keys ran 10 pt past the window and the header
  // stood cut (#387); the part's letter still stands before the question ("a) …").
  // In a test the run's rule stands there instead, always (`RunMetaLine`): it does not step aside.
  const inRun = useContext(RunMeta) !== null;
  const meta =
    !inRun && !compactFeedback && !typing && (fromBuddy || Boolean(shownTopic) || part !== null);
  const { t } = useTranslation('practice');
  // What the header row and the prompt keep for themselves; the rest is the figure's.
  const [headHeight, setHeadHeight] = useState(0);
  const filled = fillableAnswer(prompt, answer);
  // A labelled picture that is an image stands under the card, a card of its own (`standsAlone`).
  const picture = figure && standsAlone(figure) ? figure : null;
  // As tall as the room left after the card and the bar allows (#599): a skeleton under a
  // two-line question ran 13 pt past 360×740 at a fixed share of the window. Held while she types:
  // folded, it measures the room of its row.
  const pictureMax = usePictureCap(`${prompt}:${seen.window}`, boardCap(viewHeight), 1, typing);
  const inCard = picture ? null : figure;
  const hasVisual = inCard !== null || (image !== null && imageKey !== undefined);
  // Only a card that USES the room takes it (issue #143). #96 gave the card whatever the
  // conversation did not need, so a drawing could size itself from the measured space —
  // right for a figure, wrong for one line of text: "da steht nur eine kleine frage und
  // das feld ist riesig. das wirkt richtig komisch" (owner, 30.09., after the first test
  // with his daughter). A plain question keeps its own height; the room stays with the
  // conversation that appears right under it a moment later.
  const grown = !compactFeedback && hasVisual && minHeight !== undefined && minHeight > 0;
  // The room the drawing really has inside the grown card, measured instead of guessed
  // from the window (issue #96): the card's padding, the gap under the prompt and the
  // drawing's own frame (FigureView's padding and border) all come off first, so the card
  // never outgrows what the screen granted it. Never below the old fixed cap.
  // And no taller than its drawing can use (#501): a drawing is never drawn larger than its
  // natural size, so a card grown past it stood with an empty band above and below — the
  // Hunderterfeld, about 27 pt each. That height comes with the drawing's sizing report.
  const drawingNatural = useDrawingNatural();
  const fullCard =
    inCard && drawingNatural > 0 && headHeight > 0
      ? 2 * pad + headHeight + FIGURE_GAP + FIGURE_CHROME + drawingNatural
      : Infinity;
  const cardMin = grown ? Math.min(minHeight, fullCard) : 0;
  const figureRoom =
    grown && headHeight > 0 ? cardMin - 2 * pad - headHeight - FIGURE_GAP - FIGURE_CHROME : 0;
  const figureMax = figureRoom > (figureMaxHeight ?? 0) ? figureRoom : figureMaxHeight;
  const card = (
    <PresentationCard
      testID="question-card"
      extra={extra}
      compact={compactFeedback}
      snug={small}
      ownsRunMeta
      style={grown ? { minHeight: cardMin } : null}
    >
      <View style={grown ? { flexGrow: 1 } : null}>
        {passage ? (
          <PassagePanel passage={passage} maxHeight={Math.round(viewHeight * passageShare)} />
        ) : null}
        <View onLayout={(e) => setHeadHeight(Math.round(e.nativeEvent.layout.height))}>
          {inRun ? (
            <View testID="question-meta" style={{ marginBottom: SPACE.md }}>
              <RunMetaLine />
            </View>
          ) : null}
          {meta ? (
            // Where it comes from and what it is about are one quiet line (design
            // components/practice/Option.jsx:30, "Brüche · von Buddy"): never a second (it would
            // cost the card a line, issue #310) — a long topic ends in "…"; the header's title
            // names the run, a screen reader the rest.
            <View
              testID="question-meta"
              style={{ flexDirection: 'row', alignItems: 'center', marginBottom: SPACE.md }}
            >
              {part ? (
                <>
                  {fromBuddy ? (
                    <Text style={[TYPE.label, { color: palette.ink2 }]}>
                      {`${t('origin_buddy')} · `}
                    </Text>
                  ) : null}
                  <PartSteps
                    part={part}
                    label={t('parts.step', { part: part.part, all: part.letters.join(', ') })}
                  />
                </>
              ) : (
                <Text
                  numberOfLines={1}
                  style={[TYPE.label, { color: palette.ink2, flex: 1, minWidth: 0 }]}
                >
                  {fromBuddy && shownTopic
                    ? t('origin_buddy_topic', { topic: shownTopic })
                    : fromBuddy
                      ? t('origin_buddy')
                      : shownTopic}
                </Text>
              )}
            </View>
          ) : null}
          {/* The situation of a task in parts, the same above each of its parts (issue #297). */}
          {part ? (
            <PartStem
              stem={part.stem}
              typing={typing}
              maxHeight={Math.round(viewHeight * passageShare)}
            />
          ) : null}
          <ReadAgain {...(onReadAgain ? { onRead: onReadAgain } : {})}>
            <MathText
              text={lettered(prompt, part)}
              blanks={{ filled }}
              // A fraction in the question sits in its sentence (issue #288).
              inlineFractions
              accessibilityRole="header"
              style={
                compactFeedback
                  ? TYPE.questionFeedback
                  : small
                    ? TYPE.questionCompact
                    : TYPE.question
              }
            />
          </ReadAgain>
        </View>
        {inCard && !compactFeedback ? (
          <View
            style={
              grown
                ? { marginTop: FIGURE_GAP, flexGrow: 1, justifyContent: 'center' }
                : { marginTop: FIGURE_GAP }
            }
          >
            {/* While she types the drawing folds to one line (issue #379). */}
            <QuestionFigure figure={inCard} maxHeight={figureMax} folded={typing} />
          </View>
        ) : null}
        {image && imageKey && !compactFeedback ? (
          <View style={grown ? { flexGrow: 1, justifyContent: 'center' } : null}>
            <StimulusImage image={image} cacheKey={imageKey} maxHeight={imageMaxHeight} />
          </View>
        ) : null}
      </View>
    </PresentationCard>
  );
  if (!picture || compactFeedback) return card;
  return (
    <>
      {card}
      {/* As far under the question as her answer stands under both; folded while she types, like
          every drawing (#379). */}
      <View testID="question-picture" style={{ marginTop: PRACTICE.ordinaryBody.gap }}>
        <QuestionFigure figure={picture} maxHeight={pictureMax} folded={typing} />
      </View>
    </>
  );
}

/**
 * The letters of a task in parts, the current one in the accent: where she is, never how many are
 * left to do (rule 6). One line, in the meta line's type, where the topic stands otherwise.
 */
function PartSteps({ part, label }: { part: TaskPartView; label: string }) {
  const { palette } = useTheme();
  return (
    <Text
      testID="task-part-steps"
      accessibilityLabel={label}
      numberOfLines={1}
      style={[TYPE.label, { flex: 1, minWidth: 0, color: palette.ink3 }]}
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
