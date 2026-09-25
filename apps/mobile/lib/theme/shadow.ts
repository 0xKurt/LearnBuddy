// Soft, warm elevation (the design examples' floating cards and composer).
// One definition for iOS (shadow*), Android (elevation) and the web (react-native-web
// maps the shadow props to box-shadow).
import type { ViewStyle } from 'react-native';

export const SHADOW = {
  soft: {
    shadowColor: '#4b3a8f',
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  float: {
    shadowColor: '#4b3a8f',
    shadowOpacity: 0.14,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
} satisfies Record<string, ViewStyle>;
