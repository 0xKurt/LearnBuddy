// The row of insert keys above the answer field: exactly the keys this question needs (chosen
// by code from the question, lib/math/keys.ts — issue #239), on ONE line that never scrolls
// sideways. When more keys are needed than fit, the last place holds "…", which turns to the
// next keys (issue #286 finding 5: the old row was cut off at the right and slid sideways, so
// half of it was keys she did not know were there).
//
// Three kinds of key:
//   - a character key writes at the cursor ("/", "=", "→" …); the characters are ones the
//     checks read (packages/shared-math typographicToAscii, apps/api/.../chemistry.ts);
//   - a mode key (xⁿ, x₂, x⁺⁻) raises or lowers the digits she types next on the phone's own
//     keyboard. It stays lit while it is on, says so to a screen reader, and goes out by
//     itself when she types anything the mode does not take — a letter, a space. Lit is
//     never the only signal: its name says "eingeschaltet" while it is on;
//   - "↵ Neue Zeile" starts the next line of a written calculation path (issue #221). It
//     carries a word, not only the glyph: "↵" alone is a symbol a child has to know.
//     A cell of a table takes one line, so the table never offers it (TableAnswer.tsx).
//
// All keys of a line are the same width and fill it edge to edge, so the row reads as one
// calm strip rather than a ragged list; each is at least 44 × 44 pt (TOUCH).

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import { currentLocale } from '../../lib/i18n/index.js';
import { KEEPS_FOCUS } from '../../lib/keepsFocus.js';
import { insertAtCursor, type Insertion, type Selection } from '../../lib/math/insert.js';
import {
  glyphOf,
  insertionOf,
  isModeKey,
  KEY_GAP,
  pagesOf,
  slotsIn,
  slotsOf,
  type KeyId,
  type ScriptMode,
} from '../../lib/math/keys.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { SHADOW } from '../../lib/theme/shadow.js';
import { TOUCH } from '../../lib/theme/space.js';

/** The row on the narrowest phone the app is made for: 360 pt less the bar's two 16 pt sides. */
const NARROW_ROW = 328;

export { insertAtCursor, type Insertion, type Selection };

/** What the "neue Zeile" key inserts: the line break steps.ts splits a path at. */
const NEW_LINE: Insertion = { text: '\n' };

type Props = {
  /** The keys this question needs (lib/math/keys.ts); an empty list draws nothing. */
  keys: readonly KeyId[];
  onInsert: (insertion: Insertion) => void;
  /** The raise/lower mode that is on, and how a mode key turns it on or off. */
  mode?: ScriptMode | null;
  onMode?: (mode: ScriptMode | null) => void;
  disabled?: boolean;
  /** Chemistry keys: the row is named "Chemie-Zeichen" for a screen reader, else "Mathe-Zeichen". */
  chemistry?: boolean;
};

