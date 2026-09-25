// Where the learner is in the session ("Frage 2 von 8" and a thin bar – no
// timer, no pressure) and the question itself in large, readable text, with
// its math set properly and its figure drawn underneath. A blank ("Ich helfe
// ___ Mutter.") shows as a gap, read out as "Lücke"; while she types a short
// answer it stands in the gap, so she sees the whole sentence.

import type { Figure } from '@learnbuddy/shared-types/contracts';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { fillableAnswer } from '../../lib/math/prompt.js';
import { LB } from '../../lib/theme/colors.js';
import { TYPE } from '../../lib/theme/type.js';
import { Card } from '../lb/Card.js';
import { Chip } from '../lb/Chip.js';
import { Progress } from '../lb/Progress.js';
import { FigureView } from '../math/FigureView.js';
import { MathText } from '../math/MathText.js';

type ProgressProps = {
  /** 1-based position of the question on screen. */
  position: number;
  total: number;
  /** Questions already closed (answered right, or solution shown). */
  closed: number;
};

export function ProgressRow({ position, total, closed }: ProgressProps) {
  const { t } = useTranslation('practice');
  return (
    <View style={{ gap: 8 }}>
      <Text style={[TYPE.body, { color: LB.ink2, fontWeight: '600' }]}>
        {t('progress', { current: position, total })}
      </Text>
      {/* Progress stretches along a row; the text above already says where we are. */}
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ flexDirection: 'row' }}
      >
        <Progress value={total > 0 ? closed / total : 0} />
      </View>
    </View>
  );
}

type QuestionProps = {
  /** May contain inline math between dollar signs ($\frac{3}{4}$). */
  prompt: string;
  topic: string | null;
  /** A drawing that goes with the question (fraction picture, graph, table …). */
  figure?: Figure | null;
  /** Buddy wrote this question (origin 'buddy'), it is not from the learner's own material. */
  fromBuddy?: boolean;
  /**
   * The short answer she is typing: shown inside the blank when the question
   * has exactly one (lib/math/prompt.ts fillableAnswer). Leave it out for
   * choices, long answers and once the question is closed.
   */
  answer?: string;
};

export function QuestionCard({
  prompt,
  topic,
  figure = null,
  fromBuddy = false,
  answer,
}: QuestionProps) {
  const { t } = useTranslation('practice');
  const filled = fillableAnswer(prompt, answer);
  return (
    <Card tone="lavender" padding={20} radius={22}>
      {fromBuddy ? (
        <View style={{ marginBottom: 10 }}>
          <Chip>{t('origin_buddy')}</Chip>
        </View>
      ) : null}
      {topic ? <Text style={[TYPE.body, { color: LB.ink2, marginBottom: 8 }]}>{topic}</Text> : null}
      <MathText
        text={prompt}
        blanks={{ filled }}
        accessibilityRole="header"
        style={[TYPE.title, { fontSize: 20, lineHeight: 28, fontWeight: '500' }]}
      />
      {figure ? (
        <View style={{ marginTop: 14 }}>
          <FigureView figure={figure} />
        </View>
      ) : null}
    </Card>
  );
}
