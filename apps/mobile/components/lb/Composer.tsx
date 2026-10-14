// The one Composer (owner rule 7, issue #599; design components/composer/Composer.jsx): the only
// place she types to Buddy — free text in the chat, every typed answer and every question about
// a task in practice, the Kopfrechnen round, the flashcards. One implementation, one box, in the
// same place on every screen (the screen's `BottomBar`).
//
// Anatomy, top to bottom:
//   · `chips`   — help directly above the box ("Tipp", "Lösung zeigen"), and above them what
//                 goes with the text and is not in the design: the mic's status line, the pages
//                 she attached (`attached`, which may yield to the keyboard, #601);
//   · the box   — paper, a hairline, radius 26, the float shadow; no focus state. Her text over
//                 the full width, then
//   · `keys`    — flat tiles inside the box, shown while the `mode` chip is on (or always, where
//                 a form has keys and no mode: the note line), then
//   · the tools — left: one `tool` (the chat's "+"; where main has them the camera for her
//                 working and the essay's writing view), the `mode` chip ("Formel", "Rechnen",
//                 "Chemie"), the unit, how her math is read, the count; right: the mic
//                 (speech-to-text into the field) and ONE primary slot.
//
// The primary slot never moves; only what it holds changes (`action`): send → check → next. While
// there is no action — and while the mic is busy — it holds the blue conversation-mode button
// (`onTalk`), never anywhere else. Every control is drawn at the 40 pt slot and keeps a 44 pt
// touch target (`lib/theme/composer.ts`).
//
// Drafts, speech, attachments and submissions are owned by the screens; this file only shows.

import { forwardRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';

import { KEEPS_FOCUS } from '../../lib/keepsFocus.js';
import { formDensity } from '../../lib/keyboard.js';
import { pressedStyle, UI } from '../../lib/theme/components.js';
import { COMPOSER } from '../../lib/theme/composer.js';
import { useMotionReduced } from '../../lib/theme/motion.js';
import { circle, RADIUS } from '../../lib/theme/radius.js';
import { SPACE, TOUCH } from '../../lib/theme/space.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { useVisibleHeight } from '../../lib/useVisibleHeight.js';
import { MicButton, MicStatus } from '../voice/MicButton.js';
import { TalkButton } from '../voice/TalkButton.js';
import type { VoiceInput } from '../voice/useVoiceInput.js';
import { MAX_FONT_SCALE } from './Btn.js';
import { CircleBtn } from './CircleBtn.js';
import { FieldCount } from './FieldCount.js';
import { Icon } from './Icon.js';
import { LbTextInput, type LbTextInputProps, type LbTextInputRef } from './LbTextInput.js';

/**
 * What the primary slot holds. `own` is for what the design does not draw and main has: Buddy's
 * "Stopp" in the chat, a flashcard's "Umdrehen".
 */
export type ComposerAction =
  | { kind: 'send'; onPress: () => void; disabled?: boolean }
  | {
      kind: 'check';
      /** Her answer is complete; false is the quiet pill that waits (the design's `checkOff`). */
      ready: boolean;
      onPress: () => void;
      /** The question is locked (sending, or answered). */
      disabled?: boolean;
      /** Said while it waits: what is still missing. */
      waitsHint?: string;
    }
  | { kind: 'next'; onPress: () => void; disabled?: boolean }
  | { kind: 'own'; node: ReactNode };

/** The one control left of the mode chip. */
type Tool = {
  icon: 'plus' | 'camera' | 'expand';
  label: string;
  /** None: shown, inert (the question is locked). */
  onPress?: () => void;
};

/** The chip that shows or hides the keys, named after what they write. */
type Mode = { label: string; on: boolean; onPress: () => void };

export type ComposerProps = Omit<
  LbTextInputProps,
  'variant' | 'multiline' | 'rows' | 'maxRows' | 'under' | 'label' | 'error' | 'hint'
> & {
  value: string;
  maxLength: number;
  chips?: ReactNode;
  tool?: Tool | null;
  mode?: Mode | null;
  keys?: ReactNode;
  /** The answer's unit ("cm²"): a note among the tools, never a suffix inside her lines. */
  unit?: string | null;
  /** How her typed math will be read, among the tools. */
  preview?: ReactNode;
  /** False: no count of what still fits (a field of a few digits has nothing to count down). */
  count?: boolean;
  /** What she says, written into the field (and its status line); none: no voice here. */
  voice?: VoiceInput;
  /** The mic's name for a screen reader ("Nachricht sprechen", "Antwort sagen"). */
  micLabel?: string;
  /** False: no mic (a Diktat: the recogniser would spell for her). */
  mic?: boolean;
  action?: ComposerAction | null;
  /** Conversation mode can start here: the blue button holds the slot while nothing else does. */
  onTalk?: (() => void) | null;
  /** What goes with the text, above the chips (the pages she attached, the note on her photo). */
  attached?: ReactNode;
  /**
   * What stands above the box gives way when the room is too short (the keyboard is up): it
   * scrolls inside itself, the box and its tools stay whole and pinned (rules 16 and 19). The bar
   * around it must yield too (`BottomBar`).
   */
  attachedYields?: boolean;
  disabled?: boolean;
  /** A long text (issue #258): a taller box that, while she writes, grows further. */
  tall?: 'writing' | 'resting' | null;
};

/** Grows only while she writes; dense: the keyboard is up. */
function tallRows(tall: 'writing' | 'resting', dense: boolean): number {
  if (tall === 'resting') return COMPOSER.rows.tall;
  return dense ? COMPOSER.rows.tight : COMPOSER.rows.roomy;
}

/** A 44 pt control laid out as the 40 pt slot it is drawn at. */
function Slot({ children }: { children: ReactNode }) {
  return <View style={{ margin: -COMPOSER.slotReach }}>{children}</View>;
}

export const Composer = forwardRef<LbTextInputRef, ComposerProps>(function Composer(
  {
    chips = null,
    tool = null,
    mode = null,
    keys = null,
    unit = null,
    preview = null,
    count = true,
    voice,
    micLabel = '',
    mic = true,
    action = null,
    onTalk = null,
    attached = null,
    attachedYields = false,
    disabled = false,
    tall = null,
    ...field
  },
  ref,
) {
  const seen = useVisibleHeight();
  const typing = formDensity(seen.window, seen.overlap) === 'tight';
  // While the mic listens or writes down, nothing is sent or checked: the slot is the
  // conversation's, or empty.
  const idle = voice === undefined || voice.state === 'idle';
  const accessories = (
    <>
      {voice ? <MicStatus voice={voice} /> : null}
      {attached}
    </>
  );
  return (
    <View style={{ gap: COMPOSER.chipsGap, flexShrink: attachedYields ? 1 : 0 }}>
      {attachedYields ? (
        <ScrollView
          testID="scroll-list"
          tabIndex={Platform.OS === 'web' ? 0 : undefined}
          keyboardShouldPersistTaps="handled"
          style={{ flexGrow: 0, flexShrink: 1 }}
          contentContainerStyle={{ gap: SPACE.sm }}
        >
          {accessories}
        </ScrollView>
      ) : (
        accessories
      )}
      {chips}
      <LbTextInput
        {...field}
        ref={ref}
        variant="bar"
        multiline
        editable={!disabled && field.editable !== false}
        {...(tall ? { rows: COMPOSER.rows.tall, maxRows: tallRows(tall, typing) } : {})}
        under={
          <>
            {mode === null || mode.on ? keys : null}
            <View
              style={{
                flexDirection: 'row',
                // Tools that wrap keep the mic and the primary slot on the last line.
                alignItems: 'flex-end',
                gap: COMPOSER.toolGap,
                minHeight: COMPOSER.slot,
              }}
            >
              {/* One line of tools (design Composer.jsx). The unit is a note in the count's
                  type, not a chip: as a chip beside the camera and "Rechnen" it took a second line
                  on 360 (#599). Wrapping stays the last resort before anything is cut. */}
              <View
                style={{
                  flex: 1,
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  columnGap: COMPOSER.toolGap,
                  rowGap: COMPOSER.gap,
                  minHeight: COMPOSER.slot,
                }}
              >
                {tool ? (
                  <Slot>
                    <CircleBtn
                      icon={tool.icon}
                      plain
                      size={COMPOSER.slot}
                      {...(tool.onPress ? { onPress: tool.onPress } : {})}
                      accessibilityLabel={tool.label}
                    />
                  </Slot>
                ) : null}
                {mode ? <ModeChip {...mode} /> : null}
                {unit ? <UnitNote unit={unit} /> : null}
                {preview}
                {count ? (
                  <View style={{ paddingLeft: COMPOSER.count.padStart }}>
                    <FieldCount length={field.value.length} max={field.maxLength} />
                  </View>
                ) : null}
              </View>
              {mic && voice ? (
                <Slot>
                  <MicButton
                    tone="quiet"
                    voice={voice}
                    size="sm"
                    label={micLabel}
                    disabled={disabled}
                  />
                </Slot>
              ) : null}
              <View
                testID="composer-primary"
                style={{
                  flexShrink: 0,
                  minWidth: COMPOSER.slot,
                  height: COMPOSER.slot,
                  // A round control's 44 pt target is centred on the 40 pt slot it is drawn at.
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Primary action={idle ? action : null} onTalk={onTalk} />
              </View>
            </View>
          </>
        }
      />
    </View>
  );
});

/** The slot's content: the action, or the blue conversation-mode button in its place. */
function Primary({
  action,
  onTalk,
}: {
  action: ComposerAction | null;
  onTalk: (() => void) | null;
}) {
  const { t } = useTranslation(['practice', 'buddy']);
  if (action === null) return onTalk ? <TalkButton onPress={onTalk} /> : null;
  if (action.kind === 'own') return <>{action.node}</>;
  if (action.kind === 'send')
    return (
      <CircleBtn
        icon="send"
        filled
        size={COMPOSER.slot}
        keepsFocus
        onPress={action.onPress}
        disabled={action.disabled === true}
        accessibilityLabel={t('buddy:composer.send')}
      />
    );
  if (action.kind === 'next')
    return (
      <ActionPill
        label={t('practice:next')}
        icon="arrow"
        onPress={action.onPress}
        off={action.disabled === true}
      />
    );
  return (
    <View testID="answer-action">
      <ActionPill
        label={t('practice:check')}
        icon="check"
        onPress={action.onPress}
        off={!action.ready || action.disabled === true}
        {...(action.ready || !action.waitsHint ? {} : { hint: action.waitsHint })}
      />
    </View>
  );
}

/**
 * "Prüfen" and "Weiter" (Composer.jsx:65–72): a 40 pt pill, the word and its sign. Off, it is
 * canvas with a hairline and quiet ink — still a pill in its place, never a grey bar. In the
 * field's box it keeps the focus, so a tap never closes the keyboard under her finger.
 */
export function ActionPill({
  label,
  icon,
  onPress,
  off = false,
  quiet = false,
  hint,
}: {
  label: string;
  icon: 'check' | 'arrow';
  onPress: () => void;
  /** It waits: quiet and inert. */
  off?: boolean;
  /** The quiet face on a pill that still works (while the conversation's mic listens). */
  quiet?: boolean;
  hint?: string;
}) {
  const { palette } = useTheme();
  const reduced = useMotionReduced();
  const calm = off || quiet;
  const ink = calm ? palette.ink2 : palette.onPrimary;
  return (
    <Pressable
      {...KEEPS_FOCUS}
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled: off }}
      style={{ minHeight: TOUCH, marginVertical: -COMPOSER.slotReach, justifyContent: 'center' }}
    >
      {({ pressed }) => (
        <View
          style={{
            height: COMPOSER.slot,
            flexDirection: 'row',
            alignItems: 'center',
            gap: COMPOSER.pill.gap,
            paddingLeft: COMPOSER.pill.padStart,
            paddingRight: COMPOSER.pill.padEnd,
            borderRadius: circle(COMPOSER.slot),
            borderWidth: UI.border,
            borderColor: calm ? palette.hairlineStrong : 'transparent',
            backgroundColor: calm ? palette.canvas : palette.primary,
            ...(off ? null : pressedStyle(pressed, reduced)),
          }}
        >
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={MAX_FONT_SCALE}
            style={[TYPE.composerPill, { color: ink }]}
          >
            {label}
          </Text>
          <Icon name={icon} size={COMPOSER.pill.icon} color={ink} />
        </View>
      )}
    </Pressable>
  );
}

/** The answer's unit, in the type of the design's count (`FieldCount`): it says, it is not tapped. */
function UnitNote({ unit }: { unit: string }) {
  const { t } = useTranslation('practice');
  const { palette } = useTheme();
  return (
    <Text
      maxFontSizeMultiplier={MAX_FONT_SCALE}
      numberOfLines={1}
      style={[TYPE.label, { color: palette.ink2, paddingLeft: COMPOSER.count.padStart }]}
    >
      {t('answer.unit_chip', { unit })}
    </Text>
  );
}

/** The mode chip (Composer.jsx:54–59): lit while its keys show; a tap shows or hides them. */
function ModeChip({ label, on, onPress }: Mode) {
  const { palette } = useTheme();
  const ink = on ? palette.primaryDk : palette.ink2;
  return (
    <Pressable
      {...KEEPS_FOCUS}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ expanded: on }}
      // On the web `accessibilityState.expanded` alone does not become `aria-expanded`.
      aria-expanded={on}
      style={{
        minHeight: TOUCH,
        marginVertical: -COMPOSER.mode.reach,
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <View
        style={{
          height: COMPOSER.mode.height,
          flexDirection: 'row',
          alignItems: 'center',
          gap: COMPOSER.mode.gap,
          paddingLeft: COMPOSER.mode.padStart,
          paddingRight: COMPOSER.mode.padEnd,
          borderRadius: RADIUS.round,
          backgroundColor: on ? palette.primaryLt : palette.canvas,
        }}
      >
        <Icon name="keyboard" size={COMPOSER.mode.icon} color={ink} />
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[TYPE.chip, { color: ink }]}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}
