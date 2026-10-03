// One row of keys (issue #310 step 4): the keys under what she is answering — the math and
// chemistry keys under a field or a table's cell (issue #239), the note line's keys under the
// staff she writes on (issue #275). Before this the math row and the note line each built their
// own keys, one as paper keys on a shadow, the other as outlined pills; the same kind of thing
// looked like two. Now there is one key, one line and one way to page, and a form only says
// WHICH keys and what they do. It stands in the answer shell's `keys` slot
// (components/practice/AnswerShell.tsx), so it is always in the same place.
//
// The line (lib/keyRow.ts): never sideways, equal places, each ≥ TOUCH; when the keys do not fit,
// the last place is "…" and turns to the next page.
//
// A key:
//   · writes or does something — paper, a soft shadow, the sign in the accent;
//   · is a switch (`on`: a raise/lower mode, the sharp, the dot) — lit while it is on, and its
//     name says so (the caller's label: "Kreuz ♯, ist an"), colour is never the only signal;
//   · is one of a choice (`selected`, in a row with `role="radiogroup"`: the note values) — lit,
//     and a radio with `aria-checked`;
//   · is quiet (`quiet`: "…", "Zurück") — the same shape on the lavender ground without the
//     shadow: it changes nothing she wrote.
//
// Built here because a raw Pressable belongs in components/lb (CLAUDE.md rule 13, Engineering-
// Regel 2) and neither <Btn> nor <PadKey> is a key of a paged row that must not take the focus.

import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import { KEEPS_FOCUS } from '../../lib/keepsFocus.js';
import { KEY_GAP, keyWidth, NARROW_ROW, pagesOf, placesOnLine, slotsIn } from '../../lib/keyRow.js';
import { SHADOW } from '../../lib/theme/shadow.js';
import { TOUCH } from '../../lib/theme/space.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { MAX_FONT_SCALE } from './Btn.js';

export type Key = {
  /** Stable within the row. */
  id: string;
  /** A sign ("/", "x²"), a word ("↵ Neue Zeile") or a drawn glyph in the colour it is given. */
  face: string | ((color: string) => ReactNode);
  /** The face is a word: set at caption size, not at the signs' size. */
  word?: boolean;
  /** How many places of the line it takes (a word: two). */
  places?: number;
  /** What a screen reader says ("hoch 2", "Kreuz ♯, ist an"), never the sign alone. */
  label: string;
  hint?: string;
  onPress: () => void;
  /** A switch that is on. */
  on?: boolean;
  /** One of a choice (`role="radiogroup"`): chosen or not. */
  selected?: boolean;
  /** Changes nothing she wrote ("…", "Zurück"): the quieter face. */
  quiet?: boolean;
  disabled?: boolean;
};

type Props = {
  keys: readonly Key[];
  /** The row's name for a screen reader ("Mathe-Zeichen", "Notenwert"). */
  label: string;
  /** A toolbar of actions, or a choice of one. */
  role?: 'toolbar' | 'radiogroup';
  /** Span the whole line whatever it holds (a row under a drawing of the same width). */
  fill?: boolean;
  /** The row stands under a field she types in: a key must not take the focus (issue #271). */
  keepsFocus?: boolean;
  disabled?: boolean;
  testID?: string;
};

