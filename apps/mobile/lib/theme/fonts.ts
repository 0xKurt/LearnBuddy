// Load only the five shipped faces; the package index also includes unused italics.
import { Figtree_400Regular } from '@expo-google-fonts/figtree/400Regular';
import { Figtree_500Medium } from '@expo-google-fonts/figtree/500Medium';
import { Figtree_600SemiBold } from '@expo-google-fonts/figtree/600SemiBold';
import { Figtree_700Bold } from '@expo-google-fonts/figtree/700Bold';
import { Figtree_800ExtraBold } from '@expo-google-fonts/figtree/800ExtraBold';

import { FIGTREE } from './fontNames.js';

export const FONT_ASSETS = {
  [FIGTREE['400']!]: Figtree_400Regular,
  [FIGTREE['500']!]: Figtree_500Medium,
  [FIGTREE['600']!]: Figtree_600SemiBold,
  [FIGTREE['700']!]: Figtree_700Bold,
  [FIGTREE['800']!]: Figtree_800ExtraBold,
} as const;
