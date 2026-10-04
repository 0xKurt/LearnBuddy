// A birth date as three fields — day, month, year — in the profile form and in the parents'
// correction of it (issue #365: one implementation, it was written out twice). Digits only, and a
// full day or month moves on to the next field. Whether the date is real is `birthDateOf`
// (lib/birthDate.ts); what the screen says about it is the screen's.

import { type RefObject, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { SPACE } from '../../lib/theme/space.js';
import { LbTextInput, type LbTextInputRef } from '../lb/LbTextInput.js';

export type DateParts = { day: string; month: string; year: string };

const onlyDigits = (value: string) => value.replace(/\D+/g, '');

export function BirthDateFields({
  value,
  onChange,
  editable = true,
}: {
  value: DateParts;
  onChange: (next: DateParts) => void;
  editable?: boolean;
}) {
  const { t } = useTranslation('auth');
  const monthRef = useRef<LbTextInputRef>(null);
  const yearRef = useRef<LbTextInputRef>(null);
  const field = (
    part: keyof DateParts,
    max: number,
    next: RefObject<LbTextInputRef | null> | null,
    ref: RefObject<LbTextInputRef | null> | null,
  ) => (
    <LbTextInput
      ref={ref}
      label={t(`profile.${part}_label`)}
      value={value[part]}
      onChangeText={(v) => {
        const digits = onlyDigits(v);
        onChange({ ...value, [part]: digits });
        if (next && digits.length === max) next.current?.focus();
      }}
      placeholder={t(`profile.${part}`)}
      keyboardType="number-pad"
      maxLength={max}
      editable={editable}
    />
  );
  return (
    <View style={{ flexDirection: 'row', gap: SPACE.sm }}>
      <View style={{ flex: 1 }}>{field('day', 2, monthRef, null)}</View>
      <View style={{ flex: 1 }}>{field('month', 2, yearRef, monthRef)}</View>
      {/* Four digits want a little more room than two. */}
      <View style={{ flex: 1.6 }}>{field('year', 4, null, yearRef)}</View>
    </View>
  );
}
