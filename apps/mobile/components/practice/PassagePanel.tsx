// Der Lesetext über der Frage (Leseverständnis, issue #233).
//
// Mehrere Fragen zu EINEM Text: der Text steht oben in der Fragekarte, die jeweilige Frage
// darunter, und beide sind gleichzeitig zu sehen — auch auf 360×740. Dafür hat der Text eine feste
// Höhe (ein gutes Viertel des Bildschirms) und scrollt in sich. Das ist die erlaubte Ausnahme
// „nur ein Text scrollt“ (CLAUDE.md Regel 16; `scroll-text` in tests/web/fit.ts): die Frage, ihre
// Antwort und „Prüfen“ bleiben stehen.
//
// Einklappbar: der Kopf ist ein Knopf (Titel + „Einklappen“), der den Text zu einer Zeile faltet,
// wenn sie den Platz für die Frage braucht. Die Zeilen sind die des Blatts — gezählt wird jede,
// eine Leerzeile auch, und die Nummer steht wie im Schulbuch an jeder fünften Zeile (und an der
// ersten). „Z. 12“ in einer Frage meint genau diese Zeile; der Server hat geprüft, dass es sie
// gibt. Ist eine Frage geschlossen, sind die Zeilen ihrer Antwort hinterlegt, der Text scrollt
// dorthin, und darunter steht in Worten, wo sie stehen: Farbe ist nie das einzige Signal.
//
// Der Text bleibt, wie sie ihn verlassen hat, solange die Fragen denselben Text haben: eingeklappt
// bleibt eingeklappt, und wo sie hingescrollt hat, bleibt sie (`kept`, je Text).

import { lineNumbers, type PassageView } from '@learnbuddy/shared-types/contracts';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';

import { RADIUS } from '../../lib/theme/radius.js';
import { SPACE } from '../../lib/theme/space.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { Btn } from '../lb/Btn.js';
import { bottomEdgeMask, TopEdgeFade } from '../lb/EdgeFade.js';
import { FoldLabel } from '../lb/FoldLabel.js';
import { Icon } from '../lb/Icon.js';

/** Every fifth line carries its number, like a schoolbook; the first one too. */
export function numbered(n: number): boolean {
  return n === 1 || n % 5 === 0;
}

/** How she left a text: folded or open, and how far down she had read. */
type Kept = { open: boolean; y: number };
const kept = new Map<string, Kept>();

/** One text, recognised again from the next question of its group (the alias restarts per run). */
function keyOf(p: PassageView): string {
  return `${p.ref}\u0000${p.title ?? ''}\u0000${p.lines.length}\u0000${p.lines[0] ?? ''}`;
}

type Props = {
  passage: PassageView;
  /** How tall the text may be before it scrolls in itself. */
  maxHeight: number;
};

