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
// (`CheckBar`). A conversation's big mic is not in the bar: it replaces it (`VoiceRow`).
//
// Every practice form holds this bar (issue #395, report #388 §9: one bar, the same in every
// task). A typed answer is written in its field; on every other form — options, a board, the
// note line, the fraction bar — the field is her question to the tutor ("Frag zur Aufgabe …",
// issue #402), with the form's "Prüfen" in the action slot until she types one.

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

/** What stands in the bar around her text: the same with and without the field. */
type Controls = {
  /** What she says, written into the field (and its status line); none: no voice here. */
  voice?: VoiceInput;
  /** The mic's name for a screen reader ("Nachricht sprechen", "Antwort sagen"). */
  micLabel?: string;
  /** False: no mic in the pill (a Diktat: the recogniser would spell for her). */
  mic?: boolean;
  /** Takes the mic's place while the mic is idle ("Senden", "Stopp", "Prüfen"); null: the mic stays. */
  action?: ReactNode;
  /** After the mic or action, at the pill's end (the chat's conversation mode). */
  after?: ReactNode;
  /** Above the pill: what goes with the text (the pages she attached). */
  above?: ReactNode;
  disabled?: boolean;
};

type Props = Controls &
  Omit<LbTextInputProps, 'variant' | 'multiline' | 'rows' | 'end'> & {
    value: string;
    maxLength: number;
    /** A unit, beside the text ("cm"). */
    unit?: string | null;
    /**
     * The placeholder stays beside the action (issue #402): a board's "Prüfen" is not about the
     * field's text, and "Frag zur Aufgabe …" is the one thing that says what the field is for.
     */
    keepPlaceholder?: boolean;
  };

export const InputBar = forwardRef<LbTextInputRef, Props>(function InputBar(props, ref) {
  const {
    voice,
    micLabel = '',
    mic = true,
    action = null,
    after = null,
    above = null,
    disabled = false,
  } = props;
  const { palette } = useTheme();
  const { t } = useTranslation('common');
  const idle = voice === undefined || voice.state === 'idle';
  const control =
    action !== null && idle ? (
      action
    ) : mic && voice ? (
      <MicButton voice={voice} size="sm" label={micLabel} disabled={disabled} />
    ) : null;
  const {
    value,
    maxLength,
    unit = null,
    keepPlaceholder = false,
    voice: _voice,
    micLabel: _micLabel,
    mic: _mic,
    action: _action,
    after: _after,
    above: _above,
    disabled: _disabled,
    ...field
  } = props;
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
        // An empty field next to an action says nothing (issue #394): "Senden" or "Stopp" takes
        // more of the pill than the mic, and at 360 "Schreib Buddy …" broke onto a second line
        // beside it — the empty bar two lines high. The action says what comes next; the field
        // keeps its name for a screen reader (`accessibilityLabel`). With the mic at the end the
        // placeholder has its room back.
        placeholder={
          !keepPlaceholder && control !== null && control === action && value === ''
            ? undefined
            : field.placeholder
        }
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
