// Where the learner is in the session ("Frage 2 von 8" and a rounded violet
// bar on a pale lavender track – no timer, no pressure) and the question itself in large, readable text, with
// its math set properly and its figure drawn underneath. A blank ("Ich helfe
// ___ Mutter.") shows as a gap, read out as "Lücke"; while she types a short
// answer it stands in the gap, so she sees the whole sentence.

import type { Figure } from '@learnbuddy/shared-types/contracts';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { fillableAnswer } from '../../lib/math/prompt.js';
import { LB } from '../../lib/theme/colors.js';
import { TYPE } from '../../lib/theme/type.js';
import { BuddyOrb } from '../lb/BuddyOrb.js';
import { Card } from '../lb/Card.js';
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
  const share = total > 0 ? Math.max(0, Math.min(1, closed / total)) : 0;
  return (
    <View style={{ gap: 8 }}>
      <Text style={[TYPE.label, { color: LB.ink2, fontSize: 14 }]}>
        {t('progress', { current: position, total })}
      </Text>
      {/* The text above already says where we are; the bar is decoration. */}
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ height: 8, borderRadius: 4, backgroundColor: LB.lavender, overflow: 'hidden' }}
      >
        <View
          style={{
            width: `${share * 100}%`,
            height: '100%',
            borderRadius: 4,
            backgroundColor: LB.primary,
          }}
        />
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
    <Card tone="lavender" padding={22} radius={24}>
      {fromBuddy ? <FromBuddyTag label={t('origin_buddy')} /> : null}
      {topic ? (
        <Text style={[TYPE.small, { color: LB.ink2, fontWeight: '600', marginBottom: 8 }]}>
          {topic}
        </Text>
      ) : null}
      <MathText
        text={prompt}
        blanks={{ filled }}
        accessibilityRole="header"
        style={[TYPE.title, { fontSize: 21, lineHeight: 29, fontWeight: '500' }]}
      />
      {figure ? (
        <View style={{ marginTop: 16 }}>
          <FigureView figure={figure} />
        </View>
      ) : null}
    </Card>
  );
}

/** "Frage von Buddy": a small white pill with Buddy's orb, so it reads as his at a glance. */
function FromBuddyTag({ label }: { label: string }) {
  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={label}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        gap: 6,
        backgroundColor: LB.paper,
        borderRadius: 999,
        paddingLeft: 4,
        paddingRight: 12,
        paddingVertical: 4,
        marginBottom: 12,
      }}
    >
      <BuddyOrb size={18} />
      <Text style={{ color: LB.ink, fontSize: 13, lineHeight: 17, fontWeight: '600' }}>
        {label}
      </Text>
    </View>
  );
}