export function PassagePanel({ passage, maxHeight }: Props) {
  const { palette } = useTheme();
  const { t } = useTranslation('practice');
  const key = keyOf(passage);
  const [open, setOpen] = useState(() => kept.get(key)?.open ?? true);
  const scroll = useRef<ScrollView>(null);
  // Where each printed line starts, measured (a long one wraps on a phone): the text scrolls to it.
  const tops = useRef<number[]>([]);
  const [laidOut, setLaidOut] = useState(false);
  // More of the text below what the box shows: its lower edge fades instead of cutting a line.
  const [more, setMore] = useState(true);
  const title = passage.title ?? t('reading.label');
  const numbers = lineNumbers(passage.lines);
  const at = passage.evidence;
  // Where the text opens: the answer's lines once it is closed, else the lines the question names.
  const goTo = at ?? passage.named;
  const measure = (offset: number, box: number, content: number) =>
    setMore(content - (offset + box) > SPACE.xs);

  const toggle = () => {
    setOpen((was) => {
      kept.set(key, { open: !was, y: kept.get(key)?.y ?? 0 });
      return !was;
    });
  };

  // Back where she was in this text — or, once a question is closed, where its answer stands.
  useEffect(() => {
    if (!open || !laidOut) return;
    // One line of what comes before stays in view above the answer's first line.
    const first = goTo ? lineNumbers(passage.lines).indexOf(goTo.from) : 0;
    const y = goTo ? (tops.current[Math.max(0, first - 1)] ?? 0) : (kept.get(key)?.y ?? 0);
    scroll.current?.scrollTo({ y, animated: at !== null });
  }, [open, laidOut, at, goTo, key, passage.lines]);

  return (
    <View
      testID="passage"
      style={{
        backgroundColor: palette.paper,
        borderRadius: RADIUS.frame,
        overflow: 'hidden',
        marginBottom: SPACE.md,
      }}
    >
      <Btn
        variant="ghost"
        size="sm"
        full
        expanded={open}
        onPress={toggle}
        accessibilityLabel={title}
        accessibilityHint={t(open ? 'reading.hide_hint' : 'reading.show_hint')}
        label={
          <FoldLabel
            icon="book"
            title={title}
            action={t(open ? 'reading.hide' : 'reading.show')}
            open={open}
          />
        }
      >
        {title}
      </Btn>
      {open ? (
        <View style={{ borderTopWidth: 1, borderTopColor: palette.hairline }}>
          <ScrollView
            ref={scroll}
            testID="scroll-text"
            nestedScrollEnabled
            // Reachable by keyboard: a text that scrolls must be scrollable without a pointer
            // (axe `scrollable-region-focusable`; on the web this is tabIndex 0).
            focusable
            accessibilityLabel={title}
            accessibilityHint={t('reading.scroll_hint')}
            style={[{ maxHeight }, more ? bottomEdgeMask() : null]}
            contentContainerStyle={{ paddingVertical: SPACE.sm }}
            scrollEventThrottle={64}
            onScroll={(e) => {
              const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
              kept.set(key, { open: true, y: contentOffset.y });
              measure(contentOffset.y, layoutMeasurement.height, contentSize.height);
            }}
            onContentSizeChange={(_, h) => measure(0, maxHeight, h)}
          >
            {passage.lines.map((line, i) => {
              // The line's number as print counts it: an empty line between paragraphs has none.
              const n = numbers[i] ?? null;
              const lit = at !== null && n !== null && n >= at.from && n <= at.to;
              // The lines the question names carry their numbers, so she does not count.
              const named =
                passage.named !== null &&
                n !== null &&
                n >= passage.named.from &&
                n <= passage.named.to;
              // A paragraph break is a little air, not a whole empty line: a box that ends on a
              // blank line would look like the end of the text while the story goes on below.
              if (n === null) {
                return (
                  <View
                    key={i}
                    onLayout={(e) => {
                      tops.current[i] = Math.round(e.nativeEvent.layout.y);
                      if (i === passage.lines.length - 1) setLaidOut(true);
                    }}
                    style={{ height: SPACE.sm }}
                  />
                );
              }
              return (
                <View
                  key={i}
                  accessible
                  accessibilityLabel={`${t('reading.line', { n })}: ${line}`}
                  onLayout={(e) => {
                    tops.current[i] = Math.round(e.nativeEvent.layout.y);
                    if (i === passage.lines.length - 1) setLaidOut(true);
                  }}
                  style={{
                    flexDirection: 'row',
                    // A printed line that wraps on the phone stays one block: the air is between
                    // printed lines, so a numbered line and its continuation read as one.
                    paddingVertical: SPACE.xs / 2, // token-exempt: half the smallest step, per side
                    backgroundColor: lit ? palette.primaryLt : 'transparent',
                  }}
                >
                  {/* The gutter: the line number on every fifth line, and on the answer's lines. */}
                  <Text
                    accessibilityElementsHidden
                    importantForAccessibility="no"
                    style={[
                      TYPE.label,
                      {
                        width: SPACE.xl + SPACE.sm,
                        paddingRight: SPACE.sm,
                        textAlign: 'right',
                        lineHeight: TYPE.small.lineHeight,
                        fontVariant: ['tabular-nums'],
                        color: lit ? palette.primaryDk : palette.ink2,
                      },
                    ]}
                  >
                    {numbered(n) || lit || named ? n : ''}
                  </Text>
                  <Text
                    style={[TYPE.small, { flex: 1, paddingRight: SPACE.md, color: palette.ink }]}
                  >
                    {line}
                  </Text>
                </View>
              );
            })}
          </ScrollView>
          {more ? <TopEdgeFade bottom color={palette.paper} /> : null}
        </View>
      ) : null}
      {at ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: SPACE.xs,
            paddingHorizontal: SPACE.md,
            paddingVertical: SPACE.sm,
            borderTopWidth: 1,
            borderTopColor: palette.hairline,
          }}
        >
          <Icon name="book" size={14} color={palette.primaryDk} />
          <Text testID="evidence" style={[TYPE.label, { color: palette.primaryDk }]}>
            {at.from === at.to
              ? t('reading.evidence_one', { from: at.from })
              : t('reading.evidence', { from: at.from, to: at.to })}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
