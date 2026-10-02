// One of many, where "many" is too many for a <Segmented> row (issue #199: sixteen
// Bundesländer). The closed field is a single line she taps; the choices live in a sheet.
//
// Why a sheet and not sixteen rows on the screen: CLAUDE.md rule 16 — a screen must fit a
// 390×844 and a 360×740 phone without scrolling, and a form of sixteen options is neither
// calm nor reachable. A list she opened on purpose may scroll (tests/web/fit.ts allows
// "scroll-list"), and the sheet brings its own visible way out (rule 14, Sheet.tsx).
//
// The reason the question is asked goes in `body`, inside the sheet: it is shown where the
// answer is given, not as a permanent line on the form. A child who is asked something
// without a reason learns to answer questions without a reason.

import { useState } from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { TYPE } from '../../lib/theme/type.js';
import { SPACE } from '../../lib/theme/space.js';
import { Btn } from './Btn.js';
import { Sheet } from './Sheet.js';

/**
 * A required picker has an answer. The screen's CTA waits on this (app/profile.tsx): nothing
 * defaults to the first option and nothing is guessed, because a guessed Bundesland is worse
 * than none — it makes Buddy teach a rule that is wrong in her class test (issue #199).
 */
export function picked<T extends string>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

type Props<T extends string> = {
  /** What the field is ("Bundesland"); a screen reader hears it with the value. */
  label: string;
  /** On the closed field while nothing is chosen ("Bundesland wählen"). */
  placeholder: string;
  /** The sheet's headline: the question itself. */
  title: string;
  /** Why it is asked — one or two sentences inside the sheet. */
  body?: string;
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T | null;
  onChange: (value: T) => void;
  disabled?: boolean;
};

export function PickerField<T extends string>({
  label,
  placeholder,
  title,
  body,
  options,
  value,
  onChange,
  disabled = false,
}: Props<T>) {
  const { t } = useTranslation('common');
  const [open, setOpen] = useState(false);
  const chosen = options.find((o) => o.value === value) ?? null;

  return (
    <>
      <Btn
        variant="outline"
        // sm, so the one added row costs 44 pt — the touch minimum, never less (TOUCH in
        // space.ts) — and a long name shrinks on one line instead of growing the button
        // onto a second (Btn: sm = numberOfLines 1 + adjustsFontSizeToFit).
        size="sm"
        full
        icon="book"
        disabled={disabled}
        expanded={open}
        // The value alone on the field, the field's name in the spoken label: "Bundesland:
        // Niedersachsen" would not fit one line on a 360 pt phone for every state.
        accessibilityLabel={chosen ? `${label}: ${chosen.label}` : placeholder}
        onPress={() => setOpen(true)}
      >
        {chosen ? chosen.label : placeholder}
      </Btn>
      <Sheet
        visible={open}
        title={title}
        closeLabel={t('actions.close')}
        onClose={() => setOpen(false)}
        // The sixteen are a list she browses: it may scroll, and it says so by name.
        scrollTestID="scroll-list"
      >
        {body ? <Text style={TYPE.small}>{body}</Text> : null}
        <View accessibilityRole="radiogroup" style={{ gap: SPACE.sm }}>
          {options.map((o) => (
            <Btn
              key={o.value}
              variant={o.value === value ? 'primary' : 'outline'}
              size="md"
              full
              // Reads as a radio button and says whether it is the chosen one — never the
              // violet fill alone (CLAUDE.md §Design system).
              selected={o.value === value}
              onPress={() => {
                onChange(o.value);
                setOpen(false);
              }}
            >
              {o.label}
            </Btn>
          ))}
        </View>
      </Sheet>
    </>
  );
}
