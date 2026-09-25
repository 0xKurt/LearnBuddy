// Grade 1–13 as a compact grid of buttons (tap the grade directly; a
// stepper would need a made-up starting grade). Each button is at least
// 48 × 44 pt; the selected one says so to screen readers.

import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Btn } from '../lb/Btn.js';

const GRADES = Array.from({ length: 13 }, (_, i) => i + 1);

type Props = {
  value: number | null;
  disabled: boolean;
  onChange: (grade: number) => void;
};

export function GradePicker({ value, disabled, onChange }: Props) {
  const { t } = useTranslation('settings');
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={t('profile.grade_question')}
      style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}
    >
      {GRADES.map((grade) => {
        const selected = grade === value;
        const label = t('profile.grade_value', { grade });
        return (
          <View key={grade} style={{ minWidth: 48 }}>
            <Btn
              full
              size="sm"
              variant={selected ? 'primary' : 'outline'}
              disabled={disabled}
              onPress={() => {
                if (!selected) onChange(grade);
              }}
              accessibilityLabel={selected ? t('selected', { label }) : label}
            >
              {String(grade)}
            </Btn>
          </View>
        );
      })}
    </View>
  );
}
