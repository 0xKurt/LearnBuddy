// The one input bar (issue #365): free text to Buddy in the chat and every typed answer on the
// practice screen ("Erklär mal", a short or long answer, a Diktat) are typed into this bar, at the
// bottom of the screen, in the screen's `BottomBar`. Before it the chat had its pill and practice
// a field of its own that stood under the question and floated in the middle of the screen once
// Buddy had answered ("Wieso fliegt dieses Antwort Feld da oben rum", owner 04.10.).
//
// One box (`LbTextInput`, variant bar), built like the Claude app's (owner 09.10., issue #522): her
// text on top over the full width, and under it one row of tools — on the left what goes before
// (the chat's +, the camera) and the answer's unit as a chip; on the right the mic and one filled
// circle: the waveform into a conversation, or, once there is something to send, the action in its
// place (the chat's round send arrow, "Stopp" while Buddy writes, "Prüfen"). The mic is a soft
// circle: two filled circles side by side read as two main actions. The line above the box says
// what the mic is doing, and the count shows only when the end of the field is near (#133
// position 17). Before #522 all of it stood in one line beside the text, and a "Senden" pill left
// her text a narrow column.
//
// What the bar sends and how is its screen's: the chat sends, practice checks with "Prüfen"
// (`CheckBar`). A conversation's big mic is not in the bar: it replaces it (`VoiceRow`).
//
// Every practice form holds this bar (issue #395, report #388 §9: one bar, the same in every
// task). A typed answer is written in its field; on every other form — options, a board, the
// note line, the fraction bar — the field is her question to the tutor ("Frag zur Aufgabe …",
// issue #402), with the form's "Prüfen" in the action slot until she types one.
//
// A long text (issue #258) is typed into the same bar, `tall`: a small page of three lines. While
// she writes it grows further before it scrolls in itself — less far while the keyboard is up
// (`formDensity` tight), so the question above it stays on screen; at rest it keeps its three
// lines, so Buddy's feedback above it has the room. For a page at full height the essay opens its
// writing view (`WritingSheet`, issue #525).

import { forwardRef, type ReactNode } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { formDensity } from '../../lib/keyboard.js';
import { useVisibleHeight } from '../../lib/useVisibleHeight.js';
import { SPACE } from '../../lib/theme/space.js';
import { MicButton, MicStatus } from '../voice/MicButton.js';
import type { VoiceInput } from '../voice/useVoiceInput.js';
import { Chip } from './Chip.js';
import { FieldCount } from './FieldCount.js';
import { LbTextInput, type LbTextInputProps, type LbTextInputRef } from './LbTextInput.js';

/** A long text's bar: the lines it starts with, and how far it grows with and without keyboard. */
const TALL = { rows: 3, roomy: 10, tight: 4 } as const;

/** Grows only while she writes; dense: the keyboard is up. */
function tallRows(tall: 'writing' | 'resting', dense: boolean): number {
  if (tall === 'resting') return TALL.rows;
  return dense ? TALL.tight : TALL.roomy;
}

/** What stands in the bar around her text: the same with and without the field. */
type Controls = {
  /** What she says, written into the field (and its status line); none: no voice here. */
  voice?: VoiceInput;
  /** The mic's name for a screen reader ("Nachricht sprechen", "Antwort sagen"). */
  micLabel?: string;
  /** False: no mic in the pill (a Diktat: the recogniser would spell for her). */
  mic?: boolean;
  /** The main control while the mic is idle ("Senden", "Stopp", "Prüfen"): it takes `after`'s place. */
  action?: ReactNode;
  /** The main control while there is no action: the waveform into a conversation. */
  after?: ReactNode;
  /** Above the pill: what goes with the text (the pages she attached). */
  above?: ReactNode;
  disabled?: boolean;
  /** A long text (issue #258): a taller pill that, while she writes, grows further. */
  tall?: 'writing' | 'resting' | null;
};

type Props = Controls &
  Omit<LbTextInputProps, 'variant' | 'multiline' | 'rows' | 'chips' | 'end'> & {
    value: string;
    maxLength: number;
    /** The answer's unit ("cm²"): a chip among the tools, never a suffix inside her lines. */
    unit?: string | null;
    /** More among the tools, after the unit (how her typed math will be read). */
    chips?: ReactNode;
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
    tall = null,
  } = props;
  const seen = useVisibleHeight();
  const typing = formDensity(seen.window, seen.overlap) === 'tight';
  const { t } = useTranslation('practice');
  const idle = voice === undefined || voice.state === 'idle';
  const {
    value,
    maxLength,
    unit = null,
    chips = null,
    voice: _voice,
    micLabel: _micLabel,
    mic: _mic,
    action: _action,
    after: _after,
    above: _above,
    disabled: _disabled,
    tall: _tall,
    ...field
  } = props;
  return (
    <>
      {voice ? <MicStatus voice={voice} /> : null}
      {above}
      <FieldCount length={value.length} max={maxLength} />
      <LbTextInput
        ref={ref}
        {...field}
        variant="bar"
        value={value}
        maxLength={maxLength}
        multiline
        {...(tall ? { rows: TALL.rows, maxRows: tallRows(tall, typing) } : {})}
        chips={
          unit || chips ? (
            <>
              {unit ? <Chip>{t('answer.unit_chip', { unit })}</Chip> : null}
              {chips}
            </>
          ) : null
        }
        end={
          // Their own row with their own gap: the box's is 2 (the text carries its padding), too
          // tight between two round controls (owner 01.10., issue #187). Empty, the row still
          // keeps the text off the box's edge.
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'flex-end',
              gap: SPACE.sm,
              minWidth: SPACE.sm,
            }}
          >
            {mic && voice ? (
              <MicButton voice={voice} size="sm" label={micLabel} disabled={disabled} />
            ) : null}
            {action !== null && idle ? action : after}
          </View>
        }
      />
    </>
  );
});
