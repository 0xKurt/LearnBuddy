// Why the pinned CTA still waits — one short line right above it, in the shape capture's
// send bar established ("Mach zuerst ein Foto."): small, centred, calm (issue #97,
// docs/UX-PRINCIPLES.md §32). Screens render it once the learner taps the waiting button
// (Btn's onDisabledPress) and pair it with useAnnounce, like an inline failure; showing
// it from the start would push the tight sign-up layouts past a 360×740 screen
// (issue #55, tests/web/fit.ts).
import { Text } from 'react-native';

import { TYPE } from '../../lib/theme/type.js';

export function WaitHint({ children }: { children: string | null }) {
  if (!children) return null;
  return (
    <Text accessibilityLiveRegion="polite" style={[TYPE.small, { textAlign: 'center' }]}>
      {children}
    </Text>
  );
}
