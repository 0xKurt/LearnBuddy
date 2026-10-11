import { ActivityIndicator, Platform, View, type ActivityIndicatorProps } from 'react-native';
import { UI } from '../../lib/theme/components.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { Icon } from './Icon.js';
import { useMotionReduced } from '../../lib/theme/motion.js';

/** Keep a visible busy mark while the live system preference pauses movement. */
export function BusyIndicator(
  props: Omit<ActivityIndicatorProps, 'animating' | 'hidesWhenStopped'>,
) {
  const reduced = useMotionReduced();
  const { palette } = useTheme();
  if (Platform.OS === 'android' && reduced) {
    const { size = 'small', color, style, ...viewProps } = props;
    const dimension = typeof size === 'number' ? size : UI.busyIndicator[size];
    return (
      <View
        {...viewProps}
        aria-hidden
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[{ alignItems: 'center', justifyContent: 'center' }, style]}
      >
        <Icon name="clock" size={dimension} color={color ?? palette.primaryDk} />
      </View>
    );
  }
  return (
    <ActivityIndicator
      {...props}
      aria-hidden
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      animating={!reduced}
      hidesWhenStopped={false}
    />
  );
}
