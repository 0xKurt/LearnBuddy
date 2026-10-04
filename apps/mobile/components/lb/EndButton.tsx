// "Beenden" wherever something she is doing can be ended from a header or a pinned strip: a round
// ✕, 44 pt, like the voice-mode switch beside it on a practice screen (issue #334.1). A line next
// to it stays on one line (components/lb/Screen.tsx, issue #287) — a worded pill took ~125 pt at
// 360 wide, and the practice topic came out as "Flächeninhalt Rec…" (issue #286), the roleplay's
// scene as "Rollenspiel · Im Café in Lo…" (#334.3). The words stay with a screen reader (`label`,
// e.g. "Übung beenden"), and the hint says where it leads. One component, so a question, a
// Kopfrechnen round and a roleplay end the same way (CLAUDE.md: one UI element, one component).

import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { Btn } from './Btn.js';
import { Icon } from './Icon.js';

type Props = {
  onPress: () => void;
  /** What a screen reader hears: what ends ("Übung beenden", "Beenden – wie lief's?"). */
  label: string;
  /** Where it leads: back to Buddy, a test handed in, the feedback. */
  hint: string;
  disabled?: boolean;
  /** Ending is on its way (the roleplay's feedback is being written). */
  busy?: boolean;
};

export function EndButton({ onPress, label, hint, disabled = false, busy = false }: Props) {
  const { palette } = useTheme();
  return (
    <Btn
      variant="outline"
      size="sm"
      pill
      // compact (12 each side) + the 20 pt icon = 44: a circle, like the voice-mode switch.
      compact
      label={<Icon name="close" size={20} color={disabled ? palette.ink2 : palette.ink} />}
      onPress={onPress}
      disabled={disabled}
      busy={busy}
      accessibilityHint={hint}
    >
      {label}
    </Btn>
  );
}
