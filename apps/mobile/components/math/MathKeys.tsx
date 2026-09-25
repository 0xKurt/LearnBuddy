// A row of insert keys above the answer field for math questions: fraction
// bar, squared, cubed, root, π, times, minus, brackets, degrees and the
// decimal separator. Phone keyboards hide most of these; one tap here puts
// them at the cursor. The characters are ones the answer check reads
// (packages/shared-math typographicToAscii).
//
// The keys are soft and round (white on a soft shadow, the "Pastell Soft"
// look of the composer below them), at least 44 × 44 pt.

import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { currentLocale } from '../../lib/i18n/index.js';
import { insertAtCursor, type Insertion, type Selection } from '../../lib/math/insert.js';
import { LB } from '../../lib/theme/colors.js';
import { SHADOW } from '../../lib/theme/shadow.js';

export { insertAtCursor, type Insertion, type Selection };

type Key = { id: string; shown: string; insert: Insertion };

function mathKeys(): Key[] {
  const decimal = currentLocale() === 'en' ? '.' : ',';
  return [
    { id: 'fraction', shown: '/', insert: { text: '/' } },
    { id: 'squared', shown: 'x²', insert: { text: '²' } },
    { id: 'cubed', shown: 'x³', insert: { text: '³' } },
    // The cursor lands inside the brackets: "√(|)".
    { id: 'sqrt', shown: '√', insert: { text: '√()', caret: 2 } },
    { id: 'pi', shown: 'π', insert: { text: 'π' } },
    { id: 'times', shown: '·', insert: { text: '·' } },
    // Shown as a real minus sign, typed as the plain one every checker reads.
    { id: 'minus', shown: '−', insert: { text: '-' } },
    { id: 'open', shown: '(', insert: { text: '(' } },
    { id: 'close', shown: ')', insert: { text: ')' } },
    { id: 'degree', shown: '°', insert: { text: '°' } },
    { id: 'decimal', shown: decimal, insert: { text: decimal } },
  ];
}

type Props = {
  onInsert: (insertion: Insertion) => void;
  disabled?: boolean;
};

export function MathKeys({ onInsert, disabled = false }: Props) {
  const { t } = useTranslation('math');
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      // A tap on a key must not close the keyboard first.
      keyboardShouldPersistTaps="always"
      accessibilityRole="toolbar"
      accessibilityLabel={t('keys.row')}
      // Room around the keys, so their soft shadow is not cut off by the scroll view.
      contentContainerStyle={{ gap: 8, paddingVertical: 6, paddingHorizontal: 4 }}
    >
      {mathKeys().map((k) => (
        <MathKey
          key={k.id}
          disabled={disabled}
          accessibilityLabel={t(`keys.${k.id}`)}
          accessibilityHint={t('keys.hint')}
          onPress={() => onInsert(k.insert)}
        >
          {k.shown}
        </MathKey>
      ))}
    </ScrollView>
  );
}

const KEY = 44;

/**
 * One round key. The shadow sits on an outer View (a clipped Pressable would
 * cut it off); the Pressable holds no background, the inner View shows the press.
 */
function MathKey({
  children,
  accessibilityLabel,
  accessibilityHint,
  onPress,
  disabled,
}: {
  children: string;
  /** What a screen reader says ("hoch 2"), never just the glyph. */
  accessibilityLabel: string;
  accessibilityHint: string;
  onPress: () => void;
  disabled: boolean;
}) {
  return (
    <View
      style={[
        { borderRadius: KEY / 2, backgroundColor: LB.paper, opacity: disabled ? 0.6 : 1 },
        SHADOW.soft,
      ]}
    >
      <Pressable
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ disabled }}
        android_ripple={{ color: 'rgba(0,0,0,0.08)', borderless: false }}
        style={{ borderRadius: KEY / 2, overflow: 'hidden' }}
      >
        {({ pressed }) => (
          <View
            style={{
              minWidth: KEY,
              height: KEY,
              paddingHorizontal: 12,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: KEY / 2,
              backgroundColor: pressed ? LB.lavender : 'transparent',
            }}
          >
            <Text style={{ color: LB.primaryDk, fontSize: 19, lineHeight: 24, fontWeight: '600' }}>
              {children}
            </Text>
          </View>
        )}
      </Pressable>
    </View>
  );
}
