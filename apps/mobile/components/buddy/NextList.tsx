// What comes next: tests and planned steps, in date order.

import type { UpcomingItem } from '@learnbuddy/shared-types/contracts';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { LB } from '../../lib/theme/colors.js';
import { TYPE } from '../../lib/theme/type.js';
import { Card } from '../lb/Card.js';
import { Chip } from '../lb/Chip.js';
import { Section } from '../lb/Section.js';
import { whenText } from './describe.js';

export function NextList({ items }: { items: UpcomingItem[] }) {
  const { t } = useTranslation('buddy');
  if (items.length === 0) return null;
  return (
    <Section title={t('next.title')}>
      <Card padding={6} radius={18}>
        {items.map((it, i) => (
          <View
            key={`${it.kind}-${it.id}`}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              paddingHorizontal: 10,
              paddingVertical: 10,
              borderTopWidth: i === 0 ? 0 : 1,
              borderTopColor: LB.hairline,
            }}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[TYPE.body, { fontSize: 15 }]}>{it.title}</Text>
              {it.date ? <Text style={TYPE.small}>{whenText(it.date, it.time)}</Text> : null}
            </View>
            {it.kind === 'exam' ? <Chip tone="primary">{t('next.exam')}</Chip> : null}
            {it.kind === 'step' && it.agreed ? (
              <Chip tone="success">{t('next.agreed')}</Chip>
            ) : null}
          </View>
        ))}
      </Card>
    </Section>
  );
}