export function KeyRow({
  keys,
  label,
  role = 'toolbar',
  fill = false,
  keepsFocus = false,
  disabled = false,
  testID,
}: Props) {
  const { t } = useTranslation('math');
  const [width, setWidth] = useState(0);
  const [page, setPage] = useState(0);
  // Until the row is measured it plans for the narrowest phone.
  const row = width > 0 ? width : NARROW_ROW;
  const fits = slotsIn(row);
  const placesOf = (key: Key) => key.places ?? 1;
  const slots = placesOnLine(
    keys.reduce((n, key) => n + placesOf(key), 0),
    fits,
    fill,
  );
  const pages = pagesOf(keys, slots, placesOf);
  const signature = keys.map((key) => key.id).join(' ');
  // Another set of keys (another question): the row starts on its first page.
  useEffect(() => setPage(0), [signature]);
  if (keys.length === 0) return null;
  const shown = pages[Math.min(page, pages.length - 1)] ?? [];
  const more = pages.length > 1;

  return (
    <View
      testID={testID}
      accessibilityRole={role}
      accessibilityLabel={label}
      onLayout={(e) => setWidth(Math.floor(e.nativeEvent.layout.width))}
      style={{
        flexDirection: 'row',
        gap: KEY_GAP,
        // token-exempt: the keys' soft shadow needs this much room, or the row's edge cuts it
        paddingVertical: 2,
        minHeight: TOUCH + 4,
      }}
    >
      {shown.map((key) => (
        <OneKey
          key={key.id}
          k={key}
          width={keyWidth(row, slots, placesOf(key))}
          disabled={disabled || key.disabled === true}
          keepsFocus={keepsFocus}
        />
      ))}
      {/* A short page leaves its places empty, so "…" stays at the right edge on every page. */}
      {more ? <View style={{ flex: 1, marginLeft: -KEY_GAP }} /> : null}
      {more ? (
        <OneKey
          k={{
            id: 'more',
            face: '…',
            label: t('keys.more'),
            hint: t('keys.more_hint'),
            quiet: true,
            onPress: () => setPage((p) => (p + 1) % pages.length),
          }}
          width={keyWidth(row, slots, 1)}
          disabled={disabled}
          keepsFocus={keepsFocus}
        />
      ) : null}
    </View>
  );
}

/**
 * One key. The shadow sits on an outer View (a clipped Pressable would cut it off); the
 * Pressable holds no background, the inner View shows the press and a lit key.
 */
function OneKey({
  k,
  width,
  disabled,
  keepsFocus,
}: {
  k: Key;
  width: number;
  disabled: boolean;
  keepsFocus: boolean;
}) {
  const { palette } = useTheme();
  const lit = k.on === true || k.selected === true;
  const quiet = k.quiet === true && !lit;
  const ink = lit ? palette.paper : disabled ? palette.ink2 : palette.primaryDk;
  // A pill: its corner is half its height.
  const round = TOUCH / 2;
  return (
    <View
      style={[
        {
          width,
          borderRadius: round,
          backgroundColor: lit ? palette.primary : quiet ? palette.lavender : palette.paper,
          opacity: disabled ? 0.6 : 1,
        },
        quiet || disabled ? null : SHADOW.soft,
      ]}
    >
      <Pressable
        {...(keepsFocus ? KEEPS_FOCUS : {})}
        onPress={k.onPress}
        disabled={disabled}
        accessibilityRole={k.selected === undefined ? 'button' : 'radio'}
        accessibilityLabel={k.label}
        accessibilityHint={k.hint}
        accessibilityState={{
          disabled,
          ...(k.selected === undefined ? {} : { selected: k.selected, checked: k.selected }),
        }}
        // A radio says whether it is chosen; on the web `accessibilityState.checked` alone does
        // not become `aria-checked` (axe: aria-required-attr, issue #73).
        {...(k.selected === undefined ? {} : { 'aria-checked': k.selected })}
        android_ripple={{ color: palette.lavender, borderless: false }}
        style={{ borderRadius: round, overflow: 'hidden' }}
      >
        {({ pressed }) => (
          <View
            style={{
              height: TOUCH,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: round,
              backgroundColor: pressed && !lit ? palette.lavender : 'transparent',
            }}
          >
            {typeof k.face === 'string' ? (
              <Text
                numberOfLines={1}
                maxFontSizeMultiplier={MAX_FONT_SCALE}
                style={[k.word ? TYPE.caption : TYPE.title, { color: ink, fontWeight: '600' }]}
              >
                {k.face}
              </Text>
            ) : (
              k.face(ink)
            )}
          </View>
        )}
      </Pressable>
    </View>
  );
}
