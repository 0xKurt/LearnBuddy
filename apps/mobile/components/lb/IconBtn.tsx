import { BusyIndicator } from './BusyIndicator.js';
// An icon in a circle, one touch target big: a way back, a close, the input bar's + and camera,
// and — filled in the accent — the input bar's one main control at its end (issue #522): the
// round send arrow, Buddy's "Stopp", the waveform into a conversation. One filled circle per bar.

import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { KEEPS_FOCUS } from '../../lib/keepsFocus.js';
import { circle } from '../../lib/theme/radius.js';
import { useMotionReduced } from '../../lib/theme/motion.js';
import { UI } from '../../lib/theme/components.js';
import { TOUCH } from '../../lib/theme/space.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { Icon, type IconName } from './Icon.js';

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

export function IconBtn({
  icon,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  plain = false,
  filled = false,
  disabled = false,
  keepsFocus = false,
  tone,
  busy = false,
  size = TOUCH,
}: (
  | { icon: CircleIcon; accessibilityLabel?: string }
  | { icon: Exclude<IconName, CircleIcon>; accessibilityLabel: string }
) & {
  onPress?: () => void;
  accessibilityHint?: string;
  /** No ring or fill: an icon button inside another surface (the input bar's +). */
  plain?: boolean;
  /** The accent fill: the input bar's main control (send, stop, the waveform). */
  filled?: boolean;
  /** Muted and inert; a screen reader hears it as unavailable. */
  disabled?: boolean;
  /** A tap that must not take the focus from the field it stands beside (`lib/keepsFocus.ts`). */
  keepsFocus?: boolean;
  tone?: 'plain' | 'quiet' | 'primary';
  busy?: boolean;
  /** Visible face; the centered target always remains at least TOUCH. */
  size?: number;
}) {
  const { palette } = useTheme();
  const { t } = useTranslation('common');
  const primary = tone ? tone === 'primary' : filled;
  const unfilled = tone ? tone === 'plain' : plain;
  const off = disabled || busy;
  const reduced = useMotionReduced();
  // Every other control in the system answers a finger; this one did not (audit 30.09.,
  // #133 position 6). The same dip Btn and StartRow use, so a press feels the same
  // wherever it lands.
  const inner = (pressed: boolean) => (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: circle(size),
        // A filled circle, not paper + hairline: the hairline sits at ~1.2:1 on the page
        // and the button read as a floating icon without a boundary (WCAG 1.4.11).
        backgroundColor: primary ? palette.primary : unfilled ? 'transparent' : palette.canvas,
        borderColor: palette.hairline,
        borderWidth: 0,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled
          ? UI.disabledOpacity
          : busy
            ? UI.busyOpacity
            : pressed
              ? UI.pressedOpacity
              : 1,
        transform: [{ scale: pressed && !reduced ? UI.pressScale : 1 }],
      }}
    >
      {busy ? (
        <BusyIndicator size="small" color={primary ? palette.onPrimary : palette.ink} />
      ) : (
        <Icon
          name={icon}
          size={primary ? UI.iconButton.actionGlyph : UI.iconButton.glyph}
          color={primary ? palette.onPrimary : palette.ink}
        />
      )}
    </View>
  );
  const target = {
    minWidth: Math.max(TOUCH, size),
    minHeight: Math.max(TOUCH, size),
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  };
  if (!onPress) return <View style={target}>{inner(false)}</View>;
  return (
    <Pressable
      style={target}
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? t(LABEL_KEY[icon as CircleIcon])}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: off, busy }}
      aria-busy={busy || undefined}
      {...(keepsFocus ? KEEPS_FOCUS : {})}
    >
      {({ pressed }) => inner(pressed)}
    </Pressable>
  );
}
