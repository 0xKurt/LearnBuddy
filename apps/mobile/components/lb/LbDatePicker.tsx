// LbDatePicker — the single date-entry control for the whole app. A tap target
// (NOT a TextInput, so iOS never offers password/contact autofill and there is
// no keyboard) that opens a wheel sheet. Always shows DD.MM.YYYY; always emits
// ISO YYYY-MM-DD. Doc 05 §forms + DESIGN-BRIEF §forms.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  daysInMonth,
  isoToDisplay,
  isValidIso,
  parseIso,
  toIso,
  todayParts,
} from '../../lib/date.js';
import { LB } from '../../lib/theme/colors.js';
import { Btn } from './Btn.js';
import { Icon } from './Icon.js';
import type { DateParts } from '../../lib/date.js';

type Props = {
  value: string | null;
  onChange: (iso: string | null) => void;
  placeholder?: string;
  minYear?: number;
  maxYear?: number;
  clearable?: boolean;
  disabled?: boolean;
  error?: boolean;
  errorMessage?: string;
  accessibilityLabel?: string;
};

const ROW_H = 44;
const VISIBLE = 5;
const VIEW_H = ROW_H * VISIBLE;
const PAD = (VIEW_H - ROW_H) / 2;

function clampDay(p: DateParts): DateParts {
  const max = daysInMonth(p.year, p.month);
  return p.day > max ? { ...p, day: max } : p;
}

export function LbDatePicker({
  value,
  onChange,
  placeholder,
  minYear,
  maxYear,
  clearable = false,
  disabled = false,
  error = false,
  errorMessage,
  accessibilityLabel,
}: Props) {
  const { t } = useTranslation('common');
  const [open, setOpen] = useState(false);

  const now = todayParts();
  const loYear = minYear ?? now.year - 100;
  const hiYear = maxYear ?? now.year + 5;
  const fallback: DateParts = { year: Math.min(now.year, hiYear), month: now.month, day: now.day };

  const [sel, setSel] = useState<DateParts>(isValidIso(value) ? parseIso(value) : fallback);

  useEffect(() => {
    if (open) setSel(isValidIso(value) ? parseIso(value) : fallback);
  }, [open]);

  const display = isoToDisplay(value);

  const years = useMemo(() => {
    const out: number[] = [];
    for (let y = hiYear; y >= loYear; y--) out.push(y);
    return out;
  }, [loYear, hiYear]);
  const months = useMemo(() => Array.from({ length: 12 }, (_, i) => i + 1), []);
  const days = useMemo(
    () => Array.from({ length: daysInMonth(sel.year, sel.month) }, (_, i) => i + 1),
    [sel.year, sel.month],
  );

  const setPart = (patch: Partial<DateParts>) => setSel((p) => clampDay({ ...p, ...patch }));

  const confirm = () => {
    onChange(toIso(clampDay(sel)));
    setOpen(false);
  };
  const clear = () => {
    onChange(null);
    setOpen(false);
  };

  return (
    <View>
      <Pressable
        onPress={() => !disabled && setOpen(true)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? placeholder ?? t('datepicker.title')}
        accessibilityValue={{ text: display ?? '' }}
        style={{ opacity: disabled ? 0.6 : 1 }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderWidth: 1,
            borderColor: error ? LB.danger : LB.hairline,
            borderRadius: 14,
            paddingHorizontal: 16,
            height: 52,
            backgroundColor: '#fff',
          }}
        >
          <Text style={{ fontSize: 15, color: display ? LB.ink : LB.ink3 }}>
            {display ?? placeholder ?? t('datepicker.title')}
          </Text>
          <Icon name="clock" size={18} color={LB.ink3} />
        </View>
      </Pressable>
      {errorMessage && (
        <Text style={{ color: LB.danger, fontSize: 12, marginTop: 4 }}>{errorMessage}</Text>
      )}

      <Modal
        visible={open}
        animationType="slide"
        presentationStyle="formSheet"
        onRequestClose={() => setOpen(false)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: LB.paper }}>
          <View style={{ padding: 22, gap: 18, flex: 1 }}>
            <Text style={{ fontSize: 22, fontWeight: '600', color: LB.ink, letterSpacing: -0.4 }}>
              {t('datepicker.title')}
            </Text>

            <View
              style={{
                flexDirection: 'row',
                gap: 10,
                backgroundColor: LB.bg,
                borderRadius: 16,
                paddingVertical: 8,
              }}
            >
              <WheelColumn
                caption={t('datepicker.day')}
                values={days}
                selected={sel.day}
                format={(n) => String(n).padStart(2, '0')}
                onSelect={(day) => setPart({ day })}
              />
              <WheelColumn
                caption={t('datepicker.month')}
                values={months}
                selected={sel.month}
                format={(n) => String(n).padStart(2, '0')}
                onSelect={(month) => setPart({ month })}
              />
              <WheelColumn
                caption={t('datepicker.year')}
                values={years}
                selected={sel.year}
                format={(n) => String(n)}
                onSelect={(year) => setPart({ year })}
              />
            </View>

            <Text style={{ fontSize: 13, color: LB.ink2, textAlign: 'center' }}>
              {isoToDisplay(toIso(clampDay(sel)))}
            </Text>

            <View style={{ flex: 1 }} />

            {clearable && value != null && (
              <Btn variant="outline" full onPress={clear}>
                {t('datepicker.clear')}
              </Btn>
            )}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Btn variant="outline" full onPress={() => setOpen(false)}>
                  {t('actions.cancel')}
                </Btn>
              </View>
              <View style={{ flex: 2 }}>
                <Btn full onPress={confirm}>
                  {t('actions.done')}
                </Btn>
              </View>
            </View>
          </View>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

