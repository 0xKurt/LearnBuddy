// Pure choice tile. Listening remains a separate target and caller-owned action.
import { Pressable, Text, View } from 'react-native';
import { UI } from '../../lib/theme/components.js';
import { RADIUS } from '../../lib/theme/radius.js';
import { TYPE } from '../../lib/theme/type.js';
import { VOICE_PICKER } from '../../lib/theme/voicePicker.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { IconBtn } from './IconBtn.js';

export function VoiceOption({
  title,
  description,
  selected,
  disabled,
  hint,
  onPress,
  previewing,
  previewLabel,
  onPreview,
}: {
  title: string;
  description: string;
  selected: boolean;
  disabled: boolean;
  hint: string;
  onPress: () => void;
  previewing: boolean;
  previewLabel: string;
  onPreview: () => void;
}) {
  const { palette } = useTheme();
  return (
    <View style={{ gap: VOICE_PICKER.descriptionGap }}>
      <View
        style={{
          minHeight: VOICE_PICKER.optionHeight,
          padding: VOICE_PICKER.optionPadding,
          gap: VOICE_PICKER.optionGap,
          alignItems: 'center',
          borderRadius: RADIUS.md,
          borderWidth: selected ? UI.selectedBorder : UI.border,
          borderColor: selected ? palette.primary : palette.hairlineStrong,
          backgroundColor: selected ? palette.primaryLt : palette.paper,
        }}
      >
        <Pressable
          accessibilityRole="radio"
          accessibilityLabel={title}
          accessibilityHint={`${description}. ${hint}`}
          accessibilityState={{ checked: selected, disabled }}
          aria-checked={selected}
          disabled={disabled}
          onPress={onPress}
          style={{
            width: '100%',
            minWidth: VOICE_PICKER.target,
            minHeight: VOICE_PICKER.target,
            justifyContent: 'center',
          }}
        >
          {({ pressed }) => (
            <View
              style={{
                paddingHorizontal: VOICE_PICKER.labelPadding,
                opacity: disabled ? UI.disabledOpacity : pressed ? UI.pressedOpacity : 1,
              }}
            >
              <Text style={[TYPE.voiceChoice, { color: palette.ink, textAlign: 'center' }]}>
                {title}
              </Text>
            </View>
          )}
        </Pressable>
        <IconBtn
          plain
          icon={previewing ? 'stop' : 'speak'}
          accessibilityLabel={previewLabel}
          onPress={onPreview}
        />
      </View>
      <Text style={TYPE.meta}>{description}</Text>
    </View>
  );
}
