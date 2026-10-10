// The essay's writing view (issue #525, owner 09.10.: "sehr schmal. Nur wenig text geht rein"):
// her text over the sheet's full width and nearly the screen's height — at least twelve lines on
// a 390 × 844 phone, six with the keyboard up — the task as one line above it (a tap shows all of
// it), and the answer's "Prüfen" (`CheckBar`) pinned under it, above the keyboard (the sheet's
// footer, CLAUDE.md rule 15). Once her text is being checked the view closes (`TypedAnswer`).
// It is the same field as the bar's (`LbTextInput`, issue #365) on the same text: closing it loses
// nothing, the draft is the answer's own (`useDraft` on the practice screen).

import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';

import { useVisibleHeight } from '../../lib/useVisibleHeight.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { FieldCount } from '../lb/FieldCount.js';
import { LbTextInput, LINE } from '../lb/LbTextInput.js';
import { PressArea } from '../lb/PressArea.js';
import { Sheet, SHEET_MAX } from '../lb/Sheet.js';

/**
 * What the sheet takes besides the field's lines, in pt, read from Sheet.tsx and rounded up: its
 * handle and title (67), "Prüfen" and "Schließen" with the step between them (48 + 8 + 48), its
 * room at the bottom (8), the content's rhythm (2 × 14), the task's line (23) and the field's own
 * padding and frame (26).
 */
const CHROME = 270;
/** Never fewer lines than this (a tiny window), never more than this (a tablet). */
const ROWS = { min: 4, max: 24 } as const;

/** How many lines of her text the view shows in the height there is. */
export function writingRows(visible: number): number {
  const rows = Math.floor((visible * SHEET_MAX - CHROME) / LINE);
  return Math.min(ROWS.max, Math.max(ROWS.min, rows));
}

export function WritingSheet({
  visible,
  task,
  value,
  maxLength,
  onChange,
  check,
  onClose,
}: {
  visible: boolean;
  /** The question she writes about. */
  task: string;
  value: string;
  maxLength: number;
  onChange: (text: string) => void;
  /** The answer's "Prüfen" (`CheckBar`). */
  check: ReactNode;
  onClose: () => void;
}) {
  const { palette } = useTheme();
  const { t } = useTranslation(['practice', 'common']);
  const rows = writingRows(useVisibleHeight().visible);
  const [wholeTask, setWholeTask] = useState(false);
  return (
    <Sheet
      visible={visible}
      title={t('practice:essay.write_title')}
      closeLabel={t('common:actions.close')}
      onClose={onClose}
      footer={check}
    >
      <PressArea
        onPress={() => setWholeTask((was) => !was)}
        accessibilityRole="button"
        accessibilityLabel={task}
        accessibilityState={{ expanded: wholeTask }}
      >
        <Text
          numberOfLines={wholeTask ? undefined : 1}
          style={[TYPE.body, { color: palette.ink2 }]}
        >
          {task}
        </Text>
      </PressArea>
      <FieldCount length={value.length} max={maxLength} />
      <LbTextInput
        testID="answer-field"
        value={value}
        onChangeText={onChange}
        maxLength={maxLength}
        multiline
        rows={rows}
        maxRows={rows}
        accessibilityLabel={t('practice:answer.label')}
        placeholder={t('practice:answer.placeholder')}
        autoFocus
        autoCorrect={false}
        spellCheck={false}
        autoComplete="off"
        autoCapitalize="sentences"
        submitBehavior="newline"
      />
    </Sheet>
  );
}
