// A text with inline math ($\frac{3}{4}$, $x^{2}$, $\sqrt{16}$ …) drawn with
// plain Text and View, so it looks the same on iOS, Android and the web:
// stacked fractions with a rule, raised exponents, lowered indices, a drawn
// root sign with its bar. Text without math stays one ordinary <Text>.
// Screen readers get the whole text in words ("3 durch 4"), never the LaTeX.
// Parsing: lib/math/parse.ts; spoken form: lib/math/speak.ts.

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  StyleSheet,
  Text,
  View,
  type AccessibilityRole,
  type StyleProp,
  type TextStyle,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';

import type { MathAtom } from '../../lib/math/parse.js';
import { parsePrompt, promptForSpeech, type PromptRun } from '../../lib/math/prompt.js';
import { LB } from '../../lib/theme/colors.js';
import { useSpokenMath } from './useSpokenMath.js';

type Props = {
  text: string;
  /** Base text style: fontSize, lineHeight, color, fontWeight are used for the math too. */
  style?: StyleProp<TextStyle>;
  accessibilityRole?: AccessibilityRole;
  /** Overrides the spoken form (e.g. to add a speaker: "Buddy: …"). */
  accessibilityLabel?: string;
  /** Put the whole text into the accessibility tree as one element (default true). */
  accessible?: boolean;
  /**
   * Draw "___" as a gap to fill in (questions), read out as "Lücke". `filled`:
   * the learner's answer drawn into the gap while she types (one blank only).
   */
  blanks?: { filled?: string | null };
};

type Metrics = {
  size: number;
  color: string;
  weight: TextStyle['fontWeight'];
  family: string | undefined;
};

const THIN = ' ';
/** An empty gap is as wide as a short word, and grows with the text size. */
const EMPTY_GAP = '\u00A0'.repeat(7);
const BOLD: TextStyle = { fontWeight: '700' };

export function MathText({
  text,
  style,
  accessibilityRole,
  accessibilityLabel,
  accessible = true,
  blanks,
}: Props) {
  const { t } = useTranslation('math');
  const withBlanks = blanks !== undefined;
  const filled = blanks?.filled ?? null;
  const runs = useMemo(() => parsePrompt(text, { blanks: withBlanks }), [text, withBlanks]);
  const forSpeech = promptForSpeech(text, {
    blanks: withBlanks,
    blankWord: t('blank.label'),
    // A $ in her answer must not open math in the spoken form.
    filledWord: filled ? t('blank.filled', { answer: filled.replace(/\$/g, '\\$') }) : null,
  });
  const spoken = useSpokenMath(forSpeech);
  const flat = StyleSheet.flatten(style) ?? {};
  const simple = runs.every((r) => r.type === 'plain');

  if (simple) {
    return (
      <Text
        style={style}
        accessibilityRole={accessibilityRole}
        accessibilityLabel={accessibilityLabel ?? forSpeech}
        accessible={accessible}
      >
        {runs.map((r, i) =>
          r.type === 'plain' && r.bold ? (
            <Text key={i} style={BOLD}>
              {r.text}
            </Text>
          ) : r.type === 'plain' ? (
            r.text
          ) : null,
        )}
      </Text>
    );
  }

  const m: Metrics = {
    size: flat.fontSize ?? 16,
    color: typeof flat.color === 'string' ? flat.color : LB.ink,
    weight: flat.fontWeight,
    family: flat.fontFamily,
  };
  const mBold: Metrics = { ...m, weight: '700' };
  const lineHeight = flat.lineHeight ?? Math.round(m.size * 1.4);
  const units = buildUnits(runs);

  return (
    <View
      // Inside a parent that speaks for it (a bubble, a button) it stays silent.
      {...(accessible
        ? {
            accessible: true,
            accessibilityRole: accessibilityRole ?? 'text',
            accessibilityLabel: accessibilityLabel ?? spoken,
          }
        : { accessible: false })}
      style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', flexShrink: 1 }}
    >
      {units.map((unit, i) => (
        <View
          key={i}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            flexShrink: 1,
            minHeight: lineHeight,
          }}
        >
          {unit.map((piece, j) => {
            switch (piece.kind) {
              case 'plain':
                return (
                  <Text key={j} style={[style, { lineHeight }, piece.bold ? BOLD : null]}>
                    {piece.text}
                  </Text>
                );
              case 'atom':
                return <AtomView key={j} atom={piece.atom} m={piece.bold ? mBold : m} />;
              case 'blank':
                return (
                  <Gap
                    key={j}
                    style={[style, { lineHeight }, piece.bold ? BOLD : null]}
                    lineHeight={lineHeight}
                    filled={filled}
                  />
                );
            }
          })}
        </View>
      ))}
    </View>
  );
}

