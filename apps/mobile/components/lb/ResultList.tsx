// "So lief's": what came of something she did, one card per part — what went right on mint with
// a ✓, the rest on white with an arrow, and under it, in bold, what to take from it. The
// Probetest's review (practice/SessionSummary.tsx) and the feedback after a roleplay
// (buddy/RoleplayResult.tsx) are this one list (issue #384): the same thing looks the same, so
// there is no second result card. No count, no score (CLAUDE.md rule 6): only what each part was.
//
// The parts arrive one after the other, the first few staggered (reduce motion: all at once).

import { Text, View } from 'react-native';

import { SPACE } from '../../lib/theme/space.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { InlineText } from './InlineText.js';
import { Card } from './Card.js';
import { Icon } from './Icon.js';
import { Rise } from './Motion.js';

export type ResultRow = {
  key: string;
  /** It went right: the mint card with a ✓. */
  right: boolean;
  /** The small line on top: "1 · Richtig", "Geschafft". */
  label: string;
  /** What it was about: the question, the task on her role card. */
  text: string;
  /** What to take from it, in bold: the solution, her own words, a better line. */
  detail: string | null;
  /** Why, under it in plain type: the Probetest's worked solution (issue #388 §3.2). */
  note?: string | null;
};

type Props = {
  title: string;
  rows: readonly ResultRow[];
  /** When the list arrives (ms), after what stands above it. */
  delay?: number;
  /** False where it was already there (an older message in the chat): it stands still. */
  animate?: boolean;
};

/** Only the first few are staggered; the rest are below the fold anyway. */
const STAGGERED = 5;

export function ResultList({ title, rows, delay = 0, animate = true }: Props) {
  return (
    <View style={{ gap: SPACE.md }}>
      <Rise delay={delay} animate={animate}>
        <Text accessibilityRole="header" style={TYPE.title}>
          {title}
        </Text>
      </Rise>
      {rows.map((row, n) => (
        <Rise key={row.key} index={Math.min(n, STAGGERED)} delay={delay + 60} animate={animate}>
          <ResultCard row={row} />
        </Rise>
      ))}
    </View>
  );
}

function ResultCard({ row }: { row: ResultRow }) {
  const { palette } = useTheme();
  const tint = row.right ? palette.successText : palette.ink2;
  return (
    <Card
      padding={SPACE.lg}
      style={[
        { gap: 6 }, // token-exempt: the label sits closer to its text than SPACE.sm, as the Probetest card had
        row.right ? { backgroundColor: palette.mint } : null,
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Icon name={row.right ? 'check' : 'arrow'} size={18} color={tint} />
        </View>
        <Text style={[TYPE.label, { color: tint }]}>{row.label}</Text>
      </View>
      <InlineText text={row.text} style={TYPE.body} />
      {row.detail !== null ? (
        <InlineText text={row.detail} style={[TYPE.body, { fontWeight: '600' }]} />
      ) : null}
      {row.note ? (
        <InlineText text={row.note} style={[TYPE.body, { color: palette.ink2 }]} />
      ) : null}
    </Card>
  );
}
