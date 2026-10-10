// Props react-native-web reads that React Native's own types do not list (issue #517).
//
// The web Switch paints the knob of an ON switch from `activeThumbColor` alone; without it the
// knob is react-native-web's default teal, whatever `thumbColor` says. iOS and Android ignore
// the prop and take `thumbColor` in both states.

import type { ColorValue } from 'react-native';

declare module 'react-native' {
  interface SwitchProps {
    /** Web only: the knob's colour while the switch is on. */
    activeThumbColor?: ColorValue | undefined;
  }
}
