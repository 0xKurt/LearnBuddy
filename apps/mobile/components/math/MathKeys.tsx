// A row of insert keys above the answer field for math questions: fraction
// bar, squared, cubed, root, π, times, minus, brackets, degrees and the
// decimal separator. Phone keyboards hide most of these; one tap here puts
// them at the cursor. The characters are ones the answer check reads
// (packages/shared-math typographicToAscii).

import { useTranslation } from 'react-i18next';
import { ScrollView } from 'react-native';

import { currentLocale } from '../../lib/i18n/index.js';
import { insertAtCursor, type Insertion, type Selection } from '../../lib/math/insert.js';
import { KeyCap } from '../lb/KeyCap.js';

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
      contentContainerStyle={{ gap: 6, paddingVertical: 2 }}
    >
      {mathKeys().map((k) => (
        <KeyCap
          key={k.id}
          disabled={disabled}
          accessibilityLabel={t(`keys.${k.id}`)}
          accessibilityHint={t('keys.hint')}
          onPress={() => onInsert(k.insert)}
        >
          {k.shown}
        </KeyCap>
      ))}
    </ScrollView>
  );
}
