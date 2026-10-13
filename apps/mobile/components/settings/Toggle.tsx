// The switch at a row's end (ui_kits/app/Flows.jsx `Toggle`): a 52×32 track in the accent when
// on, a light knob. Its target is a full 44 pt; on and off are also said, never colour alone.

import { View } from 'react-native';

import { UI } from '../../lib/theme/components.js';
import { RADIUS } from '../../lib/theme/radius.js';
import { SETTINGS } from '../../lib/theme/settings.js';
import { SHADOW } from '../../lib/theme/shadow.js';
import { TOUCH } from '../../lib/theme/space.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { PressArea } from '../lb/PressArea.js';

type Props = {
  on: boolean;
  onChange: (on: boolean) => void;
  /** What it switches: the row's title. */
  label: string;
  disabled?: boolean;
};

export function Toggle({ on, onChange, label, disabled = false }: Props) {
  const { palette } = useTheme();
  const { width, height, pad, knob } = SETTINGS.toggle;
  return (
    <PressArea
      onPress={() => onChange(!on)}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: on, disabled }}
      aria-checked={on}
      style={{ minHeight: TOUCH, minWidth: TOUCH, justifyContent: 'center' }}
    >
      <View
        style={{
          width,
          height,
          padding: pad,
          borderRadius: RADIUS.round,
          backgroundColor: on ? palette.primary : palette.ink4,
          alignItems: on ? 'flex-end' : 'flex-start',
          opacity: disabled ? UI.disabledOpacity : 1,
        }}
      >
        <View
          style={{
            width: knob,
            height: knob,
            borderRadius: RADIUS.round,
            backgroundColor: palette.knob,
            ...SHADOW.soft,
          }}
        />
      </View>
    </PressArea>
  );
}
