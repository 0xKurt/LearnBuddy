// One pure paper choice inside a start sheet; navigation belongs to its caller.
import { Text, View } from 'react-native';

import { UI } from '../../lib/theme/components.js';
import type { SubjectTone } from '../../lib/theme/palettes.js';
import { SHADOW } from '../../lib/theme/shadow.js';
import { START } from '../../lib/theme/start.js';
import { TYPE } from '../../lib/theme/type.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { Icon, type IconName } from './Icon.js';
import { IconTile } from './IconTile.js';
import { PressArea } from './PressArea.js';

export function StartChoice({
  title,
  meta,
  icon,
  tone,
  disabled = false,
  onPress,
}: {
  title: string;
  meta?: string;
  icon: IconName;
  tone: SubjectTone;
  disabled?: boolean;
  onPress: () => void;
}) {
  const { palette } = useTheme();
  return (
    <PressArea
      accessibilityRole="button"
      accessibilityLabel={meta ? `${title}, ${meta}` : title}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{ minHeight: START.choice.height }}
    >
      {(pressed) => (
        <View
          style={{
            ...SHADOW.soft,
            ...START.choice.frame,
            backgroundColor: palette.paper,
            opacity: disabled ? UI.disabledOpacity : pressed ? UI.pressedOpacity : 1,
          }}
        >
          <IconTile icon={icon} tone={tone} />
          <View style={{ flex: 1, gap: START.textGap }}>
            <Text style={TYPE.startChoiceTitle}>{title}</Text>
            {meta ? <Text style={TYPE.startChoiceMeta}>{meta}</Text> : null}
          </View>
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            aria-hidden
          >
            <Icon name="chevron" size={START.choice.chevron} color={palette.ink3} />
          </View>
        </View>
      )}
    </PressArea>
  );
}
