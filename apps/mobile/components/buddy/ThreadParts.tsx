// What hangs on one of Buddy's lines in the thread (#599): the column his mini orb stands in, the
// receipt of what he did, the quiet way to take it back, and the answers she can tap.
//
//   · `BuddyLine` — components/buddy/Message.jsx:17–19: the orb beside the newest line, the same
//     column left empty beside an older one, so every line starts at the same edge;
//   · `Receipt` — ui_kits/app/Chat.jsx:20: the receipt chip (components/core/Chip.jsx
//     `tone="receipt"`: canvas, the control border, its sign, 600 14). It is text, never a button
//     (issue #520): the way back is its own line. The app's receipts are whole sentences, and one
//     turn says all it did in one of them (issue #204) — so unlike `lb/Chip`, which is one line by
//     construction, this one wraps: a pill while it fits a line, a rounded box when it does not;
//   · `TakeBack` — ui_kits/app/Gaps.jsx:83–85: undo sign and "Zurücknehmen", ink-2 600 14;
//   · `ReplyOptions` — ui_kits/app/Flows.jsx:196: her quick answers as chips under the line.

import type { ActionSummary, MessageView } from '@learnbuddy/shared-types/contracts';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { CHAT } from '../../lib/theme/chat.js';
import { chipSkin, UI } from '../../lib/theme/components.js';
import { RADIUS } from '../../lib/theme/radius.js';
import { SPACE, TOUCH } from '../../lib/theme/space.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { haptic } from '../../lib/haptics.js';
import { i18n } from '../../lib/i18n/index.js';
import { Chip } from '../lb/Chip.js';
import { Icon, type IconName } from '../lb/Icon.js';
import { PressArea } from '../lb/PressArea.js';
import { ThreadOrb } from './ThreadOrb.js';

/** Where what hangs under Buddy's line starts: under its text, past the orb's column. */
export const UNDER_LINE = { paddingLeft: CHAT.orb.indent } as const;

/** One of Buddy's lines: his orb's column, then what he says. */
export function BuddyLine({ orb, children }: { orb: boolean; children: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: CHAT.orb.gap }}>
      {orb ? <ThreadOrb /> : <View style={{ width: CHAT.orb.size }} />}
      <View style={{ flex: 1, minWidth: 0 }}>{children}</View>
    </View>
  );
}

/** What Buddy put into her calendar carries the calendar; everything else he did, the tick. */
const DATED: ReadonlySet<ActionSummary['tool']> = new Set([
  'plan_exam',
  'plan_step',
  'plan_talk',
  'schedule_check',
]);

export function receiptIcon(tools: readonly ActionSummary['tool'][], undone: boolean): IconName {
  if (undone) return 'close';
  return tools.length > 0 && tools.every((tool) => DATED.has(tool)) ? 'calendar' : 'check';
}

/** The factual receipt of a turn; choosing what to take back lives in the undo sheet. */
export function Receipt({ text, icon }: { text: string; icon: IconName }) {
  const { palette } = useTheme();
  const skin = chipSkin(palette, 'receipt', false, true);
  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={text}
      style={{
        alignSelf: 'flex-start',
        maxWidth: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        gap: UI.chip.gap,
        minHeight: UI.chip.height,
        paddingLeft: UI.chip.iconPad,
        paddingRight: UI.chip.pad,
        paddingVertical: CHAT.receiptPad,
        // More than half a one-line chip's height: one line is a pill, three are a soft box.
        borderRadius: RADIUS.lg,
        borderWidth: UI.border,
        borderColor: skin.border,
        backgroundColor: skin.bg,
      }}
    >
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Icon name={icon} size={UI.chip.icon} color={skin.color} />
      </View>
      <Text style={[TYPE.metaSemibold, { flexShrink: 1, color: skin.color }]}>{text}</Text>
    </View>
  );
}

