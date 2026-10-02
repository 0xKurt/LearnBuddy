// Lückentext (issue #232): ein Text, in dem die Lücken kleine Felder mitten in der Zeile sind.
// Eine Bedienung pro Form (Owner 02.10.: „Minimalismus … Assistent app"):
//
//   · ohne Wortbank tippt sie in die Lücken; „Weiter" auf der Tastatur springt zur nächsten,
//     in der letzten schickt es ab, wenn alles ausgefüllt ist;
//   · mit Wortbank tippt sie ein Wort an, und es landet in der aktiven Lücke — danach ist die
//     nächste leere aktiv. Ein Tipp auf eine gefüllte Lücke leert sie wieder (rückgängig
//     statt bestätigen). Ein eingesetztes Wort bleibt an seinem Platz stehen, nur blass: so
//     springt nichts unter dem Finger weg.
//
// „Prüfen" wartet, bis jede Lücke etwas hat. Geprüft wird auf dem Server, Lücke für Lücke mit
// den Regeln jeder geschriebenen Antwort (apps/api/src/modules/practice/cloze.ts). Ob sie
// getippt oder angetippt hat, geht ehrlich mit (`via`, issue #163): aus der Wortbank zu wählen
// ist Wiedererkennen, nicht Schreiben.
//
// Ihr Stand liegt im Entwurf (`lib/drafts.ts`) wie jede getippte Antwort: er übersteht einen
// Themenwechsel (Remount) und Android, das die App beendet.

import type { ClozeTaskView, StructuredAnswer } from '@learnbuddy/shared-types/contracts';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { useDraft } from '../../lib/drafts.js';
import { SPACE, TOUCH } from '../../lib/theme/space.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { Btn } from '../lb/Btn.js';
import { TopEdgeFade, topEdgeMask } from '../lb/EdgeFade.js';
import { MathText } from '../math/MathText.js';
import { BottomBar } from './BottomBar.js';

/** A piece of the flowing text: words, or the gap with this index. */
export type Piece = { kind: 'text'; text: string } | { kind: 'gap'; index: number };

/**
 * The text cut into units that may not break inside: a word, or a gap together with the
 * punctuation that touches it ("___." stays one unit, so the full stop never starts a line).
 * Math between dollar signs stays one word, spaces and all.
 */
export function unitsOf(segments: readonly string[]): Piece[][] {
  const units: Piece[][] = [];
  let current: Piece[] = [];
  const flush = () => {
    if (current.length > 0) units.push(current);
    current = [];
  };
  segments.forEach((segment, i) => {
    for (const part of segment.match(/\s+|\$[^$]*\$|[^\s$]+|\$/g) ?? []) {
      if (/^\s+$/.test(part)) {
        flush();
        continue;
      }
      const last = current[current.length - 1];
      if (last?.kind === 'text') last.text += part;
      else current.push({ kind: 'text', text: part });
    }
    if (i < segments.length - 1) current.push({ kind: 'gap', index: i });
  });
  flush();
  return units;
}