/** A blank: a light box with a line under it, her answer inside once she types. */
function Gap({
  style,
  lineHeight,
  filled,
}: {
  style: StyleProp<TextStyle>;
  lineHeight: number;
  filled: string | null;
}) {
  return (
    <View
      style={{
        flexShrink: 1,
        minHeight: lineHeight,
        justifyContent: 'flex-end',
        marginHorizontal: 3,
        paddingHorizontal: 6,
        backgroundColor: LB.paper,
        borderBottomWidth: 2,
        borderBottomColor: LB.ink2,
        borderTopLeftRadius: 6,
        borderTopRightRadius: 6,
      }}
    >
      <Text style={[style, filled ? { color: LB.primaryDk } : null]}>{filled ?? EMPTY_GAP}</Text>
    </View>
  );
}

// ─────────────── line breaking ───────────────

type Piece =
  | { kind: 'plain'; text: string; bold: boolean }
  | { kind: 'atom'; atom: MathAtom; bold: boolean }
  | { kind: 'blank'; bold: boolean };

/**
 * Groups the text into pieces that never break inside (a word, a term like
 * "x²", a gap with the punctuation after it); the line may break between
 * groups: at spaces in the text and after + − = … inside math.
 */
function buildUnits(runs: PromptRun[]): Piece[][] {
  const units: Piece[][] = [];
  let cur: Piece[] = [];
  const close = () => {
    if (cur.length > 0) units.push(cur);
    cur = [];
  };
  for (const run of runs) {
    if (run.type === 'blank') {
      cur.push({ kind: 'blank', bold: run.bold });
      continue;
    }
    if (run.type === 'plain') {
      for (const part of run.text.split(/(\s+)/)) {
        if (part.length === 0) continue;
        if (/^\s+$/.test(part)) {
          appendPlain(cur, ' ', run.bold);
          close();
        } else appendPlain(cur, part, run.bold);
      }
      continue;
    }
    for (const atom of run.atoms) {
      if (atom.type !== 'chars') {
        cur.push({ kind: 'atom', atom, bold: run.bold });
        if (atom.type === 'symbol' && atom.char.endsWith(THIN)) close();
        continue;
      }
      // Break after a spaced operator: "x² − 4x + 3" → "x² − " | "4x + " | "3".
      for (const p of splitAfterOperators(atom.text)) {
        cur.push({ kind: 'atom', atom: { type: 'chars', text: p }, bold: run.bold });
        if (p.endsWith(THIN)) close();
      }
    }
  }
  close();
  return units;
}

/** "x − 4x + 3" (operators padded with thin spaces) → ["x − ", "4x + ", "3"]. */
function splitAfterOperators(text: string): string[] {
  const out: string[] = [];
  let start = 0;
  for (let i = 1; i < text.length; i++) {
    // A thin space that closes an operator ("␣−␣"): the one after a non-space.
    if (text[i] === THIN && text[i - 1] !== THIN && i >= 2 && text[i - 2] === THIN) {
      out.push(text.slice(start, i + 1));
      start = i + 1;
    }
  }
  if (start < text.length) out.push(text.slice(start));
  return out;
}

function appendPlain(cur: Piece[], text: string, bold: boolean): void {
  const last = cur[cur.length - 1];
  if (last?.kind === 'plain' && last.bold === bold) {
    cur[cur.length - 1] = { kind: 'plain', text: last.text + text, bold };
  } else cur.push({ kind: 'plain', text, bold });
}

// ─────────────── drawing ───────────────

function textStyle(m: Metrics, size: number): TextStyle {
  return {
    fontSize: size,
    lineHeight: Math.round(size * 1.3),
    color: m.color,
    fontWeight: m.weight,
    fontFamily: m.family,
  };
}

function Row({ atoms, m, size }: { atoms: MathAtom[]; m: Metrics; size: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      {atoms.map((a, i) => (
        <AtomView key={i} atom={a} m={m} size={size} />
      ))}
    </View>
  );
}