function WheelColumn({
  caption,
  values,
  selected,
  format,
  onSelect,
}: {
  caption: string;
  values: number[];
  selected: number;
  format: (n: number) => string;
  onSelect: (n: number) => void;
}) {
  const ref = useRef<ScrollView>(null);
  const idx = Math.max(0, values.indexOf(selected));

  // Re-snap whenever the target row changes — not just on length change.
  // Without `idx` in deps, opening the picker after switching months left
  // the day wheel on a stale index (e.g. user picked Feb 29 → switched to
  // March → day stays visually on row 28).
  useEffect(() => {
    const id = setTimeout(() => ref.current?.scrollTo({ y: idx * ROW_H, animated: false }), 60);
    return () => clearTimeout(id);
  }, [idx, values.length]);

  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={{ fontSize: 11, color: LB.ink3, marginBottom: 4, letterSpacing: 0.4 }}>
        {caption}
      </Text>
      <View style={{ height: VIEW_H, alignSelf: 'stretch' }}>
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 6,
            right: 6,
            top: PAD,
            height: ROW_H,
            borderRadius: 12,
            backgroundColor: LB.lavender,
          }}
        />
        <ScrollView
          ref={ref}
          showsVerticalScrollIndicator={false}
          snapToInterval={ROW_H}
          decelerationRate="fast"
          contentContainerStyle={{ paddingVertical: PAD }}
          onMomentumScrollEnd={(e) => {
            const i = Math.round(e.nativeEvent.contentOffset.y / ROW_H);
            const v = values[Math.max(0, Math.min(values.length - 1, i))];
            if (v != null && v !== selected) onSelect(v);
          }}
        >
          {values.map((v) => {
            const active = v === selected;
            return (
              <Pressable
                key={v}
                onPress={() => {
                  onSelect(v);
                  ref.current?.scrollTo({ y: values.indexOf(v) * ROW_H, animated: true });
                }}
                style={{ height: ROW_H, justifyContent: 'center', alignItems: 'center' }}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text
                  style={{
                    fontSize: 17,
                    color: active ? LB.ink : LB.ink3,
                    fontWeight: active ? '700' : '400',
                  }}
                >
                  {format(v)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
}