/** What she put into the gaps, kept as JSON; anything that is not a gap of this task is left out. */
export function filledFrom(kept: string, ids: readonly string[]): Record<string, string> {
  try {
    const raw: unknown = JSON.parse(kept || '{}');
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const out: Record<string, string> = {};
    for (const id of ids) {
      const v = (raw as Record<string, unknown>)[id];
      if (typeof v === 'string' && v.length > 0) out[id] = v;
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * The gap a tap on a bank word fills: the active one if it is empty, else the first empty one
 * after it (and then from the start). Null when every gap is filled.
 */
export function nextEmpty(
  ids: readonly string[],
  filled: Record<string, string>,
  from: number,
): number | null {
  for (let step = 0; step < ids.length; step++) {
    const i = (from + step) % ids.length;
    if (!filled[ids[i]!]) return i;
  }
  return null;
}

/** About as wide as what is in the gap: small when empty, never wider than a phone line. */
function gapWidth(text: string): number {
  return Math.max(64, Math.min(220, SPACE.xl + text.length * 9.5));
}

type Props = {
  view: ClozeTaskView;
  /** Where her words are kept (`lib/drafts.ts`). */
  draftKey: string;
  disabled: boolean;
  /** "Prüfen": every gap filled; `shown` is her words for the thread. */
  onSubmit: (parts: StructuredAnswer, shown: string, via: 'typed' | 'tapped') => void;
};

export function ClozeAnswer({ view, draftKey, disabled, onSubmit }: Props) {
  const { palette } = useTheme();
  const { t } = useTranslation('practice');
  const { text: kept, setText: keep } = useDraft(draftKey);
  const ids = view.gaps;
  const filled = filledFrom(kept, ids);
  const bank = view.bank;
  const complete = ids.every((id) => (filled[id] ?? '').trim().length > 0);
  const [active, setActive] = useState(0);
  const [focused, setFocused] = useState<number | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const fields = useRef<Array<TextInput | null>>([]);
  const scroller = useRef<ScrollView | null>(null);
  /** Where each unit of the text stands (top and height), for scrolling to a gap. */
  const boxes = useRef<Array<{ y: number; h: number }>>([]);
  /** The gap she is typing in (a ref: the layout callback below must see it at once). */
  const typingIn = useRef<number | null>(null);
  const units = unitsOf(view.segments);

  /**
   * The line of this gap into view, starting at the line above it — at a line's top edge,
   * so no half-cut line hangs under the question.
   */
  const showGap = (index: number) => {
    const at = units.findIndex((unit) => unit.some((p) => p.kind === 'gap' && p.index === index));
    const box = boxes.current[at];
    if (!box) return;
    // Units of one line share their centre (alignItems: center); the line above is the one
    // with the nearest centre above this one, and it starts where its tallest unit does.
    const centre = (b: { y: number; h: number }) => b.y + b.h / 2;
    const above = boxes.current.filter((b) => b && centre(b) < box.y);
    const prev = Math.max(...above.map(centre), -Infinity);
    const top = above.filter((b) => Math.abs(centre(b) - prev) < 2).map((b) => b.y);
    scroller.current?.scrollTo({ y: top.length > 0 ? Math.min(...top) : 0, animated: false });
  };
  const total = ids.length;
  const used = new Set(Object.values(filled));

  const write = (id: string, value: string) =>
    keep((now) => JSON.stringify({ ...filledFrom(now, ids), [id]: value }));

  const submit = () => {
    if (disabled || !complete) return;
    onSubmit(
      { type: 'cloze', gaps: ids.map((id) => ({ id, text: (filled[id] ?? '').trim() })) },
      ids.map((id) => (filled[id] ?? '').trim()).join(' · '),
      bank === null ? 'typed' : 'tapped',
    );
  };

  /** A bank word into the active gap; then the next empty one is active. */
  const place = (word: string) => {
    const target = nextEmpty(ids, filled, active);
    if (target === null) return;
    const id = ids[target]!;
    write(id, word);
    const after = nextEmpty(ids, { ...filled, [id]: word }, target + 1);
    setActive(after ?? target);
  };

  const gap = (index: number) => {
    const id = ids[index]!;
    const value = filled[id] ?? '';
    const n = index + 1;
    if (bank === null) {
      const isFocused = focused === index;
      return (
        <TextInput
          key={`gap-${id}`}
          ref={(el) => {
            fields.current[index] = el;
          }}
          value={value}
          editable={!disabled}
          onChangeText={(v) => write(id, v)}
          onFocus={() => {
            setFocused(index);
            typingIn.current = index;
            showGap(index);
          }}
          onBlur={() => {
            setFocused((f) => (f === index ? null : f));
            if (typingIn.current === index) typingIn.current = null;
          }}
          accessibilityLabel={t('cloze.gap', { n, total })}
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          returnKeyType={index < total - 1 ? 'next' : 'done'}
          blurOnSubmit={index === total - 1}
          onSubmitEditing={() => {
            // "Weiter" goes to the next gap; in the last one, a complete text goes out.
            if (index < total - 1) fields.current[index + 1]?.focus();
            else submit();
          }}
          style={{
            width: gapWidth(value),
            height: TOUCH,
            paddingHorizontal: SPACE.sm,
            borderRadius: 10,
            // Thicker when focused: the shape says where she types, not only the colour.
            borderWidth: isFocused ? 2 : 1.5,
            borderColor: isFocused ? palette.primary : palette.field,
            backgroundColor: palette.paper,
            color: palette.ink,
            fontSize: 16,
            textAlign: 'center',
            // The app's focus ring (as LbTextInput), never the browser's black one.
            outlineStyle: 'solid',
            outlineWidth: isFocused ? 3 : 0,
            outlineColor: palette.ring,
          }}
        />
      );
    }
    const isActive = !disabled && active === index && !value;
    return (
      <Pressable
        key={`gap-${id}`}
        disabled={disabled}
        onPress={() => {
          // Filled: the word goes back to the bank and the gap is the one to fill next.
          if (value) write(id, '');
          setActive(index);
        }}
        accessibilityRole="button"
        accessibilityLabel={
          value ? t('cloze.gap_filled', { n, total, word: value }) : t('cloze.gap', { n, total })
        }
        accessibilityHint={value ? t('cloze.gap_clear') : undefined}
        accessibilityState={{ disabled, selected: isActive }}
      >
        <View
          style={{
            minWidth: gapWidth(value),
            height: TOUCH,
            paddingHorizontal: SPACE.sm,
            borderRadius: 10,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: isActive ? 2 : 1.5,
            borderColor: isActive ? palette.primary : value ? 'transparent' : palette.field,
            backgroundColor: value ? palette.primaryLt : palette.paper,
          }}
        >
          <Text style={{ color: palette.primaryDk, fontSize: 16, fontWeight: '600' }}>{value}</Text>
        </View>
      </Pressable>
    );
  };

  return (
    <>
      <View
        style={{
          // It gives way when the keyboard takes the room (the screen keeps the question
          // whole): then the text scrolls, and the gap she types in is scrolled to. With the
          // whole phone to itself it fits and nothing scrolls (tests/web/fit.ts).
          flexShrink: 1,
          minHeight: 0,
          paddingHorizontal: SPACE.lg,
          paddingTop: SPACE.sm,
          gap: SPACE.md,
        }}
      >
        <ScrollView
          ref={scroller}
          testID="cloze-text"
          // Scrolled, the text fades out under the question instead of a half line standing
          // cut off there (the conversation's edge, EdgeFade.tsx) — only then: unscrolled,
          // its first line must stay crisp.
          style={[{ flexGrow: 0, flexShrink: 1 }, scrolled ? topEdgeMask : null]}
          scrollEventThrottle={32}
          onScroll={(e) => setScrolled(e.nativeEvent.contentOffset.y > 1)}
          keyboardShouldPersistTaps="handled"
          // The keyboard comes up AFTER the focus and shrinks the text: the gap she types in
          // must stay in view then too.
          onLayout={() => {
            if (typingIn.current !== null) showGap(typingIn.current);
          }}
          contentContainerStyle={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            alignItems: 'center',
            // A space's width between words (≈ 4 pt at 16 pt type); one step between lines.
            columnGap: SPACE.xs,
            rowGap: SPACE.xs,
          }}
        >
          {units.map((unit, u) => (
            <View
              key={u}
              style={{ flexDirection: 'row', alignItems: 'center' }}
              onLayout={(e) => {
                boxes.current[u] = {
                  y: e.nativeEvent.layout.y,
                  h: e.nativeEvent.layout.height,
                };
              }}
            >
              {unit.map((piece, p) =>
                piece.kind === 'gap' ? (
                  gap(piece.index)
                ) : piece.text.includes('$') ? (
                  <MathText key={p} text={piece.text} style={TYPE.body} />
                ) : (
                  <Text key={p} style={TYPE.body}>
                    {piece.text}
                  </Text>
                ),
              )}
            </View>
          ))}
        </ScrollView>
        {scrolled ? <TopEdgeFade top={SPACE.sm} /> : null}
        {bank ? (
          <View
            testID="cloze-bank"
            style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm }}
          >
            {bank.map((word) => {
              const taken = used.has(word);
              return (
                <Btn
                  key={word}
                  variant="outline"
                  size="sm"
                  pill
                  disabled={disabled || taken}
                  onPress={() => place(word)}
                  accessibilityLabel={taken ? t('cloze.word_used', { word }) : word}
                >
                  {word}
                </Btn>
              );
            })}
          </View>
        ) : null}
      </View>
      <BottomBar>
        <Btn
          pill
          full
          disabled={disabled || !complete}
          onPress={submit}
          accessibilityHint={complete ? undefined : t('cloze.check_waits')}
        >
          {t('check')}
        </Btn>
      </BottomBar>
    </>
  );
}
