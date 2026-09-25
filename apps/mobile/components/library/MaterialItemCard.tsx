// One question of a material: its text with math set properly, its figure and
// choices, how it went the last time (in words, never only a colour) and a
// quiet way to delete it. The solution is never part of this view
// (docs/architecture.md §Material).

import type { ItemResult, MaterialItemView } from '@learnbuddy/shared-types/contracts';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { LB } from '../../lib/theme/colors.js';
import { TYPE } from '../../lib/theme/type.js';
import { Btn } from '../lb/Btn.js';
import { Card } from '../lb/Card.js';
import { Chip } from '../lb/Chip.js';
import { FigureView } from '../math/FigureView.js';
import { MathText } from '../math/MathText.js';

const RESULT_TONE: Record<ItemResult, 'success' | 'primary' | 'gray'> = {
  first_try: 'success',
  with_help: 'primary',
  not_known: 'gray',
  never_asked: 'gray',
};

type Props = {
  item: MaterialItemView;
  /** 1-based, as listed. */
  number: number;
  disabled: boolean;
  onDelete: () => void;
};

export function MaterialItemCard({ item, number, disabled, onDelete }: Props) {
  const { t } = useTranslation('library');
  const choices = item.kind === 'multiple_choice' && item.choices ? item.choices : null;
  return (
    <Card padding={18}>
      <View style={{ gap: 14 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <Text style={TYPE.label}>{t('items.question_label', { number })}</Text>
          {item.topic ? <Chip>{item.topic}</Chip> : null}
          <Chip tone={RESULT_TONE[item.result]}>{t(`items.result.${item.result}`)}</Chip>
        </View>
        <MathText text={item.prompt} style={TYPE.body} />
        {item.figure ? <FigureView figure={item.figure} /> : null}
        {choices ? (
          <View style={{ gap: 6 }}>
            <Text style={TYPE.label}>{t('items.choices')}</Text>
            {choices.map((choice, index) => (
              <View key={index} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                <View
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 12,
                    backgroundColor: LB.lavender,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={[TYPE.label, { color: LB.primaryDk }]}>
                    {String.fromCharCode(65 + index)}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <MathText text={choice} style={TYPE.small} />
                </View>
              </View>
            ))}
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
          <Btn
            size="sm"
            variant="ghost"
            pill
            disabled={disabled}
            onPress={onDelete}
            accessibilityLabel={t('items.delete_label', { number })}
          >
            {t('items.delete')}
          </Btn>
        </View>
      </View>
    </Card>
  );
}
