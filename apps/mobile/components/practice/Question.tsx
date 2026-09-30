// Where the learner is in the session ("Frage 2 von 8" and a rounded violet
// bar on a pale lavender track – no timer, no pressure) and the question itself in large, readable text, with
// its math set properly and its figure drawn underneath. A blank ("Ich helfe
// ___ Mutter.") shows as a gap, read out as "Lücke"; while she types a short
// answer it stands in the gap, so she sees the whole sentence.

import type { Figure, ItemImage } from '@learnbuddy/shared-types/contracts';
import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { fillableAnswer } from '../../lib/math/prompt.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { DURATION, EASE } from '../../lib/theme/motion.js';
import { TYPE } from '../../lib/theme/type.js';
import { BuddyOrb } from '../lb/BuddyOrb.js';
import { Card } from '../lb/Card.js';
import { ZoomableFigure } from '../math/ZoomableFigure.js';
import { MathText } from '../math/MathText.js';
import { StimulusImage } from './StimulusImage.js';

type ProgressProps = {
  /** 1-based position of the question on screen. */
  position: number;
  total: number;
  /** Questions already closed (answered right, or solution shown). */
  closed: number;
  /** A quiet action at the end of the row ("Frage passt nicht"). */
  right?: ReactNode;
};

export function ProgressRow({ position, total, closed, right }: ProgressProps) {
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
        {t('progress', { current: position, total })}
      </Text>
      {/* The text above already says where we are; the bar is decoration. */}
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{
          flex: 1,
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
};

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
}: QuestionProps) {
  const { palette } = useTheme();
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
  // from the window (issue #96): the card's padding (18 pt twice), the 12 pt gap under
  // the prompt and the drawing's own frame (FigureView: 12 pt padding twice, 1 pt border
  // twice) all come off first, so the card never outgrows what the screen granted it.
  // Never below the old fixed cap.
  const figureRoom = grown && headHeight > 0 ? minHeight - 36 - headHeight - 12 - 26 : 0;
  const figureMax = figureRoom > (figureMaxHeight ?? 0) ? figureRoom : figureMaxHeight;
  return (
    <Card tone="lavender" padding={18} radius={24} style={grown ? { minHeight } : null}>
      <View style={grown ? { flexGrow: 1 } : null}>
        <View onLayout={(e) => setHeadHeight(Math.round(e.nativeEvent.layout.height))}>
          {fromBuddy || topic ? (
            // Where it comes from and what it is about share one line.
            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                alignItems: 'center',
                columnGap: 10,
                rowGap: 4,
                marginBottom: 8,
              }}
            >
              {fromBuddy ? <FromBuddyTag label={t('origin_buddy')} /> : null}
              {topic ? (
                <Text
                  style={[TYPE.small, { color: palette.ink2, fontWeight: '600', flexShrink: 1 }]}
                >
                  {topic}
                </Text>
              ) : null}
            </View>
          ) : null}
          <MathText
            text={prompt}
            blanks={{ filled }}
            accessibilityRole="header"
            style={[TYPE.title, { fontSize: 21, lineHeight: 29, fontWeight: '500' }]}
          />
        </View>
        {figure ? (
          <View
            style={
              grown ? { marginTop: 12, flexGrow: 1, justifyContent: 'center' } : { marginTop: 12 }
            }
          >
            {/* The tight box around the drawing itself: the walkthrough records its height. */}
            <View testID="question-figure">
              <ZoomableFigure figure={figure} maxHeight={figureMax} />
            </View>
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
