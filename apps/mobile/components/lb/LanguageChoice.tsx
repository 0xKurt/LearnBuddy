// Pure language selector: the caller owns locale persistence and translated control labels.
import { useState } from 'react';
import { View } from 'react-native';

import { SPACE } from '../../lib/theme/space.js';
import { Btn } from './Btn.js';
import { Sheet } from './Sheet.js';

type Props<T extends string> = {
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (value: T) => void;
  label: string;
  closeLabel: string;
};

export function LanguageChoice<T extends string>({
  value,
  options,
  onChange,
  label,
  closeLabel,
}: Props<T>) {
  const [open, setOpen] = useState(false);
  const chosen = options.find((option) => option.value === value);
  return (
    <>
      <View style={{ alignSelf: 'flex-end' }}>
        <Btn
          variant="quiet"
          size="sm"
          pill
          icon="down"
          expanded={open}
          accessibilityLabel={`${label}: ${chosen?.label ?? value}`}
          onPress={() => setOpen(true)}
        >
          {chosen?.label ?? value}
        </Btn>
      </View>
      <Sheet visible={open} title={label} closeLabel={closeLabel} onClose={() => setOpen(false)}>
        <View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ gap: SPACE.sm }}>
          {options.map((option) => (
            <Btn
              key={option.value}
              variant={option.value === value ? 'picked' : 'quiet'}
              icon={option.value === value ? 'check' : undefined}
              size="sm"
              full
              selected={option.value === value}
              onPress={() => {
                setOpen(false);
                onChange(option.value);
              }}
            >
              {option.label}
            </Btn>
          ))}
        </View>
      </Sheet>
    </>
  );
}
