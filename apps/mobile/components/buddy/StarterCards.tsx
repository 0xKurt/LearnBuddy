// First visit (nothing said yet): the suggestions as four soft, coloured
// cards — examples of what Buddy does, not a feature catalog
// (docs/UX-PRINCIPLES.md §6). Afterwards the same suggestions live as chips
// above the field.
import { Text, View } from 'react-native';

import { LB } from '../../lib/theme/colors.js';
import { SHADOW } from '../../lib/theme/shadow.js';
import { TYPE } from '../../lib/theme/type.js';
import { Card } from '../lb/Card.js';
import { Icon } from '../lb/Icon.js';
import type { Suggestion } from './Composer.js';

export function StarterCards({ items, disabled }: { items: Suggestion[]; disabled: boolean }) {
  const rows = [items.slice(0, 2), items.slice(2, 4)].filter((r) => r.length > 0);
  return (
    <View style={{ gap: 12 }}>
      {rows.map((row) => (
        <View key={row[0]?.key} style={{ flexDirection: 'row', gap: 12 }}>
          {row.map((s) => (
            <View key={s.key} style={{ flex: 1, flexBasis: 0 }}>
              <Card
                tone={s.tone}
                radius={24}
                padding={16}
                onPress={disabled ? undefined : s.onPress}
                accessibilityLabel={s.label}
                style={[{ minHeight: 128, justifyContent: 'space-between' }, SHADOW.soft]}
              >
                <View
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 22,
                    backgroundColor: 'rgba(255,255,255,0.75)',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon name={s.icon} size={22} color={LB.primaryDk} />
                </View>
                <Text style={[TYPE.body, { fontWeight: '600', marginTop: 14 }]}>{s.label}</Text>
              </Card>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}
