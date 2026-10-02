// A row of insert keys above the answer field for math questions: fraction
// bar, squared, cubed, root, π, times, minus, brackets, degrees and the
// decimal separator. Phone keyboards hide most of these; one tap here puts
// them at the cursor. The characters are ones the answer check reads
// (packages/shared-math typographicToAscii).
//
// The keys are soft and round (white on a soft shadow, the "Pastell Soft"
// look of the composer below them), at least 44 × 44 pt.
//
// `newline` puts "↵ Neue Zeile" first in the row (issue #221): the way to write a
// calculation path line by line, which the API checks step by step (issue #209). It is
// first because the row scrolls sideways and the last keys are off a small phone, and it
// carries a word, not only the glyph — "↵" alone is a symbol a child has to know.

import { useTranslation } from 'react-i18next';
import { Platform, Pressable, ScrollView, Text, View, type ViewProps } from 'react-native';

import { currentLocale } from '../../lib/i18n/index.js';
import { insertAtCursor, type Insertion, type Selection } from '../../lib/math/insert.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { SHADOW } from '../../lib/theme/shadow.js';

export { insertAtCursor, type Insertion, type Selection };

type Key = { id: string; shown: string; insert: Insertion };

function mathKeys(): Key[] {
  const decimal = currentLocale() === 'en' ? '.' : ',';
  return [
    { id: 'fraction', shown: '/', insert: { text: '/' } },
    { id: 'squared', shown: 'x²', insert: { text: '²' } },
    { id: 'cubed', shown: 'x³', insert: { text: '³' } },
    // The cursor lands inside the brackets: "√(|)".
    { id: 'sqrt', shown: '√', insert: { text: '√()', caret: 2 } },
    { id: 'pi', shown: 'π', insert: { text: 'π' } },
    { id: 'times', shown: '·', insert: { text: '·' } },
    // Shown as a real minus sign, typed as the plain one every checker reads.
    { id: 'minus', shown: '−', insert: { text: '-' } },
    { id: 'open', shown: '(', insert: { text: '(' } },
    { id: 'close', shown: ')', insert: { text: ')' } },
    { id: 'degree', shown: '°', insert: { text: '°' } },
    { id: 'decimal', shown: decimal, insert: { text: decimal } },
  ];
}

/**
 * In the browser a press on a key first takes the focus from the answer field — the field
 * reports a blur, the row (which only shows while the field has focus) goes away under the
 * pointer, and the press lands on nothing (issue #221; on the phone `keyboardShouldPersistTaps`
 * keeps the focus). Declining the mousedown keeps the focus where she types; the press itself
 * still arrives. React Native's types do not know the web-only handler.
 */
const KEEP_FOCUS: ViewProps =
  Platform.OS === 'web'
    ? ({
        onMouseDown: (e: { preventDefault: () => void }) => e.preventDefault(),
      } as unknown as ViewProps)
    : {};

/** What the "neue Zeile" key inserts: the line break steps.ts splits a path at. */
const NEW_LINE: Insertion = { text: '\n' };

type Props = {
  onInsert: (insertion: Insertion) => void;
  disabled?: boolean;
  /** Offer the "neue Zeile" key: the answer may be a written path. */
  newline?: boolean;
};

export function MathKeys({ onInsert, disabled = false, newline = false }: Props) {
  const { t } = useTranslation('math');
  return (
    <View {...KEEP_FOCUS}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        // A tap on a key must not close the keyboard first.
        keyboardShouldPersistTaps="always"
        accessibilityRole="toolbar"
        accessibilityLabel={t('keys.row')}
        // Room around the keys, so their soft shadow is not cut off by the scroll view.
        contentContainerStyle={{ gap: 8, paddingVertical: 6, paddingHorizontal: 4 }}
      >
        {newline ? (
          <MathKey
            disabled={disabled}
            accessibilityLabel={t('keys.newline')}
            accessibilityHint={t('keys.newline_hint')}
            onPress={() => onInsert(NEW_LINE)}
            word
          >
            {t('keys.newline_shown')}
          </MathKey>
        ) : null}
        {mathKeys().map((k) => (
          <MathKey
            key={k.id}
            disabled={disabled}
            accessibilityLabel={t(`keys.${k.id}`)}
            accessibilityHint={t('keys.hint')}
            onPress={() => onInsert(k.insert)}
          >
            {k.shown}
          </MathKey>
        ))}
      </ScrollView>
    </View>
  );
}

const KEY = 44;

/**
 * One round key. The shadow sits on an outer View (a clipped Pressable would
 * cut it off); the Pressable holds no background, the inner View shows the press.
 */
function MathKey({
  children,
  accessibilityLabel,
  accessibilityHint,
  onPress,
  disabled,
  word = false,
}: {
  children: string;
  /** A key that says a word ("↵ Neue Zeile") is set at body size, not at the glyphs' size. */
  word?: boolean;
  /** What a screen reader says ("hoch 2"), never just the glyph. */
  accessibilityLabel: string;
  accessibilityHint: string;
  onPress: () => void;
  disabled: boolean;
}) {
  const { palette } = useTheme();
  return (
    <View
      style={[
        { borderRadius: KEY / 2, backgroundColor: palette.paper, opacity: disabled ? 0.6 : 1 },
        SHADOW.soft,
      ]}
    >
      <Pressable
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ disabled }}
        android_ripple={{ color: 'rgba(0,0,0,0.08)', borderless: false }}
        style={{ borderRadius: KEY / 2, overflow: 'hidden' }}
      >
        {({ pressed }) => (
          <View
            style={{
              minWidth: KEY,
              height: KEY,
              paddingHorizontal: 12,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: KEY / 2,
              backgroundColor: pressed ? palette.lavender : 'transparent',
            }}
          >
            <Text
              style={{
                color: palette.primaryDk,
                fontSize: word ? 15 : 19,
                lineHeight: word ? 20 : 24,
                fontWeight: '600',
              }}
            >
              {children}
            </Text>
          </View>
        )}
      </Pressable>
    </View>
  );
}
