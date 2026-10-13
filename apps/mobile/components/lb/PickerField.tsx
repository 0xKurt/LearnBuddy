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
import { Text } from 'react-native';
import { useTranslation } from 'react-i18next';

import { TYPE } from '../../lib/theme/type.js';
import { Btn } from './Btn.js';
import { Sheet, SHEET_TEXT } from './Sheet.js';
import { ChoiceOptions } from './ChoiceOptions.js';

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
        variant="secondary"
        // A full-width form value stays readable and can wrap. Native automatic fitting
        // shrank the selected region severely during keyboard review; md avoids that path.
        size="md"
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
        {body ? <Text style={[TYPE.small, SHEET_TEXT]}>{body}</Text> : null}
        <ChoiceOptions
          chosenAs="primary"
          unselectedVariant="secondary"
          showCheck={false}
          options={options}
          value={value}
          label={label}
          disabled={disabled}
          onChange={(next) => {
            onChange(next);
            setOpen(false);
          }}
        />
      </Sheet>
    </>
  );
}
