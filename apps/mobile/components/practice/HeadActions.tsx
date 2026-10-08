// The right end of every practice header (issues #386, #434): the Vorlesen switch, then the way
// out. One component, so the practice screen, a Kopfrechnen round and a card pass carry the same
// switch in the same place (CLAUDE.md rule 19).

import type { ReactNode } from 'react';
import { View } from 'react-native';

import { SPACE } from '../../lib/theme/space.js';
import { ReadAloudSwitch } from '../lb/ReadAloudSwitch.js';

export function HeadActions({ children }: { children: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
      <ReadAloudSwitch />
      {children}
    </View>
  );
}
