// A row that shows what is set and opens the few choices for it (components/core/List.jsx `Row`
// with a value and a chevron): the language, the Bundesland, a time. The choices live in the
// shared sheet with its own way out (CLAUDE.md rule 14) — a short pick, not a page of its own.
// A tap picks and closes; saving, and saying what went wrong, is the caller's.

import { useState } from 'react';
import { Text } from 'react-native';
import { useTranslation } from 'react-i18next';

import { TYPE } from '../../lib/theme/type.js';
import { ChoiceOptions } from '../lb/ChoiceOptions.js';
import type { IconName } from '../lb/Icon.js';
import { Row } from '../lb/ListGroup.js';
import { Sheet, SHEET_TEXT } from '../lb/Sheet.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';

type Props<T extends string> = {
  title: string;
  icon?: IconName;
  /** What is set now, at the row's end. */
  value: string;
  /** The sheet's headline; the row's title when the question needs no other words. */
  question?: string;
  /** Why it is asked — inside the sheet, where the answer is given. */
  body?: string;
  options: ReadonlyArray<{ value: T; label: string }>;
  selected: T | null;
  onChange: (value: T) => void;
  disabled?: boolean;
  /** False while the page is not in front: an open sheet goes with it. */
  active?: boolean;
};

export function ChoiceRow<T extends string>({
  title,
  icon,
  value,
  question,
  body,
  options,
  selected,
  onChange,
  disabled = false,
  active = true,
}: Props<T>) {
  useTheme();
  const { t } = useTranslation('common');
  const [open, setOpen] = useState(false);
  return (
    <>
      <Row
        title={title}
        icon={icon}
        value={value}
        disabled={disabled}
        onPress={() => setOpen(true)}
      />
      <Sheet
        visible={open && active}
        title={question ?? title}
        closeLabel={t('actions.close')}
        onClose={() => setOpen(false)}
        // Sixteen Bundesländer are a list she browses: it may scroll, and says so by name.
        scrollTestID="scroll-list"
      >
        {body ? <Text style={[TYPE.small, SHEET_TEXT]}>{body}</Text> : null}
        <ChoiceOptions
          options={options}
          value={selected}
          label={title}
          disabled={disabled}
          onChange={(next) => {
            setOpen(false);
            if (next !== selected) onChange(next);
          }}
        />
      </Sheet>
    </>
  );
}
