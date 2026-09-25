// A group of settings under a plain heading — a question the learner would
// ask ("Darf Buddy dir aufs Handy schreiben?") or a plain name ("Für Eltern").

import type { ComponentProps, ReactNode } from 'react';
import { Text, View } from 'react-native';

import { LB } from '../../lib/theme/colors.js';
import { TYPE } from '../../lib/theme/type.js';
import { Icon } from '../lb/Icon.js';

type Props = {
  title: string;
  intro?: string;
  icon?: ComponentProps<typeof Icon>['name'];
  children: ReactNode;
};

export function Group({ title, intro, icon, children }: Props) {
  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        {icon ? (
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Icon name={icon} size={22} color={LB.ink} />
          </View>
        ) : null}
        <Text accessibilityRole="header" style={[TYPE.title, { flex: 1 }]}>
          {title}
        </Text>
      </View>
      {intro ? <Text style={[TYPE.body, { color: LB.ink2 }]}>{intro}</Text> : null}
      {children}
    </View>
  );
}
