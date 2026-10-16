// Shared factual results. Grouped screen rows (design ui_kits/app/Done.jsx:28–38): the state's
// sign, the title with its notes under it, the state's word at the right end. Legacy cards
// retain their strong takeaway typography. Actual status/copy comes from callers.
// Only the first few legacy cards stagger; screen rows remain immediate.

import type { Palette } from '../../lib/theme/palettes.js';
import { useState, type ReactNode } from 'react';
import { Text, View } from 'react-native';

import { ROW_SPLIT } from '../../lib/theme/components.js';
import { DURATION } from '../../lib/theme/motion.js';
import { RESULT } from '../../lib/theme/results.js';
import { RADIUS } from '../../lib/theme/radius.js';
import { SHADOW } from '../../lib/theme/shadow.js';
import { SPACE } from '../../lib/theme/space.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { InlineText } from './InlineText.js';
import { Card } from './Card.js';
import { Icon, type IconName } from './Icon.js';
import { Rise } from './Motion.js';

/** The states a result row draws, as the server carries them; others draw by `right`. */
type ResultState = 'open' | 'correct' | 'revealed' | 'skipped' | 'missed';

export type ResultRow = {
  key: string;
  /** It went right: the mint card with a ✓. */
  right: boolean;
  /** Factual state, when the row is a question of a run (a practice's `SessionItemView`). */
  status?: ResultState;
  /** The state in a word: at the row's right end ("Richtig"), on a card's top line ("Geschafft"). */
  label: string;
  /** What it was about: the question, the task on her role card. */
  text: string;
  /** What to take from it, in bold: the solution, her own words, a better line. */
  detail: string | null;
  /** Why, under it in plain type: the Probetest's worked solution (issue #388 §3.2). */
  note?: string | null;
};

type Props = {
  variant?: 'cards' | 'rows';
  title: string;
  rows: readonly ResultRow[];
  /** When the list arrives (ms), after what stands above it. */
  delay?: number;
  /** False where it was already there (an older message in the chat): it stands still. */
  animate?: boolean;
};

/**
 * A title that ends in math ("… oder $\frac{3}{5}$?") keeps the word before it on the same line:
 * in the narrow title column a stacked fraction with its question mark wrapped alone onto a last
 * line (#599). The space becomes a no-break one, which the math layout honours
 * (lib/math/lineBreak.ts) and plain text does anyway.
 */
function tailTied(text: string): string {
  return text.replace(/ (\$[^$]+\$[^\s$]*)$/, '\u00A0$1');
}

/** Only states the server actually carries; labels are never parsed to choose presentation. */
function stateSkin(
  row: ResultRow,
  palette: Palette,
): { icon: IconName; bg: string; color: string } {
  switch (row.status) {
    case 'correct':
      return { icon: 'check', bg: palette.mint, color: palette.successText };
    case 'missed':
      return { icon: 'close', bg: palette.blush, color: palette.danger };
    case 'skipped':
      return { icon: 'arrow', bg: palette.canvas, color: palette.ink2 };
    case 'open':
      return { icon: 'clock', bg: palette.canvas, color: palette.ink2 };
    case 'revealed':
      return { icon: 'eye', bg: palette.canvas, color: palette.ink2 };
    default:
      return row.right
        ? { icon: 'check', bg: palette.mint, color: palette.successText }
        : { icon: 'arrow', bg: palette.canvas, color: palette.ink2 };
  }
}

/** The state's line, as drawn: the meta type at the title's line height (read at render, #84). */
const stateText = () => [TYPE.meta, { lineHeight: TYPE.option.lineHeight }];

/**
 * The widest single word among the states, measured in the state's own type (#599): the state
 * column never stands narrower, so "Übersprungen" ends inside the card and "Noch nicht richtig"
 * takes two lines, not three. A layout reports whole points (the web rounds a box's width): one
 * more keeps a word that measured 89.4 from breaking in a box of 89. Each word is laid out on its
 * own, out of sight and out of the reading order — and only until it is measured: then it goes,
 * so nothing reads or finds a state twice.
 */
