// An icon in a circle, one touch target big: a way back, a close, the input bar's + and camera,
// and — filled in the accent — the input bar's one main control at its end (issue #522): the
// round send arrow, Buddy's "Stopp", the waveform into a conversation. One filled circle per bar.

import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { KEEPS_FOCUS } from '../../lib/keepsFocus.js';
import { circle } from '../../lib/theme/radius.js';
import { TOUCH } from '../../lib/theme/space.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { Icon } from './Icon.js';

type CircleIcon =
  | 'back'
  | 'close'
  | 'more'
  | 'plus'
  | 'mic'
  | 'speak'
  | 'stop'
  | 'camera'
  | 'keyboard'
  | 'send'
  | 'voice'
  | 'expand';

const LABEL_KEY: Record<CircleIcon, string> = {
  back: 'a11y.back',
  close: 'a11y.close',
  more: 'a11y.more',
  plus: 'a11y.add',
  mic: 'a11y.mic',
  speak: 'a11y.speak',
  stop: 'a11y.stop',
  camera: 'a11y.camera',
  keyboard: 'a11y.keyboard',
  send: 'a11y.send',
  voice: 'a11y.voice',
  expand: 'a11y.expand',
};

export function CircleBtn({
  icon,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  plain = false,
  filled = false,
  disabled = false,
  keepsFocus = false,
}: {
  icon: CircleIcon;
  onPress?: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  /** No ring or fill: an icon button inside another surface (the input bar's +). */
  plain?: boolean;
  /** The accent fill: the input bar's main control (send, stop, the waveform). */
  filled?: boolean;
  /** Muted and inert; a screen reader hears it as unavailable. */
  disabled?: boolean;
  /** A tap that must not take the focus from the field it stands beside (`lib/keepsFocus.ts`). */
  keepsFocus?: boolean;
}) {
  const { palette } = useTheme();
  const { t } = useTranslation('common');
  // Every other control in the system answers a finger; this one did not (audit 30.09.,
  // #133 position 6). The same dip Btn and StartRow use, so a press feels the same
  // wherever it lands.
  const inner = (pressed: boolean) => (
    <View
      style={{
        width: TOUCH,
        height: TOUCH,
        borderRadius: circle(TOUCH),
        // A filled circle, not paper + hairline: the hairline sits at ~1.2:1 on the page
        // and the button read as a floating icon without a boundary (WCAG 1.4.11).
        backgroundColor: filled ? palette.primary : plain ? 'transparent' : palette.canvas,
        borderColor: palette.hairline,
        borderWidth: plain || filled ? 0 : 1,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.5 : pressed ? 0.78 : 1,
        transform: [{ scale: pressed ? 0.94 : 1 }],
      }}
    >
      <Icon
        name={icon}
        size={plain || filled ? 24 : 20}
        color={filled ? palette.paper : plain ? palette.ink2 : palette.ink}
      />
    </View>
  );
  if (!onPress) return inner(false);
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? t(LABEL_KEY[icon])}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      {...(keepsFocus ? KEEPS_FOCUS : {})}
    >
      {({ pressed }) => inner(pressed)}
    </Pressable>
  );
}
