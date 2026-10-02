// The solution of a closed question (the API only sends it once the question is
// closed) — shown only where it says something new: wrong, skipped, missed or
// "Lösung zeigen". After an answer she got right herself the chip and Buddy's
// reply already carry the result; a card repeating her own word taught nothing
// (issue #93). It stays on screen until the learner taps "Weiter".

import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { useAnnounce } from '../../lib/announce.js';
import { currentLocale } from '../../lib/i18n/index.js';
import { localDecimal } from '../../lib/numbers.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { Card } from '../lb/Card.js';
import { MathText } from '../math/MathText.js';
import { MONO } from '../../lib/theme/mono.js';
import { keepSpaces } from './CodeBlock.js';

type Props = {
  answer: string;
  /** Numbers are shown the way the learner writes them (0,75 in German). */
  numeric: boolean;
  /** A program or its output (issue #262): monospace, every space kept, never read as math. */
  code?: boolean;
};

export function SolutionCard({ answer, numeric, code = false }: Props) {
  const { palette } = useTheme();
  const { t } = useTranslation('practice');
  return (
    <Card tone="sky" padding={20} radius={24}>
      <Text style={[TYPE.body, { color: palette.ink2, fontWeight: '600' }]}>
        {t('solution.title')}
      </Text>
      <View style={{ marginTop: 4 }}>
        {code ? (
          <Text style={{ fontFamily: MONO, fontSize: 14, lineHeight: 20, color: palette.ink }}>
            {keepSpaces(answer)}
          </Text>
        ) : (
          <MathText
            text={numeric ? localDecimal(answer, currentLocale()) : answer}
            style={TYPE.title}
          />
        )}
      </View>
      <Text style={[TYPE.body, { color: palette.ink2, marginTop: 8 }]}>{t('solution.calm')}</Text>
    </Card>
  );
}

/** Homework help closes a task without a solution to show: she found it herself. */
export function SelfSolvedCard() {
  const { palette } = useTheme();
  const { t } = useTranslation('practice');
  // iOS has no live regions: the card says itself when it appears (lib/announce.ts).
  useAnnounce(t('self_solved.title'));
  return (
    <Card tone="mint" padding={20} radius={24}>
      <View accessibilityLiveRegion="polite">
        <Text style={TYPE.title}>{t('self_solved.title')}</Text>
        <Text style={[TYPE.body, { color: palette.ink2, marginTop: 4 }]}>
          {t('self_solved.body')}
        </Text>
      </View>
    </Card>
  );
}
