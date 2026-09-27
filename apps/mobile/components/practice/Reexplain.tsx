// "Anders erklären" (gaps.md #3): under an explanation and under a shown solution, three
// small chips — "Einfacher bitte", "Mit Beispiel", "Warum ist das so?". A tap asks Buddy for a
// new explanation that way (POST …/reexplain); her request and his new explanation then stand
// here like a short chat. The chips are shortcuts for what she could also type; examples,
// not a feature catalogue (docs/UX-PRINCIPLES.md). They sit in one row (a small side
// scroll on narrow phones) so the solution above keeps its room, arrive only after the
// moment of the answer has played, and step aside while Buddy writes.

import type { PracticeTurnView, ReexplainWay } from '@learnbuddy/shared-types/contracts';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';

import { Btn } from '../lb/Btn.js';
import { Appear } from '../lb/Motion.js';
import { ItemThread } from './ItemThread.js';

const WAYS: readonly ReexplainWay[] = ['simpler', 'example', 'why'];

type Props = {
  /** The exchanges so far about this explanation or solution (turns with `reexplain`). */
  turns: PracticeTurnView[];
  /** The way she just tapped, while Buddy writes. */
  pending: ReexplainWay | null;
  disabled: boolean;
  onAsk: (way: ReexplainWay) => void;
  /** Wait before the chips appear (ms): after a right answer, let its moment play first. */
  delay?: number;
};

export function Reexplain({ turns, pending, disabled, onAsk, delay = 350 }: Props) {
  const { t } = useTranslation('practice');
  return (
    <View style={{ gap: 12 }}>
      <ItemThread
        turns={turns}
        pending={pending ? t(`reexplain.${pending}`) : null}
        thinkingLabel={t('reexplain.thinking')}
      />
      {pending ? null : (
        <Appear delay={turns.length > 0 ? 200 : delay}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            accessibilityLabel={t('reexplain.label')}
            // Bleeds to the screen edges, so a chip that does not fit peeks in from the side.
            style={{ marginHorizontal: -16 }}
            contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}
          >
            {WAYS.map((way) => (
              <Btn
                key={way}
                size="sm"
                variant="soft"
                pill
                disabled={disabled}
                accessibilityHint={t('reexplain.hint')}
                onPress={() => onAsk(way)}
              >
                {t(`reexplain.${way}`)}
              </Btn>
            ))}
          </ScrollView>
        </Appear>
      )}
    </View>
  );
}
