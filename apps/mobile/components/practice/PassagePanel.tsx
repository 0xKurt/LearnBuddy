// Der Lesetext über der Frage (Leseverständnis, issue #233).
//
// Mehrere Fragen zu EINEM Text: der Text steht oben, die jeweilige Frage darunter, und beide sind
// gleichzeitig zu sehen — auch auf 360×740. Dafür hat der Text eine feste Höhe (ein gutes Viertel
// des Bildschirms) und scrollt in sich. Das ist die erlaubte Ausnahme „nur ein Text scrollt"
// (CLAUDE.md Regel 16; `scroll-text` in tests/web/fit.ts): die Frage, ihre Antwort und „Prüfen"
// bleiben stehen.
//
// Einklappbar: zu einer Zeile mit Titel und „Text zeigen", wenn sie den Platz für die Frage
// braucht. Die Zeilen sind die des Blatts (oder die Buddy geschrieben hat) — gezählt wird jede,
// eine Leerzeile auch, und die Nummer steht wie im Schulbuch an jeder fünften Zeile (und an der
// ersten). „Z. 12" in einer Frage meint genau diese Zeile; der Server hat geprüft, dass es sie
// gibt. Ist eine Frage geschlossen, sind die Zeilen ihrer Antwort hinterlegt — und darunter steht
// in Worten, wo sie stehen (`evidence` im Gespräch): Farbe ist nie das einzige Signal.
//
// Der Panel bleibt stehen, solange die Fragen denselben Text haben (`ref`): eingeklappt bleibt
// eingeklappt, und wo sie hingescrollt hat, bleibt sie.

import type { PassageLines, PassageView } from '@learnbuddy/shared-types/contracts';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';

import { SPACE } from '../../lib/theme/space.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { Btn } from '../lb/Btn.js';
import { Icon } from '../lb/Icon.js';

/** One line of the text, as it is set: the height the scroll offset is computed from. */
export const LINE_HEIGHT = 22;
/** Every fifth line carries its number, like a schoolbook; the first one too. */
export function numbered(n: number): boolean {
  return n === 1 || n % 5 === 0;
}

type Props = {
  passage: PassageView;
  /** Shown in full (her choice, kept per text by the screen). */
  open: boolean;
  onToggle: () => void;
  /** How tall the text may be before it scrolls in itself. */
  maxHeight: number;
  /** The lines a closed question's answer stands in: tinted, and scrolled into view. */
  highlight: PassageLines | null;
  /**
   * The heading the screen already shows (the run's title). A text named the same says
   * "Lesetext" instead — the same words twice on one screen are noise.
   */
  screenTitle?: string;
};

export function PassagePanel({
  passage,
  open,
  onToggle,
  maxHeight,
  highlight,
  screenTitle,
}: Props) {
  const { palette } = useTheme();
  const { t } = useTranslation('practice');
  const scroll = useRef<ScrollView>(null);
  const title =
    passage.title !== null && passage.title.trim() !== screenTitle?.trim()
      ? passage.title
      : t('reading.label');

  // A closed question shows where its answer stands: the text scrolls there by itself.
  useEffect(() => {
    if (!open || !highlight) return;
    const y = Math.max(0, (highlight.from - 2) * LINE_HEIGHT);
    scroll.current?.scrollTo({ y, animated: true });
  }, [open, highlight]);

  return (
    <View
      testID="passage"
      style={{
        backgroundColor: palette.paper,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: palette.hairline,
        overflow: 'hidden',
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: SPACE.sm,
          paddingLeft: SPACE.md,
          paddingRight: SPACE.xs,
        }}
      >
        <Icon name="file" size={18} color={palette.primaryDk} />
        <Text
          numberOfLines={1}
          accessibilityRole="header"
          style={[TYPE.label, { flex: 1, color: palette.ink, fontWeight: '600' }]}
        >
          {title}
        </Text>
        <Btn
          size="sm"
          variant="ghost"
          pill
          expanded={open}
          onPress={onToggle}
          accessibilityHint={t(open ? 'reading.hide_hint' : 'reading.show_hint')}
        >
          {t(open ? 'reading.hide' : 'reading.show')}
        </Btn>
      </View>
      {open ? (
        <ScrollView
          ref={scroll}
          testID="scroll-text"
          nestedScrollEnabled
          // Reachable by keyboard: a text that scrolls must be scrollable without a pointer
          // (axe `scrollable-region-focusable`; on the web this is tabIndex 0).
          focusable
          accessibilityLabel={title}
          style={{ maxHeight, borderTopWidth: 1, borderTopColor: palette.hairline }}
          // No right padding here: a tinted line reaches the panel's edge; the text keeps its
          // distance from it on its own (below).
          contentContainerStyle={{ paddingVertical: SPACE.sm }}
          accessibilityHint={t('reading.scroll_hint')}
        >
          {passage.lines.map((line, i) => {
            const n = i + 1;
            const lit = highlight !== null && n >= highlight.from && n <= highlight.to;
            return (
              <View
                key={n}
                accessibilityLabel={
                  line.trim() === '' ? undefined : `${t('reading.line', { n })}: ${line}`
                }
                style={{
                  flexDirection: 'row',
                  minHeight: LINE_HEIGHT,
                  backgroundColor: lit ? palette.primaryLt : 'transparent',
                }}
              >
                {/* The gutter: the line number on every fifth line, nothing else. */}
                <Text
                  accessibilityElementsHidden
                  importantForAccessibility="no"
                  style={{
                    width: 34,
                    paddingRight: SPACE.sm,
                    textAlign: 'right',
                    fontSize: 11,
                    lineHeight: LINE_HEIGHT,
                    color: lit ? palette.primaryDk : palette.ink2,
                    fontVariant: ['tabular-nums'],
                    fontWeight: lit ? '700' : '400',
                  }}
                >
                  {numbered(n) || lit ? n : ''}
                </Text>
                <Text
                  style={{
                    flex: 1,
                    paddingRight: SPACE.md,
                    fontSize: 15,
                    lineHeight: LINE_HEIGHT,
                    color: palette.ink,
                  }}
                >
                  {line}
                </Text>
              </View>
            );
          })}
        </ScrollView>
      ) : null}
    </View>
  );
}

/**
 * Where a closed question's answer stands, in words ("Im Text: Z. 6–8") — the tinted lines in the
 * text say it too, but never colour alone. A quiet reference chip with the text's icon, so it
 * reads as a pointer to the text above and not as one more grey line under Buddy's reply.
 */
export function EvidenceNote({ lines }: { lines: PassageLines }) {
  const { palette } = useTheme();
  const { t } = useTranslation('practice');
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACE.xs,
        paddingHorizontal: SPACE.sm,
        paddingVertical: SPACE.xs,
        borderRadius: 999,
        backgroundColor: palette.primaryLt,
      }}
    >
      <Icon name="file" size={14} color={palette.primaryDk} />
      <Text testID="evidence" style={[TYPE.small, { color: palette.primaryDk, fontWeight: '600' }]}>
        {lines.from === lines.to
          ? t('reading.evidence_one', { from: lines.from })
          : t('reading.evidence', { from: lines.from, to: lines.to })}
      </Text>
    </View>
  );
}