function useWidestWord(labels: readonly string[]): { least: number; measure: ReactNode } {
  const [widths, setWidths] = useState<Readonly<Record<string, number>>>({});
  const words = [...new Set(labels.flatMap((label) => label.split(/\s+/).filter(Boolean)))];
  const least = Math.ceil(Math.max(0, ...words.map((w) => widths[w] ?? 0))) + RESULT.stateSlack;
  const unmeasured = words.filter((w) => widths[w] === undefined);
  const measure =
    unmeasured.length === 0 ? null : (
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        aria-hidden
        pointerEvents="none"
        style={{ position: 'absolute', top: 0, left: 0, height: 0, overflow: 'hidden' }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
          {unmeasured.map((word) => (
            <Text
              key={word}
              numberOfLines={1}
              style={[stateText(), { flexShrink: 0 }]}
              onLayout={(e) => {
                const w = e.nativeEvent.layout.width;
                setWidths((now) => (now[word] === w ? now : { ...now, [word]: w }));
              }}
            >
              {word}
            </Text>
          ))}
        </View>
      </View>
    );
  return { least, measure };
}

export function ResultList({ variant = 'cards', title, rows, delay = 0, animate = true }: Props) {
  if (variant === 'rows') return <ResultRows rows={rows} />;
  return <ResultCards title={title} rows={rows} delay={delay} animate={animate} />;
}

function ResultRows({ rows }: { rows: readonly ResultRow[] }) {
  const { palette } = useTheme();
  const state = useWidestWord(rows.map((row) => row.label));
  return (
    <View style={{ backgroundColor: palette.paper, borderRadius: RADIUS.lg, ...SHADOW.soft }}>
      {state.measure}
      {rows.map((row, i) => {
        const skin = stateSkin(row, palette);
        return (
          <View
            key={row.key}
            style={{
              flexDirection: 'row',
              alignItems: 'flex-start',
              gap: SPACE.md,
              minHeight: RESULT.row,
              paddingHorizontal: SPACE.lg,
              paddingVertical: RESULT.pad,
              borderTopWidth: i ? RESULT.border : 0,
              borderTopColor: palette.hairline,
            }}
          >
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={{
                width: RESULT.badge,
                height: RESULT.badge,
                borderRadius: RADIUS.round,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: skin.bg,
              }}
            >
              <Icon name={skin.icon} size={RESULT.glyph} color={skin.color} />
            </View>
            {/* The title keeps its room, the state takes the rest and wraps there — the list
                  row's own pattern (`ROW_SPLIT`): with the state unshrinkable at up to 45 % of the
                  row, "Noch nicht beantwortet" cut the title down to a word per line on 360. But
                  never narrower than the states' widest word (`useWidestWord`): there the title
                  gives way (#599). */}
            <View style={[ROW_SPLIT.title, { flexShrink: 1, minWidth: 0, gap: RESULT.textGap }]}>
              <InlineText text={tailTied(row.text)} style={TYPE.option} />
              {row.detail ? <InlineText text={row.detail} style={TYPE.meta} /> : null}
              {row.note ? (
                <InlineText text={row.note} style={[TYPE.meta, { color: palette.ink2 }]} />
              ) : null}
            </View>
            <Text style={[stateText(), ROW_SPLIT.value, { minWidth: state.least }]}>
              {row.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function ResultCards({ title, rows, delay, animate }: Required<Omit<Props, 'variant'>>) {
  useTheme();
  return (
    <View style={{ gap: SPACE.md }}>
      <Rise delay={delay} animate={animate}>
        <Text accessibilityRole="header" style={TYPE.title}>
          {title}
        </Text>
      </Rise>
      {rows.map((row, n) => (
        <Rise
          key={row.key}
          index={Math.min(n, RESULT.staggerLimit)}
          delay={delay + DURATION.resultCardLead}
          animate={animate}
        >
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
      style={[{ gap: RESULT.legacyCardGap }, row.right ? { backgroundColor: palette.mint } : null]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Icon name={row.right ? 'check' : 'arrow'} size={RESULT.legacyCardGlyph} color={tint} />
        </View>
        <Text style={[TYPE.label, { color: tint }]}>{row.label}</Text>
      </View>
      <InlineText text={row.text} style={TYPE.body} />
      {row.detail !== null ? <InlineText text={row.detail} style={TYPE.bodyStrong} /> : null}
      {row.note ? (
        <InlineText text={row.note} style={[TYPE.body, { color: palette.ink2 }]} />
      ) : null}
    </Card>
  );
}