export function MathKeys({
  keys,
  onInsert,
  mode = null,
  onMode,
  disabled = false,
  chemistry = false,
}: Props) {
  const { t } = useTranslation('math');
  const decimal = currentLocale() === 'en' ? '.' : ',';
  const [width, setWidth] = useState(0);
  const [page, setPage] = useState(0);
  // Until the row is measured it plans for the narrowest phone (328 pt of row at 360 wide).
  const row = width > 0 ? width : NARROW_ROW;
  const fits = slotsIn(row);
  const all = keys.reduce((n, id) => n + slotsOf(id), 0);
  // A row that nearly fills the line fills it: six keys on a seven-place line share the whole
  // width instead of leaving a hole at the right. A short row (three keys) keeps its size.
  const slots = all <= fits && all >= fits - 1 ? all : fits;
  // One place's width; a key of n places spans n places and the n − 1 gaps between them, so a
  // two-place key lines up exactly with two one-place keys.
  const cell = (row - KEY_GAP * (slots - 1)) / slots;
  const widthOf = (places: number) => Math.floor(places * cell + (places - 1) * KEY_GAP);
  const pages = pagesOf(keys, slots);
  const signature = keys.join(' ');
  // Another question, another row: it starts on its first page.
  useEffect(() => setPage(0), [signature]);
  if (keys.length === 0) return null;
  const shown = pages[Math.min(page, pages.length - 1)] ?? [];
  const more = pages.length > 1;

  return (
    <View
      testID="math-keys"
      accessibilityRole="toolbar"
      accessibilityLabel={t(chemistry ? 'keys.row_chem' : 'keys.row')}
      onLayout={(e) => setWidth(Math.floor(e.nativeEvent.layout.width))}
      style={{ flexDirection: 'row', gap: KEY_GAP, paddingVertical: 2, minHeight: TOUCH + 4 }}
    >
      {shown.map((id) =>
        id === 'newline' ? (
          <MathKey
            key={id}
            width={widthOf(slotsOf(id))}
            disabled={disabled}
            accessibilityLabel={t('keys.newline')}
            // ↵ does something else than the others, so it says something else: the hint is
            // where a screen reader learns that this is how a path gets its next line.
            accessibilityHint={t('keys.newline_hint')}
            onPress={() => onInsert(NEW_LINE)}
            word
          >
            {t('keys.newline_shown')}
          </MathKey>
        ) : isModeKey(id) ? (
          <MathKey
            key={id}
            width={widthOf(1)}
            disabled={disabled}
            selected={mode === id}
            // On or off is said in the name: a button may not carry aria-selected (axe fails the
            // screen for it — components/practice/__tests__/FractionBarAnswer.test.tsx).
            accessibilityLabel={
              mode === id ? `${t(`keys.${id}`)}, ${t('keys.mode_on')}` : t(`keys.${id}`)
            }
            accessibilityHint={t(`keys.${id}_hint`)}
            onPress={() => onMode?.(mode === id ? null : id)}
          >
            {glyphOf(id, decimal)}
          </MathKey>
        ) : (
          <MathKey
            key={id}
            width={widthOf(1)}
            disabled={disabled}
            accessibilityLabel={t(`keys.${id}`)}
            accessibilityHint={t('keys.hint')}
            onPress={() => onInsert(insertionOf(id, decimal))}
          >
            {glyphOf(id, decimal)}
          </MathKey>
        ),
      )}
      {/* A short page leaves its places empty, so "…" stays at the right edge on every page. */}
      {more ? <View style={{ flex: 1, marginLeft: -KEY_GAP }} /> : null}
      {more ? (
        <MathKey
          width={widthOf(1)}
          disabled={disabled}
          accessibilityLabel={t('keys.more')}
          accessibilityHint={t('keys.more_hint')}
          onPress={() => setPage((p) => (p + 1) % pages.length)}
          quiet
        >
          …
        </MathKey>
      ) : null}
    </View>
  );
}

/**
 * One key. The shadow sits on an outer View (a clipped Pressable would cut it off); the
 * Pressable holds no background, the inner View shows the press and a lit mode.
 */
function MathKey({
  children,
  width,
  accessibilityLabel,
  accessibilityHint,
  onPress,
  disabled,
  selected,
  word = false,
  quiet = false,
}: {
  children: string;
  /** The key's width: its places of the line (lib/math/keys.ts slotsOf) and the gaps between. */
  width: number;
  /** A key that says a word ("↵ Neue Zeile") is set at body size, not at the glyphs' size. */
  word?: boolean;
  /** The "…" key: the same shape, a lighter face — it turns the page, it writes nothing. */
  quiet?: boolean;
  /** A mode key that is on: filled (its name says "eingeschaltet" — colour is never the only signal). */
  selected?: boolean;
  /** What a screen reader says ("hoch 2"), never just the glyph. */
  accessibilityLabel: string;
  accessibilityHint: string;
  onPress: () => void;
  disabled: boolean;
}) {
  const { palette } = useTheme();
  const on = selected === true;
  return (
    <View
      style={[
        {
          width,
          borderRadius: TOUCH / 2,
          backgroundColor: on ? palette.primary : quiet ? palette.lavender : palette.paper,
          opacity: disabled ? 0.6 : 1,
        },
        quiet ? null : SHADOW.soft,
      ]}
    >
      <Pressable
        // The row is only there while the field has focus, so a key that takes the focus away
        // hides itself mid-tap — in the browser, where nothing else holds it (issue #271).
        {...KEEPS_FOCUS}
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ disabled }}
        android_ripple={{ color: 'rgba(0,0,0,0.08)', borderless: false }}
        style={{ borderRadius: TOUCH / 2, overflow: 'hidden' }}
      >
        {({ pressed }) => (
          <View
            style={{
              height: TOUCH,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: TOUCH / 2,
              backgroundColor: pressed && !on ? palette.lavender : 'transparent',
            }}
          >
            <Text
              numberOfLines={1}
              style={{
                color: on ? palette.paper : palette.primaryDk,
                fontSize: word ? 14 : 19,
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
