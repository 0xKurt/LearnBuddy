// Ein Programm auf dem Bildschirm (issue #262, Plan 1): Monospace, Einrückung, Zeilennummern,
// gefärbt — und lesbar auf einem 360 pt breiten Handy.
//
// Die Färbung kommt fertig vom Server (`CodeFigure.lines`, aus derselben Regel wie der
// Interpreter, `apps/api/src/modules/practice/python/highlight.ts`). Hier wird nur nach `kind`
// eine Farbe aus dem Theme gewählt (`palette.code`) — die App muss kein Python verstehen.
//
// Zwei Formen:
//   · LESEN: ein ruhiger Block. Was breiter ist als das Handy, schiebt sich waagerecht, aber nur
//     im Block selbst (issue #262: „waagerechtes Scrollen nur im Block") — die Seite nie.
//   · ANTIPPEN (`pick`, „In welcher Zeile ist der Fehler?"): jede Zeile ist ein Tippziel von
//     44 pt (`TOUCH`), mit ihrer Nummer und ihrem Text als Namen für den Screenreader. Darum hat
//     ein solches Programm höchstens acht Zeilen (`CODE_PICK_LINES_MAX`): 8 × 44 = 352 pt.
//     Eine schon versuchte Zeile bleibt stehen, ist aber nicht mehr wählbar und trägt einen
//     Strich statt der Nummer — nie nur eine blassere Farbe (dieselbe Regel wie `ChoiceList`).

import type { CodeFigure, CodeSpan, CodeSpanKind } from '@learnbuddy/shared-types/contracts';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { useTheme } from '../../lib/theme/ThemeProvider.js';
import type { Palette } from '../../lib/theme/palettes.js';
import { SPACE, TOUCH } from '../../lib/theme/space.js';
import { MONO } from '../../lib/theme/mono.js';

/** 13 pt auf 20 pt Zeilenhöhe: auf 360 pt passen so gut 30 Zeichen neben die Nummern. */
const FONT = 13;
const LINE = 20;

export type LinePick = {
  onPick: (line: number) => void;
  /** Zeilen, die sie schon falsch angetippt hat (1-basiert). */
  tried: ReadonlySet<number>;
  disabled: boolean;
};

function inkOf(code: Palette['code'], ink: string, kind: CodeSpanKind): string {
  switch (kind) {
    case 'keyword':
      return code.keyword;
    case 'builtin':
      return code.builtin;
    case 'function':
      return code.fn;
    case 'string':
      return code.string;
    case 'number':
      return code.number;
    case 'comment':
      return code.comment;
    case 'plain':
      return ink;
  }
}

/** Der Text einer Zeile, wie der Screenreader ihn vorliest. */
export function lineText(spans: readonly CodeSpan[]): string {
  return spans.map((s) => s.text).join('');
}

function Spans({ spans }: { spans: readonly CodeSpan[] }) {
  const { palette } = useTheme();
  return (
    <Text
      style={{ fontFamily: MONO, fontSize: FONT, lineHeight: LINE, color: palette.ink }}
      // Eine Zeile bricht nie um: die Einrückung IST in Python die Struktur.
      numberOfLines={1}
    >
      {spans.length === 0
        ? ' '
        : spans.map((s, i) => (
            <Text
              key={i}
              style={{
                color: inkOf(palette.code, palette.ink, s.kind),
                fontStyle: s.kind === 'comment' ? 'italic' : 'normal',
                fontWeight: s.kind === 'keyword' ? '600' : '400',
              }}
            >
              {s.text}
            </Text>
          ))}
    </Text>
  );
}

function LineNo({ n, width, tried }: { n: number; width: number; tried?: boolean }) {
  const { palette } = useTheme();
  return (
    <Text
      style={{
        width,
        marginRight: SPACE.md,
        textAlign: 'right',
        fontFamily: MONO,
        fontSize: FONT,
        lineHeight: LINE,
        color: palette.code.lineNo,
      }}
    >
      {tried ? '–' : n}
    </Text>
  );
}

export function CodeBlock({ figure, pick }: { figure: CodeFigure; pick?: LinePick }) {
  const { palette } = useTheme();
  const { t } = useTranslation('practice');
  const count = figure.lines.length;
  // So breit wie die längste Nummer, damit der Code bei Zeile 10 nicht nach rechts springt.
  const numWidth = String(count).length * 8 + 4;
  const rows = figure.lines.map((spans, i) => {
    const n = i + 1;
    const text = lineText(spans);
    if (!pick) {
      return (
        <View key={n} style={{ flexDirection: 'row', paddingHorizontal: SPACE.md }}>
          <LineNo n={n} width={numWidth} />
          <Spans spans={spans} />
        </View>
      );
    }
    const tried = pick.tried.has(n);
    const blocked = pick.disabled || tried;
    return (
      <Pressable
        key={n}
        onPress={() => pick.onPick(n)}
        disabled={blocked}
        accessibilityRole="button"
        accessibilityLabel={t('code.line_label', {
          line: n,
          code: text.trim() === '' ? t('code.line_empty') : text.trim(),
        })}
        accessibilityHint={tried ? t('code.tried') : t('code.pick_hint')}
        accessibilityState={{ disabled: blocked }}
        testID={`code-line-${n}`}
      >
        {({ pressed }) => (
          <View
            style={{
              minHeight: TOUCH,
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: SPACE.md,
              // Getrennt durch eine Haarlinie, damit jede Zeile als eigenes Ziel zu sehen ist.
              borderTopWidth: i === 0 ? 0 : 1,
              borderTopColor: palette.hairline,
              backgroundColor: pressed ? palette.primaryLt : 'transparent',
              opacity: tried ? 0.45 : 1,
            }}
          >
            <LineNo n={n} width={numWidth} tried={tried} />
            <Spans spans={spans} />
          </View>
        )}
      </Pressable>
    );
  });
  return (
    <View
      accessibilityLabel={pick ? undefined : t('code.block_label', { count })}
      style={{
        alignSelf: 'stretch',
        backgroundColor: palette.code.bg,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: palette.hairline,
        // Lesend etwas Luft über und unter dem Code; antippend tragen die Zeilen sie selbst.
        paddingVertical: pick ? 0 : SPACE.sm,
        overflow: 'hidden',
      }}
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        // Nur waagerecht, und nur, wenn eine Zeile breiter ist als der Block.
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        accessibilityHint={t('code.scroll_hint')}
      >
        <View style={{ flexGrow: 1 }}>{rows}</View>
      </ScrollView>
    </View>
  );
}
