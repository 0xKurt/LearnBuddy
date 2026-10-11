import { ActivityIndicator, type ActivityIndicatorProps } from 'react-native';
import { useMotionReduced } from '../../lib/theme/motion.js';

/** Keep a visible busy mark while the live system preference pauses movement. */
export function BusyIndicator(
  props: Omit<ActivityIndicatorProps, 'animating' | 'hidesWhenStopped'>,
) {
  const reduced = useMotionReduced();
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