/** "Zurücknehmen": opens the list of what this turn did. Quiet — it is a way back, not a CTA. */
export function TakeBack({
  label,
  disabled,
  onPress,
}: {
  label: string;
  disabled: boolean;
  onPress: () => void;
}) {
  const { palette } = useTheme();
  return (
    <PressArea
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      // The line is 20 tall and its target 44: what it reaches beyond is handed back as margin.
      style={{
        alignSelf: 'flex-start',
        minHeight: TOUCH,
        marginVertical: -CHAT.takeBack.reach,
        paddingLeft: CHAT.takeBack.inset,
        paddingRight: SPACE.sm,
        justifyContent: 'center',
      }}
    >
      {(pressed) => (
        <View
          collapsable={false}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: CHAT.takeBack.gap,
            opacity: disabled ? UI.disabledOpacity : pressed ? UI.pressed.link : 1,
          }}
        >
          <Icon name="undo" size={CHAT.takeBack.icon} color={palette.ink2} />
          <Text style={TYPE.metaSemibold}>{label}</Text>
        </View>
      )}
    </PressArea>
  );
}

/** Her quick answers to Buddy's newest line: chips that wrap, 8 apart. */
export function ReplyOptions({
  options,
  disabled,
  onPick,
  wrap,
}: {
  options: readonly string[];
  disabled: boolean;
  onPick: (option: string) => void;
  /** How each chip comes in (the thread's own entrance, staggered). */
  wrap: (chip: ReactNode, index: number, key: string) => ReactNode;
}) {
  return (
    <View style={[UNDER_LINE, { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm }]}>
      {options.map((option, i) =>
        wrap(
          <Chip disabled={disabled} onPress={() => onPick(option)}>
            {option}
          </Chip>,
          i,
          option,
        ),
      )}
    </View>
  );
}

/** Why a stored message was not answered; "not arrived" only when nothing is known. */
function failedLabel(code: string | null): string {
  const key = `buddy:thread.failed_reason.${code ?? 'internal'}`;
  return i18n.exists(key) ? i18n.t(key) : i18n.t('buddy:thread.failed');
}

/**
 * Under her message that was not answered: ONE line (components/buddy/Message.jsx:12, 700 13 in
 * the danger ink) — why, and after a dot the way to send it again with its sign. The line said
 * why on two lines beside a paper button before (#599 correction).
 */
export function FailedLine({
  message,
  busy,
  onResend,
}: {
  message: MessageView;
  busy: boolean;
  /** Left out (History), there is no way to send it again from here. */
  onResend?: (message: MessageView) => void;
}) {
  const { palette } = useTheme();
  const { t } = useTranslation('buddy');
  // It arrived: say why it was not answered (CLAUDE.md rule 5). Stopped by her is no failure:
  // said calmly, not in red.
  const ink = { color: message.failure_code === 'stopped' ? palette.ink2 : palette.danger };
  // Resending cannot help once today's allowance is used up.
  const resend = message.failure_code === 'budget' ? undefined : onResend;
  return (
    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'flex-end',
        alignItems: 'center',
        columnGap: CHAT.takeBack.gap,
      }}
    >
      <Text style={[TYPE.label, ink]}>
        {failedLabel(message.failure_code)}
        {resend ? ' ·' : ''}
      </Text>
      {resend ? (
        <PressArea
          accessibilityRole="button"
          accessibilityLabel={t('thread.resend')}
          accessibilityState={{ disabled: busy }}
          disabled={busy}
          onPress={() => {
            haptic.tap();
            resend(message);
          }}
          // The line is 18 tall and its target 44: what it reaches beyond is handed back.
          style={{
            minHeight: TOUCH,
            marginVertical: -CHAT.takeBack.reach,
            justifyContent: 'center',
          }}
        >
          {(pressed) => (
            <View
              collapsable={false}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: CHAT.takeBack.gap,
                opacity: busy ? UI.disabledOpacity : pressed ? UI.pressed.link : 1,
              }}
            >
              <Icon name="undo" size={CHAT.takeBack.icon} color={ink.color} />
              <Text style={[TYPE.label, ink]}>{t('thread.resend')}</Text>
            </View>
          )}
        </PressArea>
      ) : null}
    </View>
  );
}
