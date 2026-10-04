// The one input bar (issue #365): free text to Buddy in the chat and every typed answer on the
// practice screen ("Erklär mal", a short or long answer, a Diktat) are typed into this bar, at the
// bottom of the screen, in the screen's `BottomBar`. Before it the chat had its pill and practice
// a field of its own that stood under the question and floated in the middle of the screen once
// Buddy had answered ("Wieso fliegt dieses Antwort Feld da oben rum", owner 04.10.).
//
// One pill (`LbTextInput`, variant bar): what goes before the text (the chat's +), the text, a
// unit, and at the end the mic — or, once there is something to send, the action that takes its
// place (the chat's "Senden", "Stopp" while Buddy writes). The mic is a soft circle: the filled
// control is the screen's main one (the chat's conversation mode, "Senden", "Prüfen"), and two
// filled circles side by side read as two main actions. The line above the pill says what the
// mic is doing, and the count shows only when the end of the field is near (#133 position 17).
//
// What the bar sends and how is its screen's: the chat sends, practice checks with "Prüfen"
// right under it (`CheckBar`). Voice mode's big mic is the screen's as well.

import { forwardRef, type ReactNode } from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { SPACE } from '../../lib/theme/space.js';
import { TYPE } from '../../lib/theme/type.js';
import { MicButton, MicStatus } from '../voice/MicButton.js';
import type { VoiceInput } from '../voice/useVoiceInput.js';
import { LbTextInput, type LbTextInputProps, type LbTextInputRef } from './LbTextInput.js';

/** The count appears this close to the end, not before: a permanent 0/2000 is noise. */
const COUNT_WITHIN = 200;

type Props = Omit<LbTextInputProps, 'variant' | 'multiline' | 'rows' | 'end'> & {
  value: string;
  maxLength: number;
  /** What she says, written into the field (and its status line); none: no voice here. */
  voice?: VoiceInput;
  /** The mic's name for a screen reader ("Nachricht sprechen", "Antwort sagen"). */
  micLabel?: string;
  /** False: no mic in the pill (a Diktat; voice mode, where the big mic is the screen's). */
  mic?: boolean;
  /** Takes the mic's place while the mic is idle ("Senden", "Stopp"); null: the mic stays. */
  action?: ReactNode;
  /** After the mic or action, at the pill's end (the chat's conversation mode). */
  after?: ReactNode;
  /** A unit, beside the text ("cm"). */
  unit?: string | null;
  /** Above the pill: what goes with the text (the pages she attached). */
  above?: ReactNode;
  disabled?: boolean;
};

export const InputBar = forwardRef<LbTextInputRef, Props>(function InputBar(
  {
    value,
    maxLength,
    voice,
    micLabel = '',
    mic = true,
    action = null,
    after = null,
    unit = null,
    above = null,
    disabled = false,
    ...field
  },
  ref,
) {
  const { palette } = useTheme();
  const { t } = useTranslation('common');
  const idle = voice === undefined || voice.state === 'idle';
  const control =
    action !== null && idle ? (
      action
    ) : mic && voice ? (
      <MicButton voice={voice} size="sm" label={micLabel} disabled={disabled} />
    ) : null;
  return (
    <>
      {voice ? <MicStatus voice={voice} /> : null}
      {above}
      {value.length >= maxLength - COUNT_WITHIN ? (
        <Text
          accessibilityLiveRegion="polite"
          style={[
            TYPE.label,
            {
              color: value.length >= maxLength ? palette.danger : palette.ink2,
              alignSelf: 'flex-end',
              marginRight: SPACE.sm,
            },
          ]}
        >
          {value.length >= maxLength
            ? t('field.full')
            : t('field.remaining', { count: maxLength - value.length })}
        </Text>
      ) : null}
      <LbTextInput
        ref={ref}
        {...field}
        variant="bar"
        value={value}
        maxLength={maxLength}
        multiline
        end={
          <>
            {unit ? (
              <Text
                accessibilityElementsHidden
                importantForAccessibility="no"
                style={[
                  TYPE.body,
                  { color: palette.ink2, alignSelf: 'center', paddingHorizontal: SPACE.xs },
                ]}
              >
                {unit}
              </Text>
            ) : null}
            {/* Their own row with their own gap: the pill's is 2 (the text carries its padding),
                too tight between two round controls (owner 01.10., issue #187). Empty, the row
                still keeps the text off the pill's edge. */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'flex-end',
                gap: SPACE.sm,
                minWidth: SPACE.sm,
              }}
            >
              {control}
              {after}
            </View>
          </>
        }
      />
    </>
  );
});
