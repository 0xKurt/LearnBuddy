// What Buddy prepared or changed, with its real status and undo.

import type { ActionView } from '@learnbuddy/shared-types/contracts';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { LB } from '../../lib/theme/colors.js';
import { TYPE } from '../../lib/theme/type.js';
import { Btn } from '../lb/Btn.js';
import { Card } from '../lb/Card.js';
import { Icon } from '../lb/Icon.js';
import { Section } from '../lb/Section.js';
import { describeAction } from './describe.js';

type Props = { actions: ActionView[]; busy: boolean; onUndo: (actionId: string) => void };

export function DoneList({ actions, busy, onUndo }: Props) {
  const { t } = useTranslation('buddy');
  if (actions.length === 0) return null;
  return (
    <Section title={t('done.title')}>
      <Card padding={6} radius={18}>
        {actions.slice(0, 6).map((a, i) => {
          const text = describeAction(a.summary);
          const undone = a.status === 'undone';
          return (
            <View
              key={a.id}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                paddingHorizontal: 10,
                paddingVertical: 8,
                borderTopWidth: i === 0 ? 0 : 1,
                borderTopColor: LB.hairline,
              }}
            >
              <View accessibilityElementsHidden importantForAccessibility="no">
                <Icon
                  name={undone ? 'close' : 'check'}
                  size={18}
                  color={undone ? LB.ink3 : LB.success}
                />
              </View>
              <Text
                style={[
                  TYPE.small,
                  {
                    flex: 1,
                    color: undone ? LB.ink3 : LB.ink,
                    textDecorationLine: undone ? 'line-through' : 'none',
                  },
                ]}
              >
                {undone ? `${text} · ${t('done.undone')}` : text}
              </Text>
              {a.undoable ? (
                <Btn
                  size="sm"
                  variant="ghost"
                  onPress={() => onUndo(a.id)}
                  disabled={busy}
                  accessibilityLabel={t('done.undo_label', { what: text })}
                >
                  {t('done.undo')}
                </Btn>
              ) : null}
            </View>
          );
        })}
      </Card>
    </Section>
  );
}