function AtomView({ atom, m, size = m.size }: { atom: MathAtom; m: Metrics; size?: number }) {
  switch (atom.type) {
    case 'chars':
      return <Chars text={atom.text} m={m} size={size} />;
    case 'symbol':
      return <Text style={textStyle(m, size)}>{atom.char}</Text>;
    case 'text':
      return <Text style={textStyle(m, size)}>{atom.text}</Text>;
    case 'frac':
      return <Fraction num={atom.num} den={atom.den} m={m} size={size} />;
    case 'sup':
    case 'sub': {
      const small = Math.max(10, Math.round(size * 0.68));
      const line = Math.round(size * 1.3);
      return (
        <View
          style={{
            height: line,
            justifyContent: atom.type === 'sup' ? 'flex-start' : 'flex-end',
            marginTop: atom.type === 'sup' ? -Math.round(size * 0.12) : 0,
            marginBottom: atom.type === 'sub' ? -Math.round(size * 0.12) : 0,
            paddingLeft: 1,
          }}
        >
          <Row atoms={atom.body} m={m} size={small} />
        </View>
      );
    }
    case 'sqrt':
      return <Root index={atom.index} body={atom.body} m={m} size={size} />;
  }
}

/** Letters (variables) in italics like in the schoolbook; digits and operators upright. */
function Chars({ text, m, size }: { text: string; m: Metrics; size: number }) {
  const runs = text.split(/([a-zA-Z]+)/).filter((r) => r.length > 0);
  return (
    <Text style={textStyle(m, size)}>
      {runs.map((r, i) =>
        /^[a-zA-Z]+$/.test(r) ? (
          <Text key={i} style={{ fontStyle: 'italic' }}>
            {r}
          </Text>
        ) : (
          r
        ),
      )}
    </Text>
  );
}

function Fraction({
  num,
  den,
  m,
  size,
}: {
  num: MathAtom[];
  den: MathAtom[];
  m: Metrics;
  size: number;
}) {
  // Numerator and denominator a little smaller, nested ones smaller still (never below 11).
  const inner = Math.max(11, Math.round(size * 0.86));
  // A whole-pixel rule so every fraction bar looks equally strong.
  const rule = size >= 15 ? 2 : 1;
  return (
    <View
      style={{
        alignItems: 'center',
        paddingHorizontal: 3,
        marginVertical: 2,
        // Put the fraction bar near the height of a minus sign instead of the line's middle.
        marginTop: Math.round(size * 0.18),
      }}
    >
      <Row atoms={num} m={m} size={inner} />
      <View
        style={{
          alignSelf: 'stretch',
          height: rule,
          backgroundColor: m.color,
          borderRadius: rule / 2,
          marginVertical: 1,
        }}
      />
      <Row atoms={den} m={m} size={inner} />
    </View>
  );
}

function Root({
  index,
  body,
  m,
  size,
}: {
  index: MathAtom[] | null;
  body: MathAtom[];
  m: Metrics;
  size: number;
}) {
  const [height, setHeight] = useState(Math.round(size * 1.3) + 4);
  const stroke = Math.max(1.5, size / 14);
  const width = Math.round(size * 0.62);
  const h = height;
  // The hook: a short rise, down to the bottom, then up to the bar.
  const d = `M ${stroke} ${h * 0.58} L ${width * 0.28} ${h * 0.48} L ${width * 0.55} ${h - stroke} L ${width - stroke / 2} ${stroke / 2}`;
  const small = Math.max(10, Math.round(size * 0.55));
  return (
    <View style={{ flexDirection: 'row', alignItems: 'stretch', paddingLeft: 1 }}>
      {index ? (
        <View style={{ justifyContent: 'flex-start', marginRight: -width * 0.45, paddingTop: 0 }}>
          <Row atoms={index} m={m} size={small} />
        </View>
      ) : null}
      <Svg width={width} height={h}>
        <Path
          d={d}
          stroke={m.color}
          strokeWidth={stroke}
          fill="none"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </Svg>
      <View
        onLayout={(e) => {
          const next = Math.round(e.nativeEvent.layout.height);
          if (next > 0 && Math.abs(next - height) > 1) setHeight(next);
        }}
        style={{
          borderTopWidth: stroke,
          borderColor: m.color,
          paddingTop: 2,
          paddingLeft: 2,
          paddingRight: 1,
          justifyContent: 'center',
        }}
      >
        <Row atoms={body} m={m} size={size} />
      </View>
    </View>
  );
}
