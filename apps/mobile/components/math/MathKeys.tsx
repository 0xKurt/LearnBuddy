// The row of insert keys under the answer field: exactly the keys this question needs (chosen
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
// The keys are the one key row of the practice screen (`components/lb/KeyRow.tsx`, issue #310
// step 4): the same key, line and paging as the note line's keys. This file only says which keys
// a question has and what each one does.

import { useTranslation } from 'react-i18next';

import { currentLocale } from '../../lib/i18n/index.js';
import { insertAtCursor, type Insertion, type Selection } from '../../lib/math/insert.js';
import {
  glyphOf,
  insertionOf,
  isModeKey,
  slotsOf,
  type KeyId,
  type ScriptMode,
} from '../../lib/math/keys.js';
import { KeyRow, type Key } from '../lb/KeyRow.js';

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
  const row = keys.map((id): Key => {
    if (id === 'newline')
      return {
        id,
        face: t('keys.newline_shown'),
        word: true,
        places: slotsOf(id),
        label: t('keys.newline'),
        // ↵ does something else than the others, so it says something else: the hint is where
        // a screen reader learns that this is how a path gets its next line.
        hint: t('keys.newline_hint'),
        onPress: () => onInsert(NEW_LINE),
      };
    if (isModeKey(id))
      return {
        id,
        face: glyphOf(id, decimal),
        on: mode === id,
        // On or off is said in the name: a button may not carry aria-selected (axe fails the
        // screen for it — components/practice/__tests__/FractionBarAnswer.test.tsx).
        label: mode === id ? `${t(`keys.${id}`)}, ${t('keys.mode_on')}` : t(`keys.${id}`),
        hint: t(`keys.${id}_hint`),
        onPress: () => onMode?.(mode === id ? null : id),
      };
    return {
      id,
      face: glyphOf(id, decimal),
      label: t(`keys.${id}`),
      hint: t('keys.hint'),
      onPress: () => onInsert(insertionOf(id, decimal)),
    };
  });
  return (
    <KeyRow
      testID="math-keys"
      keys={row}
      label={t(chemistry ? 'keys.row_chem' : 'keys.row')}
      // The row is only there while the field has focus (issue #16): a key may not take it.
      keepsFocus
      disabled={disabled}
    />
  );
}
