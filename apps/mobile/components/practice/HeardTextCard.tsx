// The words of the Hörtext, once the question is closed (issue #210). This is the whole point of
// the form's order: she hears it, answers, and only then reads what was said — so the text arrives
// from the server at the same moment the solution does (`listen_transcript`), never before. A text
// she can now read is also a text she can listen to again while reading, which is what the
// "Anhören" pills above the card keep doing (`ListenButton`).

import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';

import { CARD_PAD, SPACE } from '../../lib/theme/space.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { Card } from '../lb/Card.js';

export function HeardTextCard({ text }: { text: string }) {
  const { palette } = useTheme();
  const { t } = useTranslation('practice');
  return (
    <Card tone="sky" padding={CARD_PAD.roomy} radius={24}>
      <Text style={[TYPE.body, { color: palette.ink2, fontWeight: '600' }]}>
        {t('listen.transcript_title')}
      </Text>
      <Text style={[TYPE.body, { marginTop: SPACE.xs }]}>{text}</Text>
    </Card>
  );
}
